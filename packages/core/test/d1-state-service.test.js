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

const assert = require( "node:assert/strict" );
const { beforeEach, describe, it } = require( "node:test" );
const { createD1Database, callService, sqliteUnavailable } = require( "./fixtures/d1-sqlite.js" );
const { createD1StateService, sweepExpired, globToLike, toSQLitePath, nestAtPath } = require( "@ti-engine/core/state-service" );

// The protocol as the D1 service answers it, against real SQLite with the shipped schema. The partitioned documents
// have their own suite; everything here is the vocabulary the site's service already spoke.

let database = null;
let service = null;
let clock = 0;

beforeEach( () => {
    if ( sqliteUnavailable ) {
        return;
    }
    database = createD1Database();
    clock = 1_000_000;
    service = createD1StateService( database, { now: () => clock } );
} );

describe( "The D1 state service — routing", { skip: sqliteUnavailable }, () => {

    it( "answers the health probe by touching the database", async () => {
        const answer = await callService( service, "/v1/health", undefined, "GET" );
        assert.equal( answer.status, 200 );
        assert.deepEqual( answer.body, { ok: true } );
        // A probe that only proved the Worker was running would report a healthy cache over an unreachable database.
        assert.ok( database.log.some( ( entry ) => entry.sql.includes( "SELECT 1" ) ), "the probe must reach D1" );
    } );

    it( "fails the health probe when the database does", async () => {
        database.failNext( ( sql ) => sql.includes( "SELECT 1" ) );
        const answer = await callService( service, "/v1/health", undefined, "GET" );
        assert.equal( answer.status, 500 );
        assert.match( answer.body.error, /D1_ERROR/ );
    } );

    it( "answers 404 for a path outside the vocabulary", async () => {
        for ( const route of [ "/v1/documents/delete", "/v2/values/get", "/" ] ) {
            const answer = await callService( service, route, {} );
            assert.equal( answer.status, 404, route );
            assert.ok( answer.body.error.includes( route ), `the refusal should name '${ route }'` );
        }
    } );

    it( "answers 405 for the wrong method rather than guessing", async () => {
        assert.equal( ( await callService( service, "/v1/values/get", undefined, "GET" ) ).status, 405 );
        assert.equal( ( await callService( service, "/v1/health", {} ) ).status, 405 );
    } );

    it( "refuses a body that is not a JSON object", async () => {
        for ( const body of [ "not json", "[]", "\"text\"", "null" ] ) {
            const response = await service( new Request( "http://state.internal/v1/values/get", { method: "POST", body: body } ) );
            assert.equal( response.status, 400, body );
        }
    } );

} );

describe( "The D1 state service — values", { skip: sqliteUnavailable }, () => {

    it( "round-trips a value, and answers null for one that is not there", async () => {
        await callService( service, "/v1/values/set", { key: "k", value: "v" } );
        assert.deepEqual( ( await callService( service, "/v1/values/get", { key: "k" } ) ).body, { value: "v" } );
        assert.deepEqual( ( await callService( service, "/v1/values/get", { key: "missing" } ) ).body, { value: null } );
    } );

    it( "hides a value once its deadline passes, from reads and from key matching", async () => {
        await callService( service, "/v1/values/set", { key: "health", value: "t", expiration: 10 } );
        clock += 9_999;
        assert.equal( ( await callService( service, "/v1/values/get", { key: "health" } ) ).body.value, "t" );
        clock += 1;
        assert.equal( ( await callService( service, "/v1/values/get", { key: "health" } ) ).body.value, null );
        assert.deepEqual( ( await callService( service, "/v1/keys/match", { pattern: "*" } ) ).body.keys, [] );
    } );

    it( "forgets an earlier deadline when the value is set again without one", async () => {
        await callService( service, "/v1/values/set", { key: "k", value: "first", expiration: 1 } );
        await callService( service, "/v1/values/set", { key: "k", value: "second" } );
        clock += 60_000;
        assert.equal( ( await callService( service, "/v1/values/get", { key: "k" } ) ).body.value, "second" );
    } );

    it( "reports whether a delete removed anything", async () => {
        await callService( service, "/v1/values/set", { key: "k", value: "v" } );
        assert.deepEqual( ( await callService( service, "/v1/values/delete", { key: "k" } ) ).body, { deleted: true } );
        assert.deepEqual( ( await callService( service, "/v1/values/delete", { key: "k" } ) ).body, { deleted: false } );
    } );

} );

