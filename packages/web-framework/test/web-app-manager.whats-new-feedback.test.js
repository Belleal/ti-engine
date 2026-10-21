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
 * Covers What's new and Feedback as an application meets them through `TiWebAppManager` (1.56.0, CA-528): nothing until
 * the application enables them; then the screens, the requests, who may make each, the subject hook, the default user
 * menu, and the flag the browser reads. The screens' English is checked against the framework's catalogue, as the
 * sign-in screen's is. And the picture of the screen sent with feedback (1.58.0, CA-544): sent, kept apart, and shown to
 * administrators only.
 */

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const cacheStub = installInMemoryCache();

const exceptions = require( "@ti-engine/core/exceptions" );
const TiWebAppManager = require( "../bin/web-app-manager.js" );
const feedback = require( "../components/feedback.js" );
const PICTURES = require( "./helpers/feedback-pictures" );

const FRAGMENTS = path.join( __dirname, "..", "bin", "static", "fragments" );
const CATALOGUE = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

const NOTES = [
    { version: "9.9.9", notes: [ { id: "future", kind: "new", audience: [ "everyone" ], title: { en: "Later" }, text: { en: "Not yet." } } ] },
    {
        version: "0.0.1", notes: [
            { id: "reports", kind: "new", audience: [ "everyone" ], screen: "reports", title: { en: "Reports" }, text: { en: "A screen." } },
            { id: "settings", kind: "new", audience: [ "admin" ], screen: "settings", title: { en: "Settings" }, text: { en: "Admins only." } },
            { id: "about-settings", kind: "new", audience: [ "everyone" ], screen: "settings", title: { en: "About settings" }, text: { en: "For all, on an admin screen." } },
            { id: "team", kind: "improved", audience: [ "manager" ], screen: "login", title: { en: "Team" }, text: { en: "Managers." } }
        ]
    }
];

class PlainApp extends TiWebAppManager {
    constructor() {
        super( "plain-app" );
    }
}

class FeatureApp extends TiWebAppManager {
    constructor() {
        super( "feature-app" );
        this.addFragment( "reports", { title: "Reports", path: "fragments/frame-dashboard.html" } );
        this.addFragment( "settings", { title: "Settings", path: "fragments/frame-dashboard.html", roles: [ "admin" ] } );
        this.enableWhatsNew( { notes: NOTES, baseline: null, audiences: { manager: [ 2 ] } } );
        this.enableFeedback( { dateLocales: { en: "en-GB" } } );
    }
}

class EmployeeApp extends FeatureApp {
    // The application's own record of a person, as an appraisal application keeps one.
    resolveSubject( session ) {
        return session && session.user && session.user.employeeID ? { id: session.user.employeeID, name: "Employee " + session.user.employeeID } : null;
    }
}

const USER = { language: "en", user: { userID: "u-1", name: "Jane Doe", username: "jane", email: "jane@example.com", roles: [ 2 ] } };
const ADMIN = { language: "en", user: { userID: "u-2", name: "Ann Admin", email: "ann@example.com", roles: [ "admin" ] } };

const rejection = async ( promise ) => {
    try {
        await promise;
    } catch ( error ) {
        return error;
    }
    assert.fail( "expected a rejection" );
};

