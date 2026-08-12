export = User;
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
