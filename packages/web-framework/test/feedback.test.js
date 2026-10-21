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
 * Covers feedback about the application (1.56.0, CA-528): what an item keeps of its sender and its context, how it is
 * stored and listed, a status change, a person's export and erasure, and the e-mail to the allowlisted administrators.
 * Every item is a value, because erasure deletes it and D1 cannot delete a document. And the picture of the screen that
 * may come with it (1.58.0, CA-544): what the server accepts, where it is kept, and that it goes with its item.
 */

const { describe, it, beforeEach, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const cacheStub = installInMemoryCache();

const localization = require( "@ti-engine/core/localization" );
const NotificationService = require( "../components/notification-service.js" );
const Feedback = require( "../components/feedback.js" );
const PICTURES = require( "./helpers/feedback-pictures" );

// The framework's own catalogue, so the e-mail is rendered with the texts it ships.
const CATALOGUE = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );
const lookup = ( key, language ) => {
    const node = key.split( "." ).reduce( ( branch, part ) => ( branch && typeof branch === "object" ) ? branch[ part ] : undefined, CATALOGUE );
    return ( node && typeof node[ language ] === "string" ) ? node[ language ] : undefined;
};
const originalGetLabel = localization.getLabel;
const originalSystemLanguage = localization.getSystemLanguage;

const SUBJECT = { id: "TD000003", name: "Jane Doe" };
const SENDER = { subject: SUBJECT, email: "jane@example.com", version: "2.2.0", language: "en", isScreen: ( screen ) => [ "reports", "dashboard" ].includes( screen ) };
const NOW = "2026-10-19T10:00:00.000Z";

const fresh = () => new Feedback();

describe( "Feedback — what an item keeps", () => {

    it( "keeps the sender's ID and name, the text trimmed, and starts as new", () => {
        const item = fresh().newItem( { kind: "suggestion", text: "  More colour.  " }, SENDER, "f-1", NOW );
        assert.deepEqual( item, {
            feedbackID: "f-1", kind: "suggestion", text: "More colour.", anonymous: false, submittedBy: "TD000003", senderName: "Jane Doe",
            submittedAt: NOW, context: null, picture: null, status: "new", statusChangedAt: null, statusChangedBy: null
        } );
    } );

    it( "keeps nothing of an anonymous sender", () => {
        const item = fresh().newItem( { kind: "praise", text: "Nice.", anonymous: true }, SENDER, "f-2", NOW );
        assert.equal( item.anonymous, true );
        assert.equal( item.submittedBy, null );
        assert.equal( item.senderName, null );
        assert.ok( !JSON.stringify( item ).includes( "Jane" ) && !JSON.stringify( item ).includes( "TD000003" ) );
    } );

    it( "gives a problem its context, the version and language the server's and the screen only one the application has", () => {
        const feedback = fresh();
        const known = feedback.newItem( { kind: "problem", text: "Broken.", screen: "reports", browser: "Firefox" }, SENDER, "f-3", NOW );
        assert.deepEqual( known.context, { screen: "reports", version: "2.2.0", language: "en", browser: "Firefox" } );
        assert.equal( feedback.newItem( { kind: "problem", text: "Broken.", screen: "secret-admin" }, SENDER, "f-4", NOW ).context.screen, "" );
        assert.equal( feedback.newItem( { kind: "problem", text: "Broken.", screen: "../reports" }, SENDER, "f-5", NOW ).context.screen, "" );
        assert.equal( feedback.newItem( { kind: "suggestion", text: "Idea.", screen: "reports" }, SENDER, "f-6", NOW ).context, null, "only a problem keeps one" );
    } );

    it( "cuts the browser short and makes its control characters spaces, so it cannot start a line of its own", () => {
        const item = fresh().newItem( { kind: "problem", text: "x", browser: "A\nB\tC\u007f" + "z".repeat( 500 ) }, SENDER, "f-7", NOW );
        assert.equal( item.context.browser.length, 200 );
        assert.ok( item.context.browser.startsWith( "A B C z" ) );
    } );

    it( "refuses a kind it does not know, an empty text and one over 4000 characters, each with the label the browser shows", () => {
        const feedback = fresh();
        const refusal = ( params ) => {
            try {
                feedback.newItem( params, SENDER, "f", NOW );
            } catch ( error ) {
                return [ error.httpCode, error.data.details ];
            }
            return null;
        };
        assert.deepEqual( refusal( { kind: "rant", text: "x" } ), [ 422, "error.feedback.kind" ] );
        assert.deepEqual( refusal( { kind: "other", text: "   " } ), [ 422, "error.feedback.text-empty" ] );
        assert.deepEqual( refusal( { kind: "other", text: "x".repeat( 4001 ) } ), [ 422, "error.feedback.text-long" ] );
        assert.equal( refusal( { kind: "other", text: "x".repeat( 4000 ) } ), null );
    } );

} );

