/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Namespace guard: a stage sub-level and a performance band must never share a token (CA-111).
 *
 * They did. `T1`..`T5` were the performance-threshold bands while `T1` was also the Team Lead stage sub-level, and
 * both meanings lived in results-analytics.js a few lines apart. That was survivable only because nothing crossed
 * the two namespaces; adding `T2` as a Head-of-Department sub-level would have made the SAME token mean
 * "Head of Department" and "performance band 2" in one file. The bands were renamed to `P1`..`P5`.
 *
 * This test exists so the collision cannot come back quietly — from a new stage letter, a sixth band, or a rename
 * in either direction.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const fs = require( "node:fs" );
const path = require( "node:path" );

const configurationLoader = require( "#configuration-loader" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const WEB_APPLICATION_FILE = path.join( PACKAGE_ROOT, "bin", "competence-web-application.js" );
const UI_SCRIPT_FILE = path.join( PACKAGE_ROOT, "bin", "static", "scripts", "competence-user-interface.js" );

/**
 * Returns the band keys of a `performanceThresholds` fallback object literal, or null when the source carries no
 * such fallback. The fallback is the `|| { ... }` arm following the setting lookup.
 *
 * @param {string} source - File contents to scan.
 * @returns {Array<string>|null} The declared band keys, or null when there is no fallback to check.
 */
function fallbackBandKeys( source ) {
    const match = /performanceThresholds[^{]*\|\|\s*\{([^}]*)\}/.exec( source );
    return match ? ( match[ 1 ].match( /([A-Z]\d+)\s*:/g ) || [] ).map( ( key ) => key.replace( /\s*:$/, "" ) ) : null;
}

/**
 * Returns the configured performance band codes.
 *
 * @returns {Array<string>} Band codes such as `P1`..`P5`.
 */
function configuredBands() {
    return Object.keys( configurationLoader.performanceThreshold ).filter( ( key ) => /^[A-Z]\d+$/.test( key ) );
}

describe( "Stage sub-levels and performance bands occupy separate namespaces", () => {

    it( "shares no token between the two vocabularies", () => {
        const stageLevels = configurationLoader.getArchetypeStageLevels();
        const bands = Object.keys( configurationLoader.performanceThreshold ).filter( ( k ) => /^[A-Z]\d+$/.test( k ) );
        assert.ok( stageLevels.length > 0, "the stage ladder must produce sub-levels" );
        assert.ok( bands.length > 0, "the threshold enum must expose bands" );

        const shared = stageLevels.filter( ( level ) => bands.includes( level ) );
        assert.deepEqual( shared, [], `these tokens mean two different things: ${ shared.join( ", " ) }` );
    } );

    it( "keeps the two vocabularies on different letters entirely", () => {
        // Stronger than the overlap check: even a non-overlapping T3 band would be confusing next to T1/T2
        // sub-levels, so the letter itself must not be reused.
        const stageLetters = new Set( configurationLoader.getArchetypeStageLevels().map( ( l ) => l.replace( /\d+$/, "" ) ) );
        const bandLetters = new Set( Object.keys( configurationLoader.performanceThreshold )
            .filter( ( k ) => /^[A-Z]\d+$/.test( k ) ).map( ( b ) => b.replace( /\d+$/, "" ) ) );
        const overlap = [ ...bandLetters ].filter( ( letter ) => stageLetters.has( letter ) );
        assert.deepEqual( overlap, [], `letter reused across both vocabularies: ${ overlap.join( ", " ) }` );
    } );

    it( "keeps every hard-coded threshold fallback on the configured band vocabulary", () => {
        // The rename reached the configuration and the server enum but left `T1`..`T5` behind in two fallback
        // literals — one per tier. Neither arm is normally reached, so no existing test noticed.
        const bands = configuredBands().slice().sort();
        for ( const file of [ WEB_APPLICATION_FILE, UI_SCRIPT_FILE ] ) {
            const declared = fallbackBandKeys( fs.readFileSync( file, "utf8" ) );
            if ( declared === null ) {
                continue;
            }
            assert.deepEqual( declared.slice().sort(), bands,
                `${ path.basename( file ) } falls back on bands the configuration does not define` );
        }
    } );

    it( "returns a configured band from the client-side cascade's terminal arm", () => {
        // `tBand()` exhausts the ascending cascade for any score above the top threshold and returns a literal.
        // That arm is live for every top performer, and it returned the pre-rename `T5` well after the rename.
        const source = fs.readFileSync( UI_SCRIPT_FILE, "utf8" );
        const cascade = /tBand\s*\([^)]*\)\s*\{[\s\S]*?\n {8}\},/.exec( source );
        assert.ok( cascade, "the client-side band cascade must be present" );

        const returned = ( cascade[ 0 ].match( /return\s+"([A-Z]\d+)"/g ) || [] )
            .map( ( statement ) => statement.replace( /^return\s+"/, "" ).replace( /"$/, "" ) );
        assert.ok( returned.length > 0, "the cascade must return at least one literal band" );

        const bands = configuredBands();
        const unknown = returned.filter( ( band ) => !bands.includes( band ) );
        assert.deepEqual( unknown, [], `the cascade returns bands the configuration does not define: ${ unknown.join( ", " ) }` );
    } );

    it( "keeps the client-side stage ladder in step with the configured one", () => {
        // The archetype-assignment editor restates the sub-levels rather than reading them from its view, so a new
        // sub-level stays invisible there until the literal is updated. `T2` was missing for exactly that reason.
        const source = fs.readFileSync( UI_SCRIPT_FILE, "utf8" );
        const declared = /const STAGE_LEVELS = \[([^\]]*)\]/.exec( source );
        assert.ok( declared, "the client must declare its stage-level list" );

        const levels = ( declared[ 1 ].match( /"([^"]+)"/g ) || [] ).map( ( level ) => level.replace( /"/g, "" ) );
        assert.deepEqual( levels, configurationLoader.getArchetypeStageLevels(),
            "the client stage list has drifted from the configured ladder" );
    } );

} );
