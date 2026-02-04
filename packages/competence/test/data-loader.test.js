/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert" );

describe( "DataLoader", () => {
    let dataLoader;

    it( "should load DataLoader module without errors", () => {
        assert.doesNotThrow( () => {
            dataLoader = require( "#data-loader" );
        } );
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

        it( "should return employee data for valid employeeID", () => {
            const employee = dataLoader.instance.fetchEmployee( "1" );
            assert.ok( employee );
            assert.strictEqual( employee.employeeID, "1" );
        } );

        it( "should return employee with personal information", () => {
            const employee = dataLoader.instance.fetchEmployee( "1" );
            assert.ok( employee.personal );
            assert.ok( employee.personal.name );
            assert.ok( typeof employee.personal.position === "string" );
            assert.ok( employee.personal.department );
            assert.ok( employee.personal.manager );
            assert.ok( employee.personal.level );
            assert.ok( employee.personal.startingDate );
        } );

        it( "should return undefined for non-existent employeeID", () => {
            const employee = dataLoader.instance.fetchEmployee( "999" );
            assert.strictEqual( employee, undefined );
        } );

        it( "should return undefined for null employeeID", () => {
            const employee = dataLoader.instance.fetchEmployee( null );
            assert.strictEqual( employee, undefined );
        } );

        it( "should return undefined for undefined employeeID", () => {
            const employee = dataLoader.instance.fetchEmployee( undefined );
            assert.strictEqual( employee, undefined );
        } );

        it( "should handle empty string employeeID", () => {
            const employee = dataLoader.instance.fetchEmployee( "" );
            assert.strictEqual( employee, undefined );
        } );

        it( "should return different employees for different IDs", () => {
            const employee1 = dataLoader.instance.fetchEmployee( "1" );
            const employee2 = dataLoader.instance.fetchEmployee( "2" );
            assert.notStrictEqual( employee1, employee2 );
            assert.notStrictEqual( employee1.employeeID, employee2.employeeID );
        } );

        it( "should handle numeric employeeID (implicit string conversion)", () => {
            const employee = dataLoader.instance.fetchEmployee( 1 );
            assert.ok( employee );
            assert.strictEqual( employee.employeeID, "1" );
        } );

        it( "should validate employee data structure", () => {
            const employee = dataLoader.instance.fetchEmployee( "1" );
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

        it( "should return evaluations array for valid employeeID", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "1" );
            assert.ok( Array.isArray( evaluations ) );
        } );

        it( "should return evaluations with proper structure", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "1" );
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

        it( "should return empty array for non-existent employeeID", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "999" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should return empty array for null employeeID", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( null );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should return empty array for undefined employeeID", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( undefined );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should filter evaluations by employeeID", () => {
            const evaluations1 = dataLoader.instance.fetchEvaluations( "1" );
            const evaluations2 = dataLoader.instance.fetchEvaluations( "2" );

            evaluations1.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, "1" );
            } );

            evaluations2.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, "2" );
            } );
        } );

        it( "should return specific evaluation when evaluationID is provided", () => {
            const allEvaluations = dataLoader.instance.fetchEvaluations( "1" );
            if ( allEvaluations.length > 0 ) {
                const evaluationID = allEvaluations[ 0 ].evaluationID;
                const specificEvaluation = dataLoader.instance.fetchEvaluations( "1", evaluationID );

                assert.ok( Array.isArray( specificEvaluation ) );
                assert.strictEqual( specificEvaluation.length, 1 );
                assert.strictEqual( specificEvaluation[ 0 ].evaluationID, evaluationID );
            }
        } );

        it( "should return empty array when evaluationID does not match", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "1", "non-existent-id" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should validate evaluation grades structure", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "1" );
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

        it( "should return all evaluations when only employeeID is provided", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "1" );
            const evaluationsWithUndefined = dataLoader.instance.fetchEvaluations( "1", undefined );
            assert.strictEqual( evaluations.length, evaluationsWithUndefined.length );
        } );
    } );

    describe( "Data Consistency", () => {
        it( "should have consistent employee IDs between employees and evaluations", () => {
            const employee = dataLoader.instance.fetchEmployee( "1" );
            const evaluations = dataLoader.instance.fetchEvaluations( "1" );

            assert.ok( employee );
            evaluations.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, employee.employeeID );
            } );
        } );

        it( "should return the same data on multiple calls", () => {
            const employee1 = dataLoader.instance.fetchEmployee( "1" );
            const employee2 = dataLoader.instance.fetchEmployee( "1" );

            assert.deepStrictEqual( employee1, employee2 );
        } );

        it( "should return the same evaluations on multiple calls", () => {
            const evaluations1 = dataLoader.instance.fetchEvaluations( "1" );
            const evaluations2 = dataLoader.instance.fetchEvaluations( "1" );

            assert.deepStrictEqual( evaluations1, evaluations2 );
        } );
    } );

    describe( "Edge Cases and Boundary Conditions", () => {
        it( "should handle special characters in employeeID", () => {
            const employee = dataLoader.instance.fetchEmployee( "!@#$%" );
            assert.strictEqual( employee, undefined );
        } );

        it( "should handle very long employeeID strings", () => {
            const longId = "a".repeat( 1000 );
            const employee = dataLoader.instance.fetchEmployee( longId );
            assert.strictEqual( employee, undefined );
        } );

        it( "should handle evaluationID with special characters", () => {
            const evaluations = dataLoader.instance.fetchEvaluations( "1", "invalid!@#$" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should handle concurrent calls without errors", () => {
            const results = [];
            for ( let i = 0; i < 10; i++ ) {
                results.push( dataLoader.instance.fetchEmployee( "1" ) );
            }
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

        it( "should not modify original data when returned object is modified", () => {
            const employee1 = dataLoader.instance.fetchEmployee( "1" );
            const originalName = employee1.personal.name;

            // Attempt to modify returned data
            employee1.personal.name = "Modified Name";

            // Fetch again and verify original data is unchanged
            const employee2 = dataLoader.instance.fetchEmployee( "1" );
            assert.strictEqual( employee2.personal.name, originalName );
        } );
    } );
} );
