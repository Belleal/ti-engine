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

const fs = require( "node:fs" );
const http = require( "node:http" );
const path = require( "node:path" );

/**
 * `node:sqlite`, or null on a Node that predates it (22.5). The package supports Node 20, so a suite built on this
 * skips there rather than failing: `sqliteUnavailable` is the reason to hand `describe( ..., { skip } )`.
 */
let sqlite = null;
try {
    sqlite = require( "node:sqlite" );
} catch {
    sqlite = null;
}

const SCHEMA_PATH = path.resolve( __dirname, "..", "..", "components", "cache", "d1-state-schema.sql" );

/**
 * Whether a statement answers rows, which decides how a batch runs it — D1 reports a read's rows and a write's changes.
 *
 * @param {string} sql
 * @returns {boolean}
 */
function isReader( sql ) {
    return /^\s*(SELECT|WITH)\b/i.test( sql );
}

/**
 * Opens an in-memory SQLite database shaped as a Cloudflare D1 binding, with the state schema applied from the file
 * the package ships — so a statement that only works against a schema nobody deploys fails here.
 * <br/>
 * NOTE: This models the three things the service relies on and nothing more: `prepare().bind()` with `?NNN`
 * parameters, `first()` / `run()` / `all()` in D1's result shapes (`meta.changes`, `results`), and `batch()` as ONE
 * transaction, rolled back whole when any statement in it fails — which is what makes a merge across several entities
 * atomic on D1. Every statement executed is logged with the batch it ran in, so a test can assert on what the service
 * sent, not only on what it stored.
 *
 * @method
 * @param {Object} [options]
 * @param {boolean} [options.schema=true] Apply the shipped schema.
 * @returns {Object} The binding, plus `sqlite` (the raw database), `log`, `failNext( predicate )` and `rows( key )`.
 * @public
 */
function createD1Database( options = {} ) {
    const database = new sqlite.DatabaseSync( ":memory:" );
    if ( options.schema !== false ) {
        database.exec( fs.readFileSync( SCHEMA_PATH, "utf8" ) );
    }

    const log = [];
    let batches = 0;
    let failure = null;

    const execute = ( sql, params, mode, batch ) => {
        log.push( { sql: sql, params: params, mode: mode, batch: batch } );
        if ( failure !== null && failure( sql, params ) === true ) {
            failure = null;
            throw new Error( "D1_ERROR: forced by the test" );
        }
        const statement = database.prepare( sql );
        if ( mode === "first" ) {
            const row = statement.get( ...params );
            return ( row === undefined ) ? null : { ...row };
        }
        if ( mode === "all" ) {
            return { success: true, meta: { changes: 0 }, results: statement.all( ...params ).map( ( row ) => ( { ...row } ) ) };
        }
        const info = statement.run( ...params );
        return { success: true, meta: { changes: Number( info.changes ), last_row_id: Number( info.lastInsertRowid ) }, results: [] };
    };

    const prepared = ( sql, params ) => Object.freeze( {
        sql: sql,
        params: params,
        bind: ( ...values ) => prepared( sql, values ),
        first: async ( column ) => {
            const row = execute( sql, params, "first", null );
            if ( column === undefined ) {
                return row;
            }
            return ( row !== null && row[ column ] !== undefined ) ? row[ column ] : null;
        },
        run: async () => execute( sql, params, "run", null ),
        all: async () => execute( sql, params, "all", null )
    } );

    return {
        prepare: ( sql ) => prepared( sql, [] ),
        batch: async ( statements ) => {
            const batch = ++batches;
            database.exec( "BEGIN" );
            try {
                const results = statements.map( ( statement ) => execute( statement.sql, statement.params, isReader( statement.sql ) ? "all" : "run", batch ) );
                database.exec( "COMMIT" );
                return results;
            } catch ( error ) {
                database.exec( "ROLLBACK" );
                throw error;
            }
        },
        exec: async ( sql ) => {
            database.exec( sql );
            return { count: 0, duration: 0 };
        },

        /* Test hooks — not part of a D1 binding */

        sqlite: database,
        log: log,
        failNext: ( predicate ) => {
            failure = predicate;
        },
        rows: ( key ) => database.prepare( "SELECT path, leaf, value FROM state_partitions WHERE key = ?1 ORDER BY path" ).all( key ).map( ( row ) => ( { ...row } ) )
    };
}

