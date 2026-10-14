import type { TiLocalizationLanguage } from "@ti-engine/core/localization";
export type TiSessionCallback = (error?: Error | null) => void;
export type TiSession = {
    id: string;
    user?: Object;
    language?: TiLocalizationLanguage;
    cookie?: Object;
    oidc?: Object;
    csrfToken?: string;
    regenerate: (callback: TiSessionCallback) => TiSession;
    destroy: (callback: TiSessionCallback) => TiSession;
    save: (callback?: TiSessionCallback) => TiSession;
};
export type TiInfoItem = {
    label: string;
    value?: string;
    /**
     * Renders the value as a link to this target. Only `http:`, `https:` and `mailto:` are
     * honoured — any other scheme is dropped client-side and the item degrades to plain text.
     */
    href?: string;
    /**
     * Span the full width of the section grid instead of one column.
     */
    wide?: boolean;
    /**
     * Render the value in the monospaced face (IDs, versions, hashes).
     */
    mono?: boolean;
    /**
     * Render the value as a dimmed hint rather than primary text.
     */
    muted?: boolean;
};
export type TiInfoSection = {
    title: string;
    /**
     * Optional intro line under the section title.
     */
    description?: string;
    /**
     * Optional `ti-icon` variant name for the section head.
     */
    icon?: string;
    /**
     * Claim the full row of the two-up section grid instead of one column.
     */
    wide?: boolean;
    /**
     * A section with no items is dropped rather than rendered empty.
     */
    items: TiInfoItem[];
};
export type TiProfileIdentity = {
    name: string;
    /**
     * Meta line under the name (e.g. `role family · specialization · unit`).
     */
    subtitle?: string;
    /**
     * Secondary line under the subtitle (e.g. the corporate e-mail).
     */
    caption?: string;
    /**
     * Stable seed for the deterministic avatar colour; defaults to the name.
     */
    avatarSeed?: string;
    /**
     * Small qualifier rendered inside the meta line.
     */
    badge?: {
        text: string;
        tone?: string;
    };
    /**
     * Pills beside the name.
     */
    tags?: Array<{
        text: string;
        tone?: string;
        dot?: boolean;
        mono?: boolean;
    }>;
};
export type TiProfileInfo = {
    identity: TiProfileIdentity;
    sections: TiInfoSection[];
};
export type TiApplicationInfo = {
    /**
     * Display name of the application.
     */
    name: string;
    /**
     * The npm package name it was resolved from.
     */
    packageName: string;
    version: string;
    releaseDate: string;
    description: string;
    license: string;
    homepage: string;
    author: string;
    /**
     * Framework component versions.
     */
    components: Array<{
        name: string;
        version: string;
    }>;
    /**
     * Runtime facts (node/platform/instance), or `null` when withheld.
     */
    runtime: Object | null;
    /**
     * Application-contributed extra sections.
     */
    sections: TiInfoSection[];
};
export type TiLabelsBundle = {
    /**
     * The first 16 hex characters of the SHA-256 of `body` — the catalogue's address.
     */
    hash: string;
    /**
     * Where the catalogue is served: `/app/labels/<hash>`, answered `immutable` for this hash.
     */
    url: string;
    /**
     * The serialized label tree.
     */
    body: string;
};
export type TiMailAddress = {
    email: string;
    name?: string;
};
export type TiMailMessage = {
    /**
     * Absent when no sender is configured; a transport may supply its own.
     */
    from?: string | TiMailAddress;
    to: string | TiMailAddress;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
};
export type TiMailTransport = {
    name: string;
    send: (message: TiMailMessage) => Promise<{
        messageId: string;
    }>;
};
export type TiNotificationRecipient = {
    /**
     * The application's ID for the person. It is what the logs and the ledger name, so it must
     * never be an address: an ID holding `@` is refused.
     */
    id: string;
    email: string;
    /**
     * Shown beside the address.
     */
    name?: string;
    /**
     * The deployment's language unless stated.
     */
    language?: TiLocalizationLanguage;
};
export type TiNoticeDefinition = {
    /**
     * The label key of the subject, with `{name}` placeholders.
     */
    subject: string;
    /**
     * The label key of the text, with `{name}` placeholders. A blank line starts a paragraph.
     */
    text: string;
    /**
     * The path the notice links to, joined to the public URL.
     */
    link?: (data: Object) => string;
    /**
     * The
     * values the placeholders read, in the recipient's language. Without it, they read the notice's data as
     * given. A label it reads through `label` honours an administrator's edit of it; one read straight from the
     * catalogue does not.
     */
    format?: (data: Object, language: TiLocalizationLanguage, label: (key: string) => string) => Object;
    /**
     * The names the subject and the text may use. Declared, they make both editable
     * through the `notifications` document, and an edit using another name is refused.
     */
    placeholders?: string[];
    /**
     * The other label keys `format` reads, each with the names it may use.
     * Each becomes editable as well.
     */
    labels?: Record<string, string[]>;
};
export type TiNoticeTexts = Record<string, Record<string, string>>;
export type TiEditableNoticeText = {
    /**
     * The label key.
     */
    key: string;
    part: "subject" | "text" | "label" | "action" | "footer";
    /**
     * The notices that use it; none for the layout's button and footer.
     */
    notices: string[];
    /**
     * The names it may use, or `null` when its notice declared none.
     */
    placeholders: string[] | null;
    /**
     * Whether it may hold a line break.
     */
    multiline: boolean;
};
export type TiNoticeLayoutColors = {
    /**
     * The wordmark's band and the button.
     */
    brand?: string;
    /**
     * The wordmark and the button's label.
     */
    brandText?: string;
    /**
     * The rule under the band.
     */
    accent?: string;
    /**
     * Around the card.
     */
    background?: string;
    /**
     * The card.
     */
    surface?: string;
    text?: string;
    /**
     * The footer and the link under the button.
     */
    muted?: string;
    /**
     * The card's edge.
     */
    border?: string;
};
export type TiNoticeLayout = {
    /**
     * The application's name, set as a wordmark at the top. Without it there is no band.
     */
    name?: string;
    colors?: TiNoticeLayoutColors;
    /**
     * The wordmark's font family list, such as `Georgia, serif`. Nothing is loaded for it.
     */
    font?: string;
    /**
     * The label key of the button that opens the link. Without it the link stands alone.
     */
    action?: string;
    /**
     * The label key of the line under the card.
     */
    footer?: string;
};
export type TiNotificationEventDefinition = {
    /**
     * The data attributes a rule may filter the event by.
     */
    attributes?: string[];
};
export type TiNotificationRule = {
    id: string;
    /**
     * A registered event.
     */
    event: string;
    /**
     * A registered notice.
     */
    notice: string;
    /**
     * For each attribute, the values that pass. Empty or absent passes all.
     */
    when?: Record<string, string[]>;
    /**
     * `false` keeps the rule without applying it.
     */
    enabled?: boolean;
};
export type TiNotificationsDocument = {
    /**
     * `false` stops every rule.
     */
    enabled: boolean;
    rules: TiNotificationRule[];
    /**
     * What an administrator changed of the notices' texts.
     */
    texts?: TiNoticeTexts;
    /**
     * The application's own settings, in the schema it gives `configDocument`.
     */
    options?: Object;
};
export type TiNotificationSettings = {
    /**
     * `TI_WEB_NOTIFY_TRANSPORT`; `off` unless stated.
     */
    transport?: "off" | "log" | "cloudflare";
    /**
     * `TI_WEB_NOTIFY_SENDER`, the from address.
     */
    sender?: string;
    /**
     * `TI_WEB_NOTIFY_SENDER_NAME`.
     */
    senderName?: string;
    /**
     * `TI_WEB_NOTIFY_REPLY_TO`.
     */
    replyTo?: string;
    /**
     * `TI_WEB_NOTIFY_RELAY_URL`, where the `cloudflare` transport posts.
     */
    relayUrl?: string;
    /**
     * How long a ledger entry is kept; 180 unless stated.
     */
    retentionDays?: number;
    /**
     * `TI_WEB_PUBLIC_URL`, the base of every link in a notice.
     */
    publicUrl?: string;
};
export type TiRenderedNotice = {
    subject: string;
    /**
     * The text, with the link after it (introduced by the layout's button label, when it has
     * one) and the layout's footer under a signature delimiter.
     */
    text: string;
    html: string;
};
export type TiNotificationDrainReport = {
    sent: number;
    /**
     * Given up: a permanent failure, or the last attempt.
     */
    failed: number;
    /**
     * Waiting for a later attempt.
     */
    retrying: number;
    /**
     * The provider's code that paused sending, or `null`.
     */
    stopped: string | null;
};
export type TiJobDefinition = {
    every: "hour" | "day";
    /**
     * For a daily job, the time of day it falls due, `HH:MM` in UTC; `00:00` unless stated.
     */
    at?: string;
    run: (context: {
        now: Date;
    }) => (Promise<any> | any);
};
export type TiJobsReport = {
    ran: string[];
    failed: string[];
};
/** @import { TiLocalizationLanguage } from "@ti-engine/core/localization" */
/**
 * @callback TiSessionCallback
 * @param {Error|null} [error]
 * @returns {void}
 */
