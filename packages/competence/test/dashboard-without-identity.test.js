/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The first screen an administrator sees on a blank install.
 *
 * An identity admitted through the allowlist with no employee record behind it carries `employeeID: null` and no
 * application roles — the break-glass identity that keeps the configuration screens reachable when nobody has been
 * imported yet (IdentityResolver#applyIdentity). The dashboard is the application's landing screen, loaded by
 * frame-application.html before that administrator has had any chance to navigate, and it used to answer them with
 * `E_SEC_UNAUTHORIZED_ACCESS` / 401: the very first thing a new deployment did was raise an unauthorized-access
 * toast at the person setting it up.
 *
 * Two halves to the fix, and both are guarded here. The screen answers such a session with an empty dashboard and
 * offers the setup steps in place of the widgets; the sidebar stops offering the Workspace section at all, since
 * every screen in it answers #requireSessionUser and would refuse the same way.
 *
 * What must NOT change: an unauthenticated caller is still refused, and a session with an employee behind it still
 * gets the real dashboard.
 */

const path = require( "node:path" );

process.env.TI_LOCALIZATION_LABELS_PATH = path.relative(
    process.cwd(),
    path.join( __dirname, "..", "bin", "localization", "competence-labels.json" )
);

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );

const exceptions = require( "@ti-engine/core/exceptions" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const configurationLoader = require( "#configuration-loader" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );
const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const LANGUAGES = [ "en", "bg" ];
const labels = require( "../bin/localization/competence-labels.json" );

const read = ( ...parts ) => fs.readFileSync( path.join( PACKAGE_ROOT, ...parts ), "utf8" );
const sidebar = read( "bin", "static", "fragments", "components", "component-sidebar.html" );
const fragment = read( "bin", "static", "fragments", "frame-dashboard.html" );
const script = read( "bin", "static", "scripts", "competence-user-interface.js" );

// Exactly the session `applyIdentity` leaves behind for an allowlisted administrator with no employee record: the
// framework's own user id is present (they ARE authenticated), employeeID is null, and "admin" is the only role.
const administratorSession = () => ( { language: "en", user: { userID: "azure|abc", name: "Boris Kostadinov", email: "b@example.com", employeeID: null, roles: [ "admin" ] } } );
const employeeSession = () => ( { language: "en", user: { userID: "azure|abc", name: "Boris Kostadinov", employeeID: "4711", roles: [ configurationLoader.roleCode.EMPLOYEE ] } } );

/**
 * Stubs the reads the loaded dashboard makes, so the employee case needs no Redis and no org chart.
 *
 * @param {Object} t The node:test context (its mocks are restored automatically).
 */
function stubStores( t ) {
    t.mock.method( DataManagerPrototype, "fetchEvaluations", () => Promise.resolve( [] ) );
    t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( null ) );
    t.mock.method( DataManagerPrototype, "getAllCycles", () => Promise.resolve( [] ) );
    t.mock.method( OrganizationManagerPrototype, "resolveOrganizationUnitIDForEmployee", () => null );
    t.mock.method( OrganizationManagerPrototype, "resolveEmployeeName", () => "Boris Kostadinov" );
}

