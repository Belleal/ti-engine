/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * A thin integration test for the two Supervisor-facing consent review views added in Task 6
 * (`#loadConsentRegister` / `#loadConsentEvidence` in CompetenceWebApplication): the per-cycle register and the
 * per-employee evidence chain. Both are private, so — following the precedent set by
 * `competence-web-application.consent-gate.test.js` — this drives them the only way a caller can: through the public
 * dispatcher `processDataRequest( session, view, options )`. Persistence is stubbed by mocking methods directly on
 * `DataManager.prototype` (obtained via the exported, frozen `instance` — the class itself is not exported, but its
 * prototype is not frozen) — no Redis, no Express, no session store.
 *
 * Covers the behaviours the task called out as needing coverage:
 *   1. the register rejects a non-Supervisor;
 *   2. the register includes a never-asked employee as a null-decision row and its counts are right;
 *   3. evidence rejects a non-Supervisor asking for someone else's record;
 *   4. evidence permits an employee reading their own record;
 *   5. evidence resolves each record's verbatim `body` from the text registry.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const dataManager = require( "#data-manager" );
const configurationLoader = require( "#configuration-loader" );
const exceptions = require( "@ti-engine/core/exceptions" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

// `#data-manager` exports only the frozen `instance`, never the `DataManager` class — but Object.freeze() on the
// instance does not touch its prototype, so this is the real (writable) `DataManager.prototype`.
const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );

const CYCLE_ID = "2026-H2";
const SUPERVISOR_ID = "supervisor-1";
const EMPLOYEE_GRANTED_ID = "employee-granted";
const EMPLOYEE_DECLINED_ID = "employee-declined";
const EMPLOYEE_NEVER_ASKED_ID = "employee-never-asked";

/**
 * Extracts the `details` label key from a raised TiException — mirrors the helper in the consent-gate test.
 */
function detailsOf( error ) {
    return error && error.data && error.data.details;
}

function supervisorSession() {
    return { language: "en", user: { employeeID: SUPERVISOR_ID, roles: [ configurationLoader.roleCode.SUPERVISOR ] } };
}

function employeeSession( employeeID ) {
    return { language: "en", user: { employeeID: employeeID, roles: [ configurationLoader.roleCode.EMPLOYEE ] } };
}

function employees() {
    return [
        {
            employeeID: EMPLOYEE_GRANTED_ID,
            personal: { firstName: "Grace", lastName: "Granted" }
        },
        {
            employeeID: EMPLOYEE_DECLINED_ID,
            personal: { firstName: "Dana", lastName: "Declined" }
        },
        {
            employeeID: EMPLOYEE_NEVER_ASKED_ID,
            personal: { firstName: "Nia", lastName: "NeverAsked" }
        }
    ];
}

/**
 * `fetchConsentDecisions` reports only employees who have ever been asked — the never-asked employee is
 * deliberately absent, matching the real DataManager contract (see its own JSDoc).
 */
function consentDecisions() {
    return {
        [ EMPLOYEE_GRANTED_ID ]: [ {
            recordID: "rec-granted-1",
            decision: "granted",
            decidedAt: "2026-07-01T10:00:00.000Z",
            decidedBy: EMPLOYEE_GRANTED_ID,
            textHash: "hash-v1",
            textVersion: "1.0",
            locale: "en",
            source: "evaluation-submit",
            supersedes: null
        } ],
        [ EMPLOYEE_DECLINED_ID ]: [ {
            recordID: "rec-declined-1",
            decision: "declined",
            decidedAt: "2026-07-02T10:00:00.000Z",
            decidedBy: EMPLOYEE_DECLINED_ID,
            textHash: "hash-v1",
            textVersion: "1.0",
            locale: "en",
            source: "evaluation-submit",
            supersedes: null
        } ]
    };
}

