/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// NOTE: this suite drives configuration-loader.initialize(), which reassigns the module's exported config objects.
// node --test isolates each file in its own process, so it must stay in a file of its own.

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const configurationLoader = require( "#configuration-loader" );
const configDrift = require( "@ti-engine/web-framework/config-drift" );

const clone = ( value ) => JSON.parse( JSON.stringify( value ) );

describe( "configuration-loader — file defaults survive store initialization", () => {

    it( "exposes the seven store-backed file defaults", () => {
        assert.deepEqual( Object.keys( configurationLoader.fileDefaults ).sort(), [
            "active-competency-sets", "competencies", "relevancy-archetypes", "research-consent",
            "role-families", "role-family-competencies", "stage-levels"
        ] );
    } );

    it( "keeps fileDefaults pointing at the FILE value after initialize() overwrites the exports", async () => {
        const fileCompetencyCount = Object.keys( configurationLoader.fileDefaults.competencies.competencies ).length;
        assert.ok( fileCompetencyCount > 100, "sanity: the file dictionary is populated" );

        // A store holding a deliberately truncated dictionary, standing in for a deployment seeded before a release.
        const stored = { categories: {}, competencies: { "E1-1": { relevancyArchetype: "A" } } };
        const stubService = {
            seedDefault: () => Promise.resolve( { value: stored, version: 1 } ),
            getCurrent: ( configKey ) => Promise.resolve( { value: ( configKey === "competencies" ) ? stored : {}, version: 1 } ),
            onConfigChanged: () => () => {},
            listDrift: () => Promise.resolve( [] )
        };
        await configurationLoader.initialize( stubService );

        // The export is now the store value — that is the documented behaviour.
        assert.equal( Object.keys( configurationLoader.configCompetencies.competencies ).length, 1 );
        // But the file default must be untouched, or drift detection would compare the store against itself.
        assert.equal( Object.keys( configurationLoader.fileDefaults.competencies.competencies ).length, fileCompetencyCount );
    } );

} );

describe( "config drift — the CA-98 QE case end to end", () => {

    it( "detects the QE pool addition and resolves it once the default is applied", () => {
        const fileDefault = configurationLoader.fileDefaults[ "role-family-competencies" ];
        assert.ok( fileDefault.QE.length > 50, "sanity: QE carries its own competencies in the file" );

        // Reconstruct a pre-CA-98 store: QE holding only the shared canonical codes it had before the release.
        const storedValue = clone( fileDefault );
        storedValue.QE = storedValue.XD.slice();

        const drift = configDrift.diffDocument( fileDefault, storedValue );
        assert.equal( drift.status, "drifted" );
        const entry = drift.entries.find( ( e ) => e.path === ".QE" );
        assert.ok( entry.addedMembers > 20, "the QE family-specific competencies are reported as added members" );

        // Applying the file default is what closes the gap — the post-apply value is the file default itself.
        assert.equal( configDrift.diffDocument( fileDefault, fileDefault ).status, "in-sync" );
    } );

} );
