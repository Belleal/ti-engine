/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const logger = require( "@ti-engine/core/logger" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const organizationManager = require( "#organization-manager" );

let cacheStub;

// The shipped demo tree roots at unit "1" (mgr 22) -> "1-1" (mgr 20) -> { "1-1-1" mgr 8, "1-1-2" mgr 11 }.
const MANAGER_IDS = [ "22", "20", "8", "11" ];

const captureLogs = async ( run ) => {
    const originalLog = logger.log;
    const captured = [];
    logger.log = ( message, severity ) => { captured.push( { message, severity } ); };
    try {
        await run();
    } finally {
        logger.log = originalLog;
    }
    return captured;
};

const seedEmployees = async ( employees ) => {
    const map = {};
    employees.forEach( ( employee ) => { map[ employee.employeeID ] = employee; } );
    await cacheStub.setJSON( "ti:competence:data:employees", map );
    await organizationManager.instance.buildOrganizationChart();
};

before( () => {
    cacheStub = installInMemoryCache();
} );

beforeEach( () => {
    cacheStub.storage = {};
} );

describe( "OrganizationManager.reportUnresolvedManagers", () => {

    it( "warns once per unit when no employees are loaded — the fresh-install state", async () => {
        await seedEmployees( [] );
        let findings;
        const logs = await captureLogs( async () => { findings = await organizationManager.instance.reportUnresolvedManagers(); } );

        assert.equal( findings.length, MANAGER_IDS.length );
        assert.ok( findings.every( ( finding ) => finding.code === "manager-not-found" ) );
        assert.equal( logs.length, MANAGER_IDS.length );
        assert.ok( logs.every( ( entry ) => entry.severity === logger.logSeverity.WARNING ) );
    } );

    it( "is silent once every named manager exists and is not terminated", async () => {
        await seedEmployees( MANAGER_IDS.map( ( id ) => ( { employeeID: id, employmentStatus: "active" } ) ) );
        let findings;
        const logs = await captureLogs( async () => { findings = await organizationManager.instance.reportUnresolvedManagers(); } );

        assert.deepEqual( findings, [] );
        assert.equal( logs.length, 0 );
    } );

    it( "warns for a terminated manager, whose employee record does exist", async () => {
        await seedEmployees( MANAGER_IDS.map( ( id ) => ( { employeeID: id, employmentStatus: id === "8" ? "terminated" : "active" } ) ) );
        let findings;
        const logs = await captureLogs( async () => { findings = await organizationManager.instance.reportUnresolvedManagers(); } );

        assert.equal( findings.length, 1 );
        assert.equal( findings[ 0 ].managerID, "8" );
        assert.equal( findings[ 0 ].code, "manager-terminated" );
        assert.equal( logs.length, 1 );
    } );

    it( "logs no personal field — only unit, manager ID and code", async () => {
        await seedEmployees( [ { employeeID: "22", employmentStatus: "terminated", email: "ada@example.com", personal: { firstName: "Ada", lastName: "Lovelace" } } ] );
        const logs = await captureLogs( () => organizationManager.instance.reportUnresolvedManagers() );

        const joined = logs.map( ( entry ) => entry.message ).join( " " );
        assert.equal( joined.includes( "Ada" ), false );
        assert.equal( joined.includes( "Lovelace" ), false );
        assert.equal( joined.includes( "ada@example.com" ), false );
    } );

} );
