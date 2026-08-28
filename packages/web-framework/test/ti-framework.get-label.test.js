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

/**
 * Covers `tiApplication.getLabel` — the single client-side entry point every screen and the `x-text-label`
 * directive use to turn a label key into display text.
 * <br/>
 * The case worth pinning: a label group may store flat keys that themselves contain a literal dot, because the key
 * IS a dotted path in the application's own domain — the audit-log field labels are keyed by employee field path
 * ("personal.workSite", "career.roleFamily"). A resolver that descends exactly one object level per dot can never
 * reach those, and the miss is silent: the caller's fallback renders instead, which for the audit log meant
 * every changed field displayed as its raw field path forever.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

const { stores } = loadTiFramework();
const tiApplication = stores.tiApplication;

/**
 * Points the store at a labels catalogue and resolves one key against it.
 *
 * @method
 * @param {Object} labels
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 * @private
 */
function resolve( labels, key, fallback ) {
    tiApplication.configuration = { labels: labels };
    return ( fallback === undefined ) ? tiApplication.getLabel( key ) : tiApplication.getLabel( key, fallback );
}

describe( "tiApplication.getLabel — nested keys", () => {

    const labels = { interface: { topbar: { dashboard: "Dashboard" } } };

    it( "resolves a plainly nested key", () => {
        assert.equal( resolve( labels, "interface.topbar.dashboard", "FALLBACK" ), "Dashboard" );
    } );

    it( "returns the fallback for a key that is not in the catalogue", () => {
        assert.equal( resolve( labels, "interface.topbar.missing", "FALLBACK" ), "FALLBACK" );
    } );

    it( "returns the fallback for a key that stops on a group rather than a label", () => {
        assert.equal( resolve( labels, "interface.topbar", "FALLBACK" ), "FALLBACK" );
    } );

    it( "returns the fallback for a key that runs past a label", () => {
        assert.equal( resolve( labels, "interface.topbar.dashboard.extra", "FALLBACK" ), "FALLBACK" );
    } );

    it( "returns the fallback for an empty key without touching the catalogue", () => {
        assert.equal( resolve( { a: "A" }, "", "FALLBACK" ), "FALLBACK" );
    } );

    it( "tolerates an absent catalogue", () => {
        tiApplication.configuration = {};
        assert.equal( tiApplication.getLabel( "interface.topbar.dashboard", "FALLBACK" ), "FALLBACK" );
    } );

    it( "defaults the fallback to a visible placeholder", () => {
        assert.equal( resolve( { a: "A" }, "nope.nope" ), "LABEL NOT FOUND" );
    } );

} );

describe( "tiApplication.getLabel — flat keys containing a literal dot", () => {

    // The shape competence uses for its audit-log field labels: the key is an employee field path.
    const labels = {
        interface: {
            "employee-management": {
                audit: {
                    field: {
                        "personal.workSite": "Work site",
                        "career.roleFamily": "Role family",
                        employmentStatus: "Employment status"
                    }
                }
            }
        }
    };

    it( "resolves a flat key whose own name contains a dot", () => {
        assert.equal( resolve( labels, "interface.employee-management.audit.field.personal.workSite", "personal.workSite" ), "Work site" );
    } );

    it( "resolves every dotted sibling in the same group", () => {
        assert.equal( resolve( labels, "interface.employee-management.audit.field.career.roleFamily", "career.roleFamily" ), "Role family" );
    } );

    it( "still resolves a plain sibling in a group that also holds dotted keys", () => {
        assert.equal( resolve( labels, "interface.employee-management.audit.field.employmentStatus", "employmentStatus" ), "Employment status" );
    } );

    it( "returns the fallback for a dotted key that is genuinely absent", () => {
        assert.equal( resolve( labels, "interface.employee-management.audit.field.personal.shoeSize", "personal.shoeSize" ), "personal.shoeSize" );
    } );

    it( "resolves a flat dotted key at the root of the catalogue", () => {
        assert.equal( resolve( { "a.b": "Flat" }, "a.b", "FALLBACK" ), "Flat" );
    } );

    it( "prefers a literal dotted key over the nested path of the same name", () => {
        assert.equal( resolve( { "a.b": "Flat", a: { b: "Nested" } }, "a.b", "FALLBACK" ), "Flat" );
    } );

    it( "falls back to the nested path when the literal dotted key cannot hold the rest of the key", () => {
        assert.equal( resolve( { "a.b": "Flat", a: { b: { c: "Nested" } } }, "a.b.c", "FALLBACK" ), "Nested" );
    } );

    it( "descends into a group reached through a literal dotted key", () => {
        assert.equal( resolve( { "a.b": { c: "Deep" } }, "a.b.c", "FALLBACK" ), "Deep" );
    } );

    it( "does not resolve keys off the prototype chain", () => {
        assert.equal( resolve( {}, "constructor.name", "FALLBACK" ), "FALLBACK" );
        assert.equal( resolve( {}, "toString", "FALLBACK" ), "FALLBACK" );
    } );

} );

describe( "tiApplication.getLabel — against the framework's own catalogue", () => {

    const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

    /**
     * Collapses the `{ en, bg }` leaves the way `localization.getAllLabels` does before the catalogue reaches the
     * client, so the assertion runs against the shape the store actually receives.
     *
     * @method
     * @param {Object} node
     * @param {string} language
     * @returns {Object|string}
     * @private
     */
    function forLanguage( node, language ) {
        const values = Object.values( node );
        const isLeaf = values.length > 0 && values.every( ( value ) => typeof value === "string" || value === null );
        if ( isLeaf ) {
            return node[ language ];
        }
        const collapsed = {};
        Object.keys( node ).forEach( ( key ) => {
            collapsed[ key ] = forLanguage( node[ key ], language );
        } );
        return collapsed;
    }

    it( "resolves a real shipped label key", () => {
        const key = "interface.default.login.error-sign-in-failed";
        assert.equal( resolve( forLanguage( labels, "en" ), key, "FALLBACK" ), labels.interface.default.login[ "error-sign-in-failed" ].en );
    } );

} );