/**
 * @typedef {Object} TiSession
 * @property {string} id
 * @property {Object} [user]
 * @property {TiLocalizationLanguage} [language]
 * @property {Object} [cookie]
 * @property {Object} [oidc]
 * @property {string} [csrfToken]
 * @property {(callback: TiSessionCallback) => TiSession} regenerate
 * @property {(callback: TiSessionCallback) => TiSession} destroy
 * @property {(callback?: TiSessionCallback) => TiSession} save
 */
/**
 * One label/value pair inside a {@link TiInfoSection}. Both strings are display-ready — already localized and
 * already formatted by the server, since that is where the session language and the label catalogue live. The
 * three flags are purely presentational; an empty `value` renders the screen's placeholder.
 *
 * @typedef {Object} TiInfoItem
 * @property {string} label
 * @property {string} [value]
 * @property {string} [href] Renders the value as a link to this target. Only `http:`, `https:` and `mailto:` are
 * honoured — any other scheme is dropped client-side and the item degrades to plain text.
 * @property {boolean} [wide] Span the full width of the section grid instead of one column.
 * @property {boolean} [mono] Render the value in the monospaced face (IDs, versions, hashes).
 * @property {boolean} [muted] Render the value as a dimmed hint rather than primary text.
 */
/**
 * A titled group of label/value pairs. The framework's Profile and About screens render an array of these
 * generically, so an application contributes content without contributing layout.
 *
 * @typedef {Object} TiInfoSection
 * @property {string} title
 * @property {string} [description] Optional intro line under the section title.
 * @property {string} [icon] Optional `ti-icon` variant name for the section head.
 * @property {boolean} [wide] Claim the full row of the two-up section grid instead of one column.
 * @property {TiInfoItem[]} items A section with no items is dropped rather than rendered empty.
 */
