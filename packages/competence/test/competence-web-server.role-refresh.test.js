/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The two per-request session rules: what an acting employee may do (`refreshSession`), and whether they should be
 * signed in at all (`verifySession`).
 *
 * Roles used to be derived once, in `augmentSession`, inside the login handler — and every gate in the application
 * reads `session.user.roles`. That made `#revokeSupervisor` advisory: it removed the grant from the store and the
 * in-memory mirror and wrote its audit entry, while the person being revoked kept org-wide read of every evaluation,
 * the consent register and the oversight screens until they chose to sign out. With a `rolling` session cookie, an
 * active user need never do that. A grant ADDED mid-session had the mirror-image problem and simply did not work.
 *
 * `employmentStatus` had the same shape and needed a different answer: it was consulted only at sign-in, so
 * termination was a rule about the NEXT login rather than about access. Re-deriving roles does not close that on its
 * own — a terminated employee's roles are still the roles their position implies — so the rule lives in
 * `verifySession`, which the framework answers by destroying the session.
 *
 * Every input is in-memory and synchronous, which is what made deriving at login cheap and makes both checks cheap
 * per request for the same reason.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const organizationManager = require( "#organization-manager" );
const dataManager = require( "#data-manager" );
const identityResolver = require( "#identity-resolver" );
const configurationLoader = require( "#configuration-loader" );
const CompetenceWebServer = require( "../bin/competence-web-server.js" );
const serverConfig = require( "../bin/competence-web-server.json" );

const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );
const DataManagerPrototype = Object.getPrototypeOf( dataManager.instance );

const EMPLOYEE = configurationLoader.roleCode.EMPLOYEE;
const MANAGER = configurationLoader.roleCode.MANAGER;
const SUPERVISOR = configurationLoader.roleCode.SUPERVISOR;

const UNIT_MANAGER_ID = "8";      // manages a unit → MANAGER
const TOP_MANAGER_ID = "22";      // structural supervisor → SUPERVISOR
const PLAIN_ID = "1";             // neither
const DEPARTED_ID = "gone-from-the-chart";

// Constructed once. The constructor reads the web-server config and instantiates the web application manager; it
// performs no I/O and starts nothing, which is what makes the derived-roles method reachable from a unit test.
const server = new CompetenceWebServer( "ti-competence-role-refresh-test", serverConfig );

/**
 * Points the org graph and the grant mirror at a fixed set of facts. `grants` is live — a test mutates it to model a
 * grant being awarded or revoked between two requests.
 */
function stubOrgFacts( t, grants ) {
    t.mock.method( OrganizationManagerPrototype, "hasEmployee", ( employeeID ) => employeeID !== DEPARTED_ID );
    t.mock.method( OrganizationManagerPrototype, "isUnitManager", ( employeeID ) => employeeID === UNIT_MANAGER_ID );
    t.mock.method( OrganizationManagerPrototype, "isAutoSupervisor", ( employeeID ) => employeeID === TOP_MANAGER_ID );
    t.mock.method( DataManagerPrototype, "hasSupervisorGrant", ( employeeID ) => grants.has( employeeID ) );
}

/**
 * Shadows the `serviceConfig` getter (which lives on the prototype chain, so `t.mock.method` cannot reach it) with an
 * own property for the duration of one test.
 */
function stubAdmins( t, admins ) {
    Object.defineProperty( server, "serviceConfig", { value: { auth: { admins: admins } }, configurable: true, writable: true } );
    t.after( () => { delete server.serviceConfig; } );
}

/** One request: hand the session to the hook and report the roles it leaves behind. */
function afterRequest( user ) {
    const session = { user: user };
    server.refreshSession( session, {} );
    return session.user.roles;
}

