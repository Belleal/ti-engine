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
 * The model doc is the source of truth: it defines the archetype curves (12 stage-level weights each) and assigns
 * one archetype per competency. Relevancy is stored as **archetypes + a per-competency assignment** (global — the
 * same curve wherever a competency is used); the effective per-stage-level weight is resolved at evaluation-snapshot
 * time from a competency's archetype. This script:
 *   - writes `config.relevancy-archetypes.json` — `{ <id>: { weights: { N1..T1 } } }`;
 *   - sets `relevancyArchetype` on every entry in `config.competencies.json`;
 *   - writes the `relevancy-archetype` name/description labels into `competence-labels.json` (EN from the doc; BG
 *     maintained here, pending native-speaker review).
 *
 * Re-run after editing the archetype curves/assignments in the model doc:  node bin/build/build-competency-relevancy.js
 * OVERWRITES config.relevancy-archetypes.json and the relevancyArchetype fields + `relevancy-archetype` labels.
 */
const fs = require( "fs" ), path = require( "path" );
const PKG = path.resolve( __dirname, "..", ".." );
const rd = ( p ) => fs.readFileSync( p, "utf8" );
const MODEL = rd( path.join( PKG, "design/competency-relevancy-model.md" ) );
const ARCHETYPES_FILE = path.join( PKG, "bin/config/config.relevancy-archetypes.json" );
const COMPETENCIES_FILE = path.join( PKG, "bin/config/config.competencies.json" );
const LABELS_FILE = path.join( PKG, "bin/localization/competence-labels.json" );

const LEVELS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];
const IDS = [ "A", "B", "C", "D", "E", "F", "G" ];

// ---- parse the model doc: archetype curves + per-competency assignments ----
const curves = {}, archMeta = {}, assign = {};
const issues = [];
for ( const line of MODEL.split( /\r?\n/ ) ) {
    if ( !line.trim().startsWith( "|" ) ) continue;
    let parts = line.split( "|" );
    if ( parts[0].trim() === "" ) parts.shift();
    if ( parts.length && parts[parts.length - 1].trim() === "" ) parts.pop();
    const c = parts.map( ( s ) => s.trim() );
    if ( c.length === 15 && /^\*\*[A-G]\*\*$/.test( c[0] ) ) {
        const id = c[0].replace( /\*/g, "" );
        const weights = {};
        LEVELS.forEach( ( lv, i ) => { weights[lv] = Number( c[2 + i] ); } );
        curves[id] = weights;
        archMeta[id] = { name: c[1], description: c[14] };
    } else if ( c.length === 4 && /^[EIC][1-3]-\d+$/.test( c[0] ) && /^[A-G]$/.test( c[2] ) ) {
        if ( assign[c[0]] && assign[c[0]] !== c[2] ) issues.push( `conflicting archetype for ${ c[0] }` );
        assign[c[0]] = c[2];
    }
}
for ( const id of IDS ) {
    if ( !curves[id] ) { issues.push( `missing archetype curve ${ id }` ); continue; }
    for ( const lv of LEVELS ) { const v = curves[id][lv]; if ( !Number.isInteger( v ) || v < 2 || v > 10 ) issues.push( `${ id }.${ lv } = ${ v } (not int 2-10)` ); }
}

// ---- assign archetype per competency + build archetypes config ----
const compRaw = rd( COMPETENCIES_FILE );
const competenciesData = JSON.parse( compRaw );
for ( const code of Object.keys( competenciesData.competencies ) ) {
    if ( !assign[code] ) { issues.push( `no archetype assignment for dictionary code ${ code }` ); continue; }
    competenciesData.competencies[code].relevancyArchetype = assign[code];
}
const archetypesConfig = {};
for ( const id of IDS ) {
    archetypesConfig[id] = { weights: curves[id] };
}

if ( issues.length ) { console.error( "ABORT — model/assignment issues:\n  " + issues.join( "\n  " ) ); process.exit( 1 ); }

fs.writeFileSync( ARCHETYPES_FILE, JSON.stringify( archetypesConfig, null, 2 ) + "\n", "utf8" );
fs.writeFileSync( COMPETENCIES_FILE, JSON.stringify( competenciesData, null, 2 ) + ( compRaw.endsWith( "\n" ) ? "\n" : "" ), "utf8" );

// ---- archetype labels (EN from doc; BG maintained here, pending review) ----
const archBg = {
    A: { name: "Фундаментално плато", description: "Основи, важни от първия ден, които остават важни (основни знания, всекидневни инструменти)." },
    B: { name: "Нарастващо със стажа", description: "Способности, които се очаква да нарастват значително с нивото (задълбочени знания, стратегия, опит, по-голямата част от междуличностното развитие)." },
    C: { name: "Постоянно високо", description: "Последователно важни на всички нива (етика, срокове, основна комуникация, спазване на процеси)." },
    D: { name: "Ранен акцент, после подразбиращо се", description: "Практически механики, оценявани силно в началото, усвоени/подразбиращи се по-късно (базови умения за писане на код, конвенции)." },
    E: { name: "Със среден акцент", description: "Приложни умения, достигащи пик при стандартно/старши ниво (основните „изпълнителски“ компетентности на всяка дисциплина)." },
    F: { name: "Нарастващо, с насоченост към експерта", description: "Дълбоки технически способности, при които експертът (IC) е авторитетът (архитектура, R&D, технически дълг)." },
    G: { name: "Нарастващо, с насоченост към мениджъра", description: "Способности за работа с хора и екипи, при които мениджърският път е пикът (делегиране, лидерство, развиване и мотивиране на други)." }
};
const labelsRaw = rd( LABELS_FILE );
const labels = JSON.parse( labelsRaw );
const archName = {}, archDesc = {};
for ( const id of IDS ) {
    archName[id] = { en: archMeta[id].name, bg: archBg[id].name };
    archDesc[id] = { en: archMeta[id].description, bg: archBg[id].description };
}
labels["relevancy-archetype"] = { name: archName, description: archDesc };
fs.writeFileSync( LABELS_FILE, JSON.stringify( labels, null, 2 ) + ( labelsRaw.endsWith( "\n" ) ? "\n" : "" ), "utf8" );

console.log( "archetypes:", IDS.join( "," ) );
console.log( "competencies assigned:", Object.keys( competenciesData.competencies ).filter( ( c ) => competenciesData.competencies[c].relevancyArchetype ).length, "/", Object.keys( competenciesData.competencies ).length );
console.log( "sample — E1-8:", competenciesData.competencies["E1-8"].relevancyArchetype, "(expect F);  C1-4:", competenciesData.competencies["C1-4"].relevancyArchetype, "(expect C)" );
