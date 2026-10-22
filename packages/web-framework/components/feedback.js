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

const crypto = require( "node:crypto" );
const cache = require( "@ti-engine/core/cache" );
const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const localization = require( "@ti-engine/core/localization" );
const timeZone = require( "@ti-engine/core/time-zone" );
const notificationService = require( "#notification-service" );

/** @import { TiFeedbackItem, TiFeedbackOptions, TiFeedbackPicture, TiSessionSubject } from "#definitions" */

// + feedback ID → the item. A value, never a JSON document: erasure deletes items, and D1 cannot delete a document.
// One document holding every item would be one read, but D1 keeps a document in one row, capped near 2 MB.
const KEY_ITEM = "ti:feedback:item:";

// + feedback ID → the picture of the screen sent with it (CA-544), `{ type, data }` with the image in base64. Apart from
// the item, so the inbox, the e-mail and an export never carry it, and a value for the same reason as the item.
const KEY_PICTURE = "ti:feedback:picture:";

// How many items the inbox reads at once. `1 + n` reads on D1, where the state service has no batch read; eight at a
// time keeps a long list from opening hundreds of requests at once.
const READS_IN_FLIGHT = 8;

/**
 * What a piece of feedback is.
 *
 * @type {Readonly<{SUGGESTION: string, PROBLEM: string, PRAISE: string, OTHER: string}>}
 * @public
 */
const KIND = Object.freeze( {
    SUGGESTION: "suggestion",
    PROBLEM: "problem",
    PRAISE: "praise",
    OTHER: "other"
} );

/**
 * Where an administrator has put it.
 *
 * @type {Readonly<{NEW: string, IN_PROGRESS: string, DONE: string, DECLINED: string}>}
 * @public
 */
const STATUS = Object.freeze( {
    NEW: "new",
    IN_PROGRESS: "in-progress",
    DONE: "done",
    DECLINED: "declined"
} );

/**
 * The event a submission raises.
 *
 * @type {Readonly<{RECEIVED: string}>}
 * @public
 */
const EVENT = Object.freeze( {
    RECEIVED: "feedback.received"
} );

/**
 * The one notice: to the administrators, that feedback arrived.
 *
 * @type {Readonly<{RECEIVED: string}>}
 * @public
 */
const NOTICE = Object.freeze( {
    RECEIVED: "feedback-received"
} );

/**
 * The names the notice's texts may use.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
const PLACEHOLDERS = Object.freeze( [ "kind", "sender", "text", "date" ] );

/**
 * The longest text, in characters.
 *
 * @type {number}
 * @public
 */
const TEXT_MAX = 4000;

/**
 * The longest browser description kept, in characters: enough for any browser's own, and no room for anything else.
 *
 * @type {number}
 * @private
 */
const BROWSER_MAX = 200;

/**
 * The largest picture of the screen, in bytes once decoded: 1,333,336 characters of base64, well inside the 2,000,000
 * bytes D1 keeps in one row.
 *
 * @type {number}
 * @public
 */
const PICTURE_MAX_BYTES = 1000000;

/**
 * The longest side of a picture of the screen, in pixels.
 *
 * @type {number}
 * @public
 */
const PICTURE_MAX_SIDE = 1600;

// A picture as the browser sends it: a data URL of one of the two types, in strict base64. Linear: one character class,
// then at most two `=` before the end.
const PICTURE_DATA_URL = /^data:(image\/webp|image\/jpeg);base64,([A-Za-z0-9+/]*={0,2})$/;

// An allowlist entry that is an e-mail address. An entry is matched against a sign-in's user ID, user name or e-mail,
// so not every entry is one, and only one that is can be written to. The domain's labels exclude the dot, so each dot
// has one place to match: with `[^@\s]+\.[^@\s]+` an entry such as "a@a." and "a." repeated took quadratic time
// (479 ms at 20,000 repetitions, measured; CodeQL js/polynomial-redos).
const ADDRESS = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;

