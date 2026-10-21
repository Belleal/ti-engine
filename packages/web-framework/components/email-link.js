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

const { createHash, createHmac, randomBytes } = require( "node:crypto" );
const { isIPv4, isIPv6 } = require( "node:net" );
const cache = require( "@ti-engine/core/cache" );
const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const localization = require( "@ti-engine/core/localization" );
const notificationService = require( "#notification-service" );

/** @import { SettingsAuthEmailLink } from "#web-server" */
/** @import { TiEmailLinkRequest, TiEmailLinkRedeemed } from "#definitions" */

// + the SHA-256 of a token → `{ address, language, expiresAt }`. A value, which the store expires and can delete: the
// delete is what spends a token. The token itself is never stored, so a read of the store hands out no link.
const KEY_TOKEN = "ti:auth:email-link:token:";

// + `address:`, `client:` or `overall:` and 32 hex of the SHA-256 of what is counted → `{ count, resetAt }`.
const KEY_LIMIT = "ti:auth:email-link:limit:";

/**
 * The notice that carries the link.
 *
 * @type {string}
 * @public
 */
const NOTICE = "sign-in-link";

/**
 * The label keys of the notice's subject and text. Both must resolve in the deployment's language, or the method is
 * not enabled (see {@link EmailLink#readiness}).
 *
 * @type {Readonly<{subject: string, text: string}>}
 * @public
 */
const NOTICE_LABELS = Object.freeze( {
    subject: `interface.notice.${ NOTICE }.subject`,
    text: `interface.notice.${ NOTICE }.text`
} );

/**
 * The name of the link's fragment, and of the query parameter that answers a request for one.
 *
 * @type {string}
 * @public
 */
const PARAMETER = "email-link";

// The sign-in page, where the link lands and a request is answered. Always `/`, because that is where the framework
// sends every sign-in's failure too (`/?error=`): a page of its own would split the two.
const SIGN_IN_PAGE = "/";

/**
 * What the sign-in page is told in `?email-link=`: how a request for a link ended, or that a link could not be used.
 *
 * @type {Readonly<{SENT: string, LIMITED: string, INVALID_ADDRESS: string, UNAVAILABLE: string, EXPIRED: string}>}
 * @public
 */
const OUTCOME = Object.freeze( {
    SENT: "sent",
    LIMITED: "limited",
    INVALID_ADDRESS: "invalid-address",
    UNAVAILABLE: "unavailable",
    EXPIRED: "expired"
} );

/**
 * The settings in effect when the configuration names none.
 *
 * @type {Readonly<SettingsAuthEmailLink>}
 * @public
 */
const DEFAULTS = Object.freeze( {
    lifetimeMinutes: 15,
    allowedDomains: Object.freeze( [] ),
    hourlyLimitPerAddress: 5,
    hourlyLimitPerClient: 30,
    hourlyLimitOverall: 100
} );

// RFC 5321 caps a path at 256 octets, the angle brackets included.
const ADDRESS_MAX = 254;

