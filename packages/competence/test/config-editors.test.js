/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const configurationLoader = require( "#configuration-loader" );
const {
    SCOPE_LEVELS, ARCHETYPE_STAGE_LEVELS,
    composeCompetencyText, decomposeCompetencyText,
    composeArchetypeAssignment, decomposeArchetypeAssignment,
    composeRelevancyArchetype, decomposeRelevancyArchetype,
    composeRoleFamilies, decomposeRoleFamilies,
    composeOrganizationStructure, decomposeOrganizationStructure,
    decomposeWorkSites,
    composeResearchConsent, decomposeResearchConsent,
    competencyTextEditor, registerCompetenceEditors
} = require( "../application/config-editors" );

const weights12 = ( n ) => {
    const out = {};
    ARCHETYPE_STAGE_LEVELS.forEach( ( level ) => { out[ level ] = n; } );
    return out;
};

// Fixture for the relevancy editors: competencies carry archetype assignments; two archetypes with curves + labels.
const archetypeFixture = () => ( {
    competencies: {
        categories: { E: { subcategories: { E1: {} } }, C: { subcategories: { C1: {} } } },
        competencies: {
            "E1-1": { category: "E", subcategory: "E1", relevancyArchetype: "A" },
            "E1-2": { category: "E", subcategory: "E1", relevancyArchetype: "B" },
            "C1-1": { category: "C", subcategory: "C1", relevancyArchetype: "A" }
        }
    },
    "relevancy-archetypes": {
        A: { weights: weights12( 6 ) },
        B: { weights: weights12( 3 ) }
    },
    "competence-labels": {
        category: { name: { E: { en: "Expertise", bg: "Е" }, C: { en: "Commitment", bg: "Ц" } }, sub: { name: { E1: { en: "Theory", bg: "Т" } } } },
        competency: { name: { "E1-1": { en: "a", bg: "а" }, "E1-2": { en: "b", bg: "б" }, "C1-1": { en: "c", bg: "ц" } } },
        "relevancy-archetype": {
            name: { A: { en: "Alpha", bg: "Алфа" }, B: { en: "Beta", bg: "Бета" } },
            description: { A: { en: "da", bg: "да" }, B: { en: "db", bg: "дб" } }
        }
    }
} );

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

describe( "config-editors — composeArchetypeAssignment / decomposeArchetypeAssignment", () => {

    it( "projects each competency's archetype plus the archetype catalogue", () => {
        const view = composeArchetypeAssignment( archetypeFixture() );
        assert.deepEqual( view.rows.map( ( r ) => r.code ), [ "E1-1", "E1-2", "C1-1" ] );
        const e11 = view.rows.find( ( r ) => r.code === "E1-1" );
        assert.equal( e11.relevancyArchetype, "A" );
        assert.deepEqual( e11.name, { en: "a", bg: "а" } );
        assert.deepEqual( view.archetypes.map( ( a ) => a.id ), [ "A", "B" ] );
        assert.equal( view.archetypes[ 0 ].weights.N1, 6 );
        assert.deepEqual( view.archetypes[ 0 ].name, { en: "Alpha", bg: "Алфа" } );
    } );

    it( "writes only the dictionary, updating relevancyArchetype and preserving the rest", () => {
        const docs = archetypeFixture();
        const result = decomposeArchetypeAssignment( [ { code: "E1-1", relevancyArchetype: "B" } ], docs );
        assert.deepEqual( Object.keys( result ), [ "competencies" ] );
        assert.equal( result.competencies.competencies[ "E1-1" ].relevancyArchetype, "B" );
        assert.equal( result.competencies.competencies[ "E1-1" ].category, "E", "other competency fields preserved" );
        assert.equal( result.competencies.competencies[ "C1-1" ].relevancyArchetype, "A", "other competency untouched" );
    } );

    it( "ignores unknown codes and blank assignments, and does not mutate the input", () => {
        const docs = archetypeFixture();
        const result = decomposeArchetypeAssignment( [ { code: "NOPE", relevancyArchetype: "B" }, { code: "E1-2", relevancyArchetype: "" } ], docs );
        assert.equal( result.competencies.competencies[ "NOPE" ], undefined );
        assert.equal( result.competencies.competencies[ "E1-2" ].relevancyArchetype, "B", "blank assignment does not clear the existing value" );
        assert.equal( docs.competencies.competencies[ "E1-1" ].relevancyArchetype, "A", "input not mutated" );
    } );

} );

