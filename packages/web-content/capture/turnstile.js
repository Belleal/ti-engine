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

/*
 * Cloudflare Turnstile on the capture form (CA-352).
 *
 * The capture endpoint is a site's one public write, and its CSRF token is no defence against a script: a script loads
 * the page first and posts back what the page gave it. Turnstile puts a challenge in the form and a token in the
 * submission, and the endpoint asks Cloudflare whether the token is genuine before anything is stored.
 *
 * The two halves are kept apart on purpose:
 * - The site key is public; the widget needs it in the page. It is all a renderer is ever handed (publicTurnstile).
 * - The secret reaches the capture endpoint and nothing else. A page is rendered from a context any template can
 *   print, and a secret that can be printed eventually is.
 *
 * NOTE: No `require()` here. The form renderer imports this module, and a render module must not pull in
 * infrastructure to draw a form.
 */

/**
 * Cloudflare's script, which finds the widget's element in the page and draws the challenge in an iframe from the same
 * host. The web server's Content-Security-Policy must admit that frame (`frameSrc`, web-framework 1.45.0).
 *
 * @type {string}
 */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Where a token is verified.
 *
 * @type {string}
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * The action the widget declares, and the one a token must have been issued for.
 *
 * @type {string}
 */
const ACTION = "capture";

/**
 * The form field the widget puts its token in.
 *
 * @type {string}
 */
const RESPONSE_FIELD = "cf-turnstile-response";

/**
 * Cloudflare documents a token of up to 2048 characters. Anything longer is not one, and is not sent on.
 *
 * @type {number}
 */
const MAX_TOKEN_LENGTH = 2048;

/**
 * How long a verification may take before the submission is refused. A capture waits on it, so it is short.
 *
 * @type {number}
 */
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * The themes the widget accepts. `auto` follows the visitor's colour scheme.
 *
 * @type {string[]}
 */
const THEMES = Object.freeze( [ "auto", "light", "dark" ] );

/**
 * Reads a configured string, trimmed; anything else is empty.
 *
 * @method
 * @param {*} value
 * @returns {string}
 * @private
 */
function configured( value ) {
    return ( typeof value === "string" ) ? value.trim() : "";
}

/**
 * The widget's public configuration: the site key, and the theme it draws in.
 * <br/>
 * It copies nothing else. The natural way to configure both halves is one object carrying the key and the secret, and a
 * renderer handed that object could print the secret into a page.
 *
 * @method
 * @param {{ siteKey?: string, theme?: string }} [config]
 * @returns {{ siteKey: string, theme: string }|null} Frozen, or null when no site key is configured.
 * @public
 */
function publicTurnstile( config ) {
    const siteKey = configured( config && config.siteKey );
    if ( siteKey === "" ) {
        return null;
    }
    const theme = ( config && THEMES.includes( config.theme ) ) ? config.theme : "auto";
    return Object.freeze( { siteKey: siteKey, theme: theme } );
}

/**
 * What the capture endpoint does with a submission's challenge, decided once at mount:
 * - `off`: no site key and no secret. Nothing is drawn and nothing is checked, as before.
 * - `on`: both. Every submission's token is verified before it is stored.
 * - `misconfigured`: one without the other. A key without its secret draws a widget whose token nothing checks, and a
 *   secret without a key checks a token no form can carry. Either way every submission is refused, and `problem` says
 *   why. Refusing is visible; accepting unchecked is not.
 *
 * @method
 * @param {{ siteKey?: string, secret?: string }} [config]
 * @returns {{ mode: string, secret?: string, problem?: string }}
 * @public
 */
function resolveTurnstile( config ) {
    const siteKey = configured( config && config.siteKey );
    const secret = configured( config && config.secret );
    if ( siteKey === "" && secret === "" ) {
        return { mode: "off" };
    }
    if ( siteKey === "" ) {
        return { mode: "misconfigured", problem: "a Turnstile secret is configured without a site key, so no form can carry a token" };
    }
    if ( secret === "" ) {
        return { mode: "misconfigured", problem: "a Turnstile site key is configured without its secret, so no token can be verified" };
    }
    return { mode: "on", secret: secret };
}

/**
 * Asks Cloudflare whether a submission's token is genuine.
 * <br/>
 * Fails closed. Each of these is refused:
 * - a missing or overlong token;
 * - an unreachable or slow `siteverify`;
 * - an answer that is not a success;
 * - a token issued for another action.
 *
 * A token that names no action is accepted: the action narrows where a token may be used, and is not what proves it
 * genuine. The visitor's address is deliberately not sent. It is optional, and the capture store's rule is that no IP is
 * ever read, let alone passed on.
 *
 * @method
 * @param {string} token The submitted `cf-turnstile-response`.
 * @param {{ secret: string, fetch?: Function, timeoutMs?: number }} options `fetch` is the global one unless a test
 *        supplies its own.
 * @returns {Promise<{ ok: boolean, codes: string[] }>} `codes` are Cloudflare's `error-codes`, or this module's own
 *          reason when Cloudflare gave none or was never asked.
 * @public
 */
async function verifyTurnstileToken( token, options ) {
    const opts = options || {};
    if ( typeof token !== "string" || token.length === 0 ) {
        return { ok: false, codes: [ "missing-input-response" ] };
    }
    if ( token.length > MAX_TOKEN_LENGTH ) {
        return { ok: false, codes: [ "invalid-input-response" ] };
    }
    const fetchImpl = ( typeof opts.fetch === "function" ) ? opts.fetch : fetch;
    let outcome;
    try {
        const response = await fetchImpl( SITEVERIFY_URL, {
            method: "POST",
            body: new URLSearchParams( { secret: String( opts.secret || "" ), response: token } ),
            signal: AbortSignal.timeout( opts.timeoutMs || DEFAULT_TIMEOUT_MS )
        } );
        outcome = await response.json();
    } catch ( error ) {
        return { ok: false, codes: [ ( error && error.name === "TimeoutError" ) ? "siteverify-timeout" : "siteverify-unreachable" ] };
    }
    const codes = ( outcome && Array.isArray( outcome[ "error-codes" ] ) ) ? outcome[ "error-codes" ].map( String ) : [];
    if ( !outcome || outcome.success !== true ) {
        return { ok: false, codes: ( codes.length > 0 ) ? codes : [ "verification-failed" ] };
    }
    if ( typeof outcome.action === "string" && outcome.action !== "" && outcome.action !== ACTION ) {
        // Genuine, but minted for another widget that shares the key: not a sign-up from this form.
        return { ok: false, codes: [ "action-mismatch" ] };
    }
    return { ok: true, codes: [] };
}

module.exports = {
    publicTurnstile: publicTurnstile,
    resolveTurnstile: resolveTurnstile,
    verifyTurnstileToken: verifyTurnstileToken,
    TURNSTILE_SCRIPT_URL: SCRIPT_URL,
    TURNSTILE_ACTION: ACTION,
    TURNSTILE_RESPONSE_FIELD: RESPONSE_FIELD
};
