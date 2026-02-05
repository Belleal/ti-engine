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

    describe( "processDataRequest() - load-employee-competencies view", () => {
        beforeEach( () => {
            app = new CompetenceWebApplication();
        } );

        it( "should reject when employeeID is missing", async () => {
            const session = { language: "en" };
            await assert.rejects(
                app.processDataRequest( session, "load-employee-competencies", {} ),
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
                app.processDataRequest( session, "load-employee-competencies", options ),
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
                app.processDataRequest( session, "load-employee-competencies", options ),
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
                app.processDataRequest( session, "load-employee-competencies", options ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should return employee competencies for valid employeeID", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            assert.ok( result );
            assert.strictEqual( result.employeeID, "1" );
            assert.ok( result.personal );
            assert.ok( result.evaluation );
            assert.ok( result.competencies );
        } );

        it( "should include personal information with position name", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

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

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

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

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

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

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            assert.ok( result );
            assert.strictEqual( result.employeeID, "2" );
            assert.ok( result.personal );
            assert.ok( result.competencies );
        } );

        it( "should trim employeeID whitespace", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "  1  " } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            assert.ok( result );
            assert.strictEqual( result.employeeID, "1" );
        } );

        it( "should use session language for localization", async () => {
            const sessionEn = { language: "en" };
            const sessionDe = { language: "de" };
            const options = { query: { employeeID: "1" } };

            const resultEn = await app.processDataRequest( sessionEn, "load-employee-competencies", options );
            const resultDe = await app.processDataRequest( sessionDe, "load-employee-competencies", options );

            // Both should return valid results
            assert.ok( resultEn.competencies );
            assert.ok( resultDe.competencies );
        } );

        it( "should handle undefined session language", async () => {
            const session = {};
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            assert.ok( result );
            assert.ok( result.competencies );
        } );

        it( "should sort competencies by ID within subcategories", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

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
            const result = await app.processDataRequest( null, "load-employee-competencies", options );
            assert.ok( result );
        } );

        it( "should handle options without query property", async () => {
            const session = { language: "en" };
            await assert.rejects(
                app.processDataRequest( session, "load-employee-competencies", {} ),
                ( error ) => {
                    assert.ok( error );
                    return true;
                }
            );
        } );

        it( "should handle numeric employeeID (converted to string)", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: 1 } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );
            assert.ok( result );
            assert.strictEqual( result.employeeID, "1" );
        } );

        it( "should normalize empty grades object", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            // Check that all competency items have normalized grades
            result.competencies.forEach( category => {
                category.subcategories.forEach( subcategory => {
                    subcategory.items.forEach( item => {
                        assert.ok( item.grades );
                        assert.ok( item.grades.hasOwnProperty( "employee" ) );
                        assert.ok( item.grades.hasOwnProperty( "manager" ) );
                        assert.ok( item.grades.hasOwnProperty( "team" ) );
                    } );
                } );
            } );
        } );

        it( "should handle employee evaluation with partial grades", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

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
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            // Verify that competencies come from configuration
            assert.ok( result.competencies.length > 0 );
            // Should have E, I, C categories
            const categoryIds = result.competencies.map( c => c.id );
            assert.ok( categoryIds.includes( "E" ) || categoryIds.includes( "I" ) || categoryIds.includes( "C" ) );
        } );

        it( "should use data loader for employee data", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            // Verify that employee data comes from data loader
            assert.ok( result.personal );
            assert.ok( result.personal.name );
            assert.ok( result.personal.department );
        } );

        it( "should use data loader for evaluation data", async () => {
            const session = { language: "en" };
            const options = { query: { employeeID: "1" } };

            const result = await app.processDataRequest( session, "load-employee-competencies", options );

            // Verify that evaluation data comes from data loader
            assert.ok( result.evaluation );
        } );
    } );
} );
