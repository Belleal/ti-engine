/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const validators = require( "../application/config-validators" );

/**
 * Builds a ValidatorContext whose getConfig returns the supplied stored document for the "research-consent" key.
 */
function contextWith( stored ) {
    return {
        getConfig: ( key ) => Promise.resolve( key === "research-consent" ? stored : null )
    };
}

describe( "consentTextVersionBumped validator", () => {

    it( "accepts an unchanged document", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "Statement A" } } };
        const issues = await validators.consentTextVersionBumped( stored, contextWith( stored ) );
        assert.deepEqual( issues, [] );
    } );

    it( "accepts a text change when the version is bumped", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "Statement A" } } };
        const incoming = { enabled: true, version: "1.1", text: { en: { body: "Statement B" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.deepEqual( issues, [] );
    } );

    it( "rejects a text change that leaves the version untouched", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "Statement A" } } };
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "Statement B" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "consent-version" );
        assert.equal( issues[ 0 ].path, ".text.en.body" );
    } );

    it( "rejects removing a locale without bumping the version", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "A" }, bg: { body: "Б" } } };
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].path, ".text.bg" );
    } );

    it( "accepts any version when nothing is stored yet (first seed)", async () => {
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( null ) );
        assert.deepEqual( issues, [] );
    } );

    it( "allows toggling `enabled` without a version bump", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const incoming = { enabled: false, version: "1.0", text: { en: { body: "A" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.deepEqual( issues, [] );
    } );

} );
