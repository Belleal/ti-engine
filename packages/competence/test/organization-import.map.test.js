/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationImport = require( "#organization-import" );

function row( over = {} ) {
    return Object.assign( {
        __row: 2,
        employee_id: "00123",
        email: "Ada@Example.com",
        employment_status: "active",
        first_name: "Ada",
        last_name: "Lovelace",
        work_mode: "Full-time",
        work_location: "On-site",
        organization_unit_id: "1-1",
        role_family: "SE",
        specialization: "BACKEND",
        level: "R",
        stage: "2",
        starting_date: "2022-03-14"
    }, over );
}

describe( "organizationImport.mapRow", () => {

    it( "maps a well-formed row into the nested employee shape", () => {
        const { employee, error } = organizationImport.instance.mapRow( row() );
        assert.equal( error, null );
        assert.deepEqual( employee, {
            __row: 2,
            employeeID: "00123",
            email: "ada@example.com",
            employmentStatus: "active",
            personal: { firstName: "Ada", lastName: "Lovelace", workMode: "Full-time", workLocation: "On-site" },
            career: { organizationUnitID: "1-1", roleFamily: "SE", specialization: "BACKEND", level: "R", stage: 2, startingDate: "2022-03-14" }
        } );
    } );

    it( "carries the source row number so a later rejection can name the line", () => {
        assert.equal( organizationImport.instance.mapRow( row( { __row: 42 } ) ).employee.__row, 42 );
    } );

    it( "preserves a leading zero in the employee ID", () => {
        assert.equal( organizationImport.instance.mapRow( row() ).employee.employeeID, "00123" );
    } );

    it( "lower-cases the email, matching the login index", () => {
        assert.equal( organizationImport.instance.mapRow( row() ).employee.email, "ada@example.com" );
    } );

    it( "coerces stage to an integer", () => {
        assert.equal( organizationImport.instance.mapRow( row( { stage: " 3 " } ) ).employee.career.stage, 3 );
    } );

    it( "rejects a non-numeric stage rather than emitting NaN", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { stage: "senior" } ) );
        assert.equal( employee, null );
        assert.equal( error.column, "stage" );
        assert.equal( error.code, "not-an-integer" );
        assert.equal( error.row, 2 );
    } );

    it( "normalizes case and separators on a fixed enum", () => {
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "full time" } ) ).employee.personal.workMode, "Full-time" );
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "FULL_TIME" } ) ).employee.personal.workMode, "Full-time" );
        assert.equal( organizationImport.instance.mapRow( row( { work_location: "hybrid" } ) ).employee.personal.workLocation, "Hybrid" );
    } );

    it( "rejects an unrecognized enum value and lists the permitted ones", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { work_mode: "Casual" } ) );
        assert.equal( employee, null );
        assert.equal( error.code, "not-a-permitted-value" );
        assert.ok( error.message.includes( "Full-time" ) );
    } );

    it( "does not guess at an abbreviation", () => {
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "FT" } ) ).employee, null );
    } );

    it( "turns an empty specialization into null, marking a generalist", () => {
        assert.equal( organizationImport.instance.mapRow( row( { specialization: "" } ) ).employee.career.specialization, null );
        assert.equal( organizationImport.instance.mapRow( row( { specialization: "   " } ) ).employee.career.specialization, null );
    } );

    it( "defaults an absent employment status to active", () => {
        assert.equal( organizationImport.instance.mapRow( row( { employment_status: "" } ) ).employee.employmentStatus, "active" );
    } );

    it( "omits an absent optional date rather than writing an empty string", () => {
        const { employee } = organizationImport.instance.mapRow( row( { starting_date: "" } ) );
        assert.equal( Object.prototype.hasOwnProperty.call( employee.career, "startingDate" ), false );
    } );

    it( "rejects a date that is not ISO-8601", () => {
        const { error } = organizationImport.instance.mapRow( row( { starting_date: "14/03/2022" } ) );
        assert.equal( error.column, "starting_date" );
        assert.equal( error.code, "not-a-date" );
    } );

    it( "rejects a missing required column value", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { employee_id: "" } ) );
        assert.equal( employee, null );
        assert.equal( error.column, "employee_id" );
        assert.equal( error.code, "required" );
    } );

    it( "never echoes a personal field in the error message", () => {
        const { error } = organizationImport.instance.mapRow( row( { first_name: "", last_name: "Lovelace" } ) );
        assert.equal( error.message.includes( "Lovelace" ), false );
    } );

    // `mapRow` returns the FIRST error it finds, so the check order is part of its contract. Every case above breaks
    // one field in isolation, which would still pass if two adjacent checks were swapped. These pin the precedence.
    // Order is: required columns -> work_mode -> work_location -> employment_status -> stage -> dates.
    it( "reports a missing required column ahead of an invalid enum", () => {
        assert.equal( organizationImport.instance.mapRow( row( { employee_id: "", work_mode: "Casual" } ) ).error.column, "employee_id" );
    } );

    it( "reports an invalid work_mode ahead of an invalid work_location", () => {
        assert.equal( organizationImport.instance.mapRow( row( { work_mode: "Casual", work_location: "Moon" } ) ).error.column, "work_mode" );
    } );

    it( "reports an invalid work_location ahead of an invalid employment_status", () => {
        assert.equal( organizationImport.instance.mapRow( row( { work_location: "Moon", employment_status: "furloughed" } ) ).error.column, "work_location" );
    } );

    it( "reports an invalid employment_status ahead of a bad stage", () => {
        assert.equal( organizationImport.instance.mapRow( row( { employment_status: "furloughed", stage: "nope" } ) ).error.column, "employment_status" );
    } );

    it( "reports a bad stage ahead of a bad date", () => {
        assert.equal( organizationImport.instance.mapRow( row( { stage: "nope", starting_date: "14/03/2022" } ) ).error.column, "stage" );
    } );

    it( "reports birth_date ahead of starting_date when both are invalid", () => {
        assert.equal( organizationImport.instance.mapRow( row( { birth_date: "14/03/2022", starting_date: "14/03/2022" } ) ).error.column, "birth_date" );
    } );

} );

describe( "organizationImport.mapRows", () => {

    it( "separates mapped employees from per-row errors and keeps going after a bad row", () => {
        const { employees, errors } = organizationImport.instance.mapRows( [
            row( { __row: 2, employee_id: "1" } ),
            row( { __row: 3, employee_id: "2", stage: "nope" } ),
            row( { __row: 4, employee_id: "3" } )
        ] );
        assert.equal( employees.length, 2 );
        assert.equal( errors.length, 1 );
        assert.equal( errors[ 0 ].row, 3 );
    } );

} );
