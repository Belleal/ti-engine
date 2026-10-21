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
 * Sign-in with a link sent by e-mail (1.57.0, CA-537): the address check, the hourly limits, the token and its one use,
 * the notice and the method's place in AuthManager. Design record:
 * `docs/superpowers/specs/2026-10-20-web-framework-email-link-sign-in-design.md`.
 */

const { describe, it, beforeEach, before, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const cacheStub = installInMemoryCache();

const logger = require( "@ti-engine/core/logger" );
const localization = require( "@ti-engine/core/localization" );
const NotificationService = require( "../components/notification-service.js" );
const EmailLink = require( "#email-link" );
const AuthManager = require( "#auth-manager" );

const CATALOGUE = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );
const lookup = ( key, language ) => {
    const node = key.split( "." ).reduce( ( branch, part ) => ( branch && typeof branch === "object" ) ? branch[ part ] : undefined, CATALOGUE );
    return ( node && typeof node[ language ] === "string" ) ? node[ language ] : undefined;
};
const originalGetLabel = localization.getLabel;
const originalSystemLanguage = localization.getSystemLanguage;

const PUBLIC_URL = "https://app.example.com";
const START = Date.UTC( 2026, 9, 20, 10, 0, 0 );

let sent = [];
let failNext = null;
const capturing = {
    send: ( message ) => {
        if ( failNext ) {
            const error = failNext;
            failNext = null;
            return Promise.reject( error );
        }
        sent.push( message );
        return Promise.resolve( { messageId: "m-" + sent.length } );
    }
};

// A clock the test moves by hand.
const clock = () => {
    let now = START;
    return { now: () => now, advance: ( milliseconds ) => {
        now += milliseconds;
    } };
};

const tokenOf = ( message ) => {
    const match = /#email-link=([A-Za-z0-9_-]+)/.exec( message.text );
    return match ? match[ 1 ] : null;
};

const tokenKeys = () => Object.keys( cacheStub.values ).filter( ( key ) => key.startsWith( "ti:auth:email-link:token:" ) );

const ready = () => {
    NotificationService.instance.configure( { transport: "log", publicUrl: PUBLIC_URL } );
    NotificationService.instance.setTransport( capturing );
};

before( () => {
    localization.getLabel = ( key, language, fallback ) => {
        const value = lookup( key, language );
        return ( value === undefined ) ? fallback : value;
    };
    localization.getSystemLanguage = () => "en";
} );

after( () => {
    localization.getLabel = originalGetLabel;
    localization.getSystemLanguage = originalSystemLanguage;
    NotificationService.instance.configure( {} );
} );

beforeEach( () => {
    cacheStub.storage = {};
    cacheStub.values = {};
    sent = [];
    failNext = null;
    ready();
} );

