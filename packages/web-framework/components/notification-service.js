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

"use strict";

const { createHash } = require( "node:crypto" );
const cache = require( "@ti-engine/core/cache" );
const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const localization = require( "@ti-engine/core/localization" );
const exceptions = require( "@ti-engine/core/exceptions" );
const timeZone = require( "@ti-engine/core/time-zone" );
const configService = require( "#config-service" );
const transports = require( "#notification-transports" );

/** @import { TiEditableNoticeText, TiMailMessage, TiMailTransport, TiNoticeDefinition, TiNoticeLayout, TiNoticeLayoutColors, TiNoticeTexts, TiNotificationDrainReport, TiNotificationEventDefinition, TiNotificationRecipient, TiNotificationRule, TiNotificationSettings, TiNotificationsDocument, TiRenderedNotice } from "#definitions" */
/** @import { ConfigValidationIssue } from "#config-registry" */

// Both are string values, not JSON documents: the D1 state store has no way to delete a document (`/v1/values/delete`
// reaches `state_values` alone), so a pending entry written with `setJSON` could never be removed there, and a value
// takes its expiry in the same write that stores it. Each key is followed by `<recipient digest>:<notice digest>`.
const KEY_PENDING = "ti:notify:pending:";
const KEY_DONE = "ti:notify:done:";

// `{ at }`, the moment the last scheduled pass began: a tick inside the same interval sends nothing. A value, as the job
// scheduler's records are, so it can be read and replaced on either store.
const KEY_LAST_PASS = "ti:notify:last-pass";

// The lock key the scheduled pass holds from its check to its record, so two ticks that overlap pass once. Not a notice's
// key, which is two hex digests joined by a colon.
const LOCK_SCHEDULED_PASS = "scheduled-pass";

/**
 * The intervals a job tick may send what the outbox holds at, in hours: the `notifications` document's
 * `sendEveryHours`. Each divides a day, so the passes fall at the same hours of every day, counted from midnight UTC.
 *
 * @type {ReadonlyArray<number>}
 */
const SEND_INTERVALS = Object.freeze( [ 1, 2, 3, 4, 6, 8, 12, 24 ] );

/**
 * The interval when the document names none: every hour, so a notice waiting for a retry waits an hour at most where
 * the ticks come that often.
 *
 * @type {number}
 */
const DEFAULT_SEND_EVERY_HOURS = 1;

/**
 * The key of the configuration document holding the rules (§3.2 of the design record).
 *
 * @type {string}
 */
const CONFIG_KEY = "notifications";

/**
 * How long a ledger entry is kept, in days, unless the deployment says otherwise: half a year, longer than the period
 * an application's catch-up is expected to look back over, so a notice is not sent again by one that runs after its
 * entry has gone. An application whose catch-up looks further back sets `retentionDays` to match.
 *
 * @type {number}
 */
const DEFAULT_RETENTION_DAYS = 180;

/**
 * How many times one notice is tried before it is given up and recorded as failed.
 *
 * @type {number}
 */
const MAX_ATTEMPTS = 5;

/**
 * The wait before each retry, in seconds, by the number of attempts already made.
 *
 * @type {ReadonlyArray<number>}
 */
const RETRY_BACKOFF = Object.freeze( [ 60, 300, 900, 3600 ] );

/**
 * How long the dispatcher waits after the provider reports a rate limit, in seconds. A rate limit is about the pace,
 * not the message, so it counts no attempt: spending one would burn every queued notice's attempts in a single pass.
 *
 * @type {number}
 */
const RATE_LIMIT_PAUSE = 60;

/**
 * The most notices one pass of the dispatcher sends. A pass runs inside a job tick or after a write; the rest wait for
 * the next one.
 *
 * @type {number}
 */
const DRAIN_LIMIT = 1000;

/**
 * The longest a timer is set for. Node's `setTimeout` treats anything above it as one millisecond.
 *
 * @type {number}
 */
const MAX_TIMER = 2147483647;

/**
 * The most files one notice may attach.
 *
 * @type {number}
 */
const MAX_ATTACHMENTS = 10;

/**
 * The most bytes a notice's files may hold together, before encoding: 3 MiB, which base64 makes 4 MiB. Cloudflare
 * Email Service refuses a message above 5 MiB, the files and both bodies included, so this leaves the bodies room.
 *
 * @type {number}
 */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/**
 * A file name a transport can put in a header as it is: plain ASCII, starting with a letter or digit, with no path
 * separator, quote or line break. A name outside it would need RFC 2231 encoding, which not every transport does.
 *
 * @type {RegExp}
 */
const ATTACHMENT_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,99}$/;

/**
 * A media type with optional parameters, such as `text/calendar; charset=utf-8; method=PUBLISH`, in RFC 2045 tokens
 * only: a quote, a line break or a stray `;` would end up inside the part's `Content-Type` header. Only a space or a
 * tab may stand around a `;`: `\s` would let `text/calendar\r\n; method=PUBLISH` through, a line break in the header.
 *
 * @type {RegExp}
 */
const ATTACHMENT_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+([ \t]*;[ \t]*[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]+)*$/;

/**
 * What a log line may carry of a failure: its kind and its code, never its message or its data. A store error can carry
 * the write it failed on: ioredis attaches the command and its arguments to a reply error, so a failed write of a
 * pending entry held the recipient's address, and the logger writes every property of an error it is given.
 *
 * @method
 * @param {*} error
 * @returns {{name: (string|null), code: (string|number|null)}}
 * @private
 */
function loggableError( error ) {
    const name = ( error && typeof error.name === "string" ) ? error.name : null;
    const code = ( error && ( typeof error.code === "string" || typeof error.code === "number" ) ) ? error.code : null;
    return { name: name, code: code };
}

const TRANSPORT_OFF = "off";
const TRANSPORT_LOG = "log";
const TRANSPORT_CLOUDFLARE = "cloudflare";

/**
 * The colours of the e-mail layout when the application sets none: a neutral grey and white that suit any brand.
 *
 * @type {Readonly<TiNoticeLayoutColors>}
 */
const DEFAULT_COLORS = Object.freeze( {
    brand: "#1F2328",
    brandText: "#FFFFFF",
    accent: "#1F2328",
    background: "#F4F4F5",
    surface: "#FFFFFF",
    text: "#1F2328",
    muted: "#6B7280",
    border: "#E5E7EB"
} );

const DEFAULT_WORDMARK_FONT = "Georgia, 'Times New Roman', serif";
const BODY_FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The button's padding, once: the link carries it for every client but Word, and the cell carries it for Word.
const BUTTON_PADDING = "12px 22px";

