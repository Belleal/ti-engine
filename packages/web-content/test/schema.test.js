/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Invariant tests for the content schema (written before content/schema.js).
 *
 * The load-bearing one is deny-by-default visibility: a record with no explicit, recognised `visibility` must never
 * validate. The schema makes that a hard failure so the loader logs it loudly; the repository (P1d) is the second
 * layer that keeps such a record out of every query surface.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { validateRecord, validateCapture, VISIBILITY_PATTERN, CONTENT_TYPES } = require( "#schema" );

function basePost( overrides ) {
    return Object.assign( {
        id: "p1",
        type: "post",
        path: "/2026/03/20/the-sounds-of-anarandaris/",
        lang: "en",
        title: "The Sounds of Anarand'aris",
        visibility: "public",
        status: "published",
        world: "anarandaris",
        form: "song",
        body: "Some prose."
    }, overrides || {} );
}

function validPage() {
    return {
        id: "pg1", type: "page", path: "/writings/", lang: "en", title: "Writings",
        visibility: "public", status: "published",
        sections: [ { type: "hero", title: "Writings" }, { type: "postList", limit: 10 } ]
    };
}

function validBook() {
    return {
        id: "b1", type: "book", path: "/books/heart-of-anarand/", lang: "en", title: "The Heart of Anarand",
        visibility: "public", status: "published",
        cover: "/uploads/cover.jpg", blurb: "An epic."
    };
}

function validRelease() {
    return {
        id: "r1", type: "release", path: "/music/scarlet-requiem/", lang: "en", title: "The Scarlet Requiem",
        visibility: "public", status: "published",
        releaseState: "prerelease", format: "ep", cover: "/uploads/sr.jpg", tracks: []
    };
}

describe( "content schema — valid records", () => {

    it( "accepts a well-formed record of every content type", () => {
        assert.equal( validateRecord( basePost() ).valid, true );
        assert.equal( validateRecord( validPage() ).valid, true );
        assert.equal( validateRecord( validBook() ).valid, true );
        assert.equal( validateRecord( validRelease() ).valid, true );
    } );

    it( "exposes the four content types", () => {
        assert.deepEqual( [ ...CONTENT_TYPES ].sort(), [ "book", "page", "post", "release" ] );
    } );

} );

describe( "content schema — deny-by-default visibility", () => {

    it( "rejects a record with no visibility field (never silently accepted)", () => {
        const record = basePost();
        delete record.visibility;
        const result = validateRecord( record );
        assert.equal( result.valid, false );
        assert.ok( result.errors.some( ( e ) => e.includes( "visibility" ) ), "error should name the missing visibility" );
    } );

    it( "rejects an unrecognised visibility value", () => {
        assert.equal( validateRecord( basePost( { visibility: "secret" } ) ).valid, false );
        assert.equal( validateRecord( basePost( { visibility: "role:" } ) ).valid, false, "empty role name" );
        assert.equal( validateRecord( basePost( { visibility: "public " } ) ).valid, false, "trailing space" );
        assert.equal( validateRecord( basePost( { visibility: "" } ) ).valid, false );
    } );

    it( "accepts every recognised visibility form", () => {
        for ( const visibility of [ "public", "authenticated", "role:admin", "role:beta-2" ] ) {
            assert.equal( validateRecord( basePost( { visibility: visibility } ) ).valid, true, visibility );
        }
    } );

    it( "exports a visibility pattern anchored end-to-end", () => {
        assert.ok( new RegExp( VISIBILITY_PATTERN ).test( "public" ) );
        assert.ok( !new RegExp( VISIBILITY_PATTERN ).test( "role:Bad Name" ) );
    } );

} );

describe( "content schema — type and envelope integrity", () => {

    it( "rejects an unknown or missing content type", () => {
        assert.equal( validateRecord( basePost( { type: "widget" } ) ).valid, false );
        const noType = basePost();
        delete noType.type;
        assert.equal( validateRecord( noType ).valid, false );
    } );

    it( "rejects a non-object", () => {
        assert.equal( validateRecord( null ).valid, false );
        assert.equal( validateRecord( "nope" ).valid, false );
        assert.equal( validateRecord( [ basePost() ] ).valid, false );
    } );

    it( "requires the core envelope fields", () => {
        for ( const field of [ "id", "path", "lang", "title", "status" ] ) {
            const record = basePost();
            delete record[ field ];
            assert.equal( validateRecord( record ).valid, false, `missing ${ field } should fail` );
        }
    } );

    it( "pins each record to its own type (a post cannot claim type book)", () => {
        assert.equal( validateRecord( basePost( { type: "book" } ) ).valid, false );
    } );

} );

describe( "content schema — per-type requirements", () => {

    it( "requires a post to carry its world and form taxonomy", () => {
        const noWorld = basePost();
        delete noWorld.world;
        assert.equal( validateRecord( noWorld ).valid, false );
        const noForm = basePost();
        delete noForm.form;
        assert.equal( validateRecord( noForm ).valid, false );
    } );

    it( "requires a page's sections to declare a recognised section type", () => {
        const page = validPage();
        page.sections = [ { type: "bogus" } ];
        assert.equal( validateRecord( page ).valid, false );
        const noSections = validPage();
        delete noSections.sections;
        assert.equal( validateRecord( noSections ).valid, false );
    } );

    it( "requires a release to carry releaseState, format, and cover", () => {
        const release = validRelease();
        delete release.format;
        assert.equal( validateRecord( release ).valid, false );
    } );

} );

describe( "content schema — capture (data, not content)", () => {

    it( "accepts a well-formed capture record", () => {
        assert.equal( validateCapture( {
            email: "reader@example.com",
            purpose: "preorder:echo-of-scarlet-song",
            consentAt: "2026-07-24T10:00:00Z",
            locale: "en"
        } ).valid, true );
    } );

    it( "requires email, purpose, and consentAt", () => {
        for ( const field of [ "email", "purpose", "consentAt" ] ) {
            const record = { email: "r@example.com", purpose: "newsletter", consentAt: "2026-07-24T10:00:00Z" };
            delete record[ field ];
            assert.equal( validateCapture( record ).valid, false, `missing ${ field } should fail` );
        }
    } );

    it( "is separate from content validation — a capture is not a content record", () => {
        assert.equal( validateRecord( { email: "r@example.com", purpose: "newsletter", consentAt: "x" } ).valid, false );
    } );

} );