describe( "EmailLink — the address", () => {

    it( "keeps an address trimmed and lower-cased, so two spellings are one person", () => {
        assert.equal( EmailLink.normalizeAddress( "  Parent.Name+x@Gmail.COM " ), "parent.name+x@gmail.com" );
        assert.equal( EmailLink.normalizeAddress( "o'brien@mail.example.bg" ), "o'brien@mail.example.bg" );
    } );

    it( "refuses what is not one address, and anything that could start a mail header", () => {
        const refused = [ "", "a", "a@b", "a@b.", "a@.b", "a@b..c", "@b.c", "a@@b.c", "a b@c.d", "a@b c.d", "<a@b.c>", "a@b.c, d@e.f",
            "a@b.c\r\nBcc: d@e.f", "a@b.c\u0000", "\"a\"@b.c", "a(b)@c.d", "a@[1.2.3.4]", "a;b@c.d" ];
        refused.forEach( ( value ) => assert.equal( EmailLink.normalizeAddress( value ), null, JSON.stringify( value ) ) );
        assert.equal( EmailLink.normalizeAddress( 42 ), null );
        assert.equal( EmailLink.normalizeAddress( [ "a@b.c" ] ), null, "a repeated form field arrives as a list" );
    } );

    it( "refuses an address outside printable ASCII, which could pass for another on the confirm step", () => {
        // A Cyrillic `а` for a Latin `a`, and invisible characters: a zero-width space, a right-to-left override, a soft hyphen.
        const refused = [ "p\u0430rent@example.com", "parent@ex\u0430mple.com", "par\u200bent@example.com", "parent@example.com\u202e",
            "par\u00adent@example.com", "parent@\u043f\u0440\u0438\u043c\u0435\u0440.\u0431\u0433", "\u00e9l\u00e8ve@example.fr" ];
        refused.forEach( ( value ) => assert.equal( EmailLink.normalizeAddress( value ), null, JSON.stringify( value ) ) );
        assert.equal( EmailLink.normalizeAddress( "parent@xn--e1afmkfd.xn--90ae" ), "parent@xn--e1afmkfd.xn--90ae", "a domain in another script, in its ASCII form" );
        assert.equal( EmailLink.normalizeAddress( "a!#$%&'*+-/=?^_`{|}~@example.com" ), "a!#$%&'*+-/=?^_`{|}~@example.com" );
    } );

    it( "refuses an address over 254 characters", () => {
        const local = "a".repeat( 64 );
        const domain = ( "b".repeat( 60 ) + "." ).repeat( 3 ) + "bg";
        assert.ok( EmailLink.normalizeAddress( `${ local }@${ domain }` ) );
        assert.equal( EmailLink.normalizeAddress( `${ local }@${ "b".repeat( 60 ) }.${ domain }` ), null );
    } );

    it( "names an address in the log by 16 hex digits and a user by 32, never by the address", () => {
        assert.match( EmailLink.subjectOf( "parent@example.com" ), /^[0-9a-f]{16}$/ );
        assert.equal( EmailLink.subjectOf( "203.0.113.7" ), EmailLink.subjectOf( "203.0.113.7" ), "one name per value within a process" );
        // Keyed: an unkeyed SHA-256 of an IPv4 address is reversed by hashing all 2^32 of them.
        const plain = require( "node:crypto" ).createHash( "sha256" ).update( "203.0.113.7" ).digest( "hex" ).slice( 0, 16 );
        assert.notEqual( EmailLink.subjectOf( "203.0.113.7" ), plain );
        assert.match( EmailLink.userIDOf( "parent@example.com" ), /^email:[0-9a-f]{32}$/ );
        assert.equal( EmailLink.userIDOf( "parent@example.com" ), EmailLink.userIDOf( "parent@example.com" ), "the same address is the same user" );
        assert.notEqual( EmailLink.userIDOf( "parent@example.com" ), EmailLink.userIDOf( "other@example.com" ) );
    } );

} );

describe( "EmailLink — the settings", () => {

    it( "takes the defaults when nothing is configured", () => {
        const { settings, warnings } = EmailLink.resolveSettings( undefined );
        assert.deepEqual( { ...settings, allowedDomains: [ ...settings.allowedDomains ] }, { lifetimeMinutes: 15, allowedDomains: [], hourlyLimitPerAddress: 5, hourlyLimitPerClient: 30, hourlyLimitOverall: 100 } );
        assert.deepEqual( warnings, [] );
    } );

    it( "takes a malformed value's default with a warning, and keeps the rest", () => {
        const { settings, warnings } = EmailLink.resolveSettings( { lifetimeMinutes: 0, hourlyLimitPerAddress: 3, hourlyLimitPerClient: "9", hourlyLimitOverall: -1 } );
        assert.equal( settings.lifetimeMinutes, 15 );
        assert.equal( settings.hourlyLimitPerAddress, 3 );
        assert.equal( settings.hourlyLimitPerClient, 30 );
        assert.equal( settings.hourlyLimitOverall, 100 );
        assert.equal( warnings.length, 3 );
    } );

    it( "has no setting for the sign-in page, which is always /, where every sign-in's failure goes too", () => {
        assert.equal( Object.hasOwn( EmailLink.resolveSettings( { path: "/app" } ).settings, "path" ), false );
        assert.equal( EmailLink.answerFor( "sent" ), "/?email-link=sent" );
    } );

    it( "caps a link's lifetime at a day", () => {
        assert.equal( EmailLink.resolveSettings( { lifetimeMinutes: 1440 } ).settings.lifetimeMinutes, 1440 );
        assert.equal( EmailLink.resolveSettings( { lifetimeMinutes: 1441 } ).settings.lifetimeMinutes, 15 );
    } );

} );

