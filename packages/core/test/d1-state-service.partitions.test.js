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
const { competencePartitions, createD1Database, callService, sqliteUnavailable } = require( "./fixtures/d1-sqlite.js" );
const { createD1StateService, normalizePartitions, relate } = require( "@ti-engine/core/state-service" );

// Partitioned documents: the same `documents/*` a client always used, stored one row per entity. The single-document
// behaviour they must reproduce is pinned by the differential suite; this one pins how they are stored, what they
// refuse, and the claims the design record makes about D1 — one batch per merge, one row per edit, index reads.

const EMPLOYEES = "ti:competence:data:employees";
const EVALUATIONS = "ti:competence:data:evaluations";
const CALENDARS = "ti:competence:data:calendars";
const PEER_REVIEWS = "ti:competence:data:peer-review-assignments";
const AUDIT_LOG = "ti:competence:data:audit-log";
const CONSENT = "ti:competence:data:research-consent";

let database = null;
let service = null;

beforeEach( () => {
    if ( sqliteUnavailable ) {
        return;
    }
    database = createD1Database();
    service = createD1StateService( database, { partitions: competencePartitions } );
} );

const read = ( key, path ) => callService( service, "/v1/documents/get", { key: key, path: path } );
const set = ( key, path, value, overrideMode = 0 ) => callService( service, "/v1/documents/set", { key: key, path: path, value: JSON.stringify( value ), overrideMode: overrideMode } );
const merge = ( key, path, value ) => callService( service, "/v1/documents/merge", { key: key, path: path, value: JSON.stringify( value ) } );

/**
 * Reads a path and parses the answer, failing the test on anything but a 200.
 *
 * @param {string} key
 * @param {string[]} path
 * @returns {Promise<*>} The addressed value, or null.
 */
async function get( key, path ) {
    const answer = await read( key, path );
    assert.equal( answer.status, 200, answer.body && answer.body.error );
    return ( answer.body.value === null ) ? null : JSON.parse( answer.body.value );
}

describe( "The partition spec", () => {

    it( "accepts competence's spec, a key with four patterns and one with two among it", () => {
        const spec = normalizePartitions( competencePartitions );
        assert.equal( spec.size, 11 );
        assert.deepEqual( spec.get( AUDIT_LOG ), [
            [ "employees", "*", "*" ], [ "cycles", "*", "*" ], [ "activeCompetencySets", "*", "*" ], [ "evaluations", "*", "*" ]
        ] );
        assert.ok( Object.isFrozen( spec.get( AUDIT_LOG ) ) && Object.isFrozen( spec.get( AUDIT_LOG )[ 0 ] ) );
        assert.equal( normalizePartitions( undefined ).size, 0 );
    } );

    it( "refuses a malformed spec when the service is created, not at the first request", () => {
        for ( const spec of [ [], { k: [] }, { k: "*" }, { k: [ [] ] }, { k: [ [ "a", 1 ] ] }, { k: [ [ "" ] ] } ] ) {
            assert.throws( () => createD1StateService( {}, { partitions: spec } ), TypeError, JSON.stringify( spec ) );
        }
    } );

    it( "refuses two patterns that could claim the same path, and names both", () => {
        assert.throws( () => normalizePartitions( { k: [ [ "*" ], [ "a", "*" ] ] } ), /\["\*"\] and \["a","\*"\] for 'k' overlap/ );
        assert.throws( () => normalizePartitions( { k: [ [ "texts", "*" ], [ "texts", "*", "*" ] ] } ), /overlap/ );
        assert.throws( () => normalizePartitions( { k: [ [ "x" ], [ "x" ] ] } ), /overlap/ );
        assert.doesNotThrow( () => normalizePartitions( { k: [ [ "texts", "*" ], [ "decisions", "*", "*", "*" ] ] } ) );
    } );

    it( "relates a path to the spec: above, at, below or outside", () => {
        const evaluations = [ [ "*", "*" ] ];
        const consent = competencePartitions[ CONSENT ];
        assert.deepEqual( relate( evaluations, [] ), { kind: "above", patterns: evaluations } );
        assert.deepEqual( relate( evaluations, [ "e1" ] ), { kind: "above", patterns: evaluations } );
        assert.deepEqual( relate( evaluations, [ "e1", "v1" ] ), { kind: "at", pattern: [ "*", "*" ], entity: [ "e1", "v1" ], inner: [] } );
        assert.deepEqual( relate( evaluations, [ "e1", "v1", "status" ] ), { kind: "below", pattern: [ "*", "*" ], entity: [ "e1", "v1" ], inner: [ "status" ] } );
        assert.deepEqual( relate( consent, [ "decisions", "t1" ] ), { kind: "above", patterns: [ consent[ 1 ] ] } );
        assert.deepEqual( relate( consent, [ "texts", "h1" ] ).kind, "at" );
        assert.deepEqual( relate( consent, [ "other" ] ), { kind: "outside" } );
    } );

} );

