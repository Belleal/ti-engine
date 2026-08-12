/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The email-capture store -- one primitive serving preorders, newsletter signups and beta-reader lists.
 *
 * This module holds personal data, so its rules are stricter than the rest of the engine and are worth stating
 * plainly:
 *
 *   - NO IP ADDRESS IS EVER STORED. Not as a field, not "temporarily", not for rate limiting. The handler never
 *     reads one, so there is nothing to leak or to erase later.
 *   - `consentAt` IS STAMPED SERVER-SIDE. A client-supplied timestamp is discarded: consent evidence that the
 *     client can write is not evidence. The checkbox is the consent; the stamp is the record of it.
 *   - ONLY THE SCHEMA'S FIELDS ARE PERSISTED. The submitted object is copied field by field, never merged, so an
 *     extra field in a POST body cannot ride along into storage.
 *   - DEDUPE IS ON (email, purpose), case-insensitively. Signing up twice is not an error and must not read as one.
 *   - ERASURE IS BY EMAIL ACROSS EVERY PURPOSE, so a deletion request is one action rather than one per list.
 *
 * Records live in a single RedisJSON document keyed by a deterministic id derived from (email, purpose) -- so the
 * dedupe check is a key lookup rather than a scan, and the raw email never appears in a Redis key or JSON path.
 */

const { createHash } = require( "node:crypto" );
const { validateCapture } = require( "#schema" );

const DEFAULT_KEY = "ti:content:capture:records";

// The only fields ever written. Anything else in the submitted object is dropped rather than stored.
const PERSISTED_FIELDS = [ "email", "purpose", "edition", "source", "locale" ];

class CaptureStore {

    #cache;
    #key;

    /**
     * @param {{ cache?: Object, key?: string }} [options]  `cache` defaults to the core RedisJSON singleton; inject
     *        a substitute to exercise the store without a live Redis.
     */
    constructor( options ) {
        const opts = options || {};
        this.#cache = opts.cache || require( "@ti-engine/core/cache" ).instance;
        this.#key = opts.key || DEFAULT_KEY;
    }

    /* Public interface */

