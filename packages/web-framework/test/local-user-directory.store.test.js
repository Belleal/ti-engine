/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const tools = require( "@ti-engine/core/tools" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const directory = require( "#local-user-directory" );

function record( username, overrides = {} ) {
    return Object.assign( {
        userID: `local:${ username }`,
        username: username,
        email: `${ username }@example.com`,
        name: username,
        passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
        disabled: false
    }, overrides );
}

describe( "localUserDirectory reconcile", () => {

    beforeEach( () => {
        installInMemoryCache();
    } );

    it( "adds every record on a first reconcile", async () => {
        const result = await directory.reconcile( [ record( "ada" ), record( "grace" ) ] );
        assert.deepEqual( result.added.sort(), [ "ada", "grace" ] );
        assert.equal( result.updated.length, 0 );
        assert.equal( result.removed.length, 0 );
        assert.equal( ( await directory.findByUsername( "ada" ) ).email, "ada@example.com" );
    } );

    it( "reports a changed record as updated", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        const result = await directory.reconcile( [ record( "ada", { name: "Ada L" } ) ] );
        assert.deepEqual( result.updated, [ "ada" ] );
        assert.equal( result.added.length, 0 );
        assert.equal( ( await directory.findByUsername( "ada" ) ).name, "Ada L" );
    } );

    it( "reports an unchanged record as neither added nor updated", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        const result = await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( result.added.length, 0 );
        assert.equal( result.updated.length, 0 );
        assert.equal( result.removed.length, 0 );
    } );

    it( "removes a username absent from the new set, so revocation works by editing the file", async () => {
        await directory.reconcile( [ record( "ada" ), record( "grace" ) ] );
        const result = await directory.reconcile( [ record( "ada" ) ] );
        assert.deepEqual( result.removed, [ "grace" ] );
        assert.equal( await directory.findByUsername( "grace" ), null );
        assert.ok( await directory.findByUsername( "ada" ) );
    } );

    it( "clears the directory when reconciled with an empty set", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        const result = await directory.reconcile( [] );
        assert.deepEqual( result.removed, [ "ada" ] );
        assert.equal( await directory.findByUsername( "ada" ), null );
    } );

    // NOTE on what used to be here: earlier versions of this test asserted that a '__proto__'-keyed record
    // "round-trips" through reconcile/findByUsername. That was true only against this file's in-memory test
    // double. Against the real (non-test-double) cache.instance.setJSON, a '__proto__' username corrupts the
    // whole stored directory instead of round-tripping — see the "reserved usernames" describe block below,
    // which pins that against the real serializer — and parseRecords now rejects '__proto__' (along with
    // 'constructor' and 'prototype') before it can ever reach reconcile through the intended load path (see
    // local-user-directory.test.js). Asserting a round-trip here would be a green test for something
    // production cannot do, so it was removed rather than kept passing against only the double.
    //
    // 'constructor' is different: unlike '__proto__', it round-trips correctly even through the real
    // serializer (verified the same way — see the comment on RESERVED_USERNAMES in local-user-directory.js),
    // and reconcile's null-prototype write guard plus its hasOwnProperty read guards are kept intentionally as
    // defence in depth, in case some future caller reaches reconcile directly, bypassing parseRecords. This
    // test calls reconcile directly (bypassing parseRecords, which would refuse this username at load) to
    // prove that backstop still holds, not to describe how the application actually uses it.
    it( "keeps reconcile's own guards intact for a 'constructor'-keyed record given directly, bypassing parseRecords", async () => {
        const added = await directory.reconcile( [ record( "ada" ), record( "constructor" ) ] );
        assert.deepEqual( added.added.sort(), [ "ada", "constructor" ] );
        assert.equal( added.updated.length, 0 );
        const found = await directory.findByUsername( "constructor" );
        assert.ok( found );
        assert.equal( typeof found, "object" );
        assert.equal( found.email, "constructor@example.com" );

        const afterRemoval = await directory.reconcile( [ record( "ada" ) ] );
        assert.deepEqual( afterRemoval.removed, [ "constructor" ] );
        assert.equal( await directory.findByUsername( "constructor" ), null );
    } );

} );

