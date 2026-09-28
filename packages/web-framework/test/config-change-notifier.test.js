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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const ConfigChangeNotifier = require( "#config-change-notifier" );

const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "ConfigChangeNotifier", () => {

    it( "delivers published events to subscribers asynchronously (frozen payload)", async () => {
        const notifier = new ConfigChangeNotifier();
        const received = [];
        notifier.subscribe( ( event ) => received.push( event ) );

        const event = notifier.publish( { changeSetID: "cs1", configKeys: [ "a" ], adminID: "admin:1", timestamp: "t" } );
        assert.equal( received.length, 0, "delivery must be asynchronous (matches a future cross-instance transport)" );
        assert.equal( Object.isFrozen( event ), true );

        await tick();
        assert.equal( received.length, 1 );
        assert.deepEqual( received[ 0 ], { changeSetID: "cs1", configKeys: [ "a" ], adminID: "admin:1", timestamp: "t" } );
    } );

    it( "delivers to multiple subscribers and supports unsubscribe", async () => {
        const notifier = new ConfigChangeNotifier();
        let a = 0;
        let b = 0;
        const unsubscribeA = notifier.subscribe( () => { a++; } );
        notifier.subscribe( () => { b++; } );
        assert.equal( notifier.subscriberCount(), 2 );

        notifier.publish( { changeSetID: "x", configKeys: [], adminID: "z", timestamp: "t" } );
        await tick();
        assert.equal( a, 1 );
        assert.equal( b, 1 );

        unsubscribeA();
        assert.equal( notifier.subscriberCount(), 1 );
        notifier.publish( { changeSetID: "y", configKeys: [], adminID: "z", timestamp: "t" } );
        await tick();
        assert.equal( a, 1, "unsubscribed listener is no longer called" );
        assert.equal( b, 2 );
    } );

    it( "isolates a throwing subscriber from the others", async () => {
        const notifier = new ConfigChangeNotifier();
        let good = 0;
        notifier.subscribe( () => { throw new Error( "boom" ); } );
        notifier.subscribe( () => { good++; } );

        assert.doesNotThrow( () => notifier.publish( { changeSetID: "x", configKeys: [], adminID: "z", timestamp: "t" } ) );
        await tick();
        assert.equal( good, 1, "a throwing subscriber must not block delivery to others" );
    } );

    it( "catches a subscriber that fails asynchronously too, and logs it", async ( t ) => {
        // A subscriber that returns a promise fails by rejecting it, and nothing here awaited it: the rejection was
        // unhandled, and core ends the process on one. competence reloads its configuration from such a subscriber,
        // so a store timing out right after an admin's save took the whole application down (CA-187).
        const logger = require( "@ti-engine/core/logger" );
        const unhandled = [];
        const onUnhandled = ( reason ) => unhandled.push( reason );
        process.on( "unhandledRejection", onUnhandled );
        t.after( () => process.off( "unhandledRejection", onUnhandled ) );
        const logged = [];
        t.mock.method( logger, "log", ( message, severity ) => logged.push( { message: String( message ), severity: severity } ) );

        const notifier = new ConfigChangeNotifier();
        let good = 0;
        notifier.subscribe( () => Promise.reject( new Error( "the state service timed out" ) ) );
        notifier.subscribe( () => { good++; } );
        notifier.publish( { changeSetID: "x", configKeys: [], adminID: "z", timestamp: "t" } );
        await tick();
        await tick();

        assert.equal( good, 1 );
        assert.equal( unhandled.length, 0, "the rejection was left unhandled" );
        const report = logged.find( ( entry ) => entry.message.includes( "the state service timed out" ) );
        assert.ok( report );
        assert.equal( report.severity, logger.logSeverity.WARNING );
    } );

} );
