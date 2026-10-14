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

/*
 * Notices, the rules that raise them, and the outbox that sends each once (CA-486).
 *
 * Every test runs a fresh `NotificationService` against the in-memory store, which deletes values and never JSON
 * documents, as D1 does, and expires values on its own clock. The transport is a fake that records what it was given
 * and answers as each test says. Labels come from a stub of core's catalogue, so a test reads the texts it renders.
 */

const { describe, it, before, beforeEach, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const localization = require( "@ti-engine/core/localization" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

const cacheStub = installInMemoryCache();

const NotificationService = require( "#notification-service" );
const ConfigRegistry = require( "#config-registry" );
const configService = require( "#config-service" );
const transports = require( "#notification-transports" );

const LABELS = {
    "notice.task-new.subject": { en: "New task: {task} by {date}", bg: "Нова задача: {task} до {date}" },
    "notice.task-new.text": { en: "You have a new task: {task}.\n\nIt is due on {date}.", bg: "Имате нова задача: {task}.\n\nСрокът е {date}." },
    "notice.only-bg.subject": { bg: "Само на български" },
    "notice.only-bg.text": { bg: "Текст" },
    "notice.task-name.self-evaluation": { en: "self-evaluation", bg: "самооценка" }
};

const originalGetLabel = localization.getLabel;
const originalSystemLanguage = localization.getSystemLanguage;
const originalLog = logger.log;
const logLines = [];

before( () => {
    localization.getLabel = ( key, language, fallback ) => {
        const entry = LABELS[ key ];
        return ( entry && entry[ language ] !== undefined ) ? entry[ language ] : fallback;
    };
    localization.getSystemLanguage = () => "bg";
    logger.log = ( message ) => {
        logLines.push( String( message ) );
    };
} );

after( () => {
    localization.getLabel = originalGetLabel;
    localization.getSystemLanguage = originalSystemLanguage;
    logger.log = originalLog;
} );

const ANNA = Object.freeze( { id: "1001", email: "anna.ivanova@example.com", name: "Anna Ivanova" } );
const BORIS = Object.freeze( { id: "1002", email: "boris.petrov@example.com", language: "en" } );

// A transport that records each message and answers with the next scripted outcome: a string is an error code, an
// object an error to throw as it is, and nothing a success.
function fakeTransport( script = [] ) {
    const sent = [];
    const outcomes = script.slice();
    return {
        name: "fake",
        sent: sent,
        send: ( message ) => {
            sent.push( message );
            const outcome = outcomes.shift();
            if ( typeof outcome === "string" ) {
                return Promise.reject( transports.transportError( outcome ) );
            }
            if ( outcome && typeof outcome === "object" ) {
                return Promise.reject( outcome );
            }
            return Promise.resolve( { messageId: "m-" + sent.length } );
        }
    };
}

// A service on a clock the test moves, with the two notices and the event the tests use, sending through `transport`.
function serviceWith( transport, clock = { now: Date.UTC( 2026, 9, 14, 9, 0 ) } ) {
    const service = new NotificationService( { now: () => clock.now, drainOnNotify: false } );
    service.configure( { transport: "log", sender: "no-reply@example.com", senderName: "Example", publicUrl: "https://app.example.com/" } );
    service.setTransport( transport );
    service.registerNotice( "task-new", {
        subject: "notice.task-new.subject",
        text: "notice.task-new.text",
        link: ( data ) => "/app/tasks/" + data.evaluationID,
        format: ( data, language ) => ( { task: localization.getLabel( "notice.task-name." + data.task, language ), date: data.date } )
    } );
    service.registerNotice( "only-bg", { subject: "notice.only-bg.subject", text: "notice.only-bg.text" } );
    service.registerEvent( "task.created", { attributes: [ "task" ] } );
    service.clock = clock;
    return service;
}

const TASK = Object.freeze( { task: "self-evaluation", evaluationID: "E-7", date: "28.10.2026" } );

const pendingKeys = () => Object.keys( cacheStub.values ).filter( ( key ) => key.startsWith( "ti:notify:pending:" ) );
const doneEntries = () => Object.keys( cacheStub.values ).filter( ( key ) => key.startsWith( "ti:notify:done:" ) ).map( ( key ) => cacheStub.values[ key ] );

const seedRules = ( document ) => configService.instance.seedDefault( NotificationService.CONFIG_KEY, document );

beforeEach( () => {
    cacheStub.storage = {};
    cacheStub.values = {};
    cacheStub.now = () => Date.now();
} );

describe( "notify", () => {

    it( "queues a notice once, however many times it is asked to, and sends it once", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );

        assert.equal( await service.notify( { kind: "task-new", key: "k1", recipient: ANNA, data: TASK } ), true );
        assert.equal( await service.notify( { kind: "task-new", key: "k1", recipient: ANNA, data: TASK } ), false, "queued twice" );
        assert.equal( pendingKeys().length, 1 );

        const report = await service.drain();
        assert.deepEqual( report, { sent: 1, failed: 0, retrying: 0, stopped: null } );
        assert.equal( pendingKeys().length, 0 );
        assert.equal( await service.notify( { kind: "task-new", key: "k1", recipient: ANNA, data: TASK } ), false, "queued again after it was sent" );
        await service.drain();
        assert.equal( transport.sent.length, 1 );
    } );

    it( "queues one of two calls made at the same moment for one key", async () => {
        const service = serviceWith( fakeTransport() );
        // Both started before either is awaited: against the in-memory store, every step is a microtask, so without
        // the lock both read "absent" and both write.
        const outcomes = await Promise.all( [
            service.notify( { kind: "task-new", key: "same", recipient: ANNA, data: TASK } ),
            service.notify( { kind: "task-new", key: "same", recipient: ANNA, data: TASK } )
        ] );
        assert.deepEqual( outcomes.sort(), [ false, true ] );
        assert.equal( pendingKeys().length, 1 );
    } );

    it( "keeps one key apart for two people", async () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( await service.notify( { kind: "task-new", key: "shared", recipient: ANNA, data: TASK } ), true );
        assert.equal( await service.notify( { kind: "task-new", key: "shared", recipient: BORIS, data: TASK } ), true );
        assert.equal( pendingKeys().length, 2 );
    } );

    it( "queues nothing while sending is off, so switching it on releases no stale backlog", async () => {
        const service = new NotificationService( { drainOnNotify: false } );
        service.configure( { transport: "off" } );
        service.registerNotice( "task-new", { subject: "notice.task-new.subject", text: "notice.task-new.text" } );
        assert.equal( service.isEnabled, false );
        assert.equal( await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } ), false );
        assert.equal( Object.keys( cacheStub.values ).length, 0 );
    } );

    it( "refuses a malformed call, and an ID that is an address", async () => {
        const service = serviceWith( fakeTransport() );
        for ( const notice of [
            { kind: "unknown", key: "k", recipient: ANNA },
            { kind: "task-new", key: "", recipient: ANNA },
            { kind: "task-new", key: "k", recipient: { email: ANNA.email } },
            { kind: "task-new", key: "k", recipient: { id: ANNA.email, email: ANNA.email } },
            { kind: "task-new", key: "k", recipient: { id: "1", email: "not an address" } },
            { kind: "task-new", key: "k", recipient: { id: "1", email: "a@b.example\r\nBcc: c@d.example" } }
        ] ) {
            await assert.rejects( service.notify( notice ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
        }
        assert.equal( Object.keys( cacheStub.values ).length, 0 );
    } );

    it( "starts a pass on its own after queuing, unless told not to", async () => {
        const transport = fakeTransport();
        const service = new NotificationService();
        service.configure( { transport: "log", sender: "no-reply@example.com" } );
        service.setTransport( transport );
        service.registerNotice( "only-bg", { subject: "notice.only-bg.subject", text: "notice.only-bg.text" } );
        await service.notify( { kind: "only-bg", key: "k", recipient: ANNA } );
        assert.equal( transport.sent.length, 0, "sent before notify resolved" );
        await new Promise( ( resolve ) => setImmediate( resolve ) );
        await service.drain();
        assert.equal( transport.sent.length, 1 );
    } );

} );

