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

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const employeeRules = require( "#employee-rules" );

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

    for ( const value of [ "toString", "constructor", "hasOwnProperty", "valueOf" ] ) {
        it( `rejects '${ value }' instead of matching it against Object.prototype's own member (CodeRabbit CA-109)`, () => {
            // `sites[ "toString" ]` resolves the inherited Object.prototype.toString and reads as "known" even
            // against an EMPTY nomenclature -- a bracket lookup on a plain object must never stand in for
            // membership. Object.hasOwn is what closes this off.
            assert.equal( employeeRules.instance.validateEmployee( employee( { workSite: value } ), CONTEXT ),
                "error.employee.invalid-work-site" );
        } );
    }

    it( "rejects any site when the context carries no nomenclature", () => {
        // A caller that forgets to pass workSites must fail closed, not silently accept every value.
        const withoutSites = { ...CONTEXT };
        delete withoutSites.workSites;
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

const organizationImport = require( "#organization-import" );

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

/*
 * Task 11 review fix (CA-109): #setFieldByPath in competence-web-application.js was briefly changed to CLEAR
 * personal.workSite / career.positionName by `delete`-ing the key from the outgoing object, on the theory that this
 * would make Employee Management produce the same shape the CSV importer produces (which also omits the key on a
 * blank cell -- see "blank cells cannot clear a stored value" above). That reasoning missed a consequence:
 * DataManager#saveEmployee persists through cache.editJSON, which issues a Redis JSON.MERGE -- RFC 7386 merge-patch
 * semantics, where a key ABSENT from the outgoing object is left untouched in storage, and only an explicit `null`
 * deletes it (the identical mechanism documented in application/organization-import.js:31-49). Deleting the key
 * made a "successful" clear silently keep the OLD stored value -- a phantom success. The fix (reverted in this same
 * commit) is for #setFieldByPath to keep writing an explicit empty string for these two fields, exactly as it
 * already did before that change, and exactly as it still does for every field NOT on the delete-on-clear
 * allowlist. The two describe blocks below pin, respectively, the underlying mechanism and the observable fix.
 */

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const dataManager = require( "#data-manager" );
const configurationLoader = require( "#configuration-loader" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

const MERGE_PATCH_EMPLOYEE_ID = "9001";

describe( "DataManager#saveEmployee — an omitted key is left untouched under merge-patch (CA-109 Task 11)", () => {

    beforeEach( () => {
        installInMemoryCache();
    } );

    it( "an outgoing record whose personal object omits workSite does not erase a stored one", async () => {
        await dataManager.instance.saveEmployee( {
            employeeID: MERGE_PATCH_EMPLOYEE_ID, email: "a@b.com", employmentStatus: "active",
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: "HQ" },
            career: { organizationUnitID: "1-1", roleFamily: "SE", level: "R", stage: 2 }
        } );

        // `personal` is present in this second patch, but its `workSite` key is entirely absent -- exactly the
        // shape `delete current[ lastPart ]` produces for a field on #setFieldByPath's delete-on-clear allowlist.
        await dataManager.instance.saveEmployee( {
            employeeID: MERGE_PATCH_EMPLOYEE_ID,
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site" }
        } );

        const stored = await dataManager.instance.fetchEmployee( MERGE_PATCH_EMPLOYEE_ID );
        assert.equal( stored.personal.workSite, "HQ",
            "an omitted key must be left untouched by the merge, never read as 'the caller wants this cleared'" );
    } );

    it( "an outgoing record whose career object omits positionName does not erase a stored one", async () => {
        await dataManager.instance.saveEmployee( {
            employeeID: MERGE_PATCH_EMPLOYEE_ID, email: "a@b.com", employmentStatus: "active",
            personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site" },
            career: { organizationUnitID: "1-1", roleFamily: "SE", level: "R", stage: 2, positionName: "Team Lead" }
        } );

        await dataManager.instance.saveEmployee( {
            employeeID: MERGE_PATCH_EMPLOYEE_ID,
            career: { organizationUnitID: "1-1", roleFamily: "SE", level: "R", stage: 2 }
        } );

        const stored = await dataManager.instance.fetchEmployee( MERGE_PATCH_EMPLOYEE_ID );
        assert.equal( stored.career.positionName, "Team Lead",
            "an omitted key must be left untouched by the merge, never read as 'the caller wants this cleared'" );
    } );

} );

describe( "Employee Management clear must actually reach the store (CA-109 Task 11 regression)", () => {

    const app = new CompetenceWebApplication( "test-employee-merge-patch-clear" );
    const SUPERVISOR_SESSION = { language: "en", user: { employeeID: "9999", roles: [ configurationLoader.roleCode.SUPERVISOR ] } };

    const seed = () => ( {
        employeeID: MERGE_PATCH_EMPLOYEE_ID, email: "merge.patch.clear@example.com", employmentStatus: "active",
        personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: "HQ" },
        career: { organizationUnitID: "1-1", roleFamily: "SE", specialization: "BACKEND", level: "R", stage: 2, positionName: "Team Lead" }
    } );

    beforeEach( async () => {
        installInMemoryCache();
        await dataManager.instance.saveEmployee( seed() );
    } );

    it( "clearing personal.workSite through update-employee overwrites the stored value", async () => {
        await app.processServiceRequest( SUPERVISOR_SESSION, "update-employee", {
            employeeID: MERGE_PATCH_EMPLOYEE_ID,
            fields: { "personal.workSite": "" }
        } );

        const stored = await dataManager.instance.fetchEmployee( MERGE_PATCH_EMPLOYEE_ID );
        // If personal.workSite were ever re-added to #setFieldByPath's delete-on-clear allowlist, the field would
        // be DELETED from the outgoing object instead of set to "" -- omitted from the saveEmployee() patch, and
        // therefore left untouched by the merge (see the describe block above). The stale "HQ" would silently
        // survive and this assertion would fail -- this is the exact CRITICAL defect Task 11's review caught.
        assert.equal( stored.personal.workSite, "", "the stored value must be overwritten, not left as 'HQ'" );
    } );

    it( "clearing career.positionName through update-employee overwrites the stored value", async () => {
        await app.processServiceRequest( SUPERVISOR_SESSION, "update-employee", {
            employeeID: MERGE_PATCH_EMPLOYEE_ID,
            fields: { "career.positionName": "" }
        } );

        const stored = await dataManager.instance.fetchEmployee( MERGE_PATCH_EMPLOYEE_ID );
        assert.equal( stored.career.positionName, "", "the stored value must be overwritten, not left as 'Team Lead'" );
    } );

} );

describe( "validateEmployee — stage against the ladder", () => {

    // The bound used to be a hard-coded 1-3 plus a list of single-stage rungs. That silently accepted T3 the
    // moment CA-111 gave T two sub-levels: nothing tied the check to the ladder that defines them. It is now
    // derived, so a rung gaining or losing a sub-level cannot leave the validator behind.
    const ladder = configurationLoader.getStageLevelLadder().reduce( ( map, entry ) => {
        map[ entry.code ] = entry.stages.length;
        return map;
    }, {} );

    for ( const [ level, count ] of Object.entries( ladder ) ) {
        it( `accepts every stage ${ level } declares and rejects the one past it`, () => {
            for ( let stage = 1; stage <= count; stage++ ) {
                assert.equal( employeeRules.instance.validateEmployee( employee( {}, { level: level, stage: stage } ), CONTEXT ), null,
                    `${ level }${ stage } is declared by the ladder and must be valid` );
            }
            assert.equal( employeeRules.instance.validateEmployee( employee( {}, { level: level, stage: count + 1 } ), CONTEXT ),
                "error.employee.invalid-stage-for-level", `${ level }${ count + 1 } is past what ${ level } declares` );
        } );
    }

    it( "rejects a zero, negative or non-integer stage outright", () => {
        for ( const stage of [ 0, -1, 1.5, "2", null ] ) {
            assert.equal( employeeRules.instance.validateEmployee( employee( {}, { level: "R", stage: stage } ), CONTEXT ),
                "error.employee.invalid-stage", `stage ${ JSON.stringify( stage ) } must be rejected` );
        }
    } );

} );