describe( "Partitioned documents — one row per entity", { skip: sqliteUnavailable }, () => {

    it( "stores each entity as its own row, beside a marker for the key", async () => {
        assert.equal( ( await set( EMPLOYEES, [], { e1: { name: "Ana" }, e2: { name: "Boyan" } } ) ).status, 200 );
        // In path order, which puts the marker last: `]` sorts after `"`.
        assert.deepEqual( database.rows( EMPLOYEES ), [
            { path: "[\"e1\"]", leaf: "e1", value: "{\"name\":\"Ana\"}" },
            { path: "[\"e2\"]", leaf: "e2", value: "{\"name\":\"Boyan\"}" },
            { path: "[]", leaf: null, value: "{}" }
        ] );
    } );

    it( "keeps a collection no single D1 row could hold, and edits one entity by writing one row", async () => {
        // The reason this exists: 150 evaluations at 20 KB is 3 MB, and D1 caps a row at 2 MB.
        const filler = "x".repeat( 20_000 );
        for ( let i = 0; i < 150; i++ ) {
            await merge( EVALUATIONS, [], { [ `e${ i % 30 }` ]: { [ `v${ i }` ]: { status: "open", notes: filler } } } );
        }
        const collection = await get( EVALUATIONS, [] );
        assert.equal( Object.values( collection ).reduce( ( sum, evaluations ) => sum + Object.keys( evaluations ).length, 0 ), 150 );
        assert.ok( JSON.stringify( collection ).length > 2_000_000, "as one document, this would not fit a D1 row" );
        assert.ok( Math.max( ...database.rows( EVALUATIONS ).map( ( row ) => row.value.length ) ) < 25_000 );

        database.log.length = 0;
        await merge( EVALUATIONS, [ "e7", "v7" ], { status: "closed" } );
        const patches = database.log.filter( ( entry ) => entry.sql.includes( "json_patch" ) );
        assert.equal( patches.length, 1, "one entity edited, one row written" );
        assert.ok( patches[ 0 ].params.every( ( param ) => String( param ).length < 100 ), "the statement carries the patch, not the collection" );
        assert.equal( ( await get( EVALUATIONS, [ "e7", "v7" ] ) ).status, "closed" );
    } );

} );

