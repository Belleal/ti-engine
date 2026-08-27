/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Confusable work-site codes (CA-109).
 *
 * The real HR data mixes alphabets: the Stara Zagora office is 'О5', beginning with CYRILLIC О (U+041E), while
 * every other code uses LATIN O (U+004F). The two render identically in every font and compare unequal.
 *
 * Without this, an unknown-code rejection lists the permitted codes — so the operator is shown 'O5' as permitted,
 * pixel-identical to the 'О5' they typed, with no way to see the difference. Folding exists to phrase that error,
 * and for nothing else: the value stays REJECTED. Accepting a Cyrillic О as a Latin O would be the synonym table
 * mapRow forbids, and would write a person to the wrong site rather than telling anyone.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

const CYRILLIC_O5 = "О5";
const LATIN_O5 = "O5";

describe( "foldConfusables", () => {

    it( "folds a Cyrillic О onto a Latin O", () => {
        assert.equal( organizationImport.instance.foldConfusables( CYRILLIC_O5 ), LATIN_O5 );
    } );

    it( "leaves an all-Latin code untouched", () => {
        assert.equal( organizationImport.instance.foldConfusables( LATIN_O5 ), LATIN_O5 );
    } );

    it( "folds every pair in the table", () => {
        assert.equal( organizationImport.instance.foldConfusables( "АВЕКМНОРСТУХ" ), "ABEKMHOPCTYX" );
    } );

    it( "leaves a Cyrillic letter with no Latin lookalike alone", () => {
        // Ж, Ъ, Щ and friends are not confusable with anything and must not be mangled.
        assert.equal( organizationImport.instance.foldConfusables( "ЖЪЩ" ), "ЖЪЩ" );
    } );

    it( "tolerates a non-string", () => {
        assert.equal( organizationImport.instance.foldConfusables( null ), "" );
        assert.equal( organizationImport.instance.foldConfusables( undefined ), "" );
    } );

} );

describe( "describeWorkSiteMiss", () => {

    const SITES = { O5: { id: "O5", type: "office", name: { en: "x", bg: "x" } }, HQ: { id: "HQ", type: "office", name: { en: "y", bg: "y" } } };

    it( "names the confusable character when the code folds onto a real one", () => {
        const detail = organizationImport.instance.describeWorkSiteMiss( CYRILLIC_O5, SITES );
        assert.equal( detail.code, "confusable-character" );
        assert.equal( detail.match, LATIN_O5 );
    } );

    it( "reports a plain miss as a plain miss", () => {
        const detail = organizationImport.instance.describeWorkSiteMiss( "ZZ9", SITES );
        assert.equal( detail.code, "unknown-work-site" );
        assert.equal( detail.match, null );
    } );

    it( "does not claim a confusable when the code already matches", () => {
        assert.equal( organizationImport.instance.describeWorkSiteMiss( "O5", SITES ), null );
    } );

    it( "never treats folding as acceptance", () => {
        // The whole point: this reports, it does not resolve. The caller must still reject the value.
        const detail = organizationImport.instance.describeWorkSiteMiss( CYRILLIC_O5, SITES );
        assert.notEqual( detail, null, "a confusable code is still a miss" );
    } );

} );

describe( "a confusable code end to end", () => {

    it( "rejects the row and explains the character rather than listing lookalikes", () => {
        const employee = {
            employeeID: "1", email: "a@b.com", employmentStatus: "active",
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: CYRILLIC_O5 },
            career: { organizationUnitID: "1", roleFamily: "SE", specialization: null, level: "R", stage: 2 }
        };
        const plan = organizationImport.instance.reconcile( [ employee ], [], {
            roleFamilies: { SE: { specializations: {} } },
            organizationStructure: { "1": { id: "1" } },
            workSites: { O5: { id: "O5", type: "office", name: { en: "x", bg: "x" } } }
        } );
        assert.equal( plan.rejected.length, 1, "the value is rejected, never folded into a match" );
        assert.equal( plan.create.length, 0 );
        assert.match( plan.rejected[ 0 ].message, /Cyrillic/ );
        assert.match( plan.rejected[ 0 ].message, /Latin/ );
    } );

} );
