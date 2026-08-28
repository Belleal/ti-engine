/*
 * The ti-engine competence application — competency-based performance appraisals.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General
 * Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see
 * <https://www.gnu.org/licenses/>.
*/

/**
 * End-to-end guard for the Employee Management audit tab's field labels.
 * <br/>
 * Every field the editor can change writes one audit entry keyed by its dotted employee field path, and the Audit
 * tab renders that path through `getAuditFieldLabel`, which is `tiApplication.getLabel( "<group>." + field, field )`
 * — so the fallback is the raw path itself. Two things have to hold, and neither is visible from one side alone:
 * the catalogue must carry a label for every diffable field path, and the client resolver must be able to find a
 * key that itself contains a dot. When the resolver could not, the screen showed "personal.workSite" to users
 * indefinitely, and no test noticed because the label was present all along.
 * <br/>
 * So this asserts the whole round trip: the field list is read from the screen's own `computeDiff` table, the
 * catalogue is the one `getAllLabels` hands the client, and the lookup runs through the real `getLabel` out of the
 * web-framework's browser bundle.
 */

const path = require( "node:path" );

// Point core's localization at this application's catalogue before the module initializes, so `getAllLabels`
// returns the bundle a real session receives. `localization.js` resolves the configured path against
// `process.cwd()`, which differs between `npm test` at the workspace root and inside the package, hence the
// relative form (mirrors `competence-web-application.profile-about.test.js`).
process.env.TI_LOCALIZATION_LABELS_PATH = path.relative(
    process.cwd(),
    path.join( __dirname, "..", "bin", "localization", "competence-labels.json" )
);

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );

const localization = require( "@ti-engine/core/localization" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const UI_SCRIPT_PATH = path.join( PACKAGE_ROOT, "bin", "static", "scripts", "competence-user-interface.js" );
const LABELS_PATH = path.join( PACKAGE_ROOT, "bin", "localization", "competence-labels.json" );

// The client-side resolver under test ships with the web-framework as a browser script, so it is loaded through
// that package's own sandbox helper rather than reimplemented here — a second copy of the lookup rules would
// happily agree with itself while the shipped one stayed broken.
const { loadTiFramework } = require( path.join( PACKAGE_ROOT, "..", "web-framework", "test", "helpers", "ti-framework-sandbox.js" ) );

const uiScript = fs.readFileSync( UI_SCRIPT_PATH, "utf8" );
const rawLabels = JSON.parse( fs.readFileSync( LABELS_PATH, "utf8" ) );

/**
 * The label-group prefix `getAuditFieldLabel` concatenates the field path onto, read from the screen's own source
 * so that renaming the group breaks this test instead of the screen.
 *
 * @constant
 * @type {string}
 */
const AUDIT_LABEL_PREFIX = ( () => {
    const match = /getAuditFieldLabel\([^)]*\)\s*\{\s*return\s+tiApplication\.getLabel\(\s*"([^"]+)"/.exec( uiScript );
    assert.ok( match, "could not locate getAuditFieldLabel in competence-user-interface.js" );
    return match[ 1 ];
} )();

/**
 * Every field path the Employee Management editor can send, read from the screen's `computeDiff` table — the same
 * paths the server records as `field` on each audit entry.
 *
 * @constant
 * @type {string[]}
 */
const DIFFABLE_FIELD_PATHS = ( () => {
    const block = /computeDiff\(\)\s*\{[\s\S]*?const fields = \[([\s\S]*?)\];/.exec( uiScript );
    assert.ok( block, "could not locate the computeDiff field table in competence-user-interface.js" );
    return [ ...block[ 1 ].matchAll( /\[\s*"([^"]+)"/g ) ].map( ( match ) => match[ 1 ] );
} )();

/**
 * Field paths written as audit entries outside the editor diff — the supervisor grant/revoke path in
 * `data-manager.js` appends its own entry.
 *
 * @constant
 * @type {string[]}
 */
const EXTRA_FIELD_PATHS = [ "supervisorRole" ];

const AUDIT_FIELD_PATHS = DIFFABLE_FIELD_PATHS.concat( EXTRA_FIELD_PATHS );

const { stores } = loadTiFramework();
const tiApplication = stores.tiApplication;

/**
 * Resolves an audit field label exactly the way the Audit tab does, against the catalogue a session of the given
 * language receives.
 *
 * @method
 * @param {string} language
 * @param {string} fieldPath
 * @returns {string}
 * @private
 */
function auditFieldLabel( language, fieldPath ) {
    tiApplication.configuration = { labels: localization.getAllLabels( language ) };
    return tiApplication.getLabel( AUDIT_LABEL_PREFIX + fieldPath, fieldPath );
}

describe( "employee audit field labels — the field list itself", () => {

    it( "reads a plausible set of field paths out of the screen", () => {
        assert.ok( DIFFABLE_FIELD_PATHS.length >= 15, `expected the computeDiff table to hold every editable field, parsed ${ DIFFABLE_FIELD_PATHS.length }` );
        assert.ok( DIFFABLE_FIELD_PATHS.includes( "personal.workSite" ), "personal.workSite must be in the parsed field table" );
        assert.ok( DIFFABLE_FIELD_PATHS.includes( "career.positionName" ), "career.positionName must be in the parsed field table" );
    } );

    it( "resolves the audit label group from the screen source", () => {
        assert.equal( AUDIT_LABEL_PREFIX, "interface.employee-management.audit.field." );
    } );

} );

describe( "employee audit field labels — catalogue coverage", () => {

    const group = AUDIT_LABEL_PREFIX.replace( /\.$/, "" ).split( "." ).reduce( ( node, key ) => node[ key ], rawLabels );

    AUDIT_FIELD_PATHS.forEach( ( fieldPath ) => {
        it( `carries copy in both languages for "${ fieldPath }"`, () => {
            const entry = group[ fieldPath ];
            assert.ok( entry, `missing audit field label for "${ fieldPath }"` );
            assert.ok( entry.en && entry.en.trim().length > 0, `English copy is required for "${ fieldPath }"` );
            assert.ok( entry.bg && entry.bg.trim().length > 0, `Bulgarian copy is required for "${ fieldPath }"` );
        } );
    } );

} );

describe( "employee audit field labels — round trip through the client bundle", () => {

    [ "en", "bg" ].forEach( ( language ) => {
        AUDIT_FIELD_PATHS.forEach( ( fieldPath ) => {
            it( `renders a ${ language } label rather than the raw path for "${ fieldPath }"`, () => {
                const label = auditFieldLabel( language, fieldPath );
                assert.notEqual( label, fieldPath, `"${ fieldPath }" fell back to the raw field path — the label did not resolve` );
                assert.ok( label && label.trim().length > 0, `"${ fieldPath }" resolved to empty text` );
                assert.ok( !label.includes( "label not found" ), `"${ fieldPath }" resolved to the not-found placeholder: ${ label }` );
                assert.equal( label, rawLabels.interface[ "employee-management" ].audit.field[ fieldPath ][ language ] );
            } );
        } );
    } );

    it( "still returns the raw path for a field the catalogue does not know", () => {
        assert.equal( auditFieldLabel( "en", "personal.shoeSize" ), "personal.shoeSize" );
    } );

} );