describe( "config-editors — composeRelevancyArchetype / decomposeRelevancyArchetype", () => {

    it( "projects curves with bilingual name/description, a weight per stage sub-level, and assignment counts", () => {
        const view = composeRelevancyArchetype( archetypeFixture() );
        assert.deepEqual( view.stageLevels, ARCHETYPE_STAGE_LEVELS );
        const a = view.rows.find( ( r ) => r.id === "A" );
        assert.deepEqual( a.name, { en: "Alpha", bg: "Алфа" } );
        assert.equal( Object.keys( a.weights ).length, configurationLoader.getArchetypeStageLevels().length );
        assert.equal( a.weights.T1, 6 );
        assert.equal( a.assignedCount, 2, "A is assigned to E1-1 and C1-1" );
        assert.equal( view.rows.find( ( r ) => r.id === "B" ).assignedCount, 1 );
    } );

    it( "writes archetypes + labels; supports edit, add, remove-by-omission, and integer coercion", () => {
        const docs = archetypeFixture();
        const editedRows = [
            { id: "A", name: { en: "Alpha+", bg: "Алфа+" }, description: { en: "da", bg: "да" }, weights: Object.assign( weights12( 7 ), { N1: "8" } ) },
            { id: "Z", name: { en: "Zeta", bg: "Зета" }, description: { en: "dz", bg: "дз" }, weights: weights12( 5 ) }
        ];
        const result = decomposeRelevancyArchetype( { rows: editedRows }, docs );
        assert.deepEqual( Object.keys( result ).sort(), [ "competence-labels", "relevancy-archetypes" ] );

        const arch = result[ "relevancy-archetypes" ];
        assert.deepEqual( Object.keys( arch ).sort(), [ "A", "Z" ], "B removed by omission; Z added" );
        assert.equal( arch.A.weights.N1, 8, "string weight coerced to integer" );
        assert.equal( arch.A.weights.J1, 7 );

        const labels = result[ "competence-labels" ];
        assert.deepEqual( labels[ "relevancy-archetype" ].name.A, { en: "Alpha+", bg: "Алфа+" } );
        assert.ok( labels[ "relevancy-archetype" ].name.Z, "new archetype label added" );
        assert.equal( labels[ "relevancy-archetype" ].name.B, undefined, "removed archetype label pruned" );
        assert.equal( labels[ "relevancy-archetype" ].description.B, undefined, "removed archetype description pruned" );
        assert.deepEqual( labels.competency.name[ "E1-1" ], { en: "a", bg: "а" }, "competency labels preserved" );
    } );

    it( "registers all competence editors", () => {
        const editors = {};
        const stubApp = { registerConfigEditor( key, definition ) { editors[ key ] = definition; return this; } };
        registerCompetenceEditors( stubApp );
        assert.deepEqual( Object.keys( editors ).sort(), [ "archetype-assignment", "competency-text", "organization-structure", "relevancy-archetype", "research-consent", "role-families", "work-sites" ] );
        assert.deepEqual( editors[ "organization-structure" ].metadata.writes, [ "organization-structure" ] );
        assert.deepEqual( editors[ "archetype-assignment" ].metadata.writes, [ "competencies" ] );
        assert.deepEqual( editors[ "relevancy-archetype" ].metadata.writes, [ "relevancy-archetypes", "competence-labels" ] );
        assert.deepEqual( editors[ "role-families" ].metadata.writes, [ "role-families", "competence-labels" ] );
    } );

} );

