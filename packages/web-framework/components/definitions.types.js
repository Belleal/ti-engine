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
 * @property {(data: Object, language: TiLocalizationLanguage) => Object} [format] The values the placeholders read, in
 *           the recipient's language. Without it, they read the notice's data as given.
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
 * @property {string} text The text, with the link after it.
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
