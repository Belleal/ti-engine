/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the content source reader. The binding constraint is CLAUDE.md 5: content is NEVER discovered by
 * scanning a directory -- sources are explicitly registered, because globbing a content folder is how an unpublished
 * manuscript ends up served. These tests pin that: a directory is an error, not an expansion, and only listed files
 * are ever read.
 */

const { describe, it, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );
const { parseRecord, parseVocabulary, readSources, readVocabulary } = require( "#sources" );

const tempDir = fs.mkdtempSync( path.join( os.tmpdir(), "ti-web-content-" ) );
after( () => fs.rmSync( tempDir, { recursive: true, force: true } ) );

function writeFile( name, contents ) {
    const filePath = path.join( tempDir, name );
    fs.writeFileSync( filePath, contents, "utf8" );
    return filePath;
}

describe( "sources — parseRecord (pure)", () => {

    it( "parses markdown front-matter into the envelope and the body", () => {
        const record = parseRecord( "---\nid: p1\ntype: post\nvisibility: public\n---\nThe *body*.\n", { format: "markdown" } );
        assert.equal( record.id, "p1" );
        assert.equal( record.type, "post" );
        assert.equal( record.visibility, "public" );
        assert.equal( record.body.trim(), "The *body*." );
        assert.equal( record.bodyFormat, "markdown", "markdown sources default to bodyFormat markdown" );
    } );

    it( "does not invent a bodyFormat when the front-matter declares one", () => {
        const record = parseRecord( "---\nid: p1\nbodyFormat: html\n---\n<p>legacy</p>\n", { format: "markdown" } );
        assert.equal( record.bodyFormat, "html" );
    } );

    it( "parses a pure YAML record with no body", () => {
        const record = parseRecord( "id: pg1\ntype: page\nvisibility: public\nsections:\n  - type: hero\n", { format: "yaml" } );
        assert.equal( record.id, "pg1" );
        assert.equal( record.type, "page" );
        assert.deepEqual( record.sections, [ { type: "hero" } ] );
        assert.equal( record.body, undefined, "a structured record carries no body" );
    } );

    it( "omits an empty markdown body rather than setting an empty string", () => {
        const record = parseRecord( "---\nid: p1\n---\n\n", { format: "markdown" } );
        assert.equal( record.body, undefined );
    } );

    it( "throws on malformed YAML rather than returning a half-parsed record", () => {
        assert.throws( () => parseRecord( "id: [unclosed\n", { format: "yaml" } ) );
    } );

    it( "normalises YAML-parsed dates to ISO-8601 strings, not Date objects", () => {
        // YAML silently converts an unquoted ISO timestamp into a Date, which would fail the string schema and
        // exclude an otherwise valid record. Caught by an end-to-end smoke test on real content.
        const record = parseRecord( "---\nid: p1\npublishedAt: 2026-03-20T00:00:00Z\n---\nx\n", { format: "markdown" } );
        assert.equal( typeof record.publishedAt, "string" );
        assert.equal( record.publishedAt, "2026-03-20T00:00:00.000Z" );
    } );

    it( "normalises dates nested inside structured YAML records too", () => {
        const record = parseRecord( "id: r1\nreleaseDate: 2026-05-01\ntracks:\n  - recordedAt: 2025-11-02\n", { format: "yaml" } );
        assert.equal( typeof record.releaseDate, "string" );
        assert.equal( typeof record.tracks[ 0 ].recordedAt, "string" );
    } );

    it( "leaves an explicitly quoted date string untouched", () => {
        const record = parseRecord( "---\nid: p1\npublishedAt: \"2026-03-20\"\n---\nx\n", { format: "markdown" } );
        assert.equal( record.publishedAt, "2026-03-20" );
    } );

} );

describe( "sources — parseVocabulary (pure)", () => {

    it( "parses a taxonomies vocabulary", () => {
        const vocabulary = parseVocabulary( "world:\n  - id: dark-intent\n    label:\n      en: Dark Intent\nform:\n  - id: song\n" );
        assert.equal( vocabulary.world[ 0 ].id, "dark-intent" );
        assert.equal( vocabulary.form[ 0 ].id, "song" );
    } );

    it( "returns an empty vocabulary for empty input", () => {
        assert.deepEqual( parseVocabulary( "" ), {} );
    } );

} );

describe( "sources — readSources reads only what is explicitly registered", () => {

    it( "reads the listed files and reports none as errors", () => {
        const a = writeFile( "a.md", "---\nid: a\ntype: post\nvisibility: public\n---\nBody A\n" );
        const b = writeFile( "b.yml", "id: b\ntype: page\nvisibility: public\n" );
        const result = readSources( [ a, b ] );
        assert.equal( result.errors.length, 0 );
        assert.deepEqual( result.records.map( ( r ) => r.id ).sort(), [ "a", "b" ] );
    } );

    it( "NEVER expands a directory -- it is reported as an error, not scanned (CLAUDE.md 5)", () => {
        writeFile( "unpublished-manuscript.md", "---\nid: leak\ntype: post\nvisibility: public\n---\nSecret\n" );
        const result = readSources( [ tempDir ] );
        assert.equal( result.records.length, 0, "a directory must yield no records" );
        assert.equal( result.errors.length, 1 );
        assert.ok( /director/i.test( result.errors[ 0 ].error ), "the error should say it is a directory" );
    } );

    it( "exposes no directory-scanning function at all", () => {
        const api = require( "#sources" );
        for ( const name of Object.keys( api ) ) {
            assert.ok( !/glob|scan|readdir|discover|walk/i.test( name ), `unexpected discovery API: ${ name }` );
        }
    } );

    it( "reports a missing or malformed file without throwing, and keeps the good ones", () => {
        const good = writeFile( "good.md", "---\nid: good\ntype: post\nvisibility: public\n---\nx\n" );
        const bad = writeFile( "bad.yml", "id: [unclosed\n" );
        const result = readSources( [ good, path.join( tempDir, "nope.md" ), bad ] );
        assert.deepEqual( result.records.map( ( r ) => r.id ), [ "good" ] );
        assert.equal( result.errors.length, 2 );
        assert.ok( result.errors.every( ( e ) => typeof e.source === "string" && typeof e.error === "string" ) );
    } );

    it( "records the source path on each record for diagnostics", () => {
        const a = writeFile( "traceable.md", "---\nid: t\ntype: post\nvisibility: public\n---\nx\n" );
        assert.equal( readSources( [ a ] ).records[ 0 ].sourcePath, a );
    } );

    it( "tolerates a null / non-array source list", () => {
        assert.deepEqual( readSources( null ), { records: [], errors: [] } );
    } );

} );

describe( "sources — readVocabulary", () => {

    it( "reads a vocabulary file from disk", () => {
        const file = writeFile( "taxonomies.yml", "world:\n  - id: anarandaris\n" );
        assert.equal( readVocabulary( file ).world[ 0 ].id, "anarandaris" );
    } );

} );
