/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let cacheStub;
let app;
let dataManager;
let organizationManager;

// A CSV whose values are deliberately distinctive, so a leak into the payload is unmistakable.
const CSV = [
    "employee_id,email,first_name,last_name,work_mode,work_location,organization_unit_id,role_family,level,stage",
    "90001,zelenka.vorobyeva@example.com,Zelenka,Vorobyeva,Full-time,On-site,1-1-1,SE,R,2",
    "90002,bartholomew.quintavalle@example.com,Bartholomew,Quintavalle,Contract,Remote,1-1-2,PM,S,1"
].join( "\n" );

// A third row whose organization_unit_id does not exist, so it rejects while the other two stand.
const CSV_WITH_REJECT = CSV + "\n90003,mireille.aubertin@example.com,Mireille,Aubertin,Full-time,Hybrid,9-9,SE,R,2";

const adminSession = () => ( { user: { userID: "admin@example.com", roles: [ "admin" ] } } );
const employeeSession = () => ( { user: { userID: "1", employeeID: "1", roles: [ 1 ] } } );

before( () => {
    cacheStub = installInMemoryCache();
    dataManager = require( "#data-manager" );
    organizationManager = require( "#organization-manager" );
    const CompetenceWebApplication = require( "../bin/competence-web-application" );
    // `Object.create( CompetenceWebApplication.prototype )` (the harness this suite started from) cannot reach any
    // handler that calls a private method of this class: private methods are gated by a per-instance "brand" that
    // only [[Construct]] installs, and Object.create() skips the constructor entirely. Confirmed directly — calling
    // an existing private-method chain (create-employee -> #requireRole) on such an object throws synchronously
    // with "TypeError: Receiver must be an instance of class CompetenceWebApplication", before any Promise is even
    // returned. `competence-web-application.consent-fallback.test.js` solves the same problem the same way: a real
    // `new CompetenceWebApplication(...)`, whose constructor only registers fragments + config documents (no I/O),
    // so a single shared instance is safe to reuse across every test in this file.
    app = new CompetenceWebApplication( "test-competence-employee-import" );
} );

beforeEach( async () => {
    cacheStub.storage = {};
    await cacheStub.setJSON( "ti:competence:data:employees", {} );
    await organizationManager.instance.buildOrganizationChart();
} );

describe( "employee import screen — access", () => {

    it( "refuses preview to a session without the admin role", async () => {
        await assert.rejects( () => app.processServiceRequest( employeeSession(), "preview-employee-import", { csv: CSV } ) );
    } );

    it( "refuses apply to a session without the admin role", async () => {
        await assert.rejects( () => app.processServiceRequest( employeeSession(), "apply-employee-import", { csv: CSV } ) );
    } );

} );

describe( "employee import screen — preview", () => {

    it( "returns counts for a clean file and writes nothing", async () => {
        const result = await app.processServiceRequest( adminSession(), "preview-employee-import", { csv: CSV } );

        assert.equal( result.counts.create, 2 );
        assert.equal( result.counts.rejected, 0 );
        assert.equal( result.applied, null );
        const stored = await dataManager.instance.fetchEmployees();
        assert.equal( stored.length, 0, "preview must not write" );
    } );

    it( "leaks no personal field into the payload", async () => {
        const result = await app.processServiceRequest( adminSession(), "preview-employee-import", { csv: CSV_WITH_REJECT } );
        const serialized = JSON.stringify( result );

        for ( const secret of [ "Zelenka", "Vorobyeva", "Bartholomew", "Quintavalle", "Mireille", "Aubertin", "example.com" ] ) {
            assert.equal( serialized.includes( secret ), false, `payload leaked '${ secret }'` );
        }
    } );

    it( "names a rejected row by employee_id and source line", async () => {
        const result = await app.processServiceRequest( adminSession(), "preview-employee-import", { csv: CSV_WITH_REJECT } );
        const rejection = result.rejections.find( ( entry ) => entry.employeeID === "90003" );

        assert.ok( rejection, "the invalid row must be reported" );
        assert.equal( rejection.row, 4 );
    } );

    it( "rejects a header missing a required column as a whole-file failure", async () => {
        const bad = "employee_id,email\n90001,a@b.co";
        await assert.rejects( () => app.processServiceRequest( adminSession(), "preview-employee-import", { csv: bad } ) );
    } );

    it( "rejects text carrying replacement characters as a whole-file failure", async () => {
        const bad = CSV.replace( "Zelenka", "��" );
        await assert.rejects( () => app.processServiceRequest( adminSession(), "preview-employee-import", { csv: bad } ) );
    } );

} );

describe( "employee import screen — apply", () => {

    it( "writes the good rows and reports the rejected one", async () => {
        const result = await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV_WITH_REJECT } );

        assert.equal( result.applied.created, 2 );
        assert.equal( result.counts.rejected, 1 );
        const stored = await dataManager.instance.fetchEmployees();
        assert.deepEqual( stored.map( ( e ) => e.employeeID ).sort(), [ "90001", "90002" ] );
    } );

    it( "attributes the audit entries to the acting admin", async () => {
        await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );
        const entries = await dataManager.instance.getAuditEntriesForEmployee( "90001" );

        assert.ok( entries.length > 0, "an audit entry must be written" );
        assert.equal( entries[ 0 ].changedBy, "admin@example.com" );
    } );

    it( "IGNORES a plan posted by the client and applies what the CSV derives", async () => {
        const fabricated = {
            create: [ { employeeID: "66666", email: "attacker@example.com", personal: {}, career: {} } ],
            update: [], unchanged: [], rejected: [], absent: []
        };
        await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV, plan: fabricated } );

        const stored = await dataManager.instance.fetchEmployees();
        assert.deepEqual( stored.map( ( e ) => e.employeeID ).sort(), [ "90001", "90002" ] );
        assert.equal( stored.some( ( e ) => e.employeeID === "66666" ), false, "a client-supplied plan must never be written" );
    } );

    it( "rebuilds the organization chart so an imported employee is reachable without a restart", async () => {
        const prototype = Object.getPrototypeOf( organizationManager.instance );
        const original = prototype.buildOrganizationChart;
        let calls = 0;
        prototype.buildOrganizationChart = function ( ...args ) {
            calls++;
            return original.apply( this, args );
        };
        try {
            await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );
            assert.ok( calls >= 1, "the chart must be rebuilt after a successful apply" );
        } finally {
            prototype.buildOrganizationChart = original;
        }
    } );

    it( "is idempotent — applying the same CSV twice creates nothing the second time", async () => {
        await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );
        const second = await app.processServiceRequest( adminSession(), "apply-employee-import", { csv: CSV } );

        assert.equal( second.applied.created, 0 );
        assert.equal( second.applied.updated, 0 );
        assert.equal( second.counts.unchanged, 2 );
    } );

} );