describe( "The D1 state service — hash fields", { skip: sqliteUnavailable }, () => {

    it( "round-trips a field and reports whether a delete removed it", async () => {
        await callService( service, "/v1/hashes/set", { key: "sessions", field: "s1", value: "{}" } );
        assert.equal( ( await callService( service, "/v1/hashes/get", { key: "sessions", field: "s1" } ) ).body.value, "{}" );
        assert.equal( ( await callService( service, "/v1/hashes/get", { key: "sessions", field: "s2" } ) ).body.value, null );
        assert.deepEqual( ( await callService( service, "/v1/hashes/delete", { key: "sessions", field: "s1" } ) ).body, { deleted: true } );
        assert.deepEqual( ( await callService( service, "/v1/hashes/delete", { key: "sessions", field: "s1" } ) ).body, { deleted: false } );
    } );

    it( "expires one field without touching its siblings", async () => {
        await callService( service, "/v1/hashes/set", { key: "sessions", field: "s1", value: "a" } );
        await callService( service, "/v1/hashes/set", { key: "sessions", field: "s2", value: "b" } );
        // The established argument order: `key` is the field, `hash` the set it belongs to.
        await callService( service, "/v1/keys/expire", { key: "s1", hash: "sessions", seconds: 30 } );
        clock += 30_000;
        assert.equal( ( await callService( service, "/v1/hashes/get", { key: "sessions", field: "s1" } ) ).body.value, null );
        assert.equal( ( await callService( service, "/v1/hashes/get", { key: "sessions", field: "s2" } ) ).body.value, "b" );
    } );

    it( "forgets a field's deadline when the field is set again", async () => {
        await callService( service, "/v1/hashes/set", { key: "sessions", field: "s1", value: "a" } );
        await callService( service, "/v1/keys/expire", { key: "s1", hash: "sessions", seconds: 1 } );
        await callService( service, "/v1/hashes/set", { key: "sessions", field: "s1", value: "b" } );
        clock += 60_000;
        assert.equal( ( await callService( service, "/v1/hashes/get", { key: "sessions", field: "s1" } ) ).body.value, "b" );
    } );

} );

describe( "The D1 state service — keys", { skip: sqliteUnavailable }, () => {

    it( "matches across values, hashes and documents, naming a hash once", async () => {
        await callService( service, "/v1/values/set", { key: "app:value", value: "v" } );
        await callService( service, "/v1/hashes/set", { key: "app:hash", field: "a", value: "1" } );
        await callService( service, "/v1/hashes/set", { key: "app:hash", field: "b", value: "2" } );
        await callService( service, "/v1/documents/set", { key: "app:document", path: [], value: "{}", overrideMode: 0 } );
        await callService( service, "/v1/values/set", { key: "other", value: "v" } );
        const keys = ( await callService( service, "/v1/keys/match", { pattern: "app:*" } ) ).body.keys;
        assert.deepEqual( [ ...keys ].sort(), [ "app:document", "app:hash", "app:value" ] );
    } );

    it( "reads % and _ in a pattern as the characters they are, and only * and ? as wildcards", async () => {
        for ( const key of [ "a%b", "a_b", "axb" ] ) {
            await callService( service, "/v1/values/set", { key: key, value: "v" } );
        }
        const match = async ( pattern ) => ( await callService( service, "/v1/keys/match", { pattern: pattern } ) ).body.keys.sort();
        assert.deepEqual( await match( "a%b" ), [ "a%b" ] );
        assert.deepEqual( await match( "a_b" ), [ "a_b" ] );
        assert.deepEqual( await match( "a?b" ), [ "a%b", "a_b", "axb" ] );
        assert.equal( globToLike( "a\\%_*?" ), "a\\\\\\%\\_%_" );
    } );

    it( "expires a whole document", async () => {
        await callService( service, "/v1/documents/set", { key: "trace", path: [], value: "{\"a\":1}", overrideMode: 0 } );
        await callService( service, "/v1/keys/expire", { key: "trace", seconds: 5 } );
        clock += 5_000;
        assert.equal( ( await callService( service, "/v1/documents/get", { key: "trace", path: [] } ) ).body.value, null );
    } );

} );