describe( "Feedback — storage, status and personal data", () => {

    beforeEach( () => {
        cacheStub.storage = {};
        cacheStub.values = {};
    } );

    it( "stores each item as a value of its own and lists them newest first", async () => {
        const feedback = fresh();
        const first = await feedback.submit( { kind: "suggestion", text: "First" }, SENDER );
        await new Promise( ( resolve ) => setTimeout( resolve, 5 ) );
        const second = await feedback.submit( { kind: "praise", text: "Second", anonymous: true }, SENDER );
        assert.ok( await cacheStub.getValue( "ti:feedback:item:" + first.feedbackID ) );
        assert.deepEqual( Object.keys( cacheStub.storage ), [], "never a JSON document, which D1 cannot delete" );
        assert.deepEqual( ( await feedback.fetchAll() ).map( ( item ) => item.text ), [ "Second", "First" ] );
        assert.equal( ( await feedback.fetch( second.feedbackID ) ).text, "Second" );
    } );

    it( "reads a long list a few items at a time and keeps its order", async ( t ) => {
        const feedback = fresh();
        for ( let index = 0; index < 20; index++ ) {
            await cacheStub.setValue( "ti:feedback:item:f" + index, { feedbackID: "f" + index, text: String( index ), submittedAt: `2026-10-${ String( 10 + index ).padStart( 2, "0" ) }` } );
        }
        let inFlight = 0;
        let most = 0;
        const read = cacheStub.getValue.bind( cacheStub );
        t.mock.method( cacheStub, "getValue", ( key ) => {
            inFlight++;
            most = Math.max( most, inFlight );
            return new Promise( ( resolve ) => setTimeout( resolve, 1 ) ).then( () => read( key ) ).finally( () => {
                inFlight--;
            } );
        } );
        const items = await feedback.fetchAll();
        assert.equal( items.length, 20 );
        assert.equal( items[ 0 ].text, "19" );
        assert.ok( most <= 8, `at most eight reads at once, saw ${ most }` );
    } );

    it( "answers a fetch only for an ID it could have minted, so a pattern cannot read another key", async () => {
        const feedback = fresh();
        await cacheStub.setValue( "ti:feedback:item:*", { feedbackID: "*" } );
        assert.equal( await feedback.fetch( "*" ), null );
        assert.equal( await feedback.fetch( "" ), null );
    } );

    it( "gives an item a status with who and when, and refuses a missing item or a status it does not know", async () => {
        const feedback = fresh();
        const item = await feedback.submit( { kind: "problem", text: "Broken." }, SENDER );
        const changed = await feedback.setStatus( item.feedbackID, "in-progress", "admin-user" );
        assert.equal( changed.status, "in-progress" );
        assert.equal( changed.statusChangedBy, "admin-user" );
        assert.ok( changed.statusChangedAt );
        assert.equal( ( await feedback.fetch( item.feedbackID ) ).status, "in-progress" );

        await assert.rejects( feedback.setStatus( item.feedbackID, "archived", "admin-user" ), ( error ) => error.httpCode === 422 && error.data.details === "error.feedback.status" );
        await assert.rejects( feedback.setStatus( "no-such-item", "done", "admin-user" ), ( error ) => error.httpCode === 404 && error.data.details === "error.feedback.not-found" );
    } );

    it( "leaves one change when two administrators set a status at once", async () => {
        const feedback = fresh();
        const item = await feedback.submit( { kind: "problem", text: "Broken." }, SENDER );
        await Promise.all( [ feedback.setStatus( item.feedbackID, "done", "a" ), feedback.setStatus( item.feedbackID, "declined", "b" ) ] );
        const stored = await feedback.fetch( item.feedbackID );
        assert.deepEqual( [ stored.status, stored.statusChangedBy ], [ "declined", "b" ], "the later change, whole" );
    } );

    it( "exports and erases only what a person sent under their name; anonymous items stay", async () => {
        const feedback = fresh();
        const named = await feedback.submit( { kind: "suggestion", text: "Mine" }, SENDER );
        const anonymous = await feedback.submit( { kind: "suggestion", text: "Nobody's", anonymous: true }, SENDER );
        await feedback.submit( { kind: "suggestion", text: "Theirs" }, Object.assign( {}, SENDER, { subject: { id: "TD000009", name: "Other" } } ) );

        assert.deepEqual( ( await feedback.sentBy( "TD000003" ) ).map( ( item ) => item.feedbackID ), [ named.feedbackID ] );
        assert.deepEqual( await feedback.sentBy( "" ), [] );

        assert.equal( await feedback.eraseSentBy( "TD000003" ), 1 );
        assert.equal( await feedback.fetch( named.feedbackID ), null );
        assert.ok( await feedback.fetch( anonymous.feedbackID ), "an anonymous item cannot be found, and stays" );
        assert.equal( ( await feedback.fetchAll() ).length, 2 );
    } );

} );

