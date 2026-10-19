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
 * Covers the browser's side of What's new and Feedback (1.56.0, CA-528), driving the real script: the `tiWhatsNew`
 * store asks for its status only once the shell is initialized for someone signed in, and only where the application
 * turned the feature on (the sign-in page initializes too, and asking from there was answered 401, CA-526); the screen
 * trail remembers the screen a problem report names; and the three screens send and show what they should.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

// Arrays made in the sandbox's realm, compared by value.
const plain = ( value ) => JSON.parse( JSON.stringify( value ) );

/**
 * The script loaded with a request log in place of the network.
 *
 * @method
 * @param {Object} [answers] A URL → the data it answers with, or an Error it fails with.
 * @returns {{stores: Object, components: Object, effects: Function[], requests: Array<{url: string, method: string, body: *}>}}
 * @private
 */
function shell( answers = {} ) {
    const loaded = loadTiFramework();
    const requests = [];
    const tiApplication = loaded.stores.tiApplication;
    tiApplication.configuration = { labels: {} };
    tiApplication.sendRequest = ( url, method = "GET", body ) => {
        requests.push( { url, method, body } );
        const answer = answers[ url ];
        return ( answer instanceof Error ) ? Promise.reject( answer ) : Promise.resolve( { data: answer || {} } );
    };
    tiApplication.notified = [];
    tiApplication.notify = ( message ) => tiApplication.notified.push( message );
    tiApplication.opened = [];
    tiApplication.openScreen = ( screen ) => tiApplication.opened.push( screen );
    return Object.assign( loaded, { requests } );
}

const settle = () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

describe( "tiWhatsNew — the status behind a dashboard notice", () => {

    it( "asks nothing on the sign-in page, nor where the application did not turn What's new on", async () => {
        const { stores, effects, requests } = shell();
        stores.tiWhatsNew.init();
        // `/app/config` is served before sign-in too, flags included: the sign-in page has the feature on and no user.
        stores.tiApplication.isInitialized = true;
        stores.tiApplication.configuration = { labels: {}, features: { whatsNew: true } };
        effects.forEach( ( effect ) => effect() );
        assert.equal( requests.length, 0, "initialized with no user: the sign-in page" );

        stores.tiApplication.user = { userID: "u-1" };
        stores.tiApplication.configuration = { labels: {}, features: { whatsNew: false } };
        effects.forEach( ( effect ) => effect() );
        assert.equal( requests.length, 0, "signed in, feature off" );
    } );

    it( "asks once, when the shell is initialized for someone signed in and the feature is on", async () => {
        const { stores, effects, requests } = shell( { "/app/whats-new-status": { unseen: 3, first: "Reports" } } );
        stores.tiApplication.isInitialized = true;
        stores.tiApplication.user = { userID: "u-1" };
        stores.tiApplication.configuration = { labels: {}, features: { whatsNew: true } };
        stores.tiWhatsNew.init();
        effects.forEach( ( effect ) => effect() );
        await settle();
        assert.deepEqual( requests.map( ( request ) => request.url ), [ "/app/whats-new-status" ] );
        assert.equal( stores.tiWhatsNew.unseen, 3 );
        assert.equal( stores.tiWhatsNew.first, "Reports" );
        assert.equal( stores.tiWhatsNew.moreText, " and 2 more for you" );
        assert.equal( stores.tiWhatsNew.label, "What's New, 3 new" );
    } );

    it( "empties at once when the release is marked seen, and opens the screen", async () => {
        const { stores, requests } = shell();
        stores.tiWhatsNew.unseen = 2;
        stores.tiWhatsNew.first = "Reports";
        await stores.tiWhatsNew.dismiss();
        assert.deepEqual( [ stores.tiWhatsNew.unseen, stores.tiWhatsNew.first ], [ 0, "" ] );
        assert.deepEqual( plain( requests ), [ { url: "/app/whats-new-seen", method: "POST", body: {} } ] );
        assert.equal( stores.tiWhatsNew.moreText, "" );
        assert.equal( stores.tiWhatsNew.label, "What's New" );
        stores.tiWhatsNew.open();
        assert.deepEqual( plain( stores.tiApplication.opened ), [ "whats-new" ] );
    } );

    it( "keeps the release seen when its status answers after it was marked", async () => {
        const { stores } = shell();
        const tiApplication = stores.tiApplication;
        const answered = tiApplication.sendRequest;
        let answer;
        tiApplication.sendRequest = ( url, method, body ) => ( url === "/app/whats-new-status" )
            ? new Promise( ( resolve ) => { answer = resolve; } )
            : answered( url, method, body );
        // A deep link to the screen: the status is asked, then the screen marks the release seen before it answers.
        const loading = stores.tiWhatsNew.load();
        await stores.tiWhatsNew.markSeen();
        answer( { data: { unseen: 5, first: "Reports" } } );
        await loading;
        assert.deepEqual( [ stores.tiWhatsNew.unseen, stores.tiWhatsNew.first ], [ 0, "" ] );
        assert.equal( stores.tiWhatsNew.label, "What's New" );
    } );

    it( "says nothing when the status cannot load", async () => {
        const { stores } = shell( { "/app/whats-new-status": new Error( "down" ) } );
        stores.tiWhatsNew.unseen = 4;
        await stores.tiWhatsNew.load();
        assert.equal( stores.tiWhatsNew.unseen, 0 );
        assert.deepEqual( plain( stores.tiApplication.notified ), [] );
    } );

} );