// A feedback ID as this module mints them, and nothing a key pattern could read as a wildcard.
const FEEDBACK_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Raises a refusal the browser shows in words.
 *
 * @method
 * @param {string} details A label key.
 * @param {number} [httpCode]
 * @returns {TiException}
 * @private
 */
const refuse = ( details, httpCode = exceptions.httpCode.C_422 ) => exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { details: details }, httpCode );

/**
 * A label in a language, the deployment's where that one has none, else the fallback.
 *
 * @method
 * @param {string} key
 * @param {string} language
 * @param {string} [fallback]
 * @returns {string}
 * @private
 */
function labelIn( key, language, fallback = "" ) {
    const value = localization.getLabel( key, language, null );
    if ( typeof value === "string" ) {
        return value;
    }
    const system = localization.getLabel( key, localization.getSystemLanguage(), null );
    return ( typeof system === "string" ) ? system : fallback;
}

/**
 * The width and height a WebP file states, or null when it is not one this module accepts: a RIFF container whose size
 * is exactly the file's, holding a lossy (`VP8 `), lossless (`VP8L`) or extended (`VP8X`) image. Requiring the stated
 * size keeps anything from riding after the image.
 *
 * @method
 * @param {Buffer} bytes
 * @returns {{width: number, height: number}|null}
 * @private
 */
function webpDimensions( bytes ) {
    if ( bytes.length < 30 || bytes.toString( "latin1", 0, 4 ) !== "RIFF" || bytes.toString( "latin1", 8, 12 ) !== "WEBP" || bytes.readUInt32LE( 4 ) + 8 !== bytes.length ) {
        return null;
    }
    const chunk = bytes.toString( "latin1", 12, 16 );
    if ( chunk === "VP8 " && bytes[ 23 ] === 0x9d && bytes[ 24 ] === 0x01 && bytes[ 25 ] === 0x2a ) {
        return { width: bytes.readUInt16LE( 26 ) & 0x3fff, height: bytes.readUInt16LE( 28 ) & 0x3fff };
    }
    if ( chunk === "VP8L" && bytes[ 20 ] === 0x2f ) {
        const bits = bytes.readUInt32LE( 21 );
        return { width: ( bits & 0x3fff ) + 1, height: ( ( bits >>> 14 ) & 0x3fff ) + 1 };
    }
    if ( chunk === "VP8X" ) {
        return { width: bytes.readUIntLE( 24, 3 ) + 1, height: bytes.readUIntLE( 27, 3 ) + 1 };
    }
    return null;
}

/**
 * The width and height a JPEG file states in its first frame header, or null when it is not one: it must start with
 * the start-of-image marker, end with the end-of-image marker, and reach a frame header before its scan.
 *
 * @method
 * @param {Buffer} bytes
 * @returns {{width: number, height: number}|null}
 * @private
 */
function jpegDimensions( bytes ) {
    if ( bytes.length < 4 || bytes[ 0 ] !== 0xff || bytes[ 1 ] !== 0xd8 || bytes[ 2 ] !== 0xff || bytes[ bytes.length - 2 ] !== 0xff || bytes[ bytes.length - 1 ] !== 0xd9 ) {
        return null;
    }
    let offset = 2;
    while ( offset + 4 <= bytes.length ) {
        if ( bytes[ offset ] !== 0xff ) {
            return null;
        }
        const marker = bytes[ offset + 1 ];
        if ( marker === 0xff ) {
            // A fill byte before the marker.
            offset += 1;
            continue;
        }
        if ( marker === 0xda || marker === 0xd9 ) {
            // The scan, or the end, before any frame header.
            return null;
        }
        if ( marker === 0x01 || ( marker >= 0xd0 && marker <= 0xd7 ) ) {
            offset += 2;
            continue;
        }
        const length = bytes.readUInt16BE( offset + 2 );
        if ( length < 2 ) {
            return null;
        }
        // Every start-of-frame marker but DHT (C4), JPG (C8) and DAC (CC), which share the range.
        if ( marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc ) {
            return ( offset + 9 <= bytes.length ) ? { width: bytes.readUInt16BE( offset + 7 ), height: bytes.readUInt16BE( offset + 5 ) } : null;
        }
        offset += 2 + length;
    }
    return null;
}