describe( "CompetenceWebServer — per-request role derivation", () => {

    it( "drops a Supervisor role the moment the grant behind it is revoked", ( t ) => {
        const grants = new Set( [ UNIT_MANAGER_ID ] );
        stubOrgFacts( t, grants );

        const user = { userID: "login:8", employeeID: UNIT_MANAGER_ID, roles: [ EMPLOYEE, MANAGER, SUPERVISOR ] };
        assert.deepEqual( afterRequest( user ), [ EMPLOYEE, MANAGER, SUPERVISOR ], "still granted, so nothing changes" );

        grants.delete( UNIT_MANAGER_ID );   // #revokeSupervisor removes the grant from the mirror

        assert.deepEqual( afterRequest( user ), [ EMPLOYEE, MANAGER ],
            "the revoked Supervisor must lose org-wide access on the next request, not at their next sign-in" );
    } );

    it( "adds a Supervisor role the moment the grant is awarded", ( t ) => {
        const grants = new Set();
        stubOrgFacts( t, grants );

        const user = { userID: "login:1", employeeID: PLAIN_ID, roles: [ EMPLOYEE ] };
        assert.deepEqual( afterRequest( user ), [ EMPLOYEE ] );

        grants.add( PLAIN_ID );

        assert.deepEqual( afterRequest( user ), [ EMPLOYEE, SUPERVISOR ] );
    } );

    it( "drops MANAGER when the employee no longer manages a unit", ( t ) => {
        stubOrgFacts( t, new Set() );

        // A reorganization took the unit away; the session still claims MANAGER from sign-in.
        const roles = afterRequest( { userID: "login:1", employeeID: PLAIN_ID, roles: [ EMPLOYEE, MANAGER ] } );

        assert.deepEqual( roles, [ EMPLOYEE ] );
    } );

    it( "keeps a structural Supervisor, who holds the role by position rather than by grant", ( t ) => {
        stubOrgFacts( t, new Set() );

        const roles = afterRequest( { userID: "login:22", employeeID: TOP_MANAGER_ID, roles: [ EMPLOYEE, SUPERVISOR ] } );

        assert.deepEqual( roles, [ EMPLOYEE, SUPERVISOR ] );
    } );

    it( "fails closed for an employee who has left the organization chart", ( t ) => {
        stubOrgFacts( t, new Set( [ DEPARTED_ID ] ) );

        const roles = afterRequest( { userID: "login:gone", employeeID: DEPARTED_ID, roles: [ EMPLOYEE, MANAGER, SUPERVISOR ] } );

        assert.deepEqual( roles, [], "an identity that cannot be placed cannot be granted authority — not even by a stale grant" );
    } );

    it( "leaves the framework's admin role alone, and does not churn it on every request", ( t ) => {
        stubOrgFacts( t, new Set() );

        // This application owns the numeric role codes only. Stripping `admin` and letting `applyAdminRole` restore
        // it would work, but would rewrite an administrator's roles on every request and report each as a change.
        const adminOnly = afterRequest( { userID: "admin@example.com", employeeID: null, roles: [ "admin" ] } );
        assert.deepEqual( adminOnly, [ "admin" ] );

        const managerAdmin = afterRequest( { userID: "login:8", employeeID: UNIT_MANAGER_ID, roles: [ EMPLOYEE, MANAGER, "admin" ] } );
        assert.deepEqual( managerAdmin, [ EMPLOYEE, MANAGER, "admin" ] );
    } );

    it( "leaves a dev test-user session whose roles were pinned by the cookie override", ( t ) => {
        stubOrgFacts( t, new Set() );

        const roles = afterRequest( { userID: "login:1", employeeID: PLAIN_ID, roles: [ SUPERVISOR ], rolesPinned: true } );

        assert.deepEqual( roles, [ SUPERVISOR ],
            "re-deriving would defeat the override on the request after login, which is the whole point of the panel" );
    } );

    it( "does nothing to a session that carries no user", () => {
        const session = { csrfToken: "t" };
        assert.doesNotThrow( () => server.refreshSession( session, {} ) );
        assert.equal( session.user, undefined );
    } );

} );

