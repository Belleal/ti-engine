/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Employee-import screen localization guard (CA-108).
 *
 * `appliedSummary()` and `pendingSummary()` used to build their text by concatenating counts with English literals
 * (`counts.create + " to create, " + ...`). Those two strings are the panel subtitle, the confirmation modal body
 * and the post-apply pill — the three places an operator reads what an import did or is about to do — so a
 * Bulgarian operator read the outcome of an irreversible write in English, and nothing reported it: the page looks
 * correct, the text is simply in the wrong language.
 *
 * This is the same class CA-106 closed for the grade pills, and it is closed the same way: not by pinning the two
 * strings, but by asserting no count phrase is assembled in JavaScript at all, and that each label's placeholders
 * agree exactly with the ones the code substitutes — in every language. A bg translation that drops `{rejected}`
 * or renames it silently leaves a literal `{rejected}` on screen, which no assertion on the en text would catch.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const LANGUAGES = [ "en", "bg" ];
const labels = require( "../bin/localization/competence-labels.json" );
const script = fs.readFileSync(
    path.join( PACKAGE_ROOT, "bin", "static", "scripts", "competence-user-interface.js" ), "utf8"
);

/**
 * The body of one method of the employee-import Alpine component, from its name to the next method's.
 *
 * @param {string} name
 * @returns {string}
 */
function methodBody( name ) {
    const component = script.slice( script.indexOf( "function configureEmployeeImport()" ) );
    const start = component.indexOf( `${ name }() {` );
    assert.notEqual( start, -1, `configureEmployeeImport has no ${ name }() — was it renamed?` );
    return component.slice( start, component.indexOf( "\n        },", start ) );
}

/**
 * Placeholder tokens (`{create}`, `{skipped}`, …) in a string, deduplicated.
 *
 * @param {string} text
 * @returns {Array<string>}
 */
function placeholders( text ) {
    return [ ...new Set( [ ...String( text ).matchAll( /\{[a-z]+\}/g ) ].map( ( match ) => match[ 0 ] ) ) ].sort();
}

/**
 * A label leaf from the interface.employee-import branch.
 *
 * @param {string} key
 * @returns {Object}
 */
function importLabel( key ) {
    const leaf = labels.interface[ "employee-import" ][ key ];
    assert.ok( leaf, `interface.employee-import.${ key } is missing from competence-labels.json` );
    return leaf;
}

describe( "Employee-import screen localization", () => {

    const SUMMARIES = [
        { method: "appliedSummary", key: "applied-summary" },
        { method: "pendingSummary", key: "pending-summary" }
    ];

    for ( const summary of SUMMARIES ) {

        it( `${ summary.method }() assembles no English text of its own`, () => {
            const body = methodBody( summary.method );
            assert.ok( body.includes( `interface.employee-import.${ summary.key }` ),
                `${ summary.method }() must read its phrasing from interface.employee-import.${ summary.key }` );
            // A count concatenated onto a quoted word is the exact shape of the original defect. The fallback
            // string passed to getLabel is allowed to carry English — that is what a fallback is — so only
            // concatenation onto a count is rejected, not the presence of English anywhere in the method.
            assert.doesNotMatch( body, /(counts|applied)\.[a-zA-Z]+ \+ "/,
                `${ summary.method }() concatenates a count onto a literal instead of substituting into the label` );
        } );

        it( `${ summary.key } carries the same placeholders as the code substitutes, in every language`, () => {
            const substituted = placeholders( methodBody( summary.method ).match( /\.replace\([\s\S]*/ )[ 0 ] );
            assert.ok( substituted.length > 0, `${ summary.method }() substitutes nothing` );
            const leaf = importLabel( summary.key );
            for ( const language of LANGUAGES ) {
                assert.ok( leaf[ language ] && leaf[ language ].trim().length > 0,
                    `interface.employee-import.${ summary.key }.${ language } is missing or empty` );
                assert.deepEqual( placeholders( leaf[ language ] ), substituted,
                    `interface.employee-import.${ summary.key }.${ language } does not use exactly the placeholders the code replaces — an unmatched one renders literally` );
            }
        } );
    }

    it( "gives the CSV file input a localized accessible name", () => {
        // The input carries no visible text of its own, so this label IS its accessible name. An unlabeled file
        // input is announced only as "button" or "file upload" by a screen reader.
        const fragment = fs.readFileSync(
            path.join( PACKAGE_ROOT, "bin", "static", "fragments", "frame-employee-import.html" ), "utf8"
        );
        assert.match( fragment, /<label class="ti-field-label" for="employee-import-file" x-text-label="interface\.employee-import\.file-label"/,
            "the file input's <label> must exist and be associated with it by for/id" );
        assert.match( fragment, /<input class="ti-input" id="employee-import-file"/,
            "the file input must carry the id its <label> points at" );
        const leaf = importLabel( "file-label" );
        for ( const language of LANGUAGES ) {
            assert.ok( leaf[ language ] && leaf[ language ].trim().length > 0,
                `interface.employee-import.file-label.${ language } is missing or empty` );
        }
    } );

} );