/**
 * A WebP file's header as its container states it, with filler for the rest: what the server reads of one.
 *
 * @param {"VP8 "|"VP8L"|"VP8X"} format
 * @param {number} width
 * @param {number} height
 * @param {number} [filler] Bytes after the header.
 * @returns {Buffer}
 */
function webpOf( format, width, height, filler = 16 ) {
    const body = Buffer.alloc( 10 + filler );
    if ( format === "VP8 " ) {
        body.set( [ 0x9d, 0x01, 0x2a ], 3 );
        body.writeUInt16LE( width & 0x3fff, 6 );
        body.writeUInt16LE( height & 0x3fff, 8 );
    } else if ( format === "VP8L" ) {
        body[ 0 ] = 0x2f;
        body.writeUInt32LE( ( ( ( width - 1 ) & 0x3fff ) | ( ( ( height - 1 ) & 0x3fff ) << 14 ) ) >>> 0, 1 );
    } else {
        body.writeUIntLE( width - 1, 4, 3 );
        body.writeUIntLE( height - 1, 7, 3 );
    }
    const size = Buffer.alloc( 4 );
    size.writeUInt32LE( body.length );
    const chunk = Buffer.concat( [ Buffer.from( format, "latin1" ), size, body ] );
    const riff = Buffer.alloc( 4 );
    riff.writeUInt32LE( 4 + chunk.length );
    return Buffer.concat( [ Buffer.from( "RIFF", "latin1" ), riff, Buffer.from( "WEBP", "latin1" ), chunk ] );
}

/**
 * A JPEG file's markers as a browser writes them: start, an APP0 segment, a frame header, a scan and the end.
 *
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {boolean} [options.scanFirst] The scan before the frame header.
 * @param {boolean} [options.unended] No end-of-image marker.
 * @returns {Buffer}
 */
function jpegOf( width, height, { scanFirst = false, unended = false } = {} ) {
    const app0 = Buffer.from( [ 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00 ] );
    const frame = Buffer.from( [ 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01 ] );
    frame.writeUInt16BE( height, 5 );
    frame.writeUInt16BE( width, 7 );
    const scan = Buffer.from( [ 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34 ] );
    const parts = [ Buffer.from( [ 0xff, 0xd8 ] ), app0 ].concat( scanFirst ? [ scan, frame ] : [ frame, scan ] );
    if ( !unended ) {
        parts.push( Buffer.from( [ 0xff, 0xd9 ] ) );
    }
    return Buffer.concat( parts );
}

const dataURL = ( type, bytes ) => `data:${ type };base64,${ bytes.toString( "base64" ) }`;
const refusesPicture = ( action ) => assert.throws( action, ( error ) => error.httpCode === 422 && error.data.details === "error.feedback.picture" );

