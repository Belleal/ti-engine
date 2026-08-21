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

    it( "counts a delimiter only outside quotes, so a quoted header cell can't skew detection", () => {
        assert.equal( organizationImport.instance.detectDelimiter( '"last, first";age' ), ";" );
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

    it( "keeps a quoted empty field instead of treating it as missing", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'a,b\n"",x' ), [ [ "a", "b" ], [ "", "x" ] ] );
    } );

    it( "keeps a trailing delimiter as an empty final field", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b,c\n1,2," ), [ [ "a", "b", "c" ], [ "1", "2", "" ] ] );
    } );

    it( "keeps a row of only delimiters instead of discarding it as blank", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( ",," ), [ [ "", "", "" ] ] );
    } );

    it( "accepts an unterminated quote at end of input as implicitly closed", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( 'a,b\n"unclosed' ), [ [ "a", "b" ], [ "unclosed" ] ] );
    } );

    it( "preserves a CRLF inside a quoted field while normalizing a CRLF line ending outside quotes", () => {
        const rows = organizationImport.instance.parseDelimited( "a,b\r\n\"line1\r\nline2\",x\r\n" );
        assert.deepEqual( rows, [ [ "a", "b" ], [ "line1\r\nline2", "x" ] ] );
    } );

    it( "auto-detects the semicolon delimiter for a quoted header with an internal comma, then parses two columns per row", () => {
        const rows = organizationImport.instance.parseDelimited( '"last, first";age\n"Smith, Ada";30' );
        assert.deepEqual( rows, [ [ "last, first", "age" ], [ "Smith, Ada", "30" ] ] );
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

// CA-107 code review, finding 1: __row was the record's position in the parsed array, not its physical line in the
// source file -- parseDelimited skips blank lines and collapses a quoted embedded newline into one row, so the two
// diverge on exactly those two inputs. The fix is additive (parseDelimited's withLines option; toRecords' lines
// parameter), so the 22 tests above are untouched and keep asserting the byte-identical default. These describe
// blocks cover the new, opt-in behaviour only.
describe( "organizationImport.parseDelimited — withLines (CA-107, finding 1)", () => {

    it( "does not change the default return shape when withLines is omitted", () => {
        assert.deepEqual( organizationImport.instance.parseDelimited( "a,b\n1,2" ), [ [ "a", "b" ], [ "1", "2" ] ] );
    } );

    it( "reports the physical start line per row, skipping past a blank line mid-file", () => {
        const { rows, lines } = organizationImport.instance.parseDelimited( "a,b\n1,2\n\n3,4\n", { withLines: true } );
        assert.deepEqual( rows, [ [ "a", "b" ], [ "1", "2" ], [ "3", "4" ] ] );
        // Source lines: 1 header, 2 "1,2", 3 blank (never becomes a row), 4 "3,4". The row after the blank line
        // must report its true physical line (4), not its position in the returned array (which would be 3).
        assert.deepEqual( lines, [ 1, 2, 4 ] );
    } );

    it( "reports the correct start line for the row that follows a quoted embedded newline", () => {
        const { rows, lines } = organizationImport.instance.parseDelimited( 'a,b\n"line1\nline2",x\n3,4\n', { withLines: true } );
        assert.deepEqual( rows, [ [ "a", "b" ], [ "line1\nline2", "x" ], [ "3", "4" ] ] );
        // The second row's quoted field swallows one physical newline, so that row spans source lines 2-3. The
        // row after it must start counting from line 4, not line 3 (its position in the returned array).
        assert.deepEqual( lines, [ 1, 2, 4 ] );
    } );

} );

describe( "organizationImport.toRecords — consuming withLines (CA-107, finding 1)", () => {

    it( "keeps naming __row by row position when no lines array is supplied, unchanged from before", () => {
        const { records } = organizationImport.instance.toRecords( [ [ "a" ], [ "1" ], [ "2" ] ] );
        assert.deepEqual( records.map( ( record ) => record.__row ), [ 2, 3 ] );
    } );

    it( "names __row by the true physical line for a row after a blank line, when parsed with withLines", () => {
        const parsed = organizationImport.instance.parseDelimited( "employee_id\n1\n\n2\n", { withLines: true } );
        const { records } = organizationImport.instance.toRecords( parsed.rows, parsed.lines );
        // Without the fix this would read [ 2, 3 ] -- the second data row's position, not its source line (4).
        assert.deepEqual( records.map( ( record ) => record.__row ), [ 2, 4 ] );
    } );

    it( "names __row by the true physical line for a row after a quoted embedded newline, when parsed with withLines", () => {
        const parsed = organizationImport.instance.parseDelimited( 'note,employee_id\n"line1\nline2",1\n2\n', { withLines: true } );
        const { records } = organizationImport.instance.toRecords( parsed.rows, parsed.lines );
        assert.deepEqual( records.map( ( record ) => record.__row ), [ 2, 4 ] );
    } );

} );
