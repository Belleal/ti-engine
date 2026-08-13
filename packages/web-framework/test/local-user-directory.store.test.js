/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

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
