/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert" );

describe( "DataLoader", () => {
    let dataLoader;

    before( () => {
        dataLoader = require( "#data-loader" );
    } );

    it( "should load DataLoader module without errors", () => {
        assert.ok( dataLoader );
    } );

    describe( "Singleton Pattern", () => {
        it( "should export an instance object", () => {
            assert.ok( dataLoader.instance );
            assert.strictEqual( typeof dataLoader.instance, "object" );
        } );

        it( "should return the same instance on multiple imports", () => {
            const instance1 = require( "#data-loader" ).instance;
            const instance2 = require( "#data-loader" ).instance;
            assert.strictEqual( instance1, instance2 );
        } );

        it( "should have frozen instance to prevent modifications", () => {
            assert.ok( Object.isFrozen( dataLoader.instance ) );
        } );

        it( "should not allow adding new properties to instance", () => {
            const addProperty = () => {
                dataLoader.instance.newProperty = "test";
            };
            addProperty();
            assert.strictEqual( dataLoader.instance.newProperty, undefined );
        } );
    } );

    describe( "fetchEmployee()", () => {
        it( "should have fetchEmployee method", () => {
            assert.strictEqual( typeof dataLoader.instance.fetchEmployee, "function" );
        } );

        it( "should return employee data for valid employeeID", async () => {
            const employee = await dataLoader.instance.fetchEmployee( "1" );
            assert.ok( employee );
            assert.strictEqual( employee.employeeID, "1" );
        } );

        it( "should return employee with personal information", async () => {
            const employee = await dataLoader.instance.fetchEmployee( "1" );
            assert.ok( employee.personal );
            assert.ok( employee.personal.name );
            assert.ok( typeof employee.personal.position === "string" );
            assert.ok( employee.personal.department );
            assert.ok( employee.personal.manager );
            assert.ok( employee.personal.level );
            assert.ok( employee.personal.startingDate );
        } );

        it( "should reject for non-existent employeeID", async () => {
            await assert.rejects( () => dataLoader.instance.fetchEmployee( "999" ) );
        } );

        it( "should reject for null employeeID", async () => {
            await assert.rejects( () => dataLoader.instance.fetchEmployee( null ) );
        } );

        it( "should reject for undefined employeeID", async () => {
            await assert.rejects( () => dataLoader.instance.fetchEmployee( undefined ) );
        } );

        it( "should reject for empty string employeeID", async () => {
            await assert.rejects( () => dataLoader.instance.fetchEmployee( "" ) );
        } );

        it( "should return different employees for different IDs", async () => {
            const employee1 = await dataLoader.instance.fetchEmployee( "1" );
            const employee2 = await dataLoader.instance.fetchEmployee( "2" );
            assert.notStrictEqual( employee1, employee2 );
            assert.notStrictEqual( employee1.employeeID, employee2.employeeID );
        } );

        it( "should handle numeric employeeID (implicit string conversion)", async () => {
            const employee = await dataLoader.instance.fetchEmployee( 1 );
            assert.ok( employee );
            assert.strictEqual( employee.employeeID, "1" );
        } );

        it( "should validate employee data structure", async () => {
            const employee = await dataLoader.instance.fetchEmployee( "1" );
            assert.ok( employee );
            assert.ok( employee.personal );
            assert.ok( typeof employee.personal.stage === "number" );
            assert.ok( [ "N", "J", "R", "S", "X", "T" ].includes( employee.personal.level ) );
        } );
    } );

    describe( "fetchEvaluations()", () => {
        it( "should have fetchEvaluations method", () => {
            assert.strictEqual( typeof dataLoader.instance.fetchEvaluations, "function" );
        } );

        it( "should return evaluations array for valid employeeID", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( "1" );
            assert.ok( Array.isArray( evaluations ) );
        } );

        it( "should return evaluations with proper structure", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluation = evaluations[ 0 ];
                assert.ok( evaluation.evaluationID );
                assert.ok( evaluation.employeeID );
                assert.ok( evaluation.cycleID );
                assert.ok( evaluation.cycleDate );
                assert.ok( evaluation.interviewDate );
                assert.ok( evaluation.grades );
                assert.strictEqual( typeof evaluation.grades, "object" );
            }
        } );

        it( "should return empty array for non-existent employeeID", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( "999" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should return empty array for null employeeID", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( null );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should return empty array for undefined employeeID", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( undefined );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should filter evaluations by employeeID", async () => {
            const evaluations1 = await dataLoader.instance.fetchEvaluations( "1" );
            const evaluations2 = await dataLoader.instance.fetchEvaluations( "2" );

            evaluations1.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, "1" );
            } );

            evaluations2.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, "2" );
            } );
        } );

        it( "should return empty array for non-existent employeeID string", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( "non-existent-id" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should validate evaluation grades structure", async () => {
            const evaluations = await dataLoader.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const grades = evaluations[ 0 ].grades;
                const gradeEntries = Object.values( grades );

                if ( gradeEntries.length > 0 ) {
                    gradeEntries.forEach( grade => {
                        assert.ok( grade.hasOwnProperty( "employee" ) );
                        assert.ok( grade.hasOwnProperty( "manager" ) );
                        assert.ok( grade.hasOwnProperty( "team" ) );
                    } );
                }
            }
        } );
    } );

    describe( "Data Consistency", () => {
        it( "should have consistent employee IDs between employees and evaluations", async () => {
            const employee = await dataLoader.instance.fetchEmployee( "1" );
            const evaluations = await dataLoader.instance.fetchEvaluations( "1" );

            assert.ok( employee );
            evaluations.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, employee.employeeID );
            } );
        } );

        it( "should return the same data on multiple calls", async () => {
            const employee1 = await dataLoader.instance.fetchEmployee( "1" );
            const employee2 = await dataLoader.instance.fetchEmployee( "1" );

            assert.deepStrictEqual( employee1, employee2 );
        } );

        it( "should return the same evaluations on multiple calls", async () => {
            const evaluations1 = await dataLoader.instance.fetchEvaluations( "1" );
            const evaluations2 = await dataLoader.instance.fetchEvaluations( "1" );

            assert.deepStrictEqual( evaluations1, evaluations2 );
        } );
    } );

    describe( "Edge Cases and Boundary Conditions", () => {
        it( "should reject for special characters in employeeID", async () => {
            await assert.rejects( () => dataLoader.instance.fetchEmployee( "!@#$%" ) );
        } );

        it( "should reject for very long employeeID strings", async () => {
            const longId = "a".repeat( 1000 );
            await assert.rejects( () => dataLoader.instance.fetchEmployee( longId ) );
        } );

        it( "should handle concurrent calls without errors", async () => {
            const results = await Promise.all(
                Array.from( { length: 10 }, () => dataLoader.instance.fetchEmployee( "1" ) )
            );
            results.forEach( result => {
                assert.ok( result );
                assert.strictEqual( result.employeeID, "1" );
            } );
        } );
    } );

    describe( "Negative Tests", () => {
        it( "should not allow direct instantiation", () => {
            // The DataLoader class is not exported, only the instance
            assert.throws( () => {
                const DataLoader = require( "#data-loader" ).DataLoader;
                new DataLoader();
            } );
        } );

        it( "should not modify original data when returned object is modified", async () => {
            const employee1 = await dataLoader.instance.fetchEmployee( "1" );
            const originalName = employee1.personal.name;

            // Attempt to modify returned data
            employee1.personal.name = "Modified Name";

            // Fetch again and verify original data is unchanged
            const employee2 = await dataLoader.instance.fetchEmployee( "1" );
            assert.strictEqual( employee2.personal.name, originalName );
        } );
    } );
} );
