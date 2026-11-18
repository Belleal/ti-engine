export = User;
import type { TiLocalizationLanguage } from "@ti-engine/core/localization";
/** @import { TiLocalizationLanguage } from "@ti-engine/core/localization" */
/**
 * Represents a user in the system.
 *
 * @class User
 * @public
 */
declare class User {
    #private;
    /**
     * @constructor
     * @param {Object} userData
     * @param {string} userData.userID
     * @param {string} [userData.username]
     * @param {string} [userData.email]
     * @param {string} [userData.name]
     * @param {string} [userData.objectID] Entra's object ID (`oid`), the same in every app registration of a tenant.
     * @param {string} [userData.tenantID] Entra's tenant ID (`tid`).
     * @param {TiLocalizationLanguage} [userData.language]
     * @param {string[]} [userData.roles]
     * @param {string[]} [userData.permissions]
     * @param {Object} [userData.details]
     */
    constructor(userData?: {
        userID: string;
        username?: string;
        email?: string;
        name?: string;
        objectID?: string;
        tenantID?: string;
        language?: TiLocalizationLanguage;
        roles?: string[];
        permissions?: string[];
        details?: Object;
    });
    /**
     * @property
     * @returns {string}
     * @public
     */
    get userID(): string;
    /**
     * @property
     * @returns {string}
     * @public
     */
    get username(): string;
    /**
     * @property
     * @returns {string}
     * @public
     */
    get email(): string;
    /**
     * @property
     * @returns {string}
     * @public
     */
    get name(): string;
    /**
     * Entra's object ID (`oid`), when the provider sent one (CA-586). Unlike the subject in `userID`, which Entra makes
     * pairwise, it is the same in every app registration of a tenant.
     *
     * @property
     * @returns {string|undefined}
     * @public
     */
    get objectID(): string | undefined;
    /**
     * Entra's tenant ID (`tid`), when the provider sent one (CA-586).
     *
     * @property
     * @returns {string|undefined}
     * @public
     */
    get tenantID(): string | undefined;
    /**
     * @property
     * @returns {TiLocalizationLanguage}
     * @public
     */
    get language(): TiLocalizationLanguage;
    /**
     * @method
     * @returns {*}
     * @public
     */
    getDetail(key: any): any;
    /**
     * @method
     * @param {string} key
     * @param {*} value
     * @public
     */
    setDetail(key: string, value: any): void;
    /**
     * @method
     * @returns {Object}
     * @public
     */
    asJSON(): Object;
}
