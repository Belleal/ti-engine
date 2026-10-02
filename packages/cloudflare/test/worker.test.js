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
 * The Worker in front of a ti-engine application's container, assembled from this package's pieces (CA-366).
 *
 * What these hold is the order a request is decided in, which every application shares: a scanner's probe is answered
 * first, without the application's hook and without the container; then the application's own hook; then the
 * container, told only what Cloudflare saw. Each step that goes wrong here goes wrong silently: a probe that reaches the
 * container wakes it to say "not found", and a forged forwarding header that survives becomes the visitor's address.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { createWorker } = require( "#worker" );

const CONNECTING = "203.0.113.7";

/**
 * Stands in for `@cloudflare/containers`' `getContainer`, and records the namespace it is given and every request the
 * container receives.
 *
 * @param {function(Request): (Response|Promise<Response>)} [answer]
 * @returns {{ getContainer: Function, namespaces: Object[], received: Request[] }}
 */
function containerStub( answer ) {
    const namespaces = [];
    const received = [];
    const reply = answer || ( () => new Response( "from the container" ) );
    return {
        namespaces: namespaces,
        received: received,
        getContainer( namespace ) {
            namespaces.push( namespace );
            return {
                async fetch( request ) {
                    received.push( request );
                    return reply( request );
                }
            };
        }
    };
}

/**
 * Stands in for the Workers runtime's execution context, and keeps every promise handed to `waitUntil`.
 *
 * @returns {{ waitUntil: function(Promise<*>): void, waited: Promise<*>[] }}
 */
function contextStub() {
    const waited = [];
    return {
        waited: waited,
        waitUntil( promise ) {
            waited.push( promise );
        }
    };
}

const ENV = Object.freeze( { CONTAINER: { name: "the container's namespace" }, DB: { name: "the database" } } );

