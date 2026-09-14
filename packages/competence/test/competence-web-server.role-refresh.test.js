/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Per-request role derivation (`CompetenceWebServer#refreshSession`).
 *
 * Roles used to be derived once, in `augmentSession`, inside the login handler — and every gate in the application
 * reads `session.user.roles`. That made `#revokeSupervisor` advisory: it removed the grant from the store and the
 * in-memory mirror and wrote its audit entry, while the person being revoked kept org-wide read of every evaluation,
 * the consent register and the oversight screens until they chose to sign out. With a `rolling` session cookie, an
 * active user need never do that. A grant ADDED mid-session had the mirror-image problem and simply did not work.
 *
 * The org graph and the grant mirror are both in-memory and synchronous, which is what made deriving at login cheap
 * and makes deriving per request cheap for the same reason.
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

} );
