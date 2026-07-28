/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * A thin integration test for the research-consent submit gate inside `#submitEvaluation` (CompetenceWebApplication).
 * `#submitEvaluation` is private, so this drives it the only way a caller can: through the public dispatcher
 * `processServiceRequest( session, "submit-evaluation", { evaluation } )`. Persistence is stubbed by mocking methods
 * directly on `DataManager.prototype` (obtained via the exported, frozen `instance` — the class itself is not
 * exported, but its prototype is not frozen) — no Redis, no Express, no session store.
 *
 * Covers the three behaviours the review flagged as having no automated coverage:
 *   1. a self-submit with no `researchConsent` rejects with `error.consent.decision-required`;
 *   2. a rejected consent write aborts the submit — `saveEvaluation` is never called (the ordering guarantee);
 *   3. a retry with the same decision and the same statement text is a no-op — `saveConsentDecision` is not
 *      called again (idempotency, exercised end-to-end through the real gate rather than the pure predicate alone).
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

const EMPLOYEE_ID = "employee-consent-gate";
const CYCLE_ID = "2026-H2";
const EVALUATION_ID = "eval-consent-gate-1";

/**
 * Extracts the `details` label key from a raised TiException — mirrors the helper in research-consent.gate.test.js.
 */
function detailsOf( error ) {
    return error && error.data && error.data.details;
}

function session() {
    return { language: "en", user: { employeeID: EMPLOYEE_ID, roles: [] } };
}

/**
 * A minimal OPEN self-evaluation: empty `grades` so the "incomplete grades" guard trivially passes (Object.keys( {} )
 * .some(...) is false), and team already done so the branch doesn't touch anything besides the consent gate.
 */
function storedEvaluation( overrides ) {
    return Object.assign( {
        evaluationID: EVALUATION_ID,
        employeeID: EMPLOYEE_ID,
        cycleID: CYCLE_ID,
        status: configurationLoader.evaluationStatus.OPEN,
        grades: {},
        workflow: {
            selfEvaluationCompleted: false,
            selfEvaluationDeadline: null,
            team: [],
            teamEvaluationCompleted: true
        }
    }, overrides || {} );
}

describe( "CompetenceWebApplication — self-submit research-consent gate (integration)", () => {

    // Constructed once: the constructor only registers fragments + config documents (no I/O), and re-registering the
    // same config-document/fragment keys is harmless (Map#set), so a single shared instance is enough for this file.
    const app = new CompetenceWebApplication( "test-competence-consent-gate" );

    it( "rejects a self-submit with no researchConsent decision", async ( t ) => {
        t.mock.method( DataManagerPrototype, "fetchEvaluation", () => Promise.resolve( storedEvaluation() ) );
        const saveEvaluationMock = t.mock.method( DataManagerPrototype, "saveEvaluation", () => Promise.resolve( storedEvaluation() ) );

        await assert.rejects(
            app.processServiceRequest( session(), "submit-evaluation", { evaluation: { evaluationID: EVALUATION_ID } } ),
            ( error ) => {
                assert.equal( detailsOf( error ), "error.consent.decision-required" );
                return true;
            }
        );

        assert.equal( saveEvaluationMock.mock.callCount(), 0, "the gate must reject before the evaluation is ever persisted" );
    } );

    it( "aborts the submit — saveEvaluation is never called — when the consent write rejects", async ( t ) => {
        t.mock.method( DataManagerPrototype, "fetchEvaluation", () => Promise.resolve( storedEvaluation() ) );
        t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( [] ) );
        const saveConsentMock = t.mock.method( DataManagerPrototype, "saveConsentDecision", () => Promise.reject( new Error( "consent store unavailable" ) ) );
        const saveEvaluationMock = t.mock.method( DataManagerPrototype, "saveEvaluation", () => Promise.resolve( storedEvaluation() ) );

        await assert.rejects(
            app.processServiceRequest( session(), "submit-evaluation", { evaluation: { evaluationID: EVALUATION_ID, researchConsent: "granted" } } )
        );

        assert.equal( saveConsentMock.mock.callCount(), 1, "the consent write must actually have been attempted" );
        assert.equal( saveEvaluationMock.mock.callCount(), 0, "a failed consent write must abort the submit before saveEvaluation runs" );
    } );

    it( "does not write the consent decision again on a retry with the same decision and the same statement text", async ( t ) => {
        // The record already "in force" — same decision, and its textHash matches the CURRENT config statement, so
        // this is a genuine retry, not a stale-text case (see research-consent.test.js for that distinction).
        const currentBody = configurationLoader.configResearchConsent.text.en.body;
        const currentHash = researchConsent.hashText( currentBody );
        const effectiveChain = [ {
            recordID: "already-on-file",
            decision: "granted",
            decidedAt: "2026-07-01T10:00:00.000Z",
            decidedBy: EMPLOYEE_ID,
            textHash: currentHash,
            textVersion: configurationLoader.configResearchConsent.version,
            locale: "en",
            source: "evaluation-submit",
            supersedes: null
        } ];

        t.mock.method( DataManagerPrototype, "fetchEvaluation", () => Promise.resolve( storedEvaluation() ) );
        t.mock.method( DataManagerPrototype, "fetchConsentChain", () => Promise.resolve( effectiveChain ) );
        const saveConsentMock = t.mock.method( DataManagerPrototype, "saveConsentDecision", () => Promise.reject( new Error( "must not be called" ) ) );
        const saveEvaluationMock = t.mock.method( DataManagerPrototype, "saveEvaluation", ( evaluation ) => Promise.resolve( evaluation ) );

        await app.processServiceRequest( session(), "submit-evaluation", { evaluation: { evaluationID: EVALUATION_ID, researchConsent: "granted" } } );

        assert.equal( saveConsentMock.mock.callCount(), 0, "a same-decision, same-text retry must be a no-op write" );
        assert.equal( saveEvaluationMock.mock.callCount(), 1, "the evaluation itself must still be saved on a retry" );
    } );

} );