// Fixture for the role-families editor: one family with two specializations; BACKEND used by two active-set cycles.
const roleFamilyFixture = () => ( {
    "role-families": {
        SE: {
            name: "role-family.name.SE",
            description: "role-family.description.SE",
            specializations: {
                BACKEND: { name: "role-family.SE.specialization.name.BACKEND", description: "role-family.SE.specialization.description.BACKEND", eCFMapping: [ { competence: "A.1", level: "e-3" } ] },
                FRONTEND: { name: "role-family.SE.specialization.name.FRONTEND", description: "role-family.SE.specialization.description.FRONTEND", eCFMapping: [] }
            }
        }
    },
    "competence-labels": {
        "role-family": {
            name: { SE: { en: "Software Engineering", bg: "Софтуерно инженерство" } },
            description: { SE: { en: "Builds software", bg: "Изгражда софтуер" } },
            SE: {
                specialization: {
                    name: { BACKEND: { en: "Backend", bg: "Бекенд" }, FRONTEND: { en: "Frontend", bg: "Фронтенд" } },
                    description: { BACKEND: { en: "Server-side", bg: "Сървърна страна" }, FRONTEND: { en: "Client-side", bg: "Клиентска страна" } }
                }
            }
        }
    },
    "active-competency-sets": {
        SE: { baseline: { "2026-H2": [] }, BACKEND: { "2026-H2": [], "2027-H1": [] } }
    }
} );

describe( "config-editors — composeRoleFamilies / decomposeRoleFamilies", () => {

    it( "projects families with bilingual text, specializations, eCFMapping, and active-set usage", () => {
        const view = composeRoleFamilies( roleFamilyFixture() );
        const se = view.families.find( ( f ) => f.code === "SE" );
        assert.deepEqual( se.name, { en: "Software Engineering", bg: "Софтуерно инженерство" } );
        assert.deepEqual( se.specializations.map( ( s ) => s.code ), [ "BACKEND", "FRONTEND" ] );
        const backend = se.specializations.find( ( s ) => s.code === "BACKEND" );
        assert.deepEqual( backend.name, { en: "Backend", bg: "Бекенд" } );
        assert.equal( backend.activeSetUse, 2, "BACKEND used by two active-set cycles" );
        assert.deepEqual( backend.eCFMapping, [ { competence: "A.1", level: "e-3" } ] );
        assert.equal( se.specializations.find( ( s ) => s.code === "FRONTEND" ).activeSetUse, 0 );
    } );

    it( "writes role-families + labels; adds/removes specs, preserves eCFMapping and templated key refs", () => {
        const docs = roleFamilyFixture();
        const edited = [ {
            code: "SE",
            name: { en: "Software Engineering", bg: "СИ-ново" },
            description: { en: "Builds software", bg: "Изгражда софтуер" },
            specializations: [
                { code: "BACKEND", name: { en: "Backend", bg: "Бекенд" }, description: { en: "Server-side", bg: "Сървърна страна" } },
                { code: "MOBILE", name: { en: "Mobile", bg: "Мобилни" }, description: { en: "Apps", bg: "Приложения" } }
            ]
        } ];
        const result = decomposeRoleFamilies( { families: edited }, docs );
        assert.deepEqual( Object.keys( result ).sort(), [ "competence-labels", "role-families" ] );

        const se = result[ "role-families" ].SE;
        assert.deepEqual( Object.keys( se.specializations ).sort(), [ "BACKEND", "MOBILE" ], "FRONTEND removed; MOBILE added" );
        assert.equal( se.name, "role-family.name.SE", "family name stays a templated key ref" );
        assert.deepEqual( se.specializations.BACKEND.eCFMapping, [ { competence: "A.1", level: "e-3" } ], "eCFMapping preserved" );
        assert.equal( se.specializations.MOBILE.name, "role-family.SE.specialization.name.MOBILE", "new spec gets a templated key ref" );
        assert.deepEqual( se.specializations.MOBILE.eCFMapping, [], "new spec gets empty eCFMapping" );

        const labels = result[ "competence-labels" ][ "role-family" ];
        assert.deepEqual( labels.name.SE, { en: "Software Engineering", bg: "СИ-ново" }, "family text updated in labels" );
        assert.deepEqual( labels.SE.specialization.name.MOBILE, { en: "Mobile", bg: "Мобилни" } );
        assert.equal( labels.SE.specialization.name.FRONTEND, undefined, "removed spec label pruned" );
        assert.equal( labels.SE.specialization.description.FRONTEND, undefined );
    } );

    it( "ignores unknown family codes and does not mutate the input", () => {
        const docs = roleFamilyFixture();
        const result = decomposeRoleFamilies( [ { code: "ZZ", name: { en: "x", bg: "х" }, specializations: [] } ], docs );
        assert.equal( result[ "role-families" ].ZZ, undefined, "unknown family ignored" );
        assert.ok( result[ "role-families" ].SE.specializations.FRONTEND, "existing family untouched" );
        assert.ok( docs[ "role-families" ].SE.specializations.FRONTEND, "input not mutated" );
    } );

} );

