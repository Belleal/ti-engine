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
const { describe, it } = require( "node:test" );
const { competencePartitions, createD1Database, callService, sqliteUnavailable } = require( "./fixtures/d1-sqlite.js" );
const { createD1StateService, normalizePartitions, relate, nestAtPath } = require( "@ti-engine/core/state-service" );

// The claim partitioning rests on: an application cannot tell a partitioned document from a single one. Every
// operation below runs twice — against the partitioned service, and against a reference that keeps each key as ONE
// JSON document, the way RedisJSON and the protocol's stub do: literal-segment paths, RFC 7386 merge, set-if-absent
// and set-if-present on the addressed path. Every answer is compared.
//
// Two differences are normalized, both stated in the design record (§3.4) and nothing else:
//   - an empty object above the entity level has no row, so the reference drops one wherever it would be left behind;
//   - key order is not compared: an assembled subtree lists entities in path order, not insertion order.

const isPlainObject = ( value ) => value !== null && typeof value === "object" && Array.isArray( value ) === false;

/**
 * A deep copy built from null-prototype objects, so a key spelled `__proto__` is a key and assignment never reaches a
 * setter.
 */
function detach( value ) {
    if ( Array.isArray( value ) ) {
        return value.map( detach );
    }
    if ( isPlainObject( value ) ) {
        const copy = Object.create( null );
        for ( const key of Object.keys( value ) ) {
            copy[ key ] = detach( value[ key ] );
        }
        return copy;
    }
    return value;
}

/** RFC 7386, as RedisJSON's JSON.MERGE and SQLite's json_patch apply it. */
function mergePatch( target, patch ) {
    if ( isPlainObject( patch ) === false ) {
        return detach( patch );
    }
    const result = Object.create( null );
    if ( isPlainObject( target ) ) {
        for ( const key of Object.keys( target ) ) {
            result[ key ] = target[ key ];
        }
    }
    for ( const key of Object.keys( patch ) ) {
        if ( patch[ key ] === null ) {
            delete result[ key ];
        } else {
            result[ key ] = mergePatch( result[ key ], patch[ key ] );
        }
    }
    return result;
}

function readAt( node, segments ) {
    let current = node;
    for ( const segment of segments ) {
        if ( isPlainObject( current ) === false || Object.prototype.hasOwnProperty.call( current, segment ) === false ) {
            return undefined;
        }
        current = current[ segment ];
    }
    return current;
}

function writeAt( root, segments, value ) {
    let current = root;
    for ( let i = 0; i < segments.length - 1; i++ ) {
        if ( isPlainObject( current[ segments[ i ] ] ) === false ) {
            current[ segments[ i ] ] = Object.create( null );
        }
        current = current[ segments[ i ] ];
    }
    current[ segments[ segments.length - 1 ] ] = value;
    return root;
}

/** SQLite's BINARY collation: UTF-8 byte order. */
function compareBinary( first, second ) {
    const a = Buffer.from( first, "utf8" );
    const b = Buffer.from( second, "utf8" );
    return Buffer.compare( a, b );
}

/** JSON with every object's keys sorted, so two values compare by content and not by key order. */
function canonical( value ) {
    if ( Array.isArray( value ) ) {
        return "[" + value.map( canonical ).join( "," ) + "]";
    }
    if ( isPlainObject( value ) ) {
        return "{" + Object.keys( value ).sort().map( ( key ) => JSON.stringify( key ) + ":" + canonical( value[ key ] ) ).join( "," ) + "}";
    }
    return JSON.stringify( value );
}

/**
 * Each key as one document — the single-document model — with the one rule §3.4 states applied after every write.
 */
class ReferenceStore {

    #documents = new Map();
    #partitions;

    constructor( partitions ) {
        this.#partitions = normalizePartitions( partitions );
    }

    patterns( key ) {
        return this.#partitions.get( key );
    }

    document( key ) {
        return this.#documents.get( key );
    }

    /** Every entity path stored under a key, found by walking its document. */
    entityPaths( key, node = this.#documents.get( key ), segments = [] ) {
        const found = [];
        if ( isPlainObject( node ) === false ) {
            return found;
        }
        for ( const child of Object.keys( node ) ) {
            const path = [ ...segments, child ];
            const relation = relate( this.patterns( key ), path );
            if ( relation.kind === "at" ) {
                found.push( path );
            } else if ( relation.kind === "above" ) {
                found.push( ...this.entityPaths( key, node[ child ], path ) );
            }
        }
        return found;
    }

