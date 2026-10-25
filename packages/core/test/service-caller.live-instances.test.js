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
 * What a caller is told about a service whose instances have all gone (CA-560).
 *
 * A provider adds each alias to its domain's catalog set when it starts and never removes it, and the caller used to
 * decide that a service exists by membership of that set alone. Once every instance of a domain had stopped, cleanly
 * or not, a call was still accepted, its request sat in a queue nobody read, and the caller waited out the whole
 * executionTimeout - 180 s by default - before E_COM_SERVICE_EXEC_TIMEOUT. The caller now accepts an alias only while
 * a running instance of its domain is recorded in the domain's roster with a live heartbeat.
 *
 * Everything here is real: a Redis server, providers run by `bin/start-instance.js` as their own processes - stopped
 * with SIGTERM, which is a clean stop, or killed with SIGKILL - and a consumer in this process making the calls. Only
 * one ServiceInstance may exist per process, which is why the providers cannot live here too.
 *
 * Without a Redis server at TI_MEMORY_CACHE_REDIS_HOST:TI_MEMORY_CACHE_REDIS_PORT (127.0.0.1:6379 by default) the
 * suite skips, unless TI_TEST_REDIS_REQUIRED is set, as CI sets it, in which case it fails.
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
const VERBOSE = !!process.env.TI_TEST_VERBOSE;

// Settings are read once, when the framework is first required, so these go in before it is.
process.env.TI_AUDITING_LOG_CONSOLE_ENABLED = VERBOSE ? "true" : "false";
// The providers inherit this, and a message is verified with the key of the instance that receives it.
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY || "live-instances-test-" + crypto.randomUUID();

// Longer than any refusal may take, far shorter than the executionTimeout a hung call waits out.
const PATIENCE_MS = 2000;
const QUICK_MS = 1000;

let redisReachable = false;
let redis = null;
let caller = null;
let config = null;
let exceptions = null;
const domains = [];
const children = new Set();

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

function newDomain() {
    const domain = "live-instances-" + crypto.randomUUID().slice( 0, 8 );
    domains.push( domain );
    return domain;
}

const catalogKey = ( domain ) => config.getSetting( config.setting.SERVICE_REGISTRY_ADDRESS ) + domain;
const rosterKey = ( domain ) => config.getSetting( config.setting.SERVICE_INSTANCES_ADDRESS ) + domain;
const heartbeatPattern = ( domain ) => config.getSetting( config.setting.SERVICE_HEALTH_CHECK_ADDRESS ) + domain + ":*";

async function heartbeats( domain ) {
    return redis.keys( heartbeatPattern( domain ) );
}

async function rosterRecord( domain, instanceID ) {
    const value = await redis.hget( rosterKey( domain ), instanceID );
    return ( value === null ) ? null : JSON.parse( value );
}

async function rosterInstances( domain ) {
    return Object.keys( await redis.hgetall( rosterKey( domain ) ) ).filter( ( field ) => field.startsWith( "ti-" ) );
}

/**
 * Runs `bin/start-instance.js` for `domain` with the provider class in `fixture`, as its own process.
 */
function spawnProvider( domain, fixture, env ) {
    const child = spawn( process.execPath, [ path.join( PACKAGE_ROOT, "bin", "start-instance.js" ) ], {
        cwd: PACKAGE_ROOT,
        env: Object.assign( {}, process.env, {
            TI_INSTANCE_NAME: domain,
            TI_INSTANCE_CLASS: path.join( "test", "fixtures", fixture )
        }, env ),
        stdio: [ "ignore", "pipe", "pipe" ]
    } );
    const provider = { child, output: "" };
    child.stdout.on( "data", ( chunk ) => { provider.output += chunk; if ( VERBOSE ) process.stdout.write( chunk ); } );
    child.stderr.on( "data", ( chunk ) => { provider.output += chunk; if ( VERBOSE ) process.stderr.write( chunk ); } );
    provider.exited = new Promise( ( resolve ) => child.on( "exit", ( code, signal ) => {
        children.delete( child );
        resolve( { code, signal } );
    } ) );
    children.add( child );
    return provider;
}

/**
 * Starts a provider for `domain` as its own process - an {@link EchoProvider} unless `fixture` names another - and
 * resolves once it is serving: once its record is in the roster and, for one that writes a heartbeat, its heartbeat
 * too; for one that writes none (`beats: false`), once a call to it has been answered as well.
 * <br/>
 * The record is what to wait for, not the heartbeat. An instance beats once before it joins, so a test that went on at
 * the first heartbeat would race the join: a roster it deleted could be written again by the join rather than by the
 * beat the test means to exercise.
 */