describe( "EmailLink — asking for a link", () => {

    it( "sends one e-mail at once whose link carries the token in its fragment, and stores only the token's digest", async () => {
        const time = clock();
        const link = new EmailLink( {}, { now: time.now } ).registerNotice();
        assert.equal( await link.request( { email: "Parent@Example.com", client: "203.0.113.7", language: "bg" } ), "sent" );

        assert.equal( sent.length, 1 );
        const message = sent[ 0 ];
        assert.equal( message.to, "parent@example.com" );
        assert.equal( message.subject, lookup( "interface.notice.sign-in-link.subject", "bg" ), "in the language the request was answered in" );
        const token = tokenOf( message );
        assert.match( token, /^[A-Za-z0-9_-]{43}$/ );
        assert.ok( message.text.includes( `${ PUBLIC_URL }/#email-link=${ token }` ) );
        assert.ok( message.html.includes( `${ PUBLIC_URL }/#email-link=${ token }` ) );
        assert.ok( message.text.includes( "15" ), "the text says how long the link works" );

        const keys = tokenKeys();
        assert.equal( keys.length, 1 );
        assert.ok( !keys[ 0 ].includes( token ) && !JSON.stringify( cacheStub.values ).includes( token ), "the store never holds the token" );
        assert.equal( cacheStub.values[ keys[ 0 ] ].expiration, 15 * 60, "the value expires with the link" );
        assert.deepEqual( Object.keys( cacheStub.storage ), [], "never a JSON document, which D1 cannot delete" );
    } );

    it( "answers an address it cannot use without counting or sending anything", async () => {
        const link = new EmailLink().registerNotice();
        assert.equal( await link.request( { email: "not an address", client: "203.0.113.7" } ), "invalid-address" );
        assert.equal( await link.request( {} ), "invalid-address" );
        assert.equal( sent.length, 0 );
        assert.deepEqual( Object.keys( cacheStub.values ), [] );
    } );

    it( "sends nothing outside the allowed domains, and answers as if it had", async () => {
        const link = new EmailLink( { allowedDomains: [ "school.bg" ] } ).registerNotice();
        assert.equal( await link.request( { email: "parent@gmail.com", client: "203.0.113.7" } ), "sent" );
        assert.equal( sent.length, 0 );
        assert.deepEqual( tokenKeys(), [] );
        assert.equal( await link.request( { email: "teacher@School.bg", client: "203.0.113.7" } ), "sent" );
        assert.equal( sent.length, 1 );
    } );

    it( "sends an address five links an hour, then none until the hour that began with the first is over", async () => {
        const time = clock();
        const link = new EmailLink( {}, { now: time.now } ).registerNotice();
        for ( let i = 0; i < 5; i++ ) {
            assert.equal( await link.request( { email: "parent@example.com", client: `198.51.100.${ i }` } ), "sent" );
            time.advance( 60 * 1000 );
        }
        assert.equal( await link.request( { email: "parent@example.com", client: "198.51.100.9" } ), "limited" );
        assert.equal( await link.request( { email: "other@example.com", client: "198.51.100.9" } ), "sent", "another address has its own count" );
        assert.equal( sent.length, 6 );

        time.advance( 55 * 60 * 1000 );
        assert.equal( await link.request( { email: "parent@example.com", client: "198.51.100.9" } ), "sent", "a refused request did not stretch the window" );
    } );

    it( "counts one client's requests whatever the addresses, thirty an hour unless stated", async () => {
        const link = new EmailLink( { hourlyLimitPerClient: 3 } ).registerNotice();
        for ( let i = 0; i < 3; i++ ) {
            assert.equal( await link.request( { email: `p${ i }@example.com`, client: "203.0.113.7" } ), "sent" );
        }
        assert.equal( await link.request( { email: "p9@example.com", client: "203.0.113.7" } ), "limited" );
        assert.equal( await link.request( { email: "p9@example.com", client: "203.0.113.8" } ), "sent" );
        assert.equal( EmailLink.DEFAULTS.hourlyLimitPerClient, 30 );
    } );

    it( "counts an IPv6 client by its /64, which a single host is usually given whole", async () => {
        const link = new EmailLink( { hourlyLimitPerClient: 2 } ).registerNotice();
        assert.equal( await link.request( { email: "p1@example.com", client: "2001:db8:1:2::1" } ), "sent" );
        assert.equal( await link.request( { email: "p2@example.com", client: "2001:db8:1:2:aaaa:bbbb:cccc:dddd" } ), "sent" );
        assert.equal( await link.request( { email: "p3@example.com", client: "2001:0DB8:0001:0002:ffff::9" } ), "limited", "another address in the same /64" );
        assert.equal( await link.request( { email: "p3@example.com", client: "2001:db8:1:3::1" } ), "sent", "the next /64 is another network" );
    } );

    it( "counts an IPv4 address written as IPv6 as the IPv4 address", async () => {
        const link = new EmailLink( { hourlyLimitPerClient: 2 } ).registerNotice();
        assert.equal( await link.request( { email: "p1@example.com", client: "203.0.113.7" } ), "sent" );
        assert.equal( await link.request( { email: "p2@example.com", client: "::ffff:203.0.113.7" } ), "sent" );
        assert.equal( await link.request( { email: "p3@example.com", client: "::FFFF:cb00:7107" } ), "limited" );
        assert.equal( await link.request( { email: "p3@example.com", client: "203.0.113.8" } ), "sent", "another IPv4 address is another client" );
    } );

    it( "counts the spellings that reach one inbox as one address, and sends to the address as given", async () => {
        const link = new EmailLink( { hourlyLimitPerAddress: 2 } ).registerNotice();
        assert.equal( await link.request( { email: "parent.name@gmail.com", client: "198.51.100.1" } ), "sent" );
        assert.equal( await link.request( { email: "ParentName+school@googlemail.com", client: "198.51.100.2" } ), "sent" );
        assert.equal( await link.request( { email: "p.a.r.e.n.t.n.a.m.e@gmail.com", client: "198.51.100.3" } ), "limited", "Gmail ignores dots and the tag" );
        assert.equal( await link.request( { email: "parent+a@example.com", client: "198.51.100.4" } ), "sent" );
        assert.equal( await link.request( { email: "parent+b@example.com", client: "198.51.100.5" } ), "sent" );
        assert.equal( await link.request( { email: "parent@example.com", client: "198.51.100.6" } ), "limited", "a tag reaches the same inbox anywhere" );
        assert.equal( await link.request( { email: "pa.rent@example.com", client: "198.51.100.7" } ), "sent", "elsewhere a dot makes another address" );
        assert.deepEqual( sent.map( ( message ) => message.to ), [ "parent.name@gmail.com", "parentname+school@googlemail.com", "parent+a@example.com", "parent+b@example.com", "pa.rent@example.com" ] );
    } );

    it( "sends at most so many links an hour overall, a hundred unless stated, counting only what it sends", async () => {
        const time = clock();
        const link = new EmailLink( { hourlyLimitOverall: 2, allowedDomains: [ "example.com" ] }, { now: time.now } ).registerNotice();
        assert.equal( await link.request( { email: "p1@other.org", client: "198.51.100.1" } ), "sent", "answered so, but nothing was sent" );
        assert.equal( await link.request( { email: "p1@example.com", client: "198.51.100.1" } ), "sent" );
        assert.equal( await link.request( { email: "p2@example.com", client: "198.51.100.2" } ), "sent" );
        assert.equal( await link.request( { email: "p3@example.com", client: "198.51.100.3" } ), "limited" );
        assert.equal( sent.length, 2 );
        time.advance( 60 * 60 * 1000 );
        assert.equal( await link.request( { email: "p3@example.com", client: "198.51.100.3" } ), "sent" );
        assert.equal( EmailLink.DEFAULTS.hourlyLimitOverall, 100 );
    } );

    it( "gives the address its count back when the overall limit refuses it, since nothing was sent", async () => {
        const link = new EmailLink( { hourlyLimitOverall: 1, hourlyLimitPerAddress: 2 } ).registerNotice();
        assert.equal( await link.request( { email: "p1@example.com", client: "198.51.100.1" } ), "sent" );
        for ( let i = 0; i < 3; i++ ) {
            assert.equal( await link.request( { email: "p2@example.com", client: `198.51.100.${ 10 + i }` } ), "limited" );
        }
        const counted = Object.entries( cacheStub.values ).filter( ( [ key ] ) => key.startsWith( "ti:auth:email-link:limit:address:" ) ).map( ( [ , entry ] ) => entry.value.count );
        assert.deepEqual( counted.sort(), [ 0, 1 ], "p1's one link, and nothing for p2" );
    } );

    it( "counts concurrent requests one at a time, so a burst cannot pass the limit together", async () => {
        const link = new EmailLink( { hourlyLimitPerAddress: 2 } ).registerNotice();
        const outcomes = await Promise.all( [ 1, 2, 3, 4, 5 ].map( ( i ) => link.request( { email: "parent@example.com", client: `198.51.100.${ i }` } ) ) );
        assert.equal( outcomes.filter( ( outcome ) => outcome === "sent" ).length, 2 );
        assert.equal( sent.length, 2 );
    } );

    it( "answers unavailable when the e-mail certainly was not sent, and deletes its link", async () => {
        const link = new EmailLink().registerNotice();
        failNext = Object.assign( new Error( "daily limit" ), { code: "E_DAILY_LIMIT_EXCEEDED", transient: true } );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "unavailable" );
        assert.deepEqual( tokenKeys(), [], "a link nobody received can never work" );

        NotificationService.instance.setTransport( null );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "unavailable", "sending switched off since start" );
        assert.deepEqual( tokenKeys(), [] );
    } );

    it( "keeps the link and the counts when the send may have gone through, as a relay timeout may", async () => {
        const link = new EmailLink( { hourlyLimitPerAddress: 2 } ).registerNotice();
        for ( let i = 0; i < 2; i++ ) {
            failNext = Object.assign( new Error( "relay timeout" ), { code: "E_RELAY_UNAVAILABLE", transient: true } );
            assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "unavailable" );
        }
        assert.equal( tokenKeys().length, 2, "an e-mail that arrives anyway carries a link that works" );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "limited", "a slow relay is no way past the limit" );
    } );

    it( "gives back what it counted against the address and overall when nothing could be sent, so an outage uses up nobody's hour", async () => {
        const link = new EmailLink( { hourlyLimitPerAddress: 2, hourlyLimitOverall: 2 } ).registerNotice();
        for ( let i = 0; i < 4; i++ ) {
            failNext = Object.assign( new Error( "rate limit" ), { code: "E_RATE_LIMIT_EXCEEDED", transient: true } );
            assert.equal( await link.request( { email: "parent@example.com", client: `198.51.100.${ i }` } ), "unavailable" );
        }
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "sent", "the relay is back, and the hour is whole" );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.8" } ), "sent" );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.9" } ), "limited", "what was sent still counts" );
    } );

    it( "never gives back the client's count, which bounds how often one network may ask, whatever came of it", async () => {
        const link = new EmailLink( { hourlyLimitPerClient: 2 } ).registerNotice();
        for ( let i = 0; i < 2; i++ ) {
            failNext = Object.assign( new Error( "daily limit" ), { code: "E_DAILY_LIMIT_EXCEEDED", transient: true } );
            assert.equal( await link.request( { email: `p${ i }@example.com`, client: "203.0.113.7" } ), "unavailable" );
        }
        assert.equal( await link.request( { email: "p9@example.com", client: "203.0.113.7" } ), "limited" );
    } );

    it( "takes a transport's word that a message will never go as nothing sent: the link is deleted, the address's count given back", async () => {
        // The relay's own refusals (a missing mail binding, a message it will not take) and the provider's permanent ones.
        const link = new EmailLink( { hourlyLimitPerAddress: 2 } ).registerNotice();
        for ( const code of [ "E_MAIL_BINDING_MISSING", "E_MAIL_INVALID", "E_RECIPIENT_SUPPRESSED" ] ) {
            failNext = Object.assign( new Error( code ), { code: code, transient: false } );
            assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "unavailable", code );
        }
        assert.deepEqual( tokenKeys(), [] );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "sent", "the address's hour is whole" );
    } );

    it( "answers unavailable when the store fails, rather than rejecting", async ( t ) => {
        const link = new EmailLink().registerNotice();
        t.mock.method( cacheStub, "getValue", () => Promise.reject( new Error( "store down" ) ) );
        assert.equal( await link.request( { email: "parent@example.com", client: "203.0.113.7" } ), "unavailable" );
        assert.equal( sent.length, 0 );
    } );

    it( "writes neither the address nor the token to the log", async ( t ) => {
        const logged = [];
        t.mock.method( logger, "log", ( message, severity, data ) => logged.push( JSON.stringify( [ message, data ] ) ) );
        const link = new EmailLink( { allowedDomains: [ "example.com" ], hourlyLimitPerAddress: 1 } ).registerNotice();
        await link.request( { email: "parent@example.com", client: "203.0.113.7" } );
        await link.request( { email: "parent@example.com", client: "203.0.113.7" } );
        await link.request( { email: "parent@other.org", client: "203.0.113.7" } );
        failNext = Object.assign( new Error( "relay down" ), { code: "E_RELAY_UNAVAILABLE" } );
        await link.request( { email: "third@example.com", client: "203.0.113.7" } );
        const token = tokenOf( sent[ 0 ] );
        assert.ok( logged.length >= 4 );
        logged.forEach( ( line ) => {
            assert.ok( !line.includes( "parent@" ) && !line.includes( "third@" ) && !line.includes( "203.0.113.7" ), line );
            assert.ok( !line.includes( token ), line );
        } );
    } );

    it( "answers with the sign-in page, told how the request ended", () => {
        assert.equal( EmailLink.answerFor( "sent" ), "/?email-link=sent" );
        assert.equal( EmailLink.answerFor( "limited" ), "/?email-link=limited" );
        assert.equal( EmailLink.answerFor( EmailLink.OUTCOME.EXPIRED ), "/?email-link=expired" );
    } );

} );