    get( key, segments ) {
        const document = this.#documents.get( key );
        if ( document === undefined ) {
            return null;
        }
        if ( segments.includes( "*" ) === false ) {
            const addressed = readAt( document, segments );
            return ( addressed === undefined ) ? null : addressed;
        }
        // The documented wildcard: the first matching entity in path order, then the rest of the path inside it.
        const relation = relate( this.patterns( key ), segments );
        const matches = this.entityPaths( key ).filter( ( path ) => path.length === relation.entity.length
            && relation.entity.every( ( segment, index ) => segment === "*" || segment === path[ index ] ) );
        if ( matches.length === 0 ) {
            return null;
        }
        matches.sort( ( first, second ) => compareBinary( JSON.stringify( first ), JSON.stringify( second ) ) );
        const addressed = readAt( readAt( document, matches[ 0 ] ), relation.inner );
        return ( addressed === undefined ) ? null : addressed;
    }

    set( key, segments, value, overrideMode ) {
        const document = this.#documents.get( key );
        const exists = ( segments.length === 0 ) ? document !== undefined : readAt( document, segments ) !== undefined;
        if ( ( overrideMode === 1 && exists ) || ( overrideMode === 2 && !exists ) ) {
            return { ok: true, skipped: true };
        }
        const next = ( segments.length === 0 ) ? detach( value ) : writeAt( document || Object.create( null ), segments, detach( value ) );
        this.#documents.set( key, this.#prune( key, next, [] ) );
        return { ok: true };
    }

    merge( key, segments, patch ) {
        const next = mergePatch( this.#documents.get( key ) || Object.create( null ), nestAtPath( segments, patch ) );
        this.#documents.set( key, this.#prune( key, next, [] ) );
        return { ok: true };
    }

    /** §3.4: an empty object above the entity level leaves nothing behind. The root itself stays. */
    #prune( key, node, segments ) {
        for ( const child of Object.keys( node ) ) {
            const path = [ ...segments, child ];
            if ( relate( this.patterns( key ), path ).kind === "above" && isPlainObject( node[ child ] ) ) {
                this.#prune( key, node[ child ], path );
                if ( Object.keys( node[ child ] ).length === 0 ) {
                    delete node[ child ];
                }
            }
        }
        return node;
    }

}

/**
 * Runs operations against the partitioned service and the reference side by side, comparing every answer, and the
 * whole document after every write.
 */
class Differential {

    constructor( partitions ) {
        this.database = createD1Database();
        this.service = createD1StateService( this.database, { partitions: partitions } );
        this.reference = new ReferenceStore( partitions );
        this.trail = [];
    }

    async get( key, path ) {
        const answer = await callService( this.service, "/v1/documents/get", { key: key, path: path } );
        this.#expect( answer.status === 200, `get ${ JSON.stringify( path ) } answered ${ answer.status }: ${ answer.body && answer.body.error }` );
        const actual = ( answer.body.value === null ) ? null : JSON.parse( answer.body.value );
        return actual;
    }

    async apply( operation ) {
        const [ kind, key, path, value, overrideMode ] = operation;
        this.trail.push( JSON.stringify( operation ) );
        if ( kind === "get" ) {
            const actual = await this.get( key, path );
            this.#compare( actual, this.reference.get( key, path ), "read" );
            return;
        }
        const answer = ( kind === "set" )
            ? await callService( this.service, "/v1/documents/set", { key: key, path: path, value: JSON.stringify( value ), overrideMode: overrideMode } )
            : await callService( this.service, "/v1/documents/merge", { key: key, path: path, value: JSON.stringify( value ) } );
        this.#expect( answer.status === 200, `${ kind } answered ${ answer.status }: ${ answer.body && answer.body.error }` );
        const expected = ( kind === "set" ) ? this.reference.set( key, path, value, overrideMode ) : this.reference.merge( key, path, value );
        this.#expect( JSON.stringify( answer.body ) === JSON.stringify( expected ), `${ kind } answered ${ JSON.stringify( answer.body ) }, the single document ${ JSON.stringify( expected ) }` );
        this.#compare( await this.get( key, [] ), this.reference.get( key, [] ), "the whole document after it" );
    }

    #compare( actual, expected, what ) {
        this.#expect( canonical( actual ) === canonical( expected ), `${ what } differs:\n  partitioned: ${ canonical( actual ) }\n  single:      ${ canonical( expected ) }` );
    }

    #expect( condition, message ) {
        if ( condition !== true ) {
            assert.fail( `${ message }\n  after: ${ this.trail.slice( -6 ).join( "\n         " ) }` );
        }
    }

}

