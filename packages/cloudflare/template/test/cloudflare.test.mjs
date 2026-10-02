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
 * The guard tests of the application's Cloudflare edge, from `@ti-engine/cloudflare`'s template (CA-371).
 *
 * Each holds something that fails silently: nothing throws, the deploy succeeds, and the failure shows first in
 * production. Run them before every deploy.
 *
 * The Worker is loaded as it is. Node cannot load `@cloudflare/containers`, whose ES module entry resolves only through
 * a bundler, so a module hook replaces that one import with a stand-in. The stand-in keeps a class's outbound handlers
 * under the class's name, as the library does. Everything else is the code that ships: `@ti-engine/cloudflare` and
 * core's state service. `wrangler.jsonc` is read for the names that tie the pieces together.
 *
 * What is the application's own is at the top: the URLs it serves, and the schema it last applied.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTAINER_PORT, STATE_ADDRESS } from "@ti-engine/cloudflare/container";

/**
 * The paths the application serves, every one of which must reach the container. web-framework's own routes are here,
 * with a value for each parameter. Add the application's own.
 *
 * @type {string[]}
 */
const ROUTES = [
    "/", "/not-found", "/app", "/app/home", "/app/labels/0f3a9c", "/me", "/health", "/csrf-token", "/logout",
    "/login/local", "/login/openid-azure", "/login/azure-callback", "/login/openid-google", "/login/google-callback",
    "/admin/config/editors", "/admin/config/changes", "/service/v1/example", "/.well-known/security.txt"
];

/**
 * The directories whose files the application serves, by the path they are served under, each relative to the
 * directory of `wrangler.jsonc`: `{ "/static/": "public" }`. Every file in them must reach the container.
 *
 * @type {Object<string, string>}
 */
const STATIC_DIRECTORIES = {};

/**
 * The names of the query parameters the application's pages send. Two names are a probe on any path, `rest_route` and
 * `author`, because WordPress lists its users by them: a parameter of the application's own with either name would be
 * answered 404 at the edge.
 *
 * @type {string[]}
 */
const QUERY_PARAMETERS = [];

/**
 * The SHA-256 of core's D1 schema, `components/cache/d1-state-schema.sql` in `@ti-engine/core`, as last applied to the
 * application's database with `npm run migrate:remote`. The template holds core 1.19.0's.
 * <br/>
 * Core's state service reads its tables from the first request, so a Worker deployed against a database that lacks
 * one fails in production and nowhere else. A core upgrade that changes the schema stops this test: apply the new
 * schema with `npm run migrate:remote`, then put its hash here.
 *
 * @type {string}
 */
const APPLIED_SCHEMA_SHA256 = "cf8c28a73aa4ece94af99c656faef45ba5e27ccfb96c7ae052326580be083c94";

/**
 * The directory that holds `wrangler.jsonc`: this test's own, or the nearest above it.
 *
 * @returns {string}
 */
function applicationRoot() {
    let directory = dirname( fileURLToPath( import.meta.url ) );
    while ( existsSync( join( directory, "wrangler.jsonc" ) ) === false ) {
        const parent = dirname( directory );
        if ( parent === directory ) {
            throw new Error( "There is no wrangler.jsonc in this test's directory or any above it." );
        }
        directory = parent;
    }
    return directory;
}

/**
 * Reads a JSONC file as wrangler does: comments dropped, strings left alone.
 *
 * @param {string} file
 * @returns {Object}
 */
function readJSONC( file ) {
    const text = readFileSync( file, "utf8" );
    let json = "";
    for ( let i = 0; i < text.length; i++ ) {
        if ( text[ i ] === "\"" ) {
            const start = i;
            for ( i++; i < text.length && text[ i ] !== "\""; i++ ) {
                if ( text[ i ] === "\\" ) {
                    i++;
                }
            }
            json += text.slice( start, i + 1 );
        } else if ( text.startsWith( "//", i ) === true ) {
            const end = text.indexOf( "\n", i );
            i = ( end === -1 ) ? text.length : end - 1;
        } else if ( text.startsWith( "/*", i ) === true ) {
            const end = text.indexOf( "*/", i + 2 );
            i = ( end === -1 ) ? text.length : end + 1;
        } else {
            json += text[ i ];
        }
    }
    return JSON.parse( json );
}

