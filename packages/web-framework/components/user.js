/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Represents a user in the system.
 *
 * @class User
 * @public
 */
class User {

    #userID;
    #username;
    #email;
    #name;
    #language;
    #roles;
    #permissions;
    #details;

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
    constructor( userData = {} ) {
        this.#userID = userData.userID;
        this.#username = userData.username;
        this.#email = userData.email;
        this.#name = userData.name;
        this.#language = userData.language;
        this.#roles = Array.isArray( userData.roles ) ? userData.roles : [];
        this.#permissions = Array.isArray( userData.permissions ) ? userData.permissions : [];
        this.#details = userData.details || {};
    }

    /**
     * @property
     * @returns {string}
     * @public
     */
    get userID() {
        return this.#userID;
    }

    /**
     * @property
     * @returns {string}
     * @public
     */
    get username() {
        return this.#username;
    }

    /**
     * @property
     * @returns {string}
     * @public
     */
    get email() {
        return this.#email;
    }

    /**
     * @property
     * @returns {string}
     * @public
     */
    get name() {
        return this.#name;
    }

    /**
     * @property
     * @returns {TiLocalizationLanguage}
     * @public
     */
    get language() {
        return this.#language;
    }

    /**
     * @method
     * @returns {*}
     * @public
     */
    getDetail( key ) {
        return this.#details[ key ];
    }

    /**
     * @method
     * @param {string} key
     * @param {*} value
     * @public
     */
    setDetail( key, value ) {
        this.#details[ key ] = value;
    }

    /**
     * @method
     * @returns {Object}
     * @public
     */
    asJSON() {
        return {
            userID: this.#userID,
            username: this.#username,
            email: this.#email,
            name: this.#name,
            language: this.#language,
            roles: this.#roles,
            permissions: this.#permissions,
            details: this.#details
        };
    }

}

module.exports = User;