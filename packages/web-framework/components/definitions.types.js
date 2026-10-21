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

/** @import { TiLocalizationLanguage } from "@ti-engine/core/localization" */
/** @import { TiAuthMethod } from "#auth-manager" */

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
 * @property {TiAuthMethod} [authMethod] The method the session signed in with (1.57.0).
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
 * A file a message carries, as a transport sends it: Cloudflare Email Service's attachment shape.
 *
 * @typedef {Object} TiMailAttachment
 * @property {string} filename Plain ASCII, with no path separator, quote or line break.
 * @property {string} type The media type, with parameters if any: `text/calendar; charset=utf-8; method=PUBLISH`.
 * @property {"attachment"} disposition
 * @property {string} content The file's bytes, base64-encoded.
 */

/**
 * A message as a transport sends it: one recipient, a plain-text part, an HTML part, and the files the notice attached.
 *
 * @typedef {Object} TiMailMessage
 * @property {string|TiMailAddress} [from] Absent when no sender is configured; a transport may supply its own.
 * @property {string|TiMailAddress} to
 * @property {string} subject
 * @property {string} text
 * @property {string} html
 * @property {string} [replyTo]
 * @property {TiMailAttachment[]} [attachments] Absent when the notice attached nothing.
 */

/**
 * What sends a {@link TiMailMessage}. `send` resolves to `{ messageId }` once the provider has accepted the message,
 * or rejects with an error carrying a `code` and, optionally, `transient`: `true` when trying again later may succeed.
 * Without `transient`, the code decides: Cloudflare Email Service's rate-limit, daily-limit, delivery and internal
 * codes are transient, and every other code is permanent.
 *
 * @typedef {Object} TiMailTransport
 * @property {string} name
 * @property {(message: TiMailMessage) => Promise<{messageId: string}>} send Rejects with a {@link TiMailTransportError}.
 */

/**
 * How a transport says a message was not sent: an `Error` carrying the provider's code, and whether trying again may
 * succeed. The dispatcher retries a transient failure with backoff and gives up a permanent one at once; without
 * `transient`, it decides from the code.
 *
 * @typedef {Error & {code: string, transient?: boolean}} TiMailTransportError
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
 * A request for a sign-in link, as the login handler passes it to `AuthManager#authenticate` and it reaches
 * `EmailLink#request` (CA-537).
 *
 * @typedef {Object} TiEmailLinkRequest
 * @property {*} email The address as the form sent it; checked and normalized by `EmailLink.normalizeAddress`.
 * @property {string} [client] The client's network address, which the per-client hourly limit counts.
 * @property {string} [language] The language the request was answered in: the e-mail's, and the session's after it.
 */

/**
 * What a spent sign-in link signs in: `EmailLink#redeem` gives it to `AuthManager`, which makes the session's user of it.
 *
 * @typedef {Object} TiEmailLinkRedeemed
 * @property {string} address Trimmed and lower-cased.
 * @property {string} [language] The language the link was asked for in.
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
 * @property {(data: Object, language: TiLocalizationLanguage, label: (key: string) => string) => TiNoticeAttachment[]} [attachments]
 *           The files the notice carries, built from its data in the recipient's language, as the texts are. Never
 *           read the clock or the store here: a retry renders again, and must attach the same file.
 */

/**
 * A file a notice attaches, as its `attachments` returns it. At most 10, and 3 MiB together.
 *
 * @typedef {Object} TiNoticeAttachment
 * @property {string} filename Plain ASCII, starting with a letter or digit, at most 100 characters, with no path
 *           separator, quote or line break.
 * @property {string} type The media type, with parameters if any, in RFC 2045 tokens.
 * @property {string} content The file as text, not empty; it is sent as its UTF-8 bytes.
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
 * @property {"subject"|"text"|"label"|"action"|"footer"} part Where it is first read.
 * @property {string[]} notices The notices that use it; none for the layout's button and footer.
 * @property {string[]|null} placeholders The names every use of it offers, or `null` when none declared any.
 * @property {boolean} multiline Whether it may hold a line break: only when every use of it may.
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
 * @property {number} [sendEveryHours] How often a job tick sends what the outbox holds, in hours: 1, 2, 3, 4, 6, 8,
 * 12 or 24, counted from midnight UTC. Every hour when absent.
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
 * @property {TiMailAttachment[]} [attachments] The notice's files, encoded; absent when it has none.
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
 * A time of day in UTC, as a daily job falls due at.
 *
 * @typedef {Object} TiJobTimeOfDay
 * @property {number} hours 0 to 23.
 * @property {number} minutes 0 to 59.
 */

