export = WhatsNew;
import type { TiWhatsNewMarker, TiWhatsNewNote, TiWhatsNewOptions, TiWhatsNewRelease, TiWhatsNewStatus, TiWhatsNewView } from "#definitions";
/**
 * The audiences every application has: every session, and the allowlisted administrators. Any other audience is a name
 * the application maps to its roles.
 *
 * @type {Readonly<{EVERYONE: string, ADMIN: string}>}
 * @public
 */
declare const AUDIENCE: Readonly<{
    EVERYONE: string;
    ADMIN: string;
}>;
/**
 * What a note tells: something new, something that works better, or something that works again.
 *
 * @type {Readonly<{NEW: string, IMPROVED: string, FIXED: string}>}
 * @public
 */
declare const KIND: Readonly<{
    NEW: string;
    IMPROVED: string;
    FIXED: string;
}>;
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
declare class WhatsNew {
    #private;
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
    configure(options?: TiWhatsNewOptions): WhatsNew;
    /**
     * Whether the application turned the feature on.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isEnabled(): boolean;
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
    compareVersions(first: string, second: string): number;
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
    nextRelease(stored: TiWhatsNewRelease | null, running: string, now: string): {
        record: TiWhatsNewRelease;
        changed: boolean;
    };
    /**
     * The audiences a person belongs to, from the roles on their session: everyone, the administrators where the
     * session holds the allowlist role, and each name the application maps to a role the session holds.
     *
     * @method
     * @param {Array<string|number>} roles
     * @returns {Set<string>}
     * @public
     */
    audiencesOf(roles: Array<string | number>): Set<string>;
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
    notesFor({ release, roles, language, canOpen }: {
        release: TiWhatsNewRelease;
        roles: Array<string | number>;
        language: string;
        canOpen?: (screen: string) => boolean;
    }): {
        fresh: Array<TiWhatsNewNote>;
        earlier: Array<{
            version: string;
            notes: Array<TiWhatsNewNote>;
        }>;
    };
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
    isNew(version: string, release: TiWhatsNewRelease): boolean;
    /**
     * Whether a person's marker says they have seen the running release.
     *
     * @method
     * @param {?TiWhatsNewMarker} marker
     * @param {TiWhatsNewRelease} release
     * @returns {boolean}
     * @public
     */
    hasSeen(marker: TiWhatsNewMarker | null, release: TiWhatsNewRelease): boolean;
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
    currentRelease(running: string): Promise<TiWhatsNewRelease>;
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
    view({ running, subjectID, roles, language, canOpen }: {
        running: string;
        subjectID: string;
        roles: Array<string | number>;
        language: string;
        canOpen?: (screen: string) => boolean;
    }): Promise<TiWhatsNewView>;
    /**
     * What a reminder needs: how many notes are new for the person and not yet seen, 0 once they have seen the release,
     * and the first one's title.
     *
     * @method
     * @param {Object} reader As for {@link WhatsNew#view}.
     * @returns {Promise<TiWhatsNewStatus>}
     * @public
     */
    status(reader: Object): Promise<TiWhatsNewStatus>;
    /**
     * Records that a person has seen the running release: by opening What's new, or by dismissing a reminder.
     *
     * @method
     * @param {string} running The version this process runs.
     * @param {string} subjectID
     * @returns {Promise<{version: string}>}
     * @public
     */
    markSeen(running: string, subjectID: string): Promise<{
        version: string;
    }>;
    /**
     * A person's marker, for their personal-data export as much as for the screen.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<TiWhatsNewMarker|null>}
     * @public
     */
    markerOf(subjectID: string): Promise<TiWhatsNewMarker | null>;
    /**
     * Deletes a person's marker, for their erasure. What it said is only that they read some release notes.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<boolean>} Whether there was one.
     * @public
     */
    forget(subjectID: string): Promise<boolean>;
    /**
     * The key a person's marker is kept under.
     *
     * @method
     * @param {string} subjectID
     * @returns {string}
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} For an empty ID, which would put everyone's marker under one key.
     * @public
     */
    static seenKeyOf(subjectID: string): string;
    /**
     * The JSON Schema of an application's notes: one entry per version, newest first, each with notes in one or more
     * languages for one or more audiences.
     *
     * @method
     * @param {string[]} [audiences] The names the application maps, beside `everyone` and `admin`.
     * @returns {Object}
     * @public
     */
    static notesSchema(audiences?: string[]): Object;
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
    static validateNotes(notes: any, audiences?: string[]): string[];
}
declare namespace WhatsNew {
    export { AUDIENCE };
    export { KIND };
    export var _a: Readonly<WhatsNew>;
    export { _a as instance };
}