// What an application may put in a layout. A colour or a font family lands inside a `style` attribute, so anything
// that could close the attribute or start another declaration is refused rather than escaped.
const COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const FONT_PATTERN = /^[A-Za-z0-9 ,'-]+$/;

// The parts of a notice an editor may change, and whether each may hold more than one line. A subject, a button and
// a label filled into a sentence are one line; a subject with a line break is a new header to a transport that
// writes headers.
const TEXT_PARTS = Object.freeze( { subject: false, text: true, label: false, action: false, footer: true } );

/**
 * Returns the hex SHA-256 of a string.
 *
 * @method
 * @param {string} value
 * @returns {string}
 * @private
 */
function digestOf( value ) {
    return createHash( "sha256" ).update( String( value ) ).digest( "hex" );
}

/**
 * The store suffix of one notice for one person. The recipient's digest comes first so that a person's entries share
 * a prefix: an erasure finds them with one key match and reads nothing. Digests rather than the values themselves, so
 * that an ID or a key holding `*`, `?` or `[` cannot widen that match.
 *
 * @method
 * @param {string} recipientID
 * @param {string} noticeKey
 * @returns {string}
 * @private
 */
function suffixOf( recipientID, noticeKey ) {
    return digestOf( recipientID ).slice( 0, 16 ) + ":" + digestOf( noticeKey );
}

/**
 * Escapes text for HTML content and attribute values.
 *
 * @method
 * @param {string} value
 * @returns {string}
 * @private
 */
function escapeHTML( value ) {
    return String( value ).replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" ).replace( /"/g, "&quot;" ).replace( /'/g, "&#39;" );
}

/**
 * Replaces each `{name}` in a template with the value of that name. A name with no value is left as written, so a
 * missing value shows in the message and in a test rather than vanishing.
 *
 * @method
 * @param {string} template
 * @param {Object} values
 * @returns {string}
 * @private
 */
function fillTemplate( template, values ) {
    return template.replace( /\{([A-Za-z0-9_.-]+)\}/g, ( match, name ) => {
        const has = Object.prototype.hasOwnProperty.call( values, name ) && values[ name ] !== undefined && values[ name ] !== null;
        return has ? String( values[ name ] ) : match;
    } );
}

/**
 * The placeholder names a template uses, each once, in the order they first appear.
 *
 * @method
 * @param {string} template
 * @returns {string[]}
 * @private
 */
function placeholdersIn( template ) {
    return [ ...new Set( [ ...String( template ).matchAll( /\{([A-Za-z0-9_.-]+)\}/g ) ].map( ( match ) => match[ 1 ] ) ) ];
}

/**
 * Whether a value is a list of distinct placeholder names.
 *
 * @method
 * @param {*} value
 * @returns {boolean}
 * @private
 */
function isNameList( value ) {
    return Array.isArray( value ) && value.every( ( name ) => typeof name === "string" && /^[A-Za-z0-9_.-]+$/.test( name ) );
}

/**
 * Lays a rendered notice out as an HTML e-mail: the brand's wordmark on a band, a card holding the text and a button to
 * the link, and a footer. Tables and inline styles, because that is what every mail client renders alike: Gmail drops
 * a `<style>` block in some views and Outlook on Windows lays out with Word's engine. The scheme is pinned to light so
 * a client that recolours for dark mode leaves the brand's colours alone.
 * <br/>
 * Nothing is fetched when it opens: no image, no font, no stylesheet. A notice points to the application; it does not
 * report on whoever opens it.
 *
 * @method
 * @param {Object} parts
 * @param {string} parts.language
 * @param {string} parts.subject
 * @param {string[]} parts.paragraphs The text's paragraphs, as written: this escapes them.
 * @param {string|null} parts.url
 * @param {string|null} parts.action The button's label, or `null` for a plain link.
 * @param {string|null} parts.footer
 * @param {TiNoticeLayout|null} parts.layout
 * @returns {string}
 * @private
 */
function layoutHTML( { language, subject, paragraphs, url, action, footer, layout } ) {
    const colors = Object.assign( {}, DEFAULT_COLORS, ( layout && layout.colors ) || {} );
    const wordmarkFont = ( layout && layout.font ) || DEFAULT_WORDMARK_FONT;
    const asHTML = ( paragraph ) => escapeHTML( paragraph ).replace( /\n/g, "<br>" );
    const rows = [];
    if ( layout && layout.name ) {
        rows.push( `<tr><td style="background-color:${ colors.brand };border-bottom:3px solid ${ colors.accent };padding:18px 28px;font-family:${ wordmarkFont };font-size:22px;line-height:1.2;color:${ colors.brandText };">${ escapeHTML( layout.name ) }</td></tr>` );
    }
    const body = paragraphs.map( ( paragraph, index ) => `<p style="margin:${ index === 0 ? "0" : "16px" } 0 0;">${ asHTML( paragraph ) }</p>` );
    if ( url && action ) {
        // Word, which lays mail out in Outlook on Windows, ignores a margin on a table and a link's padding and
        // inline-block, and drew this button as a bare block, its label on the bottom edge, flush against the paragraph
        // above. So the gap is padding on a cell around the button, and the cell holds the button's padding for Word in
        // `mso-padding-alt`, which only Word reads: plain padding there would double the link's everywhere else, where
        // the link's own keeps the whole button clickable. The link's `mso-padding-alt:0` keeps Word from adding part
        // of its padding to the cell's, and the cell states the label's size and line height, so Word sets the label's
        // line there and leaves no space above it.
        body.push( `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:24px 0 0;">`
            + `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background-color:${ colors.brand };border-radius:3px;mso-padding-alt:${ BUTTON_PADDING };font-size:15px;line-height:18px;">`
            + `<a href="${ escapeHTML( url ) }" style="display:inline-block;padding:${ BUTTON_PADDING };mso-padding-alt:0;font-family:${ BODY_FONT };font-size:15px;font-weight:600;line-height:1.2;color:${ colors.brandText };text-decoration:none;">${ escapeHTML( action ) }</a>`
            + "</td></tr></table></td></tr></table>" );
        body.push( `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${ colors.muted };word-break:break-all;"><a href="${ escapeHTML( url ) }" style="color:${ colors.muted };">${ escapeHTML( url ) }</a></p>` );
    } else if ( url ) {
        body.push( `<p style="margin:16px 0 0;"><a href="${ escapeHTML( url ) }" style="color:${ colors.brand };">${ escapeHTML( url ) }</a></p>` );
    }
    rows.push( `<tr><td style="background-color:${ colors.surface };border:1px solid ${ colors.border };${ ( layout && layout.name ) ? "border-top:0;" : "" }padding:28px;font-family:${ BODY_FONT };font-size:16px;line-height:1.55;color:${ colors.text };">\n${ body.join( "\n" ) }\n</td></tr>` );
    if ( footer ) {
        rows.push( `<tr><td style="padding:16px 28px 0;font-family:${ BODY_FONT };font-size:12px;line-height:1.5;color:${ colors.muted };">${ asHTML( footer ) }</td></tr>` );
    }
    // The first paragraph, hidden, is what a client shows beside the subject in the inbox, instead of the wordmark.
    const preheader = paragraphs.length > 0 ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${ escapeHTML( paragraphs[ 0 ] ) }</div>\n` : "";
    return "<!doctype html>\n"
        + `<html lang="${ escapeHTML( language ) }">\n`
        + `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${ escapeHTML( subject ) }</title></head>\n`
        + `<body style="margin:0;padding:0;background-color:${ colors.background };">\n`
        + preheader
        + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${ colors.background };"><tr><td align="center" style="padding:24px 12px;">\n`
        + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">\n`
        + rows.join( "\n" ) + "\n"
        + "</table>\n"
        + "</td></tr></table>\n"
        + "</body>\n"
        + "</html>\n";
}

/**
 * Checks the files a notice's `attachments` returned and encodes each for the message: its name, its media type,
 * `disposition: "attachment"` and its text as base64 of its UTF-8 bytes. An empty or absent list is no files.
 * <br/>
 * A notice that returns a malformed file is a defect in the application, not in the delivery, so it fails the notice
 * permanently rather than being retried into the same answer. An empty file is malformed too: the relay refuses empty
 * content, and failing here names the notice's own defect instead of the relay's answer.
 *
 * @method
 * @param {*} files What `attachments` returned.
 * @param {string} kind The notice, to name in the error.
 * @returns {TiMailAttachment[]}
 * @throws {Error} With `code` `E_NOTICE_ATTACHMENT_INVALID` and `transient` false.
 * @private
 */
function encodeAttachments( files, kind ) {
    if ( files === undefined || files === null ) {
        return [];
    }
    if ( !Array.isArray( files ) || files.length > MAX_ATTACHMENTS ) {
        throw transports.transportError( "E_NOTICE_ATTACHMENT_INVALID", false, kind );
    }
    let bytes = 0;
    return files.map( ( file ) => {
        if ( !file || typeof file !== "object" || typeof file.filename !== "string" || !ATTACHMENT_FILENAME.test( file.filename )
            || typeof file.type !== "string" || !ATTACHMENT_TYPE.test( file.type ) || typeof file.content !== "string" || file.content === "" ) {
            throw transports.transportError( "E_NOTICE_ATTACHMENT_INVALID", false, kind );
        }
        const content = Buffer.from( file.content, "utf8" );
        bytes += content.length;
        if ( bytes > MAX_ATTACHMENT_BYTES ) {
            throw transports.transportError( "E_NOTICE_ATTACHMENT_INVALID", false, kind );
        }
        return { filename: file.filename, type: file.type, disposition: "attachment", content: content.toString( "base64" ) };
    } );
}

/**
 * Whether a string can stand as one e-mail address in a message: something on both sides of a single `@`, and no
 * white space. A line break is the case that matters: in a transport that writes headers, it starts a new header.
 *
 * @method
 * @param {*} value
 * @returns {boolean}
 * @private
 */
function isAddress( value ) {
    return typeof value === "string" && /^[^@\s]+@[^@\s]+$/.test( value );
}

/**
 * The moment the next UTC day starts, in milliseconds: when a provider's daily limit lifts. It is the provider's day,
 * so it stays on UTC whatever zone the deployment's own days are in (CA-550).
 *
 * @method
 * @param {number} now
 * @returns {number}
 * @private
 */
function nextUTCMidnight( now ) {
    const date = new Date( now );
    return Date.UTC( date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1 );
}

/**
 * Notices sent by e-mail on behalf of an application: what they say, when they go, and that each goes once.
 * <br/>
 * An application registers its **notices** (label keys for the subject and the text, and a link) and the **events** it
 * raises. The `notifications` configuration document holds the **rules** joining the two, so which events send mail is
 * an edit, not a release. {@link NotificationService#emit} applies the rules; {@link NotificationService#notify} queues
 * one notice directly.
 * <br/>
 * A queued notice waits in an outbox in the state store until the dispatcher sends it, after the write that queued it
 * and on a job tick once in each interval the document's `sendEveryHours` sets ({@link NotificationService#sendDue}).
 * A ledger entry records it once sent or given up, so the same key is never sent twice: two
 * paths raising one notice, a write and a nightly catch-up, send it once. Delivery is at least once: the ledger entry is
 * written after the provider accepts, so a crash between the two repeats one notice.
 * <br/>
 * Nothing here logs an address or a rendered text. A line names the notice's kind, the recipient's ID and the outcome,
 * and an ID holding `@` is refused for that reason.
 * <br/>
 * The lock is in-process, as the configuration store's is: this assumes one instance serves a store.
 *
 * @class NotificationService
 * @public
 */
class NotificationService {

    #notices = new Map();
    #events = new Map();
    /** @type {TiNoticeLayout|null} */
    #layout = null;
    #optionDefaults = {};
    #lock = new tools.KeyedLock();
    #now;
    #drainOnNotify;
    /** @type {TiMailTransport|null} */
    #transport = null;
    #sender = null;
    #senderName = null;
    #replyTo = null;
    #publicUrl = null;
    #retentionSeconds = DEFAULT_RETENTION_DAYS * 86400;
    #draining = null;
    #drainRequested = false;
    #pausedUntil = 0;
    #pausedCode = null;
    #timer = null;
    // When each notice waiting for a retry is next due, as this process last read it. A hint that spares a pass the store
    // read of a notice not yet due, never the truth: #dispatch reads the entry and its own `retryAt` before sending.
    // Without it every pass read the whole backlog, and a pass starts with each queued notice: 2,000 notices queued into
    // a relay outage cost 490,000 store calls before their retries ran out, nearly all of them for notices not yet due.
    // Per process, like the lock, since one instance serves a store; after a restart one read of each relearns it.
    #retryHints = new Map();

    /**
     * @constructor
     * @param {Object} [options] For tests; an application uses {@link NotificationService.instance}.
     * @param {function(): number} [options.now] The clock, in milliseconds.
     * @param {boolean} [options.drainOnNotify] Whether a queued notice starts a dispatcher pass. `true` unless stated.
     */
    constructor( options = {} ) {
        this.#now = ( typeof options.now === "function" ) ? options.now : () => Date.now();
        this.#drainOnNotify = ( options.drainOnNotify !== false );
    }

    /* Public interface */

    /**
     * Applies the deployment's settings: the transport, the sender and the base of every link. The web server calls
     * this once, while it is constructed, from the `notifications` section of its configuration and `publicUrl`.
     * <br/>
     * A transport that cannot work is reported and switched off rather than half-configured: `cloudflare` without a
     * relay URL or a sender would queue notices it can never send.
     *
     * @method
     * @param {TiNotificationSettings} [settings]
     * @returns {NotificationService} this
     * @public
     */
    configure( settings = {} ) {
        const transport = String( settings.transport || TRANSPORT_OFF ).trim().toLowerCase();
        this.#sender = isAddress( settings.sender ) ? settings.sender : null;
        this.#senderName = ( typeof settings.senderName === "string" && settings.senderName.trim() !== "" ) ? settings.senderName.trim() : null;
        this.#replyTo = isAddress( settings.replyTo ) ? settings.replyTo : null;
        this.#publicUrl = this.#resolvePublicUrl( settings.publicUrl );
        const days = Number( settings.retentionDays );
        this.#retentionSeconds = ( Number.isInteger( days ) && days > 0 ) ? days * 86400 : DEFAULT_RETENTION_DAYS * 86400;

        if ( settings.sender && this.#sender === null ) {
            logger.log( "Notifications: the configured sender is not a single e-mail address and was ignored.", logger.logSeverity.WARNING );
        }
        if ( transport === TRANSPORT_OFF ) {
            this.#transport = null;
        } else if ( transport === TRANSPORT_LOG ) {
            this.#transport = transports.createLogTransport();
        } else if ( transport === TRANSPORT_CLOUDFLARE ) {
            if ( this.#sender === null ) {
                logger.log( "Notifications: transport 'cloudflare' needs a sender (TI_WEB_NOTIFY_SENDER); notifications are off.", logger.logSeverity.WARNING );
                this.#transport = null;
            } else {
                try {
                    this.#transport = transports.createRelayTransport( settings.relayUrl );
                } catch {
                    logger.log( "Notifications: transport 'cloudflare' needs an http(s) relay URL (TI_WEB_NOTIFY_RELAY_URL); notifications are off.", logger.logSeverity.WARNING );
                    this.#transport = null;
                }
            }
        } else {
            logger.log( `Notifications: unknown transport '${ transport }'; notifications are off.`, logger.logSeverity.WARNING );
            this.#transport = null;
        }
        if ( this.#transport !== null && this.#publicUrl === null ) {
            logger.log( "Notifications: no public URL (TI_WEB_PUBLIC_URL) is set, so notices go without a link to the application.", logger.logSeverity.WARNING );
        }
        return this;
    }

    /**
     * Replaces the transport with an application's own, such as one for SMTP or Microsoft Graph, which the framework
     * does not depend on. `null` switches sending off. Called after the server has started, it wins over the
     * deployment's `TI_WEB_NOTIFY_TRANSPORT`.
     *
     * @method
     * @param {TiMailTransport|null} transport
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If the transport has no `send` function.
     * @public
     */
    setTransport( transport ) {
        if ( transport !== null && ( !transport || typeof transport.send !== "function" ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "notification-transport-without-send" } );
        }
        this.#transport = transport;
        return this;
    }

    /**
     * Whether notices are sent at all: a transport is configured. With none, {@link NotificationService#emit} and
     * {@link NotificationService#notify} queue nothing, so switching one on later does not release a backlog of
     * notices that went stale while it was off.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isEnabled() {
        return this.#transport !== null;
    }

    /**
     * The deployment's public base URL, without a trailing slash, or `null` when none is set: then a notice goes
     * without a link.
     *
     * @property
     * @returns {string|null}
     * @public
     */
    get publicUrl() {
        return this.#publicUrl;
    }

    /**
     * The name the transport gives itself, such as `log` or `cloudflare`, or `null` with none or a transport without
     * one. `log` delivers nothing, which a feature that cannot work without mail needs to know.
     *
     * @property
     * @returns {string|null}
     * @public
     */
    get transportName() {
        return ( this.#transport && typeof this.#transport.name === "string" ) ? this.#transport.name : null;
    }

    /**
     * Registers a notice an application sends. Registered at start-up, like a configuration document.
     *
     * <br/>
     * `placeholders` and `labels` are what an editor needs: the names the subject and the text may use, and the other
     * labels `format` reads, each with the names it may use. Declaring them makes those texts editable through the
     * `notifications` document, and the validator refuses an edit using a name the notice does not offer.
     *
     * @method
     * @param {string} kind The notice's name, which rules refer to.
     * @param {TiNoticeDefinition} definition
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a missing name or label key, a link, format or attachments that is not a function, or placeholders or labels that are not lists of names.
     * @public
     */
    registerNotice( kind, definition ) {
        const { subject, text, link, format, placeholders, labels, attachments } = definition || {};
        const labelsValid = labels === undefined || ( labels !== null && typeof labels === "object" && !Array.isArray( labels )
            && Object.keys( labels ).every( ( key ) => key !== "" && isNameList( labels[ key ] ) ) );
        if ( typeof kind !== "string" || kind.trim() === "" || typeof subject !== "string" || subject === "" || typeof text !== "string" || text === ""
            || ( link !== undefined && typeof link !== "function" ) || ( format !== undefined && typeof format !== "function" )
            || ( attachments !== undefined && typeof attachments !== "function" )
            || ( placeholders !== undefined && !isNameList( placeholders ) ) || !labelsValid ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-notice-registration", kind: kind } );
        }
        const ownLabels = {};
        Object.keys( labels || {} ).forEach( ( key ) => {
            ownLabels[ key ] = Object.freeze( [ ...new Set( labels[ key ] ) ] );
        } );
        this.#notices.set( kind, Object.freeze( {
            subject: subject,
            text: text,
            link: link,
            format: format,
            attachments: attachments,
            placeholders: ( placeholders !== undefined ) ? Object.freeze( [ ...new Set( placeholders ) ] ) : null,
            labels: Object.freeze( ownLabels )
        } ) );
        return this;
    }

    /**
     * Sets how a notice looks as HTML: the application's name as a wordmark at the top, its colours, and the label keys
     * of the button that opens the link and of the footer. `null` returns to the plain layout. The button and the
     * footer are editable like a notice's texts.
     *
     * @method
     * @param {TiNoticeLayout|null} layout
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a colour that is not `#rgb` or `#rrggbb`, a font that is not a plain family list, or a name or label key that is not a string.
     * @public
     */
    setLayout( layout ) {
        if ( layout === null ) {
            this.#layout = null;
            return this;
        }
        const { name, colors, font, action, footer } = layout || {};
        const invalid = ( !layout || typeof layout !== "object" )
            || ( name !== undefined && ( typeof name !== "string" || name.trim() === "" ) )
            || ( font !== undefined && ( typeof font !== "string" || !FONT_PATTERN.test( font ) ) )
            || ( action !== undefined && ( typeof action !== "string" || action === "" ) )
            || ( footer !== undefined && ( typeof footer !== "string" || footer === "" ) )
            || ( colors !== undefined && ( !colors || typeof colors !== "object"
                || Object.keys( colors ).some( ( role ) => !Object.prototype.hasOwnProperty.call( DEFAULT_COLORS, role ) || typeof colors[ role ] !== "string" || !COLOR_PATTERN.test( colors[ role ] ) ) ) );
        if ( invalid ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-notice-layout" } );
        }
        this.#layout = Object.freeze( {
            name: ( name !== undefined ) ? name.trim() : null,
            colors: Object.freeze( Object.assign( {}, colors || {} ) ),
            font: font || null,
            action: action || null,
            footer: footer || null
        } );
        return this;
    }

    /**
     * Every text an editor may change: each notice's subject and text, the labels its `format` reads, and the layout's
     * button and footer. A key read in more than one place is listed once, naming every notice that reads it, and
     * held to the strictest of its uses: one line if any use takes one, and only the names every use offers.
     *
     * @method
     * @returns {TiEditableNoticeText[]} In registration order: per notice its subject, its text and its labels; then the layout's.
     * @public
     */
    editableTexts() {
        const byKey = new Map();
        const add = ( key, part, notice, placeholders ) => {
            const entry = byKey.get( key );
            if ( !entry ) {
                byKey.set( key, { key: key, part: part, notices: notice ? [ notice ] : [], placeholders: placeholders ? [ ...placeholders ] : null, multiline: TEXT_PARTS[ part ] } );
                return;
            }
            if ( notice && !entry.notices.includes( notice ) ) {
                entry.notices.push( notice );
            }
            // One edit is read in every place the key is, so it is held to the strictest of them. Keeping the first
            // registration's rule let a line break through to a subject sharing a text's key (a new header to a
            // transport that writes headers), and a union of the names let one notice's name reach another's reader
            // as its braces. A use that declared no names restricts nothing.
            entry.multiline = entry.multiline && TEXT_PARTS[ part ];
            if ( placeholders ) {
                entry.placeholders = ( entry.placeholders === null ) ? [ ...placeholders ] : entry.placeholders.filter( ( name ) => placeholders.includes( name ) );
            }
        };
        this.#notices.forEach( ( notice, kind ) => {
            add( notice.subject, "subject", kind, notice.placeholders );
            add( notice.text, "text", kind, notice.placeholders );
            Object.keys( notice.labels ).forEach( ( key ) => add( key, "label", kind, notice.labels[ key ] ) );
        } );
        if ( this.#layout && this.#layout.action ) {
            add( this.#layout.action, "action", null, [] );
        }
        if ( this.#layout && this.#layout.footer ) {
            add( this.#layout.footer, "footer", null, [] );
        }
        return [ ...byKey.values() ];
    }

    /**
     * Registers an event an application raises, with the attributes a rule may filter it by.
     *
     * @method
     * @param {string} name The event's name, such as `task.created`.
     * @param {TiNotificationEventDefinition} [definition]
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a missing name or an attribute that is not a non-empty string.
     * @public
     */
    registerEvent( name, definition = {} ) {
        const attributes = ( definition && definition.attributes !== undefined ) ? definition.attributes : [];
        if ( typeof name !== "string" || name.trim() === "" || !Array.isArray( attributes ) || attributes.some( ( attribute ) => typeof attribute !== "string" || attribute === "" ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-event-registration", name: name } );
        }
        this.#events.set( name, Object.freeze( { attributes: Object.freeze( [ ...new Set( attributes ) ] ) } ) );
        return this;
    }

    /**
     * Builds the definition of the `notifications` configuration document, for the application to register through
     * `registerConfigDocument( "notifications", … )` and to seed. The framework owns the schema and the validator; the
     * application supplies the default rules and its own editor metadata (a file path, labels, a group).
     * <br/>
     * The validator refuses a rule naming an event or a notice that is not registered, or filtering on an attribute
     * its event does not declare, and two rules with one ID. It reads the registrations when it runs, so the document
     * may be registered before the events and notices are.
     * <br/>
     * The document may also hold **edited texts** (`texts`) and the **application's options** (`options`):
     * - `texts` holds only what an administrator changed, by label key and language; every other text comes from the
     *   shipped labels, so a release that rewords a text reaches a deployment that never edited it. The validator
     *   refuses a key {@link NotificationService#editableTexts} does not list, a language the shipped label lacks, an
     *   empty text, a line break where the part takes one line, and a placeholder the text does not offer.
     * - `options` is the application's, validated by the schema it passes here, and read by
     *   {@link NotificationService#getOptions} over the defaults it gives.
     * - `sendEveryHours` is how often a job tick sends what the outbox holds, one of {@link SEND_INTERVALS}, read by
     *   {@link NotificationService#getSendEveryHours}; every hour when the document names none.
     *
     * @method
     * @param {TiNotificationsDocument} [defaults] `{ enabled: true, rules: [] }` unless stated.
     * @param {Object} [metadata] Merged into the document's editor metadata.
     * @param {Object} [extensions]
     * @param {Object} [extensions.options] The JSON Schema of `options`. Without it the document holds no options.
     * @returns {{schema: Object, validators: Array<function>, defaultValue: TiNotificationsDocument, metadata: Object}}
     * @public
     */
    configDocument( defaults = {}, metadata = {}, extensions = {} ) {
        const optionsSchema = ( extensions && extensions.options && typeof extensions.options === "object" ) ? extensions.options : null;
        const defaultValue = {
            enabled: ( defaults && typeof defaults.enabled === "boolean" ) ? defaults.enabled : true,
            rules: ( defaults && Array.isArray( defaults.rules ) ) ? JSON.parse( JSON.stringify( defaults.rules ) ) : []
        };
        if ( defaults && defaults.texts && typeof defaults.texts === "object" ) {
            defaultValue.texts = JSON.parse( JSON.stringify( defaults.texts ) );
        }
        if ( optionsSchema && defaults && defaults.options && typeof defaults.options === "object" ) {
            defaultValue.options = JSON.parse( JSON.stringify( defaults.options ) );
        }
        if ( defaults && SEND_INTERVALS.includes( defaults.sendEveryHours ) ) {
            defaultValue.sendEveryHours = defaults.sendEveryHours;
        }
        this.#optionDefaults = tools.deepFreeze( JSON.parse( JSON.stringify( defaultValue.options || {} ) ) );
        return {
            schema: NotificationService.documentSchema( optionsSchema ),
            validators: [ ( value ) => this.#validateDocument( value ) ],
            defaultValue: defaultValue,
            metadata: Object.assign( {}, metadata )
        };
    }

    /**
     * The application's options: the stored document's over the defaults given to
     * {@link NotificationService#configDocument}, one key at a time, so an option a release adds has its default on a
     * deployment whose document predates it.
     *
     * @method
     * @returns {Promise<Object>}
     * @public
     */
    getOptions() {
        return Promise.resolve().then( () => configService.instance.getCurrent( CONFIG_KEY ) ).then( ( envelope ) => {
            const stored = ( envelope && envelope.value && envelope.value.options && typeof envelope.value.options === "object" ) ? envelope.value.options : {};
            return Object.assign( {}, this.#optionDefaults, stored );
        } );
    }

    /**
     * How often a job tick sends what the outbox holds, in hours: the stored document's `sendEveryHours`, or
     * {@link DEFAULT_SEND_EVERY_HOURS} when it names none or cannot be read. Read on every tick, so an edit counts from
     * the next one.
     *
     * @method
     * @returns {Promise<number>} One of {@link SEND_INTERVALS}.
     * @public
     */
    getSendEveryHours() {
        return Promise.resolve().then( () => configService.instance.getCurrent( CONFIG_KEY ) ).then( ( envelope ) => {
            const stored = ( envelope && envelope.value ) ? envelope.value.sendEveryHours : undefined;
            return SEND_INTERVALS.includes( stored ) ? stored : DEFAULT_SEND_EVERY_HOURS;
        }, () => DEFAULT_SEND_EVERY_HOURS );
    }

    /**
     * Raises an event: every enabled rule for it whose filter the event's data passes queues its notice for the
     * recipient. The notice's key is the rule's notice joined to the event's key, so two rules for one notice send it
     * once.
     * <br/>
     * Call it after the write that made the event happen has settled, and never while holding a write lock: it reads the
     * rules and the outbox, and a lock held across that is a lock held across the store.
     *
     * @method
     * @param {string} name A registered event.
     * @param {Object} occurrence
     * @param {string} occurrence.key What makes this occurrence unique, such as a task and its deadline.
     * @param {TiNotificationRecipient} occurrence.recipient
     * @param {Object} [occurrence.data] The event's attributes and the notice's values.
     * @returns {Promise<number>} The number of notices queued; 0 when every one was already queued or sent.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For an unregistered event, a missing key or a malformed recipient.
     * @public
     */
    emit( name, occurrence ) {
        const event = this.#events.get( name );
        if ( !event ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "unknown-notification-event", name: name } ) );
        }
        const { key, recipient, data = {} } = occurrence || {};
        const invalid = this.#invalidOccurrence( key, recipient );
        if ( invalid ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: invalid, name: name } ) );
        }
        if ( this.#transport === null ) {
            return Promise.resolve( 0 );
        }
        return Promise.resolve().then( () => configService.instance.getCurrent( CONFIG_KEY ) ).then( ( envelope ) => {
            const document = ( envelope && envelope.value ) ? envelope.value : null;
            if ( !document || document.enabled !== true || !Array.isArray( document.rules ) ) {
                return 0;
            }
            const notices = [];
            document.rules.forEach( ( rule ) => {
                if ( !rule || rule.event !== name || rule.enabled === false || !NotificationService.passes( rule.when, data ) ) {
                    return;
                }
                if ( !this.#notices.has( rule.notice ) ) {
                    // A rule stored before a release removed its notice. The validator refuses it on the next save;
                    // until then it is inert rather than a failure for the write that raised the event.
                    logger.log( `Notifications: rule '${ rule.id }' names notice '${ rule.notice }', which is not registered; skipped.`, logger.logSeverity.WARNING );
                    return;
                }
                if ( !notices.includes( rule.notice ) ) {
                    notices.push( rule.notice );
                }
            } );
            // One after another: each is a read-check-write on the store, and nothing is gained by racing them.
            return notices.reduce( ( chain, kind ) => chain.then( ( queued ) => this.#queue( kind, kind + ":" + key, recipient, data ).then( ( added ) => queued + ( added ? 1 : 0 ) ) ), Promise.resolve( 0 ) );
        } );
    }

    /**
     * Queues one notice for one person, unless the same key was queued or sent before. Resolves once the notice is in
     * the outbox, not once it is delivered, so a request handler never waits on mail. It never rejects for a delivery
     * failure, only for a malformed call.
     *
     * @method
     * @param {Object} notice
     * @param {string} notice.kind A registered notice.
     * @param {string} notice.key What makes this notice unique for this person.
     * @param {TiNotificationRecipient} notice.recipient
     * @param {Object} [notice.data] The values the notice's texts and link read.
     * @returns {Promise<boolean>} `true` if queued; `false` if already queued or sent, or sending is off.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For an unknown kind, a missing key or a malformed recipient.
     * @public
     */
    notify( notice ) {
        const { kind, key, recipient, data = {} } = notice || {};
        if ( !this.#notices.has( kind ) ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "unknown-notice", kind: kind } ) );
        }
        const invalid = this.#invalidOccurrence( key, recipient );
        if ( invalid ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: invalid, kind: kind } ) );
        }
        if ( this.#transport === null ) {
            return Promise.resolve( false );
        }
        return this.#queue( kind, key, recipient, data );
    }

    /**
     * Sends what the outbox holds, one notice at a time, up to {@link DRAIN_LIMIT} a pass. One pass runs at a time: a
     * call made during a pass is answered when a pass that started after it has finished, so whatever was queued before
     * the call has been tried.
     * <br/>
     * A transient failure is retried with backoff, up to {@link MAX_ATTEMPTS} attempts; a permanent one is recorded and
     * not retried. A daily limit stops the pass until the next UTC day, and a rate limit for a minute; neither counts
     * an attempt.
     *
     * @method
     * @returns {Promise<TiNotificationDrainReport>}
     * @public
     */
    drain() {
        if ( this.#draining !== null ) {
            this.#drainRequested = true;
            return this.#draining;
        }
        // Started inside a promise: a store that throws rather than rejects must not throw out of a pass started from
        // `setImmediate` or a timer, where nothing catches it and the process exits.
        this.#draining = Promise.resolve().then( () => this.#drainLoop() ).finally( () => {
            this.#draining = null;
        } );
        return this.#draining;
    }

    /**
     * A job tick's pass over the outbox: {@link NotificationService#drain}, once in each interval of
     * `sendEveryHours` hours. A tick inside an interval already passed sends nothing.
     * <br/>
     * The interval bounds how long a waiting notice waits when nothing else wakes the dispatcher: a retry that falls due
     * after the process has slept, such as a container a Worker wakes only for requests and ticks, or what a pass left
     * at its limit. It is not a cap on sending: a notice queued by a write is sent straight after it, and while the
     * process runs the dispatcher's own timer retries on the backoff (1, 5, 15 and 60 minutes). Holding those to the
     * interval would only make mail later.
     * <br/>
     * The check and the record are one step under a lock, so two ticks that overlap pass once. The interval is recorded
     * when its pass has finished. A store that cannot be read is not a reason to hold mail back, so the pass runs; one
     * that cannot be written loses only the record, and the next tick passes again.
     *
     * @method
     * @param {Date} [now] The tick's moment; the current time unless stated.
     * @returns {Promise<TiNotificationDrainReport|null>} The pass's report, or `null` when this interval had its pass.
     * @public
     */
    sendDue( now = new Date( this.#now() ) ) {
        const moment = new Date( now.getTime() );
        return this.#lock.exclusively( LOCK_SCHEDULED_PASS, () => Promise.all( [
            this.getSendEveryHours(),
            Promise.resolve().then( () => cache.instance.getValue( KEY_LAST_PASS ) ).then( ( last ) => ( last && typeof last.at === "string" ) ? Date.parse( last.at ) : NaN, () => NaN )
        ] ).then( ( [ hours, lastPass ] ) => {
            if ( Number.isFinite( lastPass ) && lastPass >= NotificationService.intervalStart( hours, moment ) ) {
                return null;
            }
            return this.drain().then( ( report ) => Promise.resolve().then( () => cache.instance.setValue( KEY_LAST_PASS, { at: moment.toISOString() } ) ).then( () => report, ( error ) => {
                logger.log( "The scheduled notification pass could not be recorded; the next tick passes again.", logger.logSeverity.WARNING, loggableError( error ) );
                return report;
            } ) );
        } ) );
    }

    /**
     * Removes every queued notice and ledger entry of one person, for an application's erasure path. A notice being
     * sent at that moment is finished first, so its ledger entry is removed too rather than written after the erasure.
     *
     * @method
     * @param {string} recipientID
     * @returns {Promise<number>} How many entries were removed.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For a missing ID.
     * @public
     */
    forget( recipientID ) {
        if ( ( typeof recipientID !== "string" && typeof recipientID !== "number" ) || String( recipientID ) === "" ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-recipient-id" } ) );
        }
        const prefix = digestOf( String( recipientID ) ).slice( 0, 16 ) + ":";
        return Promise.resolve().then( () => Promise.all( [
            cache.instance.matchKeys( KEY_PENDING + prefix + "*" ),
            cache.instance.matchKeys( KEY_DONE + prefix + "*" )
        ] ) ).then( ( [ pending, done ] ) => {
            const suffixes = [ ...new Set( [ ...( pending || [] ).map( ( key ) => key.slice( KEY_PENDING.length ) ), ...( done || [] ).map( ( key ) => key.slice( KEY_DONE.length ) ) ] ) ];
            return suffixes.reduce( ( chain, suffix ) => chain.then( ( removed ) => this.#lock.exclusively( suffix, () => {
                this.#retryHints.delete( suffix );
                return tools.whenAllSettled( [ cache.instance.deleteValue( KEY_PENDING + suffix ), cache.instance.deleteValue( KEY_DONE + suffix ) ] );
            } ).then( ( results ) => removed + results.filter( ( result ) => tools.toBool( result ) ).length ) ), Promise.resolve( 0 ) );
        } );
    }

    /**
     * Renders a notice for one person in their language, else the deployment's: the subject, the text with the link
     * after it, and the same text as HTML in the layout {@link NotificationService#setLayout} set. The HTML has no
     * remote image, no tracking pixel and no rewritten link: a notice points to the application, it does not report
     * on whoever opens it.
     * <br/>
     * Each text is the edited one when `texts` holds it, else the shipped label. The dispatcher passes the document's
     * edits; an editor passes its unsaved ones to preview them exactly as they would be sent.
     * <br/>
     * A notice that declares `attachments` also renders its files, encoded for the message; one that returns none has
     * no `attachments` at all, as before.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient|{language?: string}} recipient Only the language is read.
     * @param {Object} [data]
     * @param {TiNoticeTexts} [texts] Edited texts, by label key and language.
     * @returns {TiRenderedNotice}
     * @throws {Error} With `code` `E_NOTICE_UNKNOWN`, `E_NOTICE_LABEL_MISSING` or `E_NOTICE_ATTACHMENT_INVALID`, and `transient` false.
     * @public
     */
    render( kind, recipient, data = {}, texts = {} ) {
        const notice = this.#notices.get( kind );
        if ( !notice ) {
            throw transports.transportError( "E_NOTICE_UNKNOWN", false, kind );
        }
        const language = ( recipient && recipient.language ) ? recipient.language : localization.getSystemLanguage();
        const label = ( key ) => NotificationService.#label( key, language, texts );
        const values = notice.format ? ( notice.format( data || {}, language, label ) || {} ) : ( data || {} );
        // A line break in a subject is a new header to a transport that writes headers.
        const subject = fillTemplate( label( notice.subject ), values ).replace( /[\r\n]+/g, " " ).trim();
        const body = fillTemplate( label( notice.text ), values ).replace( /\r\n?/g, "\n" ).trim();
        const url = notice.link ? this.#linkTo( notice.link( data || {} ) ) : null;
        // The layout's own texts are optional: a missing one leaves its part out rather than failing every notice.
        const optional = ( key ) => {
            if ( !key ) {
                return null;
            }
            try {
                return label( key ).replace( /\r\n?/g, "\n" ).trim() || null;
            } catch {
                return null;
            }
        };
        const action = url ? optional( this.#layout && this.#layout.action ) : null;
        const footer = optional( this.#layout && this.#layout.footer );
        const html = layoutHTML( {
            language: language,
            subject: subject,
            paragraphs: body.split( /\n{2,}/ ),
            url: url,
            action: action,
            footer: footer,
            layout: this.#layout
        } );
        let text = body;
        if ( url ) {
            text += "\n\n" + ( action ? action.replace( /\n+/g, " " ) + ": " : "" ) + url;
        }
        if ( footer ) {
            // The conventional signature delimiter, which mail clients grey out or fold away.
            text += "\n\n-- \n" + footer;
        }
        const rendered = { subject: subject, text: text, html: html };
        // Built from the notice's data alone, like the texts, so a retry attaches the same file.
        const attachments = notice.attachments ? encodeAttachments( notice.attachments( data || {}, language, label ), kind ) : [];
        if ( attachments.length > 0 ) {
            rendered.attachments = attachments;
        }
        return rendered;
    }

    /**
     * Sends one notice straight away through the transport, past the outbox and the ledger: an editor's "send me a
     * test". Nothing records it, so it can be sent again, and it never stops the real notice of the same key. It
     * renders with `texts` when given, else with the document's edits.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient} recipient
     * @param {Object} [data]
     * @param {TiNoticeTexts} [texts] Edited texts to try before saving them.
     * @returns {Promise<{messageId: string|null}>}
     * @throws {Error} (as a rejection) With `code` `E_NOTICE_TRANSPORT_OFF` while sending is off, `E_NOTICE_UNKNOWN` or `E_NOTICE_LABEL_MISSING`, or the transport's own code.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For a malformed recipient.
     * @public
     */
    sendTest( kind, recipient, data = {}, texts ) {
        const edits = ( texts && typeof texts === "object" ) ? () => Promise.resolve( texts ) : () => this.#storedTexts();
        return this.#sendAtOnce( "Test notice", kind, recipient, data, edits );
    }

    /**
     * Sends one notice straight away through the transport, past the outbox and the ledger, and makes one attempt: a
     * notice that is useless once late, such as a sign-in link that expires in minutes. Nothing records it, nothing
     * retries it, and the caller learns at once whether it went. It renders with the document's edited texts, or with
     * the shipped labels alone when the document cannot be read, since a notice that must go now should not wait on it.
     * <br/>
     * The data is not stored anywhere, so it may carry what the outbox must not hold, such as a secret for the link.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient} recipient
     * @param {Object} [data]
     * @returns {Promise<{messageId: string|null}>}
     * @throws {Error} (as a rejection) With `code` `E_NOTICE_TRANSPORT_OFF` while sending is off, `E_NOTICE_UNKNOWN` or `E_NOTICE_LABEL_MISSING`, or the transport's own code.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For a malformed recipient.
     * @public
     */
    sendNow( kind, recipient, data = {} ) {
        const edits = () => this.#storedTexts().catch( ( error ) => {
            logger.log( `Notice '${ kind }': the edited texts could not be read, so it is sent with the shipped ones.`, logger.logSeverity.WARNING, loggableError( error ) );
            return {};
        } );
        return this.#sendAtOnce( "Notice", kind, recipient, data, edits );
    }

    /* Static interface */

    /**
     * Whether an event's data passes a rule's filter. Every attribute the filter names must hold one of its values; an
     * empty or absent filter passes everything, and an attribute with an empty list of values passes nothing.
     *
     * @method
     * @param {Object<string, string[]>} [when]
     * @param {Object} [data]
     * @returns {boolean}
     * @public
     */
    static passes( when, data = {} ) {
        if ( !when || typeof when !== "object" ) {
            return true;
        }
        return Object.keys( when ).every( ( attribute ) => {
            const allowed = Array.isArray( when[ attribute ] ) ? when[ attribute ] : [];
            const value = ( data && data[ attribute ] !== undefined && data[ attribute ] !== null ) ? String( data[ attribute ] ) : null;
            return value !== null && allowed.some( ( candidate ) => String( candidate ) === value );
        } );
    }

    /**
     * The moment the interval of `hours` hours holding `now` began, in milliseconds: intervals count from midnight on
     * the deployment's clock (core's `time-zone`, CA-550), so with 6 they begin at 00:00, 06:00, 12:00 and 18:00 where
     * the organization is, and with 24 a day's notices go at its midnight. They used to count from midnight UTC, which
     * sent a daily summary at 02:00 or 03:00 in Sofia.
     * <br/>
     * They treat a daylight-saving night as the jobs do. An interval of one hour is every real hour, the repeated one
     * included, as an hourly job's period is (core's `hourStartIn`): counted from the first showing, the second
     * repeated hour had no pass (the review pass). A longer interval begins at its boundary's first showing, as a daily
     * job does, so it is never cut in two. A provider's daily limit is not one of these: it is the provider's day, and
     * stays on UTC.
     *
     * @method
     * @param {number} hours One of {@link SEND_INTERVALS}.
     * @param {Date} now
     * @param {string} [zone] The deployment's unless stated.
     * @returns {number}
     * @public
     */
    static intervalStart( hours, now, zone = timeZone.getTimeZone() ) {
        if ( hours === 1 ) {
            return timeZone.hourStartIn( now.getTime(), zone );
        }
        const clock = timeZone.wallClockIn( now.getTime(), zone );
        const hour = Math.floor( Number( clock.slice( 11, 13 ) ) / hours ) * hours;
        return timeZone.instantOf( clock.slice( 0, 10 ), `${ String( hour ).padStart( 2, "0" ) }:00`, zone );
    }

    /**
     * The JSON Schema of the `notifications` document.
     *
     * @method
     * @param {Object|null} [optionsSchema] The application's schema of `options`; without it the document holds none.
     * @returns {Object}
     * @public
     */
    static documentSchema( optionsSchema = null ) {
        const properties = {
            enabled: { type: "boolean" },
            rules: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: [ "id", "event", "notice" ],
                    properties: {
                        id: { type: "string", minLength: 1 },
                        event: { type: "string", minLength: 1 },
                        notice: { type: "string", minLength: 1 },
                        enabled: { type: "boolean" },
                        when: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } }
                    }
                }
            },
            texts: {
                type: "object",
                additionalProperties: { type: "object", additionalProperties: { type: "string" } }
            },
            sendEveryHours: { type: "integer", enum: [ ...SEND_INTERVALS ] }
        };
        if ( optionsSchema && typeof optionsSchema === "object" ) {
            properties.options = optionsSchema;
        }
        return {
            type: "object",
            additionalProperties: false,
            required: [ "enabled", "rules" ],
            properties: properties
        };
    }

    /**
     * Looks a text up in a language, then in the deployment's: in each, the edited text first, then the shipped label.
     * A notice with a missing text is not sent with the catalogue's not-found placeholder in it.
     *
     * @method
     * @param {string} key
     * @param {string} language
     * @param {TiNoticeTexts} [texts]
     * @returns {string}
     * @throws {Error} With `code` `E_NOTICE_LABEL_MISSING`.
     */
    static #label( key, language, texts = {} ) {
        const edited = ( lang ) => {
            const entry = ( texts && Object.prototype.hasOwnProperty.call( texts, key ) ) ? texts[ key ] : null;
            const value = ( entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call( entry, lang ) ) ? entry[ lang ] : null;
            return ( typeof value === "string" && value.trim() !== "" ) ? value : null;
        };
        const system = localization.getSystemLanguage();
        for ( const lang of ( language === system ) ? [ language ] : [ language, system ] ) {
            const value = edited( lang ) || localization.getLabel( key, lang, null );
            if ( typeof value === "string" ) {
                return value;
            }
        }
        throw transports.transportError( "E_NOTICE_LABEL_MISSING", false, key );
    }

    /* Private interface */

    /**
     * @method
     * @param {*} key
     * @param {*} recipient
     * @returns {string|null} Why the occurrence is malformed, or `null`.
     */
    #invalidOccurrence( key, recipient ) {
        if ( typeof key !== "string" || key === "" ) {
            return "missing-notice-key";
        }
        if ( !recipient || ( typeof recipient.id !== "string" && typeof recipient.id !== "number" ) || String( recipient.id ) === "" ) {
            return "missing-recipient-id";
        }
        // The ID is what the logs and the ledger name, so it must never be an address.
        if ( String( recipient.id ).includes( "@" ) ) {
            return "recipient-id-is-an-address";
        }
        if ( !isAddress( recipient.email ) ) {
            return "invalid-recipient-address";
        }
        return null;
    }

    /**
     * Writes a pending entry unless one, or a ledger entry, already exists for the key, all under the key's lock: two
     * calls that both read "absent" would otherwise both queue it.
     *
     * @method
     * @param {string} kind
     * @param {string} key
     * @param {TiNotificationRecipient} recipient
     * @param {Object} data
     * @returns {Promise<boolean>}
     */
    #queue( kind, key, recipient, data ) {
        const id = String( recipient.id );
        const suffix = suffixOf( id, key );
        return this.#lock.exclusively( suffix, () => {
            return Promise.all( [ cache.instance.getValue( KEY_PENDING + suffix ), cache.instance.getValue( KEY_DONE + suffix ) ] ).then( ( [ pending, done ] ) => {
                if ( pending || done ) {
                    return false;
                }
                const entry = {
                    kind: kind,
                    recipient: {
                        id: id,
                        email: recipient.email,
                        name: ( typeof recipient.name === "string" ) ? recipient.name : undefined,
                        language: ( typeof recipient.language === "string" ) ? recipient.language : undefined
                    },
                    data: data,
                    attempts: 0,
                    queuedAt: this.#now()
                };
                return cache.instance.setValue( KEY_PENDING + suffix, entry ).then( () => true );
            } );
        } ).then( ( queued ) => {
            if ( queued ) {
                logger.log( `Notification '${ kind }' for recipient '${ id }' queued.`, logger.logSeverity.DEBUG );
                if ( this.#drainOnNotify ) {
                    setImmediate( () => this.#drainInBackground() );
                }
            }
            return queued;
        } );
    }

    /**
     * Starts a pass whose outcome nobody awaits; a failure is logged, never thrown into a timer.
     *
     * @method
     */
    #drainInBackground() {
        this.drain().catch( ( error ) => {
            logger.log( "Notifications: a dispatcher pass failed.", logger.logSeverity.ERROR, loggableError( error ) );
        } );
    }

    /**
     * Runs passes until no call has asked for another.
     *
     * @method
     * @returns {Promise<TiNotificationDrainReport>}
     */
    #drainLoop() {
        this.#drainRequested = false;
        return this.#drainPass().then( ( report ) => {
            if ( this.#drainRequested && report.stopped === null ) {
                return this.#drainLoop().then( ( next ) => ( {
                    sent: report.sent + next.sent,
                    failed: report.failed + next.failed,
                    retrying: next.retrying,
                    stopped: next.stopped
                } ) );
            }
            return report;
        } );
    }

    /**
     * One pass over the outbox.
     *
     * @method
     * @returns {Promise<TiNotificationDrainReport>}
     */
    #drainPass() {
        const report = { sent: 0, failed: 0, retrying: 0, stopped: null };
        if ( this.#transport === null ) {
            return Promise.resolve( report );
        }
        const now = this.#now();
        if ( this.#pausedUntil > now ) {
            report.stopped = this.#pausedCode;
            return Promise.resolve( report );
        }
        let nextRetry = Infinity;
        let texts = {};
        // The edited texts are read once a pass, not once a notice: a pass may send a thousand. An edit saved during a
        // pass reaches the next one, and every notice still queued is rendered then, so an edit reaches mail already
        // queued before it.
        return this.#storedTexts().then( ( stored ) => {
            texts = stored;
            return cache.instance.matchKeys( KEY_PENDING + "*" );
        } ).then( ( keys ) => {
            const suffixes = ( keys || [] ).map( ( key ) => key.slice( KEY_PENDING.length ) );
            // A hint for a notice no longer queued goes, so the hints never outgrow the outbox.
            const queued = new Set( suffixes );
            [ ...this.#retryHints.keys() ].filter( ( suffix ) => !queued.has( suffix ) ).forEach( ( suffix ) => this.#retryHints.delete( suffix ) );
            let processed = 0;
            return suffixes.reduce( ( chain, suffix ) => chain.then( () => {
                if ( report.stopped !== null || processed >= DRAIN_LIMIT ) {
                    return undefined;
                }
                const dueAt = this.#retryHints.get( suffix );
                if ( dueAt > now ) {
                    report.retrying += 1;
                    nextRetry = Math.min( nextRetry, dueAt );
                    return undefined;
                }
                return this.#dispatch( suffix, now, texts ).then( ( outcome ) => {
                    if ( outcome.status === "retrying" ) {
                        this.#retryHints.set( suffix, outcome.retryAt );
                    } else {
                        this.#retryHints.delete( suffix );
                    }
                    if ( outcome.status === "sent" || outcome.status === "failed" ) {
                        processed += 1;
                        report[ outcome.status ] += 1;
                    } else if ( outcome.status === "retrying" ) {
                        // A notice that failed in this pass counts toward the limit; one still waiting does not.
                        processed += ( outcome.attempted === true ) ? 1 : 0;
                        report.retrying += 1;
                        nextRetry = Math.min( nextRetry, outcome.retryAt );
                    } else if ( outcome.status === "stopped" ) {
                        report.stopped = outcome.code;
                    }
                }, ( error ) => {
                    // The store failed around one notice. It stays queued, and the next pass tries it again.
                    logger.log( "Notifications: a queued notice could not be processed; it stays queued.", logger.logSeverity.ERROR, loggableError( error ) );
                } );
            } ), Promise.resolve() );
        } ).then( () => {
            const wakeAt = ( this.#pausedUntil > now ) ? this.#pausedUntil : nextRetry;
            this.#wakeAt( wakeAt );
            if ( report.sent + report.failed > 0 || report.stopped !== null ) {
                logger.log( `Notifications: ${ report.sent } sent, ${ report.failed } failed, ${ report.retrying } waiting to retry${ report.stopped ? `, stopped by '${ report.stopped }'` : "" }.`, logger.logSeverity.INFO );
            }
            return report;
        } );
    }

    /**
     * Sends one queued notice, under its key's lock so that {@link NotificationService#forget} cannot remove it between
     * the send and the ledger entry.
     *
     * @method
     * @param {string} suffix
     * @param {number} now
     * @param {TiNoticeTexts} texts The document's edited texts.
     * @returns {Promise<{status: string, retryAt?: number, code?: string}>}
     */
    #dispatch( suffix, now, texts ) {
        return this.#lock.exclusively( suffix, () => cache.instance.getValue( KEY_PENDING + suffix ).then( ( pending ) => {
            if ( !pending || typeof pending !== "object" ) {
                return { status: "gone" };
            }
            if ( Number.isFinite( pending.retryAt ) && pending.retryAt > now ) {
                return { status: "retrying", retryAt: pending.retryAt };
            }
            return cache.instance.getValue( KEY_DONE + suffix ).then( ( done ) => {
                if ( done ) {
                    // Sent, and the crash came before the pending entry was removed.
                    return cache.instance.deleteValue( KEY_PENDING + suffix ).then( () => ( { status: "gone" } ) );
                }
                let message;
                try {
                    message = this.#compose( pending, texts );
                } catch ( error ) {
                    return this.#finish( suffix, pending, "failed", { code: ( error && error.code ) ? error.code : "E_NOTICE_RENDER_FAILED" } );
                }
                return Promise.resolve().then( () => this.#transport.send( message ) ).then( ( result ) => {
                    return this.#finish( suffix, pending, "sent", { messageId: ( result && typeof result.messageId === "string" ) ? result.messageId : null } );
                }, ( error ) => this.#failed( suffix, pending, error, now ) );
            } );
        } ) );
    }

    /**
     * Decides what a failed send means for the notice: a pause for everything, a retry, or the end.
     *
     * @method
     * @param {string} suffix
     * @param {Object} pending
     * @param {*} error
     * @param {number} now
     * @returns {Promise<{status: string, retryAt?: number, code?: string, attempted?: boolean}>}
     */
    #failed( suffix, pending, error, now ) {
        const code = ( error && typeof error.code === "string" ) ? error.code : "E_TRANSPORT_FAILED";
        const transient = ( error && typeof error.transient === "boolean" ) ? error.transient : transports.TRANSIENT_CODES.includes( code );
        if ( code === transports.DAILY_LIMIT_CODE || code === "E_RATE_LIMIT_EXCEEDED" ) {
            this.#pausedUntil = ( code === transports.DAILY_LIMIT_CODE ) ? nextUTCMidnight( now ) : now + RATE_LIMIT_PAUSE * 1000;
            this.#pausedCode = code;
            logger.log( `Notifications: the provider answered '${ code }'; sending resumes at ${ new Date( this.#pausedUntil ).toISOString() }.`, logger.logSeverity.WARNING );
            return Promise.resolve( { status: "stopped", code: code } );
        }
        const attempts = ( Number.isInteger( pending.attempts ) ? pending.attempts : 0 ) + 1;
        if ( !transient || attempts >= MAX_ATTEMPTS ) {
            return this.#finish( suffix, pending, "failed", { code: code, attempts: attempts } );
        }
        const retryAt = now + RETRY_BACKOFF[ Math.min( attempts, RETRY_BACKOFF.length ) - 1 ] * 1000;
        logger.log( `Notification '${ pending.kind }' for recipient '${ pending.recipient.id }' failed with '${ code }'; attempt ${ attempts } of ${ MAX_ATTEMPTS }.`, logger.logSeverity.WARNING );
        return cache.instance.setValue( KEY_PENDING + suffix, Object.assign( {}, pending, { attempts: attempts, retryAt: retryAt, lastCode: code } ) ).then( () => ( { status: "retrying", retryAt: retryAt, attempted: true } ) );
    }

    /**
     * Records the outcome in the ledger, then removes the pending entry: in that order, so a crash between the two
     * leaves a notice that is not sent again rather than one that is.
     *
     * @method
     * @param {string} suffix
     * @param {Object} pending
     * @param {"sent"|"failed"} outcome
     * @param {Object} details
     * @returns {Promise<{status: string}>}
     */
    #finish( suffix, pending, outcome, details ) {
        // No address and no rendered text: the ledger names whom by ID, and what by kind.
        const record = Object.assign( { kind: pending.kind, recipientID: pending.recipient.id, outcome: outcome, at: new Date( this.#now() ).toISOString() }, details );
        return cache.instance.setValue( KEY_DONE + suffix, record, this.#retentionSeconds ).then( () => {
            return cache.instance.deleteValue( KEY_PENDING + suffix );
        } ).then( () => {
            const severity = ( outcome === "sent" ) ? logger.logSeverity.INFO : logger.logSeverity.WARNING;
            logger.log( `Notification '${ pending.kind }' for recipient '${ pending.recipient.id }' ${ outcome }${ details.code ? ` ('${ details.code }')` : "" }.`, severity );
            return { status: outcome };
        } );
    }

    /**
     * Sends one notice through the transport, past the outbox and the ledger: what {@link NotificationService#sendTest}
     * and {@link NotificationService#sendNow} share. Logs the outcome by the recipient's ID, never the address.
     *
     * @method
     * @param {string} what How the log names the notice.
     * @param {string} kind
     * @param {TiNotificationRecipient} recipient
     * @param {Object} data
     * @param {function(): Promise<TiNoticeTexts>} edits The edited texts to render with.
     * @returns {Promise<{messageId: string|null}>}
     */
    #sendAtOnce( what, kind, recipient, data, edits ) {
        if ( this.#transport === null ) {
            return Promise.reject( transports.transportError( "E_NOTICE_TRANSPORT_OFF", false ) );
        }
        if ( !this.#notices.has( kind ) ) {
            return Promise.reject( transports.transportError( "E_NOTICE_UNKNOWN", false, kind ) );
        }
        const invalid = this.#invalidOccurrence( "now", recipient );
        if ( invalid ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: invalid, kind: kind } ) );
        }
        const transport = this.#transport;
        const id = String( recipient.id );
        return edits().then( ( resolved ) => {
            const message = this.#compose( { kind: kind, recipient: recipient, data: data || {} }, resolved );
            return transport.send( message );
        } ).then( ( result ) => {
            logger.log( `${ what } '${ kind }' for recipient '${ id }' sent.`, logger.logSeverity.INFO );
            return { messageId: ( result && typeof result.messageId === "string" ) ? result.messageId : null };
        }, ( error ) => {
            const code = ( error && typeof error.code === "string" ) ? error.code : "E_TRANSPORT_FAILED";
            logger.log( `${ what } '${ kind }' for recipient '${ id }' failed with '${ code }'.`, logger.logSeverity.WARNING );
            throw error;
        } );
    }

    /**
     * Builds the message a transport sends.
     *
     * @method
     * @param {Object} pending
     * @param {TiNoticeTexts} [texts] The document's edited texts.
     * @returns {TiMailMessage}
     */
    #compose( pending, texts = {} ) {
        const rendered = this.render( pending.kind, pending.recipient, pending.data || {}, texts );
        const to = pending.recipient.name ? { email: pending.recipient.email, name: pending.recipient.name } : pending.recipient.email;
        const message = { to: to, subject: rendered.subject, text: rendered.text, html: rendered.html };
        if ( rendered.attachments ) {
            message.attachments = rendered.attachments;
        }
        if ( this.#sender !== null ) {
            message.from = this.#senderName ? { email: this.#sender, name: this.#senderName } : this.#sender;
        }
        if ( this.#replyTo !== null ) {
            message.replyTo = this.#replyTo;
        }
        return message;
    }

    /**
     * Sets the one timer that starts the next pass, at the earliest of a retry and the end of a pause. It never holds
     * the process open, and where the process sleeps between requests the next job tick does its work instead.
     *
     * @method
     * @param {number} at
     */
    #wakeAt( at ) {
        if ( this.#timer !== null ) {
            clearTimeout( this.#timer );
            this.#timer = null;
        }
        if ( !Number.isFinite( at ) ) {
            return;
        }
        this.#timer = setTimeout( () => {
            this.#timer = null;
            this.#drainInBackground();
        }, Math.min( Math.max( at - this.#now(), 0 ), MAX_TIMER ) );
        this.#timer.unref();
    }

    /**
     * @method
     * @param {*} value
     * @returns {string|null} The public base URL without a trailing slash, or `null`.
     */
    #resolvePublicUrl( value ) {
        if ( typeof value !== "string" || value.trim() === "" ) {
            return null;
        }
        try {
            const url = new URL( value.trim() );
            if ( url.protocol !== "http:" && url.protocol !== "https:" ) {
                throw new TypeError( "not http(s)" );
            }
            return url.href.replace( /\/+$/, "" );
        } catch {
            logger.log( "Notifications: the public URL is not an http(s) URL and was ignored.", logger.logSeverity.WARNING );
            return null;
        }
    }

    /**
     * Joins a notice's path to the public base URL. Only a path is accepted: a link returning a whole URL, or a
     * protocol-relative `//host`, could point a notice at another site.
     *
     * @method
     * @param {*} path
     * @returns {string|null}
     */
    #linkTo( path ) {
        if ( this.#publicUrl === null || typeof path !== "string" || !path.startsWith( "/" ) || path.startsWith( "//" ) ) {
            return null;
        }
        return this.#publicUrl + path;
    }

    /**
     * The edited texts of the stored document, or none.
     *
     * @method
     * @returns {Promise<TiNoticeTexts>}
     */
    #storedTexts() {
        return Promise.resolve().then( () => configService.instance.getCurrent( CONFIG_KEY ) ).then( ( envelope ) => {
            const texts = ( envelope && envelope.value ) ? envelope.value.texts : null;
            return ( texts && typeof texts === "object" ) ? texts : {};
        } );
    }

    /**
     * The semantic validator of the `notifications` document: its rules, then its edited texts.
     *
     * @method
     * @param {TiNotificationsDocument} value
     * @returns {ConfigValidationIssue[]}
     */
    #validateDocument( value ) {
        return this.#validateRules( value ).concat( this.#validateTexts( value ) );
    }

    /**
     * Refuses an edited text that would not render as the editor showed it: a key nothing reads, a language the
     * shipped label lacks, an empty text, a line break in a part that takes one line, or a placeholder the text does
     * not offer, which would reach the reader as the braces themselves.
     *
     * @method
     * @param {TiNotificationsDocument} value
     * @returns {ConfigValidationIssue[]}
     */
    #validateTexts( value ) {
        const issues = [];
        const texts = ( value && value.texts && typeof value.texts === "object" ) ? value.texts : {};
        const editable = new Map( this.editableTexts().map( ( entry ) => [ entry.key, entry ] ) );
        Object.keys( texts ).forEach( ( key ) => {
            const entry = editable.get( key );
            if ( !entry ) {
                issues.push( { path: `.texts.${ key }`, message: `Text '${ key }' is not a notice text.`, code: "notifications.unknown-text" } );
                return;
            }
            const languages = ( texts[ key ] && typeof texts[ key ] === "object" ) ? texts[ key ] : {};
            Object.keys( languages ).forEach( ( language ) => {
                const at = `.texts.${ key }.${ language }`;
                const text = languages[ language ];
                if ( typeof localization.getLabel( key, language, null ) !== "string" ) {
                    issues.push( { path: at, message: `Text '${ key }' has no '${ language }' version to edit.`, code: "notifications.unknown-language" } );
                    return;
                }
                if ( typeof text !== "string" || text.trim() === "" ) {
                    issues.push( { path: at, message: `Text '${ key }' in '${ language }' is empty.`, code: "notifications.empty-text" } );
                    return;
                }
                if ( !entry.multiline && /[\r\n]/.test( text ) ) {
                    issues.push( { path: at, message: `Text '${ key }' in '${ language }' must be one line.`, code: "notifications.multiline-text" } );
                }
                if ( entry.placeholders !== null ) {
                    placeholdersIn( text ).filter( ( name ) => !entry.placeholders.includes( name ) ).forEach( ( name ) => {
                        issues.push( { path: at, message: `Text '${ key }' in '${ language }' uses '{${ name }}', which it does not offer.`, code: "notifications.unknown-placeholder" } );
                    } );
                }
            } );
        } );
        return issues;
    }

    /**
     * The rules' part of the validator.
     *
     * @method
     * @param {TiNotificationsDocument} value
     * @returns {ConfigValidationIssue[]}
     */
    #validateRules( value ) {
        const issues = [];
        const rules = ( value && Array.isArray( value.rules ) ) ? value.rules : [];
        const seen = new Set();
        rules.forEach( ( rule, index ) => {
            if ( !rule || typeof rule !== "object" ) {
                return;
            }
            const at = `.rules[${ index }]`;
            if ( seen.has( rule.id ) ) {
                issues.push( { path: at + ".id", message: `Rule ID '${ rule.id }' is used twice.`, code: "notifications.duplicate-rule" } );
            }
            seen.add( rule.id );
            const event = this.#events.get( rule.event );
            if ( !event ) {
                issues.push( { path: at + ".event", message: `Event '${ rule.event }' is not registered.`, code: "notifications.unknown-event" } );
            }
            if ( !this.#notices.has( rule.notice ) ) {
                issues.push( { path: at + ".notice", message: `Notice '${ rule.notice }' is not registered.`, code: "notifications.unknown-notice" } );
            }
            if ( event && rule.when && typeof rule.when === "object" ) {
                Object.keys( rule.when ).forEach( ( attribute ) => {
                    if ( !event.attributes.includes( attribute ) ) {
                        issues.push( { path: `${ at }.when.${ attribute }`, message: `Event '${ rule.event }' has no attribute '${ attribute }'.`, code: "notifications.unknown-attribute" } );
                    }
                } );
            }
        } );
        return issues;
    }

}

const instance = new NotificationService();
module.exports = NotificationService;
NotificationService.CONFIG_KEY = CONFIG_KEY;
NotificationService.SEND_INTERVALS = SEND_INTERVALS;
NotificationService.DEFAULT_SEND_EVERY_HOURS = DEFAULT_SEND_EVERY_HOURS;
NotificationService.instance = Object.freeze( instance );
