/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Build step: derive the relevancy model from the reviewable source `design/competency-relevancy-model.md`.
 *
 * The model doc is the source of truth: it defines the archetype curves (one weight per stage-level) and assigns one
 * archetype per competency. Relevancy is stored as **archetypes + a per-competency assignment** (global — the same
 * curve wherever a competency is used); the effective per-stage-level weight is resolved at evaluation-snapshot time
 * from a competency's archetype. This script:
 *   - writes `config.relevancy-archetypes.json` — `{ <id>: { weights: { N1..T1 } } }`;
 *   - sets `relevancyArchetype` on every entry in `config.competencies.json`;
 *   - writes the `relevancy-archetype` name/description labels into `competence-labels.json` (EN from the doc; BG
 *     maintained here, pending native-speaker review);
 *   - writes `config.role-family-competencies.json` — the per-family competency **pool** (`{ <family>: [codes] }`).
 *     Every role family in `config.role-families.json` gets a pool: its family-specific competencies (from the doc's
 *     `## Assignments — <family> family-specific` section — empty for the not-yet-populated families) plus all shared
 *     competencies (from `## Assignments — Shared`, so even an unpopulated family shares the canonical core). This is
 *     the applicability universe the cycle-setup picker filters to and the lock validation enforces.
 *
 * The stage-level ladder is read from `config.stage-levels.json` so it stays the single source of truth shared with
 * the runtime; the model doc's curve table must carry exactly one weight column per ladder rung, in ladder order.
 *
 * Re-run after editing the archetype curves/assignments in the model doc:  node bin/build/build-competency-relevancy.js
 * OVERWRITES config.relevancy-archetypes.json and the relevancyArchetype fields + `relevancy-archetype` labels.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, "..", ".." );
const MODEL_FILE = path.join( PACKAGE_ROOT, "design/competency-relevancy-model.md" );
const STAGE_LEVELS_FILE = path.join( PACKAGE_ROOT, "bin/config/config.stage-levels.json" );
const ARCHETYPES_FILE = path.join( PACKAGE_ROOT, "bin/config/config.relevancy-archetypes.json" );
const COMPETENCIES_FILE = path.join( PACKAGE_ROOT, "bin/config/config.competencies.json" );
const LABELS_FILE = path.join( PACKAGE_ROOT, "bin/localization/competence-labels.json" );
const POOL_FILE = path.join( PACKAGE_ROOT, "bin/config/config.role-family-competencies.json" );
const ROLE_FAMILIES_FILE = path.join( PACKAGE_ROOT, "bin/config/config.role-families.json" );

const readFile = ( filePath ) => fs.readFileSync( filePath, "utf8" );

// Derive the ordered stage-level curve keys (N1..T1) from config.stage-levels.json so the model doc, the runtime, and
// this generator all share one source of truth for the ladder.
const stageLevelsConfig = JSON.parse( readFile( STAGE_LEVELS_FILE ) );
const LEVELS = [];
for ( const [ code, definition ] of Object.entries( stageLevelsConfig ) ) {
    const stageCount = ( definition && Number.isInteger( definition.stages ) && definition.stages > 0 ) ? definition.stages : 1;
    for ( let stage = 1; stage <= stageCount; stage++ ) {
        LEVELS.push( `${ code }${ stage }` );
    }
}
const ARCHETYPE_ROW_COLUMNS = LEVELS.length + 3; // id + name + one weight per level + description
const ARCHETYPE_IDS = [ "A", "B", "C", "D", "E", "F", "G" ];

// ---- parse the model doc: archetype curves + per-competency assignments + pool membership ----
const curves = {};
const archetypeMeta = {};
const assignments = {};
const issues = [];
const familySpecificCodes = {}; // family code -> [codes], from each "## Assignments — <XX> family-specific" section
const sharedCodes = []; // codes from the "## Assignments — Shared competencies" section (apply to every family)
let currentAssignmentSection = null; // "SHARED" | family code | null — the section the current row belongs to

