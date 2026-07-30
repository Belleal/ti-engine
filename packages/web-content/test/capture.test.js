/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Tests for the capture primitive. This is the only module holding personal data, so the privacy rules lead: no IP
 * is ever stored, consent is stamped server-side and never taken from the client, only schema fields are persisted,
 * and erasure is by email across every purpose.
 *
 * Two further boundaries are asserted here because both are silent when wrong: CSV export must neutralise
 * spreadsheet formulas (a value that arrived from a query string can otherwise execute when the export is opened),
 * and the post-submit redirect must refuse any target that is not a known content path (an open redirect is exactly
 * the primitive a phishing link wants -- a real link to a real site that lands somewhere else).
 */

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const CaptureStore = require( "#capture" );
const { summarise, toCsv, csvCell } = require( "#capture-admin" );
const { safeReturnPath, captureHandler, mountCaptureRoutes, defaultRequireAdmin } = require( "#capture-routes" );

/*
 * A stand-in for the RedisJSON singleton, faithful to the one behaviour that bit us in production-like conditions:
 * RedisJSON REFUSES to create a nested path in a document that does not exist ("ERR new objects must be created at
 * the root"). An over-forgiving fake hid that, and the bug only appeared on a genuinely fresh store -- which is the
 * worst place to find it, since it works in dev the moment anything has seeded the key.
 */
function fakeCache() {
    return {
        data: null,
        getJSON() { return Promise.resolve( this.data === null ? [] : [ this.data ] ); },
        setJSON( key, value ) { this.data = value; return Promise.resolve( true ); },
        editJSON( key, value, path ) {
            if ( this.data === null ) {
                return Promise.reject( new Error( "ERR new objects must be created at the root" ) );
            }
            this.data[ path[ 0 ] ] = value;
            return Promise.resolve( true );
        }
    };
}

let cache;
let store;
beforeEach( () => {
    cache = fakeCache();
    store = new CaptureStore( { cache: cache, key: "test:capture" } );
} );

const NOW = { now: "2026-07-30T12:00:00.000Z" };
const valid = ( extra ) => Object.assign( { email: "reader@example.com", purpose: "newsletter", consent: "1" }, extra || {} );

describe( "capture — consent is a precondition", () => {

    it( "refuses a submission with no consent", async () => {
        const result = await store.submit( { email: "r@example.com", purpose: "newsletter" }, NOW );
        assert.equal( result.status, "error" );
        assert.deepEqual( await store.list(), [] );
    } );

    it( "refuses an unticked checkbox, however it arrives", async () => {
        for ( const consent of [ false, "0", "", "off", null, undefined ] ) {
            assert.equal( ( await store.submit( valid( { consent: consent } ), NOW ) ).status, "error" );
        }
    } );

    it( "stamps consentAt server-side and discards a client-supplied one", async () => {
        await store.submit( valid( { consentAt: "1999-01-01T00:00:00.000Z" } ), NOW );
        const [ record ] = await store.list();
        assert.equal( record.consentAt, NOW.now, "a client-written consent timestamp is not evidence" );
    } );

} );

describe( "capture — what is stored, and what is not", () => {

    it( "never stores an IP address, even when one is offered", async () => {
        await store.submit( valid( { ip: "203.0.113.7", remoteAddress: "203.0.113.7" } ), NOW );
        const [ record ] = await store.list();
        assert.equal( record.ip, undefined );
        assert.equal( record.remoteAddress, undefined );
        assert.ok( !JSON.stringify( record ).includes( "203.0.113" ) );
    } );

    it( "persists only the schema's fields, so an extra POST field cannot ride along", async () => {
        await store.submit( valid( { role: "admin", isAdmin: true, note: "x" } ), NOW );
        const [ record ] = await store.list();
        assert.deepEqual( Object.keys( record ).sort(), [ "consentAt", "createdAt", "email", "id", "purpose" ] );
    } );

    it( "keeps the optional fields that do belong", async () => {
        await store.submit( valid( { purpose: "preorder:echo", edition: "hardcover", source: "itp-fpf", locale: "bg" } ), NOW );
        const [ record ] = await store.list();
        assert.equal( record.edition, "hardcover" );
        assert.equal( record.source, "itp-fpf" );
        assert.equal( record.locale, "bg" );
    } );

    it( "rejects an implausible address before storing anything", async () => {
        for ( const email of [ "", "nope", "a@b", "a b@c.com" ] ) {
            assert.equal( ( await store.submit( valid( { email: email } ), NOW ) ).status, "error" );
        }
        assert.deepEqual( await store.list(), [] );
    } );

} );

