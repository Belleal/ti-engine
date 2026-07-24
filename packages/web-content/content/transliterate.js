/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Transliteration and slug generation using the Streamlined System -- Bulgaria's official 2009 romanisation standard
 * (so slugs match passports and road signs rather than being ad hoc). Pure and deterministic: transliteration is run
 * exactly once, when a slug is first created (Site/docs/content-schemas.md §8), and `path` is then stored explicit
 * data -- so it never re-runs and can never silently move a live URL. Keep it deterministic; a change here is a
 * change to every future slug.
 */

// Streamlined System, lower-case Cyrillic -> Latin (Bulgarian alphabet only; no Russian ы/э/ё).
const CYRILLIC_MAP = new Map( [
    [ "а", "a" ], [ "б", "b" ], [ "в", "v" ], [ "г", "g" ], [ "д", "d" ], [ "е", "e" ], [ "ж", "zh" ], [ "з", "z" ],
    [ "и", "i" ], [ "й", "y" ], [ "к", "k" ], [ "л", "l" ], [ "м", "m" ], [ "н", "n" ], [ "о", "o" ], [ "п", "p" ],
    [ "р", "r" ], [ "с", "s" ], [ "т", "t" ], [ "у", "u" ], [ "ф", "f" ], [ "х", "h" ], [ "ц", "ts" ], [ "ч", "ch" ],
    [ "ш", "sh" ], [ "щ", "sht" ], [ "ъ", "a" ], [ "ь", "y" ], [ "ю", "yu" ], [ "я", "ya" ]
] );

// Apostrophe forms that are stripped (joined), not turned into a separator: straight, typographic left/right,
// and the modifier-letter apostrophe.
const APOSTROPHES = /['‘’ʼ]/g;

/**
 * Romanises Cyrillic text via the Streamlined System, preserving case (an upper-case letter capitalises its
 * romanisation, e.g. `Ж` -> `Zh`). Non-Cyrillic characters pass through unchanged.
 *
 * @param {string} text
 * @returns {string}
 */
function transliterate( text ) {
    if ( text === null || text === undefined ) {
        return "";
    }
    let result = "";
    for ( const character of String( text ) ) {
        const lower = character.toLowerCase();
        const mapped = CYRILLIC_MAP.get( lower );
        if ( mapped === undefined ) {
            result += character;
        } else if ( character === lower ) {
            result += mapped;
        } else {
            result += mapped.charAt( 0 ).toUpperCase() + mapped.slice( 1 );
        }
    }
    return result;
}

/**
 * Generates a URL slug: transliterate, lower-case, strip apostrophes, then collapse every run of non-alphanumerics
 * to a single hyphen and trim hyphens from the ends.
 *
 * @param {string} text
 * @returns {string}
 */
function slugify( text ) {
    const romanised = transliterate( text ).toLowerCase();
    const withoutApostrophes = romanised.replace( APOSTROPHES, "" );
    const hyphenated = withoutApostrophes.replace( /[^a-z0-9]+/g, "-" );
    return hyphenated.replace( /^-+/, "" ).replace( /-+$/, "" );
}

module.exports = {
    transliterate: transliterate,
    slugify: slugify
};
