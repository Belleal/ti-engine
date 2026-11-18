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

/*
 * The message trace on a real Redis, for a real bus call (CA-589).
 *
 * A consumer in this process calls an echo provider that `bin/start-instance.js` runs as its own process, with a bearer
 * token and parameters no trace may hold. The provider answers with the parameters, so the response carries them too.
 * The trace used to keep the token and the parameters in one key that either never expired under traffic or, without
 * RedisJSON, had no expiry at all. Each chain's trace is now a list of its own whose expiry is set with every push.
 *
 * Without a Redis server at TI_MEMORY_CACHE_REDIS_HOST:TI_MEMORY_CACHE_REDIS_PORT (127.0.0.1:6379 by default) the
 * suite skips, unless TI_TEST_REDIS_REQUIRED is set, as CI sets it, in which case it fails. It runs with and without
 * the JSON module alike: the trace no longer depends on it.
 */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const net = require( "node:net" );
const path = require( "node:path" );
const crypto = require( "node:crypto" );
const { spawn } = require( "node:child_process" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const REDIS_HOST = process.env.TI_MEMORY_CACHE_REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number( process.env.TI_MEMORY_CACHE_REDIS_PORT || 6379 );
const REDIS_REQUIRED = [ "1", "true", "yes" ].includes( String( process.env.TI_TEST_REDIS_REQUIRED || "" ).toLowerCase() );

// Read once, when the framework is first required, so these go in before it is. The provider inherits them. The
// trace's own settings are taken out of the environment, so that a developer's shell cannot change what is measured.
process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = "false";
Object.keys( process.env ).filter( ( name ) => name.startsWith( "TI_MESSAGE_EXCHANGE_TRACE_" ) ).forEach( ( name ) => delete process.env[ name ] );
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY || "message-tracer-test-" + crypto.randomUUID();

const TOKEN = "bearer-" + crypto.randomUUID();
const EMAIL = "someone-" + crypto.randomUUID().slice( 0, 8 ) + "@example.invalid";
const RESET_CODE = String( 100000 + crypto.randomInt( 900000 ) );

const DOMAIN = "message-tracer-" + crypto.randomUUID().slice( 0, 8 );
const OWN_KEYS = [];

let redisReachable = false;
let redis = null;
let caller = null;
let cache = null;
let provider = null;

function probeRedis() {
    return new Promise( ( resolve ) => {
        const socket = net.connect( { host: REDIS_HOST, port: REDIS_PORT } );
        let answer = "";
        socket.setTimeout( 1000 );
        socket.on( "connect", () => socket.write( "PING\r\n" ) );
        socket.on( "data", ( chunk ) => {
            answer += chunk.toString();
            if ( answer.includes( "\r\n" ) ) {
                socket.destroy();
                resolve( answer.startsWith( "+PONG" ) );
            }
        } );
        socket.on( "timeout", () => { socket.destroy(); resolve( false ); } );
        socket.on( "error", () => resolve( false ) );
    } );
}

const sleep = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );

async function waitFor( predicate, timeoutMs, what ) {
    const deadline = Date.now() + timeoutMs;
    for ( ;; ) {
        if ( await predicate() ) {
            return;
        }
        if ( Date.now() > deadline ) {
            throw new Error( `Timed out after ${ timeoutMs } ms waiting for ${ what }.` );
        }
        await sleep( 50 );
    }
}

/** The trace lists holding an entry addressed to this suite's domain, as `{ key, entries }`. */
async function tracesOfDomain() {
    const found = [];
    for ( const key of await redis.keys( "ti:messages:trace:*" ) ) {
        if ( await redis.type( key ) !== "list" ) {
            continue;
        }
        const entries = ( await redis.lrange( key, 0, -1 ) ).map( ( entry ) => JSON.parse( entry ) );
        if ( entries.some( ( entry ) => entry.messageSnapshot && entry.messageSnapshot.serviceAddress && entry.messageSnapshot.serviceAddress.serviceDomainName === DOMAIN ) ) {
            found.push( { key, entries } );
        }
    }
    return found;
}

before( async () => {
    redisReachable = await probeRedis();
    if ( !redisReachable ) {
        if ( REDIS_REQUIRED ) {
            throw new Error( `TI_TEST_REDIS_REQUIRED is set and no Redis answers at ${ REDIS_HOST }:${ REDIS_PORT }.` );
        }
        return;
    }

    const Redis = require( "ioredis" );
    redis = new Redis( { host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true, maxRetriesPerRequest: 1 } );
    await redis.connect();

    cache = require( "@ti-engine/core/cache" );
    const ServiceConsumer = require( "#service-consumer" );
    class Caller extends ServiceConsumer {}
    caller = new Caller( "message-tracer-caller-" + crypto.randomUUID().slice( 0, 8 ) );
    await caller.start();

    const child = spawn( process.execPath, [ path.join( PACKAGE_ROOT, "bin", "start-instance.js" ) ], {
        cwd: PACKAGE_ROOT,
        env: Object.assign( {}, process.env, { TI_INSTANCE_NAME: DOMAIN, TI_INSTANCE_CLASS: path.join( "test", "fixtures", "echo-provider.js" ) } ),
        stdio: [ "ignore", "pipe", "pipe" ]
    } );
    provider = { child, output: "" };
    child.stdout.on( "data", ( chunk ) => { provider.output += chunk; } );
    child.stderr.on( "data", ( chunk ) => { provider.output += chunk; } );
    provider.exited = new Promise( ( resolve ) => child.on( "exit", resolve ) );
    try {
        await waitFor( async () => Object.keys( await redis.hgetall( "ti:services:registry:instances:" + DOMAIN ) ).some( ( field ) => field.startsWith( "ti-" ) ),
            15000, "the echo provider to join its roster" );
    } catch ( error ) {
        error.message += `\n--- provider output ---\n${ provider.output }`;
        throw error;
    }
} );

