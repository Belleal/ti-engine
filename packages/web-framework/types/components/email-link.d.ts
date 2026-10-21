export = EmailLink;
import type { SettingsAuthEmailLink } from "#web-server";
import type { TiEmailLinkRequest, TiEmailLinkRedeemed } from "#definitions";
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
 * What the sign-in page is told in `?email-link=`: how a request for a link ended, or that a link could not be used.
 *
 * @type {Readonly<{SENT: string, LIMITED: string, INVALID_ADDRESS: string, UNAVAILABLE: string, EXPIRED: string}>}
 * @public
 */
declare const OUTCOME: Readonly<{
    SENT: string;
    LIMITED: string;
    INVALID_ADDRESS: string;
    UNAVAILABLE: string;
    EXPIRED: string;
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
     * @param {SettingsAuthEmailLink} [settings] `auth.emailLink`, its `allowedDomains` already normalized by
     *        {@link AuthManager.toDomainList}, which is the one place a domain list is read.
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
     * Why a link could not be sent with the deployment as it is, or `null` when it could. A link needs a transport
     * that delivers mail, the public URL it starts from, and the notice's subject and text in the deployment's
     * language. The `log` transport delivers nothing, so on it nobody could ever follow a link.
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
    request({ email, client, language }?: TiEmailLinkRequest): Promise<string>;
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
    peek(token: any): Promise<string | null>;
    /**
     * Spends a token: the first request to delete its entry gets the address it was sent to, every later one gets
     * `null`, as does a token that is malformed, unknown or expired, or whose address's domain may no longer sign in.
     *
     * @method
     * @param {*} token As the form sent it.
     * @returns {Promise<TiEmailLinkRedeemed|null>}
     * @public
     */
    redeem(token: any): Promise<TiEmailLinkRedeemed | null>;
    /**
     * Where the browser is sent with an answer about a link: the sign-in page, told the outcome.
     *
     * @method
     * @param {string} outcome One of {@link OUTCOME}.
     * @returns {string}
     * @public
     */
    static answerFor(outcome: string): string;
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
     * it so, and two spellings of one address must be one person. Printable ASCII only (see {@link PRINTABLE_ASCII}).
     *
     * @method
     * @param {*} value
     * @returns {string|null}
     * @public
     */
    static normalizeAddress(value: any): string | null;
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
    static subjectOf(value: string): string;
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
    static userIDOf(address: string): string;
}
declare namespace EmailLink {
    export { NOTICE };
    export { NOTICE_LABELS };
    export { PARAMETER };
    export { OUTCOME };
    export { DEFAULTS };
}
