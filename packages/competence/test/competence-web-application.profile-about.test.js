/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Coverage for the Profile and About screen descriptors (CA-99).
 *
 * Both are public methods on the web application, so they are driven directly — and, for the Profile, also through
 * the `processDataRequest( session, "profile" )` dispatcher a request actually takes. Persistence and the org chart
 * are stubbed on their prototypes (obtained through the exported frozen `instance`, whose prototype is still
 * writable), so there is no Redis, no Express and no session store involved.
 *
 * The behaviour that matters here: the profile is SELF-scoped and ungated — an ordinary employee who cannot open
 * Employee Management must still be able to read their own record — and it mirrors that screen's Details tab
 * field-for-field, read-only.
 */

const path = require( "node:path" );

// Load the app's own label catalogue before core's localization module initializes, so the assertions below can
// check the DISPLAY text a user sees rather than the label keys behind it — a descriptor that reaches the client
// carrying "!!! label not found !!!" is exactly the failure worth catching. `localization.js` resolves the
// configured path against `process.cwd()`, which differs between `npm test` at the workspace root and inside the
// package, hence the relative form. (Mirrors `packages/core/test/message-hash.test.js`, which seeds a TI_* variable
// the same way.)
process.env.TI_LOCALIZATION_LABELS_PATH = path.relative(
    process.cwd(),
    path.join( __dirname, "..", "bin", "localization", "competence-labels.json" )
);

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const exceptions = require( "@ti-engine/core/exceptions" );
const dataManager = require( "#data-manager" );
const organizationManager = require( "#organization-manager" );
const configurationLoader = require( "#configuration-loader" );
const CompetenceWebApplication = require( "../bin/competence-web-application.js" );

const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );
const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );

const EMPLOYEE_ID = "4711";

const EMPLOYEE = {
    employeeID: EMPLOYEE_ID,
    email: "geatrks.frkats@example.com",
    employmentStatus: "active",
    personal: { firstName: "Geatrks", lastName: "Frkats", workMode: "Full-time", workLocation: "On-site" },
    career: { organizationUnitID: "1-1", roleFamily: "SE", specialization: "BACKEND", level: "R", stage: "2", startingDate: "2022-03-14" }
};

function session( roles ) {
    return { language: "en", user: { employeeID: EMPLOYEE_ID, name: "Geatrks Frkats", roles: roles || [ configurationLoader.roleCode.EMPLOYEE ] } };
}

/**
 * Stubs everything the profile projection reads, so a test only states the employee record it cares about.
 *
 * @param {Object} t The node:test context (its mocks are restored automatically).
 * @param {Object} [overrides]
 */
function stubStores( t, overrides = {} ) {
    const employee = overrides.employee !== undefined ? overrides.employee : EMPLOYEE;
    t.mock.method( DataManagerPrototype, "fetchEmployee", () => {
        return employee
            ? Promise.resolve( employee )
            : Promise.reject( exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, { details: "gone" } ) );
    } );
    t.mock.method( DataManagerPrototype, "hasSupervisorGrant", () => overrides.hasGrant === true );
    t.mock.method( OrganizationManagerPrototype, "isAutoSupervisor", () => overrides.isAutoSupervisor === true );
    t.mock.method( OrganizationManagerPrototype, "resolveEmployeeOrganizationContext", () => ( {
        organizationUnitName: "Engineering",
        managerID: "20",
        managerName: "Mrfgutr Asrtguvs"
    } ) );
}

/**
 * Flattens every section item into one label → value map.
 *
 * @param {Array} sections
 * @returns {Map<string, Object>}
 */
function itemsByLabel( sections ) {
    const map = new Map();
    sections.forEach( ( section ) => section.items.forEach( ( item ) => map.set( item.label, item ) ) );
    return map;
}

