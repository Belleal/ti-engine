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
 * Builds a ValidatorContext whose getStoredConfig returns the supplied stored document for the "research-consent"
 * key — the accessor consentTextVersionBumped actually reads (see config-service.test.js / research-consent.live.test.js
 * for why getConfig would be wrong here: research-consent is always part of its own edit batch, so getConfig would
 * resolve to the pending value under validation, not its prior state).
 */
function contextWith( stored ) {
    return {
        getStoredConfig: ( key ) => Promise.resolve( key === "research-consent" ? stored : null )
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

    it( "rejects adding a locale without bumping the version", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "A" }, bg: { body: "Б" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "consent-version" );
        assert.equal( issues[ 0 ].path, ".text.bg" );
    } );

    it( "accepts adding a locale with a bumped version", async () => {
        const stored = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        const incoming = { enabled: true, version: "1.1", text: { en: { body: "A" }, bg: { body: "Б" } } };
        const issues = await validators.consentTextVersionBumped( incoming, contextWith( stored ) );
        assert.deepEqual( issues, [] );
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

    it( "fails closed when the context does not provide getStoredConfig", async () => {
        const incoming = { enabled: true, version: "1.0", text: { en: { body: "A" } } };
        // A context shaped like the pre-fix ValidatorContext (getConfig only) must not be silently treated as "no
        // prior state to check" — that is exactly how the original defect (comparing an edit against itself)
        // survived undetected. Absence of getStoredConfig is a blocking issue, not a pass.
        const legacyContext = { getConfig: () => Promise.resolve( null ) };
        const issues = await validators.consentTextVersionBumped( incoming, legacyContext );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "consent-version" );
    } );

} );