describe( "Feedback — a picture of the screen (CA-544)", () => {

    beforeEach( () => {
        cacheStub.storage = {};
        cacheStub.values = {};
    } );

    it( "reads the pictures browsers write, WebP and JPEG, with their size", () => {
        const feedback = fresh();
        for ( const [ name, url ] of Object.entries( PICTURES ) ) {
            const picture = feedback.readPicture( url );
            assert.deepEqual( [ picture.type, picture.width, picture.height ], [ name === "jpeg" ? "image/jpeg" : "image/webp", 40, 30 ], name );
            assert.equal( picture.bytes, Buffer.from( url.split( "," )[ 1 ], "base64" ).length );
            assert.equal( picture.data, url.split( "," )[ 1 ] );
        }
    } );

    it( "reads lossy, lossless and extended WebP, up to 1600 pixels a side", () => {
        const feedback = fresh();
        for ( const format of [ "VP8 ", "VP8L", "VP8X" ] ) {
            const picture = feedback.readPicture( dataURL( "image/webp", webpOf( format, 1600, 900 ) ) );
            assert.deepEqual( [ picture.width, picture.height ], [ 1600, 900 ], format );
        }
        assert.deepEqual( [ "width", "height" ].map( ( side ) => feedback.readPicture( dataURL( "image/jpeg", jpegOf( 1200, 1600 ) ) )[ side ] ), [ 1200, 1600 ] );
    } );

    it( "has none when none was sent", () => {
        for ( const value of [ undefined, null, "" ] ) {
            assert.equal( fresh().readPicture( value ), null );
        }
    } );

    it( "refuses anything but a WebP or JPEG that is what it says, within its limits", () => {
        const feedback = fresh();
        const tooLarge = webpOf( "VP8X", 800, 600, Feedback.PICTURE_MAX_BYTES );
        const trailing = Buffer.concat( [ webpOf( "VP8X", 800, 600 ), Buffer.from( "<script>" ) ] );
        const jpeg = PICTURES.jpeg.split( "," )[ 1 ];
        const cases = {
            "a PNG": dataURL( "image/png", Buffer.from( "89504e470d0a1a0a", "hex" ) ),
            "an SVG, which can carry script": "data:image/svg+xml;base64," + Buffer.from( "<svg xmlns='http://www.w3.org/2000/svg'/>" ).toString( "base64" ),
            "a JPEG called WebP": "data:image/webp;base64," + jpeg,
            "a WebP called JPEG": PICTURES.webpOpaque.replace( "image/webp", "image/jpeg" ),
            "base64 with a line break": "data:image/jpeg;base64," + jpeg.slice( 0, 40 ) + "\n" + jpeg.slice( 40 ),
            "base64 without its padding": "data:image/jpeg;base64," + jpeg.replace( /=+$/, "" ),
            "a parameter in the data URL": PICTURES.jpeg.replace( "image/jpeg;", "image/jpeg;charset=utf-8;" ),
            "wider than 1600 pixels": dataURL( "image/webp", webpOf( "VP8L", 1601, 900 ) ),
            "taller than 1600 pixels": dataURL( "image/jpeg", jpegOf( 900, 1601 ) ),
            "no pixels at all": dataURL( "image/webp", webpOf( "VP8 ", 0, 600 ) ),
            "over 1,000,000 bytes": dataURL( "image/webp", tooLarge ),
            "something after the image": dataURL( "image/webp", trailing ),
            "a JPEG that never ends": dataURL( "image/jpeg", jpegOf( 800, 600, { unended: true } ) ),
            "a JPEG whose scan comes before its frame": dataURL( "image/jpeg", jpegOf( 800, 600, { scanFirst: true } ) ),
            "nothing after the comma": "data:image/webp;base64,",
            "an object": { type: "image/webp", data: "AAAA" },
            "a number": 42
        };
        assert.ok( tooLarge.length > Feedback.PICTURE_MAX_BYTES );
        for ( const [ name, value ] of Object.entries( cases ) ) {
            refusesPicture( () => feedback.readPicture( value ), name );
        }
    } );

    it( "keeps the picture apart from the item, which says only that it has one", async () => {
        const feedback = fresh();
        const item = await feedback.submit( { kind: "problem", text: "Broken.", picture: PICTURES.webpOpaque }, SENDER );
        const data = PICTURES.webpOpaque.split( "," )[ 1 ];
        assert.deepEqual( item.picture, { type: "image/webp", bytes: Buffer.from( data, "base64" ).length, width: 40, height: 30 } );
        const stored = await cacheStub.getValue( "ti:feedback:item:" + item.feedbackID );
        assert.deepEqual( stored.picture, item.picture );
        assert.deepEqual( await cacheStub.getValue( "ti:feedback:picture:" + item.feedbackID ), { type: "image/webp", data: data } );
        assert.ok( !JSON.stringify( await feedback.fetchAll() ).includes( data.slice( 0, 64 ) ), "the list never carries the image" );
        assert.deepEqual( Object.keys( cacheStub.storage ), [], "values, never documents" );

        const plain = await feedback.submit( { kind: "suggestion", text: "Idea." }, SENDER );
        assert.equal( plain.picture, null );
        assert.equal( await cacheStub.getValue( "ti:feedback:picture:" + plain.feedbackID ), undefined );
    } );

    it( "answers a picture by its item, and only for an item that has one", async () => {
        const feedback = fresh();
        const item = await feedback.submit( { kind: "problem", text: "Broken.", picture: PICTURES.jpeg }, SENDER );
        const plain = await feedback.submit( { kind: "suggestion", text: "Idea." }, SENDER );
        assert.deepEqual( await feedback.fetchPicture( item.feedbackID ), { type: "image/jpeg", data: PICTURES.jpeg.split( "," )[ 1 ], width: 40, height: 30 } );
        assert.equal( await feedback.fetchPicture( plain.feedbackID ), null );
        assert.equal( await feedback.fetchPicture( "*" ), null );
        assert.equal( await feedback.fetchPicture( "no-such-item" ), null );
    } );

    it( "refuses the whole submission for a malformed picture, and keeps nothing", async () => {
        const feedback = fresh();
        await assert.rejects( feedback.submit( { kind: "problem", text: "Broken.", picture: "data:image/png;base64,AAAA" }, SENDER ),
            ( error ) => error.httpCode === 422 && error.data.details === "error.feedback.picture" );
        assert.deepEqual( Object.keys( cacheStub.values ), [] );
    } );

    it( "deletes the picture again when its item cannot be written, so none is left without one", async ( t ) => {
        const feedback = fresh();
        const write = cacheStub.setValue.bind( cacheStub );
        t.mock.method( cacheStub, "setValue", ( key, value, expiration ) => key.startsWith( "ti:feedback:item:" ) ? Promise.reject( new Error( "store down" ) ) : write( key, value, expiration ) );
        await assert.rejects( feedback.submit( { kind: "problem", text: "Broken.", picture: PICTURES.webpAlpha }, SENDER ), /store down/ );
        assert.deepEqual( Object.keys( cacheStub.values ), [] );
    } );

    it( "goes with its item on erasure; an anonymous item's stays with it", async () => {
        const feedback = fresh();
        const named = await feedback.submit( { kind: "problem", text: "Mine.", picture: PICTURES.webpOpaque }, SENDER );
        const anonymous = await feedback.submit( { kind: "problem", text: "Nobody's.", anonymous: true, picture: PICTURES.jpeg }, SENDER );
        assert.equal( await feedback.eraseSentBy( SUBJECT.id ), 1 );
        assert.equal( await cacheStub.getValue( "ti:feedback:picture:" + named.feedbackID ), undefined );
        assert.equal( await cacheStub.getValue( "ti:feedback:item:" + named.feedbackID ), undefined );
        assert.ok( await feedback.fetchPicture( anonymous.feedbackID ) );
    } );

} );