describe( "the dispatcher", () => {

    it( "records a sent notice in the ledger, with no address and no text, kept for the retention period", async () => {
        const service = serviceWith( fakeTransport() );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        await service.drain();

        const [ entry ] = doneEntries();
        assert.equal( entry.expiration, 180 * 86400 );
        assert.deepEqual( Object.keys( entry.value ).sort(), [ "at", "kind", "messageId", "outcome", "recipientID" ] );
        assert.equal( entry.value.outcome, "sent" );
        assert.equal( entry.value.recipientID, "1001" );
        assert.equal( JSON.stringify( entry.value ).includes( "@" ), false );
    } );

    it( "retries a transient failure with backoff, then gives it up after the last attempt", async () => {
        const failures = [ "E_DELIVERY_FAILED", "E_INTERNAL_SERVER_ERROR", "E_DELIVERY_FAILED", "E_DELIVERY_FAILED", "E_DELIVERY_FAILED" ];
        const transport = fakeTransport( failures );
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );

        assert.deepEqual( await service.drain(), { sent: 0, failed: 0, retrying: 1, stopped: null } );
        // Not yet due: the same pass again sends nothing.
        await service.drain();
        assert.equal( transport.sent.length, 1 );

        const waits = [ 60, 300, 900, 3600 ];
        for ( let attempt = 1; attempt < 5; attempt++ ) {
            service.clock.now += waits[ attempt - 1 ] * 1000;
            await service.drain();
            assert.equal( transport.sent.length, attempt + 1 );
        }
        assert.equal( pendingKeys().length, 0 );
        const [ entry ] = doneEntries();
        assert.equal( entry.value.outcome, "failed" );
        assert.equal( entry.value.code, "E_DELIVERY_FAILED" );
        assert.equal( entry.value.attempts, 5 );
    } );

    it( "reads a notice waiting for its retry once, and not again on every pass until it is due", async () => {
        // CodeRabbit on #198: every pass read every waiting notice, and a pass starts with each notice queued.
        const transport = fakeTransport( Array( 20 ).fill( "E_DELIVERY_FAILED" ) );
        const service = serviceWith( transport );
        for ( let index = 0; index < 20; index++ ) {
            await service.notify( { kind: "task-new", key: "k" + index, recipient: ANNA, data: TASK } );
        }
        const reads = [];
        const getValue = cacheStub.getValue;
        cacheStub.getValue = function ( key ) {
            if ( key.startsWith( "ti:notify:pending:" ) ) {
                reads.push( key );
            }
            return getValue.call( this, key );
        };
        try {
            assert.equal( ( await service.drain() ).retrying, 20 );
            assert.equal( reads.length, 20, "each read once, to try it" );
            reads.length = 0;
            for ( let pass = 0; pass < 5; pass++ ) {
                assert.deepEqual( await service.drain(), { sent: 0, failed: 0, retrying: 20, stopped: null } );
            }
            assert.equal( reads.length, 0, "a notice not yet due was read again" );

            service.clock.now += 60 * 1000;
            assert.equal( ( await service.drain() ).sent, 20 );
            assert.equal( reads.length, 20 );
        } finally {
            cacheStub.getValue = getValue;
        }
    } );

    it( "learns a waiting notice's retry time again after a restart, from one read of it", async () => {
        const clock = { now: Date.UTC( 2026, 9, 14, 9, 0 ) };
        const before = serviceWith( fakeTransport( [ "E_DELIVERY_FAILED" ] ), clock );
        await before.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        await before.drain();

        // A new process over the same store: it has no hints, and the store's entry says when the notice is due.
        const transport = fakeTransport();
        const after = serviceWith( transport, clock );
        let reads = 0;
        const getValue = cacheStub.getValue;
        cacheStub.getValue = function ( key ) {
            reads += key.startsWith( "ti:notify:pending:" ) ? 1 : 0;
            return getValue.call( this, key );
        };
        try {
            assert.equal( ( await after.drain() ).retrying, 1 );
            assert.equal( ( await after.drain() ).retrying, 1 );
            assert.equal( reads, 1 );
            assert.equal( transport.sent.length, 0, "sent before it was due" );
            clock.now += 60 * 1000;
            assert.equal( ( await after.drain() ).sent, 1 );
        } finally {
            cacheStub.getValue = getValue;
        }
    } );

    it( "records a permanent failure at once and does not retry it", async () => {
        const transport = fakeTransport( [ "E_RECIPIENT_SUPPRESSED" ] );
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        assert.deepEqual( await service.drain(), { sent: 0, failed: 1, retrying: 0, stopped: null } );
        service.clock.now += 86400 * 1000;
        await service.drain();
        assert.equal( transport.sent.length, 1 );
        assert.equal( doneEntries()[ 0 ].value.code, "E_RECIPIENT_SUPPRESSED" );
    } );

    it( "takes a transport's own transient flag over the code", async () => {
        const error = Object.assign( new Error( "smtp 421" ), { code: "SMTP_421", transient: true } );
        const transport = fakeTransport( [ error ] );
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        assert.equal( ( await service.drain() ).retrying, 1 );
    } );

    it( "stops at the daily limit without spending an attempt, and resumes the next UTC day", async () => {
        const transport = fakeTransport( [ "E_DAILY_LIMIT_EXCEEDED" ] );
        const service = serviceWith( transport );
        for ( const key of [ "a", "b", "c" ] ) {
            await service.notify( { kind: "task-new", key: key, recipient: ANNA, data: TASK } );
        }

        const report = await service.drain();
        assert.equal( report.stopped, "E_DAILY_LIMIT_EXCEEDED" );
        assert.equal( transport.sent.length, 1, "kept sending after the daily limit" );
        assert.equal( pendingKeys().length, 3 );
        pendingKeys().forEach( ( key ) => assert.equal( cacheStub.values[ key ].value.attempts, 0 ) );

        // Still the same day: nothing is tried.
        service.clock.now = Date.UTC( 2026, 9, 14, 23, 59 );
        assert.equal( ( await service.drain() ).stopped, "E_DAILY_LIMIT_EXCEEDED" );
        assert.equal( transport.sent.length, 1 );

        service.clock.now = Date.UTC( 2026, 9, 15, 0, 1 );
        assert.deepEqual( await service.drain(), { sent: 3, failed: 0, retrying: 0, stopped: null } );
    } );

    it( "pauses for a minute at a rate limit, without spending an attempt", async () => {
        const transport = fakeTransport( [ "E_RATE_LIMIT_EXCEEDED" ] );
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        assert.equal( ( await service.drain() ).stopped, "E_RATE_LIMIT_EXCEEDED" );
        service.clock.now += 30 * 1000;
        assert.equal( ( await service.drain() ).stopped, "E_RATE_LIMIT_EXCEEDED" );
        service.clock.now += 31 * 1000;
        assert.equal( ( await service.drain() ).sent, 1 );
        assert.equal( transport.sent.length, 2 );
    } );

    it( "removes without sending a queued notice whose ledger entry already exists", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        // A crash after the ledger entry was written and before the pending entry was removed.
        const [ pending ] = pendingKeys();
        const suffix = pending.slice( "ti:notify:pending:".length );
        await cacheStub.setValue( "ti:notify:done:" + suffix, { kind: "task-new", recipientID: "1001", outcome: "sent" } );

        await service.drain();
        assert.equal( transport.sent.length, 0 );
        assert.equal( pendingKeys().length, 0 );
    } );

    it( "keeps a notice queued when the store fails around it, and sends it on the next pass", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        const setValue = cacheStub.setValue;
        cacheStub.setValue = () => Promise.reject( new Error( "store down" ) );
        try {
            assert.equal( ( await service.drain() ).sent, 0 );
        } finally {
            cacheStub.setValue = setValue;
        }
        assert.equal( pendingKeys().length, 1 );
        // At least once: the provider took it, the ledger did not, so it goes again.
        assert.equal( ( await service.drain() ).sent, 1 );
        assert.equal( transport.sent.length, 2 );
    } );

    it( "gives up a notice whose texts are missing rather than sending the catalogue's placeholder", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        service.registerNotice( "no-texts", { subject: "notice.absent.subject", text: "notice.absent.text" } );
        await service.notify( { kind: "no-texts", key: "k", recipient: ANNA } );
        assert.equal( ( await service.drain() ).failed, 1 );
        assert.equal( transport.sent.length, 0 );
        assert.equal( doneEntries()[ 0 ].value.code, "E_NOTICE_LABEL_MISSING" );
    } );

    it( "runs one pass at a time, and a call during a pass is answered by a pass that started after it", async () => {
        let release;
        const gate = new Promise( ( resolve ) => {
            release = resolve;
        } );
        const sent = [];
        const service = serviceWith( { name: "slow", send: ( message ) => gate.then( () => {
            sent.push( message );
            return { messageId: "x" };
        } ) } );
        await service.notify( { kind: "task-new", key: "first", recipient: ANNA, data: TASK } );
        const firstPass = service.drain();
        await new Promise( ( resolve ) => setImmediate( resolve ) );
        await service.notify( { kind: "task-new", key: "second", recipient: ANNA, data: TASK } );
        const secondCall = service.drain();
        release();
        const report = await secondCall;
        assert.equal( await firstPass, report );
        assert.equal( sent.length, 2 );
        assert.equal( report.sent, 2 );
    } );

} );

