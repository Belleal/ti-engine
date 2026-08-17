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

/*
 * Tests for the Streamlined System (Bulgaria's official 2009 romanisation) transliteration and slug generation.
 * The load-bearing invariant is stability: the same input must always yield the same slug, forever — transliteration
 * runs once, when a slug is first created (Site/docs/content-schemas.md §8), so a change here would silently move
 * live URLs.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { transliterate, slugify } = require( "#transliterate" );

describe( "transliterate — Streamlined System letter mapping", () => {

    it( "maps the digraph and special letters", () => {
        assert.equal( transliterate( "ж" ), "zh" );
        assert.equal( transliterate( "щ" ), "sht" );
        assert.equal( transliterate( "ц" ), "ts" );
        assert.equal( transliterate( "ч" ), "ch" );
        assert.equal( transliterate( "ш" ), "sh" );
        assert.equal( transliterate( "ю" ), "yu" );
        assert.equal( transliterate( "я" ), "ya" );
        assert.equal( transliterate( "ъ" ), "a" );
        assert.equal( transliterate( "ь" ), "y" );
    } );

    it( "capitalises the romanisation of an upper-case Cyrillic letter", () => {
        assert.equal( transliterate( "Ж" ), "Zh" );
        assert.equal( transliterate( "Щ" ), "Sht" );
        assert.equal( transliterate( "Анаранд" ), "Anarand" );
    } );

    it( "passes Latin text and digits through unchanged", () => {
        assert.equal( transliterate( "Hello World 2" ), "Hello World 2" );
    } );

    it( "tolerates null / undefined", () => {
        assert.equal( transliterate( null ), "" );
        assert.equal( transliterate( undefined ), "" );
    } );

} );

describe( "slugify — lowercase, strip apostrophes, collapse to hyphens", () => {

    it( "reproduces the reference slugs", () => {
        assert.equal( slugify( "Кратки разкази" ), "kratki-razkazi" );
        assert.equal( slugify( "Кратка история" ), "kratka-istoriya" );
        assert.equal( slugify( "Тъмни намерения" ), "tamni-namereniya" );
    } );

    it( "strips apostrophes (straight and typographic) rather than hyphenating them", () => {
        assert.equal( slugify( "Anarand'aris" ), "anarandaris" );
        assert.equal( slugify( "Anarand’aris" ), "anarandaris" );
    } );

    it( "collapses runs of non-alphanumerics and trims the ends", () => {
        assert.equal( slugify( "Dark Intent!" ), "dark-intent" );
        assert.equal( slugify( "  Foo — Bar  " ), "foo-bar" );
        assert.equal( slugify( "beta-2" ), "beta-2" );
    } );

    it( "returns empty for empty or all-separator input", () => {
        assert.equal( slugify( "" ), "" );
        assert.equal( slugify( "—''—" ), "" );
    } );

    it( "is stable — the same input always yields the same slug", () => {
        for ( const input of [ "Кратки разкази", "Anarand'aris", "Dark Intent!", "Тъмни намерения" ] ) {
            assert.equal( slugify( input ), slugify( input ) );
        }
    } );

} );
