/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Two things an anonymous caller must not be able to learn, and one flag that must ship off.
 *
 * `/app/config` is an UNPROTECTED route — the login shell fetches it before anyone has signed in, for its labels and
 * the effective auth methods. This application added the live appraisal cycle and the whole scoring model to that
 * payload without re-gating them, so `curl -H 'Accept: application/json' /app/config` told anyone who could reach the
 * deployment which cycle was running, its dates, and how performance is scored.
 *
 * And `COMPETENCE_TEST_USER_ENABLED` turns the `ti-test-user` cookie into a client-chosen identity AND role override.
 * The README and INSTALL both state the default is `false`; the committed `.env` — the file `npm start` loads — set
 * it to `true`, so every clone inherited it on the documented non-container run path.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );
const PACKAGE_ROOT = path.resolve( __dirname, ".." );

// Keys this application adds on top of the framework's bootstrap payload. None has a consumer on the login page:
// the topbar and sidebar read `cycle` and `employeeLevel`, the results view reads the grades and thresholds.
const SIGNED_IN_ONLY_KEYS = [ "grades", "gradeWeights", "evaluationWeights", "performanceThresholds", "cycle", "employeeLevel", "sidebarNavMapping" ];

const ACTIVE_CYCLE = {
    cycleID: "2026-H2",
    name: "2026 H2",
    status: configurationLoader.cycleStatus.ACTIVE,
    cycleStart: "2026-07-01",
    cycleDate: "2026-12-15",
    cycleEnd: "2026-12-31"
};

function stubCycle( t ) {
    const reads = { count: 0 };
    t.mock.method( DataManagerPrototype, "getActiveCycle", () => {
        reads.count += 1;
        return Promise.resolve( JSON.parse( JSON.stringify( ACTIVE_CYCLE ) ) );
    } );
    t.mock.method( DataManagerPrototype, "getAllCycles", () => Promise.resolve( [ JSON.parse( JSON.stringify( ACTIVE_CYCLE ) ) ] ) );
    return reads;
}

describe( "CompetenceWebApplication — the unprotected /app/config payload", () => {

    const app = new CompetenceWebApplication( "test-competence-anonymous-config" );
    const config = ( session ) => app.processDataRequest( session, "config", { query: {} } );

    it( "tells an anonymous caller nothing about the cycle or the scoring model", async ( t ) => {
        const reads = stubCycle( t );

        const result = await config( null );

        SIGNED_IN_ONLY_KEYS.forEach( ( key ) => {
            assert.ok( !( key in result ), `'${ key }' must not reach a caller with no session` );
        } );
        assert.ok( !JSON.stringify( result ).includes( "2026 H2" ), "the cycle's name must not survive anywhere in the payload" );
        assert.equal( reads.count, 0, "an anonymous request must not even read the cycle store" );
    } );

    it( "still serves the bootstrap the login page needs", async ( t ) => {
        stubCycle( t );

        const result = await config( null );

        assert.ok( result.labels, "the login page renders from these" );
        assert.deepEqual( result.auth, { isAuthenticated: false } );
        assert.ok( result.componentsConfig, "the shell merges this before it knows who is signed in" );
    } );

    it( "treats a session without a user as anonymous", async ( t ) => {
        stubCycle( t );

        const result = await config( { csrfToken: "t", language: "en" } );

        assert.equal( "cycle" in result, false );
    } );

    it( "serves the full payload once there is a signed-in user", async ( t ) => {
        stubCycle( t );

        const result = await config( { language: "en", user: { userID: "u1", employeeID: "1", roles: [ configurationLoader.roleCode.EMPLOYEE ] } } );

        SIGNED_IN_ONLY_KEYS.forEach( ( key ) => {
            assert.ok( key in result, `'${ key }' is part of the signed-in chrome and must still be served` );
        } );
        assert.equal( result.cycle.id, "2026-H2" );
        assert.equal( result.auth.isAuthenticated, true );
    } );

} );

describe( "competence — the dev test-user flag ships off", () => {

    it( "is not enabled by the committed .env, which `npm start` loads", () => {
        const env = fs.readFileSync( path.join( PACKAGE_ROOT, ".env" ), "utf8" );
        const match = env.match( /^COMPETENCE_TEST_USER_ENABLED\s*=\s*(.*)$/m );

        assert.ok( match, "the flag should stay listed, so its value is a visible decision rather than an omission" );
        assert.match( match[ 1 ].trim(), /^(false|0|no|)$/i,
            "this file is git-tracked and loaded from the working directory by core's start-instance, so a truthy value here is the default every clone inherits" );
    } );

    it( "warns at startup whenever it is on", () => {
        const server = fs.readFileSync( path.join( PACKAGE_ROOT, "bin", "competence-web-server.js" ), "utf8" );

        assert.match( server, /onStart\(\)\s*\{[\s\S]{0,900}?COMPETENCE_TEST_USER_ENABLED/,
            "'off by default' is invisible; an operator who turns it on deserves to be told what it does" );
        assert.match( server, /logSeverity\.WARNING/ );
    } );

} );