describe( "Dashboard for a session with no appraisal identity", () => {

    const app = new CompetenceWebApplication( "test-competence-dashboard-identity" );

    it( "answers an administrator with no employee record instead of refusing them", async ( t ) => {
        stubStores( t );
        const data = await app.processDataRequest( administratorSession(), "load-dashboard" );
        assert.equal( data.hasAppraisalIdentity, false );
    } );

    it( "reads nothing at all for that session — there is no employee to read for", async ( t ) => {
        stubStores( t );
        await app.processDataRequest( administratorSession(), "load-dashboard" );
        assert.equal( DataManagerPrototype.fetchEvaluations.mock.callCount(), 0 );
        assert.equal( DataManagerPrototype.getActiveCycle.mock.callCount(), 0 );
    } );

    it( "keeps the shape of a loaded dashboard, every collection empty", async ( t ) => {
        // The screen branches on one flag and otherwise renders the same bindings, so a payload missing a key would
        // surface as an Alpine error rather than an empty widget.
        stubStores( t );
        const data = await app.processDataRequest( administratorSession(), "load-dashboard" );
        assert.deepEqual( data.teamEvaluations, [] );
        assert.deepEqual( data.tasks, [] );
        assert.deepEqual( data.activity, [] );
        assert.deepEqual( data.stats, { total: 0, open: 0, inReview: 0, ready: 0 } );
        assert.equal( data.cycle, null );
        assert.equal( data.myEvaluation, null );
        assert.equal( data.isManager, false );
        assert.equal( data.employeeMetrics.selfGrades.total, 0 );
    } );

    it( "still refuses a caller with no session user", async () => {
        await assert.rejects(
            () => app.processDataRequest( { language: "en" }, "load-dashboard" ),
            ( error ) => {
                assert.equal( error.httpCode, exceptions.httpCode.C_401 );
                return true;
            }
        );
    } );

    it( "still refuses an unauthenticated caller carrying neither id", async () => {
        // Belt to the route's own authentication middleware: `userID` is the framework's authenticated marker, so a
        // user object without one must not be mistaken for the administrator case.
        await assert.rejects(
            () => app.processDataRequest( { language: "en", user: { roles: [] } }, "load-dashboard" ),
            ( error ) => {
                assert.equal( error.httpCode, exceptions.httpCode.C_401 );
                return true;
            }
        );
    } );

    it( "serves the real dashboard, flagged, to a session with an employee behind it", async ( t ) => {
        stubStores( t );
        const data = await app.processDataRequest( employeeSession(), "load-dashboard" );
        assert.equal( data.hasAppraisalIdentity, true );
        assert.equal( data.userID, "4711" );
        assert.ok( DataManagerPrototype.fetchEvaluations.mock.callCount() > 0, "the loaded path still reads" );
    } );

} );

describe( "Profile for a session with no appraisal identity", () => {

    // The other screen the chrome offers such a session. The user menu carries a Profile entry for everyone, and
    // `getProfileInfo` documents an account-level fallback for a session with no employee record — but only reached
    // it from the not-found catch on `fetchEmployee`, which `#requireSessionUser` refused to let it get to. Found by
    // CodeRabbit on #141, as an out-of-diff comment: the same bug as the dashboard's, in the screen next door.

    const app = new CompetenceWebApplication( "test-competence-profile-identity" );

    it( "serves the framework's account-level profile instead of refusing", async ( t ) => {
        t.mock.method( DataManagerPrototype, "fetchEmployee", () => Promise.reject( new Error( "must not be reached" ) ) );
        const profile = await app.getProfileInfo( administratorSession() );
        assert.ok( profile.identity, "an account still has an identity worth showing" );
        assert.ok( Array.isArray( profile.sections ) );
        assert.equal( DataManagerPrototype.fetchEmployee.mock.callCount(), 0, "there is no employee to fetch" );
    } );

    it( "is dispatched the same way through processDataRequest", async ( t ) => {
        t.mock.method( DataManagerPrototype, "fetchEmployee", () => Promise.reject( new Error( "must not be reached" ) ) );
        const profile = await app.processDataRequest( administratorSession(), "profile" );
        assert.ok( profile.identity );
    } );

    it( "still refuses a caller with no session user at all", async () => {
        await assert.rejects(
            () => app.getProfileInfo( { language: "en" } ),
            ( error ) => {
                assert.equal( error.httpCode, exceptions.httpCode.C_401 );
                return true;
            }
        );
    } );

    it( "still reads the employee record for a session that has one", async ( t ) => {
        t.mock.method( DataManagerPrototype, "fetchEmployee", () => Promise.reject(
            exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "gone" } )
        ) );
        // The pre-existing fallback — a session WITH an employeeID whose record has since disappeared — must still
        // work, and must still go through the fetch rather than short-circuiting on the new branch.
        const profile = await app.getProfileInfo( employeeSession() );
        assert.ok( profile.identity );
        assert.equal( DataManagerPrototype.fetchEmployee.mock.callCount(), 1 );
    } );

} );