describe( "render", () => {

    it( "renders in the recipient's language, else the deployment's, with the link after the text", () => {
        const service = serviceWith( fakeTransport() );
        const bg = service.render( "task-new", ANNA, TASK );
        assert.equal( bg.subject, "Нова задача: самооценка до 28.10.2026" );
        assert.equal( bg.text, "Имате нова задача: самооценка.\n\nСрокът е 28.10.2026.\n\nhttps://app.example.com/app/tasks/E-7" );
        assert.match( bg.html, /^<!doctype html>\n<html lang="bg">/ );
        assert.match( bg.html, /<p><a href="https:\/\/app\.example\.com\/app\/tasks\/E-7">/ );

        const en = service.render( "task-new", BORIS, TASK );
        assert.equal( en.subject, "New task: self-evaluation by 28.10.2026" );
    } );

    it( "falls back to the deployment's language for a text missing in the recipient's", () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( service.render( "only-bg", BORIS ).subject, "Само на български" );
    } );

    it( "escapes the HTML and keeps a line break out of the subject", () => {
        const service = serviceWith( fakeTransport() );
        const rendered = service.render( "task-new", BORIS, { task: "self-evaluation", evaluationID: "E-7", date: "<b>soon</b>\r\nBcc: x" } );
        assert.equal( rendered.subject.includes( "\n" ), false );
        assert.equal( rendered.subject.includes( "\r" ), false );
        assert.equal( rendered.html.includes( "<b>" ), false );
        assert.match( rendered.html, /&lt;b&gt;soon&lt;\/b&gt;/ );
    } );

    it( "leaves a placeholder with no value as written", () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( service.render( "task-new", BORIS, { task: "self-evaluation", evaluationID: "E-7" } ).subject, "New task: self-evaluation by {date}" );
    } );

    it( "links only to a path under the public URL", () => {
        const service = serviceWith( fakeTransport() );
        service.registerNotice( "elsewhere", { subject: "notice.only-bg.subject", text: "notice.only-bg.text", link: () => "https://evil.example/" } );
        service.registerNotice( "protocol-relative", { subject: "notice.only-bg.subject", text: "notice.only-bg.text", link: () => "//evil.example/" } );
        assert.equal( service.render( "elsewhere", ANNA ).text, "Текст" );
        assert.equal( service.render( "protocol-relative", ANNA ).text, "Текст" );

        const unlinked = new NotificationService( { drainOnNotify: false } );
        unlinked.configure( { transport: "log" } );
        unlinked.registerNotice( "task-new", { subject: "notice.only-bg.subject", text: "notice.only-bg.text", link: () => "/app" } );
        assert.equal( unlinked.render( "task-new", ANNA ).text, "Текст", "a link without a public URL" );
    } );

    it( "sends from the configured sender, to the named recipient", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        await service.drain();
        const [ message ] = transport.sent;
        assert.deepEqual( message.from, { email: "no-reply@example.com", name: "Example" } );
        assert.deepEqual( message.to, { email: ANNA.email, name: ANNA.name } );
        assert.equal( message.replyTo, undefined );
    } );

} );

