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
 * The toolbox on the deployment's clock (web-framework 1.59.0, CA-550): `tiToolbox` reads today, the hour and a
 * timestamp's day in the zone `/app/config` names, and keeps the device's clock when it names none. The device here
 * is in Los Angeles, nine or ten hours west of Sofia, so a reading taken on its clock cannot pass for Sofia's.
 */

process.env.TZ = "America/Los_Angeles";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

// 00:30 on 22 October 2026 in Sofia (EEST, UTC+3); 14:30 on the 21st in Los Angeles.
const AFTER_MIDNIGHT = Date.parse( "2026-10-21T21:30:00Z" );

/**
 * A page whose `/app/config` named a zone, or none.
 *
 * @param {string|null} [zone]
 * @param {string} [lang]
 * @returns {{toolbox: Object, components: Object, stores: Object}}
 * @private
 */
function pageIn( zone, lang = "en-GB" ) {
    const { stores, components, sandbox } = loadTiFramework();
    sandbox.document.documentElement.lang = lang;
    stores.tiApplication.configuration = ( zone === undefined ) ? {} : { timeZone: zone };
    return { toolbox: stores.tiToolbox, components: components, stores: stores };
}

describe( "tiToolbox on the deployment's clock (CA-550)", () => {

    it( "runs on a device in Los Angeles", () => {
        assert.equal( new Date( AFTER_MIDNIGHT ).getHours(), 14 );
    } );

    it( "names the zone /app/config sent, and none before it, without one, or for one Intl does not know", () => {
        assert.equal( pageIn( "Europe/Sofia" ).toolbox.getTimeZone(), "Europe/Sofia" );
        assert.equal( pageIn( null ).toolbox.getTimeZone(), undefined );
        assert.equal( pageIn( undefined ).toolbox.getTimeZone(), undefined );
        assert.equal( pageIn( "Mars/Olympus_Mons" ).toolbox.getTimeZone(), undefined );
    } );

    it( "reads today and the hour where the deployment is, and on the device's clock when it named no zone", () => {
        const sofia = pageIn( "Europe/Sofia" ).toolbox;
        assert.deepEqual( { ...sofia.clock( AFTER_MIDNIGHT ) }, { date: "2026-10-22", minutes: 30 } );
        assert.equal( sofia.today( AFTER_MIDNIGHT ), "2026-10-22" );
        assert.equal( sofia.today( new Date( AFTER_MIDNIGHT ) ), "2026-10-22", "a Date as well as milliseconds" );
        const device = pageIn( null ).toolbox;
        assert.deepEqual( { ...device.clock( AFTER_MIDNIGHT ) }, { date: "2026-10-21", minutes: 14 * 60 + 30 } );
        const unknown = pageIn( "Mars/Olympus_Mons" ).toolbox;
        assert.equal( unknown.today( AFTER_MIDNIGHT ), "2026-10-21", "a zone the browser lacks: the device's clock, never an error" );
    } );

    it( "gives a timestamp the deployment's day, and leaves everything that is not one as it was", () => {
        const sofia = pageIn( "Europe/Sofia" ).toolbox;
        assert.equal( sofia.dayOf( "2026-10-21T21:30:00.000Z" ), "2026-10-22" );
        assert.equal( sofia.dayOf( "2026-10-21T20:30:00+00:00" ), "2026-10-21", "with an offset as well as Z" );
        assert.equal( sofia.dayOf( "2026-10-21" ), "2026-10-21", "a calendar date is a day already" );
        assert.equal( sofia.dayOf( "2026-10-21T21:30:00" ), "2026-10-21T21:30:00", "no offset: the device's own wall clock" );
        const date = new Date( AFTER_MIDNIGHT );
        assert.equal( sofia.dayOf( date ), date );
        // Shaped like timestamps, read by no clock: each reaches the formatter's placeholder, as before.
        [ "2026-13-01T10:00:00Z", "2026-10-21T25:00:00Z" ].forEach( ( value ) => assert.equal( sofia.dayOf( value ), value ) );
        assert.equal( pageIn( null ).toolbox.dayOf( "2026-10-21T21:30:00.000Z" ), "2026-10-21T21:30:00.000Z", "no zone: as it was" );
    } );

    it( "formats a timestamp as the deployment's day, a calendar date as itself, and nothing unreadable at all", () => {
        const sofia = pageIn( "Europe/Sofia" ).toolbox;
        assert.equal( sofia.formatDate( "2026-10-21T21:30:00.000Z" ), "22 Oct 2026" );
        assert.equal( sofia.formatDate( "2026-10-21" ), "21 Oct 2026" );
        assert.equal( sofia.formatDate( "2026-13-01T10:00:00Z", "—" ), "—" );
        assert.equal( pageIn( null ).toolbox.formatDate( "2026-10-21T21:30:00.000Z" ), "21 Oct 2026", "the device's day, as before" );
    } );

    it( "dates the Feedback inbox's items on the deployment's day", () => {
        const { components } = pageIn( "Europe/Sofia" );
        const inbox = components.tiScreenFeedbackInbox();
        assert.equal( inbox.dateText( { submittedAt: "2026-10-21T21:30:00.000Z" } ), "22 Oct 2026" );
    } );

} );
