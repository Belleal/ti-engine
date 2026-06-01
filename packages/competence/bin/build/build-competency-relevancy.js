/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Build step: materialize config.competency-relevancy.json (and the relevancy-archetype label section of
 * competence-labels.json) from the reviewable source `design/competency-relevancy-model.md`.
 *
 * The model doc is the source of truth: it defines the 7 archetype curves (12 stage-level weights each) and assigns
 * one archetype per competency. This script expands those mechanically — for each family (SE/BA/PM) it emits every
 * competency in the family's pool (family-specific + all shared) with the weights of its assigned archetype; shared
 * competencies carry the same curve in every family. It also writes the archetype name/description labels (EN from
 * the doc; BG is maintained here, pending native-speaker review) for the UI.
 *
 * Re-run after editing the archetype curves/assignments in the model doc:  node bin/build/build-competency-relevancy.js
 * OVERWRITES config.competency-relevancy.json and the `relevancy-archetype` section of competence-labels.json.
 * The per-family pools below are the current taxonomy; update them here if the dictionary's family membership changes.
 */
const fs = require( "fs" ), path = require( "path" );
const PKG = path.resolve( __dirname, "..", ".." );
const rd = ( p ) => fs.readFileSync( p, "utf8" );
const MODEL = rd( path.join( PKG, "design/competency-relevancy-model.md" ) );
const REL_FILE = path.join( PKG, "bin/config/config.competency-relevancy.json" );
const LABELS_FILE = path.join( PKG, "bin/localization/competence-labels.json" );

const LEVELS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];
const TARGET = {
    SE: [ "E1-1","E1-2","E1-3","E1-4","E1-5","E1-6","E1-7","E1-8","E1-9","E2-1","E2-3","E2-4","E2-5","E2-7","E2-8","E2-9","E2-10","E2-11","E2-12","E2-13","E2-14","E2-15","E2-16","E3-1","E3-2","E3-5","E3-6","E3-7","I1-1","I1-2","I1-3" ],
    BA: [ "E1-10","E1-11","E1-13","E1-15","E1-21","E1-22","E1-46","E1-47","E2-17","E2-21","E2-22","E2-23","E2-24","E2-25","E2-26","E2-27","E2-28","E3-8","E3-9","E3-11","I1-4","I1-5" ],
    PM: [ "E1-26","E1-28","E1-30","E1-32","E1-34","E1-35","E1-36","E1-37","E1-42","E1-43","E1-44","E1-45","E2-29","E2-30","E2-31","E2-33","E2-34","E2-35","E2-40","E2-41","E3-18","E3-19","E3-21","I1-6","I1-7" ],
    SHARED: [ "E3-22","E3-23","E3-25","I2-1","I2-2","I2-3","I2-4","I2-5","I2-6","I3-1","I3-2","I3-3","C1-1","C1-2","C1-3","C1-4","C1-5","C1-6","C1-7","C1-8","C2-1","C2-2","C2-3","C2-4","C2-5","C3-1","C3-2","C3-3","C3-4","C3-5" ]
};
const catRank = { C: 0, E: 1, I: 2 };
const sortCodes = ( arr ) => arr.slice().sort( ( a, b ) => { const pa = a.match( /([EIC])(\d)-(\d+)/ ), pb = b.match( /([EIC])(\d)-(\d+)/ ); return catRank[pa[1]] - catRank[pb[1]] || pa[2] - pb[2] || pa[3] - pb[3]; } );

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
        const curve = {};
        LEVELS.forEach( ( lv, i ) => { curve[lv] = Number( c[2 + i] ); } );
        curves[id] = curve;
        archMeta[id] = { name: c[1], description: c[14] };
    } else if ( c.length === 4 && /^[EIC][1-3]-\d+$/.test( c[0] ) && /^[A-G]$/.test( c[2] ) ) {
        if ( assign[c[0]] && assign[c[0]] !== c[2] ) issues.push( `conflicting archetype for ${ c[0] }` );
        assign[c[0]] = c[2];
    }
}
for ( const id of [ "A","B","C","D","E","F","G" ] ) {
    if ( !curves[id] ) { issues.push( `missing archetype curve ${ id }` ); continue; }
    for ( const lv of LEVELS ) { const v = curves[id][lv]; if ( !Number.isInteger( v ) || v < 2 || v > 10 ) issues.push( `${ id }.${ lv } = ${ v } (not int 2-10)` ); }
}

// ---- materialize per-family relevancy ----
const relevancy = {};
for ( const fam of [ "SE", "BA", "PM" ] ) {
    relevancy[fam] = {};
    for ( const code of sortCodes( TARGET[fam].concat( TARGET.SHARED ) ) ) {
        const a = assign[code];
        if ( !a ) { issues.push( `${ fam }: no archetype assignment for ${ code }` ); continue; }
        relevancy[fam][code] = { ...curves[a] };
    }
}

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

if ( issues.length ) { console.error( "ABORT — model parse/validation issues:\n  " + issues.join( "\n  " ) ); process.exit( 1 ); }

const relRaw = rd( REL_FILE );
fs.writeFileSync( REL_FILE, JSON.stringify( relevancy, null, 2 ) + ( relRaw.endsWith( "\n" ) ? "\n" : "" ), "utf8" );

const labelsRaw = rd( LABELS_FILE );
const labels = JSON.parse( labelsRaw );
const archName = {}, archDesc = {};
for ( const id of [ "A","B","C","D","E","F","G" ] ) {
    archName[id] = { en: archMeta[id].name, bg: archBg[id].name };
    archDesc[id] = { en: archMeta[id].description, bg: archBg[id].description };
}
labels["relevancy-archetype"] = { name: archName, description: archDesc };
fs.writeFileSync( LABELS_FILE, JSON.stringify( labels, null, 2 ) + ( labelsRaw.endsWith( "\n" ) ? "\n" : "" ), "utf8" );

const total = [ "SE", "BA", "PM" ].reduce( ( n, f ) => n + Object.keys( relevancy[f] ).length, 0 );
console.log( `Wrote ${ total } relevancy rows (SE ${ Object.keys( relevancy.SE ).length }, BA ${ Object.keys( relevancy.BA ).length }, PM ${ Object.keys( relevancy.PM ).length }) and 7 archetype labels.` );
