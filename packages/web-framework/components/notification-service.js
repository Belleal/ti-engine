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
const configService = require( "#config-service" );
const transports = require( "#notification-transports" );

/** @import { TiMailMessage, TiMailTransport, TiNoticeDefinition, TiNotificationDrainReport, TiNotificationEventDefinition, TiNotificationRecipient, TiNotificationRule, TiNotificationSettings, TiNotificationsDocument, TiRenderedNotice } from "#definitions" */
/** @import { ConfigValidationIssue } from "#config-registry" */

// Both are string values, not JSON documents: the D1 state store has no way to delete a document (`/v1/values/delete`
// reaches `state_values` alone), so a pending entry written with `setJSON` could never be removed there, and a value
// takes its expiry in the same write that stores it. Each key is followed by `<recipient digest>:<notice digest>`.
const KEY_PENDING = "ti:notify:pending:";
const KEY_DONE = "ti:notify:done:";

/**
 * The key of the configuration document holding the rules (§3.2 of the design record).
 *
 * @type {string}
 */
const CONFIG_KEY = "notifications";

/**
 * How long a ledger entry is kept, in days, unless the deployment says otherwise: long enough to span an appraisal
 * cycle, so a notice is not sent again by a catch-up that runs after its entry has gone.
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

const TRANSPORT_OFF = "off";
const TRANSPORT_LOG = "log";
const TRANSPORT_CLOUDFLARE = "cloudflare";

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
 * The moment the next UTC day starts, in milliseconds.
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
 * and on every job tick. A ledger entry records it once sent or given up, so the same key is never sent twice: two
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
     * Registers a notice an application sends. Registered at start-up, like a configuration document.
     *
     * @method
     * @param {string} kind The notice's name, which rules refer to.
     * @param {TiNoticeDefinition} definition
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a missing name or label key, or a link or format that is not a function.
     * @public
     */
    registerNotice( kind, definition ) {
        const { subject, text, link, format } = definition || {};
        if ( typeof kind !== "string" || kind.trim() === "" || typeof subject !== "string" || subject === "" || typeof text !== "string" || text === ""
            || ( link !== undefined && typeof link !== "function" ) || ( format !== undefined && typeof format !== "function" ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-notice-registration", kind: kind } );
        }
        this.#notices.set( kind, Object.freeze( { subject: subject, text: text, link: link, format: format } ) );
        return this;
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
     *
     * @method
     * @param {TiNotificationsDocument} [defaults] `{ enabled: true, rules: [] }` unless stated.
     * @param {Object} [metadata] Merged into the document's editor metadata.
     * @returns {{schema: Object, validators: Array<function>, defaultValue: TiNotificationsDocument, metadata: Object}}
     * @public
     */
    configDocument( defaults = {}, metadata = {} ) {
        const defaultValue = {
            enabled: ( defaults && typeof defaults.enabled === "boolean" ) ? defaults.enabled : true,
            rules: ( defaults && Array.isArray( defaults.rules ) ) ? JSON.parse( JSON.stringify( defaults.rules ) ) : []
        };
        return {
            schema: NotificationService.documentSchema(),
            validators: [ ( value ) => this.#validateRules( value ) ],
            defaultValue: defaultValue,
            metadata: Object.assign( {}, metadata )
        };
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
        return configService.instance.getCurrent( CONFIG_KEY ).then( ( envelope ) => {
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
        this.#draining = this.#drainLoop().finally( () => {
            this.#draining = null;
        } );
        return this.#draining;
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
        return Promise.all( [
            cache.instance.matchKeys( KEY_PENDING + prefix + "*" ),
            cache.instance.matchKeys( KEY_DONE + prefix + "*" )
        ] ).then( ( [ pending, done ] ) => {
            const suffixes = [ ...new Set( [ ...( pending || [] ).map( ( key ) => key.slice( KEY_PENDING.length ) ), ...( done || [] ).map( ( key ) => key.slice( KEY_DONE.length ) ) ] ) ];
            return suffixes.reduce( ( chain, suffix ) => chain.then( ( removed ) => this.#lock.exclusively( suffix, () => {
                return tools.whenAllSettled( [ cache.instance.deleteValue( KEY_PENDING + suffix ), cache.instance.deleteValue( KEY_DONE + suffix ) ] );
            } ).then( ( results ) => removed + results.filter( ( result ) => tools.toBool( result ) ).length ) ), Promise.resolve( 0 ) );
        } );
    }

    /**
     * Renders a notice for one person in their language, else the deployment's: the subject, the text with the link
     * after it, and the same text as minimal HTML. The HTML has no remote image, no tracking pixel and no rewritten
     * link: a notice points to the application, it does not report on whoever opens it.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient} recipient
     * @param {Object} [data]
     * @returns {TiRenderedNotice}
     * @throws {Error} With `code` `E_NOTICE_UNKNOWN` or `E_NOTICE_LABEL_MISSING`, and `transient` false.
     * @public
     */
    render( kind, recipient, data = {} ) {
        const notice = this.#notices.get( kind );
        if ( !notice ) {
            throw transports.transportError( "E_NOTICE_UNKNOWN", false, kind );
        }
        const language = ( recipient && recipient.language ) ? recipient.language : localization.getSystemLanguage();
        const values = notice.format ? ( notice.format( data, language ) || {} ) : data;
        // A line break in a subject is a new header to a transport that writes headers.
        const subject = fillTemplate( NotificationService.#label( notice.subject, language ), values ).replace( /[\r\n]+/g, " " ).trim();
        const body = fillTemplate( NotificationService.#label( notice.text, language ), values ).replace( /\r\n?/g, "\n" ).trim();
        const url = notice.link ? this.#linkTo( notice.link( data ) ) : null;
        const paragraphs = body.split( /\n{2,}/ ).map( ( paragraph ) => `<p>${ escapeHTML( paragraph ).replace( /\n/g, "<br>" ) }</p>` );
        if ( url ) {
            paragraphs.push( `<p><a href="${ escapeHTML( url ) }">${ escapeHTML( url ) }</a></p>` );
        }
        const html = `<!doctype html>\n<html lang="${ escapeHTML( language ) }">\n<head><meta charset="utf-8"><title>${ escapeHTML( subject ) }</title></head>\n<body>\n${ paragraphs.join( "\n" ) }\n</body>\n</html>\n`;
        return { subject: subject, text: url ? body + "\n\n" + url : body, html: html };
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
     * The JSON Schema of the `notifications` document.
     *
     * @method
     * @returns {Object}
     * @public
     */
    static documentSchema() {
        return {
            type: "object",
            additionalProperties: false,
            required: [ "enabled", "rules" ],
            properties: {
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
                }
            }
        };
    }

    /**
     * Looks a label up in a language, then in the deployment's. A notice with a missing text is not sent with the
     * catalogue's not-found placeholder in it.
     *
     * @method
     * @param {string} key
     * @param {string} language
     * @returns {string}
     * @throws {Error} With `code` `E_NOTICE_LABEL_MISSING`.
     */
    static #label( key, language ) {
        let value = localization.getLabel( key, language, null );
        if ( typeof value !== "string" ) {
            value = localization.getLabel( key, localization.getSystemLanguage(), null );
        }
        if ( typeof value !== "string" ) {
            throw transports.transportError( "E_NOTICE_LABEL_MISSING", false, key );
        }
        return value;
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
            logger.log( "Notifications: a dispatcher pass failed.", logger.logSeverity.ERROR, error );
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
        return cache.instance.matchKeys( KEY_PENDING + "*" ).then( ( keys ) => {
            const suffixes = ( keys || [] ).map( ( key ) => key.slice( KEY_PENDING.length ) );
            let processed = 0;
            return suffixes.reduce( ( chain, suffix ) => chain.then( () => {
                if ( report.stopped !== null || processed >= DRAIN_LIMIT ) {
                    return undefined;
                }
                return this.#dispatch( suffix, now ).then( ( outcome ) => {
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
                    logger.log( "Notifications: a queued notice could not be processed; it stays queued.", logger.logSeverity.ERROR, error );
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
     * @returns {Promise<{status: string, retryAt?: number, code?: string}>}
     */
    #dispatch( suffix, now ) {
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
                    message = this.#compose( pending );
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
     * Builds the message a transport sends.
     *
     * @method
     * @param {Object} pending
     * @returns {TiMailMessage}
     */
    #compose( pending ) {
        const rendered = this.render( pending.kind, pending.recipient, pending.data || {} );
        const to = pending.recipient.name ? { email: pending.recipient.email, name: pending.recipient.name } : pending.recipient.email;
        const message = { to: to, subject: rendered.subject, text: rendered.text, html: rendered.html };
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
     * The semantic validator of the `notifications` document.
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
NotificationService.instance = Object.freeze( instance );