describe( "events and rules", () => {

    const RULES = Object.freeze( {
        enabled: true,
        rules: [
            { id: "new-self", event: "task.created", notice: "task-new", when: { task: [ "self-evaluation" ] } },
            { id: "new-self-again", event: "task.created", notice: "task-new", when: { task: [ "self-evaluation", "peer-feedback" ] } },
            { id: "disabled", event: "task.created", notice: "only-bg", enabled: false }
        ]
    } );

    it( "queues the notice of every enabled rule whose filter passes, once per notice", async () => {
        const service = serviceWith( fakeTransport() );
        await seedRules( RULES );
        assert.equal( await service.emit( "task.created", { key: "self-evaluation:E-7:1001", recipient: ANNA, data: TASK } ), 1 );
        assert.equal( pendingKeys().length, 1 );
        assert.equal( await service.emit( "task.created", { key: "self-evaluation:E-7:1001", recipient: ANNA, data: TASK } ), 0 );
    } );

    it( "queues nothing for data no filter passes", async () => {
        const service = serviceWith( fakeTransport() );
        await seedRules( RULES );
        assert.equal( await service.emit( "task.created", { key: "k", recipient: ANNA, data: { task: "manager-review" } } ), 0 );
        assert.equal( await service.emit( "task.created", { key: "k", recipient: ANNA, data: {} } ), 0 );
    } );

    it( "queues nothing when the document is switched off, or was never written", async () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( await service.emit( "task.created", { key: "k", recipient: ANNA, data: TASK } ), 0 );
        await seedRules( Object.assign( {}, RULES, { enabled: false } ) );
        assert.equal( await service.emit( "task.created", { key: "k", recipient: ANNA, data: TASK } ), 0 );
    } );

    it( "passes everything through an empty filter, and nothing through an attribute with no values", () => {
        assert.equal( NotificationService.passes( undefined, { task: "x" } ), true );
        assert.equal( NotificationService.passes( {}, {} ), true );
        assert.equal( NotificationService.passes( { task: [] }, { task: "x" } ), false );
        assert.equal( NotificationService.passes( { task: [ "x" ] }, { task: "x" } ), true );
    } );

    it( "skips a stored rule whose notice is no longer registered", async () => {
        const service = serviceWith( fakeTransport() );
        await seedRules( { enabled: true, rules: [ { id: "gone", event: "task.created", notice: "removed-notice" } ] } );
        assert.equal( await service.emit( "task.created", { key: "k", recipient: ANNA, data: TASK } ), 0 );
    } );

    it( "refuses an event that is not registered", async () => {
        const service = serviceWith( fakeTransport() );
        await assert.rejects( service.emit( "task.vanished", { key: "k", recipient: ANNA } ) );
    } );

    it( "has a document whose validator refuses unknown events, notices and attributes, and a repeated ID", async () => {
        const service = serviceWith( fakeTransport() );
        const registry = new ConfigRegistry();
        registry.register( "notifications", service.configDocument( RULES ) );

        assert.deepEqual( await registry.validate( "notifications", RULES ), { valid: true, errors: [] } );
        const { valid, errors } = await registry.validate( "notifications", {
            enabled: true,
            rules: [
                { id: "a", event: "task.unknown", notice: "task-new" },
                { id: "a", event: "task.created", notice: "unknown-notice", when: { owner: [ "x" ] } }
            ]
        } );
        assert.equal( valid, false );
        assert.deepEqual( errors.map( ( issue ) => issue.code ).sort(), [ "notifications.duplicate-rule", "notifications.unknown-attribute", "notifications.unknown-event", "notifications.unknown-notice" ] );
        assert.equal( ( await registry.validate( "notifications", { enabled: "yes", rules: [] } ) ).valid, false );
    } );

    it( "gives the application's defaults and metadata to the document it builds", () => {
        const service = serviceWith( fakeTransport() );
        const definition = service.configDocument( RULES, { path: "bin/config/notifications.json" } );
        assert.deepEqual( definition.defaultValue, RULES );
        assert.notEqual( definition.defaultValue.rules, RULES.rules, "the default shares the caller's array" );
        assert.equal( definition.metadata.path, "bin/config/notifications.json" );
        assert.deepEqual( service.configDocument().defaultValue, { enabled: true, rules: [] } );
    } );

} );

