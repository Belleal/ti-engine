/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * work-sites removal guard (CA-109). A site still assigned to somebody cannot be removed.
 *
 * The spec first argued this could not be a validator, citing CA-107's decision to make the unresolved-manager
 * check a startup diagnostic. That was wrong, and the distinction is worth keeping straight: CA-107's check is a
 * PRESENCE check — "every unit's managerID must resolve to an employee" — which fires on a fresh install, where the
 * tree must exist before any employee can reference it, and therefore deadlocks. This is a REMOVAL check. It fires
 * only when something is being taken away, and a fresh install takes nothing away.
 *
 * The property that matters most: an employee fetch that genuinely FAILS blocks the save rather than being
 * skipped. Skipping would let a transient cache error orphan every employee on a site.
 */

const { describe, it, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const validators = require( "../application/config-validators" );

const original = validators.fetchEmployeesForValidation;
afterEach( () => {
    validators.fetchEmployeesForValidation = original;
} );

const site = ( id ) => ( { id: id, type: "office", name: { en: id, bg: id } } );
const employeeAt = ( employeeID, workSite ) => ( {
    employeeID: employeeID,
    personal: { firstName: "A", lastName: "B", workMode: "Full-time", workLocation: "On-site", workSite: workSite }
} );

describe( "workSitesReferentialIntegrity", () => {

    it( "allows a document that still contains every referenced site", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ employeeAt( "1", "HQ" ) ] );
        assert.deepEqual( await validators.workSitesReferentialIntegrity( { HQ: site( "HQ" ) }, {} ), [] );
    } );

    it( "refuses to remove a site an employee is assigned to", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ employeeAt( "1", "HQ" ) ] );
        const issues = await validators.workSitesReferentialIntegrity( { OF1: site( "OF1" ) }, {} );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].code, "reference-integrity" );
        assert.equal( issues[ 0 ].path, ".HQ" );
    } );

    it( "names no employee in the message", async () => {
        // The issue text reaches an admin screen. A site code is configuration; a person is not.
        validators.fetchEmployeesForValidation = () => Promise.resolve( [ employeeAt( "90001", "HQ" ) ] );
        const issues = await validators.workSitesReferentialIntegrity( {}, {} );
        assert.equal( issues[ 0 ].message.includes( "90001" ), false );
    } );

    it( "reports a site held by many employees exactly once", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [
            employeeAt( "1", "HQ" ), employeeAt( "2", "HQ" ), employeeAt( "3", "HQ" )
        ] );
        assert.equal( ( await validators.workSitesReferentialIntegrity( {}, {} ) ).length, 1 );
    } );

    it( "ignores an employee with no work site", async () => {
        validators.fetchEmployeesForValidation = () => Promise.resolve( [
            { employeeID: "1", personal: { firstName: "A", lastName: "B" } },
            { employeeID: "2" }
        ] );
        assert.deepEqual( await validators.workSitesReferentialIntegrity( {}, {} ), [] );
    } );

    it( "skips the check when the data layer is absent, so config-only validation still works", async () => {
        // fetchEmployeesForValidation resolves [] rather than rejecting when there is no data layer at all.
        validators.fetchEmployeesForValidation = () => Promise.resolve( [] );
        assert.deepEqual( await validators.workSitesReferentialIntegrity( {}, {} ), [] );
    } );

    it( "BLOCKS when the employee fetch fails, rather than passing", async () => {
        validators.fetchEmployeesForValidation = () => Promise.reject( new Error( "cache down" ) );
        const issues = await validators.workSitesReferentialIntegrity( {}, {} );
        assert.equal( issues.length, 1 );
        assert.equal( issues[ 0 ].path, "." );
        assert.match( issues[ 0 ].message, /could not be verified/ );
    } );

    it( "blocks on a synchronous throw from the seam too", async () => {
        validators.fetchEmployeesForValidation = () => { throw new Error( "boom" ); };
        const issues = await validators.workSitesReferentialIntegrity( {}, {} );
        assert.equal( issues.length, 1 );
        assert.match( issues[ 0 ].message, /could not be verified/ );
    } );

} );