describe( "TiWebAppManager — What's new and Feedback are the application's choice", () => {

    beforeEach( () => {
        cacheStub.storage = {};
        cacheStub.values = {};
    } );

    it( "offers neither, nor their menu entries, to an application that did not enable them", async () => {
        const app = new PlainApp();
        for ( const view of [ "whats-new", "whats-new-status", "feedback-inbox", "feedback-picture" ] ) {
            assert.equal( ( await rejection( app.processDataRequest( ADMIN, view ) ) ).code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI, view );
        }
        for ( const service of [ "whats-new-seen", "send-feedback", "feedback-status" ] ) {
            assert.equal( ( await rejection( app.processServiceRequest( ADMIN, service, {} ) ) ).code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_URI, service );
        }
        const config = await app.processDataRequest( USER, "config" );
        assert.deepEqual( config.features, { whatsNew: false, feedback: false } );
        const icons = config.componentsConfig.userProfileMenu.buttonConfigs.map( ( button ) => button.icon );
        assert.deepEqual( icons, [ "user-profile", "info-circle", "logout" ] );
    } );

    it( "registers the screens, flags them for the browser and adds them to the default user menu once enabled", async () => {
        const app = new FeatureApp();
        const config = await app.processDataRequest( USER, "config" );
        assert.deepEqual( config.features, { whatsNew: true, feedback: true } );
        const menu = config.componentsConfig.userProfileMenu.buttonConfigs.map( ( button ) => button.action.href );
        assert.deepEqual( menu, [ "/app/profile", "/app/whats-new", "/app/send-feedback", "/app/about", "/logout" ] );
        for ( const file of [ "frame-whats-new.html", "frame-send-feedback.html", "frame-feedback-inbox.html" ] ) {
            assert.ok( fs.existsSync( path.join( FRAGMENTS, file ) ), file );
        }
        // The administrators' screen is gated like any role-restricted fragment.
        await assert.rejects( app.verifyAccess( USER, { roles: [ "admin" ] } ) );
    } );

} );

describe( "TiWebAppManager — What's new requests", () => {

    beforeEach( () => {
        cacheStub.storage = {};
        cacheStub.values = {};
    } );

    it( "shows a reader the notes for their audiences, with a link only to a screen they may open", async () => {
        const app = new FeatureApp();
        const view = await app.processDataRequest( USER, "whats-new" );
        // The manager's note links to the shell's login fragment, which is no screen; the note for everyone about an
        // administrators' screen links only for an administrator.
        assert.deepEqual( view.fresh.map( ( note ) => [ note.id, note.screen ] ), [ [ "reports", "reports" ], [ "about-settings", null ], [ "team", null ] ] );
        const forAdmin = await app.processDataRequest( ADMIN, "whats-new" );
        assert.deepEqual( forAdmin.fresh.map( ( note ) => [ note.id, note.screen ] ), [ [ "reports", "reports" ], [ "settings", "settings" ], [ "about-settings", "settings" ] ] );
        assert.ok( !view.fresh.some( ( note ) => note.id === "future" ), "a note newer than the running version is never shown" );
    } );

    it( "counts the notes unseen until the reader marks the release, per person", async () => {
        const app = new FeatureApp();
        assert.equal( ( await app.processDataRequest( USER, "whats-new-status" ) ).unseen, 3 );
        const marked = await app.processServiceRequest( USER, "whats-new-seen", {} );
        assert.ok( marked.version );
        assert.equal( ( await app.processDataRequest( USER, "whats-new-status" ) ).unseen, 0 );
        assert.equal( ( await app.processDataRequest( ADMIN, "whats-new-status" ) ).unseen, 3, "another person's marker is their own" );
    } );

    it( "refuses a session that names nobody", async () => {
        const app = new FeatureApp();
        for ( const session of [ null, {}, { user: { roles: [] } } ] ) {
            assert.equal( ( await rejection( app.processDataRequest( session, "whats-new" ) ) ).httpCode, 401 );
            assert.equal( ( await rejection( app.processServiceRequest( session, "whats-new-seen", {} ) ) ).httpCode, 401 );
        }
    } );

    it( "keeps the marker under the person the application names, so its erasure can find it", async () => {
        const app = new EmployeeApp();
        await app.processServiceRequest( { language: "en", user: { userID: "oauth2:abc", employeeID: "TD7", roles: [] } }, "whats-new-seen", {} );
        const WhatsNew = require( "../components/whats-new.js" );
        assert.ok( await WhatsNew.instance.markerOf( "TD7" ) );
        assert.equal( await WhatsNew.instance.markerOf( "oauth2:abc" ), null );
    } );

} );

