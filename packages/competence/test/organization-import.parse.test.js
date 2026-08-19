/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

describe( "organizationImport.detectDelimiter", () => {

    it( "detects a comma", () => {
        assert.equal( organizationImport.instance.detectDelimiter( "a,b,c\n1,2,3" ), "," );
    } );

    it( "detects a semicolon, the European Excel default", () => {
        assert.equal( organizationImport.instance.detectDelimiter( "a;b;c\n1;2;3" ), ";" );
    } );

    it( "prefers the delimiter that appears more often in the header", () => {
        assert.equal( organizationImport.instance.detectDelimiter( "last_name;first_name;note\nSmith, Jr.;Ada;x" ), ";" );
    } );

} );

describe( "organizationImport.parseDelimited", () => {

    it( "parses a simple file", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\n1,2" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "keeps a delimiter inside a quoted field", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'name,unit\n"Smith, Jr.",1-1' ), [ [ "name", "unit" ], [ "Smith, Jr.", "1-1" ] ] );
    } );

    it( "unescapes a doubled quote", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'a\n"say ""hi"""' ), [ [ "a" ], [ 'say "hi"' ] ] );
    } );

    it( "keeps a newline inside a quoted field", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'a,b\n"line1\nline2",x' ), [ [ "a", "b" ], [ "line1\nline2", "x" ] ] );
    } );

    it( "handles CRLF line endings", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\r\n1,2\r\n" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "strips a UTF-8 BOM so the first header cell still matches", () => {
        const rows = organizationImport.instance.parseDelimited( "﻿employee_id,email\n1,a@b.co" );
        assert.equal( rows[ 0 ][ 0 ], "employee_id" );
    } );

    it( "skips blank lines", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\n\n1,2\n\n" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "honours an explicit delimiter override", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a;b\n1;2", { delimiter: ";" } ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "preserves a leading zero in an ID", () => {
        const rows = organizationImport.instance.parseDelimited( "employee_id\n00123" );
        assert.equal( rows[ 1 ][ 0 ], "00123" );
    } );

} );

describe( "organizationImport.toRecords", () => {

    it( "maps rows onto trimmed, lower-cased header keys", () => {
        const { header, records } = organizationImport.instance.toRecords( [ [ " Employee_ID ", "Email" ], [ "1", "a@b.co" ] ] );
        assert.deepEqual( header, [ "employee_id", "email" ] );
        assert.deepEqual( records, [ { employee_id: "1", email: "a@b.co", __row: 2 } ] );
    } );

    it( "returns no records for a header-only file", () => {
        const { records } = organizationImport.instance.toRecords( [ [ "employee_id" ] ] );
        assert.deepEqual( records, [] );
    } );

    it( "pads a short row rather than dropping it, so the row still reports its own errors", () => {
        const { records } = organizationImport.instance.toRecords( [ [ "a", "b" ], [ "1" ] ] );
        assert.deepEqual( records, [ { a: "1", b: "", __row: 2 } ] );
    } );

} );