/**
 * The identity header of the Profile screen — the avatar/name block and the pills beside it.
 *
 * @typedef {Object} TiProfileIdentity
 * @property {string} name
 * @property {string} [subtitle] Meta line under the name (e.g. `role family · specialization · unit`).
 * @property {string} [caption] Secondary line under the subtitle (e.g. the corporate e-mail).
 * @property {string} [avatarSeed] Stable seed for the deterministic avatar colour; defaults to the name.
 * @property {{text: string, tone?: string}} [badge] Small qualifier rendered inside the meta line.
 * @property {Array<{text: string, tone?: string, dot?: boolean, mono?: boolean}>} [tags] Pills beside the name.
 */
/**
 * The descriptor backing the framework Profile screen.
 *
 * @typedef {Object} TiProfileInfo
 * @property {TiProfileIdentity} identity
 * @property {TiInfoSection[]} sections
 */
/**
 * The descriptor backing the framework About screen. Produced by `buildApplicationInfo` and optionally extended by
 * the application through {@link TiWebAppManager#getApplicationInfo}.
 *
 * @typedef {Object} TiApplicationInfo
 * @property {string} name Display name of the application.
 * @property {string} packageName The npm package name it was resolved from.
 * @property {string} version
 * @property {string} releaseDate
 * @property {string} description
 * @property {string} license
 * @property {string} homepage
 * @property {string} author
 * @property {Array<{name: string, version: string}>} components Framework component versions.
 * @property {Object|null} runtime Runtime facts (node/platform/instance), or `null` when withheld.
 * @property {TiInfoSection[]} sections Application-contributed extra sections.
 */
