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
const tools = require( "@ti-engine/core/tools" );
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
    "notice.task-name.review": { en: "review", bg: "преглед" },
    "notice.layout.action": { en: "Open the app", bg: "Отворете приложението" },
    "notice.layout.footer": { en: "Sent automatically; replies are not read.", bg: "Изпратено автоматично." }
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
    // The details too, as the logger writes them: an error by its every property. A line whose message is clean can
    // still carry an address in what is logged with it.
    logger.log = ( message, severity, details ) => {
        const written = ( details instanceof Error ) ? tools.errorToJSON( details ) : details;
        logLines.push( String( message ) + ( ( written === undefined ) ? "" : " " + JSON.stringify( written ) ) );
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
        link: ( data ) => "/app/tasks/" + data.itemID,
        format: ( data, language ) => ( { task: localization.getLabel( "notice.task-name." + data.task, language ), date: data.date } )
    } );
    service.registerNotice( "only-bg", { subject: "notice.only-bg.subject", text: "notice.only-bg.text" } );
    service.registerEvent( "task.created", { attributes: [ "task" ] } );
    service.clock = clock;
    return service;
}

const TASK = Object.freeze( { task: "review", itemID: "I-7", date: "28.10.2026" } );

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
        assert.equal( bg.subject, "Нова задача: преглед до 28.10.2026" );
        assert.equal( bg.text, "Имате нова задача: преглед.\n\nСрокът е 28.10.2026.\n\nhttps://app.example.com/app/tasks/I-7" );
        assert.match( bg.html, /^<!doctype html>\n<html lang="bg">/ );
        assert.match( bg.html, /<a href="https:\/\/app\.example\.com\/app\/tasks\/I-7" style="[^"]*">https:\/\/app\.example\.com\/app\/tasks\/I-7<\/a>/ );

        const en = service.render( "task-new", BORIS, TASK );
        assert.equal( en.subject, "New task: review by 28.10.2026" );
    } );

    it( "falls back to the deployment's language for a text missing in the recipient's", () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( service.render( "only-bg", BORIS ).subject, "Само на български" );
    } );

    it( "escapes the HTML and keeps a line break out of the subject", () => {
        const service = serviceWith( fakeTransport() );
        const rendered = service.render( "task-new", BORIS, { task: "review", itemID: "I-7", date: "<b>soon</b>\r\nBcc: x" } );
        assert.equal( rendered.subject.includes( "\n" ), false );
        assert.equal( rendered.subject.includes( "\r" ), false );
        assert.equal( rendered.html.includes( "<b>" ), false );
        assert.match( rendered.html, /&lt;b&gt;soon&lt;\/b&gt;/ );
    } );

    it( "leaves a placeholder with no value as written", () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( service.render( "task-new", BORIS, { task: "review", itemID: "I-7" } ).subject, "New task: review by {date}" );
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

describe( "attachments", () => {

    // A calendar entry as an application would build one: in the reader's language, from the notice's data alone.
    const CALENDAR = Object.freeze( { filename: "interview.ics", type: "text/calendar; charset=utf-8; method=PUBLISH" } );
    const calendarOf = ( data, language, label ) => [ {
        filename: CALENDAR.filename,
        type: CALENDAR.type,
        content: "BEGIN:VCALENDAR\r\nSUMMARY:" + label( "notice.task-name." + data.task ) + " " + data.itemID + "\r\nLANGUAGE:" + language + "\r\nEND:VCALENDAR\r\n"
    } ];
    const decoded = ( attachment ) => Buffer.from( attachment.content, "base64" ).toString( "utf8" );

    function serviceWithCalendar( transport, attachments = calendarOf ) {
        const service = serviceWith( transport );
        service.registerNotice( "with-file", { subject: "notice.task-new.subject", text: "notice.task-new.text", format: ( data ) => data, attachments: attachments } );
        return service;
    }

    it( "renders the files a notice attaches, in the reader's language, as base64 of their UTF-8 bytes", () => {
        const service = serviceWithCalendar( fakeTransport() );
        const bg = service.render( "with-file", ANNA, TASK );
        assert.deepEqual( bg.attachments.map( ( file ) => [ file.filename, file.type, file.disposition ] ), [ [ CALENDAR.filename, CALENDAR.type, "attachment" ] ] );
        assert.equal( decoded( bg.attachments[ 0 ] ), "BEGIN:VCALENDAR\r\nSUMMARY:преглед I-7\r\nLANGUAGE:bg\r\nEND:VCALENDAR\r\n" );
        assert.match( bg.attachments[ 0 ].content, /^[A-Za-z0-9+/]+={0,2}$/ );
        assert.match( decoded( service.render( "with-file", BORIS, TASK ).attachments[ 0 ] ), /SUMMARY:review I-7\r\nLANGUAGE:en/ );
    } );

    it( "sends them with the message, and a retry sends the same file", async () => {
        const transport = fakeTransport( [ "E_DELIVERY_FAILED" ] );
        const service = serviceWithCalendar( transport );
        await service.notify( { kind: "with-file", key: "k", recipient: ANNA, data: TASK } );
        assert.equal( ( await service.drain() ).retrying, 1 );
        service.clock.now += 61 * 1000;
        assert.equal( ( await service.drain() ).sent, 1 );
        assert.equal( transport.sent.length, 2 );
        assert.deepEqual( transport.sent[ 1 ].attachments, transport.sent[ 0 ].attachments );
        assert.equal( decoded( transport.sent[ 0 ].attachments[ 0 ] ), decoded( service.render( "with-file", ANNA, TASK ).attachments[ 0 ] ) );
    } );

    it( "leaves a message without files as it was: no attachments key at all", async () => {
        const transport = fakeTransport();
        const service = serviceWithCalendar( transport, () => [] );
        assert.equal( "attachments" in service.render( "with-file", ANNA, TASK ), false );
        assert.equal( "attachments" in service.render( "task-new", ANNA, TASK ), false );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        await service.drain();
        assert.equal( "attachments" in transport.sent[ 0 ], false );
    } );

    it( "carries them in a test send too", async () => {
        const transport = fakeTransport();
        const service = serviceWithCalendar( transport );
        await service.sendTest( "with-file", ANNA, TASK );
        assert.equal( transport.sent[ 0 ].attachments[ 0 ].filename, CALENDAR.filename );
    } );

    it( "refuses a malformed file, and gives the notice up rather than retrying it into the same answer", async () => {
        const file = ( change ) => () => [ Object.assign( { filename: "interview.ics", type: "text/calendar", content: "x" }, change ) ];
        const malformed = [
            file( { filename: "../interview.ics" } ),
            file( { filename: "interview\r\n.ics" } ),
            file( { filename: "интервю.ics" } ),
            file( { filename: "" } ),
            file( { type: "text/calendar; method=\"PUBLISH\"" } ),
            file( { type: "text/calendar\r\nBcc: someone@example.com" } ),
            file( { type: "text/calendar\r\n; method=PUBLISH" } ),
            file( { type: "text/calendar;\n method=PUBLISH" } ),
            file( { type: "calendar" } ),
            file( { content: Buffer.from( "x" ) } ),
            file( { content: "" } ),
            () => "interview.ics",
            () => Array.from( { length: 11 }, () => ( { filename: "a.txt", type: "text/plain", content: "a" } ) ),
            () => [ { filename: "a.txt", type: "text/plain", content: "a".repeat( 3 * 1024 * 1024 ) }, { filename: "b.txt", type: "text/plain", content: "b" } ]
        ];
        for ( const attachments of malformed ) {
            const service = serviceWithCalendar( fakeTransport(), attachments );
            assert.throws( () => service.render( "with-file", ANNA, TASK ), ( error ) => error.code === "E_NOTICE_ATTACHMENT_INVALID" && error.transient === false, String( attachments ) );
        }
        const transport = fakeTransport();
        const service = serviceWithCalendar( transport, file( { filename: "../interview.ics" } ) );
        await service.notify( { kind: "with-file", key: "k", recipient: ANNA, data: TASK } );
        assert.equal( ( await service.drain() ).failed, 1 );
        assert.equal( transport.sent.length, 0 );
        assert.equal( doneEntries()[ 0 ].value.code, "E_NOTICE_ATTACHMENT_INVALID" );
    } );

    it( "takes a space or a tab around a type's separators", () => {
        for ( const type of [ "text/calendar;method=PUBLISH", "text/calendar ; method=PUBLISH", "text/calendar;\tcharset=utf-8" ] ) {
            const service = serviceWithCalendar( fakeTransport(), () => [ { filename: "interview.ics", type: type, content: "x" } ] );
            assert.equal( service.render( "with-file", ANNA, TASK ).attachments[ 0 ].type, type );
        }
    } );

    it( "takes a file of exactly the size limit, and a name of exactly 100 characters", () => {
        const service = serviceWithCalendar( fakeTransport(), () => [ { filename: "a".repeat( 96 ) + ".txt", type: "text/plain", content: "a".repeat( 3 * 1024 * 1024 ) } ] );
        assert.equal( service.render( "with-file", ANNA, TASK ).attachments.length, 1 );
    } );

    it( "refuses an attachments that is not a function at registration", () => {
        const service = serviceWith( fakeTransport() );
        assert.throws( () => service.registerNotice( "bad", { subject: "notice.task-new.subject", text: "notice.task-new.text", attachments: [ CALENDAR ] } ),
            ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
    } );

} );

describe( "events and rules", () => {

    const RULES = Object.freeze( {
        enabled: true,
        rules: [
            { id: "new-review", event: "task.created", notice: "task-new", when: { task: [ "review" ] } },
            { id: "new-review-again", event: "task.created", notice: "task-new", when: { task: [ "review", "approval" ] } },
            { id: "disabled", event: "task.created", notice: "only-bg", enabled: false }
        ]
    } );

    it( "queues the notice of every enabled rule whose filter passes, once per notice", async () => {
        const service = serviceWith( fakeTransport() );
        await seedRules( RULES );
        assert.equal( await service.emit( "task.created", { key: "review:I-7:1001", recipient: ANNA, data: TASK } ), 1 );
        assert.equal( pendingKeys().length, 1 );
        assert.equal( await service.emit( "task.created", { key: "review:I-7:1001", recipient: ANNA, data: TASK } ), 0 );
    } );

    it( "queues nothing for data no filter passes", async () => {
        const service = serviceWith( fakeTransport() );
        await seedRules( RULES );
        assert.equal( await service.emit( "task.created", { key: "k", recipient: ANNA, data: { task: "sign-off" } } ), 0 );
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

describe( "edited texts", () => {

    // A notice declaring what an editor may change: its placeholders, and the label its format reads through `label`.
    function editableService( transport = fakeTransport() ) {
        const service = serviceWith( transport );
        service.registerNotice( "task-new", {
            subject: "notice.task-new.subject",
            text: "notice.task-new.text",
            link: ( data ) => "/app/tasks/" + data.itemID,
            format: ( data, language, label ) => ( { task: label( "notice.task-name." + data.task ), date: data.date } ),
            placeholders: [ "task", "date" ],
            labels: { "notice.task-name.review": [] }
        } );
        return service;
    }

    const registryFor = ( service ) => {
        const registry = new ConfigRegistry();
        registry.register( "notifications", service.configDocument( { enabled: true, rules: [] } ) );
        return registry;
    };
    const codesOf = async ( registry, texts ) => ( await registry.validate( "notifications", { enabled: true, rules: [], texts: texts } ) ).errors.map( ( issue ) => issue.code ).sort();

    it( "renders an edited text in its own language, and the shipped label everywhere else", () => {
        const service = editableService();
        const texts = { "notice.task-new.subject": { bg: "Задача за Вас: {task}" } };
        assert.equal( service.render( "task-new", ANNA, TASK, texts ).subject, "Задача за Вас: преглед" );
        assert.equal( service.render( "task-new", BORIS, TASK, texts ).subject, "New task: review by 28.10.2026", "English keeps its shipped text" );
        assert.equal( service.render( "task-new", ANNA, TASK, texts ).text.startsWith( "Имате нова задача" ), true, "the text was not edited" );
        assert.equal( service.render( "task-new", ANNA, TASK, { "notice.task-new.subject": { bg: "   " } } ).subject, "Нова задача: преглед до 28.10.2026", "a blank edit is no edit" );
    } );

    it( "gives format a label that honours an edit of the labels it reads", () => {
        const service = editableService();
        const texts = { "notice.task-name.review": { bg: "прегледа си" } };
        assert.equal( service.render( "task-new", ANNA, TASK, texts ).subject, "Нова задача: прегледа си до 28.10.2026" );
    } );

    it( "lists every editable text once, with the names each may use", () => {
        const service = editableService();
        service.setLayout( { name: "Example", action: "notice.layout.action", footer: "notice.layout.footer" } );
        const listed = service.editableTexts();
        assert.deepEqual( listed.map( ( entry ) => [ entry.key, entry.part, entry.notices, entry.placeholders, entry.multiline ] ), [
            [ "notice.task-new.subject", "subject", [ "task-new" ], [ "task", "date" ], false ],
            [ "notice.task-new.text", "text", [ "task-new" ], [ "task", "date" ], true ],
            [ "notice.task-name.review", "label", [ "task-new" ], [], false ],
            [ "notice.only-bg.subject", "subject", [ "only-bg" ], null, false ],
            [ "notice.only-bg.text", "text", [ "only-bg" ], null, true ],
            [ "notice.layout.action", "action", [], [], false ],
            [ "notice.layout.footer", "footer", [], [], true ]
        ] );
    } );

    // One edit is read wherever its key is. Keeping the first registration's rule let a line break through to a subject
    // sharing a text's key, and a union of the names let one notice's name reach the other's reader as its braces.
    it( "holds a key read in more than one place to the strictest of its uses", async () => {
        const service = editableService();
        service.registerNotice( "task-due", {
            subject: "notice.task-new.text",
            text: "notice.only-bg.text",
            link: ( data ) => "/app/tasks/" + data.itemID,
            format: ( data, language, label ) => ( { task: label( "notice.task-name." + data.task ), n: 3 } ),
            placeholders: [ "task" ],
            labels: { "notice.task-name.review": [ "n" ] }
        } );
        const listed = new Map( service.editableTexts().map( ( entry ) => [ entry.key, entry ] ) );
        assert.deepEqual( [ "notice.task-new.text", "notice.only-bg.text", "notice.task-name.review" ].map( ( key ) => {
            const entry = listed.get( key );
            return [ key, entry.part, entry.notices, entry.placeholders, entry.multiline ];
        } ), [
            [ "notice.task-new.text", "text", [ "task-new", "task-due" ], [ "task" ], false ],
            [ "notice.only-bg.text", "text", [ "only-bg", "task-due" ], [ "task" ], true ],
            [ "notice.task-name.review", "label", [ "task-new", "task-due" ], [], false ]
        ] );
        const registry = registryFor( service );
        assert.deepEqual( await codesOf( registry, { "notice.task-new.text": { bg: "Задача: {task}.\n\nОще една." } } ), [ "notifications.multiline-text" ], "a subject reads it too" );
        assert.deepEqual( await codesOf( registry, { "notice.task-new.text": { bg: "Задача: {task} до {date}" } } ), [ "notifications.unknown-placeholder" ], "task-due fills no date" );
        assert.deepEqual( await codesOf( registry, { "notice.task-name.review": { bg: "преглед ({n})" } } ), [ "notifications.unknown-placeholder" ], "task-new fills no n" );
        assert.deepEqual( await codesOf( registry, { "notice.only-bg.text": { bg: "Всяко {name} минава" } } ), [ "notifications.unknown-placeholder" ], "a use declaring names restricts one that declared none" );
        assert.deepEqual( await codesOf( registry, { "notice.only-bg.text": { bg: "Задача: {task}.\n\nОще една." } } ), [], "both uses take paragraphs and fill the task" );
    } );

    it( "has a validator that refuses an edit the notice would not render as shown", async () => {
        const service = editableService();
        const registry = registryFor( service );
        assert.deepEqual( await codesOf( registry, { "notice.task-new.text": { bg: "Задача: {task}.\n\nСрок: {date}" } } ), [] );
        assert.deepEqual( await codesOf( registry, { "notice.unknown": { bg: "x" } } ), [ "notifications.unknown-text" ] );
        assert.deepEqual( await codesOf( registry, { "notice.only-bg.subject": { en: "Only in English" } } ), [ "notifications.unknown-language" ], "the shipped label has no English" );
        assert.deepEqual( await codesOf( registry, { "notice.task-new.subject": { bg: "  " } } ), [ "notifications.empty-text" ] );
        assert.deepEqual( await codesOf( registry, { "notice.task-new.subject": { bg: "Нова\nзадача" } } ), [ "notifications.multiline-text" ] );
        assert.deepEqual( await codesOf( registry, { "notice.task-new.subject": { bg: "За {name}: {task} {deadline}" } } ), [ "notifications.unknown-placeholder", "notifications.unknown-placeholder" ] );
        assert.deepEqual( await codesOf( registry, { "notice.task-name.review": { bg: "{task}" } } ), [ "notifications.unknown-placeholder" ], "a label offering no name" );
        assert.deepEqual( await codesOf( registry, { "notice.only-bg.text": { bg: "Всяко {name} минава" } } ), [], "a notice that declared no placeholders is not checked" );
        assert.equal( ( await registry.validate( "notifications", { enabled: true, rules: [], texts: { "notice.task-new.subject": { bg: 7 } } } ) ).valid, false, "the schema" );
    } );

    it( "sends a notice queued before an edit with the edit, because a notice is rendered when it is sent", async () => {
        const transport = fakeTransport();
        const service = editableService( transport );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        await seedRules( { enabled: true, rules: [], texts: { "notice.task-new.subject": { bg: "Редактирано: {task}" } } } );
        await service.drain();
        assert.equal( transport.sent[ 0 ].subject, "Редактирано: преглед" );
    } );

    it( "keeps sending the shipped text to a deployment that never edited it", async () => {
        const transport = fakeTransport();
        const service = editableService( transport );
        await seedRules( { enabled: true, rules: [] } );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        await service.drain();
        assert.equal( transport.sent[ 0 ].subject, "Нова задача: преглед до 28.10.2026" );
    } );

} );

describe( "options", () => {

    const OPTIONS = Object.freeze( { type: "object", additionalProperties: false, properties: { reminderDays: { type: "integer", minimum: 1, maximum: 30 }, digest: { type: "boolean" } } } );

    it( "validates the application's options by its schema, and holds none without one", async () => {
        const service = serviceWith( fakeTransport() );
        const registry = new ConfigRegistry();
        const definition = service.configDocument( { enabled: true, rules: [], options: { reminderDays: 3 } }, {}, { options: OPTIONS } );
        assert.deepEqual( definition.defaultValue.options, { reminderDays: 3 } );
        registry.register( "notifications", definition );
        assert.equal( ( await registry.validate( "notifications", { enabled: true, rules: [], options: { reminderDays: 5 } } ) ).valid, true );
        assert.equal( ( await registry.validate( "notifications", { enabled: true, rules: [], options: { reminderDays: 0 } } ) ).valid, false );
        assert.equal( ( await registry.validate( "notifications", { enabled: true, rules: [], options: { other: 1 } } ) ).valid, false );

        const plain = new ConfigRegistry();
        plain.register( "notifications", serviceWith( fakeTransport() ).configDocument( { enabled: true, rules: [], options: { reminderDays: 3 } } ) );
        assert.equal( ( await plain.validate( "notifications", { enabled: true, rules: [], options: {} } ) ).valid, false, "no schema, no options" );
    } );

    it( "reads the stored options over the defaults, one key at a time", async () => {
        const service = serviceWith( fakeTransport() );
        service.configDocument( { enabled: true, rules: [], options: { reminderDays: 3, digest: false } }, {}, { options: OPTIONS } );
        assert.deepEqual( await service.getOptions(), { reminderDays: 3, digest: false }, "nothing stored" );
        await seedRules( { enabled: true, rules: [], options: { reminderDays: 5 } } );
        assert.deepEqual( await service.getOptions(), { reminderDays: 5, digest: false }, "an option the stored document predates keeps its default" );
    } );

} );

describe( "the scheduled pass (sendEveryHours)", () => {

    const at = ( hours, minutes = 0 ) => new Date( Date.UTC( 2026, 9, 14, hours, minutes ) );
    const queue = ( service, key ) => service.notify( { kind: "task-new", key: key, recipient: ANNA, data: TASK } );

    it( "passes once an hour unless the document says otherwise: a tick inside the hour sends nothing", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        await queue( service, "a" );
        assert.deepEqual( await service.sendDue( at( 10, 5 ) ), { sent: 1, failed: 0, retrying: 0, stopped: null } );
        await queue( service, "b" );
        assert.equal( await service.sendDue( at( 10, 59 ) ), null, "the hour had its pass" );
        assert.equal( transport.sent.length, 1 );
        assert.deepEqual( await service.sendDue( at( 11, 0 ) ), { sent: 1, failed: 0, retrying: 0, stopped: null } );
        assert.equal( transport.sent.length, 2 );
    } );

    it( "passes once when two ticks overlap in one interval", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        await queue( service, "a" );
        // Both read the record before either writes it, unless the check and the record are one step.
        const outcomes = await Promise.all( [ service.sendDue( at( 10, 5 ) ), service.sendDue( at( 10, 5 ) ) ] );
        assert.equal( outcomes.filter( ( outcome ) => outcome === null ).length, 1, "the second tick found the first one's pass" );
        assert.equal( transport.sent.length, 1 );
    } );

    it( "takes the interval from the document, its intervals counted from midnight UTC", async () => {
        await seedRules( { enabled: true, rules: [], sendEveryHours: 6 } );
        const service = serviceWith( fakeTransport() );
        assert.equal( await service.getSendEveryHours(), 6 );
        assert.notEqual( await service.sendDue( at( 5, 59 ) ), null, "the first tick passes" );
        assert.notEqual( await service.sendDue( at( 6, 0 ) ), null, "06:00 begins an interval" );
        assert.equal( await service.sendDue( at( 11, 59 ) ), null );
        assert.notEqual( await service.sendDue( at( 12, 0 ) ), null );
        assert.equal( NotificationService.intervalStart( 24, at( 23, 30 ) ), Date.UTC( 2026, 9, 14 ) );
        assert.equal( NotificationService.intervalStart( 8, at( 23, 30 ) ), Date.UTC( 2026, 9, 14, 16 ) );
    } );

    it( "is every hour for a document that names no interval, or one it does not offer", async () => {
        const service = serviceWith( fakeTransport() );
        assert.equal( await service.getSendEveryHours(), 1, "nothing stored" );
        await seedRules( { enabled: true, rules: [], sendEveryHours: 5 } );
        assert.equal( await service.getSendEveryHours(), 1, "5 does not divide a day" );
        assert.deepEqual( NotificationService.SEND_INTERVALS, [ 1, 2, 3, 4, 6, 8, 12, 24 ] );
    } );

    it( "validates the interval, and seeds it only when the application gives one", async () => {
        const service = serviceWith( fakeTransport() );
        const registry = new ConfigRegistry();
        registry.register( "notifications", service.configDocument( { enabled: true, rules: [] } ) );
        assert.equal( ( await registry.validate( "notifications", { enabled: true, rules: [], sendEveryHours: 12 } ) ).valid, true );
        for ( const value of [ 5, 0, 48, "6", 1.5 ] ) {
            assert.equal( ( await registry.validate( "notifications", { enabled: true, rules: [], sendEveryHours: value } ) ).valid, false, JSON.stringify( value ) );
        }
        assert.equal( "sendEveryHours" in service.configDocument( { enabled: true, rules: [] } ).defaultValue, false );
        assert.equal( service.configDocument( { enabled: true, rules: [], sendEveryHours: 4 } ).defaultValue.sendEveryHours, 4 );
        assert.equal( "sendEveryHours" in service.configDocument( { enabled: true, rules: [], sendEveryHours: 7 } ).defaultValue, false );
    } );

    it( "passes when its record cannot be read, and only logs a record it could not write", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        const originalGet = cacheStub.getValue;
        const originalSet = cacheStub.setValue;
        cacheStub.getValue = ( key ) => key === "ti:notify:last-pass" ? Promise.reject( new Error( "store down" ) ) : originalGet.call( cacheStub, key );
        cacheStub.setValue = ( key, ...rest ) => key === "ti:notify:last-pass" ? Promise.reject( new Error( "store down" ) ) : originalSet.call( cacheStub, key, ...rest );
        try {
            await queue( service, "a" );
            assert.equal( ( await service.sendDue( at( 10, 5 ) ) ).sent, 1, "mail is not held back for a record" );
            assert.notEqual( await service.sendDue( at( 10, 6 ) ), null, "with no record, the next tick passes again" );
            assert.ok( logLines.some( ( line ) => line.includes( "could not be recorded" ) ) );
        } finally {
            cacheStub.getValue = originalGet;
            cacheStub.setValue = originalSet;
        }
    } );

} );

describe( "the layout", () => {

    const LAYOUT = Object.freeze( { name: "Example & Co", colors: { brand: "#123456", brandText: "#FFFFFF", accent: "#ABCDEF" }, font: "Georgia, serif", action: "notice.layout.action", footer: "notice.layout.footer" } );

    it( "sets the brand as a wordmark, the link as a button with the address under it, and the footer", () => {
        const service = serviceWith( fakeTransport() );
        service.setLayout( LAYOUT );
        const { html, text } = service.render( "task-new", ANNA, TASK );
        assert.match( html, /<td style="background-color:#123456;border-bottom:3px solid #ABCDEF;[^"]*font-family:Georgia, serif;[^"]*color:#FFFFFF;">Example &amp; Co<\/td>/ );
        assert.match( html, /<a href="https:\/\/app\.example\.com\/app\/tasks\/I-7" style="display:inline-block;[^"]*">Отворете приложението<\/a>/ );
        assert.equal( ( html.match( /href="https:\/\/app\.example\.com\/app\/tasks\/I-7"/g ) || [] ).length, 2, "the button, and the address for a client that hides it" );
        assert.match( html, />Изпратено автоматично\.<\/td>/ );
        assert.match( html, /<meta name="color-scheme" content="light">/ );
        assert.match( html, /<div style="display:none;[^"]*">Имате нова задача: преглед\.<\/div>/, "the first paragraph as the inbox preview" );
        assert.equal( text, "Имате нова задача: преглед.\n\nСрокът е 28.10.2026.\n\nОтворете приложението: https://app.example.com/app/tasks/I-7\n\n-- \nИзпратено автоматично." );
    } );

    it( "fetches nothing when it opens: no image, stylesheet, font or remote address but the notice's own link", () => {
        const service = serviceWith( fakeTransport() );
        service.setLayout( LAYOUT );
        const { html } = service.render( "task-new", ANNA, TASK );
        assert.doesNotMatch( html, /<img|<link|<script|<style|src=|url\(|@import/i );
        const addresses = [ ...html.matchAll( /https?:\/\/[^"<\s]+/g ) ].map( ( match ) => match[ 0 ] );
        assert.deepEqual( [ ...new Set( addresses ) ], [ "https://app.example.com/app/tasks/I-7" ] );
    } );

    it( "leaves the band out without a name, the button out without its label, and the text as it was", () => {
        const service = serviceWith( fakeTransport() );
        const plain = service.render( "task-new", ANNA, TASK );
        assert.doesNotMatch( plain.html, /border-bottom:3px/ );
        assert.doesNotMatch( plain.html, /display:inline-block/ );
        assert.equal( plain.text, "Имате нова задача: преглед.\n\nСрокът е 28.10.2026.\n\nhttps://app.example.com/app/tasks/I-7" );

        service.setLayout( { name: "Example", action: "notice.layout.missing", footer: "notice.layout.missing" } );
        const unlabelled = service.render( "task-new", ANNA, TASK );
        assert.doesNotMatch( unlabelled.html, /display:inline-block/, "a missing label is no button, not a failed notice" );
        assert.equal( unlabelled.text, plain.text );
    } );

    // Every start tag in a rendered e-mail with its style as declarations. The HTML is the layout's own, so a linear scan
    // of `<name …>` is enough: an attribute value holding `>` is escaped as `&gt;`.
    function startTags( html ) {
        return [ ...html.matchAll( /<([a-z][a-z0-9]*)\b([^>]*)>/g ) ].map( ( match ) => {
            const style = /\sstyle="([^"]*)"/.exec( match[ 2 ] );
            const declarations = {};
            for ( const declaration of ( style ? style[ 1 ] : "" ).split( ";" ) ) {
                const colon = declaration.indexOf( ":" );
                if ( colon > 0 ) {
                    declarations[ declaration.slice( 0, colon ).trim() ] = declaration.slice( colon + 1 ).trim();
                }
            }
            return { name: match[ 1 ], index: match.index, style: declarations };
        } );
    }

    // The button's link, the cell drawing it, that cell's table, and the cell holding that table.
    function buttonParts( html, label ) {
        const tags = startTags( html );
        const end = html.indexOf( ">" + label + "</a>" );
        const before = ( name, index ) => tags.filter( ( tag ) => tag.name === name && tag.index < index ).pop();
        const link = before( "a", end );
        const cell = before( "td", link.index );
        const table = before( "table", cell.index );
        return { link: link, cell: cell, wrapper: before( "td", table.index ) };
    }

    // Outlook on Windows lays mail out with Word, which drew the button as a bare block: no padding beside the label,
    // the label on the block's bottom edge, the block flush against the paragraph above (production, 2026-10-16).
    it( "gives the button its padding on the cell, as Word draws it, and keeps the link's own for every other client", () => {
        const service = serviceWith( fakeTransport() );
        service.setLayout( LAYOUT );
        const { link, cell } = buttonParts( service.render( "task-new", ANNA, TASK ).html, "Отворете приложението" );
        assert.equal( cell.style[ "mso-padding-alt" ], link.style.padding, "Word reads the cell's padding, the same as the link's" );
        assert.equal( cell.style.padding, undefined, "a padding every client reads would double the link's" );
        assert.equal( link.style[ "mso-padding-alt" ], "0", "Word applies none of the link's padding on top of the cell's" );
        assert.equal( link.style.display, "inline-block", "elsewhere the link is the whole button, so all of it is clickable" );
        assert.equal( cell.style[ "font-size" ], link.style[ "font-size" ] );
        assert.match( cell.style[ "line-height" ], /^\d+px$/ );
        assert.equal( parseFloat( cell.style[ "line-height" ] ), parseFloat( link.style[ "font-size" ] ) * parseFloat( link.style[ "line-height" ] ),
            "the line Word sets in the cell is the label's, with no space left over above it" );
    } );

    it( "makes every space with padding on a cell: no margin on a table, and no padding Word would drop", () => {
        const service = serviceWith( fakeTransport() );
        const renders = [ service.render( "task-new", ANNA, TASK ).html ];
        service.setLayout( LAYOUT );
        renders.push( service.render( "task-new", ANNA, TASK ).html );
        service.setLayout( { name: "Example", action: "notice.layout.missing" } );
        renders.push( service.render( "task-new", ANNA, TASK ).html );
        for ( const html of renders ) {
            for ( const tag of startTags( html ) ) {
                const properties = Object.keys( tag.style );
                if ( [ "table", "tr", "td" ].includes( tag.name ) ) {
                    assert.deepEqual( properties.filter( ( property ) => property.startsWith( "margin" ) ), [], `a margin on a <${ tag.name }>, which Word ignores` );
                }
                if ( properties.some( ( property ) => property.startsWith( "padding" ) ) && ![ "td", "body" ].includes( tag.name ) ) {
                    assert.equal( tag.style[ "mso-padding-alt" ], "0", `padding on a <${ tag.name }> that Word does not draw and the layout relies on` );
                }
            }
        }
        const { wrapper } = buttonParts( renders[ 1 ], "Отворете приложението" );
        assert.equal( wrapper.style.padding, "24px 0 0", "the gap above the button is the padding of the cell around it" );
    } );

    it( "refuses a colour or a font that could break out of the style it lands in", () => {
        const service = serviceWith( fakeTransport() );
        assert.throws( () => service.setLayout( { colors: { brand: "red;background:url(https://x.example/p.png)" } } ) );
        assert.throws( () => service.setLayout( { colors: { brand: "#123456\"" } } ) );
        assert.throws( () => service.setLayout( { colors: { shadow: "#000000" } } ), "an unknown colour role" );
        assert.throws( () => service.setLayout( { font: "Georgia; color:red" } ) );
        assert.throws( () => service.setLayout( { name: "" } ) );
        assert.doesNotThrow( () => service.setLayout( null ) );
    } );

} );

describe( "sendTest", () => {

    it( "sends one rendered notice with the draft texts, past the outbox and the ledger, so it never stops the real one", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        const result = await service.sendTest( "task-new", ANNA, TASK, { "notice.task-new.subject": { bg: "Проба: {task}" } } );
        assert.deepEqual( result, { messageId: "m-1" } );
        assert.equal( transport.sent[ 0 ].subject, "Проба: преглед" );
        assert.deepEqual( transport.sent[ 0 ].to, { email: ANNA.email, name: ANNA.name } );
        assert.equal( Object.keys( cacheStub.values ).length, 0, "nothing queued, nothing in the ledger" );
        assert.equal( await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } ), true );
    } );

    it( "renders with the stored edits when given no draft", async () => {
        const transport = fakeTransport();
        const service = serviceWith( transport );
        await seedRules( { enabled: true, rules: [], texts: { "notice.task-new.subject": { bg: "Съхранено: {task}" } } } );
        await service.sendTest( "task-new", ANNA, TASK );
        assert.equal( transport.sent[ 0 ].subject, "Съхранено: преглед" );
    } );

    it( "refuses while sending is off, for an unknown notice and for a malformed recipient, and passes a transport's failure on", async () => {
        const off = new NotificationService( { drainOnNotify: false } );
        off.registerNotice( "task-new", { subject: "notice.task-new.subject", text: "notice.task-new.text" } );
        await assert.rejects( off.sendTest( "task-new", ANNA, TASK ), { code: "E_NOTICE_TRANSPORT_OFF" } );

        const service = serviceWith( fakeTransport( [ "E_RECIPIENT_SUPPRESSED" ] ) );
        await assert.rejects( service.sendTest( "task-gone", ANNA, TASK ), { code: "E_NOTICE_UNKNOWN" } );
        await assert.rejects( service.sendTest( "task-new", { id: "a@b", email: ANNA.email }, TASK ) );
        await assert.rejects( service.sendTest( "task-new", ANNA, TASK ), { code: "E_RECIPIENT_SUPPRESSED" } );
        assert.equal( logLines.some( ( line ) => line.includes( "Test notice 'task-new' for recipient '1001' failed with 'E_RECIPIENT_SUPPRESSED'" ) ), true );
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

describe( "a store that fails a write", () => {

    it( "logs that the notice stays queued, never the entry the store was writing (CA-496 review)", async () => {
        const service = serviceWith( fakeTransport( [ "E_DELIVERY_FAILED" ] ) );
        await service.notify( { kind: "task-new", key: "k", recipient: ANNA, data: TASK } );
        const originalSet = cacheStub.setValue;
        // ioredis attaches the command it failed on to a reply error, arguments and all: here the retry's pending entry.
        cacheStub.setValue = ( key, value, ...rest ) => {
            if ( key.startsWith( "ti:notify:pending:" ) ) {
                const error = new Error( "OOM command not allowed when used memory > 'maxmemory'." );
                error.name = "ReplyError";
                error.command = { name: "set", args: [ key, JSON.stringify( value ) ] };
                return Promise.reject( exceptions.raise( error ) );
            }
            return originalSet.call( cacheStub, key, value, ...rest );
        };
        const before = logLines.length;
        try {
            await service.drain();
        } finally {
            cacheStub.setValue = originalSet;
        }
        const lines = logLines.slice( before ).filter( ( line ) => line.includes( "could not be processed" ) );
        assert.equal( lines.length, 1 );
        assert.equal( lines[ 0 ].includes( "@" ), false, "the pending entry holds the recipient's address" );
        assert.match( lines[ 0 ], /"code":/, "the line still says what failed" );
    } );

} );

describe( "the logs", () => {

    it( "never carried an address in any test above", () => {
        assert.ok( logLines.length > 0 );
        assert.deepEqual( logLines.filter( ( line ) => line.includes( "@" ) ), [] );
    } );

} );
