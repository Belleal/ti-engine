/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Integration coverage for the closed-cycle consent fallback (CA-93 — FINDING I3 of the final whole-branch review).
 *
 * `#loadResearchConsent` and `#submitResearchConsent` are private, so — mirroring
 * `competence-web-application.consent-gate.test.js` — this drives them the only way a caller can: through the public
 * dispatchers `processDataRequest( session, "load-research-consent" )` /
 * `processServiceRequest( session, "submit-research-consent", params )`. Persistence is stubbed on
 * `DataManager.prototype` (obtained via the exported, frozen `instance` — freezing the instance does not freeze its
 * prototype) — no Redis, no Express, no session store.
 *
 * Before this fix both methods resolved the target cycle via `getActiveCycle()` only, which returns null once a
 * cycle is CLOSED — so a subject could neither see nor revoke consent for a closed cycle, defeating design spec
 * §7.2's any-time-withdrawal guarantee. The fix: when there is no ACTIVE cycle, fall back to the cycle holding the
 * subject's own globally newest consent record (`fetchConsentHistory` + `ResearchConsent.resolveEffective` over the
 * tagged concatenation — see `#resolveFallbackConsentCycleID`).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const dataManager = require( "#data-manager" );
const configurationLoader = require( "#configuration-loader" );
const researchConsent = require( "#research-consent" ).instance;
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

// `#data-manager` exports only the frozen `instance`, never the `DataManager` class — but Object.freeze() on the
// instance does not touch its prototype, so this is the real (writable) `DataManager.prototype`.
const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );

const EMPLOYEE_ID = "employee-consent-fallback";
const OTHER_EMPLOYEE_ID = "employee-someone-else";
const ACTIVE_CYCLE_ID = "2026-H2";
const OLDER_CYCLE_ID = "2025-H2";
const NEWER_CLOSED_CYCLE_ID = "2026-H1";

function session( employeeID ) {
    return { language: "en", user: { employeeID: employeeID || EMPLOYEE_ID, roles: [] } };
}

function record( overrides ) {
    return Object.assign( {
        recordID: "rec-default",
        decision: researchConsent.decisionGranted,
        decidedAt: "2026-01-01T00:00:00.000Z",
        decidedBy: EMPLOYEE_ID,
        textHash: "hash-default",
        textVersion: "1.0",
        locale: "en",
        source: "scores-screen",
        supersedes: null
    }, overrides || {} );
}

