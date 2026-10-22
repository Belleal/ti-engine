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
 * The deployment's time zone (core 1.20.0, CA-550): every calendar day of an application is a date in it. The setting
 * is read once and frozen, so this file sets it before anything loads, in the form an operator might write it.
 */

process.env.TI_LOCALIZATION_TIME_ZONE = "europe/sofia";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const path = require( "node:path" );
const { execFile } = require( "node:child_process" );

const timeZone = require( "../utils/time-zone.js" );
const exceptions = require( "../utils/exceptions.js" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );

// 00:30 on 22 October 2026 in Sofia (EEST, UTC+3), and 23:30 the evening before.
const AFTER_MIDNIGHT = Date.parse( "2026-10-21T21:30:00Z" );
const BEFORE_MIDNIGHT = Date.parse( "2026-10-21T20:30:00Z" );

/**
 * Starts an instance with a time zone and reports how it ended and what it logged.
 *
 * @param {string} zone
 * @returns {Promise<{code: number, output: string}>}
 * @private
 */
function startWithTimeZone( zone ) {
    return new Promise( ( resolve ) => {
        execFile( process.execPath, [ path.join( PACKAGE_ROOT, "bin", "start-instance.js" ) ], {
            cwd: PACKAGE_ROOT,
            timeout: 30000,
            env: Object.assign( {}, process.env, {
                TI_INSTANCE_NAME: "time-zone-test",
                TI_INSTANCE_CLASS: path.join( "test", "fixtures", "rejecting-service.js" ),
                TI_MEMORY_CACHE_PROVIDER: path.join( PACKAGE_ROOT, "test", "fixtures", "stub-cache-provider.js" ),
                TI_MESSAGE_EXCHANGE_ENABLED: "false",
                TI_SERVICE_HEALTH_CHECK_ENABLED: "false",
                TI_AUDITING_LOG_MIN_LEVEL: "0",
                TI_AUDITING_LOG_USES_JSON: "false",
                TI_LOCALIZATION_TIME_ZONE: zone
            } )
        }, ( error, stdout, stderr ) => {
            resolve( { code: error ? error.code : 0, output: `${ stdout }\n${ stderr }` } );
        } );
    } );
}

