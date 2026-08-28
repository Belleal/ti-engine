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

    // Work location, employment status, and level checks not covered by single-field cases

    it( "rejects an unrecognized work location", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workLocation: "Underwater" } ), CONTEXT ), "error.employee.invalid-work-location" );
    } );

    it( "rejects an unrecognized employment status", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { employmentStatus: "unknown" } ), CONTEXT ), "error.employee.invalid-employment-status" );
    } );

    it( "rejects an unrecognized level", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "Z" } ), CONTEXT ), "error.employee.invalid-level" );
    } );

    // Boundary tests for the stage field. The upper bound is no longer a fixed 1-3: since CA-111 each rung
    // declares its own sub-level count in the ladder (N and X one, J/R/S three, T two), so "too high" is
    // reported as invalid-stage-for-level and only a non-positive or non-integer stage is invalid-stage.

    it( "rejects a stage below the permitted range (0)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { stage: 0 } ), CONTEXT ), "error.employee.invalid-stage" );
    } );

    it( "rejects a stage above what the level declares (4 on a three-stage rung)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { stage: 4 } ), CONTEXT ), "error.employee.invalid-stage-for-level" );
    } );

    // Adjacent-rule-boundary precedence tests: when two adjacent rules in the sequence are both violated,
    // the earlier rule wins. This catches future swaps where adjacent rules might be inadvertently re-ordered.

    it( "enforces that missing-name takes precedence over invalid-work-mode (1→2)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { firstName: "", workMode: "Casual" } ), CONTEXT ), "error.employee.missing-name" );
    } );

    it( "enforces that invalid-work-mode takes precedence over invalid-work-location (2→3)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workMode: "Casual", workLocation: "Underwater" } ), CONTEXT ), "error.employee.invalid-work-mode" );
    } );

    it( "enforces that invalid-work-location takes precedence over invalid-employment-status (3→4)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { workLocation: "Underwater", employmentStatus: "unknown" } ), CONTEXT ), "error.employee.invalid-work-location" );
    } );

    it( "enforces that invalid-employment-status takes precedence over invalid-role-family (4→5)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { employmentStatus: "unknown", roleFamily: "ZZ" } ), CONTEXT ), "error.employee.invalid-employment-status" );
    } );

    // Role-family/specialization boundary (5→6) is structurally protected: the specialization check reads
    // families[roleFamily].specializations, so it is only reachable when the family is valid. A swap would
    // throw a TypeError on families[undefined] rather than mis-order silently, so no test is needed here.

    it( "enforces that invalid-specialization takes precedence over invalid-level (6→7)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { roleFamily: "SE", specialization: "AGILE", level: "Z" } ), CONTEXT ), "error.employee.invalid-specialization" );
    } );

    it( "enforces that invalid-level takes precedence over invalid-stage (7→8)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "Z", stage: 1.5 } ), CONTEXT ), "error.employee.invalid-level" );
    } );

    // Formerly a precedence test (8→9): X with stage 4 violated both the fixed 1-3 bound and the single-stage
    // rule, and asserted the earlier one won. Since CA-111 the two rules are DISJOINT — invalid-stage covers a
    // non-positive or non-integer stage, invalid-stage-for-level covers a stage past what the rung declares — so
    // no input can violate both and there is no precedence left to assert. What replaces it is the disjointness
    // itself, which is the property a future re-ordering would actually break.
    it( "separates a malformed stage from one the level does not offer (8 vs 9)", () => {
        // Malformed: reported as invalid-stage whatever the level, including a single-stage rung.
        for ( const level of [ "X", "R", "T" ] ) {
            assert.equal( employeeRules.instance.validateEmployee( employee( { level: level, stage: 0 } ), CONTEXT ),
                "error.employee.invalid-stage", `stage 0 on ${ level } is malformed, not level-specific` );
        }
        // Well-formed but past the rung's declared count: reported as invalid-stage-for-level.
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "X", stage: 4 } ), CONTEXT ),
            "error.employee.invalid-stage-for-level" );
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "T", stage: 3 } ), CONTEXT ),
            "error.employee.invalid-stage-for-level", "T declares two sub-levels since CA-111, so T3 is out of range" );
    } );

    it( "enforces that invalid-stage-for-level takes precedence over invalid-organization-unit (9→10)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { level: "X", stage: 2, unit: "9-9" } ), CONTEXT ), "error.employee.invalid-stage-for-level" );
    } );

    it( "enforces that invalid-organization-unit takes precedence over invalid-email (10→11)", () => {
        assert.equal( employeeRules.instance.validateEmployee( employee( { unit: "9-9", email: "not-an-email" } ), CONTEXT ), "error.employee.invalid-organization-unit" );
    } );

} );

describe( "employeeRules.findEmailCollision", () => {

    const EXISTING = [
        { employeeID: "1", email: "ada@example.com" },
        { employeeID: "2", email: "Grace@Example.com" },
        { employeeID: "3" }
    ];

    it( "returns null when the email is unused", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "new@example.com", "9", EXISTING ), null );
    } );

    it( "finds a collision regardless of case or surrounding whitespace", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "  ADA@example.com ", "9", EXISTING ), "1" );
        assert.equal( employeeRules.instance.findEmailCollision( "grace@example.com", "9", EXISTING ), "2" );
    } );

    it( "does not collide a record with itself", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "ada@example.com", "1", EXISTING ), null );
    } );

    it( "ignores an absent or empty email", () => {
        assert.equal( employeeRules.instance.findEmailCollision( "", "9", EXISTING ), null );
        assert.equal( employeeRules.instance.findEmailCollision( undefined, "9", EXISTING ), null );
    } );

} );
