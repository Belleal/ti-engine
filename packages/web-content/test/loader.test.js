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

/*
 * Invariant tests for the content loader (written before content/loader.js).
 *
 * The loader validates raw records through the schema and builds the lookup indexes. The behaviors that matter and
 * would otherwise fail silently: an invalid record (e.g. missing visibility) is excluded from the served index and
 * reported; two records cannot own one path or id; an alias that collides with — or is shadowed by — a real path is
 * dropped and reported, never left dead in the index.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );

function post( id, path, extra ) {
    return Object.assign( {
        id: id, type: "post", path: path, lang: "en", title: "T",
        visibility: "public", status: "published", world: "anarandaris", form: "song"
    }, extra || {} );
}

describe( "loader — indexing valid records", () => {

    it( "indexes records by id, path, and type", () => {
        const index = buildIndex( [ post( "a", "/a/" ), post( "b", "/b/" ) ] );
        assert.equal( index.all.length, 2 );
        assert.equal( index.byPath.get( "/a/" ).id, "a" );
        assert.equal( index.byId.get( "b" ).id, "b" );
        assert.equal( index.byType.get( "post" ).length, 2 );
        assert.equal( index.invalid.length, 0 );
        assert.equal( index.conflicts.length, 0 );
    } );

    it( "indexes aliases to their record", () => {
        const index = buildIndex( [ post( "a", "/a/", { aliases: [ "/old-a/", "/older-a/" ] } ) ] );
        assert.equal( index.byAlias.get( "/old-a/" ).id, "a" );
        assert.equal( index.byAlias.get( "/older-a/" ).id, "a" );
    } );

    it( "tolerates a null / non-array input without throwing", () => {
        for ( const input of [ null, undefined, "nope", 42 ] ) {
            const index = buildIndex( input );
            assert.equal( index.all.length, 0 );
            assert.equal( index.conflicts.length, 0 );
        }
    } );

} );

describe( "loader — invalid records are excluded and reported", () => {

    it( "excludes a record that fails schema validation and records why", () => {
        const bad = post( "x", "/x/" );
        delete bad.visibility;
        const index = buildIndex( [ bad, post( "a", "/a/" ) ] );
        assert.equal( index.all.length, 1 );
        assert.equal( index.byPath.has( "/x/" ), false );
        assert.equal( index.invalid.length, 1 );
        assert.equal( index.invalid[ 0 ].id, "x" );
        assert.ok( index.invalid[ 0 ].errors.some( ( e ) => e.includes( "visibility" ) ) );
    } );

} );

describe( "loader — conflicts", () => {

    it( "keeps the first record on a duplicate path and reports the collision", () => {
        const index = buildIndex( [ post( "a", "/dup/" ), post( "b", "/dup/" ) ] );
        assert.equal( index.all.length, 1 );
        assert.equal( index.byPath.get( "/dup/" ).id, "a" );
        assert.ok( index.conflicts.some( ( c ) => c.kind === "path" && c.key === "/dup/" ) );
    } );

    it( "keeps the first record on a duplicate id and reports the collision", () => {
        const index = buildIndex( [ post( "a", "/a/" ), post( "a", "/a2/" ) ] );
        assert.equal( index.all.length, 1 );
        assert.equal( index.byId.get( "a" ).path, "/a/" );
        assert.ok( index.conflicts.some( ( c ) => c.kind === "id" && c.key === "a" ) );
    } );

    it( "keeps both records when two share an alias, but registers the alias once and reports it", () => {
        const index = buildIndex( [ post( "a", "/a/", { aliases: [ "/x/" ] } ), post( "b", "/b/", { aliases: [ "/x/" ] } ) ] );
        assert.equal( index.all.length, 2 );
        assert.equal( index.byAlias.get( "/x/" ).id, "a" );
        assert.ok( index.conflicts.some( ( c ) => c.kind === "alias" && c.key === "/x/" ) );
    } );

    it( "drops an alias that a real path shadows (path wins) and reports it", () => {
        const index = buildIndex( [ post( "a", "/a/", { aliases: [ "/b/" ] } ), post( "b", "/b/" ) ] );
        assert.equal( index.byPath.get( "/b/" ).id, "b" );
        assert.equal( index.byAlias.has( "/b/" ), false );
        assert.ok( index.conflicts.some( ( c ) => c.kind === "alias-shadows-path" && c.key === "/b/" ) );
    } );

} );
