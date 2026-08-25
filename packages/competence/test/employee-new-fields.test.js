/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The three fields added in CA-109 — personal.workSite, career.positionName and the M/F constraint on
 * personal.gender — checked at the rules layer.
 *
 * Constraining gender here as well as in mapRow is the point: Employee Management and the importer are two write
 * paths onto the same record, and a value one accepts while the other rejects is a record that cannot be
 * re-imported. validateEmployee is what both of them call.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const employeeRules = require( "../application/employee-rules" );

const CONTEXT = {
    roleFamilies: { SE: { specializations: { BACKEND: {} } } },
    organizationStructure: { "1": { id: "1" } },
    workSites: { HQ: { id: "HQ", type: "office", name: { en: "HQ", bg: "HQ" } } }
};

const employee = ( personal, career ) => ( {
    employeeID: "1",
    personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", ...personal },
    career: { organizationUnitID: "1", roleFamily: "SE", level: "R", stage: 2, ...career }
} );

describe( "validateEmployee — workSite", () => {

    it( "accepts a record with no work site at all", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

    it( "accepts a known site", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: "HQ" } ), CONTEXT ), null );
    } );

    it( "rejects an unknown site", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: "NOPE" } ), CONTEXT ),
            "error.employee.invalid-work-site" );
    } );

    it( "rejects any site when the context carries no nomenclature", () => {
        // A caller that forgets to pass workSites must fail closed, not silently accept every value.
        const { workSites, ...withoutSites } = CONTEXT;
        assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: "HQ" } ), withoutSites ),
            "error.employee.invalid-work-site" );
    } );

} );

describe( "validateEmployee — gender", () => {

    for ( const value of [ "M", "F" ] ) {
        it( `accepts '${ value }'`, () => {
            assert.equal( employeeRules.instance.validateEmployee( employee( { gender: value } ), CONTEXT ), null );
        } );
    }

    it( "accepts an absent gender", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

    for ( const value of [ "m", "Male", "X", "Ж" ] ) {
        it( `rejects '${ value }'`, () => {
            assert.equal( employeeRules.instance.validateEmployee( employee( { gender: value } ), CONTEXT ),
                "error.employee.invalid-gender" );
        } );
    }

} );

describe( "validateEmployee — positionName", () => {

    it( "accepts any free text, and its absence", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( {}, { positionName: "Старши експерт" } ), CONTEXT ), null );
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

} );
