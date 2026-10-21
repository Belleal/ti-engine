export = Feedback;
import type { TiFeedbackItem, TiFeedbackOptions, TiFeedbackPicture, TiSessionSubject } from "#definitions";
/**
 * What a piece of feedback is.
 *
 * @type {Readonly<{SUGGESTION: string, PROBLEM: string, PRAISE: string, OTHER: string}>}
 * @public
 */
declare const KIND: Readonly<{
    SUGGESTION: string;
    PROBLEM: string;
    PRAISE: string;
    OTHER: string;
}>;
/**
 * Where an administrator has put it.
 *
 * @type {Readonly<{NEW: string, IN_PROGRESS: string, DONE: string, DECLINED: string}>}
 * @public
 */
declare const STATUS: Readonly<{
    NEW: string;
    IN_PROGRESS: string;
    DONE: string;
    DECLINED: string;
}>;
/**
 * The event a submission raises.
 *
 * @type {Readonly<{RECEIVED: string}>}
 * @public
 */
declare const EVENT: Readonly<{
    RECEIVED: string;
}>;
/**
 * The one notice: to the administrators, that feedback arrived.
 *
 * @type {Readonly<{RECEIVED: string}>}
 * @public
 */
declare const NOTICE: Readonly<{
    RECEIVED: string;
}>;
/**
 * The names the notice's texts may use.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
declare const PLACEHOLDERS: ReadonlyArray<string>;
/**
 * The longest text, in characters.
 *
 * @type {number}
 * @public
 */
declare const TEXT_MAX: number;
/**
 * The largest picture of the screen, in bytes once decoded: 1,333,336 characters of base64, well inside the 2,000,000
 * bytes D1 keeps in one row.
 *
 * @type {number}
 * @public
 */
declare const PICTURE_MAX_BYTES: number;
/**
 * The longest side of a picture of the screen, in pixels.
 *
 * @type {number}
 * @public
 */
declare const PICTURE_MAX_SIDE: number;
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
declare class Feedback {
    #private;
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
    enable(options?: TiFeedbackOptions): Feedback;
    /**
     * Whether the application turned the feature on.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isEnabled(): boolean;
    /**
     * Takes the deployment's administrators, as the web server reads them (`auth.admins`, an array or the comma list of
     * `TI_WEB_AUTH_ADMINS`), and keeps the entries that are addresses, once each.
     *
     * @method
     * @param {{admins?: (Array<string>|string)}} [settings]
     * @returns {Feedback} this
     * @public
     */
    configure(settings?: {
        admins?: (Array<string> | string);
    }): Feedback;
    /**
     * The addresses the notice goes to.
     *
     * @property
     * @returns {Array<string>}
     * @public
     */
    get recipients(): Array<string>;
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
    newItem(params: Object, { subject, version, language, isScreen }: {
        subject: TiSessionSubject | null;
        version: string;
        language: string;
        isScreen: (screen: string) => boolean;
    }, feedbackID: string, now: string): TiFeedbackItem;
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
    readPicture(value: any): TiFeedbackPicture | null;
    /**
     * Whether a value is a status an administrator may give an item.
     *
     * @method
     * @param {*} status
     * @returns {boolean}
     * @public
     */
    isStatus(status: any): boolean;
    /**
     * The items newest first, an item with no time last.
     *
     * @method
     * @param {Array<TiFeedbackItem>} items
     * @returns {Array<TiFeedbackItem>}
     * @public
     */
    newestFirst(items: Array<TiFeedbackItem>): Array<TiFeedbackItem>;
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
    submit(params: Object, sender: Object): Promise<TiFeedbackItem>;
    /**
     * Every item, newest first.
     *
     * @method
     * @returns {Promise<Array<TiFeedbackItem>>}
     * @public
     */
    fetchAll(): Promise<Array<TiFeedbackItem>>;
    /**
     * One item by its ID, or null.
     *
     * @method
     * @param {string} feedbackID
     * @returns {Promise<TiFeedbackItem|null>}
     * @public
     */
    fetch(feedbackID: string): Promise<TiFeedbackItem | null>;
    /**
     * The picture of the screen sent with an item, or null: its type, its size in pixels and the image in base64. For
     * the administrators' screen, which asks for one only when it is to be shown.
     *
     * @method
     * @param {string} feedbackID
     * @returns {Promise<{type: string, data: string, width: number, height: number}|null>}
     * @public
     */
    fetchPicture(feedbackID: string): Promise<{
        type: string;
        data: string;
        width: number;
        height: number;
    } | null>;
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
    setStatus(feedbackID: string, status: string, changedBy: string): Promise<TiFeedbackItem>;
    /**
     * The items a person sent under their own name: what their export carries. Anonymous ones name nobody and are
     * never found.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<Array<TiFeedbackItem>>}
     * @public
     */
    sentBy(subjectID: string): Promise<Array<TiFeedbackItem>>;
    /**
     * Deletes the items a person sent under their own name, for their erasure: they are the person's own words, and
     * any picture of the screen sent with one goes with it. What they sent anonymously cannot be found, and stays.
     *
     * @method
     * @param {string} subjectID
     * @returns {Promise<number>} How many were deleted.
     * @public
     */
    eraseSentBy(subjectID: string): Promise<number>;
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
    received(item: TiFeedbackItem, sender?: {
        email?: string;
    }): Promise<number>;
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
    noticeValues(data: Object, language: string): Record<string, string>;
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
    formatDate(date: string, language: string): string;
}
declare namespace Feedback {
    export { KIND };
    export { STATUS };
    export { EVENT };
    export { NOTICE };
    export { PLACEHOLDERS };
    export { TEXT_MAX };
    export { PICTURE_MAX_BYTES };
    export { PICTURE_MAX_SIDE };
    export var _a: Readonly<Feedback>;
    export { _a as instance };
}