describe( "capture — the very first record on a fresh store", () => {

    it( "succeeds when nothing has ever been stored", async () => {
        // RedisJSON cannot create a nested path in a document that does not exist, so the first capture must write
        // the whole map. Without this the first signup on a fresh deployment fails -- and only there.
        assert.equal( cache.data, null, "the store starts genuinely empty" );
        const result = await store.submit( valid(), NOW );
        assert.equal( result.status, "success" );
        assert.equal( ( await store.list() ).length, 1 );
    } );

    it( "keeps accepting records once the document exists", async () => {
        await store.submit( valid(), NOW );
        assert.equal( ( await store.submit( valid( { email: "second@example.com" } ), NOW ) ).status, "success" );
        assert.equal( ( await store.submit( valid( { email: "third@example.com" } ), NOW ) ).status, "success" );
        assert.equal( ( await store.list() ).length, 3 );
    } );

} );

describe( "capture — dedupe on (email, purpose)", () => {

    it( "treats a second signup as a duplicate, not an error", async () => {
        assert.equal( ( await store.submit( valid(), NOW ) ).status, "success" );
        assert.equal( ( await store.submit( valid(), NOW ) ).status, "duplicate" );
        assert.equal( ( await store.list() ).length, 1 );
    } );

    it( "matches case-insensitively and ignores surrounding space", async () => {
        await store.submit( valid(), NOW );
        assert.equal( ( await store.submit( valid( { email: "  Reader@Example.COM " } ), NOW ) ).status, "duplicate" );
    } );

    it( "keeps the same address on a different purpose", async () => {
        await store.submit( valid(), NOW );
        assert.equal( ( await store.submit( valid( { purpose: "beta:book-2" } ), NOW ) ).status, "success" );
        assert.equal( ( await store.list() ).length, 2 );
    } );

} );

describe( "capture — erasure", () => {

    it( "erases every purpose for one address in a single action", async () => {
        await store.submit( valid(), NOW );
        await store.submit( valid( { purpose: "beta:book-2" } ), NOW );
        await store.submit( valid( { email: "other@example.com" } ), NOW );

        assert.equal( await store.eraseByEmail( "READER@example.com" ), 2 );
        const remaining = await store.list();
        assert.deepEqual( remaining.map( ( record ) => record.email ), [ "other@example.com" ] );
    } );

    it( "reports zero for an address that was never captured", async () => {
        assert.equal( await store.eraseByEmail( "nobody@example.com" ), 0 );
    } );

    it( "deletes a single record by id", async () => {
        await store.submit( valid(), NOW );
        const [ record ] = await store.list();
        assert.equal( await store.delete( record.id ), true );
        assert.equal( await store.delete( record.id ), false );
        assert.deepEqual( await store.list(), [] );
    } );

} );

describe( "capture admin — reporting", () => {

    const records = [
        { email: "a@x.com", purpose: "newsletter" },
        { email: "b@x.com", purpose: "preorder:echo", edition: "hardcover" },
        { email: "a@x.com", purpose: "preorder:echo", edition: "ebook" }
    ];

    it( "totals by purpose and edition, and counts unique people", () => {
        const summary = summarise( records );
        assert.equal( summary.total, 3 );
        assert.equal( summary.uniqueEmails, 2 );
        assert.deepEqual( summary.byPurpose, { newsletter: 1, "preorder:echo": 2 } );
        assert.deepEqual( summary.byEdition, { hardcover: 1, ebook: 1 } );
    } );

    it( "tolerates an empty set", () => {
        assert.deepEqual( summarise( [] ), { total: 0, byPurpose: {}, byEdition: {}, uniqueEmails: 0 } );
    } );

} );

describe( "capture admin — CSV export is a security boundary", () => {

    it( "neutralises a spreadsheet formula arriving from a query string", () => {
        const payload = "=cmd|" + String.fromCharCode( 39 ) + "/c calc" + String.fromCharCode( 39 ) + "!A1";
        const csv = toCsv( [ { email: "a@x.com", purpose: "newsletter", source: payload } ] );
        assert.ok( csv.includes( String.fromCharCode( 39 ) + "=cmd" ), "a leading = must be neutralised" );
        assert.ok( !/,=cmd/.test( csv ), "the raw formula must not start a cell" );
    } );

    it( "neutralises every formula lead character", () => {
        for ( const lead of [ "=", "+", "-", "@" ] ) {
            assert.ok( csvCell( lead + "danger" ).startsWith( String.fromCharCode( 39 ) ), `${ lead } must be neutralised` );
        }
    } );

    it( "escapes quotes, commas and newlines", () => {
        assert.equal( csvCell( "a,b" ), "\"a,b\"" );
        assert.equal( csvCell( "say \"hi\"" ), "\"say \"\"hi\"\"\"" );
        assert.equal( csvCell( "one\ntwo" ), "\"one\ntwo\"" );
    } );

    it( "writes a header row and one row per record", () => {
        const csv = toCsv( [ { email: "a@x.com", purpose: "newsletter" } ] );
        const lines = csv.trimEnd().split( "\r\n" );
        assert.equal( lines.length, 2 );
        assert.ok( lines[ 0 ].startsWith( "email,purpose" ) );
        assert.ok( lines[ 1 ].startsWith( "a@x.com,newsletter" ) );
    } );

} );