describe( "EmailLink — spending a link", () => {

    const sendOne = async ( link, email = "parent@example.com" ) => {
        await link.request( { email: email, client: "203.0.113.7", language: "bg" } );
        return tokenOf( sent[ sent.length - 1 ] );
    };

    it( "gives the address and language once, and nothing the second time", async () => {
        const link = new EmailLink().registerNotice();
        const token = await sendOne( link );
        assert.deepEqual( await link.redeem( token ), { address: "parent@example.com", language: "bg" } );
        assert.equal( await link.redeem( token ), null );
        assert.deepEqual( tokenKeys(), [] );
    } );

    it( "lets exactly one of two requests racing with the same token through", async () => {
        const link = new EmailLink().registerNotice();
        const token = await sendOne( link );
        const results = await Promise.all( [ link.redeem( token ), link.redeem( token ), link.redeem( token ) ] );
        assert.equal( results.filter( ( result ) => result !== null ).length, 1 );
    } );

    it( "refuses a link past its lifetime, even while the store still holds it", async () => {
        const time = clock();
        const link = new EmailLink( { lifetimeMinutes: 10 }, { now: time.now } ).registerNotice();
        const token = await sendOne( link );
        time.advance( 10 * 60 * 1000 );
        assert.equal( await link.redeem( token ), null );
        assert.deepEqual( tokenKeys(), [], "spent all the same" );
    } );

    it( "refuses a link to a domain the list no longer admits, as an OpenID sign-in is checked when it completes", async () => {
        const token = await sendOne( new EmailLink( { allowedDomains: [ "example.com", "school.bg" ] } ).registerNotice() );
        // The operator narrows the list and restarts while the link is out.
        const narrowed = new EmailLink( { allowedDomains: [ "school.bg" ] } );
        assert.equal( await narrowed.peek( token ), null );
        assert.equal( await narrowed.redeem( token ), null );
        assert.deepEqual( tokenKeys(), [], "spent all the same, so widening the list again does not revive it" );
    } );

    it( "tells which address a link signs in without spending it, and nothing for one that cannot sign in", async () => {
        const time = clock();
        const link = new EmailLink( {}, { now: time.now } ).registerNotice();
        const token = await sendOne( link );
        assert.equal( await link.peek( token ), "parent@example.com" );
        assert.equal( await link.peek( token ), "parent@example.com", "looking twice spends nothing" );
        assert.equal( tokenKeys().length, 1 );
        assert.equal( await link.peek( "a".repeat( 43 ) ), null );
        assert.equal( await link.peek( [ token ] ), null );
        time.advance( 15 * 60 * 1000 );
        assert.equal( await link.peek( token ), null, "nor for an expired one" );
    } );

    it( "refuses a malformed token without reading the store", async ( t ) => {
        const link = new EmailLink();
        const reads = t.mock.method( cacheStub, "getValue" );
        for ( const token of [ undefined, "", "short", "a".repeat( 44 ), "a".repeat( 42 ) + "*", [ "a".repeat( 43 ) ], "ti:auth:*".padEnd( 43, "x" ) ] ) {
            assert.equal( await link.redeem( token ), null, JSON.stringify( token ) );
        }
        assert.equal( reads.mock.callCount(), 0 );
        assert.equal( await link.redeem( "a".repeat( 43 ) ), null, "a well-formed token nobody issued" );
    } );

} );

