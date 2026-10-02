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

/**
 * The Worker in front of a ti-engine application's container, assembled from this package's pieces (CA-366).
 * <br/>
 * Every application decides a request in the same order. A scanner's probe is answered first, without waking the
 * container ({@link module:probes}). Then comes the application's own hook, such as an edge cache or timing. Last is the
 * container, told only what Cloudflare saw ({@link module:forwarding}). The Worker also sweeps expired state on its
 * schedule. What differs between applications is the hooks, so that is all they write.
 * <br/>
 * The container class is not built here. `@cloudflare/containers` keeps a class's outbound handlers under the class's
 * name, so the class must be the application's own, named as its `wrangler.jsonc` names it. It takes its fields from
 * {@link module:container.containerSetup} and its handlers from {@link module:container.outboundByHost}.
 * <br/>
 * NOTE: Runs in the Workers runtime. It requires nothing outside this package. `@cloudflare/containers` is not
 * required either: its ES module entry resolves only through a bundler, so the application passes in the one function
 * this needs from it, `getContainer`, and it can still be loaded and tested by Node.
 *
 * @module worker
 */

const { createProbeFilter, probeResponse } = require( "./probes.js" );
const { forContainer } = require( "./forwarding.js" );

/**
 * The options {@link createWorker} takes.
 *
 * @type {string[]}
 * @private
 */
const WORKER_OPTIONS = Object.freeze( [ "getContainer", "binding", "probes", "edge", "finish", "sweep", "database" ] );

/**
 * What the application's hooks are given besides the request.
 *
 * @typedef {Object} WorkerContext
 * @property {Object} env The Worker's bindings.
 * @property {{ waitUntil: (promise: Promise<*>) => void }} ctx The Worker's execution context.
 * @property {URL} url The request's URL, parsed once.
 */

/**
 * A Worker, as its module exports it by default.
 *
 * @typedef {Object} Worker
 * @property {(request: Request, env: Object, ctx: { waitUntil: (promise: Promise<*>) => void }) => Promise<Response>} fetch
 * @property {(controller: *, env: Object, ctx: { waitUntil: (promise: Promise<*>) => void }) => Promise<void>} [scheduled]
 * Present only with a `sweep`.
 */

/**
 * @param {*} value
 * @returns {boolean} True for a non-null, non-array object.
 * @private
 */
function isPlainObject( value ) {
    return value !== null && typeof value === "object" && Array.isArray( value ) === false;
}

/**
 * @param {*} value
 * @returns {boolean} Whether the value names a binding.
 * @private
 */
