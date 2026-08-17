/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
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