/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
*/

/*
 * Write scope for `update-employee`.
 *
 * `#assertEditableField` used to return immediately for a Supervisor, so every dotted path in the request body was
 * written straight onto the record — `employeeID` included. `DataManager.saveEmployee` keys the store by
 * `employee.employeeID`, so editing one employee while setting that field wrote their data over whoever owned the
 * new ID: the second record destroyed, the first left behind as a stale duplicate, and both audit entries filed
 * against the victim's ID, so nothing recorded what had been lost. Evaluations, research-consent chains and
 * supervisor grants are all keyed by employeeID too, so they silently re-attached to the wrong person.
 *
 * CA-91 closed the prototype-pollution half of this (`assertSafeFieldPath`, pinned by
 * `employee-field-path-safety.test.js`, whose own header notes the Supervisor no-op); this is the allowlist half.
 * Two barriers are pinned here: the allowlist, and the identity assertion behind it.
 *
 * The last test is the one that keeps the allowlist honest — it drives the REAL Employee Management component's
 * `computeDiff()` and asserts the server accepts every path the form actually submits, so adding a field to the form
 * without adding it to the allowlist fails here rather than in front of a user.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const configurationLoader = require( "#configuration-loader" );
const exceptions = require( "@ti-engine/core/exceptions" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );
const { loadComponent } = require( "./helpers/load-ui-component.js" );

const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );
const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );

const SUBJECT_ID = "employee-subject";
const VICTIM_ID = "employee-victim";
const SUPERVISOR_ID = "supervisor-1";
const MANAGER_ID = "manager-1";

function employeeRecord( employeeID, firstName ) {
    return {
        employeeID: employeeID,
        email: `${ employeeID }@example.com`,
        employmentStatus: "active",
        personal: { firstName: firstName, lastName: "Doe", workMode: "Full-time", workLocation: "On-site", workSite: "HQ", gender: "F" },
        career: { organizationUnitID: "1-1-1", roleFamily: "SE", specialization: "BACKEND", level: "R", stage: 2, startingDate: "2022-03-14", positionName: "Engineer" }
    };
}

const RECORDS = () => ( {
    [ SUBJECT_ID ]: employeeRecord( SUBJECT_ID, "Ada" ),
    [ VICTIM_ID ]: employeeRecord( VICTIM_ID, "Grace" )
} );

const session = ( employeeID, roles ) => ( { language: "en", user: { userID: `login:${ employeeID }`, employeeID: employeeID, roles: roles } } );
const supervisorSession = () => session( SUPERVISOR_ID, [ configurationLoader.roleCode.EMPLOYEE, configurationLoader.roleCode.SUPERVISOR ] );
const managerSession = () => session( MANAGER_ID, [ configurationLoader.roleCode.EMPLOYEE, configurationLoader.roleCode.MANAGER ] );

/**
 * Stubs persistence and the org graph, and returns the list of writes `saveEmployee` received so a test can assert
 * which record key was actually touched.
 */
function stubStores( t ) {
    const records = RECORDS();
    const writes = [];
    const rebuilds = { count: 0 };

    t.mock.method( DataManagerPrototype, "fetchEmployee", ( employeeID ) => {
        const record = records[ employeeID ];
        return record
            ? Promise.resolve( JSON.parse( JSON.stringify( record ) ) )
            : Promise.reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { employeeID }, exceptions.httpCode.C_404 ) );
    } );
    t.mock.method( DataManagerPrototype, "fetchEmployees", () => Promise.resolve( Object.values( records ).map( ( r ) => JSON.parse( JSON.stringify( r ) ) ) ) );
    t.mock.method( DataManagerPrototype, "saveEmployee", ( employee ) => {
        writes.push( { key: employee.employeeID, firstName: employee.personal && employee.personal.firstName } );
        records[ employee.employeeID ] = JSON.parse( JSON.stringify( employee ) );
        return Promise.resolve( JSON.parse( JSON.stringify( employee ) ) );
    } );
    t.mock.method( DataManagerPrototype, "appendAuditEntry", () => Promise.resolve() );
    t.mock.method( OrganizationManagerPrototype, "buildOrganizationChart", () => { rebuilds.count += 1; return Promise.resolve(); } );
    t.mock.method( OrganizationManagerPrototype, "isSuperiorManagerOfEmployee", ( potentialSuperiorID ) => potentialSuperiorID === MANAGER_ID );
    t.mock.method( OrganizationManagerPrototype, "resolveEmployeeOrganizationContext", () => ( { organizationUnitName: "Platform Engineering", managerID: MANAGER_ID, managerName: "Grace Hopper" } ) );

    return { records, writes, rebuilds };
}

