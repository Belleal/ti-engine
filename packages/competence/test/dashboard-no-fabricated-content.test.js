/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The dashboard must not invent things that did not happen.
 *
 * `#loadDashboard` used to return a "Recent Activity" feed of four hardcoded entries, unconditionally, to every
 * user on every load — not behind `COMPETENCE_PRELOAD_DATA`, not sample data anyone had opted into. One of them
 * named the signed-in employee, resolved through the real org chart, and asserted they had submitted a
 * self-evaluation a day ago. Another said their manager had started the manager review two hours ago, with an "In
 * Review" status pill beside it. On a fresh install with no evaluations at all, every employee's first screen made
 * four false claims about their own appraisal, two of them about named people, in English regardless of locale
 * (`action`, `time` and `statusLabel` were bound raw, with no label lookup).
 *
 * In an HR appraisal tool that is not cosmetic: somebody can reasonably act on "my manager already started the
 * review". The panel is gone rather than rebuilt, because a real activity feed here has to decide whose events each
 * person is allowed to see — a design question, not a rendering one.
 *
 * This guards the property rather than the deletion: no dashboard payload may carry invented display strings.
 */

const path = require( "node:path" );

process.env.TI_LOCALIZATION_LABELS_PATH = path.relative(
    process.cwd(),
    path.join( __dirname, "..", "bin", "localization", "competence-labels.json" )
);

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );

const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const configurationLoader = require( "#configuration-loader" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );
const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const read = ( ...parts ) => fs.readFileSync( path.join( PACKAGE_ROOT, ...parts ), "utf8" );
const application = read( "bin", "competence-web-application.js" );
const fragment = read( "bin", "static", "fragments", "frame-dashboard.html" );

const employeeSession = () => ( { language: "en", user: { userID: "azure|abc", name: "Boris Kostadinov", employeeID: "4711", roles: [ configurationLoader.roleCode.EMPLOYEE ] } } );

function stubStores( t ) {
    t.mock.method( DataManagerPrototype, "fetchEvaluations", () => Promise.resolve( [] ) );
    t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( null ) );
    t.mock.method( DataManagerPrototype, "getAllCycles", () => Promise.resolve( [] ) );
    t.mock.method( OrganizationManagerPrototype, "resolveOrganizationUnitIDForEmployee", () => null );
    t.mock.method( OrganizationManagerPrototype, "resolveEmployeeName", () => "Boris Kostadinov" );
}

describe( "Dashboard payload carries nothing fabricated", () => {

    const app = new CompetenceWebApplication( "test-competence-dashboard-honesty" );

    it( "serves no activity feed to an employee with no evaluations", async ( t ) => {
        stubStores( t );
        const data = await app.processDataRequest( employeeSession(), "load-dashboard" );
        assert.equal( data.activity, undefined, "an install with no evaluations has no activity to report" );
    } );

    it( "reports every collection as genuinely empty rather than populated with samples", async ( t ) => {
        stubStores( t );
        const data = await app.processDataRequest( employeeSession(), "load-dashboard" );
        assert.deepEqual( data.tasks, [] );
        assert.deepEqual( data.teamEvaluations, [] );
        assert.deepEqual( data.stats, { total: 0, open: 0, inReview: 0, ready: 0 } );
        assert.equal( data.myEvaluation, null );
    } );

    it( "contains none of the invented sentences the feed used to ship", () => {
        // Named individually: each was a specific false claim shown to a real user, and a copy-paste revival of any
        // one of them should fail rather than merely look odd in review.
        for ( const invented of [
            "opened the evaluation cycle",
            "submitted a self-evaluation",
            "submitted peer feedback for you",
            "started the manager review",
            "A colleague",
            "Your manager",
            "2 days ago",
            "1 day ago",
            "6 hours ago",
            "2 hours ago"
        ] ) {
            assert.equal( application.includes( invented ), false, `"${ invented }" is back in the dashboard payload` );
        }
    } );

    it( "no longer renders the panel, nor the buttons that did nothing", () => {
        assert.equal( /interface\.dashboard\.activity-title/.test( fragment ), false );
        assert.equal( /interface\.dashboard\.no-activity/.test( fragment ), false );
        // Both "View all" buttons carried no @click and no handler existed for them.
        assert.equal( /interface\.dashboard\.view-all/.test( fragment ), false, "a button that does nothing is worse than no button" );
    } );

} );