describe( "EmailLink — readiness", () => {

    it( "is ready with a transport, a public URL and the notice's texts", () => {
        assert.equal( new EmailLink().readiness(), null );
    } );

    it( "names what is missing: the transport, the public URL or a text", () => {
        NotificationService.instance.configure( { transport: "off", publicUrl: PUBLIC_URL } );
        assert.match( new EmailLink().readiness(), /transport/ );

        NotificationService.instance.configure( { transport: "log" } );
        NotificationService.instance.setTransport( capturing );
        assert.match( new EmailLink().readiness(), /public URL/ );

        NotificationService.instance.configure( { transport: "log", publicUrl: PUBLIC_URL } );
        assert.match( new EmailLink().readiness(), /'log', which delivers nothing/, "a log transport would answer every request 'sent' and deliver none" );

        ready();
        const saved = localization.getLabel;
        localization.getLabel = ( key, language, fallback ) => ( key === "interface.notice.sign-in-link.text" ) ? fallback : saved( key, language, fallback );
        try {
            assert.match( new EmailLink().readiness(), /interface\.notice\.sign-in-link\.text/ );
        } finally {
            localization.getLabel = saved;
        }
    } );

    it( "renders a preview without a token as a link to the sign-in page", () => {
        new EmailLink().registerNotice();
        const rendered = NotificationService.instance.render( "sign-in-link", { language: "en" }, {} );
        assert.ok( rendered.text.includes( `${ PUBLIC_URL }/` ) && !rendered.text.includes( "#email-link" ) );
        assert.ok( rendered.text.includes( "15 minutes" ) );
    } );

} );

