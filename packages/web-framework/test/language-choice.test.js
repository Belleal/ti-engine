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
 * Covers choosing the interface language on the sign-in screen (CA-410).
 * <br/>
 * Before this, a session's language was settled before the visitor arrived: `user.language`, which no sign-in sets,
 * else the configured language, else the deployment's. The sign-in screen itself was always in the deployment's
 * language, a served fragment was bound to one file when it was registered, and the immutable fragments shared one
 * content address that could not tell two languages apart. The suites below follow the choice from the configuration
 * through the link, the cookie and sign-in to what is rendered: the label catalogue, `<html lang>`, the switch, and a
 * fragment that exists in two languages under one address per language.
 */

// A deployment in Bulgarian, so the deployment's language, English and a third language are three different steps.
// Core reads it once, when its configuration loads, so it is set before anything is required.
process.env.TI_LOCALIZATION_LANGUAGE = "bg";

const { after, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const os = require( "node:os" );
const path = require( "node:path" );

const localization = require( "@ti-engine/core/localization" );
const webHandlers = require( "#web-handlers" );
const applyWebConfigEnvOverrides = require( "#web-config-env" );
const TiWebServer = require( "#web-server" );
const TiWebAppManager = require( "#web-app-manager" );

const FRAMEWORK_STATIC = path.resolve( __dirname, "..", "bin", "static" );
const SYSTEM = localization.getSystemLanguage();
const OTHER = "en";
const WORK = fs.mkdtempSync( path.join( os.tmpdir(), "ti-language-choice-" ) );

after( () => fs.rmSync( WORK, { recursive: true, force: true } ) );

/**
 * A server stand-in with the configuration and offered languages a handler reads.
 *
 * @param {Object} [options]
 * @param {string[]} [options.offered]
 * @param {string} [options.serviceLanguage]
 * @returns {Object}
 */
function server( { offered = [ "en", "bg" ], serviceLanguage } = {} ) {
    const serviceConfig = {};
    if ( serviceLanguage !== undefined ) {
        serviceConfig.language = serviceLanguage;
    }
    return { serviceConfig: serviceConfig, offeredLanguages: offered };
}

/**
 * A request as the handlers see it: cookies parsed, an optional session, and the headers `isSecureRequest` reads.
 *
 * @param {Object} [options]
 * @returns {Object}
 */
function request( { cookies = {}, session, code, secure = false } = {} ) {
    const headers = { host: "app.example.com" };
    return {
        cookies: cookies,
        session: session,
        params: { code: code },
        secure: secure,
        protocol: secure ? "https" : "http",
        get: ( name ) => headers[ String( name ).toLowerCase() ]
    };
}

/**
 * A response that records what the language handler does with it.
 *
 * @returns {Object}
 */
function response() {
    const recorded = { cookies: [], headers: {}, redirect: null };
    return {
        recorded: recorded,
        cookie: ( name, value, options ) => recorded.cookies.push( { name, value, options } ),
        set: ( name, value ) => {
            recorded.headers[ name ] = value;
        },
        redirect: ( status, location ) => {
            recorded.redirect = { status, location };
        }
    };
}

describe( "the languages a deployment offers", () => {

    it( "are none until configured, so a deployment that configures nothing behaves as before", () => {
        assert.deepEqual( TiWebServer.resolveOfferedLanguages(), { languages: [], warnings: [] } );
        assert.deepEqual( TiWebServer.resolveOfferedLanguages( null ).languages, [] );
    } );

    it( "are trimmed, lowercased and kept once, in the order given", () => {
        assert.deepEqual( TiWebServer.resolveOfferedLanguages( [ " EN ", "bg", "en" ] ), { languages: [ "en", "bg" ], warnings: [] } );
        assert.deepEqual( TiWebServer.resolveOfferedLanguages( "bg" ).languages, [ "bg" ] );
    } );

    it( "leave out a code core does not know, with a warning, rather than failing the start", () => {
        const resolved = TiWebServer.resolveOfferedLanguages( [ "en", "gb", "bg" ] );
        assert.deepEqual( resolved.languages, [ "en", "bg" ] );
        assert.equal( resolved.warnings.length, 1 );
        assert.match( resolved.warnings[ 0 ], /'gb'/ );
    } );

    it( "can be set with TI_WEB_LANGUAGES, which replaces the configured list", () => {
        assert.deepEqual( applyWebConfigEnvOverrides( { languages: [ "de" ] }, { TI_WEB_LANGUAGES: "en, bg ,," } ).languages, [ "en", "bg" ] );
        assert.deepEqual( applyWebConfigEnvOverrides( { languages: [ "de" ] }, {} ).languages, [ "de" ] );
    } );

} );

describe( "the language a request is answered in", () => {

    it( "is a signed-in session's own", () => {
        const signedIn = { user: { userID: "u1" }, language: "en" };
        assert.equal( webHandlers.resolveRequestLanguage( request( { session: signedIn, cookies: { "ti-language": "bg" } } ), server() ), "en" );
    } );

    it( "is the visitor's choice before sign-in, when it is offered", () => {
        assert.equal( webHandlers.resolveRequestLanguage( request( { cookies: { "ti-language": OTHER } } ), server() ), OTHER );
    } );

    it( "ignores a choice the deployment does not offer, and any choice where it offers none", () => {
        assert.equal( webHandlers.resolveRequestLanguage( request( { cookies: { "ti-language": "de" } } ), server() ), SYSTEM );
        assert.equal( webHandlers.resolveRequestLanguage( request( { cookies: { "ti-language": OTHER } } ), server( { offered: [] } ) ), SYSTEM );
    } );

    it( "is otherwise the configured language, then the deployment's", () => {
        assert.equal( webHandlers.resolveRequestLanguage( request(), server( { serviceLanguage: "de" } ) ), "de" );
        assert.equal( webHandlers.resolveRequestLanguage( request(), server() ), SYSTEM );
    } );

    it( "does not take an anonymous session's language, which nothing should have set", () => {
        assert.equal( webHandlers.resolveRequestLanguage( request( { session: { language: "de" } } ), server() ), SYSTEM );
    } );

} );

describe( "choosing a language", () => {

    it( "keeps an offered language in a cookie for a year and sends the visitor home", () => {
        const answer = response();
        webHandlers.languageChoiceHandler( server() )( request( { code: "bg" } ), answer );
        assert.equal( answer.recorded.cookies.length, 1 );
        const { name, value, options } = answer.recorded.cookies[ 0 ];
        assert.equal( name, "ti-language" );
        assert.equal( value, "bg" );
        assert.deepEqual( options, { path: "/", maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: "lax", httpOnly: true, secure: false } );
        assert.deepEqual( answer.recorded.redirect, { status: 303, location: "/" } );
        assert.equal( answer.recorded.headers[ "Cache-Control" ], "no-store" );
    } );

    it( "marks the cookie Secure on a secure request", () => {
        const answer = response();
        webHandlers.languageChoiceHandler( server() )( request( { code: "en", secure: true } ), answer );
        assert.equal( answer.recorded.cookies[ 0 ].options.secure, true );
    } );

    it( "accepts the code in either case", () => {
        const answer = response();
        webHandlers.languageChoiceHandler( server() )( request( { code: "BG" } ), answer );
        assert.equal( answer.recorded.cookies[ 0 ].value, "bg" );
    } );

    it( "changes nothing for a language the deployment does not offer, and still sends the visitor home", () => {
        const answer = response();
        const session = { user: { userID: "u1" }, language: "en" };
        webHandlers.languageChoiceHandler( server() )( request( { code: "de", session: session } ), answer );
        assert.deepEqual( answer.recorded.cookies, [] );
        assert.equal( session.language, "en" );
        assert.deepEqual( answer.recorded.redirect, { status: 303, location: "/" } );
    } );

    it( "switches a signed-in session at once, so the cookie and the session never disagree", () => {
        const session = { user: { userID: "u1" }, language: "en" };
        webHandlers.languageChoiceHandler( server() )( request( { code: "bg", session: session } ), response() );
        assert.equal( session.language, "bg" );
    } );

    it( "writes nothing to an anonymous visitor's session, which must not be created for a choice", () => {
        const session = {};
        webHandlers.languageChoiceHandler( server() )( request( { code: "bg", session: session } ), response() );
        assert.deepEqual( session, {} );
    } );

    it( "is reachable before sign-in, at two letters and nothing else", () => {
        const matcher = TiWebServer.RE_LANGUAGE_CHOICE_UNPROTECTED;
        assert.equal( matcher.test( "/language/bg" ), true );
        assert.equal( matcher.test( "/language/BG" ), true );
        assert.equal( matcher.test( "/language/bgx" ), false );
        assert.equal( matcher.test( "/language/bg/admin" ), false );
        assert.equal( matcher.test( "/languages/bg" ), false );
    } );

} );

class Harness extends TiWebAppManager {
    constructor() {
        super( "language-choice-test" );
        this.setEnabledAuthMethods( [ "local" ] );
    }
}

describe( "what is rendered in the request's language", () => {

    it( "names the language in <html lang>, and falls back to the deployment's for anything but a two-letter code", async () => {
        const manager = new Harness();
        assert.equal( await manager.transformHtml( "<html lang=\"{ti-language-placeholder}\">", { language: OTHER } ), `<html lang="${ OTHER }">` );
        assert.equal( await manager.transformHtml( "<html lang=\"{ti-language-placeholder}\">", { language: "\"><script>" } ), `<html lang="${ SYSTEM }">` );
        assert.equal( await manager.transformHtml( "<html lang=\"{ti-language-placeholder}\">", {} ), `<html lang="${ SYSTEM }">` );
    } );

    it( "draws the switch between the offered languages, each named in its own language, the current one marked", async () => {
        const html = await new Harness().transformHtml( "{ti-language-switch-placeholder}", { language: "bg", languages: [ "en", "bg" ] } );
        assert.match( html, /^<div class="ti-login-card-foot"><nav class="ti-login-languages" aria-label="[^"]+">/ );
        assert.match( html, /<a class="ti-login-language" href="\/language\/en" lang="en" hreflang="en" aria-label="English">EN<\/a>/ );
        assert.match( html, /<a class="ti-login-language" href="\/language\/bg" lang="bg" hreflang="bg" aria-label="Български" aria-current="true">BG<\/a>/ );
        assert.equal( ( html.match( /aria-current/g ) || [] ).length, 1 );
    } );

    it( "draws no switch, and no empty footer, with fewer than two languages", async () => {
        const manager = new Harness();
        assert.equal( await manager.transformHtml( "[{ti-language-switch-placeholder}]", { language: "bg", languages: [ "bg" ] } ), "[]" );
        assert.equal( await manager.transformHtml( "[{ti-language-switch-placeholder}]", { language: "bg" } ), "[]" );
    } );

    it( "puts the switch on the sign-in card, after the sign-in methods", async () => {
        const html = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/app", { language: "bg", languages: [ "en", "bg" ] } );
        const card = html.slice( html.indexOf( "class=\"ti-login-card\"" ) );
        assert.ok( card.indexOf( "ti-login-card-foot" ) > card.indexOf( "ti-login-form" ), "the switch comes after the methods" );
        assert.doesNotMatch( html, /\{ti-language-switch-placeholder}/ );
    } );

    it( "writes the page's language into the framework's index.html", async () => {
        const html = await new Harness().assembleHtmlView( {}, [ FRAMEWORK_STATIC ], "/", { language: OTHER } );
        assert.match( html, new RegExp( `<html lang="${ OTHER }"` ) );
    } );

    it( "points an anonymous visitor at the label catalogue of the language they chose", async () => {
        const manager = new Harness();
        const config = await manager.processDataRequest( {}, "config", { language: OTHER } );
        assert.equal( config.labelsBundle.hash, manager.getLabelsBundle( OTHER ).hash );
        assert.notEqual( config.labelsBundle.hash, manager.getLabelsBundle( SYSTEM ).hash );
    } );

} );

describe( "a fragment in two languages", () => {

    const root = path.join( WORK, "static" );
    const write = ( relative, content ) => {
        fs.mkdirSync( path.dirname( path.join( root, relative ) ), { recursive: true } );
        fs.writeFileSync( path.join( root, relative ), content );
    };
    write( `fragments/guide/${ SYSTEM }/frame-chapter.html`, `<section><h1>${ SYSTEM }</h1><a hx-get="/app/other-chapter">Next</a></section>` );
    write( `fragments/guide/${ OTHER }/frame-chapter.html`, `<section><h1>${ OTHER }</h1><a hx-get="/app/other-chapter">Next</a></section>` );
    write( `fragments/guide/${ SYSTEM }/frame-other.html`, "<section><h1>other</h1></section>" );
    write( "fragments/guide/en/frame-english-only.html", "<section><h1>english only</h1></section>" );
    write( "fragments/frame-screen.html", "<section><button hx-get=\"/app/chapter\">Guide</button></section>" );

    class Guide extends TiWebAppManager {
        constructor() {
            super( "language-choice-guide" );
            this.addFragment( "chapter", { title: "Chapter", path: "fragments/guide/{language}/frame-chapter.html", immutable: true } );
            this.addFragment( "other-chapter", { title: "Other", path: "fragments/guide/{language}/frame-other.html", immutable: true } );
            this.addFragment( "english-only", { title: "English only", path: "fragments/guide/{language}/frame-english-only.html" } );
            this.addFragment( "screen", { title: "Screen", path: "fragments/frame-screen.html" } );
        }
    }

    const PATHS = [ FRAMEWORK_STATIC, root ];
    const render = ( manager, view, language, extra = {} ) => manager.assembleHtmlView( { user: { roles: [] } }, PATHS, `/app/${ view }`, { view: view, isPartial: true, language: language, ...extra } );
    const versionIn = ( html ) => ( /\?v=([0-9a-f]{12})"/.exec( html ) || [] )[ 1 ] || null;

    it( "is served from the request's language", async () => {
        const manager = new Guide();
        assert.match( await render( manager, "chapter", OTHER ), new RegExp( `<h1>${ OTHER }</h1>` ) );
        assert.match( await render( manager, "chapter", SYSTEM ), new RegExp( `<h1>${ SYSTEM }</h1>` ) );
    } );

    it( "falls back to the deployment's language when the request's has no file", async () => {
        assert.match( await render( new Guide(), "other-chapter", OTHER ), /<h1>other<\/h1>/ );
        assert.match( await render( new Guide(), "chapter", "zz" ), new RegExp( `<h1>${ SYSTEM }</h1>` ) );
    } );

    it( "falls back to English last, so a deployment whose language has no file still serves the screen", async () => {
        assert.equal( SYSTEM, "bg", "the deployment's language must differ from English for this to test anything" );
        assert.match( await render( new Guide(), "english-only", "de" ), /<h1>english only<\/h1>/ );
        assert.match( await render( new Guide(), "english-only", SYSTEM ), /<h1>english only<\/h1>/ );
    } );

    it( "is addressed once per language, so a browser keeps one copy of each and never serves one for the other", async () => {
        const manager = new Guide();
        const inSystem = versionIn( await render( manager, "screen", SYSTEM ) );
        const inOther = versionIn( await render( manager, "screen", OTHER ) );
        assert.ok( inSystem && inOther, "each language's references carry an address" );
        assert.notEqual( inSystem, inOther );
    } );

    it( "is kept for good only when the address is the one for the request's language", async () => {
        const manager = new Guide();
        const inSystem = versionIn( await render( manager, "screen", SYSTEM ) );
        const inOther = versionIn( await render( manager, "screen", OTHER ) );
        const kept = async ( language, version ) => {
            let addressed = false;
            await render( manager, "chapter", language, { version: version, onAddressed: () => {
                addressed = true;
            } } );
            return addressed;
        };
        assert.equal( await kept( OTHER, inOther ), true );
        assert.equal( await kept( SYSTEM, inSystem ), true );
        assert.equal( await kept( OTHER, inSystem ), false, "another language's address is served revalidating" );
    } );

} );
