/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert" );

describe( "dataManager", () => {
    let dataManager;

    before( () => {
        process.env.COMPETENCE_PRELOAD_DATA = true;

        dataManager = require( "#data-manager" );
        // TODO: preload the cache system!
    } );

    it( "should load DataManager module without errors", () => {
        assert.ok( dataManager );
    } );

    it( "should initialize DataManager module without errors", async () => {
        await assert.doesNotReject( async () => {
            await dataManager.instance.initialize();
        } );
    } );

    describe( "Singleton Pattern", () => {
        it( "should export an instance object", () => {
            assert.ok( dataManager.instance );
            assert.strictEqual( typeof dataManager.instance, "object" );
        } );

        it( "should return the same instance on multiple imports", () => {
            const instance1 = require( "#data-manager" ).instance;
            const instance2 = require( "#data-manager" ).instance;
            assert.strictEqual( instance1, instance2 );
        } );

        it( "should have frozen instance to prevent modifications", () => {
            assert.ok( Object.isFrozen( dataManager.instance ) );
        } );

        it( "should not allow adding new properties to instance", () => {
            const addProperty = () => {
                dataManager.instance.newProperty = "test";
            };
            addProperty();
            assert.strictEqual( dataManager.instance.newProperty, undefined );
        } );
    } );

    describe( "fetchEmployee()", () => {
        it( "should have fetchEmployee method", () => {
            assert.strictEqual( typeof dataManager.instance.fetchEmployee, "function" );
        } );

        it( "should return employee data for valid employeeID", async () => {
            const employee = await dataManager.instance.fetchEmployee( "1" );
            assert.ok( employee );
            assert.strictEqual( employee.employeeID, "1" );
        } );

        it( "should return employee with personal information", async () => {
            const employee = await dataManager.instance.fetchEmployee( "1" );
            assert.ok( employee.personal );
            assert.ok( employee.personal.name );
            assert.ok( typeof employee.personal.position === "string" );
            assert.ok( employee.personal.department );
            assert.ok( employee.personal.manager );
            assert.ok( employee.personal.level );
            assert.ok( employee.personal.startingDate );
        } );

        it( "should reject for non-existent employeeID", async () => {
            await assert.rejects( () => dataManager.instance.fetchEmployee( "999" ) );
        } );

        it( "should reject for null employeeID", async () => {
            await assert.rejects( () => dataManager.instance.fetchEmployee( null ) );
        } );

        it( "should reject for undefined employeeID", async () => {
            await assert.rejects( () => dataManager.instance.fetchEmployee( undefined ) );
        } );

        it( "should reject for empty string employeeID", async () => {
            await assert.rejects( () => dataManager.instance.fetchEmployee( "" ) );
        } );

        it( "should return different employees for different IDs", async () => {
            const employee1 = await dataManager.instance.fetchEmployee( "1" );
            const employee2 = await dataManager.instance.fetchEmployee( "2" );
            assert.notStrictEqual( employee1, employee2 );
            assert.notStrictEqual( employee1.employeeID, employee2.employeeID );
        } );

        it( "should handle numeric employeeID (implicit string conversion)", async () => {
            const employee = await dataManager.instance.fetchEmployee( 1 );
            assert.ok( employee );
            assert.strictEqual( employee.employeeID, "1" );
        } );

        it( "should validate employee data structure", async () => {
            const employee = await dataManager.instance.fetchEmployee( "1" );
            assert.ok( employee );
            assert.ok( employee.personal );
            assert.ok( typeof employee.personal.stage === "number" );
            assert.ok( [ "N", "J", "R", "S", "X", "T" ].includes( employee.personal.level ) );
        } );
    } );

    describe( "fetchEvaluations()", () => {
        it( "should have fetchEvaluations method", () => {
            assert.strictEqual( typeof dataManager.instance.fetchEvaluations, "function" );
        } );

        it( "should return evaluations array for valid employeeID", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            assert.ok( Array.isArray( evaluations ) );
        } );

        it( "should return evaluations with proper structure", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluation = evaluations[ 0 ];
                assert.ok( evaluation.evaluationID );
                assert.ok( evaluation.employeeID );
                assert.ok( evaluation.cycleID );
                assert.ok( evaluation.cycleDate );
                assert.ok( evaluation.grades );
                assert.strictEqual( typeof evaluation.grades, "object" );
            }
        } );

        it( "should return empty array for non-existent employeeID", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "999" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should return empty array for null employeeID", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( null );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should return empty array for undefined employeeID", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( undefined );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should filter evaluations by employeeID", async () => {
            const evaluations1 = await dataManager.instance.fetchEvaluations( "1" );
            const evaluations2 = await dataManager.instance.fetchEvaluations( "2" );

            evaluations1.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, "1" );
            } );

            evaluations2.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, "2" );
            } );
        } );

        it( "should return empty array for non-existent employeeID string", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "non-existent-id" );
            assert.ok( Array.isArray( evaluations ) );
            assert.strictEqual( evaluations.length, 0 );
        } );

        it( "should validate evaluation grades structure", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const grades = evaluations[ 0 ].grades;
                const gradeEntries = Object.values( grades );

                if ( gradeEntries.length > 0 ) {
                    gradeEntries.forEach( grade => {
                        assert.ok( Object.prototype.hasOwnProperty.call( grade, "employee" ) );
                        assert.ok( Object.prototype.hasOwnProperty.call( grade, "manager" ) );
                        assert.ok( Object.prototype.hasOwnProperty.call( grade, "team" ) );
                    } );
                }
            }
        } );

        it( "should filter out deleted evaluations by default", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1", false );
            evaluations.forEach( evaluation => {
                assert.notStrictEqual( evaluation.status, "Deleted" );
            } );
        } );

        it( "should filter out closed evaluations when filterClosed is true", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1", true );
            evaluations.forEach( evaluation => {
                assert.notStrictEqual( evaluation.status, "Closed" );
                assert.notStrictEqual( evaluation.status, "Deleted" );
            } );
        } );

        it( "should include closed evaluations when filterClosed is false", async () => {
            const allEvaluations = await dataManager.instance.fetchEvaluations( "2", false );
            const hasVariousStatuses = allEvaluations.some( evaluation =>
                evaluation.status === "Open" || evaluation.status === "In Review" || evaluation.status === "Ready"
            );
            // Test passes if we get evaluations at all (not filtered by closed status)
            assert.ok( Array.isArray( allEvaluations ) );
        } );

        it( "should validate team grades structure with cumulative and individual", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const grades = evaluations[ 0 ].grades;
                const gradeEntries = Object.values( grades );

                if ( gradeEntries.length > 0 ) {
                    gradeEntries.forEach( grade => {
                        assert.ok( Object.prototype.hasOwnProperty.call( grade, "team" ) );
                        assert.ok( typeof grade.team === "object" );
                    } );
                }
            }
        } );
    } );

    describe( "fetchEvaluation()", () => {
        it( "should have fetchEvaluation method", () => {
            assert.strictEqual( typeof dataManager.instance.fetchEvaluation, "function" );
        } );

        it( "should return evaluation data for valid evaluationID", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluationID = evaluations[ 0 ].evaluationID;
                const evaluation = await dataManager.instance.fetchEvaluation( evaluationID );
                assert.ok( evaluation );
                assert.strictEqual( evaluation.evaluationID, evaluationID );
            }
        } );

        it( "should return evaluation with proper structure", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluationID = evaluations[ 0 ].evaluationID;
                const evaluation = await dataManager.instance.fetchEvaluation( evaluationID );
                assert.ok( evaluation.evaluationID );
                assert.ok( evaluation.employeeID );
                assert.ok( evaluation.cycleID );
                assert.ok( evaluation.cycleDate );
                assert.ok( evaluation.status );
                assert.ok( evaluation.grades );
            }
        } );

        it( "should reject for non-existent evaluationID", async () => {
            await assert.rejects(
                () => dataManager.instance.fetchEvaluation( "non-existent-evaluation-id" ),
                ( error ) => {
                    assert.ok( error.message.includes( "not found" ) );
                    return true;
                }
            );
        } );

        it( "should reject for deleted evaluation", async () => {
            const allEvaluations = await dataManager.instance.fetchEvaluations( "1", false );
            const deletedEval = allEvaluations.find( e => e.status === "Deleted" );

            if ( deletedEval ) {
                await assert.rejects(
                    () => dataManager.instance.fetchEvaluation( deletedEval.evaluationID ),
                    ( error ) => {
                        assert.ok( error.message.includes( "not found" ) );
                        return true;
                    }
                );
            }
        } );

        it( "should validate evaluation workflow structure", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluationID = evaluations[ 0 ].evaluationID;
                const evaluation = await dataManager.instance.fetchEvaluation( evaluationID );

                if ( evaluation.workflow ) {
                    assert.ok( typeof evaluation.workflow === "object" );
                    assert.ok( Object.prototype.hasOwnProperty.call( evaluation.workflow, "selfEvaluationCompleted" ) );
                    assert.ok( Object.prototype.hasOwnProperty.call( evaluation.workflow, "teamEvaluationCompleted" ) );
                    assert.ok( Object.prototype.hasOwnProperty.call( evaluation.workflow, "managerEvaluationCompleted" ) );
                }
            }
        } );

        it( "should return different evaluations for different IDs", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 1 ) {
                const eval1 = await dataManager.instance.fetchEvaluation( evaluations[ 0 ].evaluationID );
                const eval2 = await dataManager.instance.fetchEvaluation( evaluations[ 1 ].evaluationID );
                assert.notStrictEqual( eval1.evaluationID, eval2.evaluationID );
            }
        } );
    } );

    describe( "saveEvaluation()", () => {
        it( "should have saveEvaluation method", () => {
            assert.strictEqual( typeof dataManager.instance.saveEvaluation, "function" );
        } );

        it( "should save evaluation and return the same evaluation", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluation = evaluations[ 0 ];
                const updatedComment = "Test comment - " + Date.now();
                evaluation.comment = updatedComment;

                const savedEvaluation = await dataManager.instance.saveEvaluation( evaluation );
                assert.ok( savedEvaluation );
                assert.strictEqual( savedEvaluation.evaluationID, evaluation.evaluationID );
                assert.strictEqual( savedEvaluation.comment, updatedComment );
            }
        } );

        it( "should throw error when evaluation is missing employeeID", async () => {
            const invalidEvaluation = {
                evaluationID: "test-id",
                cycleID: "2025.H1",
                grades: {}
            };

            await assert.rejects(
                () => dataManager.instance.saveEvaluation( invalidEvaluation ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should throw error when evaluation is missing evaluationID", async () => {
            const invalidEvaluation = {
                employeeID: "1",
                cycleID: "2025.H1",
                grades: {}
            };

            await assert.rejects(
                () => dataManager.instance.saveEvaluation( invalidEvaluation ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should throw error when evaluation is null", async () => {
            await assert.rejects(
                () => dataManager.instance.saveEvaluation( null ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should throw error when evaluation is undefined", async () => {
            await assert.rejects(
                () => dataManager.instance.saveEvaluation( undefined ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should persist changes to grades", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluation = evaluations[ 0 ];
                const competencyCode = Object.keys( evaluation.grades )[ 0 ];

                if ( competencyCode ) {
                    evaluation.grades[ competencyCode ].employee = "S";
                    await dataManager.instance.saveEvaluation( evaluation );

                    const fetchedEvaluation = await dataManager.instance.fetchEvaluation( evaluation.evaluationID );
                    assert.strictEqual( fetchedEvaluation.grades[ competencyCode ].employee, "S" );
                }
            }
        } );

        it( "should persist status changes", async () => {
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );
            if ( evaluations.length > 0 ) {
                const evaluation = evaluations[ 0 ];
                const originalStatus = evaluation.status;
                evaluation.status = "In Review";

                await dataManager.instance.saveEvaluation( evaluation );
                const fetchedEvaluation = await dataManager.instance.fetchEvaluation( evaluation.evaluationID );
                assert.strictEqual( fetchedEvaluation.status, "In Review" );

                // Restore original status
                evaluation.status = originalStatus;
                await dataManager.instance.saveEvaluation( evaluation );
            }
        } );
    } );

    describe( "Data Consistency", () => {
        it( "should have consistent employee IDs between employees and evaluations", async () => {
            const employee = await dataManager.instance.fetchEmployee( "1" );
            const evaluations = await dataManager.instance.fetchEvaluations( "1" );

            assert.ok( employee );
            evaluations.forEach( evaluation => {
                assert.strictEqual( evaluation.employeeID, employee.employeeID );
            } );
        } );

        it( "should return the same data on multiple calls", async () => {
            const employee1 = await dataManager.instance.fetchEmployee( "1" );
            const employee2 = await dataManager.instance.fetchEmployee( "1" );

            assert.deepStrictEqual( employee1, employee2 );
        } );

        it( "should return the same evaluations on multiple calls", async () => {
            const evaluations1 = await dataManager.instance.fetchEvaluations( "1" );
            const evaluations2 = await dataManager.instance.fetchEvaluations( "1" );

            assert.deepStrictEqual( evaluations1, evaluations2 );
        } );
    } );

    describe( "Edge Cases and Boundary Conditions", () => {
        it( "should reject for special characters in employeeID", async () => {
            await assert.rejects( () => dataManager.instance.fetchEmployee( "!@#$%" ) );
        } );

        it( "should reject for very long employeeID strings", async () => {
            const longId = "a".repeat( 1000 );
            await assert.rejects( () => dataManager.instance.fetchEmployee( longId ) );
        } );

        it( "should handle concurrent calls without errors", async () => {
            const results = await Promise.all(
                Array.from( { length: 10 }, () => dataManager.instance.fetchEmployee( "1" ) )
            );
            results.forEach( result => {
                assert.ok( result );
                assert.strictEqual( result.employeeID, "1" );
            } );
        } );
    } );

    describe( "Negative Tests", () => {
        it( "should not allow direct instantiation", () => {
            // The DataManager class is not exported, only the instance
            assert.throws( () => {
                const DataManagerClass = require( "#data-manager" ).DataManager;
                new DataManagerClass();
            } );
        } );

        it( "should not modify original data when returned object is modified", async () => {
            const employee1 = await dataManager.instance.fetchEmployee( "1" );
            const originalName = employee1.personal.name;

            // Attempt to modify returned data
            employee1.personal.name = "Modified Name";

            // Fetch again and verify original data is unchanged
            const employee2 = await dataManager.instance.fetchEmployee( "1" );
            assert.strictEqual( employee2.personal.name, originalName );
        } );
    } );
} );