describe( "Partitioned documents — reads", { skip: sqliteUnavailable }, () => {

    beforeEach( async () => {
        if ( sqliteUnavailable ) {
            return;
        }
        await set( EVALUATIONS, [], {
            e1: { v1: { status: "open", code: "42" }, v2: { status: "closed" } },
            e2: { v3: { status: "open" } }
        } );
    } );

    it( "assembles the whole collection, a subtree, one entity, and a value inside one", async () => {
        assert.deepEqual( await get( EVALUATIONS, [] ), {
            e1: { v1: { status: "open", code: "42" }, v2: { status: "closed" } },
            e2: { v3: { status: "open" } }
        } );
        assert.deepEqual( await get( EVALUATIONS, [ "e2" ] ), { v3: { status: "open" } } );
        assert.deepEqual( await get( EVALUATIONS, [ "e1", "v2" ] ), { status: "closed" } );
        assert.equal( await get( EVALUATIONS, [ "e1", "v1", "status" ] ), "open" );
        assert.equal( await get( EVALUATIONS, [ "e1", "v1", "missing" ] ), null );
        assert.equal( await get( EVALUATIONS, [ "e9" ] ), null );
    } );

    it( "reads a string inside an entity back as the string it is", async () => {
        const answer = await read( EVALUATIONS, [ "e1", "v1", "code" ] );
        assert.equal( answer.body.value, "\"42\"" );
    } );

    it( "answers {} for a collection with nothing in it, and null for a key never written", async () => {
        await set( CALENDARS, [], {}, 1 );
        assert.deepEqual( await get( CALENDARS, [] ), {} );
        assert.equal( await get( "ti:competence:data:cycles", [] ), null );
    } );

    it( "answers null for an empty subtree, where a single document would keep {} (the §3.4 divergence)", async () => {
        await set( CALENDARS, [], { c1: {} } );
        assert.equal( await get( CALENDARS, [ "c1" ] ), null );
        assert.deepEqual( await get( CALENDARS, [] ), {} );
    } );

    it( "reads a subtree as one range of the primary key, not a scan of the key", async () => {
        database.log.length = 0;
        await get( EVALUATIONS, [ "e1" ] );
        const statement = database.log.find( ( entry ) => entry.sql.includes( "path >= ?2" ) );
        assert.ok( statement, "the subtree read is a range" );
        const plan = database.sqlite.prepare( "EXPLAIN QUERY PLAN " + statement.sql ).all( ...statement.params ).map( ( row ) => row.detail ).join( " | " );
        assert.match( plan, /path>\? AND path<\?/ );
    } );

    it( "finds an entity by its id alone, through the leaf index", async () => {
        database.log.length = 0;
        assert.deepEqual( await get( EVALUATIONS, [ "*", "v3" ] ), { status: "open" } );
        const statement = database.log.find( ( entry ) => entry.sql.includes( "leaf = ?2" ) );
        assert.ok( statement );
        // With `ORDER BY path` in the statement, SQLite preferred the primary key and read every row of the key.
        const plan = database.sqlite.prepare( "EXPLAIN QUERY PLAN " + statement.sql ).all( ...statement.params ).map( ( row ) => row.detail ).join( " | " );
        assert.match( plan, /state_partitions_leaf/ );
    } );

    it( "answers the first match in path order when an id repeats", async () => {
        await merge( EVALUATIONS, [], { e2: { v1: { status: "second" } } } );
        assert.equal( ( await get( EVALUATIONS, [ "*", "v1" ] ) ).status, "open", "e1 sorts before e2" );
        assert.deepEqual( await get( EVALUATIONS, [ "e1", "*" ] ), { status: "open", code: "42" } );
        assert.equal( await get( EVALUATIONS, [ "*", "v3", "status" ] ), "open" );
    } );

    it( "answers null for a wildcard that matches nothing, and for a path the spec cannot hold", async () => {
        assert.equal( await get( EVALUATIONS, [ "*", "nope" ] ), null );
        assert.equal( await get( EVALUATIONS, [ "e9", "*" ] ), null );
        assert.equal( await get( CONSENT, [ "other" ] ), null );
        assert.equal( await get( CONSENT, [ "texts" ] ), null );
    } );

    it( "refuses a wildcard it would have to scan for, rather than answer null", async () => {
        for ( const [ key, path ] of [
            [ EVALUATIONS, [ "*" ] ],
            [ AUDIT_LOG, [ "employees", "*" ] ],
            [ CONSENT, [ "*", "h1" ] ],
            [ EMPLOYEES, [ "e1", "*" ] ]
        ] ) {
            const answer = await read( key, path );
            assert.equal( answer.status, 400, JSON.stringify( path ) );
            assert.match( answer.body.error, /wildcard/ );
        }
    } );

} );

