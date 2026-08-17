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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const cache = require( "@ti-engine/core/cache" );

// `multi(...).exec()` resolves to one `[ error, value ]` pair per command. A key that exists carries its stored string
// at index 1; a miss carries `null` there.
const hit = ( stored ) => [ null, JSON.stringify( stored ) ];
const miss = () => [ null, null ];

describe( "mapCommandValues — the multi-key read", () => {

    it( "returns the value for every key that exists", () => {
        const values = cache.mapCommandValues( [ "a", "b" ], [ hit( { n: 1 } ), hit( "text" ) ] );
        assert.deepEqual( values.a, { n: 1 } );
        assert.equal( values.b, "text" );
    } );

    it( "returns null for a key that does not exist", () => {
        const values = cache.mapCommandValues( [ "a" ], [ miss() ] );
        assert.equal( values.a, null );
    } );

    it( "mixes hits and misses in one read, keyed correctly by position", () => {
        // The regression: this returned null for EVERY key, because the ternary inspected the accumulator being built
        // rather than the per-key entry — `{}.length` is undefined, so the comparison was always false.
        const values = cache.mapCommandValues(
            [ "first", "second", "third" ],
            [ hit( { id: 1 } ), miss(), hit( { id: 3 } ) ]
        );
        assert.deepEqual( values.first, { id: 1 } );
        assert.equal( values.second, null, "a miss must be null" );
        assert.deepEqual( values.third, { id: 3 }, "a hit after a miss must not be lost" );
    } );

    it( "produces one entry per requested key and nothing else", () => {
        const values = cache.mapCommandValues( [ "a", "b" ], [ hit( 1 ), miss() ] );
        assert.deepEqual( Object.keys( values ).sort(), [ "a", "b" ] );
    } );

    it( "still yields an entry per key when the response is short or absent", () => {
        // Iterating the requested keys rather than the raw results is what guarantees the map's shape: a truncated
        // response used to silently omit keys the caller had asked about.
        assert.deepEqual( Object.keys( cache.mapCommandValues( [ "a", "b" ], [ hit( 1 ) ] ) ).sort(), [ "a", "b" ] );
        assert.equal( cache.mapCommandValues( [ "a", "b" ], [ hit( 1 ) ] ).b, null );
        assert.deepEqual( Object.keys( cache.mapCommandValues( [ "a" ], undefined ) ), [ "a" ] );
        assert.equal( cache.mapCommandValues( [ "a" ], undefined ).a, null );
    } );

    it( "returns an empty map for no keys", () => {
        assert.deepEqual( Object.keys( cache.mapCommandValues( [], [] ) ), [] );
    } );

    it( "treats an error entry as a miss rather than throwing", () => {
        const values = cache.mapCommandValues( [ "a" ], [ [ new Error( "WRONGTYPE" ), null ] ] );
        assert.equal( values.a, null );
    } );

    it( "keeps a key named __proto__ as an entry instead of repointing the map's prototype", () => {
        // Cache keys come from the caller. On an ordinary `{}` accumulator this assignment would hit the inherited
        // setter, so the entry would vanish and the caller would silently get no answer for a key it asked about.
        const values = cache.mapCommandValues( [ "__proto__", "ada" ], [ hit( { n: 1 } ), hit( { n: 2 } ) ] );
        assert.ok( Object.prototype.hasOwnProperty.call( values, "__proto__" ) );
        assert.deepEqual( values[ "__proto__" ], { n: 1 } );
        assert.deepEqual( Object.keys( values ).sort(), [ "__proto__", "ada" ] );
    } );

} );

describe( "decodeCommandValue — one entry", () => {

    it( "parses the stored string at index 1", () => {
        assert.deepEqual( cache.decodeCommandValue( hit( { n: 1 } ) ), { n: 1 } );
    } );

    it( "returns undefined for a miss, so getValue can resolve undefined", () => {
        // getValue resolves `undefined` for an absent key while getValues maps it to `null`. Both behaviours are
        // preserved: the shared decode reports `undefined` and only the multi-key mapping substitutes `null`.
        assert.equal( cache.decodeCommandValue( miss() ), undefined );
    } );

    it( "returns undefined rather than throwing on a malformed entry", () => {
        assert.equal( cache.decodeCommandValue( undefined ), undefined );
        assert.equal( cache.decodeCommandValue( [] ), undefined );
        assert.equal( cache.decodeCommandValue( [ null ] ), undefined );
        assert.equal( cache.decodeCommandValue( "not-a-pair" ), undefined );
    } );

} );