describe( "worker — the order a request is decided in", () => {

    it( "answers a probe itself, for any method, without the application's hook or the container", async () => {
        const container = containerStub();
        let hooked = 0;
        const worker = createWorker( {
            getContainer: container.getContainer,
            edge: () => {
                hooked++;
                return new Response( "the hook" );
            }
        } );
        for ( const path of [ "/wp-login.php", "/.env", "/%E0%A4%A", "/?author=1", "/graphql" ] ) {
            for ( const method of [ "GET", "POST" ] ) {
                const request = new Request( `https://app.example.com${ path }`, { method: method, body: method === "POST" ? "x" : undefined } );
                const response = await worker.fetch( request, ENV, contextStub() );
                assert.equal( response.status, 404, `${ method } ${ path }` );
                assert.equal( await response.text(), "Not Found" );
            }
        }
        assert.equal( hooked, 0 );
        assert.deepEqual( container.namespaces, [] );
        assert.deepEqual( container.received, [] );
    } );

    it( "sends everything else to the container, told only what Cloudflare saw", async () => {
        const container = containerStub();
        const worker = createWorker( { getContainer: container.getContainer } );
        const request = new Request( "https://app.example.com/posts/?page=2", {
            method: "POST",
            headers: { "cf-connecting-ip": CONNECTING, "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "evil.example", "cookie": "session=s" },
            body: "a=1"
        } );
        const response = await worker.fetch( request, ENV, contextStub() );
        assert.equal( await response.text(), "from the container" );
        assert.deepEqual( container.namespaces, [ ENV.CONTAINER ] );
        const [ received ] = container.received;
        assert.equal( received.url, "https://app.example.com/posts/?page=2" );
        assert.equal( received.method, "POST" );
        assert.equal( await received.text(), "a=1" );
        assert.equal( received.headers.get( "x-forwarded-for" ), CONNECTING );
        assert.equal( received.headers.get( "x-forwarded-proto" ), "https" );
        assert.equal( received.headers.get( "x-forwarded-host" ), null );
        assert.equal( received.headers.get( "cookie" ), "session=s" );
        // The request the Worker was given is left alone: an application's hook may still use it, as a cache key.
        assert.equal( request.headers.get( "x-forwarded-host" ), "evil.example" );
    } );

    it( "reaches the container through the binding it is told", async () => {
        const container = containerStub();
        const env = { APP_CONTAINER: { name: "another namespace" } };
        await createWorker( { getContainer: container.getContainer, binding: "APP_CONTAINER" } ).fetch( new Request( "https://app.example.com/" ), env, contextStub() );
        assert.deepEqual( container.namespaces, [ env.APP_CONTAINER ] );
    } );

    it( "puts the application's hook between the probe check and the container", async () => {
        const container = containerStub();
        const seen = [];
        const worker = createWorker( {
            getContainer: container.getContainer,
            edge: async ( request, origin, context ) => {
                seen.push( { request: request, context: context } );
                const response = await origin();
                const decorated = new Response( response.body, response );
                decorated.headers.set( "x-edge", "seen" );
                return decorated;
            }
        } );
        const request = new Request( "https://app.example.com/posts/" );
        const ctx = contextStub();
        const response = await worker.fetch( request, ENV, ctx );
        assert.equal( response.headers.get( "x-edge" ), "seen" );
        assert.equal( await response.text(), "from the container" );
        assert.equal( container.received.length, 1 );
        assert.equal( seen.length, 1 );
        // The hook gets the request as the Worker received it, with what it needs to decide: the URL parsed once, the
        // Worker's bindings, and its execution context.
        assert.equal( seen[ 0 ].request, request );
        assert.equal( seen[ 0 ].context.url.href, request.url );
        assert.equal( seen[ 0 ].context.env, ENV );
        assert.equal( seen[ 0 ].context.ctx, ctx );
    } );

    it( "lets the hook answer without waking the container", async () => {
        const container = containerStub();
        const worker = createWorker( { getContainer: container.getContainer, edge: () => new Response( "kept at the edge" ) } );
        const response = await worker.fetch( new Request( "https://app.example.com/posts/" ), ENV, contextStub() );
        assert.equal( await response.text(), "kept at the edge" );
        assert.deepEqual( container.received, [] );
    } );

    it( "finishes every response it sends with the application's finishing, a probe's answer included", async () => {
        const container = containerStub();
        const finish = ( response, context ) => {
            const finished = new Response( response.body, response );
            finished.headers.set( "x-finished", context.url.pathname );
            return finished;
        };
        const plain = createWorker( { getContainer: container.getContainer, finish: finish } );
        const hooked = createWorker( { getContainer: container.getContainer, edge: () => new Response( "kept at the edge" ), finish: finish } );
        assert.equal( ( await plain.fetch( new Request( "https://app.example.com/wp-login.php" ), ENV, contextStub() ) ).headers.get( "x-finished" ), "/wp-login.php" );
        assert.equal( ( await plain.fetch( new Request( "https://app.example.com/posts/" ), ENV, contextStub() ) ).headers.get( "x-finished" ), "/posts/" );
        assert.equal( ( await hooked.fetch( new Request( "https://app.example.com/about/" ), ENV, contextStub() ) ).headers.get( "x-finished" ), "/about/" );
    } );

    it( "returns a WebSocket upgrade as it came, since it cannot be rebuilt", async () => {
        // Node cannot make a 101 response, so this is the shape the Workers runtime gives one.
        const upgrade = { status: 101, webSocket: {}, headers: new Headers() };
        const container = containerStub( () => upgrade );
        let finished = 0;
        const worker = createWorker( {
            getContainer: container.getContainer,
            finish: ( response ) => {
                finished++;
                return response;
            }
        } );
        assert.equal( await worker.fetch( new Request( "https://app.example.com/socket" ), ENV, contextStub() ), upgrade );
        assert.equal( finished, 0 );
    } );

    it( "names the hook when the edge hook answers with something other than a response", async () => {
        // A hook with a branch that returns nothing answers undefined. Read as a response, that failed on `.status`,
        // with a message that named neither the hook nor the cause.
        for ( const answer of [ undefined, null, "kept at the edge", 404, {}, [], { body: "kept at the edge" } ] ) {
            const worker = createWorker( { getContainer: containerStub().getContainer, edge: () => answer } );
            await assert.rejects( worker.fetch( new Request( "https://app.example.com/" ), ENV, contextStub() ), { name: "TypeError", message: /'edge'/ }, String( answer ) );
        }
    } );

    it( "names the hook when finish answers with something other than a response", async () => {
        for ( const answer of [ undefined, null, "finished", {}, [], { status: 200, headers: new Headers() } ] ) {
            const worker = createWorker( { getContainer: containerStub().getContainer, finish: () => answer } );
            await assert.rejects( worker.fetch( new Request( "https://app.example.com/" ), ENV, contextStub() ), { name: "TypeError", message: /'finish'/ }, String( answer ) );
            await assert.rejects( worker.fetch( new Request( "https://app.example.com/wp-login.php" ), ENV, contextStub() ), { name: "TypeError", message: /'finish'/ }, `a probe's, ${ String( answer ) }` );
        }
    } );

    it( "takes from the hooks any Response, a subclass's included", async () => {
        class TimedResponse extends Response {}
        const worker = createWorker( {
            getContainer: containerStub().getContainer,
            edge: async ( request, origin ) => new TimedResponse( ( await origin() ).body ),
            finish: ( response ) => new TimedResponse( response.body, { status: 203 } )
        } );
        const response = await worker.fetch( new Request( "https://app.example.com/" ), ENV, contextStub() );
        assert.equal( response.status, 203 );
        assert.equal( await response.text(), "from the container" );
    } );

    it( "takes from the edge hook a WebSocket upgrade as origin gave it, and does not finish it", async () => {
        // Node cannot make a 101 response, so this is the shape the Workers runtime gives one.
        const upgrade = { status: 101, webSocket: {}, headers: new Headers() };
        let finished = 0;
        const worker = createWorker( {
            getContainer: containerStub( () => upgrade ).getContainer,
            edge: ( request, origin ) => origin(),
            finish: ( response ) => {
                finished++;
                return response;
            }
        } );
        assert.equal( await worker.fetch( new Request( "https://app.example.com/socket" ), ENV, contextStub() ), upgrade );
        assert.equal( finished, 0 );
    } );

    it( "fits the probe rules to the application, as the probe filter does", async () => {
        const container = containerStub();
        const worker = createWorker( {
            getContainer: container.getContainer,
            probes: { except: { wordpress: [ "/wp-content/uploads/" ] }, disable: [ "graphql" ] }
        } );
        const status = async ( path ) => ( await worker.fetch( new Request( `https://app.example.com${ path }` ), ENV, contextStub() ) ).status;
        assert.equal( await status( "/wp-content/uploads/2023/10/library.webp" ), 200 );
        assert.equal( await status( "/graphql" ), 200 );
        assert.equal( await status( "/wp-content/uploads/shell.php" ), 404, "exempt from the WordPress rule alone" );
        assert.equal( await status( "/wp-admin/" ), 404 );
        assert.equal( container.received.length, 2 );
    } );

} );

describe( "worker — the scheduled sweep", () => {

    it( "sweeps the database binding, past the handler's return", async () => {
        const swept = [];
        const worker = createWorker( {
            getContainer: containerStub().getContainer,
            sweep: async ( database ) => {
                swept.push( database );
                return 3;
            }
        } );
        const ctx = contextStub();
        await worker.scheduled( {}, ENV, ctx );
        assert.deepEqual( swept, [ ENV.DB ] );
        assert.equal( ctx.waited.length, 1 );
        assert.equal( await ctx.waited[ 0 ], 3 );
    } );

    it( "sweeps the binding it is told", async () => {
        const swept = [];
        const worker = createWorker( { getContainer: containerStub().getContainer, sweep: async ( database ) => swept.push( database ), database: "STATE" } );
        const env = { STATE: { name: "another database" } };
        const ctx = contextStub();
        await worker.scheduled( {}, env, ctx );
        await Promise.all( ctx.waited );
        assert.deepEqual( swept, [ env.STATE ] );
    } );

    it( "has no scheduled handler without a sweep, and nothing but its handlers", () => {
        assert.deepEqual( Object.keys( createWorker( { getContainer: containerStub().getContainer } ) ), [ "fetch" ] );
        const worker = createWorker( { getContainer: containerStub().getContainer, sweep: async () => 0 } );
        assert.deepEqual( Object.keys( worker ).sort(), [ "fetch", "scheduled" ] );
        assert.ok( Object.isFrozen( worker ) );
    } );

} );

describe( "worker — refusals, when the Worker's module loads", () => {

    const getContainer = containerStub().getContainer;
    const sweep = async () => 0;

    // Built when the module loads, so each of these fails the deploy, not a request.
    const refusals = [
        [ "options that are not an object", undefined ],
        [ "a missing getContainer", {} ],
        [ "a getContainer that is not a function", { getContainer: {} } ],
        [ "an unknown option", { getContainer: getContainer, cache: {} } ],
        [ "a binding that is not a name", { getContainer: getContainer, binding: "" } ],
        [ "a binding that is not a string", { getContainer: getContainer, binding: 1 } ],
        [ "a database that is not a name", { getContainer: getContainer, sweep: sweep, database: "" } ],
        [ "a database without a sweep", { getContainer: getContainer, database: "STATE" } ],
        [ "an edge hook that is not a function", { getContainer: getContainer, edge: "cache" } ],
        [ "a finishing that is not a function", { getContainer: getContainer, finish: {} } ],
        [ "a sweep that is not a function", { getContainer: getContainer, sweep: true } ],
        [ "probe options the filter cannot honour", { getContainer: getContainer, probes: { disable: [ "everything" ] } } ]
    ];

    for ( const [ name, options ] of refusals ) {
        it( `refuses ${ name }`, () => {
            assert.throws( () => createWorker( options ), TypeError );
        } );
    }

} );
