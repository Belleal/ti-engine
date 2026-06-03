/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const validators = require( "../application/config-validators" );
const { registerCompetenceConfig } = require( "../application/config-registration" );
const configurationLoader = require( "#configuration-loader" );

const ctx = ( configs ) => ( { getConfig: ( key ) => Promise.resolve( Object.prototype.hasOwnProperty.call( configs, key ) ? configs[ key ] : null ) } );
const scopeComplete = () => ( { N: t(), J: t(), R: t(), S: t(), X: t(), T: t() } );
const t = () => ( { en: "x", bg: "х" } );

describe( "config-validators (competence semantic validators)", () => {

    it( "competenciesArchetypeResolves flags missing/undefined archetypes", async () => {
        const value = { competencies: { "E1-1": { relevancyArchetype: "A" }, "E1-2": { relevancyArchetype: "Z" }, "E1-3": {} } };
        const issues = await validators.competenciesArchetypeResolves( value, ctx( { "relevancy-archetypes": { A: { weights: {} } } } ) );
        assert.equal( issues.length, 2 );
        assert.ok( issues.some( ( i ) => i.path.includes( "E1-2" ) ) );
        assert.ok( issues.some( ( i ) => i.path.includes( "E1-3" ) ) );
    } );

    it( "activeSetsReferenceIntegrity flags unknown codes and invalid specializations", async () => {
        const value = { SE: { baseline: { "2026-H2": [ "E1-1", "E1-99" ] }, BACKEND: { "2026-H2": [] }, NOPE: { "2026-H2": [] } } };
        const issues = await validators.activeSetsReferenceIntegrity( value, ctx( { competencies: { competencies: { "E1-1": { subcategory: "E1" } } } } ) );
        assert.ok( issues.some( ( i ) => i.message.includes( "E1-99" ) ), "unknown code flagged" );
        assert.ok( issues.some( ( i ) => i.message.includes( "NOPE" ) ), "invalid specialization flagged" );
    } );

    it( "activeSetsFloorCoverage flags a baseline that misses subcategories", async () => {
        const value = { SE: { baseline: { "2026-H2": [ "E1-1" ] } } };
        const issues = await validators.activeSetsFloorCoverage( value, ctx( { competencies: { competencies: { "E1-1": { subcategory: "E1" } } } } ) );
        assert.equal( issues.length, 8, "8 of the 9 subcategories are missing" );
    } );

    it( "activeSetsCap flags a baseline over the cap", () => {
        const cap = configurationLoader.getSetting( "performanceAppraisals.activeCompetencySetCap", 30 );
        const codes = Array.from( { length: cap + 1 }, ( _, i ) => `E2-${ i + 1 }` );
        const issues = validators.activeSetsCap( { SE: { baseline: { "2026-H2": codes } } } );
        assert.ok( issues.some( ( i ) => i.code === "cap" ) );
    } );

    it( "labelsContentComplete passes complete content and flags empties", async () => {
        const dictionaryCtx = ctx( { competencies: { competencies: { "E1-1": {} } } } );
        const complete = { competency: { name: { "E1-1": t() }, description: { "E1-1": t() }, scope: { "E1-1": scopeComplete() } } };
        assert.deepEqual( await validators.labelsContentComplete( complete, dictionaryCtx ), [] );

        const missingBg = { competency: { name: { "E1-1": { en: "x", bg: "" } }, description: { "E1-1": t() }, scope: { "E1-1": scopeComplete() } } };
        const issues = await validators.labelsContentComplete( missingBg, dictionaryCtx );
        assert.ok( issues.some( ( i ) => i.path === ".competency.name.E1-1" ) );
    } );

    it( "archetypesReferentialIntegrity flags an assigned archetype removed from the curves", async () => {
        const value = { A: { weights: {} } }; // B is gone
        const issues = await validators.archetypesReferentialIntegrity( value, ctx( { competencies: { competencies: { "E1-1": { relevancyArchetype: "A" }, "E1-2": { relevancyArchetype: "B" } } } } ) );
        assert.equal( issues.length, 1 );
        assert.ok( issues[ 0 ].message.includes( "B" ) && issues[ 0 ].message.includes( "E1-2" ) );
    } );

    it( "roleFamiliesReferentialIntegrity flags active-set and employee references to removed families/specs", async () => {
        const original = validators.fetchEmployeesForValidation;
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ { career: { roleFamily: "SE", specialization: "EMBEDDED" } } ] );
        try {
            const value = { SE: { specializations: { BACKEND: {} } } }; // FRONTEND/EMBEDDED gone; QE gone
            const issues = await validators.roleFamiliesReferentialIntegrity( value, ctx( { "active-competency-sets": { SE: { baseline: {}, FRONTEND: { "2026-H2": [] } }, QE: { baseline: {} } } } ) );
            assert.ok( issues.some( ( i ) => i.path.includes( "FRONTEND" ) ), "active-set specialization reference flagged" );
            assert.ok( issues.some( ( i ) => i.path === ".QE" ), "active-set family reference flagged" );
            assert.ok( issues.some( ( i ) => i.path.includes( "EMBEDDED" ) ), "employee specialization reference flagged" );
        } finally {
            validators.fetchEmployeesForValidation = original;
        }
    } );

} );

describe( "config-registration (competence)", () => {

    it( "registers the expected documents with validators, defaults, and editable flags", () => {
        const registered = {};
        const editors = {};
        const stubApp = {
            registerConfigDocument( key, definition ) { registered[ key ] = definition; return this; },
            registerConfigEditor( key, definition ) { editors[ key ] = definition; return this; }
        };
        registerCompetenceConfig( stubApp );

        assert.deepEqual(
            Object.keys( registered ).sort(),
            [ "active-competency-sets", "competence-labels", "competencies", "relevancy-archetypes", "role-families", "stage-levels" ]
        );
        assert.deepEqual( Object.keys( editors ).sort(), [ "archetype-assignment", "competency-text", "relevancy-archetype", "role-families" ] );
        assert.deepEqual( editors[ "competency-text" ].documents, [ "competencies", "competence-labels" ] );
        assert.ok( registered[ "relevancy-archetypes" ].validators.length >= 1, "relevancy-archetypes carries the referential-integrity validator" );
        assert.ok( registered[ "role-families" ].validators.length >= 1, "role-families carries the referential-integrity validator" );
        assert.equal( registered.competencies.metadata.editable, true );
        assert.equal( registered[ "role-families" ].metadata.editable, true );
        assert.ok( registered[ "active-competency-sets" ].validators.length >= 3 );
        assert.ok( registered.competencies.defaultValue && registered.competencies.defaultValue.competencies );
        assert.ok( registered[ "relevancy-archetypes" ].defaultValue && registered[ "relevancy-archetypes" ].defaultValue.A );
    } );

} );