describe( "CompetenceWebApplication — update-employee write scope", () => {

    const app = new CompetenceWebApplication( "test-competence-employee-update-scope" );
    const update = ( callerSession, fields, employeeID ) =>
        app.processServiceRequest( callerSession, "update-employee", { employeeID: employeeID || SUBJECT_ID, fields: fields } );

    it( "refuses to write employeeID, and leaves the record that ID belongs to untouched", async ( t ) => {
        const { records, writes } = stubStores( t );

        await assert.rejects(
            update( supervisorSession(), { employeeID: VICTIM_ID, email: "moved@example.com" } ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS );
                assert.equal( error.httpCode, exceptions.httpCode.C_422 );
                return true;
            }
        );

        assert.equal( writes.length, 0, "a refused field must not reach persistence" );
        assert.equal( records[ VICTIM_ID ].personal.firstName, "Grace", "the other employee's record must be untouched" );
        assert.equal( records[ SUBJECT_ID ].employeeID, SUBJECT_ID );
    } );

    it( "refuses a field that is not part of the employee record at all", async ( t ) => {
        const { writes } = stubStores( t );

        await assert.rejects( update( supervisorSession(), { "personal.injectedField": "HELLO" } ), ( error ) => {
            assert.equal( error.httpCode, exceptions.httpCode.C_422 );
            assert.match( error.data.details, /not an editable employee field/ );
            return true;
        } );
        await assert.rejects( update( supervisorSession(), { "career": { roleFamily: "PM" } } ), ( error ) => {
            assert.equal( error.httpCode, exceptions.httpCode.C_422 );
            return true;
        } );

        assert.equal( writes.length, 0 );
    } );

    it( "still refuses the CA-91 prototype-pollution paths, and leaves Object.prototype clean", async ( t ) => {
        stubStores( t );

        await assert.rejects( update( supervisorSession(), { "__proto__.polluted": "yes" } ) );
        await assert.rejects( update( supervisorSession(), { "constructor.prototype.polluted": "yes" } ) );

        assert.equal( {}.polluted, undefined );
    } );

    it( "rejects the whole batch when one field in it is out of scope", async ( t ) => {
        const { writes } = stubStores( t );

        // Before the allowlist this batch was still refused — but by the e-mail uniqueness check, which noticed the
        // subject's address now sitting under a different ID. That was luck, not a guard: it lapses the moment the
        // batch also changes the e-mail, or the record has none. Assert the reason, not just the refusal.
        await assert.rejects( update( supervisorSession(), {
            "personal.firstName": "Adalovelace",
            "employeeID": VICTIM_ID
        } ), ( error ) => {
            assert.equal( error.code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS );
            assert.match( error.data.details, /not an editable employee field/ );
            return true;
        } );

        // The variant the collision check could never catch.
        await assert.rejects( update( supervisorSession(), {
            "employeeID": VICTIM_ID,
            "email": "brand-new@example.com"
        } ), ( error ) => {
            assert.equal( error.code, exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS );
            return true;
        } );

        assert.equal( writes.length, 0, "a batch is applied only once every field in it has been admitted" );
    } );

    it( "lets a Supervisor write the fields the detail form owns", async ( t ) => {
        const { records, writes } = stubStores( t );

        const result = await update( supervisorSession(), {
            "personal.firstName": "Adelaide",
            "personal.workSite": "OF1",
            "career.level": "S",
            "career.stage": 1
        } );

        assert.equal( writes.length, 1 );
        assert.equal( writes[ 0 ].key, SUBJECT_ID, "the record must be written back under its own ID" );
        assert.equal( result.employeeID, SUBJECT_ID );
        assert.equal( records[ SUBJECT_ID ].personal.firstName, "Adelaide" );
        assert.equal( records[ SUBJECT_ID ].career.level, "S" );
    } );

    it( "keeps a manager to career.specialization on a direct report", async ( t ) => {
        const { writes } = stubStores( t );

        await update( managerSession(), { "career.specialization": "FRONTEND" } );
        assert.equal( writes.length, 1 );

        await assert.rejects( update( managerSession(), { "career.level": "S" } ), ( error ) => {
            assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
            assert.equal( error.httpCode, exceptions.httpCode.C_403 );
            assert.match( error.data.details, /not editable by the current role/ );
            return true;
        } );

        await assert.rejects( update( managerSession(), { "employeeID": VICTIM_ID } ), ( error ) => {
            assert.equal( error.httpCode, exceptions.httpCode.C_422, "not a field for anyone, so it fails ahead of the role check" );
            return true;
        } );

        assert.equal( writes.length, 1 );
    } );

    it( "accepts every field the Employee Management form actually submits", async ( t ) => {
        const { writes } = stubStores( t );

        // The real screen component, driven through the same computeDiff() the Save button calls. If a field is added
        // to the form without being added to EDITABLE_EMPLOYEE_FIELDS, this is where it surfaces.
        // Every value differs from the stored record, so computeDiff() emits the form's complete path list rather
        // than a subset — the point is to cover the whole set the Save button can ever send.
        const { component } = loadComponent( "competenceEmployeeManagement" );
        component.detail = { employee: employeeRecord( SUBJECT_ID, "Ada" ) };
        component.draft = {
            email: "renamed@example.com",
            employmentStatus: "on-leave",
            personal: { firstName: "Adelaide", lastName: "Byron", workMode: "Part-time", workLocation: "Remote", workSite: "OF1", gender: "M" },
            career: { organizationUnitID: "1-1-2", roleFamily: "PM", specialization: "AGILE", level: "S", stage: 1, startingDate: "2021-01-04", positionName: "Principal Engineer" }
        };

        const diff = component.computeDiff();
        assert.equal( diff.length, 15, `expected the form to report all 15 changed fields, got ${ diff.length }: ${ diff.map( ( d ) => d[ 0 ] ).join( ", " ) }` );

        const fields = {};
        diff.forEach( ( [ path, value ] ) => { fields[ path ] = value; } );
        assert.equal( "employeeID" in fields, false, "the form must never submit the record key" );

        await update( supervisorSession(), fields );

        assert.equal( writes.length, 1, "every path the form submits must be accepted in one batch" );
        assert.equal( writes[ 0 ].key, SUBJECT_ID );
    } );

} );