/**
 * One language's client label catalogue, as the browser downloads it. Built by
 * {@link TiWebAppManager#getLabelsBundle}; `/app/config` hands out `hash` and `url`, never `body`.
 *
 * @typedef {Object} TiLabelsBundle
 * @property {string} hash The first 16 hex characters of the SHA-256 of `body` — the catalogue's address.
 * @property {string} url Where the catalogue is served: `/app/labels/<hash>`, answered `immutable` for this hash.
 * @property {string} body The serialized label tree.
 */
/**
 * One e-mail address, with the name shown beside it.
 *
 * @typedef {Object} TiMailAddress
 * @property {string} email
 * @property {string} [name]
 */
/**
 * A message as a transport sends it: one recipient, a plain-text part and an HTML part.
 *
 * @typedef {Object} TiMailMessage
 * @property {string|TiMailAddress} [from] Absent when no sender is configured; a transport may supply its own.
 * @property {string|TiMailAddress} to
 * @property {string} subject
 * @property {string} text
 * @property {string} html
 * @property {string} [replyTo]
 */
/**
 * What sends a {@link TiMailMessage}. `send` resolves to `{ messageId }` once the provider has accepted the message,
 * or rejects with an error carrying a `code` and, optionally, `transient`: `true` when trying again later may succeed.
 * Without `transient`, the code decides: Cloudflare Email Service's rate-limit, daily-limit, delivery and internal
 * codes are transient, and every other code is permanent.
 *
 * @typedef {Object} TiMailTransport
 * @property {string} name
 * @property {(message: TiMailMessage) => Promise<{messageId: string}>} send
 */
/**
 * The person a notice is for.
 *
 * @typedef {Object} TiNotificationRecipient
 * @property {string} id The application's ID for the person. It is what the logs and the ledger name, so it must
 *           never be an address: an ID holding `@` is refused.
 * @property {string} email
 * @property {string} [name] Shown beside the address.
 * @property {TiLocalizationLanguage} [language] The deployment's language unless stated.
 */
/**
 * A notice an application sends.
 *
 * @typedef {Object} TiNoticeDefinition
 * @property {string} subject The label key of the subject, with `{name}` placeholders.
 * @property {string} text The label key of the text, with `{name}` placeholders. A blank line starts a paragraph.
 * @property {(data: Object) => string} [link] The path the notice links to, joined to the public URL.
 * @property {(data: Object, language: TiLocalizationLanguage, label: (key: string) => string) => Object} [format] The
 *           values the placeholders read, in the recipient's language. Without it, they read the notice's data as
 *           given. A label it reads through `label` honours an administrator's edit of it; one read straight from the
 *           catalogue does not.
 * @property {string[]} [placeholders] The names the subject and the text may use. Declared, they make both editable
 *           through the `notifications` document, and an edit using another name is refused.
 * @property {Object<string, string[]>} [labels] The other label keys `format` reads, each with the names it may use.
 *           Each becomes editable as well.
 */
/**
 * Edited notice texts, by label key and then language: `{ "notice.task-new.subject": { "bg": "…" } }`. Only what an
 * administrator changed is held; every other text is the shipped label.
 *
 * @typedef {Record<string, Record<string, string>>} TiNoticeTexts
 */
/**
 * One text an editor may change.
 *
 * @typedef {Object} TiEditableNoticeText
 * @property {string} key The label key.
 * @property {"subject"|"text"|"label"|"action"|"footer"} part
 * @property {string[]} notices The notices that use it; none for the layout's button and footer.
 * @property {string[]|null} placeholders The names it may use, or `null` when its notice declared none.
 * @property {boolean} multiline Whether it may hold a line break.
 */
