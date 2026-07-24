/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Invariant tests for the content repository (written before content/repository.js) — the single place visibility
 * filtering happens. The marquee guarantee: a deny-all record (role:__none__, or any missing/unrecognised
 * visibility) appears in NO surface — list, count, path resolution, getById, or a curated featured list. Gated
 * records stay listable as teasers; drafts are excluded from every public surface.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildIndex } = require( "#loader" );
const ContentRepository = require( "#repository" );

function post( id, path, extra ) {
    return Object.assign( {
        id: id, type: "post", path: path, lang: "en", title: "T",
        visibility: "public", status: "published", world: "anarandaris", form: "song"
    }, extra || {} );
}

const ANON = undefined;
const AUTHED = { authenticated: true, roles: [] };
const BETA = { authenticated: true, roles: [ "beta" ] };
const ADMIN = { authenticated: true, roles: [ "admin" ] };

describe( "repository — resolveVisibility (the three-outcome primitive)", () => {

    it( "public is visible to everyone", () => {
        const record = post( "a", "/a/" );
        for ( const viewer of [ ANON, AUTHED, BETA ] ) {
            assert.equal( ContentRepository.resolveVisibility( record, viewer ), "visible" );
        }
    } );

    it( "authenticated is gated for anonymous, visible once signed in", () => {
        const record = post( "a", "/a/", { visibility: "authenticated" } );
        assert.equal( ContentRepository.resolveVisibility( record, ANON ), "gated" );
        assert.equal( ContentRepository.resolveVisibility( record, AUTHED ), "visible" );
    } );

    it( "role:X is gated unless the viewer holds X (no implicit admin hierarchy)", () => {
        const record = post( "a", "/a/", { visibility: "role:beta" } );
        assert.equal( ContentRepository.resolveVisibility( record, ANON ), "gated" );
        assert.equal( ContentRepository.resolveVisibility( record, AUTHED ), "gated" );
        assert.equal( ContentRepository.resolveVisibility( record, ADMIN ), "gated", "admin does not auto-hold beta" );
        assert.equal( ContentRepository.resolveVisibility( record, BETA ), "visible" );
    } );

    it( "role:__none__ and any missing/unrecognised visibility are hidden from everyone", () => {
        const deny = post( "a", "/a/", { visibility: "role:__none__" } );
        const missing = post( "b", "/b/" );
        delete missing.visibility;
        const bogus = post( "c", "/c/", { visibility: "secret" } );
        for ( const viewer of [ ANON, AUTHED, BETA, ADMIN ] ) {
            assert.equal( ContentRepository.resolveVisibility( deny, viewer ), "hidden" );
            assert.equal( ContentRepository.resolveVisibility( missing, viewer ), "hidden" );
            assert.equal( ContentRepository.resolveVisibility( bogus, viewer ), "hidden" );
        }
    } );

} );

describe( "repository — resolve(path)", () => {

    const repo = new ContentRepository( buildIndex( [
        post( "pub", "/pub/" ),
        post( "gated", "/gated/", { visibility: "authenticated" } ),
        post( "deny", "/deny/", { visibility: "role:__none__" } ),
        post( "draft", "/draft/", { status: "draft" } ),
        post( "aliased", "/canonical/", { aliases: [ "/old-path/" ] } )
    ] ) );

    it( "returns a visible hit for a public record", () => {
        assert.deepEqual( repo.resolve( "/pub/", ANON ), { outcome: "visible", record: repo.getById( "pub", ANON ).record } );
    } );

    it( "returns a gated hit for a restricted record the viewer cannot access, visible once they can", () => {
        assert.equal( repo.resolve( "/gated/", ANON ).outcome, "gated" );
        assert.equal( repo.resolve( "/gated/", AUTHED ).outcome, "visible" );
    } );

    it( "404s (miss) a hidden record and a draft on direct access", () => {
        assert.equal( repo.resolve( "/deny/", ADMIN ).outcome, "miss" );
        assert.equal( repo.resolve( "/draft/", ADMIN ).outcome, "miss" );
    } );

    it( "301s an alias to the canonical path", () => {
        assert.deepEqual( repo.resolve( "/old-path/", ANON ), { outcome: "alias", redirectTo: "/canonical/" } );
    } );

    it( "misses an unknown path", () => {
        assert.equal( repo.resolve( "/nope/", ANON ).outcome, "miss" );
    } );

} );

