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
 * @property {TiInfoItem[]} items
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
