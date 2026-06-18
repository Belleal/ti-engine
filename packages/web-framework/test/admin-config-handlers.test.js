/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const handlers = require( "#admin-config-handlers" );
const exceptions = require( "@ti-engine/core/exceptions" );

const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

function mockRes() {
    return {
        headers: {},
        statusCode: null,
        body: null,
        set( key, value ) { this.headers[ key ] = value; return this; },
        status( code ) { this.statusCode = code; return this; },
        send( body ) { this.body = body; return this; }
    };
}

function mockReq( overrides = {} ) {
    return { params: {}, body: {}, session: { user: { userID: "oauth2:admin1", roles: [ "admin" ] } }, ...overrides };
}

const conflict = () => exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "version-conflict" } );
const unknownEditor = () => exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { reason: "unknown-editor" } );

describe( "admin-config-handlers", () => {

    it( "listEditors responds with the editor list", () => {
        const res = mockRes();
        handlers.listEditors( { listEditors: () => [ "combo" ] } )( mockReq(), res, () => {} );
        assert.equal( res.statusCode, 200 );
        assert.deepEqual( res.body, { isSuccessful: true, data: [ "combo" ] } );
    } );

    it( "composeView passes the editorKey and returns the view", async () => {
        let receivedKey;
        const service = { composeView: ( key ) => { receivedKey = key; return Promise.resolve( { rows: {}, versions: {} } ); } };
        const res = mockRes();
        handlers.composeView( service )( mockReq( { params: { editorKey: "combo" } } ), res, () => {} );
        await tick();
        assert.equal( receivedKey, "combo" );
        assert.equal( res.body.isSuccessful, true );
    } );

    it( "saveEditorEdit forwards body + adminID from session and returns the result", async () => {
        let args;
        const service = { saveEditorEdit: ( ...received ) => { args = received; return Promise.resolve( { ok: true, changeSetID: "cs1" } ); } };
        const res = mockRes();
        const req = mockReq( { params: { editorKey: "combo" }, body: { edited: { n: 1 }, note: "x", expectedVersions: { a: 1 } } } );
        handlers.saveEditorEdit( service )( req, res, () => {} );
        await tick();
        assert.equal( args[ 0 ], "combo" );
        assert.deepEqual( args[ 1 ], { n: 1 } );
        assert.equal( args[ 2 ].adminID, "oauth2:admin1" );
        assert.equal( args[ 2 ].note, "x" );
        assert.deepEqual( args[ 3 ], { a: 1 } );
        assert.deepEqual( res.body.data, { ok: true, changeSetID: "cs1" } );
    } );

    it( "returns validation failures as data, not as an error", async () => {
        const service = { saveEditorEdit: () => Promise.resolve( { ok: false, errors: { alpha: [ { message: "bad" } ] } } ) };
        const res = mockRes();
        let nextErr = null;
        handlers.saveEditorEdit( service )( mockReq( { params: { editorKey: "combo" } } ), res, ( e ) => { nextErr = e; } );
        await tick();
        assert.equal( nextErr, null );
        assert.equal( res.body.data.ok, false );
    } );

    it( "maps a version conflict to 409", async () => {
        const service = { saveEditorEdit: () => Promise.reject( conflict() ) };
        let nextErr = null;
        handlers.saveEditorEdit( service )( mockReq( { params: { editorKey: "combo" } } ), mockRes(), ( e ) => { nextErr = e; } );
        await tick();
        assert.ok( nextErr );
        assert.equal( nextErr.httpCode, 409 );
    } );

    it( "maps an unknown editor to 404", async () => {
        const service = { composeView: () => Promise.reject( unknownEditor() ) };
        let nextErr = null;
        handlers.composeView( service )( mockReq( { params: { editorKey: "nope" } } ), mockRes(), ( e ) => { nextErr = e; } );
        await tick();
        assert.equal( nextErr.httpCode, 404 );
    } );

    it( "exportBundle streams a download with a filename", async () => {
        const res = mockRes();
        handlers.exportBundle( { exportBundle: () => Promise.resolve( { documents: [] } ) } )( mockReq(), res, () => {} );
        await tick();
        assert.match( res.headers[ "Content-Disposition" ], /attachment/ );
        assert.ok( res.body.includes( "documents" ) );
    } );

} );
