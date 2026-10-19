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
const notificationService = require( "#notification-service" );

/** @import { TiFeedbackItem, TiFeedbackOptions, TiSessionSubject } from "#definitions" */

// + feedback ID → the item. A value, never a JSON document: erasure deletes items, and D1 cannot delete a document.
// One document holding every item would be one read, but D1 keeps a document in one row, capped near 2 MB.
const KEY_ITEM = "ti:feedback:item:";

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

// An allowlist entry that is an e-mail address. An entry is matched against a sign-in's user ID, user name or e-mail,
// so not every entry is one, and only one that is can be written to.
const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
            status: STATUS.NEW,
            statusChangedAt: null,
            statusChangedBy: null
        };
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
     * item is kept whatever the e-mail does.
     *
     * @method
     * @param {Object} params `{ kind, text, anonymous, screen, browser }` as sent.
     * @param {Object} sender As for {@link Feedback#newItem}, plus the sender's `email`, which is not written to.
     * @returns {Promise<TiFeedbackItem>}
     * @public
     */
    submit( params, sender ) {
        return Promise.resolve().then( () => {
            const item = this.newItem( params || {}, sender, tools.getUUID(), new Date().toISOString() );
            return cache.instance.setValue( KEY_ITEM + item.feedbackID, item ).then( () => {
                this.received( item, { email: sender.email } );
                return item;
            } );
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
     * Deletes the items a person sent under their own name, for their erasure: they are the person's own words. What
     * they sent anonymously cannot be found, and stays.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<number>} How many were deleted.
     * @public
     */
    eraseSentBy( subjectID ) {
        return this.sentBy( subjectID ).then( ( items ) => {
            return tools.whenAllSettled( items.map( ( item ) => this.#lock.exclusively( item.feedbackID, () => cache.instance.deleteValue( KEY_ITEM + item.feedbackID ) ) ) )
                .then( () => items.length );
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
            date: String( item.submittedAt || "" ).slice( 0, 10 )
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
Feedback.instance = Object.freeze( instance );