describe( "NotificationService#sendNow", () => {

    it( "sends at once, past the outbox and the ledger, and never queues", async () => {
        new EmailLink().registerNotice();
        const result = await NotificationService.instance.sendNow( "sign-in-link", { id: "email-link-0123456789abcdef", email: "parent@example.com" }, { token: "t".repeat( 43 ), minutes: 15 } );
        assert.equal( result.messageId, "m-1" );
        assert.equal( sent.length, 1 );
        assert.deepEqual( Object.keys( cacheStub.values ).filter( ( key ) => key.startsWith( "ti:notify:" ) ), [] );
    } );

    it( "refuses a recipient ID that is an address, as every send does", async () => {
        new EmailLink().registerNotice();
        await assert.rejects( NotificationService.instance.sendNow( "sign-in-link", { id: "parent@example.com", email: "parent@example.com" } ), ( error ) => error.data.reason === "recipient-id-is-an-address" );
    } );

    it( "sends with the shipped texts when the edited ones cannot be read", async ( t ) => {
        new EmailLink().registerNotice();
        const configService = require( "../components/config-service.js" );
        t.mock.method( configService.instance, "getCurrent", () => Promise.reject( new Error( "store down" ) ) );
        await NotificationService.instance.sendNow( "sign-in-link", { id: "email-link-0123456789abcdef", email: "parent@example.com" }, { token: "t".repeat( 43 ), minutes: 15 } );
        assert.equal( sent[ 0 ].subject, lookup( "interface.notice.sign-in-link.subject", "en" ) );
    } );

    it( "reports the transport's own name, so a feature can tell the log transport from one that delivers", () => {
        assert.equal( NotificationService.instance.transportName, null, "the capturing transport names nothing" );
        NotificationService.instance.configure( { transport: "log", publicUrl: PUBLIC_URL } );
        assert.equal( NotificationService.instance.transportName, "log" );
        NotificationService.instance.configure( { transport: "off" } );
        assert.equal( NotificationService.instance.transportName, null );
    } );

    it( "reports the public URL it links from", () => {
        assert.equal( NotificationService.instance.publicUrl, PUBLIC_URL );
        NotificationService.instance.configure( { transport: "log", publicUrl: "https://app.example.com/" } );
        assert.equal( NotificationService.instance.publicUrl, PUBLIC_URL, "without a trailing slash" );
    } );

} );