describe( "Dashboard setup notice — screen wiring", () => {

    it( "branches the widgets and the notice on the identity, not just on loading", () => {
        assert.match( fragment, /x-if="showSetupNotice\(\)"/ );
        assert.match( fragment, /x-if="showWidgets\(\)"/ );
        assert.equal( /x-if="!isLoading"/.test( fragment ), false,
            "the widgets must not render for a session with no employee behind them" );
    } );

    it( "offers the two screens that resolve the state", () => {
        assert.match( fragment, /openScreen\('organization-structure'\)/ );
        assert.match( fragment, /openScreen\('employee-import'\)/ );
    } );

    it( "defaults the flag to true, so an older payload still renders the dashboard", () => {
        assert.match( script, /hasAppraisalIdentity: true/ );
        assert.match( script, /this\.hasAppraisalIdentity = \( data\.hasAppraisalIdentity !== false \)/ );
    } );

    it( "stays CSP-clean", () => {
        assert.equal( / style="/.test( fragment ), false, "inline styles are forbidden under Alpine CSP mode" );
        assert.equal( /\?\./.test( fragment ), false, "optional chaining is rejected by the CSP expression evaluator" );
    } );

    it( "carries en and bg for every label key the fragment references", () => {
        const keys = [ ...fragment.matchAll( /x-text-label="([^"]+)"/g ) ].map( ( m ) => m[ 1 ] );
        assert.ok( keys.length > 0, "the fragment references no labels at all — did the selector change?" );
        for ( const key of keys ) {
            const leaf = key.split( "." ).reduce( ( node, part ) => ( node || {} )[ part ], labels );
            assert.ok( leaf, `${ key } is missing from competence-labels.json` );
            for ( const language of LANGUAGES ) {
                assert.equal( typeof leaf[ language ], "string", `${ key } has no ${ language } text` );
                assert.ok( leaf[ language ].trim().length > 0, `${ key } is blank in ${ language }` );
            }
        }
    } );

} );

describe( "Sidebar — the Workspace section", () => {

    it( "is gated on the session having an employee record", () => {
        assert.match( sidebar, /<div x-show="\$store\.tiApplication\.user && \$store\.tiApplication\.user\.employeeID">\s*\n\s*<div class="ti-sidebar-section-label" x-text-label="interface\.navigation\.workspace">/ );
    } );

    it( "keeps every Workspace item inside that gate", () => {
        // The gate is worth nothing if a later edit adds an item after the section's closing tag. Each of these
        // answers #requireSessionUser server-side, so all four must sit inside the same wrapper.
        const start = sidebar.indexOf( 'x-text-label="interface.navigation.workspace"' );
        const end = sidebar.indexOf( 'x-text-label="interface.navigation.manage"' );
        assert.ok( start > 0 && end > start );
        const section = sidebar.slice( start, end );
        for ( const item of [ "/app/dashboard", "/app/employees-list" ] ) {
            assert.ok( section.includes( `hx-get="${ item }"` ), `${ item } left the Workspace section` );
        }
        for ( const item of [ "'evaluation', 'competence-evaluation'", "'my-results', 'my-results'" ] ) {
            assert.ok( section.includes( item ), `${ item } left the Workspace section` );
        }
    } );

    it( "still gates Manage, Insights and Administration the way it did", () => {
        assert.match( sidebar, /<div x-show="\$store\.tiApplication\.hasRole\(2\) \|\| \$store\.tiApplication\.hasRole\(3\)">/ );
        assert.match( sidebar, /<div x-show="\$store\.tiApplication\.hasRole\('admin'\)">/ );
    } );

} );
