/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const researchConsent = require( "#research-consent" ).instance;

const HASH_A = "a".repeat( 64 );
const HASH_B = "b".repeat( 64 );

function record( overrides ) {
    return Object.assign( {
        recordID: "r1",
        decision: "granted",
        decidedAt: "2026-08-01T10:00:00.000Z",
        decidedBy: "1",
        textHash: HASH_A,
        textVersion: "1.0",
        locale: "en",
        source: "evaluation-submit",
        supersedes: null
    }, overrides || {} );
}

describe( "ResearchConsent.buildConsentRegister", () => {

    it( "counts granted, declined and not-asked across the supplied population", () => {
        const chains = {
            "1": [ record( { decision: "granted" } ) ],
            "2": [ record( { recordID: "r2", decision: "declined", decidedBy: "2" } ) ]
        };
        const result = researchConsent.buildConsentRegister( [ "1", "2", "3" ], chains );
        assert.deepEqual( result.counts, { granted: 1, declined: 1, notAsked: 1 } );
        assert.equal( result.rows.length, 3 );
    } );

    it( "reports a not-asked employee with a null decision rather than omitting them", () => {
        const result = researchConsent.buildConsentRegister( [ "3" ], {} );
        assert.equal( result.rows.length, 1 );
        assert.equal( result.rows[ 0 ].employeeID, "3" );
        assert.equal( result.rows[ 0 ].decision, null );
        assert.equal( result.rows[ 0 ].decidedAt, null );
        assert.equal( result.rows[ 0 ].textVersion, null );
    } );

    it( "reports only the record in force for an employee who changed their mind", () => {
        const chains = {
            "1": [
                record( { recordID: "r1", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" } ),
                record( { recordID: "r2", decision: "declined", decidedAt: "2026-08-05T10:00:00.000Z", textVersion: "1.1", textHash: HASH_B } )
            ]
        };
        const result = researchConsent.buildConsentRegister( [ "1" ], chains );
        assert.equal( result.rows[ 0 ].decision, "declined" );
        assert.equal( result.rows[ 0 ].textVersion, "1.1" );
        assert.deepEqual( result.counts, { granted: 0, declined: 1, notAsked: 0 } );
    } );

} );

describe( "ResearchConsent.filterConsentedEvaluations", () => {

    const evaluations = [
        { evaluationID: "e1", employeeID: "1", cycleID: "2026-H2" },
        { evaluationID: "e2", employeeID: "2", cycleID: "2026-H2" },
        { evaluationID: "e3", employeeID: "3", cycleID: "2026-H2" }
    ];

    it( "includes only employees whose newest record is granted", () => {
        const chains = {
            "1": [ record( { decision: "granted" } ) ],
            "2": [ record( { recordID: "r2", decision: "declined", decidedBy: "2" } ) ]
            // "3" has no chain at all
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included.map( ( e ) => e.evaluationID ), [ "e1" ] );
        assert.equal( result.consentedCount, 1 );
        assert.equal( result.excludedCount, 2 );
    } );

    it( "returns nothing at all when the capability is disabled — fail-closed", () => {
        const chains = {
            "1": [ record( { decision: "granted" } ) ],
            "2": [ record( { recordID: "r2", decision: "granted", decidedBy: "2" } ) ],
            "3": [ record( { recordID: "r3", decision: "granted", decidedBy: "3" } ) ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: false } );
        assert.deepEqual( result.included, [] );
        assert.equal( result.consentedCount, 0 );
        assert.equal( result.excludedCount, 3 );
    } );

    it( "honours a withdrawal that came after an earlier grant", () => {
        const chains = {
            "1": [
                record( { recordID: "r1", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" } ),
                record( { recordID: "r2", decision: "declined", decidedAt: "2026-08-05T10:00:00.000Z" } )
            ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included, [] );
    } );

    it( "honours a re-grant that came after an earlier withdrawal", () => {
        const chains = {
            "1": [
                record( { recordID: "r1", decision: "declined", decidedAt: "2026-08-01T10:00:00.000Z" } ),
                record( { recordID: "r2", decision: "granted", decidedAt: "2026-08-05T10:00:00.000Z" } )
            ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included.map( ( e ) => e.evaluationID ), [ "e1" ] );
    } );

    it( "excludes evaluations belonging to another cycle", () => {
        const mixed = evaluations.concat( [ { evaluationID: "e9", employeeID: "1", cycleID: "2026-H1" } ] );
        const chains = { "1": [ record( { decision: "granted" } ) ] };
        const result = researchConsent.filterConsentedEvaluations( mixed, chains, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included.map( ( e ) => e.evaluationID ), [ "e1" ] );
    } );

    it( "reports a basis manifest covering only the included population", () => {
        const chains = {
            "1": [ record( { decision: "granted", textHash: HASH_A } ) ],
            "2": [ record( { recordID: "r2", decision: "declined", decidedBy: "2", textHash: HASH_B } ) ]
        };
        const result = researchConsent.filterConsentedEvaluations( evaluations, chains, { cycleID: "2026-H2", enabled: true } );
        assert.equal( result.basis.cycleID, "2026-H2" );
        assert.match( result.basis.resolvedAt, /^\d{4}-\d{2}-\d{2}T/ );
        assert.deepEqual( result.basis.textHashes, [ HASH_A ] );
    } );

    it( "tolerates an empty evaluation list", () => {
        const result = researchConsent.filterConsentedEvaluations( [], {}, { cycleID: "2026-H2", enabled: true } );
        assert.deepEqual( result.included, [] );
        assert.deepEqual( result.basis.textHashes, [] );
    } );

} );
