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
 * Scheduled jobs (CA-486): which are due on a tick, that each runs once a period, and that one failing stops nothing.
 */

const { describe, it, before, beforeEach, after } = require( "node:test" );
const assert = require( "node:assert/strict" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

const cacheStub = installInMemoryCache();

const JobScheduler = require( "#job-scheduler" );

const originalLog = logger.log;
before( () => {
    logger.log = () => {};
} );
after( () => {
    logger.log = originalLog;
} );

beforeEach( () => {
    cacheStub.values = {};
} );

const at = ( day, hours, minutes = 0 ) => new Date( Date.UTC( 2026, 9, day, hours, minutes ) );

describe( "when a job is due", () => {

    const daily = { every: "day", at: { hours: 4, minutes: 0 } };
    const hourly = { every: "hour", at: null };

    it( "starts a daily job's period at its time of day, in UTC", () => {
        assert.equal( JobScheduler.periodStart( daily, at( 14, 4, 0 ) ), at( 14, 4, 0 ).getTime() );
        assert.equal( JobScheduler.periodStart( daily, at( 14, 3, 59 ) ), at( 13, 4, 0 ).getTime() );
        assert.equal( JobScheduler.periodStart( daily, at( 14, 23, 0 ) ), at( 14, 4, 0 ).getTime() );
    } );

    it( "starts an hourly job's period on the hour", () => {
        assert.equal( JobScheduler.periodStart( hourly, at( 14, 9, 47 ) ), at( 14, 9, 0 ).getTime() );
    } );

    it( "is due when it never ran, or last ran before its period began", () => {
        assert.equal( JobScheduler.isDue( daily, NaN, at( 14, 10 ) ), true );
        assert.equal( JobScheduler.isDue( daily, at( 14, 3, 59 ).getTime(), at( 14, 10 ) ), true );
        assert.equal( JobScheduler.isDue( daily, at( 14, 4, 0 ).getTime(), at( 14, 10 ) ), false );
        assert.equal( JobScheduler.isDue( daily, at( 13, 23 ).getTime(), at( 14, 3 ) ), false );
    } );

    it( "reads a time of day only as HH:MM", () => {
        assert.deepEqual( JobScheduler.parseTimeOfDay( "04:00" ), { hours: 4, minutes: 0 } );
        assert.deepEqual( JobScheduler.parseTimeOfDay( "23:59" ), { hours: 23, minutes: 59 } );
        for ( const value of [ "4:00", "24:00", "12:60", "noon", 400, undefined ] ) {
            assert.equal( JobScheduler.parseTimeOfDay( value ), null, String( value ) );
        }
    } );

} );

describe( "registerJob", () => {

    it( "refuses a bad name, period, time of day or run", () => {
        const scheduler = new JobScheduler();
        const run = () => {};
        for ( const [ name, definition ] of [
            [ "", { every: "day", run } ],
            [ "has space", { every: "day", run } ],
            [ "job", { every: "week", run } ],
            [ "job", { every: "day", at: "25:00", run } ],
            [ "job", { every: "day" } ]
        ] ) {
            assert.throws( () => scheduler.registerJob( name, definition ), ( error ) => error.code === exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
        }
        assert.equal( scheduler.hasJobs, false );
        scheduler.registerJob( "app.reminders", { every: "day", at: "04:00", run } );
        assert.equal( scheduler.hasJobs, true );
    } );

} );

describe( "runDueJobs", () => {

    it( "runs a daily job once a day, at the first tick after its time", async () => {
        const scheduler = new JobScheduler();
        const runs = [];
        scheduler.registerJob( "reminders", { every: "day", at: "04:00", run: ( { now } ) => {
            runs.push( now.toISOString() );
        } } );

        assert.deepEqual( await scheduler.runDueJobs( at( 14, 4, 5 ) ), { ran: [ "reminders" ], failed: [] } );
        assert.deepEqual( await scheduler.runDueJobs( at( 14, 4, 20 ) ), { ran: [], failed: [] } );
        assert.deepEqual( await scheduler.runDueJobs( at( 15, 3, 59 ) ), { ran: [], failed: [] } );
        assert.deepEqual( await scheduler.runDueJobs( at( 15, 4, 0 ) ), { ran: [ "reminders" ], failed: [] } );
        assert.deepEqual( runs, [ at( 14, 4, 5 ).toISOString(), at( 15, 4, 0 ).toISOString() ] );
    } );

    it( "runs a job first seen after its time on that first tick", async () => {
        const scheduler = new JobScheduler();
        let runs = 0;
        scheduler.registerJob( "reminders", { every: "day", at: "04:00", run: () => {
            runs += 1;
        } } );
        await scheduler.runDueJobs( at( 14, 16 ) );
        assert.equal( runs, 1 );
    } );

    it( "logs a failing job, runs the others, and runs the failed one again on the next tick", async () => {
        const scheduler = new JobScheduler();
        let attempts = 0;
        let others = 0;
        scheduler.registerJob( "flaky", { every: "hour", run: () => {
            attempts += 1;
            if ( attempts === 1 ) {
                throw new Error( "first time fails" );
            }
        } } );
        scheduler.registerJob( "steady", { every: "hour", run: () => Promise.resolve().then( () => {
            others += 1;
        } ) } );

        assert.deepEqual( await scheduler.runDueJobs( at( 14, 9, 1 ) ), { ran: [ "steady" ], failed: [ "flaky" ] } );
        assert.deepEqual( await scheduler.runDueJobs( at( 14, 9, 16 ) ), { ran: [ "flaky" ], failed: [] } );
        assert.equal( attempts, 2 );
        assert.equal( others, 1 );
    } );

    it( "runs a job once when two ticks arrive together", async () => {
        const scheduler = new JobScheduler();
        let runs = 0;
        scheduler.registerJob( "reminders", { every: "day", at: "04:00", run: () => new Promise( ( resolve ) => setImmediate( () => {
            runs += 1;
            resolve();
        } ) ) } );
        await Promise.all( [ scheduler.runDueJobs( at( 14, 5 ) ), scheduler.runDueJobs( at( 14, 5 ) ) ] );
        assert.equal( runs, 1 );
    } );

    it( "does not record a job whose record could not be written, so the next tick runs it again", async () => {
        const scheduler = new JobScheduler();
        let runs = 0;
        scheduler.registerJob( "reminders", { every: "hour", run: () => {
            runs += 1;
        } } );
        const setValue = cacheStub.setValue;
        cacheStub.setValue = () => Promise.reject( new Error( "store down" ) );
        try {
            assert.deepEqual( await scheduler.runDueJobs( at( 14, 9 ) ), { ran: [], failed: [ "reminders" ] } );
        } finally {
            cacheStub.setValue = setValue;
        }
        assert.deepEqual( await scheduler.runDueJobs( at( 14, 9, 30 ) ), { ran: [ "reminders" ], failed: [] } );
        assert.equal( runs, 2 );
    } );

} );
