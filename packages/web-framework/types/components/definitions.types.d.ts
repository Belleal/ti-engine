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