describe( "repository — list / count / featured go through the one filter", () => {

    function makeRepo() {
        return new ContentRepository( buildIndex( [
            post( "pub", "/pub/", { publishedAt: "2026-03-01T00:00:00Z" } ),
            post( "gated", "/gated/", { visibility: "authenticated", publishedAt: "2026-05-01T00:00:00Z" } ),
            post( "deny", "/deny/", { visibility: "role:__none__", publishedAt: "2026-04-01T00:00:00Z" } ),
            post( "draft", "/draft/", { status: "draft", publishedAt: "2026-06-01T00:00:00Z" } )
        ] ) );
    }

    it( "lists visible + gated (as teasers) and excludes hidden + drafts", () => {
        const items = makeRepo().list( {}, ANON );
        const ids = items.map( ( i ) => i.record.id ).sort();
        assert.deepEqual( ids, [ "gated", "pub" ] );
        const verdicts = {};
        items.forEach( ( i ) => { verdicts[ i.record.id ] = i.verdict; } );
        assert.equal( verdicts.pub, "visible" );
        assert.equal( verdicts.gated, "gated" );
    } );

    it( "count matches the listable set and ignores limit", () => {
        const repo = makeRepo();
        assert.equal( repo.count( {}, ANON ), 2 );
        assert.equal( repo.list( { limit: 1 }, ANON ).length, 1 );
        assert.equal( repo.count( { limit: 1 }, ANON ), 2 );
    } );

    it( "filters by type, taxonomy facet, and language", () => {
        const repo = new ContentRepository( buildIndex( [
            post( "en1", "/en1/", { world: "anarandaris", form: "song" } ),
            post( "en2", "/en2/", { world: "dark-intent", form: "chapter" } ),
            post( "bg1", "/bg/bg1/", { lang: "bg", form: "blog" } )
        ] ) );
        assert.equal( repo.list( { world: "dark-intent" }, ANON ).length, 1 );
        assert.equal( repo.list( { form: "song" }, ANON ).length, 1 );
        assert.equal( repo.list( { lang: "bg" }, ANON ).length, 1 );
        assert.equal( repo.list( { type: "book" }, ANON ).length, 0 );
    } );

    it( "sorts most-recent-first on sort:recent", () => {
        const items = makeRepo().list( { sort: "recent" }, AUTHED );
        assert.deepEqual( items.map( ( i ) => i.record.id ), [ "gated", "pub" ] );
    } );

} );

describe( "repository — the marquee invariant: a deny-all record appears in no surface", () => {

    const repo = new ContentRepository( buildIndex( [
        post( "seen", "/seen/" ),
        post( "deny", "/deny/", { visibility: "role:__none__", aliases: [ "/deny-old/" ] } )
    ] ) );

    it( "is absent from list and count for every viewer", () => {
        for ( const viewer of [ ANON, AUTHED, BETA, ADMIN ] ) {
            assert.deepEqual( repo.list( {}, viewer ).map( ( i ) => i.record.id ), [ "seen" ] );
            assert.equal( repo.count( {}, viewer ), 1 );
        }
    } );

    it( "cannot be reached by path or getById, and is dropped from a featured list", () => {
        assert.equal( repo.resolve( "/deny/", ADMIN ).outcome, "miss" );
        assert.equal( repo.getById( "deny", ADMIN ), null );
        const featured = repo.resolveIds( [ "seen", "deny", "unknown" ], ADMIN );
        assert.deepEqual( featured.map( ( i ) => i.record.id ), [ "seen" ] );
    } );

    it( "stays hidden even if a bogus visibility bypasses the schema (repository defense-in-depth)", () => {
        // A record the loader would have rejected, injected straight into a hand-built index.
        const rogue = { id: "rogue", type: "post", path: "/rogue/", lang: "en", title: "T", visibility: "totally-made-up", status: "published" };
        const handIndex = {
            byId: new Map( [ [ "rogue", rogue ] ] ),
            byPath: new Map( [ [ "/rogue/", rogue ] ] ),
            byAlias: new Map(),
            byType: new Map( [ [ "post", [ rogue ] ] ] ),
            all: [ rogue ]
        };
        const rogueRepo = new ContentRepository( handIndex );
        assert.equal( rogueRepo.list( {}, ADMIN ).length, 0 );
        assert.equal( rogueRepo.resolve( "/rogue/", ADMIN ).outcome, "miss" );
    } );

} );

describe( "repository — featured (curated ids) is visibility-filtered", () => {

    const repo = new ContentRepository( buildIndex( [
        post( "pub", "/pub/" ),
        post( "gated", "/gated/", { visibility: "authenticated" } ),
        post( "deny", "/deny/", { visibility: "role:__none__" } ),
        post( "draft", "/draft/", { status: "draft" } )
    ] ) );

    it( "keeps visible and gated (teaser) ids in curated order, drops hidden/draft/unknown", () => {
        const items = repo.resolveIds( [ "gated", "deny", "pub", "draft", "missing" ], ANON );
        assert.deepEqual( items.map( ( i ) => i.record.id ), [ "gated", "pub" ] );
        assert.equal( items[ 0 ].verdict, "gated" );
        assert.equal( items[ 1 ].verdict, "visible" );
    } );

} );
