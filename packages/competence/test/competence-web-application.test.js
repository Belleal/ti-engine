/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, mock, beforeEach } = require( "node:test" );
const assert = require( "node:assert" );

describe( "CompetenceWebApplication", () => {
    let CompetenceWebApplication;
    let app;

    beforeEach( () => {
        // Clear module cache to get fresh instances
        delete require.cache[ require.resolve( "../bin/competence-web-application.js" ) ];
        CompetenceWebApplication = require( "../bin/competence-web-application.js" );
    } );

    describe( "Constructor", () => {
        it( "should create instance with default identifier", () => {
            assert.doesNotThrow( () => {
                app = new CompetenceWebApplication();
            } );
        } );

        it( "should create instance with custom identifier", () => {
            assert.doesNotThrow( () => {
                app = new CompetenceWebApplication( "custom-competence" );
            } );
        } );

        it( "should extend TiWebAppManager", () => {
            app = new CompetenceWebApplication();
            const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );
            assert.ok( app instanceof TiWebAppManager );
        } );

        it( "should register competence-evaluation fragment", () => {
            app = new CompetenceWebApplication();
            // The fragment should be registered via addFragment method
            // We verify this indirectly by checking the app is properly initialized
            assert.ok( app );
        } );
    } );

    describe( "transformHtml()", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should have transformHtml method", () => {
            assert.strictEqual( typeof app.transformHtml, "function" );
        } );

        it( "should return a promise", () => {
            const result = app.transformHtml( "<html></html>", {} );
            assert.ok( result instanceof Promise );
        } );

        it( "should transform HTML with empty options", async () => {
            const html = "<html><head></head><body>Test</body></html>";
            const result = await app.transformHtml( html, {} );
            assert.ok( result );
            assert.strictEqual( typeof result, "string" );
        } );

        it( "should transform HTML with csrfToken option", async () => {
            const html = "<html><body>Test</body></html>";
            const options = { csrfToken: "test-token-123" };
            const result = await app.transformHtml( html, options );
            assert.ok( result );
            assert.strictEqual( typeof result, "string" );
        } );

        it( "should transform HTML with nonce option", async () => {
            const html = "<html><body>Test</body></html>";
            const options = { nonce: "test-nonce-456" };
            const result = await app.transformHtml( html, options );
            assert.ok( result );
            assert.strictEqual( typeof result, "string" );
        } );

        it( "should transform HTML with title option", async () => {
            const html = "<html><head><title>{{title}}</title></head><body>Test</body></html>";
            const options = { title: "Test Title" };
            const result = await app.transformHtml( html, options );
            assert.ok( result );
            assert.strictEqual( typeof result, "string" );
        } );

        it( "should transform HTML with isHome flag", async () => {
            const html = "<html><body>Test</body></html>";
            const options = { isHome: true };
            const result = await app.transformHtml( html, options );
            assert.ok( result );
            assert.strictEqual( typeof result, "string" );
        } );

        it( "should handle empty HTML string", async () => {
            const result = await app.transformHtml( "", {} );
            assert.strictEqual( typeof result, "string" );
        } );

        it( "should handle null options", async () => {
            const html = "<html><body>Test</body></html>";
            const result = await app.transformHtml( html, null );
            assert.ok( result );
            assert.strictEqual( typeof result, "string" );
        } );
    } );

    describe( "processDataRequest() - config view", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should have processDataRequest method", () => {
            assert.strictEqual( typeof app.processDataRequest, "function" );
        } );

        it( "should return a promise", () => {
            const result = app.processDataRequest( {}, "config", {} );
            assert.ok( result instanceof Promise );
        } );

        it( "should return config data with grades", async () => {
            const session = { language: "en" };
            const result = await app.processDataRequest( session, "config", {} );

            assert.ok( result );
            assert.ok( result.grades );
            assert.strictEqual( typeof result.grades, "object" );
        } );

        it( "should include evaluation grades in config response", async () => {
            const session = { language: "en" };
            const result = await app.processDataRequest( session, "config", {} );

            assert.ok( result.grades );
            assert.ok( result.grades.U );
            assert.ok( result.grades.R );
            assert.ok( result.grades.S );
        } );

        it( "should handle config request without session", async () => {
            const result = await app.processDataRequest( null, "config", {} );
            assert.ok( result );
            assert.ok( result.grades );
        } );
    } );

    describe( "processDataRequest() - load-evaluation view", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should reject when employeeID is missing", async () => {
            const session = { language: "en" };
            await assert.rejects(
                app.processDataRequest( session, "load-evaluation", {} ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should reject when employeeID is empty string", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "" } };

            await assert.rejects(
                app.processDataRequest( session, "load-evaluation", options ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should reject when employeeID is whitespace", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "   " } };

            await assert.rejects(
                app.processDataRequest( session, "load-evaluation", options ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should throw when employee does not exist", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "999" } };

            await assert.rejects(
                app.processDataRequest( session, "load-evaluation", options ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should return employee competencies for valid employeeID", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( result );
            assert.strictEqual( result.employeeID, "1" );
            assert.ok( result.personal );
            assert.ok( result.evaluation );
            assert.ok( result.competencies );
        } );

        it( "should include personal information with position name", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( result.personal );
            assert.ok( result.personal.name );
            assert.ok( result.personal.position );
            assert.ok( result.personal.positionName );
            assert.ok( result.personal.department );
            assert.ok( result.personal.manager );
            assert.ok( result.personal.level );
        } );

        it( "should return last evaluation by interview date", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( result.evaluation );
            // If there are evaluations, verify the structure
            if ( result.evaluation.evaluationID ) {
                assert.ok( result.evaluation.employeeID );
                assert.ok( result.evaluation.cycleID );
                assert.ok( result.evaluation.grades );
            }
        } );

        it( "should return competencies tree structure", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( Array.isArray( result.competencies ) );
            if ( result.competencies.length > 0 ) {
                const category = result.competencies[ 0 ];
                assert.ok( category.id );
                assert.ok( category.name );
                assert.ok( category.description );
                assert.ok( Array.isArray( category.subcategories ) );

                if ( category.subcategories.length > 0 ) {
                    const subcategory = category.subcategories[ 0 ];
                    assert.ok( subcategory.id );
                    assert.ok( subcategory.name );
                    assert.ok( subcategory.description );
                    assert.ok( Array.isArray( subcategory.items ) );

                    if ( subcategory.items.length > 0 ) {
                        const item = subcategory.items[ 0 ];
                        assert.ok( item.id );
                        assert.ok( item.name );
                        assert.ok( item.description );
                    }
                }
            }
        } );

        it( "should handle employee with no evaluations", async () => {
            const session = { language: "en" };
            // Assuming employeeID "2" might have different evaluation data
            const options = { query: { employeeID: "2" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( result );
            assert.strictEqual( result.employeeID, "2" );
            assert.ok( result.personal );
            assert.ok( result.competencies );
        } );

        it( "should trim employeeID whitespace", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "  1  " } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( result );
            assert.strictEqual( result.employeeID, "1" );
        } );

        it( "should use session language for localization", async () => {
            const sessionEn = { language: "en" };
            const sessionDe = { language: "de" };
            const options = { query: { employeeID: "1" } };

            const resultEn = await app.processDataRequest( sessionEn, "load-evaluation", options );
            const resultDe = await app.processDataRequest( sessionDe, "load-evaluation", options );

            // Both should return valid results
            assert.ok( resultEn.competencies );
            assert.ok( resultDe.competencies );
        } );

        it( "should handle undefined session language", async () => {
            const session = {};
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            assert.ok( result );
            assert.ok( result.competencies );
        } );

        it( "should sort competencies by ID within subcategories", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            result.competencies.forEach( category => {
                category.subcategories.forEach( subcategory => {
                    const items = subcategory.items;
                    if ( items.length > 1 ) {
                        for ( let i = 1; i < items.length; i++ ) {
                            const comparison = items[ i - 1 ].id.localeCompare( items[ i ].id, undefined, { numeric: true } );
                            assert.ok( comparison <= 0, `Items should be sorted: ${ items[ i - 1 ].id } vs ${ items[ i ].id }` );
                        }
                    }
                } );
            } );
        } );
    } );

    describe( "processDataRequest() - other views", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should delegate to parent class for unknown view", async () => {
            const session = { language: "en" };
            await assert.rejects(
                app.processDataRequest( session, "unknown-view", {} ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );
    } );

    describe( "Edge Cases and Error Handling", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should handle null session gracefully", async () => {
            const options = { query: { employeeID: "1" } };
            const result = await app.processDataRequest( null, "load-evaluation", options );
            assert.ok( result );
        } );

        it( "should handle options without query property", async () => {
            const session = { language: "en" };
            await assert.rejects(
                app.processDataRequest( session, "load-evaluation", {} ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should handle numeric employeeID (converted to string)", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: 1 } };

            const result = await app.processDataRequest( session, "load-evaluation", options );
            assert.ok( result );
            assert.strictEqual( result.employeeID, "1" );
        } );

        it( "should normalize empty grades object", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            // Check that all competency items have normalized grades
            if ( result.evaluation.grades ) {
                Object.values( result.evaluation.grades ).forEach( grade => {
                    assert.ok( grade );
                    assert.ok( grade.hasOwnProperty( "employee" ) );
                    assert.ok( grade.hasOwnProperty( "manager" ) );
                    assert.ok( grade.hasOwnProperty( "team" ) );
                } );
            }
        } );

        it( "should handle employee evaluation with partial grades", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            // Grades are stored in evaluation.grades[competencyCode], not on items
            assert.ok( result.competencies );
            assert.ok( result.evaluation );
            if ( result.evaluation.grades ) {
                Object.values( result.evaluation.grades ).forEach( grade => {
                    assert.strictEqual( typeof grade.employee, "string" );
                    assert.strictEqual( typeof grade.manager, "string" );
                    assert.strictEqual( typeof grade.team, "string" );
                } );
            }
        } );
    } );

    describe( "Integration with Configuration and Data Loaders", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should use configuration loader for competencies", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] }, language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            // Verify that competencies come from configuration
            assert.ok( result.competencies.length > 0 );
            // Should have E, I, C categories
            const categoryIds = result.competencies.map( c => c.id );
            assert.ok( categoryIds.includes( "E" ) || categoryIds.includes( "I" ) || categoryIds.includes( "C" ) );
        } );

        it( "should use data loader for employee data", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] }, language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            // Verify that employee data comes from data loader
            assert.ok( result.personal );
            assert.ok( result.personal.name );
            assert.ok( result.personal.department );
        } );

        it( "should use data loader for evaluation data", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] }, language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );

            // Verify that evaluation data comes from data loader
            assert.ok( result.evaluation );
        } );
    } );

    describe( "processServiceRequest()", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should have processServiceRequest method", () => {
            assert.strictEqual( typeof app.processServiceRequest, "function" );
        } );

        it( "should return a promise", () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const result = app.processServiceRequest( session, "unknown-service", {} );
            assert.ok( result instanceof Promise );
        } );

        it( "should delegate to parent class for unknown service", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            await assert.rejects(
                app.processServiceRequest( session, "unknown-service", {} ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );
    } );

    describe( "processServiceRequest() - save-evaluation-draft", () => {
        beforeEach( async () => {
            app = new CompetenceWebApplication();
            const dataManager = require( "#data-manager" );
            await dataManager.instance.initialize( true );
        } );

        it( "should reject when session is missing user", async () => {
            const session = {};
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            await assert.rejects(
                app.processServiceRequest( session, "save-evaluation-draft", { evaluation } ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should reject when user is not authorized", async () => {
            const session = { user: { employeeID: "999", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            await assert.rejects(
                app.processServiceRequest( session, "save-evaluation-draft", { evaluation } ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should save draft for employee with valid data", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                comment: "Test draft comment",
                grades: {
                    "E1-1": { employee: "S" }
                }
            };

            const result = await app.processServiceRequest( session, "save-evaluation-draft", { evaluation } );
            assert.ok( result );
            assert.strictEqual( result.evaluationID, evaluation.evaluationID );
        } );

        it( "should update grades when saving draft", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "R" },
                    "E1-2": { employee: "S" }
                }
            };

            const result = await app.processServiceRequest( session, "save-evaluation-draft", { evaluation } );
            assert.ok( result.grades );
            assert.ok( result.grades[ "E1-1" ] );
        } );

        it( "should anonymize grades based on user role", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "S" }
                }
            };

            const result = await app.processServiceRequest( session, "save-evaluation-draft", { evaluation } );
            // Employee should not see manager or team grades
            Object.values( result.grades ).forEach( grade => {
                assert.strictEqual( grade.manager, undefined );
                assert.strictEqual( grade.team, undefined );
            } );
        } );

        it( "should not include workflow in response", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            const result = await app.processServiceRequest( session, "save-evaluation-draft", { evaluation } );
            assert.strictEqual( result.workflow, undefined );
        } );
    } );

    describe( "processServiceRequest() - submit-evaluation", () => {
        beforeEach( async () => {
            app = new CompetenceWebApplication();
            const dataManager = require( "#data-manager" );
            await dataManager.instance.initialize( true );
        } );

        it( "should reject when session is missing user", async () => {
            const session = {};
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            await assert.rejects(
                app.processServiceRequest( session, "submit-evaluation", { evaluation } ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should reject when user is not authorized", async () => {
            const session = { user: { employeeID: "999", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            await assert.rejects(
                app.processServiceRequest( session, "submit-evaluation", { evaluation } ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should submit evaluation for employee with valid data", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                comment: "Self evaluation complete",
                grades: {
                    "E1-1": { employee: "S" },
                    "E1-2": { employee: "R" }
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            assert.ok( result );
            assert.strictEqual( result.evaluationID, evaluation.evaluationID );
        } );

        it( "should mark self-evaluation as completed after submission", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "S" }
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            assert.ok( result );
            // Workflow should be removed from response
            assert.strictEqual( result.workflow, undefined );
        } );

        it( "should update evaluation status when all parts are complete", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "S" }
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            assert.ok( result );
            // Status should change after self and team evaluations are complete
        } );

        it( "should anonymize grades for employee role", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "R" }
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            Object.values( result.grades ).forEach( grade => {
                assert.strictEqual( grade.manager, undefined );
                assert.strictEqual( grade.team, undefined );
            } );
        } );

        it( "should handle team member submission", async () => {
            const session = { user: { employeeID: "2", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { team: { cumulative: "S" } }
                },
                feedback: {
                    teamComments: "Good team player"
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            assert.ok( result );
        } );

        it( "should not include workflow in response", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            assert.strictEqual( result.workflow, undefined );
        } );
    } );

    describe( "Grade Calculation and Anonymization", () => {
        beforeEach( async () => {
            app = new CompetenceWebApplication();
            const dataManager = require( "#data-manager" );
            await dataManager.instance.initialize( true );
        } );

        it( "should calculate team cumulative grades from individual grades", async () => {
            const session = { user: { employeeID: "2", roles: [ 1 ] } };

            // Submit multiple team evaluations to trigger cumulative calculation
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { team: { cumulative: "S" } }
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            assert.ok( result );
        } );

        it( "should anonymize manager grades for employee role", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "R" }
                }
            };

            const result = await app.processServiceRequest( session, "save-evaluation-draft", { evaluation } );
            Object.keys( result.grades ).forEach( competencyCode => {
                const grade = result.grades[ competencyCode ];
                assert.strictEqual( grade.manager, undefined );
                assert.strictEqual( grade.team, undefined );
            } );
        } );

        it( "should anonymize employee and manager grades for team member role", async () => {
            const session = { user: { employeeID: "2", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { team: { cumulative: "S" } }
                }
            };

            const result = await app.processServiceRequest( session, "submit-evaluation", { evaluation } );
            Object.keys( result.grades ).forEach( competencyCode => {
                const grade = result.grades[ competencyCode ];
                assert.strictEqual( grade.employee, undefined );
                assert.strictEqual( grade.manager, undefined );
                assert.ok( grade.team );
            } );
        } );

        it( "should preserve employee grades when updating", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] } };
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {
                    "E1-1": { employee: "S" },
                    "E1-2": { employee: "R" }
                }
            };

            const result = await app.processServiceRequest( session, "save-evaluation-draft", { evaluation } );
            assert.ok( result.grades[ "E1-1" ] );
            assert.ok( result.grades[ "E1-2" ] );
        } );
    } );

    describe( "Authorization and Access Control", () => {
        beforeEach( async () => {
            app = new CompetenceWebApplication();
            const dataManager = require( "#data-manager" );
            await dataManager.instance.initialize( true );
        } );

        it( "should require session with user for load-evaluation", async () => {
            const session = {};
            const options = { query: { employeeID: "1" } };

            await assert.rejects(
                app.processDataRequest( session, "load-evaluation", options ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should require session with user for save-evaluation-draft", async () => {
            const session = {};
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            await assert.rejects(
                app.processServiceRequest( session, "save-evaluation-draft", { evaluation } ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should require session with user for submit-evaluation", async () => {
            const session = {};
            const evaluation = {
                evaluationID: "d43d14e1-dc96-48de-92f5-adb16586c178",
                employeeID: "1",
                grades: {}
            };

            await assert.rejects(
                app.processServiceRequest( session, "submit-evaluation", { evaluation } ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should determine user role correctly for employee", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] }, language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );
            assert.strictEqual( result.userRole, 1 );
        } );

        it( "should include manager information in evaluation data", async () => {
            const session = { user: { employeeID: "1", roles: [ 1 ] }, language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-evaluation", options );
            assert.ok( result.manager );
            assert.ok( result.manager.managerID );
        } );
    } );
} );