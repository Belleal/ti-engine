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
 * Every item is a value, because erasure deletes it and D1 cannot delete a document.
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
            submittedAt: NOW, context: null, status: "new", statusChangedAt: null, statusChangedBy: null
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
