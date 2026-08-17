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
 * Tests for the taxonomy term-graph logic (pure; vocabulary passed in-memory, YAML loading deferred). The §8
 * invariant lives here: parent expansion is derived at query time, so querying `dark-intent` must include posts
 * tagged `alexander-dark`. Hierarchy is one level deep only.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const Taxonomy = require( "#taxonomy" );

function vocabulary() {
    return {
        world: [
            { id: "anarandaris", slug: { en: "anarandaris", bg: "anarandaris" }, label: { en: "Anarand'aris", bg: "Анаранд'арис" } },
            { id: "dark-intent", slug: { en: "dark-intent", bg: "tamni-namereniya" }, label: { en: "Dark Intent", bg: "Тъмни намерения" } },
            { id: "alexander-dark", parent: "dark-intent", slug: { en: "alexander-dark", bg: "aleksandar-dark" }, label: { en: "Alexander Dark", bg: "Александър Дарк" } },
            { id: "occult-crimes", parent: "dark-intent", slug: { en: "occult-crimes", bg: "okultni-prestapleniya" }, label: { en: "Department of Occult Crimes", bg: "Отдел по Окултни престъпления" } }
        ],
        form: [
            { id: "short-story", slug: { en: "short-story", bg: "kratka-istoriya" }, label: { en: "Short Story", bg: "Кратка история" } },
            { id: "chapter", slug: { en: "chapter", bg: "glava" }, label: { en: "Chapter", bg: "Глава" } }
        ]
    };
}

describe( "taxonomy — term resolution", () => {

    const taxonomy = new Taxonomy( vocabulary() );

    it( "resolves a term by id", () => {
        assert.equal( taxonomy.resolve( "world", "dark-intent" ).label.en, "Dark Intent" );
    } );

    it( "resolves a term by slug in either language", () => {
        assert.equal( taxonomy.resolve( "world", "tamni-namereniya" ).id, "dark-intent" );
        assert.equal( taxonomy.resolve( "form", "kratka-istoriya" ).id, "short-story" );
    } );

    it( "returns null for an unknown term or facet", () => {
        assert.equal( taxonomy.resolve( "world", "nope" ), null );
        assert.equal( taxonomy.resolve( "nonexistent-facet", "dark-intent" ), null );
    } );

    it( "lists all terms of a facet and the per-language slug", () => {
        assert.equal( taxonomy.terms( "world" ).length, 4 );
        assert.equal( taxonomy.slugFor( "world", "dark-intent", "bg" ), "tamni-namereniya" );
        assert.equal( taxonomy.slugFor( "world", "dark-intent", "en" ), "dark-intent" );
    } );

} );

describe( "taxonomy — one-level hierarchy: parent expansion and ancestry", () => {

    const taxonomy = new Taxonomy( vocabulary() );

    it( "expands a parent to itself plus its direct children (the §8 invariant)", () => {
        assert.deepEqual( taxonomy.expand( "world", "dark-intent" ), [ "dark-intent", "alexander-dark", "occult-crimes" ] );
        assert.ok( taxonomy.expand( "world", "dark-intent" ).includes( "alexander-dark" ),
            "a post tagged alexander-dark is matched by a dark-intent query" );
    } );

    it( "expands a leaf or childless term to just itself", () => {
        assert.deepEqual( taxonomy.expand( "world", "alexander-dark" ), [ "alexander-dark" ] );
        assert.deepEqual( taxonomy.expand( "world", "anarandaris" ), [ "anarandaris" ] );
    } );

    it( "expands an unknown term to nothing", () => {
        assert.deepEqual( taxonomy.expand( "world", "nope" ), [] );
    } );

    it( "reports the direct parent as ancestor, and none for a root", () => {
        assert.deepEqual( taxonomy.ancestors( "world", "alexander-dark" ).map( ( t ) => t.id ), [ "dark-intent" ] );
        assert.deepEqual( taxonomy.ancestors( "world", "dark-intent" ), [] );
    } );

    it( "lists the direct children of a parent", () => {
        assert.deepEqual( taxonomy.children( "world", "dark-intent" ).map( ( t ) => t.id ), [ "alexander-dark", "occult-crimes" ] );
        assert.deepEqual( taxonomy.children( "world", "anarandaris" ), [] );
    } );

} );

describe( "taxonomy — robustness", () => {

    it( "tolerates an empty or missing vocabulary", () => {
        const empty = new Taxonomy();
        assert.deepEqual( empty.terms( "world" ), [] );
        assert.equal( empty.resolve( "world", "x" ), null );
        assert.deepEqual( empty.expand( "world", "x" ), [] );
    } );

    it( "ignores a term whose parent does not exist (treats it as a root)", () => {
        const taxonomy = new Taxonomy( { world: [
            { id: "orphan", parent: "ghost", slug: { en: "orphan" }, label: { en: "Orphan" } }
        ] } );
        assert.deepEqual( taxonomy.ancestors( "world", "orphan" ), [] );
        assert.deepEqual( taxonomy.expand( "world", "orphan" ), [ "orphan" ] );
    } );

} );