const KEY = ( name ) => `ti:competence:data:${ name }`;

describe( "Partitioned against single documents — what DataManager does", { skip: sqliteUnavailable }, () => {

    it( "answers every read of competence's own operation sequence as one document per key would", async () => {
        const differential = new Differential( competencePartitions );
        const evaluation = ( id, status ) => ( { evaluationID: id, status: status, answers: { "E1-1": { score: 3, note: "\"quoted\"" } }, goals: [ "one", "two" ] } );
        const initialize = [
            // DataManager#initialize: every collection created if absent, two of them seeded.
            [ "set", KEY( "active-competency-sets" ), [], { SE: { baseline: { c0: [ "E1-1", "E1-2" ] } } }, 1 ],
            [ "set", KEY( "audit-log" ), [], { employees: {}, evaluations: {} }, 1 ],
            [ "set", KEY( "calendars" ), [], {}, 1 ],
            [ "set", KEY( "cycles" ), [], {}, 1 ],
            [ "set", KEY( "employees" ), [], {}, 1 ],
            [ "set", KEY( "evaluations" ), [], {}, 1 ],
            [ "set", KEY( "role-families" ), [], { SE: { name: "Software Engineering" }, QE: { name: "Quality Engineering" } }, 1 ],
            [ "set", KEY( "results-snapshots" ), [], {}, 1 ],
            [ "set", KEY( "role-grants" ), [], {}, 1 ],
            [ "set", KEY( "research-consent" ), [], { texts: {}, decisions: {} }, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [], {}, 1 ]
        ];
        const operations = [
            ...initialize,
            // A restart finds everything in place: every one of these is skipped.
            ...initialize,
            // Seeding.
            [ "merge", KEY( "cycles" ), [], { c1: { cycleID: "c1", status: "open" } } ],
            [ "merge", KEY( "employees" ), [], { e1: { employeeID: "e1", name: "Ana" } } ],
            [ "merge", KEY( "employees" ), [], { e2: { employeeID: "e2", name: "Boyan", managerID: "e1" } } ],
            [ "merge", KEY( "employees" ), [], { e3: { employeeID: "e3", name: "Vera", managerID: "e1" } } ],
            [ "merge", KEY( "evaluations" ), [], { e2: { v1: evaluation( "v1", "open" ) } } ],
            [ "merge", KEY( "evaluations" ), [], { e3: { v2: evaluation( "v2", "open" ) } } ],
            // Employees and grants.
            [ "get", KEY( "employees" ), [] ],
            [ "get", KEY( "employees" ), [ "e2" ] ],
            [ "get", KEY( "employees" ), [ "e9" ] ],
            [ "merge", KEY( "employees" ), [], { e2: { employeeID: "e2", name: "Boyan", managerID: "e1", grade: "3" } } ],
            [ "get", KEY( "role-grants" ), [] ],
            [ "merge", KEY( "role-grants" ), [], { e1: { roles: [ "admin" ] } } ],
            [ "get", KEY( "role-grants" ), [] ],
            [ "merge", KEY( "role-grants" ), [], { e1: null } ],
            [ "get", KEY( "role-grants" ), [] ],
            // Evaluations, including the read by evaluation id alone.
            [ "get", KEY( "evaluations" ), [ "e2" ] ],
            [ "get", KEY( "evaluations" ), [] ],
            [ "get", KEY( "evaluations" ), [ "*", "v2" ] ],
            [ "get", KEY( "evaluations" ), [ "*", "missing" ] ],
            [ "merge", KEY( "evaluations" ), [], { e2: { v1: { ...evaluation( "v1", "submitted" ), answers: { "E1-1": { score: 4 } } } } } ],
            [ "get", KEY( "evaluations" ), [ "*", "v1" ] ],
            // Peer-review assignment markers: the roster of empty objects, then one marker per assignment.
            [ "set", KEY( "peer-review-assignments" ), [], {}, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1" ], { e1: {}, e2: {}, e3: {} }, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1", "e2" ], {}, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1", "e2", "m1" ], 1, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1", "e2" ], {}, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1", "e2", "m2" ], 1, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1", "e3" ], {}, 1 ],
            [ "set", KEY( "peer-review-assignments" ), [ "c1", "e3", "m3" ], -1, 1 ],
            [ "get", KEY( "peer-review-assignments" ), [ "c1" ] ],
            [ "get", KEY( "peer-review-assignments" ), [ "c2" ] ],
            // Results snapshots.
            [ "merge", KEY( "results-snapshots" ), [], { c1: { cycleID: "c1", scores: { e2: 3.25, e3: null } } } ],
            [ "get", KEY( "results-snapshots" ), [ "c1" ] ],
            [ "get", KEY( "results-snapshots" ), [] ],
            // Interview calendars.
            [ "merge", KEY( "calendars" ), [], { c1: { e1: { s1: { slotID: "s1", at: "2026-10-01T09:00" } } } } ],
            [ "merge", KEY( "calendars" ), [], { c1: { e1: { s2: { slotID: "s2", at: "2026-10-01T10:00" } } } } ],
            [ "get", KEY( "calendars" ), [ "c1", "e1" ] ],
            [ "get", KEY( "calendars" ), [ "c1" ] ],
            [ "get", KEY( "calendars" ), [ "c2", "e1" ] ],
            // Role families, cycles and the active competency sets.
            [ "get", KEY( "role-families" ), [] ],
            [ "get", KEY( "role-families" ), [ "SE" ] ],
            [ "merge", KEY( "cycles" ), [], { c1: { cycleID: "c1", status: "locked", locked: { SE: [ "E1-1" ] } } } ],
            [ "get", KEY( "cycles" ), [ "c1" ] ],
            [ "get", KEY( "cycles" ), [] ],
            [ "get", KEY( "active-competency-sets" ), [ "SE" ] ],
            [ "merge", KEY( "active-competency-sets" ), [], { SE: { baseline: { c1: [ "E1-1", "E1-2", "E1-3" ] } } } ],
            [ "get", KEY( "active-competency-sets" ), [ "SE", "baseline", "c1" ] ],
            [ "get", KEY( "active-competency-sets" ), [ "SE", "baseline", "c9" ] ],
            // The audit log.
            [ "merge", KEY( "audit-log" ), [], { employees: { e2: { a1: { action: "updated", at: 1 } } } } ],
            [ "merge", KEY( "audit-log" ), [], { evaluations: { v1: { a2: { action: "submitted", at: 2 } } } } ],
            [ "get", KEY( "audit-log" ), [ "employees", "e2" ] ],
            [ "get", KEY( "audit-log" ), [ "evaluations", "v1" ] ],
            [ "get", KEY( "audit-log" ), [ "evaluations", "v9" ] ],
            // Research consent: the text once, then a decision under a target and a cycle.
            [ "set", KEY( "research-consent" ), [ "texts", "h1" ], { text: "I agree.", language: "en" }, 1 ],
            [ "set", KEY( "research-consent" ), [ "texts", "h1" ], { text: "I agree.", language: "en" }, 1 ],
            [ "merge", KEY( "research-consent" ), [], { decisions: { e2: { c1: {} } } } ],
            [ "set", KEY( "research-consent" ), [ "decisions", "e2", "c1", "r1" ], { recordID: "r1", consent: true }, 1 ],
            [ "get", KEY( "research-consent" ), [ "decisions", "e2", "c1", "r1" ] ],
            [ "get", KEY( "research-consent" ), [ "decisions", "e2", "c1" ] ],
            [ "get", KEY( "research-consent" ), [ "decisions" ] ],
            [ "get", KEY( "research-consent" ), [ "decisions", "e2" ] ],
            [ "get", KEY( "research-consent" ), [ "texts", "h1" ] ],
            [ "get", KEY( "research-consent" ), [ "decisions", "e3", "c1" ] ],
            // Configuration drift reconciled: shipped families and sets merged over the stored ones.
            [ "merge", KEY( "role-families" ), [], { SE: { name: "Software Engineering", specializations: [ "FE", "BE" ] } } ],
            [ "merge", KEY( "active-competency-sets" ), [], { QE: { baseline: { c1: [ "Q1-1" ] } } } ],
            [ "get", KEY( "role-families" ), [] ],
            [ "get", KEY( "active-competency-sets" ), [] ]
        ];
        for ( const operation of operations ) {
            await differential.apply( operation );
        }
    } );

} );