describe( "IdentityResolver — pinning the dev role override", () => {

    it( "marks roles the test-user cookie chose outright", () => {
        const session = { user: {} };
        identityResolver.instance.applyIdentity( session, { employeeID: "1", overrideRoles: [ SUPERVISOR ], adminOnly: false, reason: null }, () => [ EMPLOYEE ] );

        assert.deepEqual( session.user.roles, [ SUPERVISOR ] );
        assert.equal( session.user.rolesPinned, true );
    } );

    it( "leaves derived roles unpinned, so a test user without a role override still tracks the org chart", () => {
        const session = { user: {} };
        identityResolver.instance.applyIdentity( session, { employeeID: "1", overrideRoles: null, adminOnly: false, reason: null }, () => [ EMPLOYEE, MANAGER ] );

        assert.deepEqual( session.user.roles, [ EMPLOYEE, MANAGER ] );
        assert.equal( session.user.rolesPinned, undefined );
    } );

    it( "marks a cookie-chosen IDENTITY separately from a cookie-chosen role set", () => {
        // The cookie can override the identity without overriding the roles, and the two markers answer different
        // questions: rolesPinned stops re-derivation, testUserIdentity waives the employment-status rule.
        const identityOnly = { user: {} };
        identityResolver.instance.applyIdentity( identityOnly, { employeeID: "1", overrideRoles: null, adminOnly: false, reason: null, viaTestUser: true }, () => [ EMPLOYEE ] );
        assert.equal( identityOnly.user.testUserIdentity, true );
        assert.equal( identityOnly.user.rolesPinned, undefined, "roles were derived, so nothing is pinned" );

        const emailIdentity = { user: {} };
        identityResolver.instance.applyIdentity( emailIdentity, { employeeID: "1", overrideRoles: null, adminOnly: false, reason: null }, () => [ EMPLOYEE ] );
        assert.equal( emailIdentity.user.testUserIdentity, undefined, "an e-mail sign-in claims no waiver" );
    } );

    it( "marks an identity the resolver admitted through the cookie branch", () => {
        const outcome = identityResolver.instance.resolve( {
            testUserEnabled: true,
            testUserCookie: encodeURIComponent( JSON.stringify( { employeeID: "1" } ) ),
            lookupByEmail: () => null,
            employeeExists: () => true
        } );

        assert.equal( outcome.viaTestUser, true );
        assert.equal( outcome.employeeID, "1" );
    } );

    it( "does not mark an identity resolved from the authenticated e-mail", () => {
        const outcome = identityResolver.instance.resolve( {
            email: "someone@example.com",
            lookupByEmail: () => ( { employeeID: "1", employmentStatus: "active" } ),
            employeeExists: () => true
        } );

        assert.equal( outcome.viaTestUser, false );
    } );

} );