/**
 * Calls a Fetch-style handler with one protocol request and decodes the answer.
 *
 * @method
 * @param {function(Request): Promise<Response>} handler
 * @param {string} route e.g. "/v1/documents/get".
 * @param {Object} [payload] The JSON body; omitted for a GET.
 * @param {string} [method="POST"]
 * @returns {Promise<{status: number, body: Object}>}
 * @public
 */
async function callService( handler, route, payload, method = "POST" ) {
    const response = await handler( new Request( "http://state.internal" + route, {
        method: method,
        headers: { "content-type": "application/json" },
        body: ( method === "GET" || method === "HEAD" ) ? undefined : JSON.stringify( payload === undefined ? {} : payload )
    } ) );
    const text = await response.text();
    return { status: response.status, body: ( text.length > 0 ) ? JSON.parse( text ) : null };
}

/**
 * Serves a Fetch-style handler over real HTTP, the way the Workers runtime serves the Worker to the container: a
 * `Request` in, a `Response` out. Lets {@link HttpCacheProvider} — the client an application actually uses — talk to
 * the service end to end.
 *
 * @method
 * @param {function(Request): Promise<Response>} handler
 * @returns {Promise<{server: http.Server, baseUrl: string}>}
 * @public
 */
function serveOverHttp( handler ) {
    const server = http.createServer( async ( incoming, outgoing ) => {
        const chunks = [];
        for await ( const chunk of incoming ) {
            chunks.push( chunk );
        }
        const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
        const response = await handler( new Request( "http://state.internal" + incoming.url, {
            method: incoming.method,
            headers: { "content-type": incoming.headers[ "content-type" ] || "application/json" },
            body: hasBody ? Buffer.concat( chunks ) : undefined
        } ) );
        outgoing.writeHead( response.status, { "content-type": response.headers.get( "content-type" ) || "application/json" } );
        outgoing.end( Buffer.from( await response.arrayBuffer() ) );
    } );
    return new Promise( ( resolve ) => {
        server.listen( 0, "127.0.0.1", () => {
            resolve( { server: server, baseUrl: `http://127.0.0.1:${ server.address().port }` } );
        } );
    } );
}

/**
 * competence's partition spec, as its Cloudflare design record derives it from every read and write its DataManager
 * makes: the realistic case — one to three levels deep, and two keys with two patterns each.
 *
 * @type {Object<string, string[][]>}
 */
const competencePartitions = Object.freeze( {
    "ti:competence:data:employees": [ [ "*" ] ],
    "ti:competence:data:evaluations": [ [ "*", "*" ] ],
    "ti:competence:data:cycles": [ [ "*" ] ],
    "ti:competence:data:calendars": [ [ "*", "*", "*" ] ],
    "ti:competence:data:role-grants": [ [ "*" ] ],
    "ti:competence:data:role-families": [ [ "*" ] ],
    "ti:competence:data:active-competency-sets": [ [ "*" ] ],
    "ti:competence:data:results-snapshots": [ [ "*" ] ],
    "ti:competence:data:peer-review-assignments": [ [ "*", "*", "*" ] ],
    "ti:competence:data:audit-log": [ [ "employees", "*", "*" ], [ "evaluations", "*", "*" ] ],
    "ti:competence:data:research-consent": [ [ "texts", "*" ], [ "decisions", "*", "*", "*" ] ]
} );

module.exports = {
    competencePartitions: competencePartitions,
    createD1Database: createD1Database,
    callService: callService,
    serveOverHttp: serveOverHttp,
    sqliteUnavailable: ( sqlite === null ) ? "node:sqlite needs Node 22.5 or later" : false
};