/* Seeded random sequences */

/** A small, fast, seedable generator, so a failure names the seed that reproduces it. */
function mulberry32( seed ) {
    let state = seed >>> 0;
    return () => {
        state = ( state + 0x6D2B79F5 ) >>> 0;
        let t = state;
        t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
        t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
        return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
    };
}

// Ids that stress the row layout: a shared prefix, JSON and LIKE metacharacters, non-ASCII, and prototype names.
const IDS = [ "a", "b", "a,b", "a\"b", "a%", "x_y", "é", "😀", "__proto__", "constructor" ];
// Keys inside an entity. No double quote: a write inside an entity needs a path expression, which cannot spell one.
const FIELDS = [ "k", "n", "tags", "a.b", "__proto__", "é" ];
const SCALARS = [ 0, 1, -7, 2.5, 1e-7, "", "text", "42", "null", "say \"hi\"", true, false ];

class OperationGenerator {

    constructor( seed, key, reference ) {
        this.random = mulberry32( seed );
        this.key = key;
        this.reference = reference;
        this.patterns = reference.patterns( key );
    }

    chance( probability ) {
        return this.random() < probability;
    }

    pick( list ) {
        return list[ Math.floor( this.random() * list.length ) ];
    }

    json( depth ) {
        const roll = this.random();
        if ( depth <= 0 || roll < 0.45 ) {
            return this.chance( 0.1 ) ? null : this.pick( SCALARS );
        }
        if ( roll < 0.6 ) {
            return Array.from( { length: Math.floor( this.random() * 3 ) }, () => this.json( depth - 1 ) );
        }
        const object = {};
        for ( let i = Math.floor( this.random() * 4 ); i > 0; i-- ) {
            Object.defineProperty( object, this.pick( FIELDS ), { value: this.json( depth - 1 ), enumerable: true, writable: true, configurable: true } );
        }
        return object;
    }

