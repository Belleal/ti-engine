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
 * The deployment's time zone on the server (web-framework 1.59.0, CA-550): `/app/config` names it, a daily job's
 * time and an hourly job's hour are read in it, and notice intervals count from its midnight. Core reads the setting
 * once and freezes it, so this file sets it before anything loads.
 */

process.env.TI_LOCALIZATION_TIME_ZONE = "Europe/Sofia";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const TiWebAppManager = require( "#web-app-manager" );
const JobScheduler = require( "#job-scheduler" );
const NotificationService = require( "#notification-service" );

class WebApp extends TiWebAppManager {
    constructor() {
        super( "time-zone-test" );
    }
}

const iso = ( value ) => new Date( value ).toISOString();
const daily = ( at ) => ( { name: "daily", every: "day", at: JobScheduler.parseTimeOfDay( at ), run: () => {} } );
const hourly = { name: "hourly", every: "hour", at: null, run: () => {} };

describe( "the deployment's time zone on the server (CA-550)", () => {

    it( "is named in /app/config, where every screen reads it", async () => {
        const config = await new WebApp().processDataRequest( { language: "en" }, "config" );
        assert.equal( config.timeZone, "Europe/Sofia" );
    } );

    it( "runs a daily job at its time on the deployment's clock, before, on and after both daylight-saving changes", () => {
        const job = daily( "06:00" );
        const start = ( now ) => iso( JobScheduler.periodStart( job, new Date( now ) ) );
        // 06:00 in Sofia is 03:00 UTC in summer and 04:00 UTC in winter. It was 06:00 UTC, 09:00 in Sofia.
        assert.equal( start( "2026-10-22T03:30:00Z" ), "2026-10-22T03:00:00.000Z" );
        assert.equal( start( "2026-10-22T02:59:00Z" ), "2026-10-21T03:00:00.000Z", "before today's, yesterday's" );
        assert.equal( start( "2026-03-29T03:00:00Z" ), "2026-03-29T03:00:00.000Z", "the spring Sunday" );
        assert.equal( start( "2026-03-29T02:59:00Z" ), "2026-03-28T04:00:00.000Z", "its Saturday was still winter" );
        assert.equal( start( "2026-10-25T04:00:00Z" ), "2026-10-25T04:00:00.000Z", "the autumn Sunday" );
        assert.equal( start( "2026-10-25T03:59:00Z" ), "2026-10-24T03:00:00.000Z", "its Saturday was still summer" );
        assert.equal( iso( JobScheduler.periodStart( job, new Date( "2026-10-22T03:30:00Z" ), "UTC" ) ), "2026-10-21T06:00:00.000Z", "in UTC, as before, when asked" );
    } );

    it( "runs a job at a time the clock shows twice once, at its first showing", () => {
        const job = daily( "03:30" );
        // 25 October: 03:30 EEST is 00:30 UTC, and 03:30 EET, an hour later, is 01:30 UTC.
        const first = new Date( "2026-10-25T00:30:00Z" );
        const second = new Date( "2026-10-25T01:30:00Z" );
        assert.equal( iso( JobScheduler.periodStart( job, first ) ), "2026-10-25T00:30:00.000Z" );
        assert.equal( iso( JobScheduler.periodStart( job, second ) ), "2026-10-25T00:30:00.000Z", "the same period" );
        assert.equal( JobScheduler.isDue( job, first.getTime(), second ), false, "it ran at the first: not again at the second" );
    } );

    it( "runs a job at a time the clock skips when the clock jumps past it", () => {
        const job = daily( "03:30" );
        // 29 March: at 03:00 EET (01:00 UTC) the clock shows 04:00 EEST, so 03:30 is never shown.
        assert.equal( iso( JobScheduler.periodStart( job, new Date( "2026-03-29T01:30:00Z" ) ) ), "2026-03-29T01:30:00.000Z" );
        assert.equal( iso( JobScheduler.periodStart( job, new Date( "2026-03-29T01:29:00Z" ) ) ), "2026-03-28T01:30:00.000Z" );
    } );

    it( "begins an hourly job's period on the zone's hour, every real hour", () => {
        assert.equal( iso( JobScheduler.periodStart( hourly, new Date( "2026-10-22T09:47:12Z" ) ) ), "2026-10-22T09:00:00.000Z", "Sofia's hour is the UTC hour" );
        assert.equal( iso( JobScheduler.periodStart( hourly, new Date( "2026-10-22T04:47:12Z" ), "Asia/Kolkata" ) ), "2026-10-22T04:30:00.000Z", "Kolkata's is the half past" );
        // The repeated hour on 25 October is two real hours, and each is a period of its own.
        assert.equal( iso( JobScheduler.periodStart( hourly, new Date( "2026-10-25T00:20:00Z" ) ) ), "2026-10-25T00:00:00.000Z" );
        assert.equal( iso( JobScheduler.periodStart( hourly, new Date( "2026-10-25T01:20:00Z" ) ) ), "2026-10-25T01:00:00.000Z" );
    } );

    it( "counts notice intervals from the deployment's midnight", () => {
        // 01:00 on 22 October in Sofia (EEST) is 22:00 UTC on the 21st; Sofia's midnight is 21:00 UTC.
        const now = new Date( "2026-10-21T22:00:00Z" );
        assert.equal( iso( NotificationService.intervalStart( 24, now ) ), "2026-10-21T21:00:00.000Z", "a day's notices go at Sofia's midnight" );
        assert.equal( iso( NotificationService.intervalStart( 6, now ) ), "2026-10-21T21:00:00.000Z" );
        assert.equal( iso( NotificationService.intervalStart( 6, new Date( "2026-10-22T04:00:00Z" ) ) ), "2026-10-22T03:00:00.000Z", "06:00 to 12:00 in Sofia" );
        assert.equal( iso( NotificationService.intervalStart( 1, now ) ), "2026-10-21T22:00:00.000Z" );
        assert.equal( iso( NotificationService.intervalStart( 6, now, "UTC" ) ), "2026-10-21T18:00:00.000Z", "where they counted from before" );
    } );

} );
