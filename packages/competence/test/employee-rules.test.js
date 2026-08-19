/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const employeeRules = require( "#employee-rules" );

const CONTEXT = {
    roleFamilies: {
        SE: { specializations: { BACKEND: {}, FRONTEND: {} } },
        PM: { specializations: { AGILE: {} } }
    },
    organizationStructure: { "1": {}, "1-1": {} }
};

function employee( over = {} ) {
    return {
        employeeID: over.employeeID || "1",
        email: ( over.email !== undefined ) ? over.email : "a@example.com",
        employmentStatus: over.employmentStatus || "active",
        personal: {
            firstName: ( over.firstName !== undefined ) ? over.firstName : "Ada",
            lastName: ( over.lastName !== undefined ) ? over.lastName : "Lovelace",
            workMode: over.workMode || "Full-time",
            workLocation: over.workLocation || "On-site"
        },
        career: {
            organizationUnitID: ( over.unit !== undefined ) ? over.unit : "1-1",
            roleFamily: over.roleFamily || "SE",
            specialization: ( over.specialization !== undefined ) ? over.specialization : "BACKEND",
            level: over.level || "R",
            stage: ( over.stage !== undefined ) ? over.stage : 2
        }
    };
}

describe( "employeeRules.validateEmployee", () => {

    it( "accepts a well-formed record", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee(), CONTEXT ), null );
    } );

    it( "rejects a missing name", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { firstName: "" } ), CONTEXT ), "error.employee.missing-name" );
    } );

    it( "rejects an unknown work mode", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workMode: "Casual" } ), CONTEXT ), "error.employee.invalid-work-mode" );
    } );

    it( "rejects a role family absent from the configuration", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { roleFamily: "ZZ" } ), CONTEXT ), "error.employee.invalid-role-family" );
    } );

    it( "rejects a specialization that does not belong to the family", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { roleFamily: "PM", specialization: "BACKEND" } ), CONTEXT ), "error.employee.invalid-specialization" );
    } );

    it( "accepts a null specialization as a generalist", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { specialization: null } ), CONTEXT ), null );
    } );

    it( "rejects a non-integer stage", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { stage: 1.5 } ), CONTEXT ), "error.employee.invalid-stage" );
    } );

    it( "enforces the dual-track rule that N, X and T carry only stage 1", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "X", stage: 2 } ), CONTEXT ), "error.employee.invalid-stage-for-level" );
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "X", stage: 1 } ), CONTEXT ), null );
    } );

    it( "rejects an organization unit that is not in the tree", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { unit: "9-9" } ), CONTEXT ), "error.employee.invalid-organization-unit" );
    } );

    it( "rejects a malformed email but allows an absent one", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { email: "not-an-email" } ), CONTEXT ), "error.employee.invalid-email" );
        assert.equal( employeeRules.instance.validateEmployee( employee( { email: undefined } ), CONTEXT ), null );
    } );

} );
