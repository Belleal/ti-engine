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

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const tools = require( "@ti-engine/core/tools" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const directory = require( "#local-user-directory" );

// Structurally valid placeholder — the same one local-user-directory.test.js uses. The previous fixture here
// ("scrypt$16384$8$1$c2FsdA==$aGFzaA==") decodes to a 4-byte salt / 4-byte key, which decodeHash now rejects
// for falling below MIN_SALT_BYTES/MIN_KEY_BYTES. Harmless for this file's tests (reconcile stores whatever it
// is given without validating it), but it read as a valid record when it no longer is one.
const PLACEHOLDER_HASH = "scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaA==";

function record( username, overrides = {} ) {
    return Object.assign( {
        userID: `local:${ username }`,
        username: username,
        email: `${ username }@example.com`,
        name: username,
        passwordHash: PLACEHOLDER_HASH,
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

    // This does not test this package's own code — `tools.stringifyJSON` belongs to @ti-engine/core. It exists to
    // keep the reason `parseRecords` rejects a '__proto__' username a verified fact rather than folklore. Every
    // other test in this file goes through InMemoryCache, which stores values with a plain
    // `JSON.parse( JSON.stringify(...) )` and so could never surface anything about the real serializer.
    //
    // The assumption it originally pinned was that the serializer **cannot** round-trip such a key: `decycle`
    // turned it into the replica's prototype and `_.toPlainObject` then flattened that value's fields back in as
    // top-level keys, corrupting the whole stored document. The earlier version of this test asserted exactly
    // that, and left a note saying a core release fixing `decycle` was the moment to revisit the rejection.
    //
    // **@ti-engine/core 1.11.0 is that release** (see its changelog), so the assertion is inverted here: the
    // round-trip is now intact. The rejection in `parseRecords` nevertheless stays, for a reason that has nothing
    // to do with defence in depth — this package declares `"@ti-engine/core": "*"`, so a consumer of the
    // published web-framework can pair it with **any** core, including a pre-1.11.0 one that still corrupts the
    // document. web-framework cannot guarantee the serializer underneath it is fixed, so it must not store a
    // record it might be unable to represent.
    it( "confirms core 1.11.0 round-trips an own '__proto__' key, so the rejection is now about older cores, not this one", () => {
        const withReservedKey = Object.create( null );
        withReservedKey.ada = { username: "ada" };
        withReservedKey[ "__proto__" ] = { username: "__proto__", email: "proto@example.com" };

        const roundTripped = JSON.parse( tools.stringifyJSON( withReservedKey ) );

        assert.equal(
            Object.prototype.hasOwnProperty.call( roundTripped, "__proto__" ),
            true,
            "core >= 1.11.0 must keep '__proto__' as an own key; if this fails the installed core predates that fix"
        );
        assert.equal( roundTripped[ "__proto__" ].email, "proto@example.com", "the record's value must survive intact" );
        // The specific corruption that used to happen: the withheld record's fields spliced into the top level.
        // Asserting their absence is what proves the flattening is gone rather than merely relocated.
        assert.equal( roundTripped.username, undefined, "the record's fields must no longer leak to the top level" );
        assert.equal( roundTripped.email, undefined );
        assert.equal( roundTripped.ada.username, "ada", "an unrelated sibling record must still come through unaffected" );
    } );

} );