/**
 * What decides when a registered job is due: its period, and for a daily job the time of day it falls due.
 *
 * @typedef {Object} TiJobSchedule
 * @property {"hour"|"day"} every
 * @property {TiJobTimeOfDay|null} at `null` for an hourly job.
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

/**
 * Who a session acts for, as the application knows them (`TiWebAppManager#resolveSubject`): the key a person's What's
 * new marker and their feedback are kept under, and the name an administrator reads.
 *
 * @typedef {Object} TiSessionSubject
 * @property {string} id
 * @property {string} name
 */

/**
 * One note as an application writes it.
 *
 * @typedef {Object} TiWhatsNewNoteSource
 * @property {string} id Lower-case words joined by hyphens, once within its version.
 * @property {"new"|"improved"|"fixed"} kind
 * @property {string[]} audience `everyone`, `admin`, or a name the application maps to its roles.
 * @property {string} [screen] The screen the note is about, offered as a link to whoever may open it.
 * @property {Object<string, string>} title One line, by language.
 * @property {Object<string, string>} text A few plain sentences, by language.
 */

/**
 * The notes one version shipped.
 *
 * @typedef {Object} TiWhatsNewReleaseNotes
 * @property {string} version `major.minor.patch`.
 * @property {TiWhatsNewNoteSource[]} notes Empty for a version nobody would notice.
 */

/**
 * How an application turns What's new on.
 *
 * @typedef {Object} TiWhatsNewOptions
 * @property {TiWhatsNewReleaseNotes[]} notes Newest first.
 * @property {string|null} [baseline] The release a deployment with no record ran: the one before the application had What's new.
 * @property {Object<string, Array<string|number>>} [audiences] An audience name → the roles it covers.
 */

/**
 * The release a deployment runs and the one before it.
 *
 * @typedef {Object} TiWhatsNewRelease
 * @property {string} version
 * @property {string|null} previous
 * @property {string|null} since ISO-8601: when the deployment started running it.
 */

/**
 * A note as one reader is shown it: in their language, with its link only where they may open the screen.
 *
 * @typedef {Object} TiWhatsNewNote
 * @property {string} id
 * @property {string} version
 * @property {"new"|"improved"|"fixed"} kind
 * @property {string} title
 * @property {string} text
 * @property {string|null} screen
 */

/**
 * That a person has seen a release, and when.
 *
 * @typedef {Object} TiWhatsNewMarker
 * @property {string} version
 * @property {string|null} at ISO-8601.
 */

/**
 * What the What's new screen shows one reader.
 *
 * @typedef {Object} TiWhatsNewView
 * @property {TiWhatsNewRelease} release
 * @property {TiWhatsNewNote[]} fresh The notes new in the release running.
 * @property {Array<{version: string, notes: TiWhatsNewNote[]}>} earlier
 * @property {boolean} seen
 */

/**
 * What a What's new reminder needs.
 *
 * @typedef {Object} TiWhatsNewStatus
 * @property {string} version
 * @property {number} unseen How many notes are new and not yet seen; 0 once the release is.
 * @property {string} first The first such note's title, or empty.
 */

/**
 * How an application turns feedback on.
 *
 * @typedef {Object} TiFeedbackOptions
 * @property {Object<string, string>} [dateLocales] A language → the locale its dates are written in, such as `{ en: "en-GB" }`.
 */

/**
 * What a problem report carries without the sender typing it.
 *
 * @typedef {Object} TiFeedbackContext
 * @property {string} screen The screen they were on, if it is one the application has; else empty.
 * @property {string} version The version running.
 * @property {string} language The session's language.
 * @property {string} browser The browser's own description, at most 200 characters.
 */

/**
 * A piece of feedback about the application.
 *
 * @typedef {Object} TiFeedbackItem
 * @property {string} feedbackID
 * @property {"suggestion"|"problem"|"praise"|"other"} kind
 * @property {string} text 1 to 4000 characters.
 * @property {boolean} anonymous
 * @property {string|null} submittedBy The subject ID; null when anonymous.
 * @property {string|null} senderName Null when anonymous.
 * @property {string} submittedAt ISO-8601.
 * @property {TiFeedbackContext|null} context A problem's only.
 * @property {"new"|"in-progress"|"done"|"declined"} status
 * @property {string|null} statusChangedAt
 * @property {string|null} statusChangedBy The administrator's user ID.
 */
