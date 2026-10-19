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
const Ajv = require( "ajv" );
const cache = require( "@ti-engine/core/cache" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const authorization = require( "#authorization" );

/** @import { TiWhatsNewMarker, TiWhatsNewNote, TiWhatsNewOptions, TiWhatsNewRelease, TiWhatsNewStatus, TiWhatsNewView } from "#definitions" */

// `{ version, previous, since }`: the release this deployment runs and the one before it. A value, as every record here
// is, so it can be read and replaced on either store.
const KEY_RELEASE = "ti:whats-new:release";

// + 16 hex digits of the subject ID's SHA-256 → `{ version, at }`. A value, because erasure deletes it, and D1 cannot
// delete a document. The digest keeps an address-shaped ID out of the key.
const KEY_SEEN = "ti:whats-new:seen:";

/**
 * The audiences every application has: every session, and the allowlisted administrators. Any other audience is a name
 * the application maps to its roles.
 *
 * @type {Readonly<{EVERYONE: string, ADMIN: string}>}
 * @public
 */
const AUDIENCE = Object.freeze( {
    EVERYONE: "everyone",
    ADMIN: authorization.ADMIN_ROLE
} );

/**
 * What a note tells: something new, something that works better, or something that works again.
 *
 * @type {Readonly<{NEW: string, IMPROVED: string, FIXED: string}>}
 * @public
 */
const KIND = Object.freeze( {
    NEW: "new",
    IMPROVED: "improved",
    FIXED: "fixed"
} );

const VERSION_PATTERN = "^[0-9]+\\.[0-9]+\\.[0-9]+$";

/**
 * What's new: the release notes an application ships, and which of them each person is shown. A deployment remembers
 * the release it runs and the one before it, so the notes of every version in between are new to everyone who has not
 * yet opened them, whatever the deployment skipped.
 * <br/>
 * The application enables it through `TiWebAppManager#enableWhatsNew`, which hands its notes here. The notes are the
 * application's; the rules, the records and the screen are the framework's. Design record:
 * `docs/superpowers/specs/2026-10-19-web-framework-whats-new-feedback-design.md`.
 *
 * @class WhatsNew
 * @public
 */
class WhatsNew {

    #enabled = false;
    #releases = [];
    #baseline = null;
    #audiences = new Map();
    #release = null;

    /* Public interface */

    /**
     * Takes the application's notes and how its roles read as audiences, and turns the feature on. The notes are
     * checked at once: a malformed file stops the start, rather than leaving an empty screen to be noticed later.
     *
     * @method
     * @param {TiWhatsNewOptions} options
     * @returns {WhatsNew} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the notes, the baseline or the audiences are malformed; `issues` lists each problem.
     * @public
     */
    configure( options = {} ) {
        const audiences = ( options.audiences && typeof options.audiences === "object" && !Array.isArray( options.audiences ) ) ? options.audiences : {};
        const issues = [];
        const mapped = new Map();
        Object.keys( audiences ).forEach( ( name ) => {
            const roles = audiences[ name ];
            if ( name === AUDIENCE.EVERYONE || name === AUDIENCE.ADMIN || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test( name ) ) {
                issues.push( `The audience '${ name }' cannot be mapped: it is built in, or not a lower-case name.` );
            } else if ( !Array.isArray( roles ) || roles.length === 0 || roles.some( ( role ) => ( typeof role !== "string" && typeof role !== "number" ) || role === "" ) ) {
                issues.push( `The audience '${ name }' must map to a list of roles.` );
            } else {
                mapped.set( name, Object.freeze( [ ...roles ] ) );
            }
        } );
        if ( options.baseline !== undefined && options.baseline !== null && !new RegExp( VERSION_PATTERN ).test( String( options.baseline ) ) ) {
            issues.push( `The baseline '${ options.baseline }' is not a version written major.minor.patch.` );
        }
        issues.push( ...WhatsNew.validateNotes( options.notes, [ ...mapped.keys() ] ) );
        if ( issues.length > 0 ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-whats-new-notes", issues: issues } );
        }
        this.#releases = structuredClone( options.notes );
        this.#baseline = ( options.baseline === undefined || options.baseline === null ) ? null : String( options.baseline );
        this.#audiences = mapped;
        this.#release = null;
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
     * Compares two versions written `major.minor.patch`. A part that is not a number counts as 0, so a malformed version
     * sorts first rather than throwing.
     *
     * @method
     * @param {string} first
     * @param {string} second
     * @returns {number} Negative when `first` is older, 0 when they are equal, positive when it is newer.
     * @public
     */
    compareVersions( first, second ) {
        const parts = ( version ) => String( version || "" ).split( "." ).map( ( part ) => {
            const value = Number.parseInt( part, 10 );
            return Number.isFinite( value ) ? value : 0;
        } );
        const left = parts( first );
        const right = parts( second );
        for ( let index = 0; index < Math.max( left.length, right.length, 3 ); index++ ) {
            const difference = ( left[ index ] || 0 ) - ( right[ index ] || 0 );
            if ( difference !== 0 ) {
                return difference;
            }
        }
        return 0;
    }

    /**
     * The release record a start leaves behind. Unchanged while the running version is the stored one, which is every
     * restart on the same release. An upgrade makes the stored version the previous one. A rollback keeps the stored
     * previous version only where it is older still, so a note newer than what runs is never offered. No record reads
     * as the baseline the application gave: the release it ran before it had What's new.
     *
     * @method
     * @param {?TiWhatsNewRelease} stored
     * @param {string} running The version this process runs.
     * @param {string} now ISO-8601.
     * @returns {{record: TiWhatsNewRelease, changed: boolean}}
     * @public
     */
    nextRelease( stored, running, now ) {
        const current = ( stored && typeof stored === "object" && typeof stored.version === "string" && stored.version !== "" ) ? stored : null;
        if ( current === null ) {
            return { record: { version: running, previous: this.#baseline, since: now }, changed: true };
        }
        if ( this.compareVersions( current.version, running ) === 0 ) {
            return { record: { version: current.version, previous: this.#versionOrNull( current.previous ), since: current.since || now }, changed: false };
        }
        if ( this.compareVersions( current.version, running ) < 0 ) {
            return { record: { version: running, previous: current.version, since: now }, changed: true };
        }
        const previous = this.#versionOrNull( current.previous );
        const kept = ( previous !== null && this.compareVersions( previous, running ) < 0 ) ? previous : null;
        return { record: { version: running, previous: kept, since: now }, changed: true };
    }

    /**
     * The audiences a person belongs to, from the roles on their session: everyone, the administrators where the
     * session holds the allowlist role, and each name the application maps to a role the session holds.
     *
     * @method
     * @param {Array<string|number>} roles
     * @returns {Set<string>}
     * @public
     */
    audiencesOf( roles ) {
        const held = Array.isArray( roles ) ? roles : [];
        const audiences = new Set( [ AUDIENCE.EVERYONE ] );
        if ( held.includes( AUDIENCE.ADMIN ) ) {
            audiences.add( AUDIENCE.ADMIN );
        }
        this.#audiences.forEach( ( mappedRoles, name ) => {
            if ( mappedRoles.some( ( role ) => held.includes( role ) ) ) {
                audiences.add( name );
            }
        } );
        return audiences;
    }

    /**
     * The notes a person is shown, in their language: those of the versions this release brought, merged into one list,
     * newest version first, then each older version that has a note for them. A version newer than the one running is
     * never shown.
     *
     * @method
     * @param {Object} context
     * @param {TiWhatsNewRelease} context.release
     * @param {Array<string|number>} context.roles
     * @param {string} context.language
     * @param {(screen: string) => boolean} [context.canOpen] Whether the person may open a screen; a note's link is dropped otherwise.
     * @returns {{fresh: Array<TiWhatsNewNote>, earlier: Array<{version: string, notes: Array<TiWhatsNewNote>}>}}
     * @public
     */
    notesFor( { release, roles, language, canOpen } ) {
        const audiences = this.audiencesOf( roles );
        const fresh = [];
        const earlier = [];
        for ( const entry of this.#releases ) {
            if ( this.compareVersions( entry.version, release.version ) > 0 ) {
                continue;
            }
            const notes = entry.notes
                .filter( ( note ) => note.audience.some( ( audience ) => audiences.has( audience ) ) )
                .map( ( note ) => this.#describe( note, entry.version, language, canOpen ) );
            if ( notes.length === 0 ) {
                continue;
            }
            if ( this.isNew( entry.version, release ) ) {
                fresh.push( ...notes );
            } else {
                earlier.push( { version: entry.version, notes: notes } );
            }
        }
        return { fresh: fresh, earlier: earlier };
    }

    /**
     * Whether a version's notes are new in a release: newer than the version before it, and no newer than the one
     * running.
     *
     * @method
     * @param {string} version
     * @param {TiWhatsNewRelease} release
     * @returns {boolean}
     * @public
     */
    isNew( version, release ) {
        if ( this.compareVersions( version, release.version ) > 0 ) {
            return false;
        }
        return release.previous === null || release.previous === undefined || this.compareVersions( version, release.previous ) > 0;
    }

    /**
     * Whether a person's marker says they have seen the running release.
     *
     * @method
     * @param {?TiWhatsNewMarker} marker
     * @param {TiWhatsNewRelease} release
     * @returns {boolean}
     * @public
     */
    hasSeen( marker, release ) {
        return !!marker && typeof marker.version === "string" && this.compareVersions( marker.version, release.version ) >= 0;
    }

    /**
     * The release this process runs and the one before it, read once and kept. The first call that finds the stored
     * record behind the running version writes the new one. While the store cannot be read or written, the release is
     * worked out in memory and not kept, so a later call tries again.
     *
     * @method
     * @param {string} running The version this process runs.
     * @returns {Promise<TiWhatsNewRelease>}
     * @public
     */
    currentRelease( running ) {
        if ( this.#release !== null ) {
            return this.#release;
        }
        const pending = Promise.resolve().then( () => cache.instance.getValue( KEY_RELEASE ) ).then( ( stored ) => {
            const { record, changed } = this.nextRelease( stored, running, new Date().toISOString() );
            if ( !changed ) {
                return record;
            }
            return cache.instance.setValue( KEY_RELEASE, record ).then( () => {
                logger.log( `What's new: this deployment now runs ${ record.version }, after ${ record.previous || "an unknown version" }.`, logger.logSeverity.NOTICE );
                return record;
            } );
        } ).catch( ( error ) => {
            this.#release = null;
            logger.log( "What's new: the release record could not be read or written; working from the running version alone.", logger.logSeverity.WARNING, error );
            return this.nextRelease( null, running, new Date().toISOString() ).record;
        } );
        this.#release = pending;
        return pending;
    }

    /**
     * What a person is shown: the notes new in the running release and the earlier ones, and whether they have seen
     * this release. Reading does not mark it seen; opening the screen does, through {@link WhatsNew#markSeen}.
     *
     * @method
     * @param {Object} reader
     * @param {string} reader.running The version this process runs.
     * @param {string} reader.subjectID Whose marker to read.
     * @param {Array<string|number>} reader.roles
     * @param {string} reader.language
     * @param {(screen: string) => boolean} [reader.canOpen]
     * @returns {Promise<TiWhatsNewView>}
     * @public
     */
    view( { running, subjectID, roles, language, canOpen } ) {
        return Promise.all( [ this.currentRelease( running ), this.markerOf( subjectID ) ] ).then( ( [ release, marker ] ) => {
            const { fresh, earlier } = this.notesFor( { release, roles, language, canOpen } );
            return {
                release: { version: release.version, previous: release.previous || null, since: release.since || null },
                fresh: fresh,
                earlier: earlier,
                seen: this.hasSeen( marker, release )
            };
        } );
    }

    /**
     * What a reminder needs: how many notes are new for the person and not yet seen, 0 once they have seen the release,
     * and the first one's title.
     *
     * @method
     * @param {Object} reader As for {@link WhatsNew#view}.
     * @returns {Promise<TiWhatsNewStatus>}
     * @public
     */
    status( reader ) {
        return this.view( reader ).then( ( loaded ) => {
            const unseen = loaded.seen ? 0 : loaded.fresh.length;
            return { version: loaded.release.version, unseen: unseen, first: ( unseen > 0 ) ? loaded.fresh[ 0 ].title : "" };
        } );
    }

    /**
     * Records that a person has seen the running release: by opening What's new, or by dismissing a reminder.
     *
     * @method
     * @param {string} running The version this process runs.
     * @param {string} subjectID
     * @returns {Promise<{version: string}>}
     * @public
     */
    markSeen( running, subjectID ) {
        return this.currentRelease( running ).then( ( release ) => {
            return cache.instance.setValue( WhatsNew.seenKeyOf( subjectID ), { version: release.version, at: new Date().toISOString() } ).then( () => ( { version: release.version } ) );
        } );
    }

    /**
     * A person's marker, for their personal-data export as much as for the screen.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<TiWhatsNewMarker|null>}
     * @public
     */
    markerOf( subjectID ) {
        return Promise.resolve().then( () => cache.instance.getValue( WhatsNew.seenKeyOf( subjectID ) ) ).then( ( marker ) => {
            return ( marker && typeof marker === "object" && typeof marker.version === "string" ) ? { version: marker.version, at: marker.at || null } : null;
        } );
    }

    /**
     * Deletes a person's marker, for their erasure. What it said is only that they read some release notes.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<boolean>} Whether there was one.
     * @public
     */
    forget( subjectID ) {
        const key = WhatsNew.seenKeyOf( subjectID );
        return Promise.resolve().then( () => cache.instance.getValue( key ) ).then( ( marker ) => {
            if ( marker === undefined || marker === null ) {
                return false;
            }
            return cache.instance.deleteValue( key ).then( () => true );
        } );
    }

    /**
     * The key a person's marker is kept under.
     *
     * @method
     * @param {string} subjectID
     * @returns {string}
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} For an empty ID, which would put everyone's marker under one key.
     * @public
     */
    static seenKeyOf( subjectID ) {
        const id = ( subjectID === undefined || subjectID === null ) ? "" : String( subjectID );
        if ( id === "" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "subject-id-missing" } );
        }
        return KEY_SEEN + crypto.createHash( "sha256" ).update( id ).digest( "hex" ).slice( 0, 16 );
    }

    /**
     * The JSON Schema of an application's notes: one entry per version, newest first, each with notes in one or more
     * languages for one or more audiences.
     *
     * @method
     * @param {string[]} [audiences] The names the application maps, beside `everyone` and `admin`.
     * @returns {Object}
     * @public
     */
    static notesSchema( audiences = [] ) {
        const text = {
            type: "object",
            minProperties: 1,
            propertyNames: { pattern: "^[a-z]{2}$" },
            additionalProperties: { type: "string", minLength: 1 }
        };
        return {
            type: "array",
            items: {
                type: "object",
                required: [ "version", "notes" ],
                additionalProperties: false,
                properties: {
                    version: { type: "string", pattern: VERSION_PATTERN },
                    notes: {
                        type: "array",
                        items: {
                            type: "object",
                            required: [ "id", "kind", "audience", "title", "text" ],
                            additionalProperties: false,
                            properties: {
                                id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
                                kind: { enum: Object.values( KIND ) },
                                audience: {
                                    type: "array",
                                    minItems: 1,
                                    uniqueItems: true,
                                    items: { enum: [ AUDIENCE.EVERYONE, AUDIENCE.ADMIN, ...audiences ] }
                                },
                                screen: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
                                title: text,
                                text: text
                            }
                        }
                    }
                }
            }
        };
    }

    /**
     * Checks an application's notes against {@link WhatsNew.notesSchema}, and what a schema cannot say: the versions
     * newest first, each once, and a note's ID once within its version.
     *
     * @method
     * @param {*} notes
     * @param {string[]} [audiences] The names the application maps.
     * @returns {string[]} One sentence per problem; empty when there is none.
     * @public
     */
    static validateNotes( notes, audiences = [] ) {
        const validate = new Ajv( { allErrors: true } ).compile( WhatsNew.notesSchema( audiences ) );
        if ( !validate( notes ) ) {
            return validate.errors.map( ( error ) => `The notes ${ error.instancePath || "" } ${ error.message }.`.replace( /\s+/g, " " ) );
        }
        const issues = [];
        const ordering = new WhatsNew();
        notes.forEach( ( entry, index ) => {
            if ( index > 0 && ordering.compareVersions( notes[ index - 1 ].version, entry.version ) <= 0 ) {
                issues.push( `The notes of ${ entry.version } come after ${ notes[ index - 1 ].version }: versions go newest first, each once.` );
            }
            const ids = entry.notes.map( ( note ) => note.id );
            ids.filter( ( id, position ) => ids.indexOf( id ) !== position ).forEach( ( id ) => {
                issues.push( `The note '${ id }' appears twice in ${ entry.version }.` );
            } );
        } );
        return issues;
    }

    /* Private interface */

    /**
     * A note as the browser shows it: its texts in one language, else English, else the first it has.
     *
     * @method
     * @param {Object} note
     * @param {string} version
     * @param {string} language
     * @param {(screen: string) => boolean} [canOpen]
     * @returns {TiWhatsNewNote}
     */
    #describe( note, version, language, canOpen ) {
        const textOf = ( texts ) => texts[ language ] || texts.en || Object.values( texts )[ 0 ];
        const screen = ( typeof note.screen === "string" && ( typeof canOpen !== "function" || canOpen( note.screen ) ) ) ? note.screen : null;
        return {
            id: note.id,
            version: version,
            kind: note.kind,
            title: textOf( note.title ),
            text: textOf( note.text ),
            screen: screen
        };
    }

    /**
     * A version as stored, or null for anything else.
     *
     * @method
     * @param {*} value
     * @returns {?string}
     */
    #versionOrNull( value ) {
        return ( typeof value === "string" && value !== "" ) ? value : null;
    }

}

const instance = new WhatsNew();
module.exports = WhatsNew;
WhatsNew.AUDIENCE = AUDIENCE;
WhatsNew.KIND = KIND;
WhatsNew.instance = Object.freeze( instance );