/* ============================================================================
 * organization-structure
 * ========================================================================== */

const orgFixture = () => ( {
    "organization-structure": {
        ROOT: { id: "ROOT", name: "Acme", type: "Organization", parent: null, children: [ "ENG" ], managerID: "100" },
        ENG: { id: "ENG", name: "Engineering", type: "Department", parent: "ROOT", children: [ "QA" ], managerID: "200", location: "Sofia" },
        QA: { id: "QA", name: "Quality", type: "Unit", parent: "ENG", children: [], managerID: null }
    }
} );

describe( "config-editors — composeOrganizationStructure / decomposeOrganizationStructure", () => {

    it( "projects rows in tree order with a depth for each", () => {
        const view = composeOrganizationStructure( orgFixture() );
        assert.deepEqual( view.units.map( ( u ) => u.id ), [ "ROOT", "ENG", "QA" ] );
        assert.deepEqual( view.units.map( ( u ) => u.depth ), [ 0, 1, 2 ] );
    } );

    it( "presents a null parent and a null managerID as empty strings the form can bind", () => {
        const view = composeOrganizationStructure( orgFixture() );
        assert.equal( view.units[ 0 ].parent, "" );
        assert.equal( view.units[ 2 ].managerID, "" );
    } );

    it( "round-trips a document unchanged", () => {
        const docs = orgFixture();
        const result = decomposeOrganizationStructure( composeOrganizationStructure( docs ), docs );
        assert.deepEqual( result[ "organization-structure" ], orgFixture()[ "organization-structure" ] );
    } );

    it( "derives children from the parent pointers, so re-parenting needs one field on one row", () => {
        const docs = orgFixture();
        const view = composeOrganizationStructure( docs );
        view.units[ 2 ].parent = "ROOT";
        const result = decomposeOrganizationStructure( view, docs )[ "organization-structure" ];
        assert.deepEqual( result.ROOT.children, [ "ENG", "QA" ] );
        assert.deepEqual( result.ENG.children, [], "the old parent lets go without being edited" );
    } );

    it( "writes an empty parent and manager back as null, never as an empty string", () => {
        // The schema admits null or a non-empty string; "" is neither, so a blank field must not survive as one.
        const result = decomposeOrganizationStructure(
            { units: [ { id: "SOLO", name: "Solo", type: "Organization", parent: "  ", managerID: "" } ] }, {} )[ "organization-structure" ];
        assert.equal( result.SOLO.parent, null );
        assert.equal( result.SOLO.managerID, null );
    } );

    it( "stamps id from the row key and drops a row with no id", () => {
        const result = decomposeOrganizationStructure(
            { units: [ { id: " ROOT ", name: "Acme", type: "Organization", parent: "" }, { id: "  ", name: "Ghost", type: "Unit", parent: "ROOT" } ] }, {} )[ "organization-structure" ];
        assert.deepEqual( Object.keys( result ), [ "ROOT" ] );
        assert.equal( result.ROOT.id, "ROOT" );
    } );

    it( "omits a blank optional field rather than writing an empty string", () => {
        const result = decomposeOrganizationStructure(
            { units: [ { id: "ROOT", name: "Acme", type: "Organization", parent: "", location: "", description: "HQ" } ] }, {} )[ "organization-structure" ];
        assert.equal( Object.prototype.hasOwnProperty.call( result.ROOT, "location" ), false );
        assert.equal( result.ROOT.description, "HQ" );
    } );

    it( "drops a child reference to a unit that is not in the submitted set", () => {
        // The orphan keeps its own parent, so the error the admin sees is the real one (a parent that is gone)
        // rather than a derived symmetry complaint about a list they never edited.
        const docs = orgFixture();
        const view = composeOrganizationStructure( docs );
        view.units = view.units.filter( ( u ) => u.id !== "ENG" );
        const result = decomposeOrganizationStructure( view, docs )[ "organization-structure" ];
        assert.deepEqual( result.ROOT.children, [] );
        assert.equal( result.QA.parent, "ENG" );
    } );

    it( "still lists every unit when the stored tree has no root at all", () => {
        // A structurally broken document is exactly when an admin needs to see all of it.
        const broken = { "organization-structure": {
            A: { id: "A", name: "A", type: "Unit", parent: "B", children: [] },
            B: { id: "B", name: "B", type: "Unit", parent: "A", children: [] }
        } };
        assert.deepEqual( composeOrganizationStructure( broken ).units.map( ( u ) => u.id ).sort(), [ "A", "B" ] );
    } );

} );