describe( "CompetenceWebApplication.getProfileInfo — the signed-in employee's own record (CA-99)", () => {

    const app = new CompetenceWebApplication( "test-competence-profile" );

    it( "is dispatched from processDataRequest for the `profile` view", async ( t ) => {
        stubStores( t );
        const result = await app.processDataRequest( session(), "profile" );
        assert.equal( result.identity.name, "Geatrks Frkats" );
    } );

    it( "reads the session user's own record and nothing else", async ( t ) => {
        stubStores( t );
        await app.getProfileInfo( session() );
        const fetched = DataManagerPrototype.fetchEmployee.mock.calls.map( ( call ) => call.arguments[ 0 ] );
        assert.deepEqual( fetched, [ EMPLOYEE_ID ] );
    } );

    it( "serves an ordinary employee who holds no management role", async ( t ) => {
        // The management screen requires MANAGER/SUPERVISOR; reading your own profile deliberately does not.
        stubStores( t );
        const profile = await app.getProfileInfo( session( [ configurationLoader.roleCode.EMPLOYEE ] ) );
        assert.ok( profile.sections.length > 0 );
    } );

    it( "builds the identity header the Employee Management detail head shows", async ( t ) => {
        stubStores( t );
        const { identity } = await app.getProfileInfo( session() );
        assert.equal( identity.name, "Geatrks Frkats" );
        assert.equal( identity.subtitle, "Software Engineering · Backend · Engineering" );
        assert.equal( identity.caption, "geatrks.frkats@example.com" );
        assert.equal( identity.avatarSeed, EMPLOYEE_ID );
        assert.equal( identity.badge.text, "R2" );
        const tagTexts = identity.tags.map( ( tag ) => tag.text );
        assert.deepEqual( tagTexts, [ "Active", EMPLOYEE_ID ] );
        assert.equal( identity.tags[ 0 ].tone, "success" );
    } );

    it( "flags a structural supervisor differently from a granted one", async ( t ) => {
        stubStores( t, { isAutoSupervisor: true } );
        const structural = await app.getProfileInfo( session() );
        assert.equal( structural.identity.tags[ 2 ].text, "Supervisor · structural" );

        t.mock.restoreAll();
        stubStores( t, { hasGrant: true } );
        const granted = await app.getProfileInfo( session() );
        assert.equal( granted.identity.tags[ 2 ].text, "Supervisor · assigned" );
    } );

    it( "mirrors the Details tab: personal, career, organization and employment, in that order", async ( t ) => {
        stubStores( t );
        const { sections } = await app.getProfileInfo( session() );
        assert.deepEqual( sections.map( ( section ) => section.title ), [ "Personal", "Career", "Organization", "Employment" ] );
    } );

    it( "resolves every value to its display form rather than its stored code", async ( t ) => {
        stubStores( t );
        const items = itemsByLabel( ( await app.getProfileInfo( session() ) ).sections );
        assert.equal( items.get( "First name" ).value, "Geatrks" );
        assert.equal( items.get( "Last name" ).value, "Frkats" );
        assert.equal( items.get( "Corporate email" ).value, "geatrks.frkats@example.com" );
        assert.equal( items.get( "Work mode" ).value, "Full-time" );
        assert.equal( items.get( "Work location" ).value, "On-site" );
        assert.equal( items.get( "Role family" ).value, "Software Engineering" );
        assert.equal( items.get( "Specialization" ).value, "Backend" );
        assert.equal( items.get( "Hire date" ).value, "2022-03-14" );
        assert.equal( items.get( "Organization unit" ).value, "Engineering" );
        assert.equal( items.get( "Reports to" ).value, "Mrfgutr Asrtguvs" );
        assert.equal( items.get( "Employment status" ).value, "Active" );
    } );

    it( "names the session's roles instead of printing their numeric codes", async ( t ) => {
        stubStores( t );
        const roles = [ configurationLoader.roleCode.EMPLOYEE, configurationLoader.roleCode.MANAGER, "admin" ];
        const items = itemsByLabel( ( await app.getProfileInfo( session( roles ) ) ).sections );
        assert.equal( items.get( "Roles in the appraisal process" ).value, "Employee · Manager · Administrator" );
    } );

    it( "localizes the whole descriptor from the session language", async ( t ) => {
        stubStores( t );
        const bg = { language: "bg", user: { employeeID: EMPLOYEE_ID, roles: [ configurationLoader.roleCode.EMPLOYEE ] } };
        const { sections } = await app.getProfileInfo( bg );
        assert.deepEqual( sections.map( ( section ) => section.title ), [ "Лични данни", "Кариера", "Организация", "Трудов договор" ] );
    } );

    it( "falls back to the framework's account sections when the user has no employee record", async ( t ) => {
        // A signed-in user without an employee record still has an account worth showing — this must not 404.
        stubStores( t, { employee: null } );
        const profile = await app.getProfileInfo( session() );
        assert.deepEqual( profile.sections.map( ( section ) => section.title ), [ "Account", "Access" ] );
    } );

    it( "translates that fallback too, rather than serving a half-Bulgarian panel", async ( t ) => {
        // The framework's account sections resolve ITS keys, which live in web-server-labels.json — a catalogue
        // this app never loads (one labels path, its own). Without these keys mirrored here the whole panel would
        // render in English except the one label competence happened to define, which reads as a bug, not a
        // fallback. This is the guard for that.
        stubStores( t, { employee: null } );
        const bg = { language: "bg", user: { employeeID: EMPLOYEE_ID, roles: [ configurationLoader.roleCode.EMPLOYEE ] } };
        const { sections } = await app.getProfileInfo( bg );
        assert.deepEqual( sections.map( ( section ) => section.title ), [ "Акаунт", "Достъп" ] );
        const items = itemsByLabel( sections );
        assert.ok( items.has( "Име" ) && items.has( "Потребителско име" ) && items.has( "Имейл" ) );
        assert.ok( items.has( "Роли в процеса по оценяване" ) );
        // Nothing may still be sitting on the framework's English literal.
        [ "Account", "Access", "Full name", "Username", "E-mail", "User ID", "Language", "Roles" ].forEach( ( english ) => {
            assert.ok( !items.has( english ), `"${ english }" is still untranslated in the Bulgarian fallback` );
        } );
    } );

    it( "rejects (401) when the session carries no employee identity", async ( t ) => {
        stubStores( t );
        await assert.rejects(
            app.getProfileInfo( { user: { roles: [] } } ),
            ( error ) => {
                assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
                assert.equal( error.httpCode, exceptions.httpCode.C_401 );
                return true;
            }
        );
    } );

} );