describe( "The D1 state service — single documents", { skip: sqliteUnavailable }, () => {

    const get = async ( key, path ) => ( await callService( service, "/v1/documents/get", { key: key, path: path } ) ).body.value;
    const set = async ( key, path, value, overrideMode = 0 ) => ( await callService( service, "/v1/documents/set", { key: key, path: path, value: JSON.stringify( value ), overrideMode: overrideMode } ) ).body;

    it( "round-trips a whole document and a branch of it", async () => {
        await set( "doc", [], { a: { b: [ 1, 2 ] }, c: true } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { a: { b: [ 1, 2 ] }, c: true } );
        assert.deepEqual( JSON.parse( await get( "doc", [ "a", "b" ] ) ), [ 1, 2 ] );
        assert.equal( await get( "doc", [ "a", "missing" ] ), null );
        assert.equal( await get( "missing", [] ), null );
    } );

    it( "reads a string back as a string, even one that looks like JSON", async () => {
        // `json_extract` answered the unquoted text, which the provider parses: "42" came back as a number and
        // "null" as absent. `->` answers JSON text for whatever is there.
        await set( "doc", [], { code: "42", label: "null", flag: "true", nothing: null } );
        assert.equal( await get( "doc", [ "code" ] ), "\"42\"" );
        assert.equal( await get( "doc", [ "label" ] ), "\"null\"" );
        assert.equal( await get( "doc", [ "flag" ] ), "\"true\"" );
        assert.equal( await get( "doc", [ "nothing" ] ), "null", "a stored null is there, and says so" );
    } );

    it( "creates the document when a branch is set on a key that has none", async () => {
        await set( "doc", [ "a", "b" ], { c: 1 } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { a: { b: { c: 1 } } } );
    } );

    it( "honours set-if-absent and set-if-present at the root and at a branch", async () => {
        assert.deepEqual( await set( "doc", [], { v: 1 }, 2 ), { ok: true, skipped: true } );
        assert.equal( await get( "doc", [] ), null );
        assert.deepEqual( await set( "doc", [], { v: 1 }, 1 ), { ok: true } );
        assert.deepEqual( await set( "doc", [], { v: 2 }, 1 ), { ok: true, skipped: true } );
        assert.deepEqual( await set( "doc", [], { v: 3 }, 2 ), { ok: true } );
        assert.deepEqual( await set( "doc", [ "w" ], 1, 2 ), { ok: true, skipped: true } );
        assert.deepEqual( await set( "doc", [ "w" ], 1, 1 ), { ok: true } );
        assert.deepEqual( await set( "doc", [ "w" ], 2, 1 ), { ok: true, skipped: true } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { v: 3, w: 1 } );
    } );

    it( "counts a stored null as present for set-if-absent", async () => {
        // `json_extract` is NULL for a stored null and for a missing path alike; `json_type` tells them apart.
        await set( "doc", [], { slot: null } );
        assert.deepEqual( await set( "doc", [ "slot" ], "taken", 1 ), { ok: true, skipped: true } );
        assert.deepEqual( await set( "doc", [ "slot" ], 7, 2 ), { ok: true } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { slot: 7 } );
    } );

    it( "applies a merge as ONE statement, with no read before it", async () => {
        await set( "doc", [], { a: 1 } );
        database.log.length = 0;
        await callService( service, "/v1/documents/merge", { key: "doc", path: [ "rec-1" ], value: JSON.stringify( { email: "one@example.com" } ) } );
        assert.equal( database.log.length, 1, "a read before the write is how a concurrent merge gets lost" );
        assert.match( database.log[ 0 ].sql, /json_patch/ );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { a: 1, "rec-1": { email: "one@example.com" } } );
    } );

    it( "keeps every one of many concurrent merges into one document", async () => {
        await Promise.all( Array.from( { length: 25 }, ( _, i ) => callService( service, "/v1/documents/merge", {
            key: "capture", path: [ `rec-${ i }` ], value: JSON.stringify( { n: i } )
        } ) ) );
        assert.equal( Object.keys( JSON.parse( await get( "capture", [] ) ) ).length, 25 );
    } );

    it( "nests a merge at its path, where a null removes a key (RFC 7386)", async () => {
        await set( "doc", [], { a: { keep: 1, drop: 2 } } );
        await callService( service, "/v1/documents/merge", { key: "doc", path: [ "a" ], value: JSON.stringify( { drop: null, add: [ 3 ] } ) } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { a: { keep: 1, add: [ 3 ] } } );
        assert.deepEqual( nestAtPath( [ "x", "y" ], 1 ), { x: { y: 1 } } );
    } );

    it( "merges under a key holding a double quote, which no path expression could name", async () => {
        const key = "he said \"hi\"";
        await callService( service, "/v1/documents/merge", { key: "doc", path: [ key ], value: JSON.stringify( { n: 1 } ) } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { [ key ]: { n: 1 } } );
        // A read or a set at that branch needs the path grammar, which has no escape for it: refused by name.
        const answer = await callService( service, "/v1/documents/get", { key: "doc", path: [ key ] } );
        assert.equal( answer.status, 400 );
        assert.match( answer.body.error, /double quote/ );
        assert.throws( () => toSQLitePath( [ key ] ), /double quote/ );
    } );

    it( "refuses a branch whose key SQLite would read as an escape, rather than write to some other key", async () => {
        // On SQLite 3.51.2 `$."a\b"` does not address the key `a\b`: the read missed, and json_set wrote a second key
        // beside it with nothing raised. A merge needs no path expression, so it still reaches the key.
        const document = { "a\\b": 1, "tab\there": 2 };
        await set( "doc", [], document );
        for ( const key of Object.keys( document ) ) {
            for ( const answer of [
                await callService( service, "/v1/documents/get", { key: "doc", path: [ key ] } ),
                await callService( service, "/v1/documents/set", { key: "doc", path: [ key ], value: "9", overrideMode: 0 } )
            ] ) {
                assert.equal( answer.status, 400, JSON.stringify( key ) );
                assert.match( answer.body.error, /backslash or a control character/ );
            }
        }
        await callService( service, "/v1/documents/merge", { key: "doc", path: [], value: JSON.stringify( { "a\\b": 3 } ) } );
        assert.deepEqual( JSON.parse( await get( "doc", [] ) ), { "a\\b": 3, "tab\there": 2 } );
    } );

    it( "refuses a document value that is not JSON, and a path that is not an array of strings", async () => {
        assert.equal( ( await callService( service, "/v1/documents/merge", { key: "doc", path: [], value: "{not json" } ) ).status, 400 );
        assert.equal( ( await callService( service, "/v1/documents/set", { key: "doc", path: [], value: "{not json", overrideMode: 0 } ) ).status, 400 );
        assert.equal( ( await callService( service, "/v1/documents/set", { key: "doc", path: [ "a" ], value: "{not json", overrideMode: 0 } ) ).status, 400 );
        assert.equal( ( await callService( service, "/v1/documents/get", { key: "doc", path: "a.b" } ) ).status, 400 );
        assert.equal( ( await callService( service, "/v1/documents/get", { key: "doc", path: [ 1 ] } ) ).status, 400 );
    } );

} );