/* ============================================================================
 * research-consent
 * ========================================================================== */

const consentFixture = () => ( {
    "research-consent": {
        enabled: true,
        version: "1.0",
        text: { en: { body: "English statement." }, bg: { body: "Български текст." } }
    }
} );

describe( "config-editors — composeResearchConsent / decomposeResearchConsent", () => {

    it( "projects the switch, the version and one body per locale", () => {
        const view = composeResearchConsent( consentFixture() );
        assert.equal( view.enabled, true );
        assert.equal( view.version, "1.0" );
        assert.deepEqual( view.texts.map( ( t ) => t.language ), [ "en", "bg" ] );
        assert.equal( view.texts[ 1 ].body, "Български текст." );
    } );

    it( "offers both locales even when the stored document carries only one", () => {
        const view = composeResearchConsent( { "research-consent": { enabled: true, version: "2.0", text: { en: { body: "Only English." } } } } );
        assert.deepEqual( view.texts.map( ( t ) => t.language ), [ "en", "bg" ] );
        assert.equal( view.texts[ 1 ].body, "" );
    } );

    it( "round-trips a document unchanged", () => {
        const docs = consentFixture();
        const result = decomposeResearchConsent( composeResearchConsent( docs ), docs );
        assert.deepEqual( result[ "research-consent" ], consentFixture()[ "research-consent" ] );
    } );

    it( "omits a locale left blank rather than writing an empty body the schema refuses", () => {
        const docs = consentFixture();
        const view = composeResearchConsent( docs );
        view.texts[ 1 ].body = "   ";
        const result = decomposeResearchConsent( view, docs )[ "research-consent" ];
        assert.deepEqual( Object.keys( result.text ), [ "en" ] );
    } );

    it( "never invents a version bump — that refusal is the validator's, and the point of it", () => {
        const docs = consentFixture();
        const view = composeResearchConsent( docs );
        view.texts[ 0 ].body = "Reworded.";
        const result = decomposeResearchConsent( view, docs )[ "research-consent" ];
        assert.equal( result.version, "1.0" );
    } );

    it( "coerces the switch to a real boolean", () => {
        const docs = consentFixture();
        const result = decomposeResearchConsent( { ...composeResearchConsent( docs ), enabled: "yes" }, docs )[ "research-consent" ];
        assert.equal( result.enabled, false, "only a true boolean enables collection — fail closed" );
    } );

    it( "ignores a locale the statement is not authored in", () => {
        const docs = consentFixture();
        const view = composeResearchConsent( docs );
        view.texts.push( { language: "de", body: "Deutscher Text." } );
        const result = decomposeResearchConsent( view, docs )[ "research-consent" ];
        assert.deepEqual( Object.keys( result.text ).sort(), [ "bg", "en" ] );
    } );

} );

