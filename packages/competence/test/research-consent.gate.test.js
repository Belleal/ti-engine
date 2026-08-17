/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const researchConsent = require( "#research-consent" ).instance;

/**
 * Extracts the `details` label key from a raised TiException so the assertions read against the contract the UI sees.
 */
function detailsOf( error ) {
    return error && error.data && error.data.details;
}

describe( "ResearchConsent.requireDecision (submit gate)", () => {

    it( "returns null when the capability is disabled — the gate is skipped entirely", () => {
        assert.equal( researchConsent.requireDecision( undefined, false ), null );
        assert.equal( researchConsent.requireDecision( "granted", false ), null );
    } );

    it( "returns the normalized decision for either valid answer", () => {
        assert.equal( researchConsent.requireDecision( "granted", true ), "granted" );
        assert.equal( researchConsent.requireDecision( "declined", true ), "declined" );
        assert.equal( researchConsent.requireDecision( "  GRANTED  ", true ), "granted" );
    } );

    it( "rejects a missing decision with error.consent.decision-required", () => {
        for ( const missing of [ undefined, null, "" ] ) {
            assert.throws( () => researchConsent.requireDecision( missing, true ), ( error ) => {
                assert.equal( detailsOf( error ), "error.consent.decision-required" );
                return true;
            } );
        }
    } );

    it( "rejects an unrecognized value with error.consent.invalid-decision", () => {
        assert.throws( () => researchConsent.requireDecision( "maybe", true ), ( error ) => {
            assert.equal( detailsOf( error ), "error.consent.invalid-decision" );
            return true;
        } );
    } );

    it( "treats a non-boolean enabled as disabled — fail-closed on a malformed config", () => {
        assert.equal( researchConsent.requireDecision( undefined, "yes" ), null );
        assert.equal( researchConsent.requireDecision( undefined, undefined ), null );
    } );

} );