describe( "Partitioned documents — writes", { skip: sqliteUnavailable }, () => {

    it( "replaces the whole collection when the root is set", async () => {
        await set( EMPLOYEES, [], { e1: { n: 1 }, e2: { n: 2 } } );
        await set( EMPLOYEES, [], { e3: { n: 3 } } );
        assert.deepEqual( await get( EMPLOYEES, [] ), { e3: { n: 3 } } );
        assert.equal( database.rows( EMPLOYEES ).length, 2 );
    } );

    it( "tests a root set-if-absent against the marker, so an emptied collection still exists", async () => {
        assert.deepEqual( ( await set( EMPLOYEES, [], {}, 1 ) ).body, { ok: true } );
        assert.deepEqual( ( await set( EMPLOYEES, [], { e1: {} }, 1 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( await get( EMPLOYEES, [] ), {} );
        assert.deepEqual( ( await set( "ti:competence:data:cycles", [], { c1: {} }, 2 ) ).body, { ok: true, skipped: true } );
        assert.equal( await get( "ti:competence:data:cycles", [] ), null );
    } );

    it( "replaces one subtree and leaves its siblings alone", async () => {
        await set( CALENDARS, [], { c1: { m1: { s1: { at: 1 }, s2: { at: 2 } } }, c2: { m1: { s3: { at: 3 } } } } );
        await set( CALENDARS, [ "c1" ], { m2: { s4: { at: 4 } } } );
        assert.deepEqual( await get( CALENDARS, [] ), { c1: { m2: { s4: { at: 4 } } }, c2: { m1: { s3: { at: 3 } } } } );
    } );

    it( "tests a subtree set-if-absent or -present against the rows under it", async () => {
        await set( CALENDARS, [], { c1: { m1: { s1: { at: 1 } } } } );
        assert.deepEqual( ( await set( CALENDARS, [ "c1" ], { m9: { s9: {} } }, 1 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( ( await set( CALENDARS, [ "c2" ], { m2: { s2: { at: 2 } } }, 1 ) ).body, { ok: true } );
        assert.deepEqual( ( await set( CALENDARS, [ "c3" ], { m3: { s3: { at: 3 } } }, 2 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( ( await set( CALENDARS, [ "c1", "m1" ], { s5: { at: 5 } }, 2 ) ).body, { ok: true } );
        assert.deepEqual( await get( CALENDARS, [] ), { c1: { m1: { s5: { at: 5 } } }, c2: { m2: { s2: { at: 2 } } } } );
    } );

    it( "keeps the evaluation another instance stored while this one was seeding the same collection", async () => {
        // Two instances starting at once, each seeding with set-if-absent: the other one's seed and first evaluation
        // land after this one's seed has begun, and before it writes. Decided by a query ahead of the batch, the seed
        // found no collection and then deleted the evaluation with the rest of the subtree.
        database.interleave( ( sql ) => sql.includes( "DELETE FROM state_partitions" ), async () => {
            await set( EVALUATIONS, [], {}, 1 );
            await merge( EVALUATIONS, [], { e1: { v1: { status: "open" } } } );
        } );
        assert.deepEqual( ( await set( EVALUATIONS, [], {}, 1 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( await get( EVALUATIONS, [ "e1", "v1" ] ), { status: "open" } );
    } );

    it( "decides a subtree set-if-absent or -present in the batch that writes it", async () => {
        const before = ( write ) => database.interleave( ( sql ) => sql.includes( "DELETE FROM state_partitions" ), write );

        before( () => set( PEER_REVIEWS, [ "c1", "e2", "m1" ], 1 ) );
        assert.deepEqual( ( await set( PEER_REVIEWS, [ "c1" ], { e3: { m1: 1 } }, 1 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( await get( PEER_REVIEWS, [ "c1" ] ), { e2: { m1: 1 } }, "a subtree written just before is not replaced" );

        before( () => merge( PEER_REVIEWS, [], { c1: null } ) );
        assert.deepEqual( ( await set( PEER_REVIEWS, [ "c1" ], { e3: { m1: 1 } }, 2 ) ).body, { ok: true, skipped: true } );
        assert.equal( await get( PEER_REVIEWS, [ "c1" ] ), null, "a subtree deleted just before is not re-created" );

        database.log.length = 0;
        assert.deepEqual( ( await set( PEER_REVIEWS, [ "c2" ], { e1: { m1: 1 } }, 1 ) ).body, { ok: true } );
        assert.deepEqual( [ ...new Set( database.log.map( ( entry ) => entry.batch ) ) ], [ database.log[ 0 ].batch ], "nothing is read ahead of the batch" );
        assert.notEqual( database.log[ 0 ].batch, null );
        assert.equal( database.sqlite.prepare( "SELECT COUNT(*) AS n FROM state_guards" ).get().n, 0, "the guard leaves nothing behind" );
    } );

    it( "inserts, updates or upserts one entity by override mode", async () => {
        const marker = [ "c1", "r1", "m1" ];
        assert.deepEqual( ( await set( PEER_REVIEWS, marker, 1, 2 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( ( await set( PEER_REVIEWS, marker, 1, 1 ) ).body, { ok: true } );
        assert.deepEqual( ( await set( PEER_REVIEWS, marker, 5, 1 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( ( await set( PEER_REVIEWS, marker, -1, 2 ) ).body, { ok: true } );
        assert.deepEqual( ( await set( PEER_REVIEWS, [ "c1", "r1", "m2" ], 1, 0 ) ).body, { ok: true } );
        assert.deepEqual( await get( PEER_REVIEWS, [ "c1" ] ), { r1: { m1: -1, m2: 1 } } );
    } );

    it( "writes inside an entity with one conditional statement", async () => {
        await set( EMPLOYEES, [ "e1" ], { name: "Ana", tags: { lead: false } } );
        database.log.length = 0;
        assert.deepEqual( ( await set( EMPLOYEES, [ "e1", "tags", "lead" ], true, 2 ) ).body, { ok: true } );
        assert.equal( database.log.length, 1, "a write that lands needs no read" );
        assert.deepEqual( ( await set( EMPLOYEES, [ "e1", "tags", "lead" ], false, 1 ) ).body, { ok: true, skipped: true } );
        assert.deepEqual( ( await set( EMPLOYEES, [ "e1", "grade" ], "3", 1 ) ).body, { ok: true } );
        assert.deepEqual( await get( EMPLOYEES, [ "e1" ] ), { name: "Ana", tags: { lead: true }, grade: "3" } );
    } );

    it( "refuses a write the spec cannot hold, and says where", async () => {
        const refusals = [
            [ await set( CONSENT, [ "other", "x" ], {} ), /\["other","x"\]/ ],
            [ await set( EVALUATIONS, [], { e1: 5 } ), /\["e1"\] must be an object/ ],
            [ await set( EVALUATIONS, [], [ 1 ] ), /\[\] must be an object/ ],
            [ await set( EMPLOYEES, [ "*" ], {} ), /wildcard/ ],
            [ await set( EMPLOYEES, [], { "*": {} } ), /spelled '\*'/ ],
            [ await set( EMPLOYEES, [ "nobody", "name" ], "x" ), /no entity at \["nobody"\]/ ],
            [ await set( EMPLOYEES, [ "e1", "say \"hi\"" ], 1 ), /double quote/ ]
        ];
        for ( const [ answer, message ] of refusals ) {
            assert.equal( answer.status, 400, answer.body.error );
            assert.match( answer.body.error, message );
        }
        assert.deepEqual( database.rows( EMPLOYEES ), [], "a refused write stores nothing" );
    } );

} );

describe( "Partitioned documents — merges", { skip: sqliteUnavailable }, () => {

    it( "sends one batch: one statement per entity, and nothing read before it", async () => {
        database.log.length = 0;
        await merge( AUDIT_LOG, [], {
            employees: { e1: { a1: { what: "created" }, a2: { what: "edited" } } },
            evaluations: { v1: { a3: { what: "started" } } }
        } );
        const batches = new Set( database.log.map( ( entry ) => entry.batch ) );
        assert.deepEqual( [ ...batches ], [ 1 ], "every statement ran inside the one batch" );
        assert.equal( database.log.filter( ( entry ) => entry.sql.includes( "json_patch" ) ).length, 3 );
        assert.ok( database.log.every( ( entry ) => /^\s*(INSERT|DELETE)/.test( entry.sql ) ), "no read, so no lost update" );
    } );

    it( "starts a new entity from {}, so the nulls in its patch vanish (RFC 7386 against an absent target)", async () => {
        await merge( EMPLOYEES, [ "e1" ], { name: "Ana", manager: null } );
        assert.deepEqual( await get( EMPLOYEES, [ "e1" ] ), { name: "Ana" } );
        await merge( EMPLOYEES, [], { e1: { manager: "e2", name: null } } );
        assert.deepEqual( await get( EMPLOYEES, [ "e1" ] ), { manager: "e2" } );
    } );

    it( "deletes an entity with null, and a subtree with null above the entity level", async () => {
        await set( CALENDARS, [], { c1: { m1: { s1: {}, s2: {} }, m2: { s3: {} } }, c2: { m1: { s4: {} } } } );
        await merge( CALENDARS, [ "c1" ], { m1: null, m2: { s3: null, s5: { at: 5 } } } );
        assert.deepEqual( await get( CALENDARS, [] ), { c1: { m2: { s5: { at: 5 } } }, c2: { m1: { s4: {} } } } );
    } );

    it( "replaces a scalar entity, as a peer-review marker's count", async () => {
        await set( PEER_REVIEWS, [ "c1", "r1", "m1" ], 1, 1 );
        await merge( PEER_REVIEWS, [], { c1: { r1: { m1: -1 } } } );
        assert.equal( await get( PEER_REVIEWS, [ "c1", "r1", "m1" ] ), -1 );
    } );

    it( "creates the key even when the patch holds nothing to store", async () => {
        await merge( CONSENT, [], { decisions: { t1: { c1: {} } } } );
        assert.deepEqual( await get( CONSENT, [] ), {} );
        assert.deepEqual( database.rows( CONSENT ), [ { path: "[]", leaf: null, value: "{}" } ] );
    } );

    it( "refuses a null root, a scalar above the entity level, and a wildcard", async () => {
        for ( const [ path, patch ] of [ [ [], null ], [ [ "c1" ], 5 ], [ [], { c1: [ 1 ] } ], [ [ "*" ], {} ] ] ) {
            assert.equal( ( await merge( CALENDARS, path, patch ) ).status, 400, JSON.stringify( [ path, patch ] ) );
        }
    } );

    it( "lands whole or not at all", async () => {
        await set( EMPLOYEES, [], { e1: { n: 1 }, e2: { n: 2 } } );
        let patches = 0;
        database.failNext( ( sql ) => sql.includes( "json_patch" ) && ++patches === 2 );
        const answer = await merge( EMPLOYEES, [], { e1: { n: 10 }, e2: { n: 20 } } );
        assert.equal( answer.status, 500 );
        assert.deepEqual( await get( EMPLOYEES, [] ), { e1: { n: 1 }, e2: { n: 2 } }, "the first entity's patch was rolled back with the second" );
    } );

    it( "keeps every concurrent merge, into one entity or into many", async () => {
        await Promise.all( [
            ...Array.from( { length: 20 }, ( _, i ) => merge( EMPLOYEES, [ "shared" ], { [ `field${ i }` ]: i } ) ),
            ...Array.from( { length: 20 }, ( _, i ) => merge( EMPLOYEES, [], { [ `e${ i }` ]: { n: i } } ) )
        ] );
        assert.equal( Object.keys( await get( EMPLOYEES, [ "shared" ] ) ).length, 20 );
        assert.equal( Object.keys( await get( EMPLOYEES, [] ) ).length, 21 );
    } );

} );

describe( "Partitioned documents — keys", { skip: sqliteUnavailable }, () => {

    it( "lists a partitioned key by its marker, once it has been written, from an index of markers alone", async () => {
        const match = async () => ( await callService( service, "/v1/keys/match", { pattern: "ti:competence:data:*" } ) ).body.keys;
        assert.deepEqual( await match(), [] );
        await set( EMPLOYEES, [], { e1: {}, e2: {} } );
        database.log.length = 0;
        assert.deepEqual( await match(), [ EMPLOYEES ] );
        // Without the partial index the marker lookup read every entity row of every partitioned key.
        const statement = database.log[ 0 ];
        const plan = database.sqlite.prepare( "EXPLAIN QUERY PLAN " + statement.sql ).all( ...statement.params ).map( ( row ) => row.detail ).join( " | " );
        assert.match( plan, /state_partitions_markers/ );
    } );

    it( "refuses to expire a partitioned key rather than report a deadline nothing will apply", async () => {
        const answer = await callService( service, "/v1/keys/expire", { key: EMPLOYEES, seconds: 60 } );
        assert.equal( answer.status, 400 );
        assert.match( answer.body.error, /does not expire/ );
    } );

} );

describe( "Partitioned documents — ids that are hard to spell", { skip: sqliteUnavailable }, () => {

    it( "keeps entities apart whose ids share a prefix or carry JSON, LIKE or prototype metacharacters", async () => {
        const ids = [ "a", "a,b", "a\"b", "a\\", "a%b", "a_b", "a]", "é", "😀", "__proto__", "constructor" ];
        for ( const id of ids ) {
            await merge( EVALUATIONS, [ id ], { [ `${ id }/v1` ]: { of: id }, [ `${ id }/v2` ]: { of: id } } );
        }
        for ( const id of ids ) {
            const evaluations = await get( EVALUATIONS, [ id ] );
            assert.deepEqual( Object.keys( evaluations ).sort(), [ `${ id }/v1`, `${ id }/v2` ], `the subtree of ${ JSON.stringify( id ) }` );
            assert.equal( ( await get( EVALUATIONS, [ "*", `${ id }/v2` ] ) ).of, id );
        }
        const collection = await get( EVALUATIONS, [] );
        assert.deepEqual( Object.keys( collection ).sort(), [ ...ids ].sort() );
        assert.ok( Object.prototype.hasOwnProperty.call( collection, "__proto__" ), "__proto__ is a key here, not a prototype" );

        await merge( EVALUATIONS, [], { a: null } );
        assert.equal( await get( EVALUATIONS, [ "a" ] ), null );
        assert.deepEqual( Object.keys( await get( EVALUATIONS, [ "a,b" ] ) ).length, 2, "deleting 'a' must not reach 'a,b'" );
    } );

} );