    /**
     * Records a capture.
     *
     * @param {Object} submission  The submitted fields, plus a truthy `consent`.
     * @param {{ now?: string }} [context]  `now` overrides the timestamp, for deterministic tests only.
     * @returns {Promise<{ status: string, record?: Object, errors?: string[] }>}
     *          status is "success" | "duplicate" | "error".
     */
    submit( submission, context ) {
        const source = ( submission && typeof submission === "object" ) ? submission : {};

        // Consent is a precondition, not a field to be copied in. Without it there is nothing lawful to store.
        if ( !CaptureStore.isConsentGiven( source.consent ) ) {
            return Promise.resolve( { status: "error", errors: [ "consent is required" ] } );
        }

        const email = CaptureStore.normalizeEmail( source.email );
        if ( !CaptureStore.isPlausibleEmail( email ) ) {
            return Promise.resolve( { status: "error", errors: [ "a valid email address is required" ] } );
        }

        const timestamp = ( context && context.now ) || new Date().toISOString();
        const record = {};
        for ( const field of PERSISTED_FIELDS ) {
            if ( source[ field ] !== undefined && source[ field ] !== null && source[ field ] !== "" ) {
                record[ field ] = String( source[ field ] );
            }
        }
        record.email = email;
        // Stamped here, never taken from the submission -- a client-written consent timestamp is not evidence.
        record.consentAt = timestamp;
        record.createdAt = timestamp;

        const validation = validateCapture( record );
        if ( validation.valid === false ) {
            return Promise.resolve( { status: "error", errors: validation.errors } );
        }

        const id = CaptureStore.recordId( email, record.purpose );
        return this.#readAll().then( ( records ) => {
            if ( records[ id ] ) {
                // A returning reader did nothing wrong; the caller renders this differently from an error.
                return { status: "duplicate", record: records[ id ] };
            }
            // RedisJSON refuses to create a nested path in a document that does not exist yet ("new objects must be
            // created at the root"), so the very first capture on a fresh deployment has to write the whole map.
            // Every later one edits a single path and leaves concurrent writes alone.
            const write = ( Object.keys( records ).length === 0 )
                ? this.#cache.setJSON( this.#key, { [ id ]: record } )
                : this.#cache.editJSON( this.#key, record, [ id ] );
            return Promise.resolve( write ).then( () => ( { status: "success", record: record } ) );
        } ).catch( ( error ) => {
            // Reported rather than thrown, because every other outcome of submit() is a status the caller renders.
            // What must never happen is a read failure reaching the whole-document write above: "empty" would then
            // mean "first capture on a fresh deployment" and the existing list would be replaced by this one record.
            return { status: "error", errors: [ String( ( error && error.message ) || error ) ] };
        } );
    }

    /**
     * Every stored record, newest first.
     *
     * @returns {Promise<Object[]>}
     */
    list() {
        return this.#readAll().then( ( records ) => Object.keys( records )
            .map( ( id ) => Object.assign( { id: id }, records[ id ] ) )
            .sort( ( a, b ) => String( b.createdAt || "" ).localeCompare( String( a.createdAt || "" ) ) ) );
    }

    /**
     * Deletes one record by its id.
     *
     * @param {string} id
     * @returns {Promise<boolean>}  Whether a record was removed.
     */
    delete( id ) {
        return this.#readAll().then( ( records ) => {
            if ( !records[ id ] ) {
                return false;
            }
            delete records[ id ];
            return this.#cache.setJSON( this.#key, records ).then( () => true );
        } );
    }

    /**
     * Erases every record for an email address, across all purposes.
     *
     * One action rather than one per list: a person asking to be forgotten is asking about themselves, not about
     * whichever lists they happen to remember joining.
     *
     * @param {string} email
     * @returns {Promise<number>}  How many records were removed.
     */
    eraseByEmail( email ) {
        const normalized = CaptureStore.normalizeEmail( email );
        return this.#readAll().then( ( records ) => {
            const doomed = Object.keys( records ).filter( ( id ) => CaptureStore.normalizeEmail( records[ id ].email ) === normalized );
            if ( doomed.length === 0 ) {
                return 0;
            }
            doomed.forEach( ( id ) => delete records[ id ] );
            return this.#cache.setJSON( this.#key, records ).then( () => doomed.length );
        } );
    }

    /* Static interface */

    /**
     * Lower-cases and trims an address, so dedupe and erasure both treat `A@B.com ` and `a@b.com` as one person.
     *
     * @method
     * @static
     * @param {string} email
     * @returns {string}
     */
    static normalizeEmail( email ) {
        return String( email === null || email === undefined ? "" : email ).trim().toLowerCase();
    }

    /**
     * A deliberately loose shape check. Address validity is ultimately proven by delivery, not by a regex, and an
     * over-strict pattern rejects real addresses.
     *
     * @method
     * @static
     * @param {string} email
     * @returns {boolean}
     */
    static isPlausibleEmail( email ) {
        return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test( String( email || "" ) );
    }

    /**
     * Whether a submitted consent value counts as ticked. An unchecked HTML checkbox sends nothing at all, so only
     * an explicit affirmative passes.
     *
     * @method
     * @static
     * @param {*} value
     * @returns {boolean}
     */
    static isConsentGiven( value ) {
        return value === true || value === "1" || value === "on" || value === "true" || value === "yes";
    }

    /**
     * The deterministic record id for an (email, purpose) pair -- which is also the dedupe rule, expressed once.
     * Hashed so the address never appears in a Redis key or a JSON path.
     *
     * @method
     * @static
     * @param {string} email
     * @param {string} purpose
     * @returns {string}
     */
    static recordId( email, purpose ) {
        return createHash( "sha256" )
            .update( CaptureStore.normalizeEmail( email ) + "\u0000" + String( purpose || "" ) )
            .digest( "hex" )
            .slice( 0, 32 );
    }

    /* Private interface */

    /**
     * The record map, or an empty map when nothing has been stored yet.
     *
     * A FAILURE TO READ IS NOT AN EMPTY MAP, and this used to swallow the difference. Every mutating method treats
     * what comes back as authoritative and then writes the whole document, so a transient Redis outage read as `{}`
     * meant: `submit` took its first-write branch and replaced every stored capture with one record, and
     * `eraseByEmail` found nothing to erase and answered `0` to a right-to-be-forgotten request it never carried
     * out. Both are silent -- the caller sees a success either way.
     *
     * So only a document that genuinely is not there resolves empty; anything else rejects and the caller decides.
     *
     * @returns {Promise<Object>}
     */
    #readAll() {
        return Promise.resolve( this.#cache.getJSON( this.#key, "$" ) ).then( ( result ) => {
            const source = ( result instanceof Array ) ? result[ 0 ] : result;
            return ( source && typeof source === "object" ) ? source : {};
        } );
    }
}

module.exports = CaptureStore;
CaptureStore.PERSISTED_FIELDS = PERSISTED_FIELDS;