describe( "TiWebAppManager — Feedback requests", () => {

    beforeEach( () => {
        cacheStub.storage = {};
        cacheStub.values = {};
    } );

    it( "stores feedback from anyone signed in, a problem's screen kept only where it is one of the application's", async () => {
        const app = new FeatureApp();
        const sent = await app.processServiceRequest( USER, "send-feedback", { kind: "problem", text: "Broken.", screen: "reports", browser: "Firefox" } );
        const stored = await feedback.instance.fetch( sent.feedbackID );
        assert.equal( stored.submittedBy, "u-1" );
        assert.equal( stored.senderName, "Jane Doe" );
        assert.equal( stored.context.screen, "reports" );
        assert.equal( stored.context.language, "en" );

        for ( const shell of [ "login", "application-main", "home", "not-found", "nowhere" ] ) {
            const other = await app.processServiceRequest( USER, "send-feedback", { kind: "problem", text: "Broken.", screen: shell } );
            assert.equal( ( await feedback.instance.fetch( other.feedbackID ) ).context.screen, "", shell );
        }
    } );

    it( "names the sender as the application knows them", async () => {
        const app = new EmployeeApp();
        const sent = await app.processServiceRequest( { language: "en", user: { userID: "oauth2:abc", employeeID: "TD7", roles: [] } }, "send-feedback", { kind: "praise", text: "Good." } );
        const stored = await feedback.instance.fetch( sent.feedbackID );
        assert.deepEqual( [ stored.submittedBy, stored.senderName ], [ "TD7", "Employee TD7" ] );
    } );

    it( "refuses feedback from a session that names nobody, and a malformed one with the label the browser shows", async () => {
        const app = new FeatureApp();
        assert.equal( ( await rejection( app.processServiceRequest( null, "send-feedback", { kind: "other", text: "x" } ) ) ).httpCode, 401 );
        const refused = await rejection( app.processServiceRequest( USER, "send-feedback", { kind: "other", text: "" } ) );
        assert.deepEqual( [ refused.httpCode, refused.data.details ], [ 422, "error.feedback.text-empty" ] );
    } );

    it( "lists every item for an administrator only, without a name on an anonymous one", async () => {
        const app = new FeatureApp();
        await app.processServiceRequest( USER, "send-feedback", { kind: "suggestion", text: "Named." } );
        await app.processServiceRequest( USER, "send-feedback", { kind: "suggestion", text: "Anonymous.", anonymous: true } );

        assert.equal( ( await rejection( app.processDataRequest( USER, "feedback-inbox" ) ) ).httpCode, 403 );
        assert.equal( ( await rejection( app.processDataRequest( null, "feedback-inbox" ) ) ).httpCode, 401 );

        const { items } = await app.processDataRequest( ADMIN, "feedback-inbox" );
        const byText = Object.fromEntries( items.map( ( item ) => [ item.text, item ] ) );
        assert.equal( byText[ "Named." ].senderName, "Jane Doe" );
        assert.equal( byText[ "Anonymous." ].senderName, "" );
        assert.equal( byText[ "Anonymous." ].anonymous, true );
        assert.ok( !( "submittedBy" in byText[ "Named." ] ), "the inbox has no use for the sender's ID" );
    } );

    it( "keeps a picture of the screen sent with feedback, says in the inbox only that there is one, and shows it to an administrator alone", async () => {
        const app = new FeatureApp();
        const sent = await app.processServiceRequest( USER, "send-feedback", { kind: "problem", text: "Broken.", screen: "reports", picture: PICTURES.webpOpaque } );
        const plain = await app.processServiceRequest( USER, "send-feedback", { kind: "suggestion", text: "Idea." } );

        const { items } = await app.processDataRequest( ADMIN, "feedback-inbox" );
        const byID = Object.fromEntries( items.map( ( item ) => [ item.feedbackID, item ] ) );
        assert.deepEqual( byID[ sent.feedbackID ].picture, { type: "image/webp", width: 40, height: 30 } );
        assert.equal( byID[ plain.feedbackID ].picture, null );
        assert.ok( !JSON.stringify( items ).includes( PICTURES.webpOpaque.split( "," )[ 1 ].slice( 0, 64 ) ), "the list never carries the image" );

        const query = { query: { feedbackID: sent.feedbackID } };
        assert.equal( ( await rejection( app.processDataRequest( USER, "feedback-picture", query ) ) ).httpCode, 403, "not even the sender" );
        assert.equal( ( await rejection( app.processDataRequest( null, "feedback-picture", query ) ) ).httpCode, 401 );
        const picture = await app.processDataRequest( ADMIN, "feedback-picture", query );
        assert.deepEqual( picture, { feedbackID: sent.feedbackID, type: "image/webp", width: 40, height: 30, data: PICTURES.webpOpaque.split( "," )[ 1 ] } );

        for ( const feedbackID of [ plain.feedbackID, "no-such-item", "*", "" ] ) {
            const missing = await rejection( app.processDataRequest( ADMIN, "feedback-picture", { query: { feedbackID: feedbackID } } ) );
            assert.deepEqual( [ missing.httpCode, missing.data.details ], [ 404, "error.feedback.picture-not-found" ], feedbackID );
        }
    } );

    it( "refuses feedback whose picture is not one it accepts, with the label the browser shows", async () => {
        const app = new FeatureApp();
        const refused = await rejection( app.processServiceRequest( USER, "send-feedback", { kind: "problem", text: "Broken.", picture: "data:image/png;base64,AAAA" } ) );
        assert.deepEqual( [ refused.httpCode, refused.data.details ], [ 422, "error.feedback.picture" ] );
    } );

    it( "lets an administrator alone give an item a status, recorded under their user ID", async () => {
        const app = new FeatureApp();
        const sent = await app.processServiceRequest( USER, "send-feedback", { kind: "problem", text: "Broken." } );
        assert.equal( ( await rejection( app.processServiceRequest( USER, "feedback-status", { feedbackID: sent.feedbackID, status: "done" } ) ) ).httpCode, 403 );
        const changed = await app.processServiceRequest( ADMIN, "feedback-status", { feedbackID: sent.feedbackID, status: "done" } );
        assert.equal( changed.status, "done" );
        assert.equal( ( await feedback.instance.fetch( sent.feedbackID ) ).statusChangedBy, "u-2" );
    } );

} );