/* ============================================================================
 * prototype-polluting keys in the entity editors
 * ========================================================================== */

describe( "config-editors — decompose is safe against prototype-polluting keys", () => {

    // `decompose` runs BEFORE applyEdits validates, so anything it throws escapes as a 500 instead of arriving as
    // `{ ok: false, errors }` on the screen. Building on a plain `{}` gave three ways for that to happen.

    it( "does not throw when a row's parent is __proto__", () => {
        const doc = decomposeOrganizationStructure( { units: [
            { id: "ROOT", name: "Acme", type: "Organization", parent: "" },
            { id: "ENG", name: "Eng", type: "Unit", parent: "__proto__" }
        ] }, {} )[ "organization-structure" ];
        // Object.prototype.children is undefined, so the old code called .includes on it and threw.
        assert.deepEqual( doc.ROOT.children, [] );
        assert.equal( doc.ENG.parent, "__proto__", "the bad parent is preserved so the validator can name it" );
    } );

    it( "keeps a __proto__ unit id as a real key instead of losing it to the setter", () => {
        const doc = decomposeOrganizationStructure( { units: [
            { id: "__proto__", name: "Evil", type: "Unit", parent: "" }
        ] }, {} )[ "organization-structure" ];
        assert.ok( Object.prototype.hasOwnProperty.call( doc, "__proto__" ), "present as an own key, not swallowed" );
        assert.equal( Object.getPrototypeOf( doc ), Object.prototype, "and the document's own prototype is untouched" );
    } );

    it( "keeps a __proto__ work-site code as a real key too", () => {
        const doc = decomposeWorkSites( { sites: [
            { code: "__proto__", type: "office", name: { en: "x", bg: "х" } }
        ] }, {} )[ "work-sites" ];
        assert.ok( Object.prototype.hasOwnProperty.call( doc, "__proto__" ) );
        assert.equal( Object.getPrototypeOf( doc ), Object.prototype );
    } );

    it( "does not treat an inherited member as an already-submitted unit", () => {
        // `next[ "constructor" ]` is truthy on a plain object, so a parent of "constructor" used to pass the guard
        // and have a child pushed onto a member of Object.prototype.
        const doc = decomposeOrganizationStructure( { units: [
            { id: "ROOT", name: "Acme", type: "Organization", parent: "" },
            { id: "ENG", name: "Eng", type: "Unit", parent: "constructor" }
        ] }, {} )[ "organization-structure" ];
        assert.deepEqual( Object.keys( doc ).sort(), [ "ENG", "ROOT" ] );
        assert.deepEqual( doc.ROOT.children, [] );
    } );

    it( "leaves an ordinary document byte-identical", () => {
        // The hardening must not change the shape of a normal save.
        const docs = orgFixture();
        const result = decomposeOrganizationStructure( composeOrganizationStructure( docs ), docs );
        assert.deepEqual( result[ "organization-structure" ], orgFixture()[ "organization-structure" ] );
        assert.equal( Object.getPrototypeOf( result[ "organization-structure" ] ), Object.prototype );
    } );

} );
