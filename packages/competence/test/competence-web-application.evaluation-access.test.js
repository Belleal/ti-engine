/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Access control and payload minimisation for the grading and Scores screens (`#loadEvaluation` / `#loadResults`).
 * Driven through the public dispatcher `processDataRequest`, with persistence and the org graph stubbed on their
 * prototypes — the same approach as `competence-web-application.consent-register-evidence.test.js`.
 *
 * Two regressions are pinned here.
 *
 * 1. THE ACCESS DECISION MUST PRECEDE EVERY STATUS AND EXISTENCE BRANCH. The authorization check used to run after
 *    the evaluation had been selected, so an unauthorized caller could tell the cases apart by the response alone:
 *    an absent evaluation resolved `{noEvaluation:true}` with a 200, a CLOSED one raised 422, an active one raised
 *    403 and an unknown employee raised 404. Walking employee IDs therefore read out the whole organization's
 *    appraisal state to any signed-in employee — exactly what `#loadEmployeeList` withholds from a non-manager via
 *    `evaluationHidden`. Every one of those cases must now answer the same 403, while a caller who IS entitled to the
 *    record still gets the specific answer.
 *
 * 2. THE `personal` BLOCK MUST BE AN EXPLICIT PROJECTION. It used to spread the stored employee record, so every
 *    field HR happens to hold — birth date and gender among them — travelled to the grading screen, whose peer-review
 *    round is open to ordinary colleagues with no management relationship to the evaluatee. The screen renders none
 *    of them.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const configurationLoader = require( "#configuration-loader" );
const exceptions = require( "@ti-engine/core/exceptions" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );
const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );

const CYCLE_ID = "2026-H2";
const EVALUATEE_ID = "evaluatee-1";          // has an OPEN evaluation, reviewed by PEER_ID
const CLOSED_EMPLOYEE_ID = "employee-closed"; // has a CLOSED evaluation
const UNAPPRAISED_ID = "employee-unappraised"; // exists, never appraised
const UNKNOWN_ID = "employee-does-not-exist";
const PEER_ID = "peer-1";                     // assigned reviewer on the evaluatee's evaluation
const OUTSIDER_ID = "outsider-1";             // no relationship to anyone
const MANAGER_ID = "manager-1";               // org-chart superior of every employee here
const SUPERVISOR_ID = "supervisor-1";

// The optional personal fields a real deployment carries and the grading screen never renders. Employee Management
// writes all of these, so they are exactly what a spread would pick up.
const WITHHELD_PERSONAL = Object.freeze( {
    birthDate: "1988-04-17",
    gender: "F",
    workSite: "SOF-HQ",
    workMode: "Full-time",
    workLocation: "On-site"
} );

function session( employeeID, roles ) {
    return { language: "en", user: { userID: `login:${ employeeID }`, employeeID: employeeID, roles: roles } };
}

const employeeSession = ( id ) => session( id, [ configurationLoader.roleCode.EMPLOYEE ] );
const managerSession = () => session( MANAGER_ID, [ configurationLoader.roleCode.EMPLOYEE, configurationLoader.roleCode.MANAGER ] );
const supervisorSession = () => session( SUPERVISOR_ID, [ configurationLoader.roleCode.EMPLOYEE, configurationLoader.roleCode.SUPERVISOR ] );

function employeeRecord( employeeID ) {
    return {
        employeeID: employeeID,
        email: `${ employeeID }@example.com`,
        employmentStatus: "active",
        personal: Object.assign( { firstName: "Ada", lastName: "Lovelace" }, WITHHELD_PERSONAL ),
        career: { organizationUnitID: "1-1-1", roleFamily: "SE", specialization: "BACKEND", level: "R", stage: 2, startingDate: "2022-03-14" }
    };
}

const EMPLOYEES = Object.freeze( {
    [ EVALUATEE_ID ]: employeeRecord( EVALUATEE_ID ),
    [ CLOSED_EMPLOYEE_ID ]: employeeRecord( CLOSED_EMPLOYEE_ID ),
    [ UNAPPRAISED_ID ]: employeeRecord( UNAPPRAISED_ID ),
    [ PEER_ID ]: employeeRecord( PEER_ID ),
    [ OUTSIDER_ID ]: employeeRecord( OUTSIDER_ID ),
    [ MANAGER_ID ]: employeeRecord( MANAGER_ID ),
    [ SUPERVISOR_ID ]: employeeRecord( SUPERVISOR_ID )
} );