describe( "CompetenceWebApplication — consent register and evidence views (integration)", () => {

    // Constructed once: the constructor only registers fragments + config documents (no I/O), and re-registering the
    // same config-document/fragment keys is harmless (Map#set), so a single shared instance is enough for this file.
    const app = new CompetenceWebApplication( "test-competence-consent-register-evidence" );

    describe( "load-consent-register", () => {

        it( "rejects a non-Supervisor", async ( t ) => {
            const fetchEmployeesMock = t.mock.method( DataManagerPrototype, "fetchEmployees", () => Promise.resolve( employees() ) );
            const fetchDecisionsMock = t.mock.method( DataManagerPrototype, "fetchConsentDecisions", () => Promise.resolve( consentDecisions() ) );

            await assert.rejects(
                app.processDataRequest( employeeSession( EMPLOYEE_GRANTED_ID ), "load-consent-register", { query: { cycleID: CYCLE_ID } } ),
                ( error ) => {
                    assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                    assert.equal( error.httpCode, exceptions.httpCode.C_403 );
                    return true;
                }
            );

            assert.equal( fetchEmployeesMock.mock.callCount(), 0, "a rejected role check must short-circuit before any persistence read" );
            assert.equal( fetchDecisionsMock.mock.callCount(), 0 );
        } );

        it( "includes a never-asked employee as a null-decision row and reports correct counts", async ( t ) => {
            t.mock.method( DataManagerPrototype, "fetchEmployees", () => Promise.resolve( employees() ) );
            t.mock.method( DataManagerPrototype, "fetchConsentDecisions", () => Promise.resolve( consentDecisions() ) );

            const result = await app.processDataRequest( supervisorSession(), "load-consent-register", { query: { cycleID: CYCLE_ID } } );

            assert.equal( result.cycleID, CYCLE_ID );
            assert.deepEqual( result.counts, { granted: 1, declined: 1, notAsked: 1 } );
            assert.equal( result.rows.length, 3, "the whole population is reported, not just respondents" );

            const neverAskedRow = result.rows.find( ( row ) => row.employeeID === EMPLOYEE_NEVER_ASKED_ID );
            assert.ok( neverAskedRow, "the never-asked employee must still appear as a row" );
            assert.equal( neverAskedRow.decision, null );
            assert.equal( neverAskedRow.decidedAt, null );
            assert.equal( neverAskedRow.textVersion, null );
            assert.equal( neverAskedRow.textHash, null );
            assert.equal( neverAskedRow.employeeName, "Nia NeverAsked" );

            const grantedRow = result.rows.find( ( row ) => row.employeeID === EMPLOYEE_GRANTED_ID );
            assert.equal( grantedRow.decision, "granted" );
            assert.equal( grantedRow.employeeName, "Grace Granted" );

            const declinedRow = result.rows.find( ( row ) => row.employeeID === EMPLOYEE_DECLINED_ID );
            assert.equal( declinedRow.decision, "declined" );
            assert.equal( declinedRow.employeeName, "Dana Declined" );
        } );

    } );

    describe( "load-consent-evidence", () => {

        function evidenceChain() {
            return [ {
                recordID: "rec-1",
                decision: "declined",
                decidedAt: "2026-06-01T10:00:00.000Z",
                decidedBy: EMPLOYEE_GRANTED_ID,
                textHash: "hash-old",
                textVersion: "1.0",
                locale: "en",
                source: "evaluation-submit",
                supersedes: null
            }, {
                recordID: "rec-2",
                decision: "granted",
                decidedAt: "2026-07-01T10:00:00.000Z",
                decidedBy: EMPLOYEE_GRANTED_ID,
                textHash: "hash-new",
                textVersion: "1.1",
                locale: "en",
                source: "scores-screen",
                supersedes: "rec-1"
            } ];
        }

        it( "rejects a non-Supervisor asking for someone else's record", async ( t ) => {
            const fetchChainMock = t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( evidenceChain() ) );

            await assert.rejects(
                app.processDataRequest(
                    employeeSession( "some-other-employee" ),
                    "load-consent-evidence",
                    { query: { employeeID: EMPLOYEE_GRANTED_ID, cycleID: CYCLE_ID } }
                ),
                ( error ) => {
                    assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                    assert.equal( error.httpCode, exceptions.httpCode.C_403 );
                    assert.equal( detailsOf( error ), "error.consent.not-self" );
                    return true;
                }
            );

            assert.equal( fetchChainMock.mock.callCount(), 0, "the access check must short-circuit before any persistence read" );
        } );

        it( "permits an employee reading their own record", async ( t ) => {
            t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( evidenceChain() ) );
            t.mock.method( DataManagerPrototype, "fetchConsentText", ( hash ) => Promise.resolve( { body: `body for ${ hash }`, locale: "en", version: "1.0", firstSeenAt: "2026-06-01T10:00:00.000Z" } ) );

            const result = await app.processDataRequest(
                employeeSession( EMPLOYEE_GRANTED_ID ),
                "load-consent-evidence",
                { query: { employeeID: EMPLOYEE_GRANTED_ID, cycleID: CYCLE_ID } }
            );

            assert.equal( result.employeeID, EMPLOYEE_GRANTED_ID );
            assert.equal( result.cycleID, CYCLE_ID );
            assert.equal( result.records.length, 2 );
        } );

        it( "resolves each record's verbatim body from the text registry, including a superseded record", async ( t ) => {
            t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( evidenceChain() ) );
            const fetchTextMock = t.mock.method( DataManagerPrototype, "fetchConsentText", ( hash ) => {
                const bodies = { "hash-old": "The old verbatim statement.", "hash-new": "The new verbatim statement." };
                return Promise.resolve( { body: bodies[ hash ], locale: "en", version: "1.0", firstSeenAt: "2026-06-01T10:00:00.000Z" } );
            } );

            // Supervisor path, so this also covers "available to a Supervisor" for someone else's record.
            const result = await app.processDataRequest(
                supervisorSession(),
                "load-consent-evidence",
                { query: { employeeID: EMPLOYEE_GRANTED_ID, cycleID: CYCLE_ID } }
            );

            assert.equal( fetchTextMock.mock.callCount(), 2, "one lookup per distinct textHash in the chain" );

            const supersededRecord = result.records.find( ( record ) => record.recordID === "rec-1" );
            assert.equal( supersededRecord.body, "The old verbatim statement.", "a superseded record's own verbatim text must still be resolvable" );
            assert.equal( supersededRecord.decision, "declined" );

            const effectiveRecord = result.records.find( ( record ) => record.recordID === "rec-2" );
            assert.equal( effectiveRecord.body, "The new verbatim statement." );
            assert.equal( effectiveRecord.decision, "granted" );
            assert.equal( effectiveRecord.supersedes, "rec-1" );
        } );

    } );

} );
