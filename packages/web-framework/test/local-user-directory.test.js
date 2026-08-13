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

function validEntry( overrides = {} ) {
    return Object.assign( {
        username: "someone",
        email: "someone@example.com",
        name: "Some One",
        passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA=="
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
        // This is what proves the encoding is genuinely self-describing rather than assuming the current defaults:
        // a hash produced with a lower N must still verify after the defaults are raised.
        const crypto = require( "node:crypto" );
        const salt = crypto.randomBytes( 16 );
        const N = 1024;
        const key = crypto.scryptSync( PLACEHOLDER_PASSWORD, salt, 64, { N: N, r: 8, p: 1 } );
        const encoded = `scrypt$${ N }$8$1$${ salt.toString( "base64" ) }$${ key.toString( "base64" ) }`;
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

} );
