/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Grade-pill accessible-name guard (CA-106).
 *
 * An editable grade pill renders a single grade letter and nothing else, so its `aria-label` IS its accessible name —
 * a screen reader announces that string and no other. All four pill groups used to build it by concatenating an
 * English literal (`'Self grade for ' + item.id + ': ' + gradeKey`), which meant a Bulgarian reader heard the one part
 * of the grading table that never got translated, and nothing anywhere reported it: the page looks correct, the text
 * is simply in the wrong language for a user who cannot see it.
 *
 * This closes the class rather than the four instances. A new pill group added with a hand-built literal fails here,
 * as does a role wired up without a matching label, or a label that loses one of its placeholders.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const LANGUAGES = [ "en", "bg" ];
const labels = require( "../bin/localization/competence-labels.json" );
const fragment = fs.readFileSync(
    path.join( PACKAGE_ROOT, "bin", "static", "fragments", "frame-competence-evaluation.html" ), "utf8"
);

/**
 * The grade sources referenced by the editable pill bindings, e.g. `[ "team", "employee", "manager" ]`.
 *
 * @returns {Array<string>}
 */
function referencedRoles() {
    return [ ...new Set( [ ...fragment.matchAll( /getGradeSelectAria\(\s*[a-z.]+,\s*'([a-z]+)'/g ) ].map( ( m ) => m[ 1 ] ) ) ];
}

describe( "Grade-pill accessible names", () => {

    it( "binds every editable grade pill through the localized helper, never a hand-built string", () => {
        // An aria-label opening with a quote is a JS string literal rather than a call — the shape being retired here.
        const literals = [ ...fragment.matchAll( /x-bind:aria-label="('[^"]*)"/g ) ].map( ( match ) => match[ 1 ] );
        assert.deepEqual( literals, [], `hand-built aria-label(s) found: ${ literals.join( " | " ) }` );
    } );

    it( "covers all three grade sources", () => {
        assert.deepEqual( referencedRoles().sort(), [ "employee", "manager", "team" ] );
    } );

    it( "has a label for every referenced source, in every language, carrying both placeholders", () => {
        const missing = [];
        for ( const role of referencedRoles() ) {
            const entry = labels.interface?.evaluation?.[ "grade-select-aria" ]?.[ role ];
            if ( !entry ) {
                missing.push( `${ role }: no interface.evaluation.grade-select-aria entry` );
                continue;
            }
            for ( const language of LANGUAGES ) {
                const text = entry[ language ];
                if ( !text ) {
                    missing.push( `${ role }.${ language }: missing` );
                } else if ( !text.includes( "{code}" ) || !text.includes( "{grade}" ) ) {
                    // Substitution is a plain replace, so a dropped placeholder silently announces a half-built name.
                    missing.push( `${ role }.${ language }: must contain {code} and {grade} — got "${ text }"` );
                }
            }
        }
        assert.deepEqual( missing, [], `Grade-pill aria labels incomplete:\n  ${ missing.join( "\n  " ) }` );
    } );

    it( "keeps the sources distinguishable — a reader must be able to tell which column a pill belongs to", () => {
        for ( const language of LANGUAGES ) {
            const rendered = referencedRoles().map(
                ( role ) => labels.interface.evaluation[ "grade-select-aria" ][ role ][ language ]
            );
            assert.equal( new Set( rendered ).size, rendered.length, `${ language }: two sources share the same label` );
        }
    } );

} );
