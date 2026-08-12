export type TiSessionCallback = (error?: Error | null) => void;
export type TiSession = {
    id: string;
    user?: Object;
    language?: TiLocalizationLanguage;
    cookie?: Object;
    oidc?: Object;
    csrfToken?: string;
    /**
     * (TiSessionCallback): TiSession} regenerate
     */
    : Function;
    /**
     * (TiSessionCallback): TiSession} destroy
     */
    : Function;
    /**
     * (TiSessionCallback=): TiSession} save
     */
    : Function;
};
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
 * @property {function(TiSessionCallback): TiSession} regenerate
 * @property {function(TiSessionCallback): TiSession} destroy
 * @property {function(TiSessionCallback=): TiSession} save
 */
