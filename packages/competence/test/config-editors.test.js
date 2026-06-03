/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { SCOPE_LEVELS, composeCompetencyText, decomposeCompetencyText, competencyTextEditor, registerCompetenceEditors } = require( "../application/config-editors" );

// A small fixture: categories in canonical order E then C; competencies deliberately out of order; one competency
// (E1-1) has full scope labels, the others omit scope to exercise empty-pair / preservation behaviour.
const fixture = () => ( {
    competencies: {
        categories: {
            E: { subcategories: { E1: {}, E2: {} } },
            C: { subcategories: { C1: {} } }
        },
        competencies: {
            "E1-2": { category: "E", subcategory: "E1" },
            "E1-1": { category: "E", subcategory: "E1" },
            "C1-1": { category: "C", subcategory: "C1" },
            "E2-1": { category: "E", subcategory: "E2" }
        }
    },
    "competence-labels": {
        category: {
            name: { E: { en: "Expertise", bg: "Експертиза" }, C: { en: "Commitment", bg: "Ангажираност" } },
            sub: { name: { E1: { en: "Theory", bg: "Теория" } } }
        },
        competency: {
            name: {
                "E1-1": { en: "Alpha", bg: "Алфа" },
                "E1-2": { en: "Beta", bg: "Бета" },
                "C1-1": { en: "Gamma", bg: "Гама" },
                "E2-1": { en: "Delta", bg: "Делта" }
            },
            description: {
                "E1-1": { en: "da", bg: "да" },
                "E1-2": { en: "db", bg: "дб" },
                "C1-1": { en: "dc", bg: "дц" },
                "E2-1": { en: "dd", bg: "дд" }
            },
            scope: {
                "E1-1": { N: { en: "n", bg: "н" }, J: { en: "j", bg: "й" }, R: { en: "r", bg: "р" }, S: { en: "s", bg: "с" }, X: { en: "x", bg: "х" }, T: { en: "t", bg: "т" } }
            }
        },
        // A non-competency label that must survive a competency-text save untouched.
        framework: { keep: { en: "keep", bg: "пази" } }
    }
} );

describe( "config-editors — composeCompetencyText", () => {

    it( "orders rows category → subcategory → numeric index (canonical, not alphabetical)", () => {
        const rows = composeCompetencyText( fixture() );
        assert.deepEqual( rows.map( ( r ) => r.code ), [ "E1-1", "E1-2", "E2-1", "C1-1" ] );
    } );

    it( "projects bilingual name, description, and all six scope anchors with grouping context", () => {
        const rows = composeCompetencyText( fixture() );
        const e11 = rows.find( ( r ) => r.code === "E1-1" );
        assert.deepEqual( e11.name, { en: "Alpha", bg: "Алфа" } );
        assert.deepEqual( e11.description, { en: "da", bg: "да" } );
        assert.deepEqual( Object.keys( e11.scope ), SCOPE_LEVELS );
        assert.deepEqual( e11.scope.T, { en: "t", bg: "т" } );
        assert.equal( e11.category, "E" );
        assert.equal( e11.subcategory, "E1" );
        assert.deepEqual( e11.categoryName, { en: "Expertise", bg: "Експертиза" } );
        assert.deepEqual( e11.subcategoryName, { en: "Theory", bg: "Теория" } );
    } );

    it( "fills missing label leaves with empty en/bg pairs (no throw)", () => {
        const rows = composeCompetencyText( fixture() );
        const e12 = rows.find( ( r ) => r.code === "E1-2" );
        assert.deepEqual( e12.scope.N, { en: "", bg: "" } );
        const e21 = rows.find( ( r ) => r.code === "E2-1" );
        assert.deepEqual( e21.subcategoryName, { en: "", bg: "" }, "E2 has no subcategory label" );
    } );

    it( "is null-safe on empty documents", () => {
        assert.deepEqual( composeCompetencyText( {} ), [] );
        assert.deepEqual( composeCompetencyText( null ), [] );
    } );

} );

describe( "config-editors — decomposeCompetencyText", () => {

    it( "writes only the labels document", () => {
        const result = decomposeCompetencyText( [ { code: "E1-1", name: { en: "X", bg: "Х" } } ], fixture() );
        assert.deepEqual( Object.keys( result ), [ "competence-labels" ] );
    } );

    it( "overlays edited texts and preserves untouched competencies and non-competency labels", () => {
        const docs = fixture();
        const result = decomposeCompetencyText( [ { code: "E1-1", name: { en: "Renamed", bg: "Преименувано" } } ], docs );
        const labels = result[ "competence-labels" ];
        assert.deepEqual( labels.competency.name[ "E1-1" ], { en: "Renamed", bg: "Преименувано" } );
        assert.deepEqual( labels.competency.name[ "C1-1" ], { en: "Gamma", bg: "Гама" }, "other competency untouched" );
        assert.deepEqual( labels.competency.scope[ "E1-1" ].T, { en: "t", bg: "т" }, "scope not in the edited row is preserved" );
        assert.deepEqual( labels.framework.keep, { en: "keep", bg: "пази" }, "non-competency label preserved" );
    } );

    it( "merges a single-language edit without blanking the other language", () => {
        const result = decomposeCompetencyText( [ { code: "E1-1", name: { en: "EN only" } } ], fixture() );
        assert.deepEqual( result[ "competence-labels" ].competency.name[ "E1-1" ], { en: "EN only", bg: "Алфа" } );
    } );

    it( "does not mutate the input documents", () => {
        const docs = fixture();
        decomposeCompetencyText( [ { code: "E1-1", name: { en: "Mutated?", bg: "?" } } ], docs );
        assert.deepEqual( docs[ "competence-labels" ].competency.name[ "E1-1" ], { en: "Alpha", bg: "Алфа" } );
    } );

    it( "accepts the { rows } envelope as well as a bare array", () => {
        const result = decomposeCompetencyText( { rows: [ { code: "C1-1", description: { en: "new", bg: "ново" } } ] }, fixture() );
        assert.deepEqual( result[ "competence-labels" ].competency.description[ "C1-1" ], { en: "new", bg: "ново" } );
    } );

} );

describe( "config-editors — round-trip & registration", () => {

    it( "compose → edit one bg anchor → decompose changes only that leaf", () => {
        const docs = fixture();
        const rows = composeCompetencyText( docs );
        const edited = rows.find( ( r ) => r.code === "E1-1" );
        edited.scope.N.bg = "ОБНОВЕНО";
        const result = decomposeCompetencyText( rows, docs );
        const labels = result[ "competence-labels" ];
        assert.equal( labels.competency.scope[ "E1-1" ].N.bg, "ОБНОВЕНО" );
        assert.equal( labels.competency.scope[ "E1-1" ].N.en, "n", "EN reference untouched" );
        assert.deepEqual( labels.competency.name[ "E1-2" ], { en: "Beta", bg: "Бета" }, "siblings untouched" );
    } );

    it( "registers the competency-text editor over the dictionary + labels", () => {
        const registered = {};
        const stubApp = { registerConfigEditor( key, definition ) { registered[ key ] = definition; return this; } };
        registerCompetenceEditors( stubApp );
        assert.ok( registered[ "competency-text" ], "competency-text editor registered" );
        assert.deepEqual( registered[ "competency-text" ].documents, [ "competencies", "competence-labels" ] );
        assert.equal( typeof registered[ "competency-text" ].compose, "function" );
        assert.equal( typeof registered[ "competency-text" ].decompose, "function" );
        assert.deepEqual( competencyTextEditor.metadata.writes, [ "competence-labels" ] );
    } );

} );