function isBindingName( value ) {
    return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {*} response
 * @returns {boolean} Whether the response accepts a WebSocket, which cannot be rebuilt.
 * @private
 */
function isUpgrade( response ) {
    return response.status === 101 || Boolean( response.webSocket );
}

/**
 * Takes what one of the application's hooks answered, when it can be a response. A hook with a branch that returns
 * nothing answers `undefined`, and read as a response it failed on `.status`, naming neither the hook nor the cause.
 *
 * @param {string} hook The hook's option name.
 * @param {*} answer
 * @returns {Response}
 * @throws {TypeError} If the answer is not an object.
 * @private
 */
function answerOf( hook, answer ) {
    if ( answer === null || typeof answer !== "object" ) {
        throw new TypeError( `createWorker: '${ hook }' must answer with a Response, not ${ answer === null ? "null" : typeof answer }.` );
    }
    return answer;
}

/**
 * The Worker in front of an application's container: its `fetch` and, with a `sweep`, its `scheduled`. Built when the
 * Worker's module loads, so a malformed option fails the deploy rather than a request.
 *
 * ```js
 * import { getContainer } from "@cloudflare/containers";
 * import { sweepExpired } from "@ti-engine/core/state-service";
 * import { createWorker } from "@ti-engine/cloudflare/worker";
 *
 * export default createWorker( { getContainer, sweep: sweepExpired } );
 * ```
 *
 * A request is decided in this order:
 * 1. A scanner's probe is answered `404` here, for any method, by {@link module:probes.probeResponse}. Neither the
 *    application's hook nor the container sees it, so it never wakes the container or holds it awake.
 * 2. The application's `edge` hook, when it has one, gets the request as the Worker received it, and `origin`, which
 *    sends it to the container. It may answer without calling `origin`, as an edge cache does on a hit, or call it
 *    once and work on the answer, as timing does.
 * 3. The container gets the request as {@link module:forwarding.forContainer} gives it: told the visitor's address and
 *    scheme as Cloudflare saw them, and nothing a client claimed.
 *
 * Every response then passes through the application's `finish`, a probe's answer included, for the headers that
 * belong on every response. A WebSocket upgrade passes through untouched, since it cannot be rebuilt.
 *
 * @method
 * @param {Object} options
 * @param {(namespace: *) => { fetch: (request: Request) => Promise<Response> }} options.getContainer
 * `@cloudflare/containers`' `getContainer`.
 * @param {string} [options.binding] The container's Durable Object binding: `CONTAINER` unless stated.
 * @param {{ except?: Object<string, string[]>, disable?: string[] }} [options.probes] How the probe rules fit the
 * application: what {@link module:probes.createProbeFilter} takes.
 * @param {(request: Request, origin: () => Promise<Response>, context: WorkerContext) => (Response|Promise<Response>)}
 * [options.edge] The application's own step between the probe check and the container.
 * @param {(response: Response, context: WorkerContext) => (Response|Promise<Response>)} [options.finish] Applied to
 * every response the Worker sends.
 * @param {(database: *) => Promise<*>} [options.sweep] Sweeps expired state on the Worker's schedule, such as core's
 * `sweepExpired`. Without it, the Worker has no `scheduled` handler.
 * @param {string} [options.database] The database binding the sweep is given: `DB` unless stated.
 * @returns {Worker} Frozen.
 * @throws {TypeError} If an option is malformed. A request fails with one when a hook answers with something other than
 * a response, naming the hook.
 * @public
 */
function createWorker( options ) {
    if ( isPlainObject( options ) === false ) {
        throw new TypeError( "createWorker: the options must be an object." );
    }
    for ( const key of Object.keys( options ) ) {
        if ( WORKER_OPTIONS.includes( key ) === false ) {
            throw new TypeError( `createWorker: '${ key }' is not an option. The options are ${ WORKER_OPTIONS.join( ", " ) }.` );
        }
    }
    const { getContainer, binding = "CONTAINER", probes = {}, edge, finish, sweep, database } = options;
    if ( typeof getContainer !== "function" ) {
        throw new TypeError( "createWorker: 'getContainer' must be @cloudflare/containers' getContainer." );
    }
    if ( isBindingName( binding ) === false ) {
        throw new TypeError( `createWorker: 'binding' must be the name of the container's binding: ${ JSON.stringify( binding ) }` );
    }
    for ( const [ name, hook ] of [ [ "edge", edge ], [ "finish", finish ], [ "sweep", sweep ] ] ) {
        if ( hook !== undefined && typeof hook !== "function" ) {
            throw new TypeError( `createWorker: '${ name }' must be a function, when given.` );
        }
    }
    if ( database !== undefined && ( sweep === undefined || isBindingName( database ) === false ) ) {
        throw new TypeError( `createWorker: 'database' must be the name of the binding the sweep is given, and only with a sweep: ${ JSON.stringify( database ) }` );
    }
    const isProbe = createProbeFilter( probes );
    const swept = ( database === undefined ) ? "DB" : database;

    const worker = {
        async fetch( request, env, ctx ) {
            const url = new URL( request.url );
            const context = Object.freeze( { env: env, ctx: ctx, url: url } );
            let response;
            if ( isProbe( url.pathname, url.search ) === true ) {
                response = probeResponse();
            } else {
                const origin = () => getContainer( env[ binding ] ).fetch( forContainer( request ) );
                response = ( edge === undefined ) ? await origin() : answerOf( "edge", await edge( request, origin, context ) );
            }
            if ( finish === undefined || isUpgrade( response ) === true ) {
                return response;
            }
            return answerOf( "finish", await finish( response, context ) );
        }
    };
    if ( sweep !== undefined ) {
        worker.scheduled = async ( controller, env, ctx ) => {
            ctx.waitUntil( sweep( env[ swept ] ) );
        };
    }
    return Object.freeze( worker );
}

module.exports = {
    createWorker: createWorker
};