describe( "localUserDirectory findByUsername", () => {

    beforeEach( () => {
        installInMemoryCache();
    } );

    it( "returns null for an unknown username", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( await directory.findByUsername( "nobody" ), null );
    } );

    it( "is case-sensitive", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( await directory.findByUsername( "Ada" ), null );
    } );

    it( "returns null for an empty or absent username without querying", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( await directory.findByUsername( "" ), null );
        assert.equal( await directory.findByUsername( undefined ), null );
    } );

    it( "returns null when the directory was never populated", async () => {
        assert.equal( await directory.findByUsername( "ada" ), null );
    } );

    // `stored[ "constructor" ]` resolves to the inherited Object constructor function on any plain object — even
    // an empty `{}` — unless the lookup checks ownership explicitly. This is the exact violation of the declared
    // `Promise<LocalUserRecord|null>` contract that the login path (Task 5) would hit for a username of literally
    // 'constructor', so it is pinned on both an empty and a populated directory.
    it( "returns null, not the inherited Object constructor, for 'constructor' on an empty directory", async () => {
        const found = await directory.findByUsername( "constructor" );
        assert.equal( found, null );
    } );

    it( "returns null, not the inherited Object constructor, for 'constructor' on a populated directory", async () => {
        await directory.reconcile( [ record( "ada" ), record( "grace" ) ] );
        const found = await directory.findByUsername( "constructor" );
        assert.equal( found, null );
    } );

} );

describe( "localUserDirectory Redis failure handling", () => {

    // `getJSON` resolves a `$`-rooted query wrapped in a single-element array on a hit — RedisJSON's JSONPath
    // contract, mirrored deliberately by `InMemoryCache` (see its own doc comment) and already unwrapped by
    // `ConfigStore#readJSON` elsewhere in this package. These two pin down that `reconcile`/`findByUsername`
    // read that shape correctly across repeat calls, rather than misreading a populated directory as empty.
    let stub;

    beforeEach( () => {
        stub = installInMemoryCache();
    } );

    it( "surfaces a genuine Redis failure from findByUsername rather than reporting 'no such user'", async () => {
        stub.getJSON = () => Promise.reject( new Error( "redis unavailable" ) );
        await assert.rejects( () => directory.findByUsername( "ada" ) );
    } );

    it( "surfaces a genuine Redis failure from reconcile rather than reading the directory as empty", async () => {
        stub.getJSON = () => Promise.reject( new Error( "redis unavailable" ) );
        await assert.rejects( () => directory.reconcile( [ record( "ada" ) ] ) );
    } );

} );

describe( "localUserDirectory reserved usernames (storage-layer assumption)", () => {

    // This does not test this package's own code — `tools.stringifyJSON` belongs to @ti-engine/core. It is a
    // guard on the assumption parseRecords' rejection of '__proto__' rests on: that the real (non-test-double)
    // serializer cache.instance.setJSON calls cannot round-trip a '__proto__'-keyed object. Every other test in
    // this file goes through InMemoryCache, which stores values with a plain `JSON.parse( JSON.stringify(...) )`
    // and would never surface this — it has to be pinned here, directly against tools.stringifyJSON, or the
    // reason for the rejection in local-user-directory.js is folklore rather than a verified fact.
    //
    // If a future @ti-engine/core release fixes `decycle` so this test starts failing (i.e. the round-trip
    // becomes intact), that is the moment to revisit whether parseRecords still needs to reject '__proto__' —
    // not before, and not by assuming it from this comment alone.
    it( "pins that tools.stringifyJSON cannot round-trip an own '__proto__' key — the reason parseRecords rejects it", () => {
        const withReservedKey = Object.create( null );
        withReservedKey.ada = { username: "ada" };
        withReservedKey[ "__proto__" ] = { username: "__proto__", email: "proto@example.com" };

        const roundTripped = JSON.parse( tools.stringifyJSON( withReservedKey ) );

        assert.equal(
            Object.prototype.hasOwnProperty.call( roundTripped, "__proto__" ),
            false,
            "the real serializer must fail to keep '__proto__' as an own key for this rejection to be justified"
        );
        // Not merely dropped: the withheld record's own fields are spliced into the top level of the document,
        // corrupting whatever else shares it — this is what makes rejecting the username the honest choice
        // over accepting and silently storing something broken.
        assert.equal( roundTripped.username, "__proto__", "the '__proto__' record's fields leak into the top level instead of being dropped cleanly" );
        assert.equal( roundTripped.email, "proto@example.com" );
        assert.equal( roundTripped.ada.username, "ada", "an unrelated sibling record must still come through unaffected" );
    } );

} );