describe( "the What's new screen", () => {

    const notes = { release: { version: "2.2.0", since: "2026-10-19T10:00:00.000Z" }, fresh: [ { id: "a", version: "2.2.0", kind: "improved", title: "A", text: "x", screen: "whats-new" } ], earlier: [] };

    it( "marks the release seen once it has shown notes the reader had not seen, and not again after", async () => {
        const unseen = shell( { "/app/whats-new": Object.assign( { seen: false }, notes ) } );
        const screen = unseen.components.tiScreenWhatsNew();
        screen.load();
        await settle();
        assert.deepEqual( unseen.requests.map( ( request ) => request.url ), [ "/app/whats-new", "/app/whats-new-seen" ] );
        assert.equal( screen.kindClass( screen.fresh[ 0 ] ), "info" );
        assert.equal( screen.canOpen( screen.fresh[ 0 ] ), false, "a note about this very screen offers no link to it" );

        const seen = shell( { "/app/whats-new": Object.assign( { seen: true }, notes ) } );
        seen.components.tiScreenWhatsNew().load();
        await settle();
        assert.deepEqual( seen.requests.map( ( request ) => request.url ), [ "/app/whats-new" ] );
    } );

    it( "renders a title's marked part as its emphasis, and a plain title whole", () => {
        const { stores, components } = shell();
        const screen = components.tiScreenWhatsNew();
        assert.deepEqual( plain( screen.pageTitle ), { before: "What's new", em: "", after: "" } );
        stores.tiApplication.configuration = { labels: { interface: { "whats-new": { "page-title": "What's *new*" } } } };
        assert.deepEqual( plain( screen.pageTitle ), { before: "What's ", em: "new", after: "" } );
    } );

} );

describe( "the screen trail and Send Feedback", () => {

    it( "remembers the screen left for Send Feedback, and only that one", () => {
        const { stores, effects } = shell();
        stores.tiScreenTrail.init();
        const visit = ( screen ) => {
            stores.tiApplication.currentScreen = screen;
            effects.forEach( ( effect ) => effect() );
        };
        visit( "dashboard" );
        visit( "reports" );
        assert.equal( stores.tiScreenTrail.previous, "" );
        visit( "send-feedback" );
        assert.equal( stores.tiScreenTrail.previous, "reports" );
        visit( "profile" );
        assert.equal( stores.tiScreenTrail.previous, "reports", "kept while the form's request may still be on its way" );
    } );

    it( "sends the screen and the browser with a problem only, and thanks the sender", async () => {
        const { stores, components, requests, sandbox } = shell();
        sandbox.navigator = { userAgent: "TestBrowser/1.0" };
        stores.tiScreenTrail.previous = "reports";
        const form = components.tiScreenSendFeedback();
        assert.equal( form.canSend, false );

        form.setKind( "suggestion" );
        form.setText( "  An idea.  " );
        assert.equal( form.canSend, true );
        form.send();
        await settle();
        assert.deepEqual( plain( requests[ 0 ] ), { url: "/app/send-feedback", method: "POST", body: { kind: "suggestion", text: "An idea.", anonymous: false, screen: "", browser: "" } } );
        assert.equal( form.sent, true );

        form.another();
        form.setKind( "problem" );
        form.setText( "It broke." );
        form.setAnonymous( true );
        assert.match( form.contextText, /\(reports\)/ );
        form.send();
        await settle();
        assert.deepEqual( plain( requests[ 1 ].body ), { kind: "problem", text: "It broke.", anonymous: true, screen: "reports", browser: "TestBrowser/1.0" } );
    } );

    it( "refuses a kind it does not offer, and text over the limit", () => {
        const form = shell().components.tiScreenSendFeedback();
        form.setKind( "rant" );
        assert.equal( form.kind, "" );
        form.setKind( "other" );
        form.setText( "x".repeat( 4001 ) );
        assert.equal( form.canSend, false );
        assert.equal( form.remainingText, "0 characters left" );
    } );

} );

describe( "the Feedback screen", () => {

    const items = [
        { feedbackID: "a", kind: "problem", text: "Broken.", status: "new", anonymous: false, senderName: "Jane Doe", context: { screen: "reports", version: "2.2.0", language: "en", browser: "" } },
        { feedbackID: "b", kind: "praise", text: "Nice.", status: "done", anonymous: true, senderName: "", context: null }
    ];

    it( "shows new items first, counts each status, and names nobody for an anonymous item", async () => {
        const { components } = shell( { "/app/feedback-inbox": { items } } );
        const inbox = components.tiScreenFeedbackInbox();
        inbox.load();
        await settle();
        assert.deepEqual( inbox.shown.map( ( item ) => item.feedbackID ), [ "a" ] );
        assert.deepEqual( plain( inbox.statusChoices ).map( ( choice ) => choice.text ), [ "new (1)", "in-progress (0)", "done (1)", "declined (0)", "All (2)" ] );
        assert.equal( inbox.senderText( items[ 0 ] ), "Jane Doe" );
        assert.equal( inbox.senderText( items[ 1 ] ), "Anonymous" );
        assert.deepEqual( plain( inbox.contextLines( items[ 0 ] ) ).map( ( line ) => line.value ), [ "reports", "2.2.0", "EN", "—" ] );
        inbox.setStatusFilter( "all" );
        inbox.setKindFilter( "praise" );
        assert.deepEqual( inbox.shown.map( ( item ) => item.feedbackID ), [ "b" ] );
    } );

    it( "puts a status back when saving it fails", async () => {
        const { components } = shell( { "/app/feedback-status": new Error( "refused" ) } );
        const inbox = components.tiScreenFeedbackInbox();
        const item = { feedbackID: "a", kind: "problem", status: "new" };
        inbox.setStatus( item, "done" );
        assert.equal( item.status, "done" );
        await settle();
        assert.equal( item.status, "new" );
    } );

} );
