/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The work-sites configuration document (CA-109) — structural schema plus the one document-intrinsic rule the
 * schema cannot express. JSON Schema has no way to say "this property's value equals its property name", so an
 * `id` that disagrees with its map key would otherwise go unenforced, exactly as it did for organization units
 * before CA-107 added organizationIdMatchesKey.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const Ajv = require( "ajv" );

const schema = require( "../bin/data/schemas/work-sites.schema.json" );
const defaultValue = require( "../bin/config/config.work-sites.json" );
const validators = require( "../application/config-validators" );

// ajv 6 (shipped via the workspace) doesn't know the Draft 2020-12 meta-schema our schema files declare in
// `$schema` (added for editor support) and, by default, tries to validate the schema document against it before
// compiling -- see json-config-validation.test.js's buildAjv() for the same workaround. Our schema uses only
// Draft-07-compatible keywords, so skipping that meta-check and letting ajv use its native keyword set is safe.
const validate = new Ajv( { allErrors: true, strict: false, validateSchema: false } ).compile( schema );

const site = ( id, type ) => ( { id: id, type: type, name: { en: `${ id } EN`, bg: `${ id } BG` } } );

describe( "work-sites schema", () => {

    it( "accepts the shipped default", () => {
        assert.equal( validate( defaultValue ), true, JSON.stringify( validate.errors ) );
    } );

    it( "accepts both permitted types", () => {
        assert.equal( validate( { A: site( "A", "office" ), B: site( "B", "client" ) } ), true );
    } );

    it( "rejects an unknown type", () => {
        assert.equal( validate( { A: site( "A", "warehouse" ) } ), false );
    } );

    it( "rejects a missing or empty name side", () => {
        assert.equal( validate( { A: { id: "A", type: "office", name: { en: "A" } } } ), false );
        assert.equal( validate( { A: { id: "A", type: "office", name: { en: "A", bg: "" } } } ), false );
    } );

    it( "rejects an unknown property", () => {
        assert.equal( validate( { A: { ...site( "A", "office" ), address: "Sofia" } } ), false );
    } );

} );

describe( "workSiteIdMatchesKey", () => {

    it( "passes when every id equals its key", async () => {
        assert.deepEqual( await validators.workSiteIdMatchesKey( { HQ: site( "HQ", "office" ) } ), [] );
    } );

    it( "reports an id that disagrees with its key", async () => {
        // The key is what an operator edits, so a mismatch means the two name different sites.
        const issues = await validators.workSiteIdMatchesKey( { HQ: site( "HQX", "office" ) } );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "id-key-mismatch" );
        assert.equal( issues[ 0 ].path, ".HQ" );
        assert.match( issues[ 0 ].message, /HQX/ );
    } );

    it( "reports an absent id rather than throwing", async () => {
        const issues = await validators.workSiteIdMatchesKey( { HQ: { type: "office", name: { en: "x", bg: "x" } } } );
        assert.equal( issues.length, 1 );
        assert.match( issues[ 0 ].message, /\(absent\)/ );
    } );

    it( "treats a null document as empty", async () => {
        assert.deepEqual( await validators.workSiteIdMatchesKey( null ), [] );
    } );

} );