describe( "sweepExpired", { skip: sqliteUnavailable }, () => {

    it( "removes what has expired, keeps the rest, and never touches a partitioned row", async () => {
        const partitioned = createD1StateService( database, { now: () => clock, partitions: { people: [ [ "*" ] ] } } );
        await callService( service, "/v1/values/set", { key: "gone", value: "v", expiration: 1 } );
        await callService( service, "/v1/values/set", { key: "kept", value: "v" } );
        await callService( service, "/v1/hashes/set", { key: "sessions", field: "s1", value: "v" } );
        await callService( service, "/v1/keys/expire", { key: "s1", hash: "sessions", seconds: 1 } );
        await callService( service, "/v1/documents/set", { key: "trace", path: [], value: "{}", overrideMode: 0 } );
        await callService( service, "/v1/keys/expire", { key: "trace", seconds: 1 } );
        await callService( partitioned, "/v1/documents/set", { key: "people", path: [], value: JSON.stringify( { p1: { n: 1 } } ), overrideMode: 0 } );
        clock += 1_000;

        assert.equal( await sweepExpired( database, () => clock ), 3 );
        assert.equal( database.sqlite.prepare( "SELECT COUNT(*) AS n FROM state_values" ).get().n, 1 );
        assert.equal( database.rows( "people" ).length, 2, "the marker and the one entity" );
        assert.equal( await sweepExpired( database, () => clock ), 0 );
    } );

} );