describe( "the What's new and Feedback screens", () => {

    const lookup = ( key ) => key.split( "." ).reduce( ( branch, part ) => ( branch && typeof branch === "object" ) ? branch[ part ] : undefined, CATALOGUE );

    it( "name only keys the framework's catalogue holds in English and Bulgarian, each with its English on the element", () => {
        for ( const file of [ "frame-whats-new.html", "frame-send-feedback.html", "frame-feedback-inbox.html" ] ) {
            const html = fs.readFileSync( path.join( FRAGMENTS, file ), "utf8" );
            const keys = [ ...html.matchAll( /x-text-label(?::[\w-]+)?="([^"]+)"/g ) ].map( ( match ) => match[ 1 ] );
            assert.ok( keys.length > 3, file );
            for ( const key of keys ) {
                const entry = lookup( key );
                assert.ok( entry && entry.en && entry.bg, `${ file }: ${ key }` );
            }
            // An element's own English is what shows where an application's catalogue has no text for its key.
            for ( const match of html.matchAll( /x-text-label="([^"]+)"[^>]*>([^<]+)</g ) ) {
                assert.equal( match[ 2 ].trim(), lookup( match[ 1 ] ).en, `${ file }: ${ match[ 1 ] }` );
            }
        }
    } );

    it( "keep every key an application's own copy of the catalogue needs, with no product's name in them", () => {
        const text = JSON.stringify( [ "whats-new", "send-feedback", "feedback-inbox", "feedback" ].map( ( group ) => CATALOGUE.interface[ group ] ) );
        assert.doesNotMatch( text, /competence/i );
        assert.ok( lookup( "interface.notice.feedback-received.subject" ).bg );
    } );

} );