function evaluation( evaluationID, employeeID, status, team ) {
    return {
        evaluationID: evaluationID,
        shortID: evaluationID,
        employeeID: employeeID,
        cycleID: CYCLE_ID,
        cycleDate: "2026-12-15",
        roleFamily: "SE",
        specialization: "BACKEND",
        stageLevel: "R2",
        status: status,
        comment: "self reflection",
        snapshot: [ { competencyCode: "E1-01", category: "E", subcategory: "E1", relevancy: 1 } ],
        grades: { "E1-01": { employee: "S", manager: "U", team: { cumulative: "R", individual: [ "S", "U", "R" ] } } },
        scores: {},
        finalScore: {},
        feedback: { managerComment: "manager note", teamComments: [ "peer note" ] },
        interviewDate: null,
        workflow: {
            team: Array.isArray( team ) ? team.slice() : [],
            selfEvaluationCompleted: false,
            teamEvaluationCompleted: false,
            managerEvaluationCompleted: false,
            selfEvaluationDeadline: "2026-12-01",
            teamEvaluationDeadline: "2026-12-01",
            managerEvaluationDeadline: "2026-12-15",
            teamEvaluationsSubmitted: 0
        }
    };
}

const EVALUATIONS = Object.freeze( {
    [ EVALUATEE_ID ]: [ evaluation( "EV-OPEN", EVALUATEE_ID, configurationLoader.evaluationStatus.OPEN, [ PEER_ID ] ) ],
    [ CLOSED_EMPLOYEE_ID ]: [ evaluation( "EV-CLOSED", CLOSED_EMPLOYEE_ID, configurationLoader.evaluationStatus.CLOSED, [] ) ],
    [ UNAPPRAISED_ID ]: []
} );

/**
 * Installs the persistence + org-graph stubs. `MANAGER_ID` is a superior of everyone; nobody else is a superior of
 * anyone, so `PEER_ID` and `OUTSIDER_ID` hold no standing authority.
 */
function stubStores( t ) {
    t.mock.method( DataManagerPrototype, "fetchEmployee", ( employeeID ) => {
        const record = EMPLOYEES[ employeeID ];
        return record
            ? Promise.resolve( JSON.parse( JSON.stringify( record ) ) )
            : Promise.reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { employeeID }, exceptions.httpCode.C_404 ) );
    } );
    t.mock.method( DataManagerPrototype, "fetchEvaluations", ( employeeID ) => {
        return Promise.resolve( JSON.parse( JSON.stringify( EVALUATIONS[ employeeID ] || [] ) ) );
    } );
    t.mock.method( OrganizationManagerPrototype, "isSuperiorManagerOfEmployee", ( potentialSuperiorID, employeeID ) => {
        return potentialSuperiorID === MANAGER_ID && employeeID !== MANAGER_ID;
    } );
    t.mock.method( OrganizationManagerPrototype, "resolveEmployeeOrganizationContext", () => ( {
        organizationUnitName: "Platform Engineering",
        managerID: MANAGER_ID,
        managerName: "Grace Hopper"
    } ) );
}

/**
 * Resolves to a compact, comparable description of the outcome, so two callers' responses can be asserted identical
 * without caring which of them is a rejection.
 */
function outcomeOf( promise ) {
    return promise.then(
        ( result ) => ( result && result.noEvaluation === true ) ? "200:no-evaluation" : "200:data",
        ( error ) => `${ error.httpCode }:${ error.code }:${ ( error.data && error.data.details ) || "" }`
    );
}