describe( "forget", () => {

    it( "removes one person's queued notices and ledger entries, and nobody else's", async () => {
        const service = serviceWith( fakeTransport() );
        await service.notify( { kind: "task-new", key: "sent", recipient: ANNA, data: TASK } );
        await service.drain();
        await service.notify( { kind: "task-new", key: "queued", recipient: ANNA, data: TASK } );
        await service.notify( { kind: "task-new", key: "queued", recipient: BORIS, data: TASK } );

        assert.equal( await service.forget( "1001" ), 2 );
        assert.equal( pendingKeys().length, 1 );
        assert.equal( doneEntries().length, 0 );
        assert.equal( cacheStub.values[ pendingKeys()[ 0 ] ].value.recipient.id, "1002" );
    } );

} );

describe( "a store that throws instead of rejecting", () => {

    it( "rejects from drain, forget and emit, and never throws out of a background pass", async () => {
        const service = new NotificationService();
        service.configure( { transport: "log", sender: "no-reply@example.com" } );
        service.setTransport( fakeTransport() );
        service.registerNotice( "only-bg", { subject: "notice.only-bg.subject", text: "notice.only-bg.text" } );
        service.registerEvent( "task.created", { attributes: [ "task" ] } );
        await service.notify( { kind: "only-bg", key: "k", recipient: ANNA } );

        const matchKeys = cacheStub.matchKeys;
        const getJSON = cacheStub.getJSON;
        cacheStub.matchKeys = () => {
            throw new TypeError( "matchKeys is not available" );
        };
        cacheStub.getJSON = () => {
            throw new TypeError( "getJSON is not available" );
        };
        try {
            await assert.rejects( service.drain(), TypeError );
            await assert.rejects( service.forget( "1001" ), TypeError );
            await assert.rejects( service.emit( "task.created", { key: "k", recipient: ANNA, data: TASK } ), TypeError );
            // The pass the notify above started from setImmediate: had it thrown, the process would have exited.
            await new Promise( ( resolve ) => setImmediate( resolve ) );
        } finally {
            cacheStub.matchKeys = matchKeys;
            cacheStub.getJSON = getJSON;
        }
    } );

} );

describe( "configure", () => {

    it( "switches the cloudflare transport off when it has no sender or no relay", () => {
        const service = new NotificationService();
        service.configure( { transport: "cloudflare", relayUrl: "http://11.0.0.1/v1/mail/send" } );
        assert.equal( service.isEnabled, false );
        service.configure( { transport: "cloudflare", sender: "no-reply@example.com" } );
        assert.equal( service.isEnabled, false );
        service.configure( { transport: "cloudflare", sender: "no-reply@example.com", relayUrl: "http://11.0.0.1/v1/mail/send" } );
        assert.equal( service.isEnabled, true );
        service.configure( { transport: "carrier-pigeon" } );
        assert.equal( service.isEnabled, false );
    } );

} );

describe( "the logs", () => {

    it( "never carried an address in any test above", () => {
        assert.ok( logLines.length > 0 );
        assert.deepEqual( logLines.filter( ( line ) => line.includes( "@" ) ), [] );
    } );

} );
