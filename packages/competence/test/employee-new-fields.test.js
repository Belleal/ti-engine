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

const organizationImport = require( "../application/organization-import" );

const row = ( overrides ) => ( {
    __row: 2,
    employee_id: "1", email: "a@b.com", first_name: "A", last_name: "B",
    work_mode: "Full-time", work_location: "On-site",
    organization_unit_id: "1", role_family: "SE", level: "R", stage: "2",
    ...overrides
} );

describe( "mapRow — work_site and position_name", () => {

    it( "carries a supplied work_site through verbatim", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { work_site: "HQ" } ) );
        assert.equal( error, null );
        assert.equal( employee.personal.workSite, "HQ" );
    } );

    it( "OMITS workSite entirely when the cell is blank", () => {
        // Not an explicit null. Redis JSON.MERGE is RFC 7386 merge-patch: an omitted key is left untouched, while
        // an explicit null DELETES it. Omitting is what makes "blank leaves the stored value alone" true.
        const { employee } = organizationImport.instance.mapRow( row( { work_site: "   " } ) );
        assert.equal( Object.hasOwn( employee.personal, "workSite" ), false );
    } );

    it( "carries position_name through verbatim, trimmed", () => {
        const { employee } = organizationImport.instance.mapRow( row( { position_name: "  Старши експерт  " } ) );
        assert.equal( employee.career.positionName, "Старши експерт" );
    } );

    it( "OMITS positionName when the cell is blank", () => {
        const { employee } = organizationImport.instance.mapRow( row( { position_name: "" } ) );
        assert.equal( Object.hasOwn( employee.career, "positionName" ), false );
    } );

    it( "does not require either column", () => {
        const { employee, error } = organizationImport.instance.mapRow( row() );
        assert.equal( error, null );
        assert.equal( Object.hasOwn( employee.personal, "workSite" ), false );
        assert.equal( Object.hasOwn( employee.career, "positionName" ), false );
    } );

    it( "lists both as optional columns, never required", () => {
        assert.equal( organizationImport.instance.COLUMNS.optional.includes( "work_site" ), true );
        assert.equal( organizationImport.instance.COLUMNS.optional.includes( "position_name" ), true );
        assert.equal( organizationImport.instance.COLUMNS.required.includes( "work_site" ), false );
        assert.equal( organizationImport.instance.COLUMNS.required.includes( "position_name" ), false );
    } );

} );

describe( "mapRow — gender", () => {

    it( "accepts M and F", () => {
        assert.equal( organizationImport.instance.mapRow( row( { gender: "M" } ) ).employee.personal.gender, "M" );
        assert.equal( organizationImport.instance.mapRow( row( { gender: "F" } ) ).employee.personal.gender, "F" );
    } );

    it( "upper-cases a lower-case cell", () => {
        // Mechanical normalization — trim and case — is permitted. This is not a synonym table.
        assert.equal( organizationImport.instance.mapRow( row( { gender: " f " } ) ).employee.personal.gender, "F" );
    } );

    it( "omits gender when the cell is blank", () => {
        const { employee, error } = organizationImport.instance.mapRow( row( { gender: "" } ) );
        assert.equal( error, null );
        assert.equal( Object.hasOwn( employee.personal, "gender" ), false );
    } );

    it( "rejects 'Male' rather than guessing it meant M", () => {
        // Guessing what a value meant is how a person is silently recorded wrong. The module has no synonym table
        // for work_mode or work_location either.
        const { employee, error } = organizationImport.instance.mapRow( row( { gender: "Male" } ) );
        assert.equal( employee, null );
        assert.equal( error.column, "gender" );
        assert.equal( error.code, "not-a-permitted-value" );
        assert.match( error.message, /M, F/ );
    } );

    it( "names no cell value other than the column in the rejection", () => {
        const { error } = organizationImport.instance.mapRow( row( { gender: "Жена" } ) );
        assert.equal( error.message.includes( "Жена" ), false );
    } );

} );

describe( "blank cells cannot clear a stored value", () => {

    it( "lists work_site and position_name among the leave-unchanged fields", () => {
        // A record already carrying either must re-import as `unchanged`, not reclassify as `update` forever.
        const stored = {
            employeeID: "1", email: "a@b.com", employmentStatus: "active",
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: "HQ" },
            career: { organizationUnitID: "1", roleFamily: "SE", specialization: null, level: "R", stage: 2, positionName: "Expert" }
        };
        const { employee } = organizationImport.instance.mapRow( row() );
        const plan = organizationImport.instance.reconcile( [ employee ], [ stored ], {
            roleFamilies: { SE: { specializations: {} } },
            organizationStructure: { "1": { id: "1" } },
            workSites: { HQ: { id: "HQ", type: "office", name: { en: "HQ", bg: "HQ" } } }
        } );
        assert.equal( plan.unchanged.length, 1, "a blank cell must not read as a change" );
        assert.equal( plan.update.length, 0 );
    } );

} );