    entityValue() {
        return this.chance( 0.8 ) ? this.objectOf( () => this.json( 2 ) ) : this.json( 1 );
    }

    /** A merge-patch for one entity: fields to set, fields to remove, or a value that replaces the entity. */
    entityPatch() {
        if ( this.chance( 0.1 ) ) {
            return null;
        }
        if ( this.chance( 0.1 ) ) {
            return this.pick( SCALARS );
        }
        return this.objectOf( () => ( this.chance( 0.25 ) ? null : this.json( 2 ) ) );
    }

    objectOf( valueOf, keys = FIELDS ) {
        const object = {};
        for ( let i = Math.floor( this.random() * 4 ); i > 0; i-- ) {
            Object.defineProperty( object, this.pick( keys ), { value: valueOf(), enumerable: true, writable: true, configurable: true } );
        }
        return object;
    }

    /** The segments the spec admits directly under a path above the entity level. */
    childSegments( segments ) {
        const candidates = new Set();
        for ( const pattern of this.patterns ) {
            if ( pattern.length > segments.length && relate( [ pattern ], segments ).kind === "above" ) {
                if ( pattern[ segments.length ] === "*" ) {
                    IDS.forEach( ( id ) => candidates.add( id ) );
                } else {
                    candidates.add( pattern[ segments.length ] );
                }
            }
        }
        return [ ...candidates ];
    }

    /** A value that fits the spec at a path above the entity level. */
    subtree( segments ) {
        const children = this.childSegments( segments );
        const object = {};
        for ( let i = Math.floor( this.random() * 3 ); i > 0; i-- ) {
            const child = this.pick( children );
            const path = [ ...segments, child ];
            const value = ( relate( this.patterns, path ).kind === "at" ) ? this.entityValue() : this.subtree( path );
            Object.defineProperty( object, child, { value: value, enumerable: true, writable: true, configurable: true } );
        }
        return object;
    }

    /** A merge-patch that fits the spec at a path above the entity level; a null below the root removes a subtree. */
    subtreePatch( segments ) {
        const children = this.childSegments( segments );
        const object = {};
        for ( let i = Math.floor( this.random() * 3 ); i > 0; i-- ) {
            const child = this.pick( children );
            const path = [ ...segments, child ];
            let value;
            if ( relate( this.patterns, path ).kind === "at" ) {
                value = this.entityPatch();
            } else {
                value = this.chance( 0.15 ) ? null : this.subtreePatch( path );
            }
            Object.defineProperty( object, child, { value: value, enumerable: true, writable: true, configurable: true } );
        }
        return object;
    }

    entityPath() {
        const existing = this.reference.entityPaths( this.key );
        if ( existing.length > 0 && this.chance( 0.7 ) ) {
            return this.pick( existing );
        }
        return this.pick( this.patterns ).map( ( segment ) => ( segment === "*" ) ? this.pick( IDS ) : segment );
    }