describe( "CompetenceWebApplication — research-consent closed-cycle fallback (CA-93)", () => {

    // Constructed once: the constructor only registers fragments + config documents (no I/O), and re-registering the
    // same config-document/fragment keys is harmless (Map#set), so a single shared instance is enough for this file.
    const app = new CompetenceWebApplication( "test-competence-consent-fallback" );

    it( "active cycle present: both endpoints resolve it directly and never consult history (precedence guard)", async ( t ) => {
        const olderRecord = record( { recordID: "rec-older", decidedAt: "2020-01-01T00:00:00.000Z" } );

        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( { cycleID: ACTIVE_CYCLE_ID, status: configurationLoader.cycleStatus.ACTIVE } ) );
        const historyMock = t.mock.method( DataManagerPrototype, "fetchConsentHistory", () => Promise.reject( new Error( "must not be called when an active cycle exists" ) ) );
        const fetchChainMock = t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( [ olderRecord ] ) );

        const loaded = await app.processDataRequest( session(), "load-research-consent" );
        assert.equal( loaded.enabled, true );
        assert.equal( loaded.cycleID, ACTIVE_CYCLE_ID );
        assert.equal( loaded.decision, researchConsent.decisionGranted );
        assert.equal( historyMock.mock.callCount(), 0, "the active cycle must win without ever consulting the fallback" );
        assert.equal( fetchChainMock.mock.calls[ 0 ].arguments[ 1 ], ACTIVE_CYCLE_ID );

        const saveMock = t.mock.method( DataManagerPrototype, "saveConsentDecision", ( employeeID, cycleID, savedRecord ) => Promise.resolve( savedRecord ) );
        const submitted = await app.processServiceRequest( session(), "submit-research-consent", { decision: researchConsent.decisionDeclined } );
        assert.equal( submitted.cycleID, ACTIVE_CYCLE_ID );
        assert.equal( historyMock.mock.callCount(), 0, "submit must also skip the fallback when an active cycle exists" );
        assert.equal( saveMock.mock.calls[ 0 ].arguments[ 1 ], ACTIVE_CYCLE_ID );
    } );

    it( "no active cycle, chains in two cycles: both endpoints resolve to the cycle holding the globally newest record, and a submitted change lands there with the right supersedes", async ( t ) => {
        const olderRecord = record( { recordID: "rec-older", decidedAt: "2025-12-01T09:00:00.000Z", decision: researchConsent.decisionGranted, textHash: "hash-older" } );
        const newerRecord = record( { recordID: "rec-newer", decidedAt: "2026-03-01T09:00:00.000Z", decision: researchConsent.decisionDeclined, textHash: "hash-newer" } );
        const historyByCycle = { [ OLDER_CYCLE_ID ]: [ olderRecord ], [ NEWER_CLOSED_CYCLE_ID ]: [ newerRecord ] };

        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( null ) );
        const historyMock = t.mock.method( DataManagerPrototype, "fetchConsentHistory", () => Promise.resolve( historyByCycle ) );
        const fetchChainMock = t.mock.method( DataManagerPrototype, "fetchConsentChain", ( employeeID, cycleID ) => Promise.resolve( historyByCycle[ cycleID ] || [] ) );

        const loaded = await app.processDataRequest( session(), "load-research-consent" );
        assert.equal( loaded.enabled, true );
        assert.equal( loaded.cycleID, NEWER_CLOSED_CYCLE_ID, "the globally newest record lives in the newer closed cycle, not the older one" );
        assert.equal( loaded.decision, researchConsent.decisionDeclined );
        assert.equal( loaded.decidedAt, newerRecord.decidedAt );
        assert.equal( fetchChainMock.mock.calls[ 0 ].arguments[ 1 ], NEWER_CLOSED_CYCLE_ID );

        const saveMock = t.mock.method( DataManagerPrototype, "saveConsentDecision", ( employeeID, cycleID, savedRecord, text, previousDecision ) => {
            assert.equal( cycleID, NEWER_CLOSED_CYCLE_ID );
            assert.equal( savedRecord.supersedes, newerRecord.recordID, "the new record must supersede the fallback cycle's own effective record" );
            assert.equal( previousDecision, researchConsent.decisionDeclined );
            return Promise.resolve( savedRecord );
        } );

        const submitted = await app.processServiceRequest( session(), "submit-research-consent", { decision: researchConsent.decisionGranted } );
        assert.equal( submitted.cycleID, NEWER_CLOSED_CYCLE_ID );
        assert.equal( saveMock.mock.callCount(), 1 );
        assert.ok( historyMock.mock.callCount() >= 2, "both load and submit must have consulted the fallback history" );
    } );

    it( "no active cycle, no chains at all: load reports disabled and submit still rejects with error.consent.no-active-cycle", async ( t ) => {
        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( null ) );
        t.mock.method( DataManagerPrototype, "fetchConsentHistory", () => Promise.resolve( {} ) );
        const fetchChainMock = t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.reject( new Error( "must not be called — there is no cycle to resolve" ) ) );
        const saveMock = t.mock.method( DataManagerPrototype, "saveConsentDecision", () => Promise.reject( new Error( "must not be called — consent must never be first captured outside an active cycle" ) ) );

        const loaded = await app.processDataRequest( session(), "load-research-consent" );
        assert.equal( loaded.enabled, false );
        assert.equal( loaded.cycleID, null );
        assert.equal( loaded.decision, null );

        await assert.rejects(
            app.processServiceRequest( session(), "submit-research-consent", { decision: researchConsent.decisionGranted } ),
            ( error ) => {
                assert.equal( error && error.data && error.data.details, "error.consent.no-active-cycle" );
                return true;
            }
        );

        assert.equal( fetchChainMock.mock.callCount(), 0 );
        assert.equal( saveMock.mock.callCount(), 0 );
    } );

    it( "the fallback never crosses subjects: history is fetched for the session user only", async ( t ) => {
        const ownRecord = record( { recordID: "rec-own", decidedAt: "2026-02-01T00:00:00.000Z" } );
        const historyMock = t.mock.method( DataManagerPrototype, "fetchConsentHistory", ( employeeID ) => {
            assert.equal( employeeID, EMPLOYEE_ID, "history must be fetched for the session user, never a caller-supplied ID" );
            assert.notEqual( employeeID, OTHER_EMPLOYEE_ID );
            return Promise.resolve( { [ OLDER_CYCLE_ID ]: [ ownRecord ] } );
        } );
        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( null ) );
        t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( [ ownRecord ] ) );

        // There is no `employeeID` parameter on either dispatch — session identity is the only input — so this also
        // documents that there is no request shape that could redirect the fallback to someone else's history.
        const loaded = await app.processDataRequest( session( EMPLOYEE_ID ), "load-research-consent" );
        assert.equal( loaded.cycleID, OLDER_CYCLE_ID );
        assert.equal( historyMock.mock.callCount(), 1 );
    } );

} );