describe( "CompetenceWebApplication.getApplicationInfo — deployment facts (CA-99)", () => {

    const app = new CompetenceWebApplication( "test-competence-about" );

    it( "keeps the framework baseline and appends a deployment section", async ( t ) => {
        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( { cycleID: "2026-H2", name: "Autumn '26 cycle", status: configurationLoader.cycleStatus.ACTIVE } ) );

        const info = await app.getApplicationInfo( session() );
        assert.equal( info.packageName, "@ti-engine/competence" );
        assert.ok( info.components.some( ( component ) => component.name === "@ti-engine/core" ) );

        const deployment = info.sections.find( ( section ) => section.title === "This deployment" );
        const items = itemsByLabel( [ deployment ] );
        assert.equal( items.get( "Current cycle" ).value, "Autumn '26 cycle" );
        assert.equal( items.get( "Cycle status" ).value, "Active" );
        assert.ok( Number( items.get( "Competencies defined" ).value ) > 0 );
        assert.equal( items.get( "Role families" ).value, String( Object.keys( configurationLoader.configRoleFamilies ).length ) );
    } );

    it( "still renders when no cycle can be resolved", async ( t ) => {
        // The About screen is informational — a store that cannot answer must not take it down.
        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.reject( new Error( "cache unavailable" ) ) );
        t.mock.method( DataManagerPrototype, "getAllCycles", () => Promise.reject( new Error( "cache unavailable" ) ) );

        const info = await app.getApplicationInfo( session() );
        const deployment = info.sections.find( ( section ) => section.title === "This deployment" );
        assert.equal( itemsByLabel( [ deployment ] ).get( "Current cycle" ).value, "" );
    } );

    it( "withholds runtime facts from a non-admin and attaches them for an admin", async ( t ) => {
        t.mock.method( DataManagerPrototype, "getActiveCycle", () => Promise.resolve( null ) );
        t.mock.method( DataManagerPrototype, "getAllCycles", () => Promise.resolve( [] ) );

        assert.equal( ( await app.getApplicationInfo( session() ) ).runtime, null );
        assert.equal( ( await app.getApplicationInfo( session( [ "admin" ] ) ) ).runtime.node, process.version );
    } );

} );
