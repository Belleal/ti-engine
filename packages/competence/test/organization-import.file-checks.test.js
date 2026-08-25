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

const REQUIRED = [ "employee_id", "email", "first_name", "last_name", "work_mode",
    "work_location", "organization_unit_id", "role_family", "level", "stage" ];

describe( "organizationImport.findEncodingFailure", () => {

    it( "passes clean UTF-8 text", () => {
        assert.equal( organizationImport.instance.findEncodingFailure( "employee_id,email\n1,a@b.co" ), null );
    } );

    it( "passes text carrying non-ASCII that decoded correctly", () => {
        assert.equal( organizationImport.instance.findEncodingFailure( "first_name\nЗеленка" ), null );
    } );

    it( "reports a replacement character, which is what a mis-decoded file leaves behind", () => {
        assert.deepEqual( organizationImport.instance.findEncodingFailure( "first_name\n��" ), { code: "not-utf8" } );
    } );

    it( "treats an empty or absent input as clean, leaving the header check to report it", () => {
        assert.equal( organizationImport.instance.findEncodingFailure( "" ), null );
        assert.equal( organizationImport.instance.findEncodingFailure( undefined ), null );
    } );

} );

describe( "organizationImport.findHeaderFailure", () => {

    it( "passes a complete header", () => {
        assert.equal( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "gender" ] ) ), null );
    } );

    it( "reports every missing required column, not just the first", () => {
        const header = REQUIRED.filter( ( c ) => c !== "email" && c !== "stage" );
        assert.deepEqual( organizationImport.instance.findHeaderFailure( header ),
            { code: "missing-columns", columns: [ "email", "stage" ] } );
    } );

    it( "reports a repeated column", () => {
        assert.deepEqual( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "gender", "gender" ] ) ),
            { code: "duplicate-columns", columns: [ "gender" ] } );
    } );

    it( "reports each repeated column once even when it appears three times", () => {
        assert.deepEqual( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "gender", "gender", "gender" ] ) ),
            { code: "duplicate-columns", columns: [ "gender" ] } );
    } );

    it( "ignores empty header cells, which a trailing delimiter produces", () => {
        assert.equal( organizationImport.instance.findHeaderFailure( REQUIRED.concat( [ "", "" ] ) ), null );
    } );

    it( "reports missing columns ahead of duplicates when a header has both", () => {
        const header = REQUIRED.filter( ( c ) => c !== "email" ).concat( [ "gender", "gender" ] );
        assert.deepEqual( organizationImport.instance.findHeaderFailure( header ),
            { code: "missing-columns", columns: [ "email" ] } );
    } );

    it( "reports an empty header as missing everything rather than throwing", () => {
        assert.deepEqual( organizationImport.instance.findHeaderFailure( [] ),
            { code: "missing-columns", columns: REQUIRED } );
    } );

} );