after( async () => {
    if ( provider ) {
        provider.child.kill( "SIGTERM" );
        await Promise.race( [ provider.exited, sleep( 10000 ) ] );
    }
    if ( caller ) {
        await caller.stop();
    }
    if ( redis ) {
        const keys = [ ...OWN_KEYS, ...( await redis.keys( `*${ DOMAIN }*` ) ) ];
        for ( const { key } of await tracesOfDomain() ) {
            keys.push( key );
        }
        if ( keys.length > 0 ) {
            await redis.del( ...keys );
        }
        redis.disconnect();
    }
} );

describe( "the message trace of a real bus call", () => {

    it( "is one list for the chain, six entries, expiring an hour after the last, holding no token or parameter", async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );

        const result = await caller.callService( { serviceDomainName: DOMAIN, serviceAlias: "echo", serviceVersion: 1 },
            { email: EMAIL, code: RESET_CODE }, { authToken: TOKEN } );
        assert.equal( result.isSuccessful, true, JSON.stringify( result.exception ) );
        assert.deepEqual( result.payload, { email: EMAIL, code: RESET_CODE } );

        // The pushes are not awaited by the bus: request SENT, DELIVERED and RECEIVED, then the same for the response.
        let traces = [];
        await waitFor( async () => {
            traces = await tracesOfDomain();
            return traces.length === 1 && traces[ 0 ].entries.length === 6;
        }, 5000, "six trace entries in one list" );

        const [ { key, entries } ] = traces;
        assert.equal( key, "ti:messages:trace:" + entries[ 0 ].chainID );
        assert.ok( entries.every( ( entry ) => entry.chainID === entries[ 0 ].chainID ) );
        assert.deepEqual( entries.map( ( entry ) => entry.messageType + " " + entry.dispatchEvent ).sort(), [
            "REQUEST DELIVERED", "REQUEST RECEIVED", "REQUEST SENT", "RESPONSE DELIVERED", "RESPONSE RECEIVED", "RESPONSE SENT"
        ] );

        const ttl = await redis.ttl( key );
        assert.ok( ttl > 3590 && ttl <= 3600, `the chain's trace expires in ${ ttl } s` );

        const stored = JSON.stringify( entries );
        for ( const secret of [ TOKEN, EMAIL, RESET_CODE ] ) {
            assert.equal( stored.includes( secret ), false, `the trace holds '${ secret }'` );
        }
        assert.ok( entries.every( ( entry ) => entry.messageSnapshot.authToken === "OBSCURED_BY_SYSTEM" ) );
    } );

} );

describe( "a list pushed with an expiration (the cache contract)", () => {

    it( "has its time-to-live from the push; without one it has none", async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );

        const expiring = "message-tracer-test:expiring:" + crypto.randomUUID();
        const lasting = "message-tracer-test:lasting:" + crypto.randomUUID();
        OWN_KEYS.push( expiring, lasting );

        assert.equal( await cache.instance.listPushValue( expiring, [ { n: 1 } ], 30 ), 1 );
        assert.equal( await cache.instance.listPushValue( expiring, [ { n: 2 } ], 30 ), 2 );
        assert.equal( await cache.instance.listPushValue( lasting, [ { n: 1 } ] ), 1 );

        const ttl = await redis.ttl( expiring );
        assert.ok( ttl > 0 && ttl <= 30, `the list expires in ${ ttl } s` );
        assert.equal( await redis.ttl( lasting ), -1 );
        assert.deepEqual( ( await redis.lrange( expiring, 0, -1 ) ).map( ( value ) => JSON.parse( value ).n ), [ 2, 1 ] );
    } );

    it( "refuses an expiration that is not a whole number of seconds above 0, and writes nothing", async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );

        // Inside the MULTI, Redis refuses the EXPIRE alone, after the push (1.5, "abc"), or deletes the list (-1).
        const exceptions = require( "@ti-engine/core/exceptions" );
        for ( const expiration of [ 1.5, "abc", -1 ] ) {
            const key = "message-tracer-test:refused:" + crypto.randomUUID();
            OWN_KEYS.push( key );
            await assert.rejects( cache.instance.listPushValue( key, [ { n: 1 } ], expiration ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
            assert.equal( await redis.exists( key ), 0, `a refused push with expiration ${ expiration } wrote the list` );
        }
    } );

} );