const ROOT = applicationRoot();
const CONFIG = readJSONC( join( ROOT, "wrangler.jsonc" ) );
const CONTAINER = ( CONFIG.containers || [] )[ 0 ] || {};
const CLASS_NAME = CONTAINER.class_name;
const BINDING = ( ( ( CONFIG.durable_objects || {} ).bindings || [] ).find( ( binding ) => binding.class_name === CLASS_NAME ) || {} ).name;
const DATABASE = ( ( CONFIG.d1_databases || [] )[ 0 ] || {} ).binding;

/**
 * What the Worker takes from `@cloudflare/containers`, standing in for it. Like the library, it keeps a class's outbound
 * handlers under the class's name, and finds them by the name of the class a container runs as: handlers set on any
 * other class are never found, and that container never reaches its state. A container answers every request it is
 * sent, and remembers it.
 */
const CONTAINERS_STAND_IN = `
const outboundHandlers = new Map();
const received = [];

export class Container {
    constructor( ctx, env ) {
        this.ctx = ctx;
        this.env = env;
    }

    static set outboundByHost( handlers ) {
        outboundHandlers.set( this.name, handlers );
    }
}

export class ContainerProxy {}

export function getContainer( namespace ) {
    return {
        async fetch( request ) {
            received.push( { namespace: namespace, request: request } );
            return new Response( "from the container" );
        }
    };
}

export { outboundHandlers, received };
`;

register( "data:text/javascript," + encodeURIComponent( `
export async function resolve( specifier, context, next ) {
    if ( specifier === "@cloudflare/containers" ) {
        return { url: ${ JSON.stringify( "data:text/javascript," + encodeURIComponent( CONTAINERS_STAND_IN ) ) }, shortCircuit: true };
    }
    return next( specifier, context );
}
` ) );

const containers = await import( "@cloudflare/containers" );
const worker = await import( pathToFileURL( join( ROOT, CONFIG.main ) ).href );

/**
 * A D1 binding that answers every statement with nothing, and remembers each one it was asked.
 *
 * @returns {{ asked: string[], prepare: function(string): Object }}
 */
function databaseStub() {
    const asked = [];
    const answer = ( sql, result ) => {
        asked.push( sql );
        return result;
    };
    const statement = ( sql ) => ( {
        bind: () => statement( sql ),
        first: async () => answer( sql, { ok: 1 } ),
        all: async () => answer( sql, { results: [] } ),
        run: async () => answer( sql, { meta: { changes: 0 } } )
    } );
    return { asked: asked, prepare: statement };
}

/**
 * The Worker's execution context, keeping what is handed to `waitUntil`.
 *
 * @returns {{ waited: Promise<*>[], waitUntil: function(Promise<*>): void }}
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

/**
 * The bindings `wrangler.jsonc` declares: the container's Durable Object namespace and the database.
 *
 * @returns {Object}
 */
function bindings() {
    return { [ BINDING ]: { name: "the container's namespace" }, [ DATABASE ]: databaseStub() };
}

/**
 * Serves one request through the Worker.
 *
 * @param {string} path With its query, as a client sends it.
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
function serve( path, init ) {
    return worker.default.fetch( new Request( `https://application.example${ path }`, init ), bindings(), contextStub() );
}

/**
 * Every file in the application's static directories, as the path it is served at.
 *
 * @returns {string[]}
 */
function staticPaths() {
    return Object.entries( STATIC_DIRECTORIES ).flatMap( ( [ prefix, directory ] ) => {
        const root = join( ROOT, directory );
        assert.ok( existsSync( root ), `${ directory }, served under ${ prefix }, does not exist` );
        return readdirSync( root, { recursive: true, withFileTypes: true } )
            .filter( ( entry ) => entry.isFile() )
            .map( ( entry ) => prefix + encodeURI( relative( root, join( entry.parentPath, entry.name ) ).split( sep ).join( "/" ) ) );
    } );
}