for ( const line of readFile( MODEL_FILE ).split( /\r?\n/ ) ) {
    // Track the current "## Assignments — …" section so each competency can be attributed to a family pool (its
    // family-specific section, or the shared section that applies to every family).
    const sectionMatch = line.match( /^##\s+Assignments\s+[—-]\s+(.+?)\s*$/ );
    if ( sectionMatch ) {
        const heading = sectionMatch[ 1 ];
        if ( /^Shared\b/i.test( heading ) ) {
            currentAssignmentSection = "SHARED";
        } else {
            const familyMatch = heading.match( /^([A-Z]{2})\b/ );
            currentAssignmentSection = familyMatch ? familyMatch[ 1 ] : null;
            if ( currentAssignmentSection && !familySpecificCodes[ currentAssignmentSection ] ) {
                familySpecificCodes[ currentAssignmentSection ] = [];
            }
        }
        continue;
    }
    if ( !line.trim().startsWith( "|" ) ) {
        continue;
    }
    const cells = line.split( "|" );
    if ( cells[ 0 ].trim() === "" ) {
        cells.shift();
    }
    if ( cells.length && cells[ cells.length - 1 ].trim() === "" ) {
        cells.pop();
    }
    const columns = cells.map( ( cell ) => cell.trim() );

    if ( columns.length === ARCHETYPE_ROW_COLUMNS && /^\*\*[A-G]\*\*$/.test( columns[ 0 ] ) ) {
        const id = columns[ 0 ].replace( /\*/g, "" );
        const weights = {};
        LEVELS.forEach( ( level, index ) => {
            weights[ level ] = Number( columns[ 2 + index ] );
        } );
        curves[ id ] = weights;
        archetypeMeta[ id ] = { name: columns[ 1 ], description: columns[ columns.length - 1 ] };
    } else if ( columns.length === 4 && /^[EIC][1-3]-\d+$/.test( columns[ 0 ] ) && /^[A-G]$/.test( columns[ 2 ] ) ) {
        const code = columns[ 0 ];
        if ( assignments[ code ] && assignments[ code ] !== columns[ 2 ] ) {
            issues.push( `conflicting archetype for ${ code }` );
        }
        assignments[ code ] = columns[ 2 ];
        // Attribute the code to its pool bucket based on the section it appears under.
        if ( currentAssignmentSection === "SHARED" ) {
            if ( !sharedCodes.includes( code ) ) sharedCodes.push( code );
        } else if ( currentAssignmentSection ) {
            if ( !familySpecificCodes[ currentAssignmentSection ].includes( code ) ) familySpecificCodes[ currentAssignmentSection ].push( code );
        } else {
            issues.push( `assignment for ${ code } found outside any "## Assignments — …" section` );
        }
    }
}

for ( const id of ARCHETYPE_IDS ) {
    if ( !curves[ id ] ) {
        issues.push( `missing archetype curve ${ id }` );
        continue;
    }
    for ( const level of LEVELS ) {
        const weight = curves[ id ][ level ];
        if ( !Number.isInteger( weight ) || weight < 2 || weight > 10 ) {
            issues.push( `${ id }.${ level } = ${ weight } (not int 2-10)` );
        }
    }
}

// ---- assign archetype per competency + build archetypes config ----
const competenciesRaw = readFile( COMPETENCIES_FILE );
const competenciesData = JSON.parse( competenciesRaw );
for ( const code of Object.keys( competenciesData.competencies ) ) {
    if ( !assignments[ code ] ) {
        issues.push( `no archetype assignment for dictionary code ${ code }` );
        continue;
    }
    competenciesData.competencies[ code ].relevancyArchetype = assignments[ code ];
}

const archetypesConfig = {};
for ( const id of ARCHETYPE_IDS ) {
    archetypesConfig[ id ] = { weights: curves[ id ] };
}

// ---- build the per-family competency pool ----
// Every defined role family gets a pool: its family-specific competencies (none, for the not-yet-populated families)
// plus all shared canonical competencies — so an unpopulated family (e.g. QE) still draws on the shared core.
const sortCodes = ( a, b ) => a.localeCompare( b, undefined, { numeric: true } );
const allFamilies = Object.keys( JSON.parse( readFile( ROLE_FAMILIES_FILE ) ) );
// Flag any family-specific assignment section whose family isn't a defined role family (its codes would be dropped).
for ( const family of Object.keys( familySpecificCodes ) ) {
    if ( !allFamilies.includes( family ) ) {
        issues.push( `family-specific section '${ family }' is not a defined role family in config.role-families.json` );
    }
}
const poolConfig = {};
for ( const family of allFamilies ) {
    const pool = [ ...( familySpecificCodes[ family ] || [] ), ...sharedCodes ];
    for ( const code of pool ) {
        if ( !competenciesData.competencies[ code ] ) {
            issues.push( `pool code ${ code } (family ${ family }) is not in the dictionary` );
        }
    }
    poolConfig[ family ] = pool.sort( sortCodes );
}

if ( issues.length ) {
    console.error( "ABORT — model/assignment issues:\n  " + issues.join( "\n  " ) );
    process.exit( 1 );
}

fs.writeFileSync( ARCHETYPES_FILE, JSON.stringify( archetypesConfig, null, 2 ) + "\n", "utf8" );
fs.writeFileSync( COMPETENCIES_FILE, JSON.stringify( competenciesData, null, 2 ) + ( competenciesRaw.endsWith( "\n" ) ? "\n" : "" ), "utf8" );
fs.writeFileSync( POOL_FILE, JSON.stringify( poolConfig, null, 2 ) + "\n", "utf8" );

// ---- archetype labels (EN from doc; BG maintained here, pending review) ----
const archetypeBg = {
    A: { name: "Фундаментално плато", description: "Основи, важни от първия ден, които остават важни (основни знания, всекидневни инструменти)." },
    B: { name: "Нарастващо със стажа", description: "Способности, които се очаква да нарастват значително с нивото (задълбочени знания, стратегия, опит, по-голямата част от междуличностното развитие)." },
    C: { name: "Постоянно високо", description: "Последователно важни на всички нива (етика, срокове, основна комуникация, спазване на процеси)." },
    D: { name: "Ранен акцент, после подразбиращо се", description: "Практически механики, оценявани силно в началото, усвоени/подразбиращи се по-късно (базови умения за писане на код, конвенции)." },
    E: { name: "Със среден акцент", description: "Приложни умения, достигащи пик при стандартно/старши ниво (основните „изпълнителски“ компетентности на всяка дисциплина)." },
    F: { name: "Нарастващо, с насоченост към експерта", description: "Дълбоки технически способности, при които експертът (IC) е авторитетът (архитектура, R&D, технически дълг)." },
    G: { name: "Нарастващо, с насоченост към мениджъра", description: "Способности за работа с хора и екипи, при които мениджърският път е пикът (делегиране, лидерство, развиване и мотивиране на други)." }
};
const labelsRaw = readFile( LABELS_FILE );
const labels = JSON.parse( labelsRaw );
const archetypeNameLabels = {};
const archetypeDescriptionLabels = {};
for ( const id of ARCHETYPE_IDS ) {
    archetypeNameLabels[ id ] = { en: archetypeMeta[ id ].name, bg: archetypeBg[ id ].name };
    archetypeDescriptionLabels[ id ] = { en: archetypeMeta[ id ].description, bg: archetypeBg[ id ].description };
}
labels[ "relevancy-archetype" ] = { name: archetypeNameLabels, description: archetypeDescriptionLabels };
fs.writeFileSync( LABELS_FILE, JSON.stringify( labels, null, 2 ) + ( labelsRaw.endsWith( "\n" ) ? "\n" : "" ), "utf8" );

console.log( "archetypes:", ARCHETYPE_IDS.join( "," ) );
console.log( "competencies assigned:", Object.keys( competenciesData.competencies ).filter( ( code ) => competenciesData.competencies[ code ].relevancyArchetype ).length, "/", Object.keys( competenciesData.competencies ).length );
console.log( "pool (family-specific + " + sharedCodes.length + " shared):", Object.entries( poolConfig ).map( ( [ family, codes ] ) => `${ family }=${ codes.length }` ).join( "  " ) );
console.log( "sample — E1-8:", competenciesData.competencies[ "E1-8" ].relevancyArchetype, "(expect F);  C1-4:", competenciesData.competencies[ "C1-4" ].relevancyArchetype, "(expect C)" );