/**
 * Runs a task over every entry, a few at a time, and keeps the answers in order.
 *
 * @method
 * @param {Array<*>} entries
 * @param {function(*): Promise<*>} task
 * @returns {Promise<Array<*>>}
 * @private
 */
function inBatches( entries, task ) {
    const results = [];
    let chain = Promise.resolve();
    for ( let start = 0; start < entries.length; start += READS_IN_FLIGHT ) {
        const batch = entries.slice( start, start + READS_IN_FLIGHT );
        chain = chain.then( () => Promise.all( batch.map( task ) ) ).then( ( answers ) => {
            results.push( ...answers );
        } );
    }
    return chain.then( () => results );
}

/**
 * Feedback about the application: a suggestion, a problem, praise or anything else, from anyone signed in, read by the
 * allowlisted administrators on a screen of their own and e-mailed to them as it arrives. The sender may stay
 * anonymous, and then nothing of them is kept.
 * <br/>
 * The application enables it through `TiWebAppManager#enableFeedback`; the web server hands over the allowlist.
 * Design record: `docs/superpowers/specs/2026-10-19-web-framework-whats-new-feedback-design.md`.
 *
 * @class Feedback
 * @public
 */
class Feedback {

    #enabled = false;
    #admins = [];
    #dateLocales = {};
    #lock = new tools.KeyedLock();

    /* Public interface */