describe( "the deployment's time zone (CA-550)", () => {

    it( "is the zone the setting names, written as the runtime writes it", () => {
        assert.equal( timeZone.getTimeZone(), "Europe/Sofia" );
        assert.equal( timeZone.isTimeZoneSet(), true );
        assert.equal( timeZone.verifyTimeZone(), "Europe/Sofia" );
    } );

    it( "reads today where the deployment is: 00:30 in Sofia is its new day, which the UTC date calls the day before", () => {
        assert.equal( timeZone.today( AFTER_MIDNIGHT ), "2026-10-22" );
        assert.equal( timeZone.today( new Date( AFTER_MIDNIGHT ) ), "2026-10-22", "a Date as well as milliseconds" );
        assert.equal( timeZone.today( BEFORE_MIDNIGHT ), "2026-10-21" );
        assert.equal( new Date( AFTER_MIDNIGHT ).toISOString().slice( 0, 10 ), "2026-10-21", "what a server read before" );
        assert.equal( timeZone.today( AFTER_MIDNIGHT, "UTC" ), "2026-10-21", "any zone, when asked" );
    } );

    it( "writes the date and the wall clock a zone shows at an instant", () => {
        assert.equal( timeZone.dateIn( AFTER_MIDNIGHT ), "2026-10-22" );
        assert.equal( timeZone.wallClockIn( AFTER_MIDNIGHT ), "2026-10-22T00:30" );
        assert.equal( timeZone.wallClockIn( AFTER_MIDNIGHT, "Asia/Kolkata" ), "2026-10-22T03:00" );
    } );

    it( "finds the instant a wall-clock date and time name, on ordinary days and both daylight-saving nights", () => {
        const at = ( date, time ) => new Date( timeZone.instantOf( date, time ) ).toISOString();
        assert.equal( at( "2026-10-22", "10:30" ), "2026-10-22T07:30:00.000Z", "summer, UTC+3" );
        assert.equal( at( "2026-12-01", "10:30" ), "2026-12-01T08:30:00.000Z", "winter, UTC+2" );
        // Spring, 29 March: at 03:00 EET the clock goes to 04:00 EEST (01:00Z).
        assert.equal( at( "2026-03-29", "02:59" ), "2026-03-29T00:59:00.000Z" );
        assert.equal( at( "2026-03-29", "03:30" ), "2026-03-29T01:30:00.000Z", "a skipped time is read in the offset before: the clock shows 04:30" );
        assert.equal( timeZone.wallClockIn( timeZone.instantOf( "2026-03-29", "03:30" ) ), "2026-03-29T04:30" );
        assert.equal( at( "2026-03-29", "06:00" ), "2026-03-29T03:00:00.000Z" );
        // Autumn, 25 October: at 04:00 EEST the clock goes back to 03:00 EET (01:00Z), and 03:00-03:59 is shown twice.
        assert.equal( at( "2026-10-25", "02:59" ), "2026-10-24T23:59:00.000Z" );
        assert.equal( at( "2026-10-25", "03:30" ), "2026-10-25T00:30:00.000Z", "a repeated time is its first occurrence" );
        assert.equal( at( "2026-10-25", "04:00" ), "2026-10-25T02:00:00.000Z" );
        assert.equal( at( "2026-10-25", "06:00" ), "2026-10-25T04:00:00.000Z" );
    } );

    it( "begins an hour where the zone's clock does: every real hour, and the half past in a half-hour zone", () => {
        const start = ( at, zone ) => new Date( timeZone.hourStartIn( Date.parse( at ), zone ) ).toISOString();
        assert.equal( start( "2026-10-22T09:47:12.345Z" ), "2026-10-22T09:00:00.000Z", "Sofia's hour is the UTC hour" );
        assert.equal( start( "2026-10-22T04:47:12Z", "Asia/Kolkata" ), "2026-10-22T04:30:00.000Z" );
        // 25 October: 03:00-03:59 is shown at 00:00Z (EEST) and again at 01:00Z (EET); each is an hour of its own.
        assert.equal( start( "2026-10-25T00:20:00Z" ), "2026-10-25T00:00:00.000Z" );
        assert.equal( start( "2026-10-25T01:20:00Z" ), "2026-10-25T01:00:00.000Z" );
    } );

    it( "names no instant for a date or a time that is not one", () => {
        [ [ "2026-04-31", "10:00" ], [ "2026-02-29", "10:00" ], [ "2026-10-22", "24:00" ], [ "2026-10-22", "9:00" ], [ "22.10.2026", "10:00" ], [ undefined, "10:00" ], [ "2026-10-22", null ] ]
            .forEach( ( [ date, time ] ) => assert.ok( Number.isNaN( timeZone.instantOf( date, time ) ), `${ date } ${ time }` ) );
    } );

    it( "resolves a blank name as UTC and refuses one the runtime does not know", () => {
        assert.equal( timeZone.resolveTimeZone( "" ), "UTC" );
        assert.equal( timeZone.resolveTimeZone( "  " ), "UTC" );
        assert.equal( timeZone.resolveTimeZone( undefined ), "UTC" );
        assert.equal( timeZone.resolveTimeZone( " america/new_york " ), "America/New_York" );
        // The runtime's own name, which ICU may keep as a legacy alias: Node 24.22 writes Asia/Kolkata as
        // Asia/Calcutta. Either names the same zone to every Intl, the browser's included.
        assert.ok( [ "Asia/Kolkata", "Asia/Calcutta" ].includes( timeZone.resolveTimeZone( "Asia/Kolkata" ) ) );
        // An offset is no place's zone, though Node accepts one (measured on 24.22): no daylight-saving rule, and a
        // browser without offset zones would read the device's clock while the server read the offset.
        [ "+02:00", "-0530" ].forEach( ( offset ) => assert.throws( () => timeZone.resolveTimeZone( offset ), ( error ) => error.data.reason === "invalid-time-zone", offset ) );
        assert.equal( timeZone.resolveTimeZone( "Etc/GMT-2" ), "Etc/GMT-2", "a fixed zone by its IANA name is one" );
        assert.throws( () => timeZone.resolveTimeZone( "Mars/Olympus_Mons" ), ( error ) => {
            assert.equal( error.code, exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE );
            assert.equal( error.data.reason, "invalid-time-zone" );
            assert.equal( error.data.value, "Mars/Olympus_Mons" );
            return true;
        } );
    } );

    it( "refuses to start an instance whose zone the runtime does not know, and says which zone a good one reads", async () => {
        const refused = await startWithTimeZone( "Mars/Olympus_Mons" );
        assert.equal( refused.code, 1 );
        assert.match( refused.output, /invalid-time-zone/ );
        assert.doesNotMatch( refused.output, /Starting new instance/, "refused before the service was built" );
        const started = await startWithTimeZone( "europe/sofia" );
        assert.match( started.output, /Calendar days are read in the time zone 'Europe\/Sofia'/ );
    } );

} );