describe( "capture routes — the redirect target cannot be hijacked", () => {

    const repository = {
        resolve( path ) {
            return path === "/books/echo/" ? { outcome: "visible", record: {} } : { outcome: "miss" };
        }
    };

    it( "honours a path that resolves to a record", () => {
        assert.equal( safeReturnPath( "/books/echo/", repository ), "/books/echo/" );
    } );

    it( "refuses an absolute or protocol-relative URL", () => {
        for ( const hostile of [ "https://evil.example/phish", "//evil.example/phish", "http://evil.example" ] ) {
            assert.equal( safeReturnPath( hostile, repository ), "/" );
        }
    } );

    it( "refuses a path that resolves to nothing", () => {
        assert.equal( safeReturnPath( "/not/a/page/", repository ), "/" );
        assert.equal( safeReturnPath( "", repository ), "/" );
    } );

    it( "redirects with the outcome so the page can render it without JavaScript", async () => {
        let redirect = null;
        const response = { redirect( code, url ) { redirect = { code: code, url: url }; } };
        captureHandler( store, repository )( { body: { email: "r@example.com", purpose: "newsletter", consent: "1", returnTo: "/books/echo/" } }, response );
        await new Promise( ( resolve ) => setImmediate( resolve ) );
        assert.equal( redirect.code, 303 );
        assert.equal( redirect.url, "/books/echo/?capture=success" );
    } );

    it( "redirects to a safe path even when the submitted target is hostile", async () => {
        let redirect = null;
        const response = { redirect( code, url ) { redirect = { code: code, url: url }; } };
        captureHandler( store, repository )( { body: { email: "r@example.com", purpose: "newsletter", consent: "1", returnTo: "https://evil.example" } }, response );
        await new Promise( ( resolve ) => setImmediate( resolve ) );
        assert.equal( redirect.url, "/?capture=success" );
    } );

} );

describe( "capture routes — the admin endpoints fail closed", () => {

    function fakeResponse() {
        return { statusCode: null, body: null,
            status( code ) { this.statusCode = code; return this; },
            send( body ) { this.body = body; return this; } };
    }

    it( "refuses an anonymous request with 401", () => {
        const response = fakeResponse();
        defaultRequireAdmin( { session: {} }, response, () => assert.fail( "must not pass through" ) );
        assert.equal( response.statusCode, 401 );
    } );

    it( "refuses an authenticated non-admin with 403", () => {
        const response = fakeResponse();
        defaultRequireAdmin( { session: { user: { roles: [ "beta" ] } } }, response, () => assert.fail( "must not pass through" ) );
        assert.equal( response.statusCode, 403 );
    } );

    it( "admits an administrator", () => {
        let passed = false;
        defaultRequireAdmin( { session: { user: { roles: [ "admin" ] } } }, fakeResponse(), () => { passed = true; } );
        assert.equal( passed, true );
    } );

    it( "guards every admin route even when no guard was configured", () => {
        const routes = [];
        const server = { registerRoute( method, path, ...handlers ) { routes.push( { path: path, handlers: handlers } ); return this; } };
        mountCaptureRoutes( server, { store: store } );

        const adminRoutes = routes.filter( ( route ) => String( route.path ).indexOf( "/admin/" ) === 0 );
        assert.ok( adminRoutes.length >= 4, "expected the list, export, erase and delete routes" );
        for ( const route of adminRoutes ) {
            assert.equal( route.handlers.length, 2, `${ route.path } must be mounted behind a guard` );
            assert.equal( route.handlers[ 0 ], defaultRequireAdmin );
        }
    } );

    it( "leaves the public capture endpoint unguarded, as it must be", () => {
        const routes = [];
        const server = { registerRoute( method, path, ...handlers ) { routes.push( { path: path, handlers: handlers } ); return this; } };
        mountCaptureRoutes( server, { store: store } );
        const publicRoute = routes.find( ( route ) => route.path === "/capture" );
        assert.equal( publicRoute.handlers.length, 1 );
    } );

} );