describe( "AuthManager — the email-link method", () => {

    const manager = ( emailLink = {} ) => new AuthManager( { enabledMethods: [ "email-link" ], local: {}, oauth2: {}, emailLink: emailLink } );

    it( "is enabled when a link can be sent", async () => {
        const auth = manager();
        await auth.initialize();
        assert.deepEqual( auth.getEnabledMethods(), [ "email-link" ] );
    } );

    it( "is dropped, with a warning naming why, when no link could be sent", async ( t ) => {
        const logged = [];
        t.mock.method( logger, "log", ( message, severity ) => logged.push( { message: String( message ), severity: severity } ) );
        NotificationService.instance.configure( { transport: "off", publicUrl: PUBLIC_URL } );
        const auth = manager();
        await auth.initialize();
        assert.deepEqual( auth.getEnabledMethods(), [] );
        assert.ok( logged.some( ( entry ) => entry.severity === logger.logSeverity.WARNING && /e-mail.*transport/i.test( entry.message ) ) );
        await assert.rejects( auth.authenticate( "email-link", { email: "parent@example.com" } ), ( error ) => error.httpCode === 401 );
    } );

    it( "answers a request for a link with the sign-in page, told how it ended", async () => {
        const auth = manager( { allowedDomains: [ "@Example.com" ] } );
        await auth.initialize();
        assert.deepEqual( await auth.authenticate( "email-link", { email: "parent@example.com", client: "203.0.113.7" } ), { redirectTo: "/?email-link=sent", outcome: "sent" } );
        assert.equal( sent.length, 1, "a domain written with its @ still admits it" );
        assert.deepEqual( await auth.authenticate( "email-link", { email: "nope", client: "203.0.113.7" } ), { redirectTo: "/?email-link=invalid-address", outcome: "invalid-address" } );
    } );

    it( "tells the address a link would sign in without spending it, through a method of its own", async () => {
        const auth = manager();
        await auth.initialize();
        await auth.authenticate( "email-link", { email: "parent@example.com", client: "203.0.113.7" } );
        const token = tokenOf( sent[ 0 ] );
        assert.equal( await auth.peekEmailLink( token ), "parent@example.com" );
        assert.equal( await auth.peekEmailLink( "nope" ), null );
        assert.deepEqual( await auth.authenticate( "email-link", { email: "other@example.com", client: "203.0.113.7", token: token } ), { redirectTo: "/?email-link=sent", outcome: "sent" }, "authenticate only ever asks for a link" );
        assert.equal( ( await auth.authorize( "email-link", null, { token: token } ) ).asJSON().email, "parent@example.com", "still spendable" );
    } );

    it( "refuses to tell anything while the method is not enabled", async () => {
        const auth = new AuthManager( { enabledMethods: [], local: {}, oauth2: {} } );
        await auth.initialize();
        await assert.rejects( auth.peekEmailLink( "a".repeat( 43 ) ), ( error ) => error.code === 2004 && error.httpCode === 401 );
    } );

    it( "turns a spent link into a user named by a digest of the address, and refuses it the second time", async () => {
        const auth = manager();
        await auth.initialize();
        await auth.authenticate( "email-link", { email: "Parent@Example.com", client: "203.0.113.7", language: "bg" } );
        const token = tokenOf( sent[ 0 ] );

        const user = ( await auth.authorize( "email-link", new URL( "https://app.example.com/login/email-link" ), { token: token } ) ).asJSON();
        assert.equal( user.userID, EmailLink.userIDOf( "parent@example.com" ) );
        assert.equal( user.username, "parent@example.com" );
        assert.equal( user.name, "parent@example.com", "the only name the method knows, so the sidebar is not blank" );
        assert.equal( user.email, "parent@example.com" );
        assert.equal( user.language, "bg" );

        await assert.rejects( auth.authorize( "email-link", null, { token: token } ), ( error ) => error.code === 2000 && error.httpCode === 401 );
        await assert.rejects( auth.authorize( "email-link", null, {} ), ( error ) => error.code === 2000 );
    } );

} );