describe( "CompetenceWebApplication — the entitlement index must not go stale", () => {

    const app = new CompetenceWebApplication( "test-competence-employee-index-refresh" );
    const update = ( callerSession, fields ) =>
        app.processServiceRequest( callerSession, "update-employee", { employeeID: SUBJECT_ID, fields: fields } );

    it( "rebuilds the organization chart after a successful update", async ( t ) => {
        const { rebuilds } = stubStores( t );

        await update( supervisorSession(), { "personal.firstName": "Adelaide" } );

        assert.equal( rebuilds.count, 1 );
    } );

    it( "still rebuilds when an audit write fails, and still reports the failure", async ( t ) => {
        const { records, rebuilds } = stubStores( t );
        t.mock.method( DataManagerPrototype, "appendAuditEntry", () => Promise.reject( new Error( "audit store unavailable" ) ) );

        // The record is written before the audit runs, and the org chart carries the in-memory indexes derived from
        // it — including the employment status `verifySession` reads to decide whether a session may continue.
        // Rebuilding only on the happy path meant a rejected audit left that index holding the PREVIOUS status, so
        // terminating an employee could persist while their open session went on passing the check.
        await assert.rejects( update( supervisorSession(), { "employmentStatus": "terminated" } ) );

        assert.equal( records[ SUBJECT_ID ].employmentStatus, "terminated", "the write landed" );
        assert.equal( rebuilds.count, 1, "so the index derived from it has to be refreshed too" );
    } );

} );
