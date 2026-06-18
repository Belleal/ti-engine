/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Content-integrity guard. Every competency that the framework can surface in an evaluation must have complete,
 * non-empty localized content — name, description, and all six scope anchors — in BOTH languages. This is the check
 * that would have caught the original failure this rebuild fixed (a role family whose competencies had empty
 * descriptions and scope). It complements json-config-validation.test.js, which checks structure and references but
 * not whether the referenced localization keys actually resolve to non-empty text.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const CONFIG_DIR = path.join( path.resolve( __dirname, ".." ), "bin", "config" );
const LABELS_PATH = path.join( path.resolve( __dirname, ".." ), "bin", "localization", "competence-labels.json" );
const SCOPE_LEVELS = [ "N", "J", "R", "S", "X", "T" ];

function readJSON( filePath ) {
    return JSON.parse( fs.readFileSync( filePath, "utf8" ) );
}

const competencies = readJSON( path.join( CONFIG_DIR, "config.competencies.json" ) ).competencies;
const activeSets = readJSON( path.join( CONFIG_DIR, "config.active-competency-sets.json" ) );
const competencyLabels = readJSON( LABELS_PATH ).competency;

const nonEmpty = ( v ) => typeof v === "string" && v.trim().length > 0;

/**
 * Returns the list of missing/empty localized fields for a competency code (across en and bg), or [] if complete.
 */
function contentGaps( code ) {
    const gaps = [];
    const name = competencyLabels.name[ code ];
    if ( !name || !nonEmpty( name.en ) || !nonEmpty( name.bg ) ) gaps.push( "name" );
    const description = competencyLabels.description[ code ];
    if ( !description || !nonEmpty( description.en ) || !nonEmpty( description.bg ) ) gaps.push( "description" );
    const scope = competencyLabels.scope[ code ] || {};
    for ( const level of SCOPE_LEVELS ) {
        const entry = scope[ level ];
        if ( !entry || !nonEmpty( entry.en ) || !nonEmpty( entry.bg ) ) gaps.push( `scope.${ level }` );
    }
    return gaps;
}

/**
 * Collects every competency code referenced by any active competency set (baseline or specialization, any cycle).
 */
function referencedCodes() {
    const codes = new Set();
    for ( const familyEntry of Object.values( activeSets ) ) {
        for ( const cycleMap of Object.values( familyEntry || {} ) ) {
            for ( const cycleCodes of Object.values( cycleMap || {} ) ) {
                for ( const code of cycleCodes ) codes.add( code );
            }
        }
    }
    return codes;
}

describe( "Competency content integrity", () => {

    it( "every competency referenced by an active set has complete, non-empty en+bg name, description, and scope", () => {
        const failures = [];
        for ( const code of referencedCodes() ) {
            if ( !competencies[ code ] ) {
                failures.push( `${ code }: referenced by an active set but absent from the competency catalog` );
                continue;
            }
            const gaps = contentGaps( code );
            if ( gaps.length ) failures.push( `${ code }: empty/missing ${ gaps.join( ", " ) }` );
        }
        assert.deepEqual( failures, [], `Active-set competencies with incomplete content:\n  ${ failures.join( "\n  " ) }` );
    } );

    it( "every competency in the catalog has complete, non-empty en+bg name, description, and scope", () => {
        const failures = [];
        for ( const code of Object.keys( competencies ) ) {
            const gaps = contentGaps( code );
            if ( gaps.length ) failures.push( `${ code }: empty/missing ${ gaps.join( ", " ) }` );
        }
        assert.deepEqual( failures, [], `Catalog competencies with incomplete content:\n  ${ failures.join( "\n  " ) }` );
    } );

} );
