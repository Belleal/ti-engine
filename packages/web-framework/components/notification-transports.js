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

"use strict";

const logger = require( "@ti-engine/core/logger" );

/** @import { TiMailMessage, TiMailTransport } from "#definitions" */

/**
 * The provider codes that mean "try again later" rather than "this message will never go". They are Cloudflare Email
 * Service's names, which the relay passes through; a relay or a transport of an application's own may answer with a
 * `transient` flag instead, and the flag wins.
 *
 * @type {ReadonlyArray<string>}
 */
const TRANSIENT_CODES = Object.freeze( [ "E_RATE_LIMIT_EXCEEDED", "E_DAILY_LIMIT_EXCEEDED", "E_DELIVERY_FAILED", "E_INTERNAL_SERVER_ERROR" ] );

/**
 * The code a transport reports when the provider has stopped taking messages for the day. The dispatcher stops at it
 * instead of spending every queued notice's attempts on a limit that will not lift before tomorrow.
 *
 * @type {string}
 */
const DAILY_LIMIT_CODE = "E_DAILY_LIMIT_EXCEEDED";

/**
 * How long the relay is given to answer, in milliseconds. A provider that hangs must not hold the dispatcher, which
 * sends one message at a time.
 *
 * @type {number}
 */
const RELAY_TIMEOUT = 30000;

/**
 * Builds a transport failure in the shape the dispatcher reads.
 *
 * @method
 * @param {string} code
 * @param {boolean} [transient] When absent, decided from {@link TRANSIENT_CODES}.
 * @param {string} [detail]
 * @returns {Error & {code: string, transient: boolean}}
 * @public
 */
function transportError( code, transient, detail ) {
    const error = new Error( detail ? `${ code }: ${ detail }` : code );
    error.code = code;
    error.transient = ( typeof transient === "boolean" ) ? transient : TRANSIENT_CODES.includes( code );
    return error;
}

/**
 * A transport that sends nothing and records that it would have. For development, tests and any environment that must
 * not mail people. The line names the subject's length rather than the subject, and never the address: a rendered
 * notice can carry a date or a task, and an address is personal data the logs must not hold.
 *
 * @method
 * @returns {TiMailTransport}
 * @public
 */
function createLogTransport() {
    let counter = 0;
    return Object.freeze( {
        name: "log",
        send: ( message ) => {
            counter += 1;
            logger.log( `Notification transport 'log': a message of ${ String( message.text || "" ).length } characters was not sent (log transport).`, logger.logSeverity.INFO );
            return Promise.resolve( { messageId: `log-${ Date.now() }-${ counter }` } );
        }
    } );
}

/**
 * A transport that posts each message to a relay, which sends it. On Cloudflare the relay is the Worker in front of
 * the container, reached on the address the state service already answers on, and it sends through its `send_email`
 * binding: the container holds no credential, because the binding is the authentication.
 * <br/>
 * The relay answers `200` with `{ messageId }`, or a non-2xx status with `{ code, transient }`. Anything else, a
 * timeout or a network failure included, is reported as a transient `E_RELAY_UNAVAILABLE`: the message stays queued.
 *
 * @method
 * @param {string} url The relay's address, such as `http://11.0.0.1/v1/mail/send`.
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetch] Injectable for tests.
 * @param {number} [options.timeout] Milliseconds; {@link RELAY_TIMEOUT} unless stated.
 * @returns {TiMailTransport}
 * @throws {TypeError} If the URL is not an http(s) URL.
 * @public
 */
function createRelayTransport( url, options = {} ) {
    let parsed;
    try {
        parsed = new URL( String( url || "" ) );
    } catch {
        parsed = null;
    }
    if ( parsed === null || ( parsed.protocol !== "http:" && parsed.protocol !== "https:" ) ) {
        throw new TypeError( `createRelayTransport: the relay URL must be an http(s) URL: ${ JSON.stringify( url ) }` );
    }
    const fetchImpl = options.fetch || globalThis.fetch;
    const timeout = Number.isFinite( options.timeout ) ? options.timeout : RELAY_TIMEOUT;
    return Object.freeze( {
        name: "relay",
        send: ( message ) => {
            return fetchImpl( parsed.href, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify( message ),
                signal: AbortSignal.timeout( timeout )
            } ).then( ( response ) => {
                return response.text().then( ( body ) => {
                    let answer;
                    try {
                        answer = body ? JSON.parse( body ) : null;
                    } catch {
                        answer = null;
                    }
                    if ( response.ok && answer && typeof answer.messageId === "string" ) {
                        return { messageId: answer.messageId };
                    }
                    if ( !response.ok && answer && typeof answer.code === "string" ) {
                        throw transportError( answer.code, answer.transient );
                    }
                    throw transportError( "E_RELAY_UNAVAILABLE", true, `the relay answered ${ response.status }` );
                } );
            }, ( error ) => {
                throw transportError( "E_RELAY_UNAVAILABLE", true, error && error.name ? error.name : "request failed" );
            } );
        }
    } );
}

module.exports = {
    TRANSIENT_CODES: TRANSIENT_CODES,
    DAILY_LIMIT_CODE: DAILY_LIMIT_CODE,
    transportError: transportError,
    createLogTransport: createLogTransport,
    createRelayTransport: createRelayTransport
};