/**
 * The colours of the e-mail layout, each `#rgb` or `#rrggbb`.
 *
 * @typedef {Object} TiNoticeLayoutColors
 * @property {string} [brand] The wordmark's band and the button.
 * @property {string} [brandText] The wordmark and the button's label.
 * @property {string} [accent] The rule under the band.
 * @property {string} [background] Around the card.
 * @property {string} [surface] The card.
 * @property {string} [text]
 * @property {string} [muted] The footer and the link under the button.
 * @property {string} [border] The card's edge.
 */
/**
 * How a notice looks as HTML.
 *
 * @typedef {Object} TiNoticeLayout
 * @property {string} [name] The application's name, set as a wordmark at the top. Without it there is no band.
 * @property {TiNoticeLayoutColors} [colors]
 * @property {string} [font] The wordmark's font family list, such as `Georgia, serif`. Nothing is loaded for it.
 * @property {string} [action] The label key of the button that opens the link. Without it the link stands alone.
 * @property {string} [footer] The label key of the line under the card.
 */
/**
 * An event an application raises.
 *
 * @typedef {Object} TiNotificationEventDefinition
 * @property {string[]} [attributes] The data attributes a rule may filter the event by.
 */
/**
 * A rule of the `notifications` document: when this event's data passes this filter, send this notice.
 *
 * @typedef {Object} TiNotificationRule
 * @property {string} id
 * @property {string} event A registered event.
 * @property {string} notice A registered notice.
 * @property {Object<string, string[]>} [when] For each attribute, the values that pass. Empty or absent passes all.
 * @property {boolean} [enabled] `false` keeps the rule without applying it.
 */
/**
 * The `notifications` configuration document.
 *
 * @typedef {Object} TiNotificationsDocument
 * @property {boolean} enabled `false` stops every rule.
 * @property {TiNotificationRule[]} rules
 * @property {TiNoticeTexts} [texts] What an administrator changed of the notices' texts.
 * @property {Object} [options] The application's own settings, in the schema it gives `configDocument`.
 */
/**
 * The deployment's notification settings: the `notifications` section of the server configuration, and its public URL.
 *
 * @typedef {Object} TiNotificationSettings
 * @property {"off"|"log"|"cloudflare"} [transport] `TI_WEB_NOTIFY_TRANSPORT`; `off` unless stated.
 * @property {string} [sender] `TI_WEB_NOTIFY_SENDER`, the from address.
 * @property {string} [senderName] `TI_WEB_NOTIFY_SENDER_NAME`.
 * @property {string} [replyTo] `TI_WEB_NOTIFY_REPLY_TO`.
 * @property {string} [relayUrl] `TI_WEB_NOTIFY_RELAY_URL`, where the `cloudflare` transport posts.
 * @property {number} [retentionDays] How long a ledger entry is kept; 180 unless stated.
 * @property {string} [publicUrl] `TI_WEB_PUBLIC_URL`, the base of every link in a notice.
 */
/**
 * A notice rendered for one person.
 *
 * @typedef {Object} TiRenderedNotice
 * @property {string} subject
 * @property {string} text The text, with the link after it (introduced by the layout's button label, when it has
 *           one) and the layout's footer under a signature delimiter.
 * @property {string} html
 */
/**
 * What one dispatcher run did.
 *
 * @typedef {Object} TiNotificationDrainReport
 * @property {number} sent
 * @property {number} failed Given up: a permanent failure, or the last attempt.
 * @property {number} retrying Waiting for a later attempt.
 * @property {string|null} stopped The provider's code that paused sending, or `null`.
 */
/**
 * A scheduled job.
 *
 * @typedef {Object} TiJobDefinition
 * @property {"hour"|"day"} every
 * @property {string} [at] For a daily job, the time of day it falls due, `HH:MM` in UTC; `00:00` unless stated.
 * @property {(context: {now: Date}) => (Promise<*>|*)} run
 */
/**
 * What one tick of the scheduler did.
 *
 * @typedef {Object} TiJobsReport
 * @property {string[]} ran
 * @property {string[]} failed
 */