/**
 * The text of the Dockerfile `wrangler.jsonc` builds the container from.
 *
 * @returns {string}
 */
function dockerfile() {
    return readFileSync( join( ROOT, CONTAINER.image ), "utf8" );
}

/**
 * Whether an ignore file has a line that ignores a top-level name.
 *
 * @param {string} text The ignore file.
 * @param {string} name
 * @returns {boolean}
 */
function ignores( text, name ) {
    const forms = [ name, `${ name }/`, `${ name }/*`, `${ name }/**` ].flatMap( ( form ) => [ form, `/${ form }`, `**/${ form }` ] );
    return text.split( /\r?\n/ ).map( ( line ) => line.trim() ).some( ( line ) => forms.includes( line ) );
}

/**
 * Every `.gitignore` that applies to the application's directory: its own and its parents', up to the repository's.
 *
 * @returns {string[]}
 */
function gitignores() {
    const found = [];
    let directory = ROOT;
    for ( ;; ) {
        if ( existsSync( join( directory, ".gitignore" ) ) === true ) {
            found.push( readFileSync( join( directory, ".gitignore" ), "utf8" ) );
        }
        const parent = dirname( directory );
        if ( existsSync( join( directory, ".git" ) ) === true || parent === directory ) {
            return found;
        }
        directory = parent;
    }
}

describe( "Cloudflare — the Worker", () => {

    beforeEach( () => {
        containers.received.length = 0;
    } );

    it( "answers a scanner's probe itself, for any method, without waking the container", async () => {
        // One probe for each of the package's rules, which no other rule catches. A rule the application turns off
        // (`createWorker`'s `probes`) is a decision to take its probe out of this list too.
        for ( const path of [ "/a%252fb", "/backup.sql", "/wp-admin/", "/graphql", "/author-sitemap.xml", "/.git/config", "/?author=1" ] ) {
            for ( const method of [ "GET", "POST" ] ) {
                const response = await serve( path, { method: method, body: method === "POST" ? "x" : undefined } );
                assert.equal( response.status, 404, `${ method } ${ path }` );
            }
        }
        assert.deepEqual( containers.received, [] );
    } );

    it( "sends every other request to the container, told only what Cloudflare saw", async () => {
        const response = await serve( "/", { headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "elsewhere.example" } } );
        assert.equal( await response.text(), "from the container" );
        assert.equal( containers.received.length, 1 );
        const [ { namespace, request } ] = containers.received;
        assert.equal( namespace.name, "the container's namespace", `the Worker should reach the container through ${ BINDING }, the binding wrangler.jsonc names` );
        assert.equal( request.headers.get( "x-forwarded-for" ), "203.0.113.7" );
        assert.equal( request.headers.get( "x-forwarded-proto" ), "https" );
        assert.equal( request.headers.get( "x-forwarded-host" ), null );
    } );

    it( "sends every path the application serves to the container", async () => {
        // A path swallowed as a probe is answered 404 at the edge, with nothing in the application's logs to say why.
        const stopped = [];
        for ( const path of [ ...ROUTES, ...staticPaths() ] ) {
            containers.received.length = 0;
            await serve( path );
            if ( containers.received.length !== 1 ) {
                stopped.push( path );
            }
        }
        assert.deepEqual( stopped, [], "answered as probes" );
    } );

    it( "sends every query parameter the application's pages send to the container", async () => {
        const stopped = [];
        for ( const name of QUERY_PARAMETERS ) {
            containers.received.length = 0;
            await serve( `/?${ encodeURIComponent( name ) }=1` );
            if ( containers.received.length !== 1 ) {
                stopped.push( name );
            }
        }
        assert.deepEqual( stopped, [], "answered as probes" );
    } );

    it( "exports ContainerProxy, without which the container never starts", () => {
        // The runtime finds it by name on the Worker's exports, and routes the container's own requests through it.
        assert.equal( worker.ContainerProxy, containers.ContainerProxy );
    } );

} );