describe( "CompetenceWebServer — a session must stay entitled to exist", () => {

    // Termination was a rule about the NEXT login, not about access: `employmentStatus` was consulted only at
    // sign-in, so someone whose record moved to `terminated` kept the session they already had — and with a rolling
    // cookie an active user's session need never expire. Per-request role derivation does not close this on its own,
    // because a terminated employee's roles are still the roles their position implies. The question is not what they
    // may do but whether they should be signed in at all, which is `verifySession`; the framework destroys a session
    // this refuses.

    function stubStatus( t, statusByID ) {
        t.mock.method( OrganizationManagerPrototype, "hasEmployee", ( employeeID ) => Object.hasOwn( statusByID, employeeID ) );
        t.mock.method( OrganizationManagerPrototype, "resolveEmploymentStatus", ( employeeID ) => statusByID[ employeeID ] );
    }

    const sessionFor = ( employeeID ) => ( { user: { userID: `login:${ employeeID }`, employeeID: employeeID, roles: [ EMPLOYEE ] } } );

    it( "keeps an active employee signed in", ( t ) => {
        stubStatus( t, { "1": "active" } );
        assert.equal( server.verifySession( sessionFor( "1" ) ), true );
    } );

    it( "keeps an employee on leave signed in", ( t ) => {
        stubStatus( t, { "1": "on-leave" } );
        assert.equal( server.verifySession( sessionFor( "1" ) ), true, "being away is not being gone" );
    } );

    it( "ends the session of an employee who has been terminated", ( t ) => {
        stubStatus( t, { "1": "terminated" } );
        assert.equal( server.verifySession( sessionFor( "1" ) ), false );
    } );

    it( "ends the session of an employee who has left the organization chart", ( t ) => {
        stubStatus( t, {} );
        assert.equal( server.verifySession( sessionFor( "1" ) ), false );
    } );

    it( "refuses a status it does not recognise, and one that is absent", ( t ) => {
        // Fail closed: a status added to the employee schema is not admissible until it is deliberately listed.
        stubStatus( t, { "1": "sabbatical", "2": undefined, "3": "" } );
        assert.equal( server.verifySession( sessionFor( "1" ) ), false );
        assert.equal( server.verifySession( sessionFor( "2" ) ), false );
        assert.equal( server.verifySession( sessionFor( "3" ) ), false );
    } );

    it( "keeps an administrator with no employee record while they are still allowlisted", ( t ) => {
        stubStatus( t, {} );
        stubAdmins( t, [ "admin@example.com" ] );
        // No employment status to judge, and theirs is the access that exists to repair the employee data.
        assert.equal( server.verifySession( { user: { userID: "admin@example.com", employeeID: null, roles: [ "admin" ] } } ), true );
    } );

    it( "ends the session of an administrator removed from the allowlist", ( t ) => {
        stubStatus( t, {} );
        stubAdmins( t, [ "someone-else@example.com" ] );

        // The no-employeeID branch has to re-ask the allowlist rather than trust it was true at sign-in. It reads the
        // config directly rather than the session's `admin` role because resourceProtectionHandler runs ahead of the
        // refresh middleware that reconciles that role, so the role on the session is a request behind.
        assert.equal( server.verifySession( { user: { userID: "admin@example.com", employeeID: null, roles: [ "admin" ] } } ), false );
    } );

    it( "ends a no-employeeID session that was never an administrator", ( t ) => {
        stubStatus( t, {} );
        stubAdmins( t, [] );

        assert.equal( server.verifySession( { user: { userID: "nobody@example.com", employeeID: null, roles: [] } } ), false );
    } );

    it( "honours the dev test-user waiver of the employment-status rule while the flag is on", ( t ) => {
        stubStatus( t, { "1": "terminated" } );
        const previous = process.env.COMPETENCE_TEST_USER_ENABLED;
        t.after( () => { process.env.COMPETENCE_TEST_USER_ENABLED = previous === undefined ? "" : previous; } );

        // IdentityResolver's cookie branch deliberately admits an employee whatever their status, so a terminated one
        // stays testable. Without the waiver here the panel would break: sign-in succeeds, then the first protected
        // request destroys the session.
        process.env.COMPETENCE_TEST_USER_ENABLED = "true";
        assert.equal( server.verifySession( { user: { userID: "login:1", employeeID: "1", roles: [ EMPLOYEE ], testUserIdentity: true } } ), true );

        // Re-checked against the LIVE flag, not just the marker stamped at sign-in.
        process.env.COMPETENCE_TEST_USER_ENABLED = "false";
        assert.equal( server.verifySession( { user: { userID: "login:1", employeeID: "1", roles: [ EMPLOYEE ], testUserIdentity: true } } ), false );
    } );

    it( "still requires a test-user identity to exist in the organization chart", ( t ) => {
        stubStatus( t, {} );
        const previous = process.env.COMPETENCE_TEST_USER_ENABLED;
        t.after( () => { process.env.COMPETENCE_TEST_USER_ENABLED = previous === undefined ? "" : previous; } );
        process.env.COMPETENCE_TEST_USER_ENABLED = "true";

        // Only the STATUS rule is waived; the cookie branch checks existence too, and so does this.
        assert.equal( server.verifySession( { user: { userID: "login:1", employeeID: "1", roles: [ EMPLOYEE ], testUserIdentity: true } } ), false );
    } );

    it( "does not waive the rule for an ordinary session, flag on or not", ( t ) => {
        stubStatus( t, { "1": "terminated" } );
        const previous = process.env.COMPETENCE_TEST_USER_ENABLED;
        t.after( () => { process.env.COMPETENCE_TEST_USER_ENABLED = previous === undefined ? "" : previous; } );
        process.env.COMPETENCE_TEST_USER_ENABLED = "true";

        assert.equal( server.verifySession( sessionFor( "1" ) ), false, "an e-mail session has no waiver to claim" );
    } );

    it( "refuses a session with no user at all", () => {
        assert.equal( server.verifySession( { csrfToken: "t" } ), false );
        assert.equal( server.verifySession( undefined ), false );
    } );

    it( "uses the same admissible-status rule as sign-in, so the two cannot drift", () => {
        const permitted = [ "active", "on-leave" ];
        const refused = [ "terminated", "sabbatical", "", undefined, null ];

        permitted.forEach( ( status ) => assert.equal( identityResolver.instance.isLoginPermittedStatus( status ), true, status ) );
        refused.forEach( ( status ) => assert.equal( identityResolver.instance.isLoginPermittedStatus( status ), false, String( status ) ) );
    } );

} );
