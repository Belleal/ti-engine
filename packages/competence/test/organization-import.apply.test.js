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

function recordingWriter() {
    const saved = [];
    const audited = [];
    return {
        saved: saved,
        audited: audited,
        save: ( employee ) => { saved.push( employee ); return Promise.resolve( employee ); },
        audit: ( entry ) => { audited.push( entry ); return Promise.resolve(); }
    };
}

const CREATED = { employeeID: "1", email: "a@x.co", personal: {}, career: {} };
const UPDATED = { employeeID: "2", email: "b@x.co", personal: {}, career: {} };
const PREVIOUS = { employeeID: "2", email: "old@x.co", personal: {}, career: {} };

describe( "organizationImport.applyPlan", () => {

    it( "writes creates and updates, and skips unchanged records", async () => {
        const writer = recordingWriter();
        const result = await organizationImport.instance.applyPlan( {
            create: [ CREATED ],
            update: [ { employee: UPDATED, previous: PREVIOUS } ],
            unchanged: [ { employeeID: "3" } ],
            rejected: [],
            absent: []
        }, writer );

        assert.deepEqual( result, { created: 1, updated: 1, skipped: 1 } );
        assert.deepEqual( writer.saved.map( ( e ) => e.employeeID ), [ "1", "2" ] );
    } );

    it( "audits a create with a __created__ field and no previous value", async () => {
        const writer = recordingWriter();
        await organizationImport.instance.applyPlan( { create: [ CREATED ], update: [], unchanged: [], rejected: [], absent: [] }, writer );

        assert.equal( writer.audited.length, 1 );
        assert.equal( writer.audited[ 0 ].subjectType, "employee" );
        assert.equal( writer.audited[ 0 ].subjectID, "1" );
        assert.equal( writer.audited[ 0 ].field, "__created__" );
        assert.equal( writer.audited[ 0 ].oldValue, null );
    } );

    it( "audits an update carrying the previous record", async () => {
        const writer = recordingWriter();
        await organizationImport.instance.applyPlan( { create: [], update: [ { employee: UPDATED, previous: PREVIOUS } ], unchanged: [], rejected: [], absent: [] }, writer );

        assert.equal( writer.audited[ 0 ].field, "__imported__" );
        assert.equal( writer.audited[ 0 ].oldValue.email, "old@x.co" );
        assert.equal( writer.audited[ 0 ].newValue.email, "b@x.co" );
    } );

    it( "never writes a rejected or absent record", async () => {
        const writer = recordingWriter();
        const result = await organizationImport.instance.applyPlan( {
            create: [], update: [], unchanged: [],
            rejected: [ { employeeID: "8", code: "duplicate-email" } ],
            absent: [ "9" ]
        }, writer );

        assert.deepEqual( result, { created: 0, updated: 0, skipped: 0 } );
        assert.equal( writer.saved.length, 0 );
    } );

    it( "applies an empty plan without error", async () => {
        const writer = recordingWriter();
        const result = await organizationImport.instance.applyPlan( { create: [], update: [], unchanged: [], rejected: [], absent: [] }, writer );
        assert.deepEqual( result, { created: 0, updated: 0, skipped: 0 } );
    } );

    it( "writes sequentially, so a partial failure leaves a comprehensible store", async () => {
        const order = [];
        const writer = {
            save: ( employee ) => {
                order.push( "save:" + employee.employeeID );
                return Promise.resolve( employee );
            },
            audit: ( entry ) => {
                order.push( "audit:" + entry.subjectID );
                return Promise.resolve();
            }
        };
        await organizationImport.instance.applyPlan( {
            create: [ CREATED, { employeeID: "5", email: "e@x.co", personal: {}, career: {} } ],
            update: [], unchanged: [], rejected: [], absent: []
        }, writer );

        assert.deepEqual( order, [ "save:1", "audit:1", "save:5", "audit:5" ] );
    } );

    // CA-107 code review, finding 4: applyPlan chains its steps with `reduce`, and the CLI's recovery message
    // (bin/build/import-organization.js#applyWithProgress) depends on a rejection propagating out of applyPlan
    // AND on the chain stopping there -- neither was exercised by a test before this.
    it( "propagates a rejected save and never attempts the record behind it", async () => {
        const order = [];
        const failure = new Error( "save failed for 2" );
        const writer = {
            save: ( employee ) => {
                order.push( "save:" + employee.employeeID );
                return ( employee.employeeID === "2" ) ? Promise.reject( failure ) : Promise.resolve( employee );
            },
            audit: ( entry ) => {
                order.push( "audit:" + entry.subjectID );
                return Promise.resolve();
            }
        };

        await assert.rejects(
            organizationImport.instance.applyPlan( {
                create: [
                    { employeeID: "1", email: "a@x.co", personal: {}, career: {} },
                    { employeeID: "2", email: "b@x.co", personal: {}, career: {} },
                    { employeeID: "3", email: "c@x.co", personal: {}, career: {} }
                ],
                update: [], unchanged: [], rejected: [], absent: []
            }, writer ),
            ( error ) => error === failure
        );

        assert.deepEqual( order, [ "save:1", "audit:1", "save:2" ], "the third record must never be attempted" );
    } );

    it( "propagates a rejected audit and never attempts the record behind it", async () => {
        const order = [];
        const failure = new Error( "audit failed for 2" );
        const writer = {
            save: ( employee ) => {
                order.push( "save:" + employee.employeeID );
                return Promise.resolve( employee );
            },
            audit: ( entry ) => {
                order.push( "audit:" + entry.subjectID );
                return ( entry.subjectID === "2" ) ? Promise.reject( failure ) : Promise.resolve();
            }
        };

        await assert.rejects(
            organizationImport.instance.applyPlan( {
                create: [
                    { employeeID: "1", email: "a@x.co", personal: {}, career: {} },
                    { employeeID: "2", email: "b@x.co", personal: {}, career: {} },
                    { employeeID: "3", email: "c@x.co", personal: {}, career: {} }
                ],
                update: [], unchanged: [], rejected: [], absent: []
            }, writer ),
            ( error ) => error === failure
        );

        // The record whose audit rejected (2) was saved but never attempted again -- and the third record, whose
        // turn never came, must show no trace at all.
        assert.deepEqual( order, [ "save:1", "audit:1", "save:2", "audit:2" ], "the third record must never be attempted" );
    } );

} );
