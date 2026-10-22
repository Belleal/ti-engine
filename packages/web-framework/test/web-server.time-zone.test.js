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
 * A server built by a host other than core's start-instance refuses a time zone the runtime does not know, as
 * start-instance does (CA-550, the review pass). Without it, every /app/config and every job tick failed instead.
 */

process.env.TI_LOCALIZATION_TIME_ZONE = "Mars/Olympus_Mons";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const TiWebServer = require( "#web-server" );
const Feedback = require( "#feedback" );
const NotificationService = require( "#notification-service" );

describe( "TiWebServer and the deployment's time zone (CA-550)", () => {

    it( "refuses to be built on a zone the runtime does not know", () => {
        assert.throws( () => new TiWebServer( "ti-time-zone", {} ), ( error ) => error.data && error.data.reason === "invalid-time-zone" );
    } );

    it( "still tells the administrators of an item sent in a host that skipped that check: their e-mail never fails it", async ( t ) => {
        NotificationService.instance.setTransport( { send: () => Promise.resolve( { messageId: "test" } ) } );
        t.after( () => NotificationService.instance.setTransport( null ) );
        const emitted = [];
        t.mock.method( NotificationService.prototype, "emit", ( name, occurrence ) => {
            emitted.push( occurrence );
            return Promise.resolve( 1 );
        } );
        const feedback = new Feedback().configure( { admins: [ "boss@example.com" ] } );
        const item = { feedbackID: "f-1", kind: "problem", text: "It broke.", anonymous: false, senderName: "Jane Doe", submittedAt: "2026-10-21T21:30:00.000Z" };
        await assert.doesNotReject( async () => feedback.received( item ) );
        assert.equal( emitted[ 0 ].data.date, "2026-10-21", "the UTC date, where the zone cannot be read" );
    } );

} );
