/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const identityResolver = require( "#identity-resolver" );

const resolver = identityResolver.instance;

// A directory double: email -> record, plus the set of known employee IDs.
function directory( { records = {}, ambiguous = [] } = {} ) {
    return {
        lookupByEmail: ( email ) => {
            if ( ambiguous.includes( email ) ) {
                return { ambiguous: true };
            }
            return records[ email ] || null;
        },
        employeeExists: ( employeeID ) => Object.values( records ).some( ( record ) => record.employeeID === employeeID )
    };
}

const DIRECTORY = directory( {
    records: {
        "ada@example.com": { employeeID: "11", employmentStatus: "active" },
        "grace@example.com": { employeeID: "12", employmentStatus: "on-leave" },
        "alan@example.com": { employeeID: "13", employmentStatus: "terminated" },
        "edsger@example.com": { employeeID: "14", employmentStatus: "seconded" }
    },
    ambiguous: [ "twins@example.com" ]
} );

describe( "identityResolver.parseTestUserCookie", () => {

    it( "parses a URI-encoded selection", () => {
        const raw = encodeURIComponent( JSON.stringify( { employeeID: "22", roles: [ 1, 2, 3 ] } ) );
        assert.deepEqual( resolver.parseTestUserCookie( raw ), { employeeID: "22", roles: [ 1, 2, 3 ] } );
    } );

    it( "returns an empty roles array when the cookie carries no override", () => {
        const raw = encodeURIComponent( JSON.stringify( { employeeID: "22" } ) );
        assert.deepEqual( resolver.parseTestUserCookie( raw ), { employeeID: "22", roles: [] } );
    } );

    it( "drops non-numeric roles rather than trusting them", () => {
        const raw = encodeURIComponent( JSON.stringify( { employeeID: "22", roles: [ 1, "admin", null, 3 ] } ) );
        assert.deepEqual( resolver.parseTestUserCookie( raw ), { employeeID: "22", roles: [ 1, 3 ] } );
    } );

    it( "returns null for malformed or empty values", () => {
        assert.equal( resolver.parseTestUserCookie( "not-json" ), null );
        assert.equal( resolver.parseTestUserCookie( "" ), null );
        assert.equal( resolver.parseTestUserCookie( undefined ), null );
        assert.equal( resolver.parseTestUserCookie( encodeURIComponent( JSON.stringify( { roles: [ 1 ] } ) ) ), null );
    } );

} );

describe( "identityResolver.resolve — email identity", () => {

    it( "resolves an active employee by email", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com" }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11" );
        assert.equal( outcome.reason, null );
        assert.equal( outcome.adminOnly, false );
    } );

    it( "matches case-insensitively and ignores surrounding whitespace", () => {
        const outcome = resolver.resolve( Object.assign( { email: "  ADA@Example.COM  " }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11" );
    } );

    it( "admits an employee who is on leave", () => {
        const outcome = resolver.resolve( Object.assign( { email: "grace@example.com" }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "12" );
        assert.equal( outcome.reason, null );
    } );

    it( "refuses a terminated employee", () => {
        const outcome = resolver.resolve( Object.assign( { email: "alan@example.com" }, DIRECTORY ) );
        assert.equal( outcome.employeeID, null );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.TERMINATED );
    } );

    it( "refuses an unrecognized employment status, failing closed", () => {
        const outcome = resolver.resolve( Object.assign( { email: "edsger@example.com" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.TERMINATED );
    } );

    it( "refuses an identity with no matching record", () => {
        const outcome = resolver.resolve( Object.assign( { email: "nobody@example.com" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.NO_RECORD );
    } );

    it( "refuses an identity carrying no email at all", () => {
        const outcome = resolver.resolve( Object.assign( { email: "" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.NO_EMAIL );
    } );

    it( "refuses an ambiguous email rather than guessing between records", () => {
        const outcome = resolver.resolve( Object.assign( { email: "twins@example.com" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.AMBIGUOUS_EMAIL );
    } );

} );

describe( "identityResolver.resolve — admin exception", () => {

    it( "admits an allowlisted admin with no employee record, with no employeeID and no roles", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ops@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.adminOnly, true );
        assert.equal( outcome.employeeID, null );
        assert.equal( outcome.reason, null );
    } );

    it( "admits an allowlisted admin whose record is terminated", () => {
        const outcome = resolver.resolve( Object.assign( { email: "alan@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.adminOnly, true );
        assert.equal( outcome.reason, null );
    } );

    it( "admits an allowlisted admin whose email is ambiguous", () => {
        const outcome = resolver.resolve( Object.assign( { email: "twins@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.adminOnly, true );
    } );

    it( "prefers a real employee record over the admin exception", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11" );
        assert.equal( outcome.adminOnly, false );
    } );

} );

describe( "identityResolver.resolve — dev test-user cookie", () => {

    const cookie = encodeURIComponent( JSON.stringify( { employeeID: "12", roles: [ 1, 2 ] } ) );

    it( "ignores the cookie entirely when the flag is off", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: cookie, testUserEnabled: false }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11", "the email identity must win when the dev flag is off" );
        assert.equal( outcome.overrideRoles, null );
    } );

    it( "honors the cookie identity and role override when the flag is on", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: cookie, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "12" );
        assert.deepEqual( outcome.overrideRoles, [ 1, 2 ] );
    } );

    it( "derives roles when the cookie names an identity without a role override", () => {
        const identityOnly = encodeURIComponent( JSON.stringify( { employeeID: "12" } ) );
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: identityOnly, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "12" );
        assert.equal( outcome.overrideRoles, null, "an absent override must fall through to derived roles" );
    } );

    it( "refuses a cookie naming an employee who does not exist, so a dev typo is visible", () => {
        const missing = encodeURIComponent( JSON.stringify( { employeeID: "999" } ) );
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: missing, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.NO_RECORD );
    } );

    it( "does not gate the cookie on employment status, so a terminated employee stays testable", () => {
        const terminated = encodeURIComponent( JSON.stringify( { employeeID: "13" } ) );
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: terminated, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "13" );
        assert.equal( outcome.reason, null );
    } );

} );

describe( "identityResolver.applyIdentity", () => {

    it( "writes the resolved identity and derived roles onto the session", () => {
        const session = { user: {} };
        resolver.applyIdentity( session, { employeeID: "11", overrideRoles: null, adminOnly: false, reason: null }, () => [ 1, 2 ] );
        assert.equal( session.user.employeeID, "11" );
        assert.deepEqual( session.user.roles, [ 1, 2 ] );
    } );

    it( "prefers the override roles over the derived ones", () => {
        const session = { user: {} };
        resolver.applyIdentity( session, { employeeID: "11", overrideRoles: [ 3 ], adminOnly: false, reason: null }, () => [ 1, 2 ] );
        assert.deepEqual( session.user.roles, [ 3 ] );
    } );

    it( "gives an admin-only session no employeeID and no application roles", () => {
        const session = { user: {} };
        resolver.applyIdentity( session, { employeeID: null, overrideRoles: null, adminOnly: true, reason: null }, () => [ 1, 2 ] );
        assert.equal( session.user.employeeID, null );
        assert.deepEqual( session.user.roles, [] );
    } );

    it( "throws on a refusal and leaves no identity behind", () => {
        const session = { user: {} };
        assert.throws( () => {
            resolver.applyIdentity( session, { employeeID: null, overrideRoles: null, adminOnly: false, reason: "no-record" }, () => [ 1 ] );
        } );
        assert.equal( session.user.employeeID, undefined );
    } );

} );
