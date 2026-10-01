/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/**
 * Covers `tiToolbox.formatDate`: a date is written in the page's own language, `<html lang>`, and never in the
 * browser's (CA-333).
 * <br/>
 * Up to 1.43.0 it called `toLocaleDateString()` with no locale, so the browser chose. A Bulgarian interface opened in
 * an en-US browser wrote "7/1/2026" between Bulgarian words, and two people reading the same screen saw the same date
 * in two orders. The sandbox's own default locale stands in for that browser: it is en-US here and on CI, which is
 * exactly the case that went wrong.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

/**
 * The framework's toolbox on a page that declares the given language.
 *
 * @method
 * @param {string} [lang] - The document's `lang`; none when omitted.
 * @returns {Object}
 * @private
 */
function toolboxOnPage( lang ) {
    const { stores, sandbox } = loadTiFramework();
    if ( lang !== undefined ) {
        sandbox.document.documentElement.lang = lang;
    }
    return stores.tiToolbox;
}

describe( "tiToolbox.formatDate — in the page's language, never the browser's", () => {

    it( "writes a Bulgarian page's dates in Bulgarian, whatever the browser's locale", () => {
        assert.equal( toolboxOnPage( "bg" ).formatDate( "2026-07-01" ), "1.07.2026 г." );
    } );

    it( "writes the month as a word, so day and month cannot be read the wrong way round", () => {
        assert.equal( toolboxOnPage( "en-GB" ).formatDate( "2026-07-01" ), "1 Jul 2026" );
        assert.equal( toolboxOnPage( "en" ).formatDate( "2026-07-01" ), "Jul 1, 2026" );
        assert.equal( toolboxOnPage( "en-GB" ).formatDate( "2026-12-31T23:30:00" ), "31 Dec 2026" );
    } );

    it( "keeps the browser's locale on a page that declares no language", () => {
        const expected = new Date( "2026-07-01T00:00:00" ).toLocaleDateString( undefined, { day: "numeric", month: "short", year: "numeric" } );

        assert.equal( toolboxOnPage().formatDate( "2026-07-01" ), expected );
        assert.equal( toolboxOnPage( "" ).formatDate( "2026-07-01" ), expected );
    } );

    it( "still writes the date when the page's lang is not a language tag Intl accepts", () => {
        // "en_GB" makes Intl throw a RangeError; the date is shown the way it was before rather than not at all.
        assert.equal( toolboxOnPage( "en_GB" ).formatDate( "2026-07-01" ), new Date( "2026-07-01T00:00:00" ).toLocaleDateString() );
    } );

    it( "keeps the placeholder for no value and for a value that is not a date", () => {
        const tiToolbox = toolboxOnPage( "bg" );

        assert.equal( tiToolbox.formatDate( "" ), "" );
        assert.equal( tiToolbox.formatDate( null, "—" ), "—" );
        assert.equal( tiToolbox.formatDate( "not a date", "—" ), "—" );
    } );

} );