async function startProvider( domain, { env = {}, fixture = "echo-provider.js", beats = true } = {} ) {
    const before = new Set( await rosterInstances( domain ) );
    const provider = spawnProvider( domain, fixture, env );
    const { child, exited } = provider;

    let instanceID = null;
    try {
        await waitFor( async () => {
            const fresh = ( await rosterInstances( domain ) ).filter( ( field ) => !before.has( field ) );
            instanceID = ( fresh.length > 0 ) ? fresh[ 0 ] : null;
            return instanceID !== null;
        }, 15000, `the new ${ domain } instance to join the roster` );
        if ( beats === false ) {
            const answered = await call( domain );
            assert.equal( answered.isSuccessful, true, "the provider did not answer its first call" );
        } else {
            assert.ok( ( await heartbeats( domain ) ).some( ( key ) => key.endsWith( ":" + instanceID ) ), "the instance joined without its heartbeat" );
        }
    } catch ( error ) {
        child.kill( "SIGKILL" );
        error.message += `\n--- provider output ---\n${ provider.output }`;
        throw error;
    }
    return { child, exited, instanceID };
}

async function stopProvider( provider, signal ) {
    provider.child.kill( signal );
    const { code } = await Promise.race( [ provider.exited, sleep( 10000 ).then( () => ( { code: "still running" } ) ) ] );
    if ( signal === "SIGTERM" ) {
        assert.equal( code, 0, "the provider did not stop cleanly" );
    }
}

function call( domain ) {
    return caller.callService( { serviceDomainName: domain, serviceAlias: "echo", serviceVersion: 1 }, { ping: domain }, {} );
}

/** The call's result if it settled within `ms`, with how long it took; `settled: false` if it was still waiting. */
async function within( promise, ms ) {
    const started = Date.now();
    return Promise.race( [
        promise.then( ( result ) => ( { settled: true, result, elapsed: Date.now() - started } ) ),
        sleep( ms ).then( () => ( { settled: false } ) )
    ] );
}

function assertAnswered( outcome ) {
    assert.equal( outcome.settled, true, `the call was still waiting after ${ PATIENCE_MS } ms` );
    assert.equal( outcome.result.isSuccessful, true, JSON.stringify( outcome.result.exception ) );
}

function assertRefusedAtOnce( outcome ) {
    assert.equal( outcome.settled, true, `the call was still waiting after ${ PATIENCE_MS } ms: it would have waited out the executionTimeout` );
    assert.equal( outcome.result.isSuccessful, false, "the call was answered by a domain with no instance" );
    assert.equal( outcome.result.exception.code, exceptions.exceptionCode.E_COM_SERVICE_NOT_REGISTERED );
    assert.ok( outcome.elapsed < QUICK_MS, `the refusal took ${ outcome.elapsed } ms` );
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

    config = require( "#config" );
    exceptions = require( "#exceptions" );
    const ServiceConsumer = require( "#service-consumer" );
    class Caller extends ServiceConsumer {}
    caller = new Caller( newDomain() );
    await caller.start();
} );

after( async () => {
    for ( const child of children ) {
        child.kill( "SIGKILL" );
    }
    if ( caller ) {
        await caller.stop();
    }
    if ( redis ) {
        for ( const domain of domains ) {
            const keys = await redis.keys( `*${ domain }*` );
            if ( keys.length > 0 ) {
                await redis.del( ...keys );
            }
        }
        redis.disconnect();
    }
} );