describe( "CompetenceWebApplication — evaluation access control", () => {

    const app = new CompetenceWebApplication( "test-competence-evaluation-access" );
    const load = ( callerSession, query ) => app.processDataRequest( callerSession, "load-evaluation", { query: query || {} } );

    describe( "an unauthorized caller learns nothing about the target", () => {

        it( "answers the same 403 for an active, a closed, an unappraised and an unknown employee", async ( t ) => {
            stubStores( t );
            const outsider = employeeSession( OUTSIDER_ID );

            const outcomes = await Promise.all( [
                outcomeOf( load( outsider, { employeeID: EVALUATEE_ID } ) ),
                outcomeOf( load( outsider, { employeeID: CLOSED_EMPLOYEE_ID } ) ),
                outcomeOf( load( outsider, { employeeID: UNAPPRAISED_ID } ) ),
                outcomeOf( load( outsider, { employeeID: UNKNOWN_ID } ) )
            ] );

            const expected = `${ exceptions.httpCode.C_403 }:${ exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS }:`;
            assert.deepEqual( outcomes, [ expected, expected, expected, expected ],
                "every refusal must be indistinguishable — otherwise the endpoint reports appraisal state to anyone who asks" );
        } );

        it( "refuses a peer reviewer an evaluation they are not assigned to, without confirming it exists", async ( t ) => {
            stubStores( t );

            // PEER_ID reviews the evaluatee, so they may read EV-OPEN — but naming another employee, or an evaluation
            // ID they are not on, must land on the same refusal as any outsider.
            assert.equal( await outcomeOf( load( employeeSession( PEER_ID ), { employeeID: CLOSED_EMPLOYEE_ID } ) ),
                `${ exceptions.httpCode.C_403 }:${ exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS }:` );
            assert.equal( await outcomeOf( load( employeeSession( PEER_ID ), { employeeID: EVALUATEE_ID, evaluationID: "EV-DOES-NOT-EXIST" } ) ),
                `${ exceptions.httpCode.C_403 }:${ exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS }:` );
        } );

    } );

    describe( "an entitled caller still gets the specific answer", () => {

        it( "gives the evaluatee their own record, and a supervisor anyone's", async ( t ) => {
            stubStores( t );

            const own = await load( employeeSession( EVALUATEE_ID ), {} );
            assert.equal( own.employeeID, EVALUATEE_ID );
            assert.equal( own.userRole, configurationLoader.roleCode.EMPLOYEE );

            const asSupervisor = await load( supervisorSession(), { employeeID: EVALUATEE_ID } );
            assert.equal( asSupervisor.employeeID, EVALUATEE_ID );
        } );

        it( "gives an assigned peer reviewer the record, on the strength of workflow.team alone", async ( t ) => {
            stubStores( t );

            const result = await load( employeeSession( PEER_ID ), { employeeID: EVALUATEE_ID } );

            assert.equal( result.userRole, configurationLoader.roleCode.TEAM_MEMBER );
            assert.equal( result.evaluation.evaluationID, "EV-OPEN" );
        } );

        it( "still reports no-evaluation, closed and not-found to callers entitled to know", async ( t ) => {
            stubStores( t );

            assert.equal( await outcomeOf( load( employeeSession( UNAPPRAISED_ID ), {} ) ), "200:no-evaluation",
                "an employee is always entitled to know they have no evaluation" );
            assert.equal( await outcomeOf( load( managerSession(), { employeeID: UNAPPRAISED_ID } ) ), "200:no-evaluation" );

            const closedOutcome = await outcomeOf( load( supervisorSession(), { employeeID: CLOSED_EMPLOYEE_ID } ) );
            assert.match( closedOutcome, /error\.evaluation\.status-is-closed$/ );

            const unknownOutcome = await outcomeOf( load( supervisorSession(), { employeeID: UNKNOWN_ID } ) );
            assert.match( unknownOutcome, new RegExp( `^${ exceptions.httpCode.C_404 }:` ) );
        } );

    } );

} );

describe( "CompetenceWebApplication — evaluation payload minimisation", () => {

    const app = new CompetenceWebApplication( "test-competence-evaluation-projection" );
    const withheldFields = Object.keys( WITHHELD_PERSONAL );

    it( "withholds the stored personal record from a peer reviewer, and still carries what the screen renders", async ( t ) => {
        stubStores( t );

        const result = await app.processDataRequest( employeeSession( PEER_ID ), "load-evaluation", { query: { employeeID: EVALUATEE_ID } } );

        withheldFields.forEach( ( field ) => {
            assert.ok( !( field in result.personal ), `'${ field }' must not reach a peer reviewer` );
        } );
        assert.ok( !JSON.stringify( result ).includes( WITHHELD_PERSONAL.birthDate ),
            "the withheld values must not survive anywhere else in the payload either" );

        // The fields frame-competence-evaluation.html actually binds.
        assert.equal( result.personal.name, "Ada Lovelace" );
        assert.equal( result.personal.organizationUnitName, "Platform Engineering" );
        assert.equal( result.personal.stageLevel, "R2" );
        assert.equal( result.personal.startingDate, "2022-03-14" );
        assert.ok( "roleFamilyName" in result.personal );
        assert.ok( "specializationName" in result.personal );
    } );

    it( "withholds the same fields from a manager, who reads the record through Employee Management instead", async ( t ) => {
        stubStores( t );

        const result = await app.processDataRequest( managerSession(), "load-evaluation", { query: { employeeID: EVALUATEE_ID } } );

        withheldFields.forEach( ( field ) => {
            assert.ok( !( field in result.personal ), `'${ field }' has no consumer on the grading screen` );
        } );
    } );

    it( "withholds them from the Scores screen too, which reuses the same fragment", async ( t ) => {
        stubStores( t );
        t.mock.method( DataManagerPrototype, "fetchEvaluations", () => Promise.resolve( [
            evaluation( "EV-READY", EVALUATEE_ID, configurationLoader.evaluationStatus.READY, [] )
        ] ) );

        const result = await app.processDataRequest( employeeSession( EVALUATEE_ID ), "load-my-results", { query: {} } );

        assert.equal( result.isOwnResults, true );
        withheldFields.forEach( ( field ) => {
            assert.ok( !( field in result.personal ), `'${ field }' is not rendered by the Scores screen` );
        } );
        assert.equal( result.personal.name, "Ada Lovelace" );
    } );

} );
