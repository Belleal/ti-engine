/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const fs = require( "node:fs" );

const exceptions = require( "@ti-engine/core/exceptions" );
const TiWebAppManager = require( "../bin/web-app-manager.js" );

class TestApp extends TiWebAppManager {
    constructor() {
        super( "test-app" );
    }
}

const SESSION = {
    language: "en",
    user: { userID: "u-1", username: "bkost", name: "Boris Kostadinov", email: "boris@example.com", roles: [ 1, 2 ] }
};

const ADMIN_SESSION = { language: "en", user: { userID: "u-2", name: "Admin", roles: [ "admin" ] } };

/**
 * Collects every item of every section into one flat map of label → item, so an assertion can name a field
 * without hard-coding which section it landed in.
 *
 * @param {Array} sections
 * @returns {Map<string, Object>}
 */
function itemsByLabel( sections ) {
    const map = new Map();
    sections.forEach( ( section ) => section.items.forEach( ( item ) => map.set( item.label, item ) ) );
    return map;
}

describe( "TiWebAppManager — the `profile` and `about` fragments", () => {

    it( "registers both screens, so a consumer inherits them without registering anything", async () => {
        const app = new TestApp();
        // assembleHtmlView rejects an unknown view with E_WEB_INVALID_REQUEST_URI; reaching the file read instead
        // proves the fragment is registered. Both fragment files must therefore also exist on disk.
        [ "frame-profile.html", "frame-about.html" ].forEach( ( file ) => {
            assert.ok( fs.existsSync( path.join( __dirname, "..", "bin", "static", "fragments", file ) ), `${ file } is missing` );
        } );
        const html = await app.assembleHtmlView( SESSION, [ path.join( __dirname, "..", "bin", "static" ) ], "/app/about", { isPartial: true, view: "about" } );
        assert.match( html, /x-data="tiScreenAbout"/ );
    } );

    it( "serves an unknown view the same rejection as before", async () => {
        const app = new TestApp();
        await assert.rejects(
            app.processDataRequest( SESSION, "no-such-view" ),
            ( error ) => error.code === exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI
        );
    } );

} );

describe( "TiWebAppManager.getProfileInfo — baseline descriptor", () => {

    it( "is dispatched from processDataRequest for the `profile` view", async () => {
        const app = new TestApp();
        const result = await app.processDataRequest( SESSION, "profile" );
        assert.ok( result.identity );
        assert.ok( Array.isArray( result.sections ) );
    } );

    it( "builds the identity block from the session user", async () => {
        const { identity } = await new TestApp().getProfileInfo( SESSION );
        assert.equal( identity.name, "Boris Kostadinov" );
        assert.equal( identity.caption, "boris@example.com" );
        assert.equal( identity.avatarSeed, "u-1" );
    } );

    it( "shows no identity pills by default — the framework knows roles only as opaque codes", async () => {
        // A pill stack reading "1" / "2" beside the name is noise; the Access section carries the same information.
        const { identity } = await new TestApp().getProfileInfo( SESSION );
        assert.deepEqual( identity.tags, [] );
    } );

    it( "falls back to the username, then the user ID, when no display name is set", async () => {
        const app = new TestApp();
        const withUsername = await app.getProfileInfo( { user: { userID: "u-9", username: "bkost" } } );
        assert.equal( withUsername.identity.name, "bkost" );
        const withNeither = await app.getProfileInfo( { user: { userID: "u-9" } } );
        assert.equal( withNeither.identity.name, "u-9" );
    } );

    it( "reports the account facts the framework knows", async () => {
        const { sections } = await new TestApp().getProfileInfo( SESSION );
        const items = itemsByLabel( sections );
        assert.equal( items.get( "Full name" ).value, "Boris Kostadinov" );
        assert.equal( items.get( "Username" ).value, "bkost" );
        assert.equal( items.get( "E-mail" ).value, "boris@example.com" );
        assert.equal( items.get( "User ID" ).value, "u-1" );
        assert.equal( items.get( "Roles" ).value, "1 · 2" );
    } );

    it( "falls back to readable English when the consuming app's catalogue lacks the framework keys", async () => {
        // A consuming application configures ONE labels path — its own — so no framework label key resolves there.
        // The section titles below are the fallbacks, not catalogue hits.
        const { sections } = await new TestApp().getProfileInfo( SESSION );
        assert.deepEqual( sections.map( ( section ) => section.title ), [ "Account", "Access" ] );
        sections.forEach( ( section ) => section.items.forEach( ( item ) => {
            assert.doesNotMatch( item.label, /label not found/ );
        } ) );
    } );

    it( "emits an empty value rather than omitting a field the session does not carry", async () => {
        const { sections } = await new TestApp().getProfileInfo( { user: { userID: "u-9" } } );
        const items = itemsByLabel( sections );
        assert.equal( items.get( "E-mail" ).value, "" );
        assert.equal( items.get( "Roles" ).value, "" );
    } );

    it( "rejects (401) when the session carries no user", async () => {
        await assert.rejects(
            new TestApp().getProfileInfo( {} ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                assert.equal( error.httpCode, exceptions.httpCode.C_401 );
                return true;
            }
        );
    } );

} );

describe( "TiWebAppManager.getApplicationInfo — baseline descriptor", () => {

    it( "is dispatched from processDataRequest for the `about` view", async () => {
        const result = await new TestApp().processDataRequest( SESSION, "about" );
        assert.equal( typeof result.version, "string" );
        assert.ok( Array.isArray( result.components ) );
    } );

    it( "lists the ti-engine components the application runs on", async () => {
        const info = await new TestApp().getApplicationInfo( SESSION );
        const names = info.components.map( ( component ) => component.name );
        assert.ok( names.includes( "@ti-engine/web-framework" ) );
        // @ti-engine/core does not export ./package.json, so this also proves the walk-up resolution works.
        assert.ok( names.includes( "@ti-engine/core" ) );
        info.components.forEach( ( component ) => assert.match( component.version, /^\d+\.\d+\.\d+/ ) );
    } );

    it( "withholds runtime facts from a non-admin session", async () => {
        const info = await new TestApp().getApplicationInfo( SESSION );
        assert.equal( info.runtime, null );
    } );

    it( "attaches runtime facts for an admin session", async () => {
        const info = await new TestApp().getApplicationInfo( ADMIN_SESSION );
        assert.equal( info.runtime.node, process.version );
        assert.equal( info.runtime.application, "test-app" );
    } );

    it( "does not let one caller's descriptor leak into the next", async () => {
        // The baseline is cached across calls, so each response must be a copy — otherwise the admin call above
        // would permanently stamp `runtime` onto every subsequent non-admin response.
        const app = new TestApp();
        const admin = await app.getApplicationInfo( ADMIN_SESSION );
        admin.name = "mutated";
        admin.components.push( { name: "injected", version: "0" } );
        const plain = await app.getApplicationInfo( SESSION );
        assert.notEqual( plain.name, "mutated" );
        assert.equal( plain.runtime, null );
        assert.ok( !plain.components.some( ( component ) => component.name === "injected" ) );
    } );

} );