describe( "service calls to a domain whose instances have gone", () => {

    it( "a running provider answers", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const provider = await startProvider( domain );
        const outcome = await within( call( domain ), PATIENCE_MS );
        assertAnswered( outcome );
        assert.deepEqual( outcome.result.payload, { ping: domain } );
        await stopProvider( provider, "SIGTERM" );
    } );

    it( "refuses at once after the only instance stops cleanly", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const provider = await startProvider( domain );
        await stopProvider( provider, "SIGTERM" );
        assert.equal( await redis.sismember( catalogKey( domain ), "echo" ), 1, "the catalog still lists the alias, as before" );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "refuses at once after a clean stop even when the roster was lost while the instance ran", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const provider = await startProvider( domain );
        // Deleted by hand or evicted under memory pressure: the next beat writes the record back, but not the marker.
        await redis.del( rosterKey( domain ) );
        await waitFor( async () => ( await rosterRecord( domain, provider.instanceID ) )?.heartbeat === true, 5000, "the next beat to write the record back" );
        await stopProvider( provider, "SIGTERM" );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "refuses at once once a killed instance's heartbeat has expired", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const provider = await startProvider( domain );
        const killedAt = Date.now();
        await stopProvider( provider, "SIGKILL" );
        await waitFor( async () => ( await heartbeats( domain ) ).length === 0, 10000, "the killed instance's heartbeat to expire" );
        const expiry = config.getSetting( config.setting.SERVICE_HEALTH_CHECK_TIMEOUT ) * 1000;
        assert.ok( Date.now() - killedAt <= expiry + 1500, `the heartbeat outlived its ${ expiry } ms expiry by more than a tick` );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "keeps answering while one of two instances runs, and refuses once neither does", { timeout: 45000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const first = await startProvider( domain );
        const second = await startProvider( domain );
        await stopProvider( first, "SIGTERM" );
        assertAnswered( await within( call( domain ), PATIENCE_MS ) );
        await stopProvider( second, "SIGTERM" );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "refuses at once after a clean stop of an instance with the heartbeat off", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const provider = await startProvider( domain, { env: { TI_SERVICE_HEALTH_CHECK_ENABLED: "false" }, beats: false } );
        await stopProvider( provider, "SIGTERM" );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "counts an instance whose reportHealthy writes no heartbeat as running, and refuses at once after it stops", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const provider = await startProvider( domain, { fixture: "custom-health-provider.js", beats: false } );
        // Past the heartbeat's expiry: a record that claimed a heartbeat it never wrote would read as dead by now.
        await sleep( config.getSetting( config.setting.SERVICE_HEALTH_CHECK_TIMEOUT ) * 1000 + 500 );
        assertAnswered( await within( call( domain ), PATIENCE_MS ) );
        await stopProvider( provider, "SIGTERM" );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "still calls a domain whose providers keep no roster, as a provider before 1.21.0 does", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        // With the heartbeat off nothing rewrites the roster once it is gone, which leaves the catalog entry alone, as
        // an older provider would.
        const provider = await startProvider( domain, { env: { TI_SERVICE_HEALTH_CHECK_ENABLED: "false" }, beats: false } );
        await redis.del( rosterKey( domain ) );
        assertAnswered( await within( call( domain ), PATIENCE_MS ) );
        await stopProvider( provider, "SIGTERM" );
    } );

    it( "leaves the roster again when its start fails after joining", { timeout: 30000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        // The fixture's start rejects once the join has landed, and start-instance then exits without a stop. Left in
        // the roster, the record would count it as running until its heartbeat expired - for good, were it unwatched.
        const provider = spawnProvider( domain, "failing-schedule-provider.js", {} );
        const { code } = await Promise.race( [ provider.exited, sleep( 15000 ).then( () => ( { code: "still running" } ) ) ] );
        assert.equal( code, 1, `the start did not fail as the fixture makes it\n--- provider output ---\n${ provider.output }` );
        assert.equal( await redis.sismember( catalogKey( domain ), "echo" ), 1, "the provider never got as far as registering" );
        assert.deepEqual( await rosterInstances( domain ), [], "the failed instance is still recorded" );
        assertRefusedAtOnce( await within( call( domain ), PATIENCE_MS ) );
    } );

    it( "drops a killed instance's record when the next instance starts", { timeout: 45000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const domain = newDomain();
        const crashed = await startProvider( domain );
        await waitFor( async () => ( await rosterRecord( domain, crashed.instanceID ) )?.heartbeat === true, 5000, "the first instance's record to show its heartbeat" );
        await stopProvider( crashed, "SIGKILL" );
        await waitFor( async () => ( await heartbeats( domain ) ).length === 0, 10000, "the killed instance's heartbeat to expire" );
        const next = await startProvider( domain );
        assert.equal( await rosterRecord( domain, crashed.instanceID ), null, "the killed instance is still recorded" );
        assert.notEqual( await rosterRecord( domain, next.instanceID ), null, "the new instance is not recorded" );
        assertAnswered( await within( call( domain ), PATIENCE_MS ) );
        await stopProvider( next, "SIGTERM" );
    } );

} );

describe( "the Redis backend's hashGetAll, which the roster is read with", () => {

    it( "returns every field parsed, keeps a field named __proto__ as an entry, and returns {} for a missing hash", { timeout: 10000 }, async ( t ) => {
        if ( !redisReachable ) return t.skip( `no Redis at ${ REDIS_HOST }:${ REDIS_PORT }` );
        const cache = require( "#cache" );
        const key = rosterKey( newDomain() );
        await redis.hset( key, "record", JSON.stringify( { heartbeat: true } ), "text", "not JSON", "__proto__", JSON.stringify( { polluted: true } ) );

        const fields = await cache.instance.hashGetAll( key );
        assert.equal( Object.getPrototypeOf( fields ), null );
        assert.deepEqual( Object.keys( fields ).sort(), [ "__proto__", "record", "text" ] );
        assert.deepEqual( fields.record, { heartbeat: true } );
        assert.equal( fields.text, "not JSON", "a value that is not JSON comes back as it was stored" );
        // On a plain object this assignment would have replaced the prototype, and the field would have vanished.
        assert.deepEqual( fields[ "__proto__" ], { polluted: true } );
        assert.equal( ( {} ).polluted, undefined );

        const missing = await cache.instance.hashGetAll( key + ":missing" );
        assert.deepEqual( Object.keys( missing ), [] );
    } );

} );