// One `@`, and nothing on either side that is whitespace, a control character, or a character that means something in
// a mail header (`<>",;:()[]\`): the address goes to a transport as the recipient. The local part excludes `@`, so the
// `@` has one place to match, and the domain's labels exclude the dot, so each dot has one place too: it runs in linear
// time, as feedback's ADDRESS does (CodeQL js/polynomial-redos).
const ADDRESS = /^[^\s\p{Cc}@<>",;:()[\]\\]+@[^\s\p{Cc}@<>",;:()[\]\\.]+(?:\.[^\s\p{Cc}@<>",;:()[\]\\.]+)+$/u;

// An address is printable ASCII too. The confirm step shows the address a link signs in, so that a link somebody else
// asked for is not followed unnoticed; a letter from another script (a Cyrillic `а` for a Latin `a`) or an invisible
// one would let their address pass for the person's own there. A domain in another script is written in its ASCII
// form, and few transports deliver to a local part outside ASCII.
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

// 32 random bytes, base64url without padding.
const TOKEN_BYTES = 32;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// The window a limit counts in, in seconds.
const LIMIT_WINDOW = 3600;

// The key a log line's subject is made with, new for each process. A plain SHA-256 of a network address is reversed by
// hashing all 2^32 IPv4 addresses, and one of an e-mail address by hashing a list of guesses; keyed, neither works for a
// reader of the log. A subject therefore matches across one process's lines, not across restarts.
const SUBJECT_KEY = randomBytes( 32 );

// The failures after which nothing was sent for certain: raised before the transport was asked, or the provider's
// refusal to take the message for now. A failure the transport marks `transient: false` (the relay's own refusals,
// such as a missing mail binding, and the provider's verdict that the message will never go) is one too (see
// isNotSent). Anything else, above all the relay's E_RELAY_UNAVAILABLE (a timeout, a dropped connection, an answer it
// could not read), may have followed a delivery, so its link is kept and its counts stand.
const NOT_SENT = Object.freeze( [ "E_NOTICE_TRANSPORT_OFF", "E_NOTICE_UNKNOWN", "E_NOTICE_LABEL_MISSING", "E_NOTICE_ATTACHMENT_INVALID",
    "E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED" ] );

// The domains whose mailboxes ignore dots in the local part: Gmail's.
const DOTLESS_DOMAINS = Object.freeze( [ "gmail.com", "googlemail.com" ] );

/**
 * The SHA-256 of a value, in hex.
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
 * Where a token's entry is kept, or `null` for a token this module could not have made: nothing is read for it.
 *
 * @method
 * @param {*} token
 * @returns {string|null}
 * @private
 */
function tokenKeyOf( token ) {
    return ( typeof token === "string" && TOKEN.test( token ) ) ? KEY_TOKEN + digestOf( token ) : null;
}

/**
 * Whether a failed send certainly sent nothing: a code in {@link NOT_SENT}, or a transport's own word that the message
 * will never go.
 *
 * @method
 * @param {*} error
 * @returns {boolean}
 * @private
 */
function isNotSent( error ) {
    return !!error && ( NOT_SENT.includes( error.code ) || error.transient === false );
}

/**
 * The mailbox an address reaches, as the per-address limit counts it: without a `+tag`, and for Gmail without the dots
 * and in `gmail.com`. Every such spelling reaches one inbox, and counted apart each would bring the inbox five more
 * links an hour. Only the count uses it: the link goes to the address as given, and the address is the user.
 *
 * @method
 * @param {string} address As {@link EmailLink.normalizeAddress} returns it.
 * @returns {string}
 * @private
 */
function mailboxOf( address ) {
    const at = address.lastIndexOf( "@" );
    let local = address.slice( 0, at );
    let domain = address.slice( at + 1 );
    const plus = local.indexOf( "+" );
    if ( plus > 0 ) {
        local = local.slice( 0, plus );
    }
    if ( DOTLESS_DOMAINS.includes( domain ) ) {
        domain = DOTLESS_DOMAINS[ 0 ];
        local = local.replaceAll( ".", "" ) || local;
    }
    return local + "@" + domain;
}

/**
 * The network a client is counted by: an IPv4 address as it is, an IPv6 one by its `/64`. A single host is usually
 * given a whole `/64`, so counting each IPv6 address apart would give it as many hourly limits as it cares to use
 * addresses. An IPv4 address written as IPv6 (`::ffff:192.0.2.1`) is the IPv4 address.
 *
 * @method
 * @param {*} client The request's `ip`.
 * @returns {string}
 * @private
 */
function networkOf( client ) {
    const text = String( client || "" ).trim().toLowerCase().replace( /%.*$/, "" );
    if ( isIPv4( text ) ) {
        return text;
    }
    if ( !isIPv6( text ) ) {
        return text === "" ? "unknown" : text;
    }
    // Eight groups of 16 bits, with `::` filled in and a trailing IPv4 part read as two groups.
    let written = text;
    const tail = written.slice( written.lastIndexOf( ":" ) + 1 );
    if ( isIPv4( tail ) ) {
        const octets = tail.split( "." ).map( Number );
        written = written.slice( 0, written.length - tail.length ) + ( ( octets[ 0 ] << 8 ) | octets[ 1 ] ).toString( 16 ) + ":" + ( ( octets[ 2 ] << 8 ) | octets[ 3 ] ).toString( 16 );
    }
    const gap = written.indexOf( "::" );
    const head = ( gap === -1 ? written : written.slice( 0, gap ) ).split( ":" ).filter( ( group ) => group !== "" );
    const rest = ( gap === -1 ) ? [] : written.slice( gap + 2 ).split( ":" ).filter( ( group ) => group !== "" );
    const groups = ( gap === -1 ) ? head : [ ...head, ...new Array( 8 - head.length - rest.length ).fill( "0" ), ...rest ];
    const numbers = groups.map( ( group ) => parseInt( group, 16 ) );
    if ( numbers.slice( 0, 5 ).every( ( number ) => number === 0 ) && numbers[ 5 ] === 0xffff ) {
        return [ numbers[ 6 ] >> 8, numbers[ 6 ] & 0xff, numbers[ 7 ] >> 8, numbers[ 7 ] & 0xff ].join( "." );
    }
    return numbers.slice( 0, 4 ).map( ( number ) => number.toString( 16 ) ).join( ":" ) + "::/64";
}

/**
 * Where a limit keeps its count of a value.
 *
 * @method
 * @param {"address"|"client"|"overall"} kind
 * @param {string} value
 * @returns {string}
 * @private
 */
function limitKeyOf( kind, value ) {
    return KEY_LIMIT + kind + ":" + digestOf( value ).slice( 0, 32 );
}

/**
 * Whole seconds from now until a moment, at least one: the expiry a count is written with.
 *
 * @method
 * @param {number} until In milliseconds.
 * @param {number} now In milliseconds.
 * @returns {number}
 * @private
 */
function secondsUntil( until, now ) {
    return Math.max( 1, Math.ceil( ( until - now ) / 1000 ) );
}

/**
 * Whether a value is a positive whole number, as every count and lifetime here must be.
 *
 * @method
 * @param {*} value
 * @returns {boolean}
 * @private
 */
function isCount( value ) {
    return Number.isInteger( value ) && value > 0;
}

/**
 * An address's domain: what follows its last `@`.
 *
 * @method
 * @param {string} address As {@link EmailLink.normalizeAddress} returns it.
 * @returns {string}
 * @private
 */
function domainOf( address ) {
    return address.slice( address.lastIndexOf( "@" ) + 1 );
}

/**
 * Sign-in with a link sent by e-mail: the `email-link` method. The person gives an address, the server sends a link
 * that works once and for a few minutes, and following it signs them in.
 * <br/>
 * This holds the method's own rules — the address check, the hourly limits, the token and its one use, the notice —
 * and nothing about the session: {@link AuthManager} turns a spent token into a user, and the login handler signs
 * them in as it does for every method. Design record: `docs/superpowers/specs/2026-10-20-web-framework-email-link-sign-in-design.md`.
 *
 * @class EmailLink
 * @public
 */
class EmailLink {

    /** @type {Readonly<SettingsAuthEmailLink>} */
    #settings;
    #now;
    #lock = new tools.KeyedLock();

    /**
     * @constructor
     * @param {SettingsAuthEmailLink} [settings] `auth.emailLink`, its `allowedDomains` already normalized by
     *        {@link AuthManager.toDomainList}, which is the one place a domain list is read.
     * @param {Object} [options] For tests.
     * @param {function(): number} [options.now] The clock, in milliseconds.
     */
    constructor( settings = {}, options = {} ) {
        const resolved = EmailLink.resolveSettings( settings );
        resolved.warnings.forEach( ( warning ) => logger.log( warning, logger.logSeverity.WARNING ) );
        this.#settings = resolved.settings;
        this.#now = ( typeof options.now === "function" ) ? options.now : () => Date.now();
    }

    /* Public interface */

    /**
     * The settings in effect, after the defaults and the checks of {@link EmailLink.resolveSettings}.
     *
     * @property
     * @returns {Readonly<SettingsAuthEmailLink>}
     * @public
     */
    get settings() {
        return this.#settings;
    }

    /**
     * Registers the notice that carries the link with the notification service, which makes its texts editable in the
     * `notifications` document like any other notice's.
     *
     * @method
     * @returns {EmailLink} this
     * @public
     */
    registerNotice() {
        notificationService.instance.registerNotice( NOTICE, {
            subject: NOTICE_LABELS.subject,
            text: NOTICE_LABELS.text,
            // A rendering without a token, such as an editor's preview, links to the sign-in page itself.
            link: ( data ) => ( typeof data.token === "string" ) ? `${ SIGN_IN_PAGE }#${ PARAMETER }=${ data.token }` : SIGN_IN_PAGE,
            // Only the lifetime may appear in the texts: the token reaches the message through the link alone.
            format: ( data ) => ( { minutes: String( isCount( data.minutes ) ? data.minutes : this.#settings.lifetimeMinutes ) } ),
            placeholders: [ "minutes" ]
        } );
        return this;
    }

    /**
     * Why a link could not be sent with the deployment as it is, or `null` when it could. A link needs a transport
     * that delivers mail, the public URL it starts from, and the notice's subject and text in the deployment's
     * language. The `log` transport delivers nothing, so on it nobody could ever follow a link.
     *
     * @method
     * @returns {string|null}
     * @public
     */
    readiness() {
        const service = notificationService.instance;
        if ( !service.isEnabled ) {
            return "no notification transport is configured (TI_WEB_NOTIFY_TRANSPORT)";
        }
        if ( service.transportName === "log" ) {
            return "the notification transport is 'log', which delivers nothing";
        }
        if ( !service.publicUrl ) {
            return "no public URL is set (TI_WEB_PUBLIC_URL), so the e-mail would carry no link";
        }
        const system = localization.getSystemLanguage();
        const missing = [ NOTICE_LABELS.subject, NOTICE_LABELS.text ].filter( ( key ) => typeof localization.getLabel( key, system, null ) !== "string" );
        if ( missing.length > 0 ) {
            return `the label catalogue has no '${ missing.join( "', '" ) }' in '${ system }'`;
        }
        return null;
    }

    /**
     * Asks for a link to be sent to an address. Resolves with the outcome the sign-in page shows, never rejects: a
     * failure to store or to send is logged and answered as {@link OUTCOME}`.UNAVAILABLE`.
     * <br/>
     * **The outcome never says whether the address may sign in.** An address outside `allowedDomains` is sent nothing
     * and answered `sent`, like one inside it. Over any hourly limit nothing is sent, whatever the address. A request
     * that certainly sent nothing gives back what it counted against the address and overall, so an outage does not use
     * up anybody's hour; one whose send may have gone through keeps its counts and its link, since the e-mail may still
     * arrive. The client's count is never given back: it bounds how often one network may ask, whatever came of it.
     *
     * @method
     * @param {TiEmailLinkRequest} [request]
     * @returns {Promise<string>} One of {@link OUTCOME}.
     * @public
     */
    request( { email, client, language } = {} ) {
        const address = EmailLink.normalizeAddress( email );
        if ( address === null ) {
            return Promise.resolve( OUTCOME.INVALID_ADDRESS );
        }
        const subject = EmailLink.subjectOf( address );
        const network = networkOf( client );
        const mailbox = mailboxOf( address );
        const counted = [];
        const progress = { sending: false };
        return this.#count( "client", network, this.#settings.hourlyLimitPerClient ).then( ( withinClient ) => {
            if ( !withinClient ) {
                logger.log( `E-mail sign-in: client '${ EmailLink.subjectOf( network ) }' is over its hourly limit; no link was sent.`, logger.logSeverity.NOTICE );
                return OUTCOME.LIMITED;
            }
            return this.#count( "address", mailbox, this.#settings.hourlyLimitPerAddress ).then( ( withinAddress ) => {
                if ( !withinAddress ) {
                    logger.log( `E-mail sign-in: address '${ subject }' is over its hourly limit; no link was sent.`, logger.logSeverity.NOTICE );
                    return OUTCOME.LIMITED;
                }
                counted.push( [ "address", mailbox ] );
                if ( !this.#isDomainAllowed( address ) ) {
                    // The domain is what an operator acts on, a missing entry in the list; the address is somebody's.
                    logger.log( `E-mail sign-in: address '${ subject }' is in the domain '${ domainOf( address ) }', which may not sign in; no link was sent.`, logger.logSeverity.INFO );
                    return OUTCOME.SENT;
                }
                // Last, so that only a request about to send counts: the overall limit bounds the mail, which every
                // address and network together could otherwise multiply, and keeps the provider's quota for the other notices.
                return this.#count( "overall", "", this.#settings.hourlyLimitOverall ).then( ( withinOverall ) => {
                    if ( !withinOverall ) {
                        logger.log( "E-mail sign-in: the overall hourly limit is reached; no link was sent.", logger.logSeverity.WARNING );
                        // Nothing was sent, and the person did nothing to earn the count: their address's hour stays whole.
                        return this.#uncount( "address", mailbox ).catch( () => undefined ).then( () => OUTCOME.LIMITED );
                    }
                    counted.push( [ "overall", "" ] );
                    return this.#issueAndSend( address, subject, language, progress );
                } );
            } );
        } ).catch( ( error ) => {
            const sentNothing = !progress.sending || isNotSent( error );
            logger.log( `E-mail sign-in: a link for address '${ subject }' could not be sent (${ ( error && error.code ) || "unknown" })${ sentNothing ? "" : "; it may have gone, so its link is kept and it counts" }.`, logger.logSeverity.WARNING, { stack: error && error.stack } );
            if ( !sentNothing ) {
                return OUTCOME.UNAVAILABLE;
            }
            return Promise.all( counted.map( ( [ kind, value ] ) => this.#uncount( kind, value ).catch( () => undefined ) ) ).then( () => OUTCOME.UNAVAILABLE );
        } );
    }

    /**
     * The address a token would sign in, without spending it, or `null` for a token that could not sign anybody in.
     * The sign-in page shows the address before the person continues, so a link somebody else asked for, for their
     * own address, is not followed into their account unnoticed. It tells the holder of a token nothing a spend would
     * not: the token was sent to that address.
     *
     * @method
     * @param {*} token As the form sent it.
     * @returns {Promise<string|null>}
     * @public
     */
    peek( token ) {
        const key = tokenKeyOf( token );
        if ( key === null ) {
            return Promise.resolve( null );
        }
        return cache.instance.getValue( key ).then( ( entry ) => this.#usableAddress( entry ) );
    }

    /**
     * Spends a token: the first request to delete its entry gets the address it was sent to, every later one gets
     * `null`, as does a token that is malformed, unknown or expired, or whose address's domain may no longer sign in.
     *
     * @method
     * @param {*} token As the form sent it.
     * @returns {Promise<TiEmailLinkRedeemed|null>}
     * @public
     */
    redeem( token ) {
        const key = tokenKeyOf( token );
        if ( key === null ) {
            return Promise.resolve( null );
        }
        return cache.instance.getValue( key ).then( ( entry ) => {
            if ( !entry || typeof entry !== "object" ) {
                return null;
            }
            // The delete is the spend. Two requests with the same token both read the entry; Redis's DEL count and D1's
            // `deleted` tell exactly one of them it removed it.
            return cache.instance.deleteValue( key ).then( ( deleted ) => {
                if ( !deleted ) {
                    return null;
                }
                const address = this.#usableAddress( entry );
                return ( address === null ) ? null : { address: address, language: ( typeof entry.language === "string" ) ? entry.language : undefined };
            } );
        } );
    }

    /* Static interface */

    /**
     * Where the browser is sent with an answer about a link: the sign-in page, told the outcome.
     *
     * @method
     * @param {string} outcome One of {@link OUTCOME}.
     * @returns {string}
     * @public
     */
    static answerFor( outcome ) {
        return `${ SIGN_IN_PAGE }?${ PARAMETER }=${ encodeURIComponent( outcome ) }`;
    }

    /**
     * Reads `auth.emailLink` into the settings in effect: each missing or malformed value takes its default, with a
     * warning for a malformed one. Pure, so the rules are testable without a server.
     *
     * @method
     * @param {SettingsAuthEmailLink} [settings]
     * @returns {{settings: Readonly<SettingsAuthEmailLink>, warnings: string[]}}
     * @public
     */
    static resolveSettings( settings ) {
        const given = ( settings && typeof settings === "object" ) ? settings : {};
        const warnings = [];
        const pick = ( name, valid ) => {
            if ( given[ name ] === undefined || given[ name ] === null ) {
                return DEFAULTS[ name ];
            }
            if ( valid( given[ name ] ) ) {
                return given[ name ];
            }
            warnings.push( `E-mail sign-in: 'auth.emailLink.${ name }' is not valid and was ignored; using ${ JSON.stringify( DEFAULTS[ name ] ) }.` );
            return DEFAULTS[ name ];
        };
        const resolved = {
            lifetimeMinutes: pick( "lifetimeMinutes", ( value ) => isCount( value ) && value <= 1440 ),
            allowedDomains: Object.freeze( Array.isArray( given.allowedDomains ) ? [ ...given.allowedDomains ] : [] ),
            hourlyLimitPerAddress: pick( "hourlyLimitPerAddress", isCount ),
            hourlyLimitPerClient: pick( "hourlyLimitPerClient", isCount ),
            hourlyLimitOverall: pick( "hourlyLimitOverall", isCount )
        };
        return { settings: Object.freeze( resolved ), warnings: warnings };
    }

    /**
     * An address as the method keeps it: trimmed and lower-cased, or `null` when it is not one. Lower-cased whole,
     * although a mailbox's local part may in principle be case-sensitive: no provider a person is likely to use treats
     * it so, and two spellings of one address must be one person. Printable ASCII only (see {@link PRINTABLE_ASCII}).
     *
     * @method
     * @param {*} value
     * @returns {string|null}
     * @public
     */
    static normalizeAddress( value ) {
        if ( typeof value !== "string" ) {
            return null;
        }
        const address = value.trim().toLowerCase();
        return ( address.length <= ADDRESS_MAX && PRINTABLE_ASCII.test( address ) && ADDRESS.test( address ) ) ? address : null;
    }

    /**
     * What the log names a value by, an address or a client's network address: the first 16 hex digits of its
     * HMAC-SHA-256 under a key made for this process (see {@link SUBJECT_KEY}), so a reader of the log cannot recover
     * the value by hashing every candidate.
     *
     * @method
     * @param {string} value
     * @returns {string}
     * @public
     */
    static subjectOf( value ) {
        return createHmac( "sha256", SUBJECT_KEY ).update( String( value ) ).digest( "hex" ).slice( 0, 16 );
    }

    /**
     * The user ID of the person an address signs in: `email:` and the first 32 hex digits of its SHA-256. Stable, so
     * the same address is the same user at every sign-in and on every instance, which is why it cannot be keyed per
     * process as {@link EmailLink.subjectOf} is. It keeps the address itself out of the log, where the framework writes
     * user IDs, but whoever can guess an address can confirm it against the ID: it is pseudonymous, not anonymous.
     *
     * @method
     * @param {string} address As {@link EmailLink.normalizeAddress} returns it.
     * @returns {string}
     * @public
     */
    static userIDOf( address ) {
        return "email:" + digestOf( address ).slice( 0, 32 );
    }

    /* Private interface */

    /**
     * Counts one request against a limit, in a window that starts with the first request and lasts an hour. Answers
     * whether the request is within the limit; one over it is not counted, so the window is not stretched.
     *
     * @method
     * @param {"address"|"client"|"overall"} kind
     * @param {string} value
     * @param {number} limit
     * @returns {Promise<boolean>}
     */
    #count( kind, value, limit ) {
        const key = limitKeyOf( kind, value );
        return this.#lock.exclusively( key, () => {
            return cache.instance.getValue( key ).then( ( entry ) => {
                const now = this.#now();
                const live = !!entry && typeof entry === "object" && Number.isInteger( entry.count ) && Number.isFinite( entry.resetAt ) && entry.resetAt > now;
                const count = ( live ? entry.count : 0 ) + 1;
                if ( count > limit ) {
                    return false;
                }
                const resetAt = live ? entry.resetAt : now + LIMIT_WINDOW * 1000;
                return cache.instance.setValue( key, { count: count, resetAt: resetAt }, secondsUntil( resetAt, now ) ).then( () => true );
            } );
        } );
    }

    /**
     * Gives back one request a limit counted, when nothing was sent for it. A window that has ended has nothing to give.
     *
     * @method
     * @param {"address"|"client"|"overall"} kind
     * @param {string} value
     * @returns {Promise<void>}
     */
    #uncount( kind, value ) {
        const key = limitKeyOf( kind, value );
        return this.#lock.exclusively( key, () => {
            return cache.instance.getValue( key ).then( ( entry ) => {
                const now = this.#now();
                if ( !entry || typeof entry !== "object" || !isCount( entry.count ) || !Number.isFinite( entry.resetAt ) || entry.resetAt <= now ) {
                    return undefined;
                }
                return cache.instance.setValue( key, { count: entry.count - 1, resetAt: entry.resetAt }, secondsUntil( entry.resetAt, now ) );
            } );
        } );
    }

    /**
     * The address a stored entry signs in, or `null` when it may not: past its expiry, malformed, or in a domain the
     * list no longer admits. The domain is checked again because the list can be narrowed while a link is out, as an
     * OpenID sign-in's domain is checked when it completes.
     *
     * @method
     * @param {*} entry
     * @returns {string|null}
     */
    #usableAddress( entry ) {
        if ( !entry || typeof entry !== "object" ) {
            return null;
        }
        // The store's own expiry is a backstop, which a provider may apply late; this is the check.
        if ( !Number.isFinite( entry.expiresAt ) || entry.expiresAt <= this.#now() ) {
            return null;
        }
        const address = EmailLink.normalizeAddress( entry.address );
        return ( address !== null && this.#isDomainAllowed( address ) ) ? address : null;
    }

    /**
     * Whether an address's domain may sign in: any, when the list is empty.
     *
     * @method
     * @param {string} address
     * @returns {boolean}
     */
    #isDomainAllowed( address ) {
        const allowed = this.#settings.allowedDomains;
        return allowed.length === 0 || allowed.includes( domainOf( address ) );
    }

    /**
     * Stores a new token and sends the link. A link that certainly was not sent is deleted, so it can never work; one
     * whose send may have gone through is kept, so an e-mail that arrives anyway carries a link that works.
     *
     * @method
     * @param {string} address
     * @param {string} subject
     * @param {string} [language]
     * @param {{sending: boolean}} progress Set once the transport has been asked, so the caller knows whether a failure
     *        may have followed a delivery.
     * @returns {Promise<string>} {@link OUTCOME}`.SENT`; rejects when the store or the transport fails.
     */
    #issueAndSend( address, subject, language, progress ) {
        const token = randomBytes( TOKEN_BYTES ).toString( "base64url" );
        const key = tokenKeyOf( token );
        const lifetime = this.#settings.lifetimeMinutes * 60;
        const entry = {
            address: address,
            language: ( typeof language === "string" && language !== "" ) ? language : undefined,
            expiresAt: this.#now() + lifetime * 1000
        };
        return cache.instance.setValue( key, entry, lifetime ).then( () => {
            // The recipient ID is what the notification service logs, so it is the address's subject, never the address.
            const recipient = { id: `email-link-${ subject }`, email: address, language: entry.language };
            progress.sending = true;
            return notificationService.instance.sendNow( NOTICE, recipient, { token: token, minutes: this.#settings.lifetimeMinutes } ).catch( ( error ) => {
                if ( !isNotSent( error ) ) {
                    throw error;
                }
                return Promise.resolve( cache.instance.deleteValue( key ) ).catch( () => undefined ).then( () => {
                    throw error;
                } );
            } );
        } ).then( () => {
            logger.log( `E-mail sign-in: a link for address '${ subject }' was sent.`, logger.logSeverity.INFO );
            return OUTCOME.SENT;
        } );
    }

}

module.exports = EmailLink;
EmailLink.NOTICE = NOTICE;
EmailLink.NOTICE_LABELS = NOTICE_LABELS;
EmailLink.PARAMETER = PARAMETER;
EmailLink.OUTCOME = OUTCOME;
EmailLink.DEFAULTS = DEFAULTS;
