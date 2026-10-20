export = EmailLink;
import type { SettingsAuthEmailLink } from "#web-server";
/**
 * The notice that carries the link.
 *
 * @type {string}
 * @public
 */
declare const NOTICE: string;
/**
 * The label keys of the notice's subject and text. Both must resolve in the deployment's language, or the method is
 * not enabled (see {@link EmailLink#readiness}).
 *
 * @type {Readonly<{subject: string, text: string}>}
 * @public
 */
declare const NOTICE_LABELS: Readonly<{
    subject: string;
    text: string;
}>;
/**
 * The name of the link's fragment, and of the query parameter that answers a request for one.
 *
 * @type {string}
 * @public
 */
declare const PARAMETER: string;
/**
 * How a request for a link ended, as the sign-in page is told in `?email-link=`.
 *
 * @type {Readonly<{SENT: string, LIMITED: string, INVALID_ADDRESS: string, UNAVAILABLE: string}>}
 * @public
 */
declare const OUTCOME: Readonly<{
    SENT: string;
    LIMITED: string;
    INVALID_ADDRESS: string;
    UNAVAILABLE: string;
}>;
/**
 * The settings in effect when the configuration names none.
 *
 * @type {Readonly<SettingsAuthEmailLink>}
 * @public
 */
declare const DEFAULTS: Readonly<SettingsAuthEmailLink>;
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
declare class EmailLink {
    #private;
    /**
     * @constructor
     * @param {SettingsAuthEmailLink} [settings] `auth.emailLink`, its `allowedDomains` already a list of lower-case
     *        domains (see {@link AuthManager.toDomainList}).
     * @param {Object} [options] For tests.
     * @param {function(): number} [options.now] The clock, in milliseconds.
     */
    constructor(settings?: SettingsAuthEmailLink, options?: Object);
    /**
     * The settings in effect, after the defaults and the checks of {@link EmailLink.resolveSettings}.
     *
     * @property
     * @returns {Readonly<SettingsAuthEmailLink>}
     * @public
     */
    get settings(): Readonly<SettingsAuthEmailLink>;
    /**
     * Registers the notice that carries the link with the notification service, which makes its texts editable in the
     * `notifications` document like any other notice's.
     *
     * @method
     * @returns {EmailLink} this
     * @public
     */
    registerNotice(): EmailLink;
    /**
     * Why a link could not be sent with the deployment as it is, or `null` when it could. A link needs a transport,
     * the public URL it starts from, and the notice's subject and text in the deployment's language.
     *
     * @method
     * @returns {string|null}
     * @public
     */
    readiness(): string | null;
    /**
     * Asks for a link to be sent to an address. Resolves with the outcome the sign-in page shows, never rejects: a
     * failure to store or to send is logged and answered as {@link OUTCOME}`.UNAVAILABLE`.
     * <br/>
     * **The outcome never says whether the address may sign in.** An address outside `allowedDomains` is sent nothing
     * and answered `sent`, like one inside it. Over either hourly limit nothing is sent, whatever the address.
     *
     * @method
     * @param {Object} request
     * @param {*} request.email As the form sent it.
     * @param {string} [request.client] The client's network address, which the client limit counts.
     * @param {string} [request.language] The language the request was answered in, for the e-mail and the session.
     * @returns {Promise<string>} One of {@link OUTCOME}.
     * @public
     */
    request({ email, client, language }?: {
        email: any;
        client?: string;
        language?: string;
    }): Promise<string>;
    /**
     * Spends a token: the first request to delete its entry gets the address it was sent to, every later one gets
     * `null`, as does a token that is malformed, unknown or expired.
     *
     * @method
     * @param {*} token As the form sent it.
     * @returns {Promise<{address: string, language: (string|undefined)}|null>}
     * @public
     */
    redeem(token: any): Promise<{
        address: string;
        language: (string | undefined);
    } | null>;
    /**
     * The answer to a request for a link: the sign-in page, told how the request ended.
     *
     * @method
     * @param {string} outcome One of {@link OUTCOME}.
     * @returns {string}
     * @public
     */
    answerFor(outcome: string): string;
    /**
     * Reads `auth.emailLink` into the settings in effect: each missing or malformed value takes its default, with a
     * warning for a malformed one. Pure, so the rules are testable without a server.
     *
     * @method
     * @param {SettingsAuthEmailLink} [settings]
     * @returns {{settings: Readonly<SettingsAuthEmailLink>, warnings: string[]}}
     * @public
     */
    static resolveSettings(settings?: SettingsAuthEmailLink): {
        settings: Readonly<SettingsAuthEmailLink>;
        warnings: string[];
    };
    /**
     * An address as the method keeps it: trimmed and lower-cased, or `null` when it is not one. Lower-cased whole,
     * although a mailbox's local part may in principle be case-sensitive: no provider a person is likely to use treats
     * it so, and two spellings of one address must be one person.
     *
     * @method
     * @param {*} value
     * @returns {string|null}
     * @public
     */
    static normalizeAddress(value: any): string | null;
    /**
     * What the log names a value by, an address or a client's network address: the first 16 hex digits of its SHA-256,
     * as the notification service names a recipient.
     *
     * @method
     * @param {string} value
     * @returns {string}
     * @public
     */
    static subjectOf(value: string): string;
    /**
     * The user ID of the person an address signs in: `email:` and the first 32 hex digits of its SHA-256. Stable, so
     * the same address is the same user at every sign-in, and not the address, because the framework writes user IDs
     * to its log.
     *
     * @method
     * @param {string} address As {@link EmailLink.normalizeAddress} returns it.
     * @returns {string}
     * @public
     */
    static userIDOf(address: string): string;
}
declare namespace EmailLink {
    export { NOTICE };
    export { NOTICE_LABELS };
    export { PARAMETER };
    export { OUTCOME };
    export { DEFAULTS };
}