    /**
     * Turns the feature on and registers the event and the notice with the notifications service. The application's
     * `notifications` document holds the rule joining them, as for every notice.
     *
     * @method
     * @param {TiFeedbackOptions} [options]
     * @returns {Feedback} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When `dateLocales` is not a map of language to locale.
     * @public
     */
    enable( options = {} ) {
        const dateLocales = ( options.dateLocales === undefined ) ? {} : options.dateLocales;
        if ( !dateLocales || typeof dateLocales !== "object" || Array.isArray( dateLocales )
            || Object.values( dateLocales ).some( ( locale ) => typeof locale !== "string" || locale === "" ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-feedback-date-locales" } );
        }
        this.#dateLocales = Object.freeze( { ...dateLocales } );
        const service = notificationService.instance;
        service.registerEvent( EVENT.RECEIVED );
        service.registerNotice( NOTICE.RECEIVED, {
            subject: `interface.notice.${ NOTICE.RECEIVED }.subject`,
            text: `interface.notice.${ NOTICE.RECEIVED }.text`,
            link: () => "/app/feedback-inbox",
            format: ( data, language ) => this.noticeValues( data, language ),
            placeholders: [ ...PLACEHOLDERS ]
        } );
        this.#enabled = true;
        return this;
    }

    /**
     * Whether the application turned the feature on.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isEnabled() {
        return this.#enabled;
    }

    /**
     * Takes the deployment's administrators, as the web server reads them (`auth.admins`, an array or the comma list of
     * `TI_WEB_AUTH_ADMINS`), and keeps the entries that are addresses, once each.
     *
     * @method
     * @param {{admins?: (Array<string>|string)}} [settings]
     * @returns {Feedback} this
     * @public
     */
    configure( settings = {} ) {
        const listed = Array.isArray( settings.admins ) ? settings.admins : String( settings.admins || "" ).split( "," );
        this.#admins = [ ...new Set( listed.map( ( entry ) => String( entry || "" ).trim().toLowerCase() ).filter( ( entry ) => ADDRESS.test( entry ) ) ) ];
        return this;
    }

    /**
     * The addresses the notice goes to.
     *
     * @property
     * @returns {Array<string>}
     * @public
     */
    get recipients() {
        return [ ...this.#admins ];
    }

    /**
     * Builds a new item from what the browser sent and who sent it. Anonymous keeps no ID and no name. Only a problem
     * keeps a context, and of it only what the server can vouch for: the version and language are the server's, the
     * screen must be one it knows, and the browser is cut short.
     *
     * @method
     * @param {Object} params `{ kind, text, anonymous, screen, browser }` as sent.
     * @param {Object} sender
     * @param {?TiSessionSubject} sender.subject Who sent it, as the application knows them.
     * @param {string} sender.version The version running.
     * @param {string} sender.language The session's language.
     * @param {(screen: string) => boolean} sender.isScreen Whether a name is a screen the application has.
     * @param {string} feedbackID
     * @param {string} now ISO-8601.
     * @returns {TiFeedbackItem}
     * @throws {TiException} 422 with `error.feedback.kind`, `error.feedback.text-empty` or `error.feedback.text-long`.
     * @public
     */
    newItem( params, { subject, version, language, isScreen }, feedbackID, now ) {
        const kind = String( params && params.kind || "" );
        if ( !Object.values( KIND ).includes( kind ) ) {
            throw refuse( "error.feedback.kind" );
        }
        const text = String( params && params.text || "" ).trim();
        if ( text === "" ) {
            throw refuse( "error.feedback.text-empty" );
        }
        if ( text.length > TEXT_MAX ) {
            throw refuse( "error.feedback.text-long" );
        }
        const anonymous = params.anonymous === true;
        const named = !anonymous && subject && typeof subject.id === "string" && subject.id !== "";
        let context = null;
        if ( kind === KIND.PROBLEM ) {
            const screen = String( params.screen || "" );
            context = {
                screen: ( /^[\w-]{1,64}$/.test( screen ) && typeof isScreen === "function" && isScreen( screen ) ) ? screen : "",
                version: String( version || "" ),
                language: String( language || "" ),
                // A control character becomes a space, so a line break cannot start a line of its own in the list.
                browser: Array.from( String( params.browser || "" ), ( character ) => ( character.charCodeAt( 0 ) < 32 || character.charCodeAt( 0 ) === 127 ) ? " " : character )
                    .join( "" ).trim().slice( 0, BROWSER_MAX )
            };
        }
        return {
            feedbackID: String( feedbackID ),
            kind: kind,
            text: text,
            anonymous: anonymous,
            submittedBy: named ? subject.id : null,
            senderName: named ? String( subject.name || "" ) : null,
            submittedAt: now,
            context: context,
            picture: null,
            status: STATUS.NEW,
            statusChangedAt: null,
            statusChangedBy: null
        };
    }

    /**
     * Reads the picture of the screen a submission carries (CA-544), checking everything the browser was asked to keep
     * to: a `data:` URL of WebP or JPEG in strict base64, whose bytes carry that type's own signature, state dimensions
     * of 1 to {@link PICTURE_MAX_SIDE} pixels a side, and number at most {@link PICTURE_MAX_BYTES}. The browser blanks
     * personal information before it draws the picture; the server can check only that it is the image it says.
     *
     * @method
     * @param {*} value What the submission's `picture` held.
     * @returns {TiFeedbackPicture|null} Null when there is none.
     * @throws {TiException} 422 `error.feedback.picture` for anything else.
     * @public
     */
    readPicture( value ) {
        if ( value === undefined || value === null || value === "" ) {
            return null;
        }
        const match = ( typeof value === "string" && value.length <= 64 + Math.ceil( PICTURE_MAX_BYTES / 3 ) * 4 ) ? PICTURE_DATA_URL.exec( value ) : null;
        if ( !match ) {
            throw refuse( "error.feedback.picture" );
        }
        const type = match[ 1 ];
        const data = match[ 2 ];
        const bytes = Buffer.from( data, "base64" );
        // Node decodes loose base64 without complaint: only the canonical encoding of what it decoded is accepted.
        if ( bytes.length === 0 || bytes.length > PICTURE_MAX_BYTES || bytes.toString( "base64" ) !== data ) {
            throw refuse( "error.feedback.picture" );
        }
        const size = ( type === "image/webp" ) ? webpDimensions( bytes ) : jpegDimensions( bytes );
        if ( !size || size.width < 1 || size.height < 1 || size.width > PICTURE_MAX_SIDE || size.height > PICTURE_MAX_SIDE ) {
            throw refuse( "error.feedback.picture" );
        }
        return { type: type, data: data, bytes: bytes.length, width: size.width, height: size.height };
    }

    /**
     * Whether a value is a status an administrator may give an item.
     *
     * @method
     * @param {*} status
     * @returns {boolean}
     * @public
     */
    isStatus( status ) {
        return Object.values( STATUS ).includes( status );
    }

    /**
     * The items newest first, an item with no time last.
     *
     * @method
     * @param {Array<TiFeedbackItem>} items
     * @returns {Array<TiFeedbackItem>}
     * @public
     */
    newestFirst( items ) {
        return ( Array.isArray( items ) ? items : [] )
            .filter( ( item ) => item && typeof item === "object" && typeof item.feedbackID === "string" )
            .sort( ( first, second ) => String( second.submittedAt || "" ).localeCompare( String( first.submittedAt || "" ) ) );
    }

    /**
     * Stores a new item and e-mails the administrators. The e-mail is raised after the write and never waited for: the
     * item is kept whatever the e-mail does. A picture of the screen is kept with a named item only; an anonymous
     * item's is not read.
     *
     * @method
     * @param {Object} params `{ kind, text, anonymous, screen, browser, picture }` as sent.
     * @param {Object} sender As for {@link Feedback#newItem}, plus the sender's `email`, which is not written to.
     * @returns {Promise<TiFeedbackItem>}
     * @throws {TiException} 422 `error.feedback.picture` for a named item's picture that is not one.
     * @public
     */
    submit( params, sender ) {
        return Promise.resolve().then( () => {
            const item = this.newItem( params || {}, sender, tools.getUUID(), new Date().toISOString() );
            // Anonymous feedback names nobody, and a picture of the sender's own screen could: what only they see, and
            // their own name's length. The form never offers one; one sent all the same is not read, and nothing of it
            // is kept (1.58.1).
            const picture = ( item.anonymous === true ) ? null : this.readPicture( ( params || {} ).picture );
            if ( picture === null ) {
                return cache.instance.setValue( KEY_ITEM + item.feedbackID, item ).then( () => item );
            }
            item.picture = { type: picture.type, bytes: picture.bytes, width: picture.width, height: picture.height };
            // The item first. A picture is found and erased only through its item, so one written first and left alone
            // by a failure or a restart would be kept for good, beyond any erasure. The other way round, the worst left
            // is an item naming a picture that is not there, which reads as no longer available. A picture that cannot
            // be written takes its item back, so the person is told and sends again; and is deleted too, in case the
            // write that failed landed all the same (a timeout). Under the item's key, which erasure takes, so an
            // erasure between the two writes cannot leave the picture behind either (the second review pass).
            return this.#lock.exclusively( item.feedbackID, () => cache.instance.setValue( KEY_ITEM + item.feedbackID, item ).then( () => {
                return cache.instance.setValue( KEY_PICTURE + item.feedbackID, { type: picture.type, data: picture.data } ).catch( ( error ) => {
                    return tools.whenAllSettled( [
                        Promise.resolve().then( () => cache.instance.deleteValue( KEY_PICTURE + item.feedbackID ) ),
                        Promise.resolve().then( () => cache.instance.deleteValue( KEY_ITEM + item.feedbackID ) )
                    ] ).catch( ( cleanup ) => {
                        logger.log( `Feedback ${ item.feedbackID }: what was written could not all be deleted after its picture failed to save.`, logger.logSeverity.WARNING, cleanup );
                    } ).then( () => {
                        throw error;
                    } );
                } );
            } ) ).then( () => item );
        } ).then( ( item ) => {
            this.received( item, { email: sender.email } );
            return item;
        } );
    }

    /**
     * Every item, newest first.
     *
     * @method
     * @returns {Promise<Array<TiFeedbackItem>>}
     * @public
     */
    fetchAll() {
        return Promise.resolve().then( () => cache.instance.matchKeys( KEY_ITEM + "*" ) ).then( ( keys ) => {
            return inBatches( Array.isArray( keys ) ? keys : [], ( key ) => cache.instance.getValue( key ) );
        } ).then( ( items ) => this.newestFirst( items ) );
    }

    /**
     * One item by its ID, or null.
     *
     * @method
     * @param {string} feedbackID
     * @returns {Promise<TiFeedbackItem|null>}
     * @public
     */
    fetch( feedbackID ) {
        const id = String( feedbackID || "" );
        if ( !FEEDBACK_ID.test( id ) ) {
            return Promise.resolve( null );
        }
        return Promise.resolve().then( () => cache.instance.getValue( KEY_ITEM + id ) ).then( ( item ) => {
            return ( item && typeof item === "object" && item.feedbackID === id ) ? item : null;
        } );
    }

    /**
     * The picture of the screen sent with an item, or null: its type, its size in pixels and the image in base64. For
     * the administrators' screen, which asks for one only when it is to be shown. Null for an anonymous item.
     *
     * @method
     * @param {string} feedbackID
     * @returns {Promise<{type: string, data: string, width: number, height: number}|null>}
     * @public
     */
    fetchPicture( feedbackID ) {
        return this.fetch( feedbackID ).then( ( item ) => {
            // Never an anonymous item's, though 1.58.0 kept one: it could say who sent the item (1.58.1).
            if ( item === null || item.anonymous === true || !item.picture || typeof item.picture !== "object" ) {
                return null;
            }
            return Promise.resolve().then( () => cache.instance.getValue( KEY_PICTURE + item.feedbackID ) ).then( ( stored ) => {
                if ( !stored || typeof stored !== "object" || typeof stored.data !== "string" || stored.type !== item.picture.type ) {
                    return null;
                }
                return { type: stored.type, data: stored.data, width: item.picture.width, height: item.picture.height };
            } );
        } );
    }

    /**
     * Gives an item a status, under the item's key, so two administrators changing it at once leave one change.
     * Records who and when.
     *
     * @method
     * @param {string} feedbackID
     * @param {string} status
     * @param {string} changedBy The administrator's user ID.
     * @returns {Promise<TiFeedbackItem>}
     * @throws {TiException} (as a rejection) 422 `error.feedback.status` for a status that is not one; 404 `error.feedback.not-found` for an item that does not exist.
     * @public
     */
    setStatus( feedbackID, status, changedBy ) {
        const id = String( feedbackID || "" ).trim();
        if ( !FEEDBACK_ID.test( id ) || !this.isStatus( status ) ) {
            return Promise.reject( refuse( "error.feedback.status" ) );
        }
        return this.#lock.exclusively( id, () => this.fetch( id ).then( ( item ) => {
            if ( item === null ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "error.feedback.not-found" }, exceptions.httpCode.C_404 );
            }
            const changed = Object.assign( {}, item, { status: status, statusChangedAt: new Date().toISOString(), statusChangedBy: String( changedBy || "" ) } );
            return cache.instance.setValue( KEY_ITEM + id, changed ).then( () => changed );
        } ) );
    }

    /**
     * The items a person sent under their own name: what their export carries. Anonymous ones name nobody and are
     * never found.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<Array<TiFeedbackItem>>}
     * @public
     */
    sentBy( subjectID ) {
        const id = String( subjectID || "" );
        if ( id === "" ) {
            return Promise.resolve( [] );
        }
        return this.fetchAll().then( ( items ) => items.filter( ( item ) => item.anonymous !== true && item.submittedBy === id ) );
    }

    /**
     * Deletes the items a person sent under their own name, for their erasure: they are the person's own words, and
     * any picture of the screen sent with one goes with it. What they sent anonymously cannot be found, and stays.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<number>} How many were deleted.
     * @public
     */
    eraseSentBy( subjectID ) {
        return this.sentBy( subjectID ).then( ( items ) => {
            return tools.whenAllSettled( items.map( ( item ) => this.#lock.exclusively( item.feedbackID, () => tools.whenAllSettled( [
                ( item.picture ) ? cache.instance.deleteValue( KEY_PICTURE + item.feedbackID ) : null,
                cache.instance.deleteValue( KEY_ITEM + item.feedbackID )
            ] ) ) ) ).then( () => items.length );
        } );
    }

    /**
     * Raises the notice for one new item, to every administrator but the sender. An anonymous item names nobody, so
     * nobody is left out. Never rejects: e-mail is a courtesy.
     *
     * @method
     * @param {TiFeedbackItem} item
     * @param {Object} [sender]
     * @param {string} [sender.email] The sender's address, which is not written to.
     * @returns {Promise<number>} The notices queued.
     * @public
     */
    received( item, sender = {} ) {
        if ( !notificationService.instance.isEnabled || !item || typeof item !== "object" ) {
            return Promise.resolve( 0 );
        }
        const own = ( item.anonymous !== true && typeof sender.email === "string" ) ? sender.email.trim().toLowerCase() : "";
        const data = {
            kind: item.kind,
            anonymous: item.anonymous === true,
            senderName: ( item.anonymous === true ) ? "" : String( item.senderName || "" ),
            text: item.text,
            // The day it was sent where the organization is (CA-550), as the inbox shows it. Its first ten characters
            // were the UTC date: the day before, in Sofia, for an item sent after 21:00 UTC (the review pass).
            date: Number.isFinite( Date.parse( item.submittedAt ) ) ? timeZone.dateIn( Date.parse( item.submittedAt ) ) : ""
        };
        let queued = 0;
        return this.#admins.filter( ( address ) => address !== own ).reduce( ( chain, address ) => chain.then( () => {
            // The ID the notifications service logs and keys by may not be an address (`recipient-id-is-an-address`).
            const id = "administrator-" + crypto.createHash( "sha256" ).update( address ).digest( "hex" ).slice( 0, 12 );
            return notificationService.instance.emit( EVENT.RECEIVED, { key: [ item.feedbackID, id ].join( ":" ), recipient: { id: id, email: address }, data: data } ).then( ( count ) => {
                queued += count;
            }, ( error ) => {
                logger.log( `Feedback event '${ EVENT.RECEIVED }' for ${ id } could not be raised.`, logger.logSeverity.WARNING, error );
            } );
        } ), Promise.resolve() ).then( () => queued );
    }

    /**
     * The values the notice's texts read: what kind it is and who sent it, in the reader's language, the text as written,
     * and the day, in the locale the application names for that language.
     *
     * @method
     * @param {Object} data The event's data.
     * @param {string} language
     * @returns {Object<string, string>}
     * @public
     */
    noticeValues( data, language ) {
        const named = data.anonymous !== true && typeof data.senderName === "string" && data.senderName !== "";
        return {
            kind: labelIn( `interface.feedback.kind.${ String( data.kind || "" ) }`, language, String( data.kind || "" ) ),
            sender: named ? data.senderName : labelIn( "interface.feedback.sender.anonymous", language, "Anonymous" ),
            text: String( data.text || "" ),
            date: this.formatDate( data.date, language )
        };
    }

    /**
     * A day written `YYYY-MM-DD` in words, in the locale the application names for the language, else the language's
     * own.
     *
     * @method
     * @param {string} date
     * @param {string} language
     * @returns {string} Empty for anything that is not such a day.
     * @public
     */
    formatDate( date, language ) {
        if ( typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test( date ) ) {
            return "";
        }
        try {
            return new Date( date + "T00:00:00Z" ).toLocaleDateString( this.#dateLocales[ language ] || language, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" } );
        } catch {
            // A language Intl does not know: the date still reaches the reader, as it is stored.
            return date;
        }
    }

}

const instance = new Feedback();
module.exports = Feedback;
Feedback.KIND = KIND;
Feedback.STATUS = STATUS;
Feedback.EVENT = EVENT;
Feedback.NOTICE = NOTICE;
Feedback.PLACEHOLDERS = PLACEHOLDERS;
Feedback.TEXT_MAX = TEXT_MAX;
Feedback.PICTURE_MAX_BYTES = PICTURE_MAX_BYTES;
Feedback.PICTURE_MAX_SIDE = PICTURE_MAX_SIDE;
Feedback.instance = Object.freeze( instance );