    abovePath() {
        const entity = this.entityPath();
        const pattern = relate( this.patterns, entity ).pattern;
        return entity.slice( 0, 1 + Math.floor( this.random() * ( pattern.length - 1 ) ) );
    }

    /** A path inside an existing entity that runs through objects only — where writing inside one is defined. */
    innerPath( entity ) {
        let node = readAt( this.reference.document( this.key ), entity );
        const inner = [];
        while ( isPlainObject( node ) && Object.keys( node ).length > 0 && this.chance( 0.4 ) ) {
            const child = this.pick( Object.keys( node ) );
            if ( isPlainObject( node[ child ] ) === false ) {
                break;
            }
            inner.push( child );
            node = node[ child ];
        }
        return isPlainObject( node ) ? [ ...inner, this.pick( FIELDS ) ] : null;
    }

    next() {
        const roll = this.random();
        const mode = this.pick( [ 0, 0, 1, 2 ] );
        if ( roll < 0.35 ) {
            return this.read();
        }
        if ( roll < 0.65 ) {
            const where = this.random();
            if ( where < 0.15 ) {
                return [ "set", this.key, [], this.subtree( [] ), mode ];
            }
            if ( where < 0.4 ) {
                const path = this.abovePath();
                return [ "set", this.key, path, this.subtree( path ), mode ];
            }
            if ( where < 0.8 ) {
                return [ "set", this.key, this.entityPath(), this.entityValue(), mode ];
            }
            const entities = this.reference.entityPaths( this.key );
            const entity = ( entities.length > 0 ) ? this.pick( entities ) : null;
            const inner = entity && this.innerPath( entity );
            return inner ? [ "set", this.key, [ ...entity, ...inner ], this.json( 2 ), mode ] : this.read();
        }
        const where = this.random();
        if ( where < 0.3 ) {
            return [ "merge", this.key, [], this.subtreePatch( [] ) ];
        }
        if ( where < 0.55 ) {
            const path = this.abovePath();
            return [ "merge", this.key, path, this.chance( 0.1 ) ? null : this.subtreePatch( path ) ];
        }
        if ( where < 0.85 ) {
            return [ "merge", this.key, this.entityPath(), this.entityPatch() ];
        }
        return [ "merge", this.key, [ ...this.entityPath(), this.pick( FIELDS ) ], this.chance( 0.3 ) ? null : this.json( 2 ) ];
    }

    read() {
        const where = this.random();
        if ( where < 0.15 ) {
            return [ "get", this.key, [] ];
        }
        if ( where < 0.4 ) {
            return [ "get", this.key, this.abovePath() ];
        }
        const entity = this.entityPath();
        const inner = ( where < 0.75 ) ? [] : [ this.pick( FIELDS ) ];
        const pattern = relate( this.patterns, entity ).pattern;
        if ( where >= 0.9 || ( where < 0.6 && pattern.includes( "*" ) && this.chance( 0.3 ) ) ) {
            // A wildcard where the spec has one, as `*.<evaluationID>` is read.
            const wild = entity.map( ( segment, index ) => ( pattern[ index ] === "*" && this.chance( 0.6 ) ) ? "*" : segment );
            return [ "get", this.key, [ ...wild, ...inner ] ];
        }
        return [ "get", this.key, [ ...entity, ...inner ] ];
    }

}

describe( "Partitioned against single documents — seeded random sequences", { skip: sqliteUnavailable }, () => {

    const shapes = {
        "one level": KEY( "employees" ),
        "two levels, read by id": KEY( "evaluations" ),
        "three levels": KEY( "calendars" ),
        "two patterns under literals": KEY( "audit-log" ),
        "two patterns of different depths": KEY( "research-consent" )
    };
    const SEEDS = [ 1, 2, 3, 4, 5, 6 ];
    const STEPS = 250;

    for ( const [ shape, key ] of Object.entries( shapes ) ) {
        it( `agrees on every answer: ${ shape } (${ SEEDS.length } seeds × ${ STEPS } operations)`, async () => {
            for ( const seed of SEEDS ) {
                const differential = new Differential( competencePartitions );
                const generator = new OperationGenerator( seed * 7919 + key.length, key, differential.reference );
                try {
                    for ( let step = 0; step < STEPS; step++ ) {
                        await differential.apply( generator.next() );
                    }
                } catch ( error ) {
                    error.message = `seed ${ seed }: ${ error.message }`;
                    throw error;
                }
            }
        } );
    }

} );
