/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const cache = require( "@ti-engine/core/cache" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const dataManager = require( "#data-manager" );

const CYCLE = "2026-H2";
const HASH_A = "a".repeat( 64 );
const HASH_B = "b".repeat( 64 );

function record( overrides ) {
    return Object.assign( {
        recordID: "r1",
        decision: "granted",
        decidedAt: "2026-08-01T10:00:00.000Z",
        decidedBy: "7",
        textHash: HASH_A,
        textVersion: "1.0",
        locale: "en",
        source: "evaluation-submit",
        supersedes: null
    }, overrides || {} );
}

function text( overrides ) {
    return Object.assign( {
        locale: "en",
        version: "1.0",
        body: "Statement A",
        firstSeenAt: "2026-08-01T10:00:00.000Z"
    }, overrides || {} );
}

describe( "DataManager research-consent store", () => {

    beforeEach( async () => {
        installInMemoryCache();
        await dataManager.instance.initialize();
    } );

    it( "seeds the store shape on initialize", async () => {
        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.deepEqual( chain, [] );
    } );

    it( "persists a decision and reads it back", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.equal( chain.length, 1 );
        assert.equal( chain[ 0 ].recordID, "r1" );
        assert.equal( chain[ 0 ].decision, "granted" );
    } );

    it( "appends rather than overwriting — the original grant survives a withdrawal", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( {
            recordID: "r2",
            decision: "declined",
            decidedAt: "2026-08-05T10:00:00.000Z",
            supersedes: "r1"
        } ), text(), "granted" );

        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.equal( chain.length, 2 );
        assert.deepEqual( chain.map( ( entry ) => entry.recordID ), [ "r1", "r2" ] );
        assert.equal( chain[ 1 ].supersedes, "r1" );
    } );

    it( "returns the chain sorted ascending by decidedAt regardless of write order", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "late", decidedAt: "2026-09-01T10:00:00.000Z" } ), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "early", decidedAt: "2026-08-01T10:00:00.000Z" } ), text(), null );
        const chain = await dataManager.instance.fetchConsentChain( "7", CYCLE );
        assert.deepEqual( chain.map( ( entry ) => entry.recordID ), [ "early", "late" ] );
    } );

    it( "registers the consent text once and preserves the original firstSeenAt", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "8", CYCLE, record( { recordID: "r9", decidedBy: "8", decidedAt: "2026-08-09T10:00:00.000Z" } ), text( { firstSeenAt: "2026-08-09T10:00:00.000Z" } ), null );

        const stored = await dataManager.instance.fetchConsentText( HASH_A );
        assert.equal( stored.body, "Statement A" );
        assert.equal( stored.firstSeenAt, "2026-08-01T10:00:00.000Z", "the second write must not re-stamp an existing text entry" );
    } );

    it( "stores distinct texts under distinct hashes", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "r2", textHash: HASH_B, textVersion: "1.1", decidedAt: "2026-08-05T10:00:00.000Z" } ), text( { version: "1.1", body: "Statement B" } ), "granted" );

        assert.equal( ( await dataManager.instance.fetchConsentText( HASH_A ) ).body, "Statement A" );
        assert.equal( ( await dataManager.instance.fetchConsentText( HASH_B ) ).body, "Statement B" );
    } );

    it( "returns null for an unknown text hash", async () => {
        assert.equal( await dataManager.instance.fetchConsentText( HASH_B ), null );
    } );

    it( "keeps cycles separate", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        assert.deepEqual( await dataManager.instance.fetchConsentChain( "7", "2027-H1" ), [] );
    } );

    it( "fetchConsentDecisions returns every employee's chain for one cycle", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "8", CYCLE, record( { recordID: "r8", decision: "declined", decidedBy: "8" } ), text(), null );
        await dataManager.instance.saveConsentDecision( "7", "2027-H1", record( { recordID: "r7b" } ), text(), null );

        const decisions = await dataManager.instance.fetchConsentDecisions( CYCLE );
        assert.deepEqual( Object.keys( decisions ).sort(), [ "7", "8" ] );
        assert.equal( decisions[ "7" ].length, 1 );
        assert.equal( decisions[ "8" ][ 0 ].decision, "declined" );
    } );

    it( "fetchConsentHistory returns every cycle for one employee", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", "2027-H1", record( { recordID: "r7b" } ), text(), null );

        const history = await dataManager.instance.fetchConsentHistory( "7" );
        assert.deepEqual( Object.keys( history ).sort(), [ "2026-H2", "2027-H1" ] );
    } );

    it( "writes an employee-scoped audit entry carrying the prior decision", async () => {
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null );
        await dataManager.instance.saveConsentDecision( "7", CYCLE, record( { recordID: "r2", decision: "declined", decidedAt: "2026-08-05T10:00:00.000Z" } ), text(), "granted" );

        const entries = await dataManager.instance.getAuditEntriesForEmployee( "7" );
        const consentEntries = entries.filter( ( entry ) => entry.field === `researchConsent.${ CYCLE }` );
        assert.equal( consentEntries.length, 2 );
        const newest = consentEntries[ 0 ];
        assert.equal( newest.newValue, "declined" );
        assert.equal( newest.oldValue, "granted" );
        assert.equal( newest.changedBy, "7" );
    } );

    it( "rejects when the cache is unavailable — an unprovable consent must fail loudly", async () => {
        installInMemoryCache();
        await dataManager.instance.initialize();
        Object.defineProperty( cache.instance, "isOperational", { value: false, configurable: true } );

        await assert.rejects( () => dataManager.instance.saveConsentDecision( "7", CYCLE, record(), text(), null ) );
    } );

    it( "rejects a write with missing identifiers", async () => {
        await assert.rejects( () => dataManager.instance.saveConsentDecision( "", CYCLE, record(), text(), null ) );
        await assert.rejects( () => dataManager.instance.saveConsentDecision( "7", "", record(), text(), null ) );
        await assert.rejects( () => dataManager.instance.saveConsentDecision( "7", CYCLE, null, text(), null ) );
    } );

} );