describe( "Cloudflare — the container", () => {

    it( "keeps its outbound handlers under the name wrangler.jsonc gives its class", () => {
        const handlers = containers.outboundHandlers.get( CLASS_NAME );
        assert.ok( handlers, `nothing answers ${ CLASS_NAME }'s requests: its container would never reach its state` );
        assert.equal( typeof handlers[ STATE_ADDRESS ], "function" );
    } );

    it( "answers its requests for state from the database wrangler.jsonc binds", async () => {
        const handlers = containers.outboundHandlers.get( CLASS_NAME ) || {};
        const env = bindings();
        const response = await handlers[ STATE_ADDRESS ]( new Request( `http://${ STATE_ADDRESS }/v1/health` ), env );
        assert.equal( response.status, 200 );
        assert.ok( env[ DATABASE ].asked.length > 0, `the state service never asked ${ DATABASE }` );
    } );

    it( "starts with the platform's settings, listening where the Dockerfile says", () => {
        const ApplicationClass = worker[ CLASS_NAME ];
        assert.equal( typeof ApplicationClass, "function", `the Worker exports no ${ CLASS_NAME }` );
        const container = new ApplicationClass( {}, bindings() );
        assert.equal( container.defaultPort, CONTAINER_PORT );
        assert.match( dockerfile(), new RegExp( `^EXPOSE ${ CONTAINER_PORT }$`, "m" ) );
        assert.equal( container.enableInternet, false );
        assert.ok( container.allowedHosts.includes( STATE_ADDRESS ) );
        assert.equal( container.envVars.TI_MEMORY_CACHE_STATE_URL, `http://${ STATE_ADDRESS }` );
        assert.equal( typeof container.sleepAfter, "string" );
    } );

    it( "sweeps expired state from that database, on the schedule wrangler.jsonc sets", async () => {
        assert.ok( ( ( CONFIG.triggers || {} ).crons || [] ).length > 0, "wrangler.jsonc sets no schedule, so the sweep never runs" );
        const env = bindings();
        const ctx = contextStub();
        await worker.default.scheduled( {}, env, ctx );
        await Promise.all( ctx.waited );
        assert.ok( env[ DATABASE ].asked.length > 0, `the sweep never asked ${ DATABASE }` );
    } );

} );

describe( "Cloudflare — the configuration", () => {

    it( "binds the container's class as a Durable Object, with the migration that creates it", () => {
        assert.ok( BINDING, `no Durable Object binding names ${ CLASS_NAME }` );
        assert.ok( ( CONFIG.migrations || [] ).some( ( migration ) => ( migration.new_sqlite_classes || [] ).includes( CLASS_NAME ) ), `no migration creates ${ CLASS_NAME }` );
    } );

    it( "builds the container from a Dockerfile that runs it unprivileged", () => {
        assert.ok( existsSync( join( ROOT, CONTAINER.image ) ), CONTAINER.image );
        assert.match( dockerfile(), /^USER (?!root$|0$)\S+$/m );
    } );

    it( "keeps wrangler's local state out of git, and it and any secret out of the image", () => {
        // `.wrangler/` holds a local D1 database once `npm run migrate:local` or `wrangler dev` has run.
        assert.ok( gitignores().some( ( text ) => ignores( text, ".wrangler" ) ), ".gitignore" );
        const dockerignore = readFileSync( join( ROOT, ".dockerignore" ), "utf8" );
        assert.ok( ignores( dockerignore, ".wrangler" ), ".dockerignore: .wrangler" );
        assert.ok( ignores( dockerignore, ".env" ), ".dockerignore: .env" );
    } );

    it( "has applied the D1 schema the installed core ships", () => {
        const schema = join( dirname( createRequire( import.meta.url ).resolve( "@ti-engine/core/state-service" ) ), "d1-state-schema.sql" );
        const applied = createHash( "sha256" ).update( readFileSync( schema ) ).digest( "hex" );
        assert.equal( applied, APPLIED_SCHEMA_SHA256, "the installed core ships another schema: apply it with `npm run migrate:remote`, then put its hash in APPLIED_SCHEMA_SHA256" );
    } );

} );
