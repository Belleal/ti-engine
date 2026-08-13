/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const directory = require( "#local-user-directory" );

// Obvious placeholder — never a realistic credential.
const PLACEHOLDER_PASSWORD = "not-a-real-password";

// Structural placeholder only — corresponds to no password. Salt decodes to 16 repeats-of-4 filler bytes
// ("salt" x4) and key to 64 filler bytes ("hash" x16), chosen only to clear decodeHash's minimum lengths
// (>= 8 salt bytes, >= 32 key bytes) with N/r/p left at the ordinary defaults.
const PLACEHOLDER_HASH = "scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA==";

function validEntry( overrides = {} ) {
    return Object.assign( {
        username: "someone",
        email: "someone@example.com",
        name: "Some One",
        passwordHash: PLACEHOLDER_HASH
    }, overrides );
}

describe( "localUserDirectory.parseRecords", () => {

    it( "accepts a valid record and normalizes its optional fields", () => {
        const result = directory.parseRecords( [ validEntry() ] );
        assert.equal( result.problems.length, 0 );
        assert.equal( result.records.length, 1 );
        assert.equal( result.records[ 0 ].username, "someone" );
        assert.equal( result.records[ 0 ].email, "someone@example.com" );
        assert.equal( result.records[ 0 ].disabled, false );
    } );

    it( "defaults userID to local:<username>", () => {
        const result = directory.parseRecords( [ validEntry() ] );
        assert.equal( result.records[ 0 ].userID, "local:someone" );
    } );

    it( "keeps an explicitly provided userID", () => {
        const result = directory.parseRecords( [ validEntry( { userID: "custom-id" } ) ] );
        assert.equal( result.records[ 0 ].userID, "custom-id" );
    } );

    it( "preserves disabled", () => {
        const result = directory.parseRecords( [ validEntry( { disabled: true } ) ] );
        assert.equal( result.records[ 0 ].disabled, true );
    } );

    it( "drops a record with no username, reporting why", () => {
        const result = directory.parseRecords( [ validEntry( { username: undefined } ) ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
        assert.match( result.problems[ 0 ], /username/ );
    } );

    // '__proto__', 'constructor', and 'prototype' collide with property names JavaScript's own object model
    // treats specially. `cache.instance.setJSON` (the real, non-test-double path `reconcile` writes through)
    // cannot represent a '__proto__'-keyed record without corrupting the whole stored directory — see the
    // RESERVED_USERNAMES comment in local-user-directory.js for the mechanism, and the pinning test against
    // the real serializer in local-user-directory.store.test.js. The other two are rejected alongside it for
    // consistency. Rejecting all three here, at load, means the operator sees a clear, specific reason instead
    // of a silently corrupted directory the first time someone is (deliberately or accidentally) named one of
    // them — the message must name the reserved name and say plainly it cannot be stored, not read like a
    // generic "invalid username".
    it( "drops a record whose username is the reserved name '__proto__', naming it as unstorable rather than a typo", () => {
        const result = directory.parseRecords( [ validEntry( { username: "__proto__" } ) ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
        assert.match( result.problems[ 0 ], /__proto__/ );
        assert.match( result.problems[ 0 ], /cannot be stored/i );
    } );

    it( "drops a record whose username is the reserved name 'constructor', naming it as unstorable rather than a typo", () => {
        const result = directory.parseRecords( [ validEntry( { username: "constructor" } ) ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
        assert.match( result.problems[ 0 ], /constructor/ );
        assert.match( result.problems[ 0 ], /cannot be stored/i );
    } );

    it( "drops a record whose username is the reserved name 'prototype', naming it as unstorable rather than a typo", () => {
        const result = directory.parseRecords( [ validEntry( { username: "prototype" } ) ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
        assert.match( result.problems[ 0 ], /prototype/ );
        assert.match( result.problems[ 0 ], /cannot be stored/i );
    } );

    it( "drops a record with no email — the field an application resolves identity by", () => {
        const result = directory.parseRecords( [ validEntry( { email: undefined } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /email/ );
    } );

    it( "drops a record with no passwordHash", () => {
        const result = directory.parseRecords( [ validEntry( { passwordHash: undefined } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash is not a recognized encoding", () => {
        const result = directory.parseRecords( [ validEntry( { passwordHash: "plaintext-oops" } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash key material is too short to trust, even though it decodes cleanly", () => {
        // A truncated copy-paste of the 88-character base64 key still decodes without error — Buffer.from()
        // shortens rather than throwing on incomplete base64 — so only a minimum-length check catches it.
        // This 4-byte-salt/4-byte-key hash is the old fixture value, from before this check existed.
        const result = directory.parseRecords( [ validEntry( { passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==" } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash requests a non-power-of-two N", () => {
        // crypto.scrypt requires N to be a power of two. Left unchecked, this parses cleanly and then fails
        // every verifyPassword call forever — ERR_CRYPTO_INVALID_SCRYPT_PARAMS is swallowed to `false` by its
        // `.catch()` — a permanent, silent lockout with nothing reported anywhere.
        const result = directory.parseRecords( [ validEntry( {
            passwordHash: "scrypt$3$8$1$MTIzNDU2NzgxMjM0NTY3OA==$MTIzNDU2NzgxMjM0NTY3ODEyMzQ1Njc4MTIzNDU2NzgxMjM0NTY3OA=="
        } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash requests a cost below the trusted floor, even though it is a power of two and decodes cleanly", () => {
        // N=16 is a genuine power of two and decodes without error, so nothing before MIN_N would catch a
        // truncated or mistyped N (e.g. the intended 16384 typed as 16) — it would silently downgrade the
        // record to a near-free KDF with nothing reported anywhere.
        const result = directory.parseRecords( [ validEntry( {
            passwordHash: "scrypt$16$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA=="
        } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash requests a cost above the upper bound, even though it is a power of two", () => {
        // N=2^32 is a genuine power of two, but `N & (N - 1)` coerces both operands to int32 to test that, so
        // the check alone is unreliable at or above that boundary. Left unchecked, this loads clean and then
        // returns false for every password forever — the exact silent lockout the power-of-two check exists to
        // prevent, just moved past its own blind spot.
        const result = directory.parseRecords( [ validEntry( {
            passwordHash: "scrypt$4294967296$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA=="
        } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash requests an excessive parallelization cost p", () => {
        // Same salt/key as PLACEHOLDER_HASH, only p changed, so this isolates the p cap from the length checks.
        const result = directory.parseRecords( [ validEntry( {
            passwordHash: "scrypt$16384$8$17$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA=="
        } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    // The memory budget. Every case below has N, r and p individually inside their own bounds — it is the
    // *combination* that exceeds what `crypto.scrypt` will allocate, so each one used to load with zero reported
    // problems and then fail every verification forever, indistinguishable from a wrong password.
    const KEY_64 = "aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA==";
    const SALT_16 = "c2FsdHNhbHRzYWx0c2FsdA==";

    [
        { label: "r=16 at the default N", hash: `scrypt$16384$16$1$${ SALT_16 }$${ KEY_64 }` },
        { label: "twice the default N at the default r", hash: `scrypt$32768$8$1$${ SALT_16 }$${ KEY_64 }` },
        { label: "four times the default N at the default r", hash: `scrypt$65536$8$1$${ SALT_16 }$${ KEY_64 }` }
    ].forEach( ( { label, hash } ) => {
        it( `drops a record whose passwordHash needs more memory than crypto.scrypt will allocate (${ label })`, () => {
            const result = directory.parseRecords( [ validEntry( { passwordHash: hash } ) ] );
            assert.equal( result.records.length, 0, "a record that can never verify must not load" );
            assert.match( result.problems[ 0 ], /passwordHash/ );
        } );
    } );

    it( "still accepts the maximum p at the default cost, which fits the budget", () => {
        // Guards the bound from being written too tight: p contributes to the requirement but only slightly, so
        // the highest permitted p at the shipped N/r must still load.
        const result = directory.parseRecords( [ validEntry( { passwordHash: `scrypt$16384$8$16$${ SALT_16 }$${ KEY_64 }` } ) ] );
        assert.equal( result.records.length, 1, "p=16 at the default N/r fits the budget and must be accepted" );
    } );

    it( "rejects r=16 at the default N, which the frequently-quoted 128*N*r formula would have admitted", () => {
        // This is the case that makes the formula choice load-bearing rather than pedantic. `128 * N * r` for
        // N=16384/r=16 is exactly 33554432 — at or under the 32 MiB budget — so a bound written from that form
        // would accept these parameters, while OpenSSL's real requirement of 128*r*(N+2+p) is 33560576 and it
        // refuses. If someone "simplifies" the requirement expression, this test is what catches it.
        assert.equal( 128 * 16384 * 16 <= 32 * 1024 * 1024, true, "the naive formula really does look acceptable here" );
        const result = directory.parseRecords( [ validEntry( { passwordHash: `scrypt$16384$16$1$${ SALT_16 }$${ KEY_64 }` } ) ] );
        assert.equal( result.records.length, 0 );
    } );

    it( "accepts an encoding assembled directly from HASH_DEFAULTS, which the auth manager's timing decoy relies on", () => {
        // AuthManager builds its timing-decoy hash by assembling HASH_DEFAULTS plus random salt/key rather than
        // running scryptSync. That only equalizes login timing while the assembled string is decodable: if
        // decodeHash rejected it, verifyPassword would return false immediately without deriving and the decoy
        // would stop hiding whether a username exists — silently. This pins the invariant from the directory side,
        // where the constants and the validation both live.
        const crypto = require( "node:crypto" );
        const assembled = [
            directory.ALGORITHM,
            directory.HASH_DEFAULTS.N,
            directory.HASH_DEFAULTS.r,
            directory.HASH_DEFAULTS.p,
            crypto.randomBytes( directory.HASH_DEFAULTS.saltBytes ).toString( "base64" ),
            crypto.randomBytes( directory.HASH_DEFAULTS.keyBytes ).toString( "base64" )
        ].join( "$" );

        const result = directory.parseRecords( [ validEntry( { passwordHash: assembled } ) ] );
        assert.equal( result.records.length, 1, "an encoding built from HASH_DEFAULTS must decode, or the timing decoy silently stops working" );
    } );

    it( "reports a duplicate username instead of silently overwriting", () => {
        const result = directory.parseRecords( [ validEntry(), validEntry( { email: "other@example.com" } ) ] );
        assert.equal( result.records.length, 1, "only the first occurrence is kept" );
        assert.equal( result.records[ 0 ].email, "someone@example.com" );
        assert.match( result.problems.join( " " ), /duplicate/i );
    } );

    it( "treats usernames case-sensitively, so two casings are two users", () => {
        const result = directory.parseRecords( [ validEntry(), validEntry( { username: "SomeOne" } ) ] );
        assert.equal( result.records.length, 2 );
        assert.equal( result.problems.length, 0 );
    } );

    it( "reports a non-array input without throwing", () => {
        const result = directory.parseRecords( { username: "someone" } );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
    } );

    it( "reports a non-object entry without throwing", () => {
        const result = directory.parseRecords( [ "someone", null, 42 ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 3 );
    } );

} );

describe( "localUserDirectory hashing", () => {

    it( "verifies a password against its own hash", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, encoded ), true );
    } );

    it( "rejects a wrong password", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        assert.equal( await directory.verifyPassword( "something-else", encoded ), false );
    } );

    it( "returns a Promise and keeps the event loop free while the key is derived", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        let immediateFired = false;
        setImmediate( () => { immediateFired = true; } );
        const pending = directory.verifyPassword( PLACEHOLDER_PASSWORD, encoded );
        assert.ok( pending instanceof Promise, "verifyPassword must return a Promise rather than blocking synchronously" );
        await pending;
        // A synchronous scryptSync implementation would occupy the thread for the whole derivation, so this
        // setImmediate callback — scheduled before the call, and due on the very next event-loop tick — could
        // not have run until after verifyPassword returned. It having fired by the time we get here proves the
        // loop stayed free (able to serve other requests) for the ~100ms the real derivation takes.
        assert.equal( immediateFired, true, "the event loop must stay free during key derivation" );
    } );

    it( "produces a different hash each time, so the salt is genuinely per-call", () => {
        assert.notEqual( directory.hashPassword( PLACEHOLDER_PASSWORD ), directory.hashPassword( PLACEHOLDER_PASSWORD ) );
    } );

    it( "records its cost parameters in the encoding", () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        const parts = encoded.split( "$" );
        assert.equal( parts[ 0 ], "scrypt" );
        assert.equal( Number( parts[ 1 ] ), directory.HASH_DEFAULTS.N );
        assert.equal( Number( parts[ 2 ] ), directory.HASH_DEFAULTS.r );
        assert.equal( Number( parts[ 3 ] ), directory.HASH_DEFAULTS.p );
    } );

    it( "verifies a hash carrying non-default cost parameters", async () => {
        // This is what proves the encoding is genuinely self-describing rather than assuming the current
        // defaults: a hash produced with a different `r` must still verify using its own recorded parameters.
        // (`N` is deliberately left at HASH_DEFAULTS.N rather than lowered or raised: decodeHash floors N at
        // MIN_N — tied to HASH_DEFAULTS.N, see local-user-directory.js — specifically to reject a weaker cost,
        // and doubling N here would sit exactly on node's 32 MiB scrypt `maxmem` boundary. Varying `r` instead
        // makes the same self-description point without either problem.)
        const crypto = require( "node:crypto" );
        const salt = crypto.randomBytes( 16 );
        const N = directory.HASH_DEFAULTS.N;
        const r = 4;
        const key = crypto.scryptSync( PLACEHOLDER_PASSWORD, salt, 64, { N: N, r: r, p: 1 } );
        const encoded = `scrypt$${ N }$${ r }$1$${ salt.toString( "base64" ) }$${ key.toString( "base64" ) }`;
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, encoded ), true );
    } );

    it( "returns false rather than throwing on a malformed encoding", async () => {
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "garbage" ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "scrypt$16384$8" ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "" ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, undefined ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "bcrypt$16384$8$1$c2FsdA==$aGFzaA==" ), false );
    } );

    it( "returns false for an empty password rather than matching anything", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        assert.equal( await directory.verifyPassword( "", encoded ), false );
        assert.equal( await directory.verifyPassword( undefined, encoded ), false );
    } );

    it( "throws when asked to hash an empty or non-string password", () => {
        // hashPassword("") used to mint a hash that verifyPassword can never accept (it refuses empty
        // passwords), silently provisioning a permanently unusable account. Throwing surfaces the mistake
        // immediately instead.
        assert.throws( () => directory.hashPassword( "" ) );
        assert.throws( () => directory.hashPassword( undefined ) );
    } );

} );