describe( "Feedback — the e-mail to the administrators", () => {

    let emitted;

    before( () => {
        localization.getLabel = ( key, language, fallback ) => {
            const value = lookup( key, language );
            return ( value === undefined ) ? fallback : value;
        };
        localization.getSystemLanguage = () => "en";
        NotificationService.instance.setTransport( { send: () => Promise.resolve( { messageId: "test" } ) } );
    } );

    after( () => {
        localization.getLabel = originalGetLabel;
        localization.getSystemLanguage = originalSystemLanguage;
        NotificationService.instance.setTransport( null );
    } );

    beforeEach( ( t ) => {
        emitted = [];
        t.mock.method( NotificationService.prototype, "emit", ( name, occurrence ) => {
            emitted.push( { name, occurrence } );
            return Promise.resolve( 1 );
        } );
    } );

    it( "keeps the allowlist entries that are addresses, once each, from a list or the comma form of TI_WEB_AUTH_ADMINS", () => {
        assert.deepEqual( fresh().configure( { admins: [ "Boss@Example.com", "admin", "boss@example.com" ] } ).recipients, [ "boss@example.com" ] );
        assert.deepEqual( fresh().configure( { admins: "a@example.com, b@example.com ,oauth2:123" } ).recipients, [ "a@example.com", "b@example.com" ] );
        assert.deepEqual( fresh().configure( { admins: [ "x@sub.example.co.uk", "a@b", "a@b.", "a@.b", "a@b..c", "a b@x.org" ] } ).recipients, [ "x@sub.example.co.uk" ] );
        assert.deepEqual( fresh().configure( {} ).recipients, [] );
    } );

    it( "reads an entry built to make the address check backtrack in linear time", () => {
        // The first pattern let each dot match two ways: 479 ms at 20,000 repetitions, quadratic beyond (CodeQL).
        const started = process.hrtime.bigint();
        assert.deepEqual( fresh().configure( { admins: [ "!@!." + "!.".repeat( 50000 ) + " " ] } ).recipients, [] );
        assert.ok( Number( process.hrtime.bigint() - started ) / 1e6 < 200 );
    } );

    it( "writes to every administrator but the sender, under an ID that is not an address", async () => {
        const feedback = fresh().configure( { admins: [ "jane@example.com", "boss@example.com" ] } );
        const item = feedback.newItem( { kind: "suggestion", text: "Idea" }, SENDER, "f-1", NOW );
        assert.equal( await feedback.received( item, { email: "Jane@Example.com" } ), 1 );
        assert.equal( emitted.length, 1 );
        const { name, occurrence } = emitted[ 0 ];
        assert.equal( name, "feedback.received" );
        assert.equal( occurrence.recipient.email, "boss@example.com" );
        assert.match( occurrence.recipient.id, /^administrator-[0-9a-f]{12}$/ );
        assert.equal( occurrence.key, "f-1:" + occurrence.recipient.id );
        assert.deepEqual( occurrence.data, { kind: "suggestion", anonymous: false, senderName: "Jane Doe", text: "Idea", date: "2026-10-19" } );
    } );

    it( "leaves nobody out for an anonymous item, and names nobody in it", async () => {
        const feedback = fresh().configure( { admins: [ "jane@example.com", "boss@example.com" ] } );
        const item = feedback.newItem( { kind: "praise", text: "Nice", anonymous: true }, SENDER, "f-2", NOW );
        assert.equal( await feedback.received( item, { email: "jane@example.com" } ), 2 );
        assert.ok( emitted.every( ( entry ) => entry.occurrence.data.senderName === "" && entry.occurrence.data.anonymous === true ) );
    } );

    it( "sends nothing while e-mail is off, and never rejects when raising one fails", async ( t ) => {
        const feedback = fresh().configure( { admins: [ "boss@example.com" ] } );
        const item = feedback.newItem( { kind: "other", text: "x" }, SENDER, "f-3", NOW );
        NotificationService.instance.setTransport( null );
        assert.equal( await feedback.received( item ), 0 );
        NotificationService.instance.setTransport( { send: () => Promise.resolve( { messageId: "test" } ) } );
        t.mock.restoreAll();
        t.mock.method( NotificationService.prototype, "emit", () => Promise.reject( new Error( "outbox down" ) ) );
        assert.equal( await feedback.received( item ), 0 );
    } );

    it( "renders the notice from the framework's own texts, with the kind and sender in the reader's language", () => {
        const feedback = fresh().enable( { dateLocales: { en: "en-GB" } } );
        const service = NotificationService.instance;
        const named = service.render( "feedback-received", { language: "en" }, { kind: "problem", anonymous: false, senderName: "Jane Doe", text: "It broke.", date: "2026-10-19" } );
        assert.equal( named.subject, "Feedback about the application: Problem" );
        assert.match( named.text, /^On 19 October 2026, Jane Doe sent this feedback about the application:\n\nIt broke\./ );
        const anonymous = service.render( "feedback-received", { language: "bg" }, { kind: "praise", anonymous: true, senderName: "", text: "Браво", date: "2026-10-19" } );
        assert.equal( anonymous.subject, "Обратна връзка за приложението: Похвала" );
        assert.match( anonymous.text, /Анонимно/ );
        assert.equal( feedback.isEnabled, true );
    } );

    it( "escapes the sender's text in the HTML e-mail", () => {
        fresh().enable();
        const rendered = NotificationService.instance.render( "feedback-received", { language: "en" }, { kind: "other", anonymous: true, text: "<img src=x onerror=alert(1)>", date: "2026-10-19" } );
        assert.ok( !rendered.html.includes( "<img src=x" ) );
        assert.ok( rendered.html.includes( "&lt;img src=x" ) );
    } );

    it( "refuses date locales that are not a map of language to locale", () => {
        assert.throws( () => fresh().enable( { dateLocales: [ "en-GB" ] } ) );
        assert.throws( () => fresh().enable( { dateLocales: { en: "" } } ) );
    } );

} );
