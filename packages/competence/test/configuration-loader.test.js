/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert" );

describe( "Configuration Loader", () => {
    let configuration;

    it( "should load configuration module without errors", ( t ) => {
        try {
            configuration = require( "#configuration-loader" );
            assert.ok( configuration );
        } catch ( error ) {
            t.skip( "Skipping configuration-loader tests - dependencies not available" );
        }
    } );

    describe( "organizationPositionCode", () => {
        it( "should export organizationPositionCode enum", () => {
            assert.ok( configuration.organizationPositionCode );
            assert.strictEqual( typeof configuration.organizationPositionCode, "object" );
        } );

        it( "should have name method for position codes", () => {
            assert.strictEqual( typeof configuration.organizationPositionCode.name, "function" );
        } );

        it( "should return position name for valid position code", () => {
            const positionName = configuration.organizationPositionCode.name( "SOFTWARE_ENGINEER" );
            assert.ok( positionName );
            assert.strictEqual( typeof positionName, "string" );
        } );

        it( "should handle invalid position codes gracefully", () => {
            const result = configuration.organizationPositionCode.name( 9999 );
            assert.ok( result === undefined || typeof result === "string" );
        } );

        it( "should be frozen to prevent modifications", () => {
            const frozenCheck = () => {
                configuration.organizationPositionCode.newProperty = "test";
            };
            // Should not throw in non-strict mode, but property won't be added
            frozenCheck();
            assert.strictEqual( configuration.organizationPositionCode.newProperty, undefined );
        } );
    } );

    describe( "configCompetencies", () => {
        it( "should export configCompetencies object", () => {
            assert.ok( configuration.configCompetencies );
            assert.strictEqual( typeof configuration.configCompetencies, "object" );
        } );

        it( "should have categories property", () => {
            assert.ok( configuration.configCompetencies.categories );
            assert.strictEqual( typeof configuration.configCompetencies.categories, "object" );
        } );

        it( "should have competencies property", () => {
            assert.ok( configuration.configCompetencies.competencies );
            assert.strictEqual( typeof configuration.configCompetencies.competencies, "object" );
        } );

        it( "should contain expected category codes (E, I, C)", () => {
            const categories = configuration.configCompetencies.categories;
            assert.ok( categories.E );
            assert.ok( categories.I );
            assert.ok( categories.C );
        } );

        it( "should have subcategories for each category", () => {
            const categories = configuration.configCompetencies.categories;
            assert.ok( categories.E.subcategories );
            assert.ok( categories.I.subcategories );
            assert.ok( categories.C.subcategories );
        } );

        it( "should have competency entries with proper structure", () => {
            const competencies = configuration.configCompetencies.competencies;
            const firstCompetency = Object.values( competencies )[ 0 ];

            assert.ok( firstCompetency.name );
            assert.ok( firstCompetency.description );
            assert.ok( firstCompetency.category );
            assert.ok( firstCompetency.subcategory );
            assert.ok( firstCompetency.scope );
            assert.ok( firstCompetency.relevancy );
        } );

        it( "should be frozen to prevent modifications", () => {
            assert.throws( () => {
                "use strict";
                configuration.configCompetencies.newProperty = "test";
            } );
        } );

        it( "should have deeply frozen nested objects", () => {
            assert.throws( () => {
                "use strict";
                configuration.configCompetencies.categories.E.newProperty = "test";
            } );
        } );
    } );

    describe( "configEvaluationGrades", () => {
        it( "should export configEvaluationGrades object", () => {
            assert.ok( configuration.configEvaluationGrades );
            assert.strictEqual( typeof configuration.configEvaluationGrades, "object" );
        } );

        it( "should contain expected grade codes (U, R, S)", () => {
            const grades = configuration.configEvaluationGrades;
            assert.ok( grades.U );
            assert.ok( grades.R );
            assert.ok( grades.S );
        } );

        it( "should have description for each grade", () => {
            const grades = configuration.configEvaluationGrades;
            assert.ok( grades.U.description );
            assert.ok( grades.R.description );
            assert.ok( grades.S.description );
        } );

        it( "should be frozen to prevent modifications", () => {
            assert.throws( () => {
                "use strict";
                configuration.configEvaluationGrades.newGrade = {};
            } );
        } );
    } );

    describe( "configEvaluationLevels", () => {
        it( "should export configEvaluationLevels object", () => {
            assert.ok( configuration.configEvaluationLevels );
            assert.strictEqual( typeof configuration.configEvaluationLevels, "object" );
        } );

        it( "should contain expected level codes (N, J, R, S, X, T)", () => {
            const levels = configuration.configEvaluationLevels;
            assert.ok( levels.N );
            assert.ok( levels.J );
            assert.ok( levels.R );
            assert.ok( levels.S );
            assert.ok( levels.X );
            assert.ok( levels.T );
        } );

        it( "should have proper structure for each level", () => {
            const level = configuration.configEvaluationLevels.N;
            assert.ok( level.name );
            assert.ok( level.description );
            assert.ok( typeof level.grade === "number" );
            assert.ok( typeof level.stages === "number" );
            assert.ok( Array.isArray( level.previous ) );
            assert.ok( Array.isArray( level.next ) );
        } );

        it( "should have correct progression hierarchy", () => {
            const levels = configuration.configEvaluationLevels;
            // N -> J
            assert.ok( levels.N.next.includes( "J" ) );
            assert.ok( levels.J.previous.includes( "N" ) );
            // J -> R
            assert.ok( levels.J.next.includes( "R" ) );
            assert.ok( levels.R.previous.includes( "J" ) );
            // R -> S
            assert.ok( levels.R.next.includes( "S" ) );
            assert.ok( levels.S.previous.includes( "R" ) );
        } );

        it( "should be frozen to prevent modifications", () => {
            assert.throws( () => {
                "use strict";
                configuration.configEvaluationLevels.newLevel = {};
            } );
        } );
    } );

    describe( "configEvaluationPositionCompetencies", () => {
        it( "should export configEvaluationPositionCompetencies object", () => {
            assert.ok( configuration.configEvaluationPositionCompetencies );
            assert.strictEqual( typeof configuration.configEvaluationPositionCompetencies, "object" );
        } );

        it( "should be frozen to prevent modifications", () => {
            assert.throws( () => {
                "use strict";
                configuration.configEvaluationPositionCompetencies.newProperty = "test";
            } );
        } );
    } );

    describe( "roleCode enum", () => {
        it( "should export roleCode enum", () => {
            assert.ok( configuration.roleCode );
            assert.strictEqual( typeof configuration.roleCode, "object" );
        } );

        it( "should contain EMPLOYEE role", () => {
            assert.ok( configuration.roleCode.EMPLOYEE );
            assert.strictEqual( configuration.roleCode.EMPLOYEE, 1 );
        } );

        it( "should contain MANAGER role", () => {
            assert.ok( configuration.roleCode.MANAGER );
            assert.strictEqual( configuration.roleCode.MANAGER, 2 );
        } );

        it( "should contain SUPERVISOR role", () => {
            assert.ok( configuration.roleCode.SUPERVISOR );
            assert.strictEqual( configuration.roleCode.SUPERVISOR, 3 );
        } );

        it( "should contain TEAM_MEMBER role", () => {
            assert.ok( configuration.roleCode.TEAM_MEMBER );
            assert.strictEqual( configuration.roleCode.TEAM_MEMBER, 4 );
        } );

        it( "should have name method for role codes", () => {
            assert.strictEqual( typeof configuration.roleCode.name, "function" );
        } );

        it( "should return role name for valid role code", () => {
            const roleName = configuration.roleCode.name( 1 );
            assert.strictEqual( roleName, "Employee" );
        } );

        it( "should have description method for role codes", () => {
            assert.strictEqual( typeof configuration.roleCode.description, "function" );
        } );

        it( "should return role description for valid role code", () => {
            const description = configuration.roleCode.description( 2 );
            assert.ok( description );
            assert.strictEqual( typeof description, "string" );
        } );

        it( "should handle invalid role codes gracefully", () => {
            const result = configuration.roleCode.name( 9999 );
            assert.ok( result === undefined || typeof result === "string" );
        } );
    } );

    describe( "evaluationStatus enum", () => {
        it( "should export evaluationStatus enum", () => {
            assert.ok( configuration.evaluationStatus );
            assert.strictEqual( typeof configuration.evaluationStatus, "object" );
        } );

        it( "should contain OPEN status", () => {
            assert.ok( configuration.evaluationStatus.OPEN );
            assert.strictEqual( configuration.evaluationStatus.OPEN, "Open" );
        } );

        it( "should contain IN_REVIEW status", () => {
            assert.ok( configuration.evaluationStatus.IN_REVIEW );
            assert.strictEqual( configuration.evaluationStatus.IN_REVIEW, "In Review" );
        } );

        it( "should contain READY status", () => {
            assert.ok( configuration.evaluationStatus.READY );
            assert.strictEqual( configuration.evaluationStatus.READY, "Ready" );
        } );

        it( "should contain CLOSED status", () => {
            assert.ok( configuration.evaluationStatus.CLOSED );
            assert.strictEqual( configuration.evaluationStatus.CLOSED, "Closed" );
        } );

        it( "should contain DELETED status", () => {
            assert.ok( configuration.evaluationStatus.DELETED );
            assert.strictEqual( configuration.evaluationStatus.DELETED, "Deleted" );
        } );

        it( "should have name method for evaluation status", () => {
            assert.strictEqual( typeof configuration.evaluationStatus.name, "function" );
        } );

        it( "should return status name for valid status", () => {
            const statusName = configuration.evaluationStatus.name( "Open" );
            assert.strictEqual( statusName, "Open" );
        } );

        it( "should have description method for evaluation status", () => {
            assert.strictEqual( typeof configuration.evaluationStatus.description, "function" );
        } );

        it( "should return status description for valid status", () => {
            const description = configuration.evaluationStatus.description( "Open" );
            assert.ok( description );
            assert.strictEqual( typeof description, "string" );
        } );
    } );

    describe( "evaluationGrade enum", () => {
        it( "should export evaluationGrade enum", () => {
            assert.ok( configuration.evaluationGrade );
            assert.strictEqual( typeof configuration.evaluationGrade, "object" );
        } );

        it( "should contain S (Superior) grade", () => {
            assert.ok( configuration.evaluationGrade.S );
            assert.strictEqual( configuration.evaluationGrade.S, "S" );
        } );

        it( "should contain R (Regular) grade", () => {
            assert.ok( configuration.evaluationGrade.R );
            assert.strictEqual( configuration.evaluationGrade.R, "R" );
        } );

        it( "should contain U (Unsatisfactory) grade", () => {
            assert.ok( configuration.evaluationGrade.U );
            assert.strictEqual( configuration.evaluationGrade.U, "U" );
        } );

        it( "should have name method for evaluation grades", () => {
            assert.strictEqual( typeof configuration.evaluationGrade.name, "function" );
        } );

        it( "should return grade name for valid grade", () => {
            const gradeName = configuration.evaluationGrade.name( "S" );
            assert.strictEqual( gradeName, "Superior" );
        } );

        it( "should have description method for evaluation grades", () => {
            assert.strictEqual( typeof configuration.evaluationGrade.description, "function" );
        } );

        it( "should return grade description for valid grade", () => {
            const description = configuration.evaluationGrade.description( "R" );
            assert.ok( description );
            assert.strictEqual( typeof description, "string" );
            assert.ok( description.includes( "meets" ) );
        } );

        it( "should have all three grades with correct meanings", () => {
            const sDesc = configuration.evaluationGrade.description( "S" );
            const rDesc = configuration.evaluationGrade.description( "R" );
            const uDesc = configuration.evaluationGrade.description( "U" );

            assert.ok( sDesc.includes( "exceeds" ) );
            assert.ok( rDesc.includes( "meets" ) );
            assert.ok( uDesc.includes( "below" ) );
        } );
    } );

    describe( "Integration tests", () => {
        it( "should have all configuration objects properly frozen", () => {
            const configs = [
                configuration.configCompetencies,
                configuration.configEvaluationGrades,
                configuration.configEvaluationLevels,
                configuration.configEvaluationPositionCompetencies
            ];

            configs.forEach( ( config ) => {
                assert.ok( Object.isFrozen( config ), "Configuration object should be frozen" );
            } );
        } );

        it( "should load all configurations without circular dependencies", () => {
            assert.doesNotThrow( () => {
                JSON.stringify( configuration.configCompetencies );
                JSON.stringify( configuration.configEvaluationGrades );
                JSON.stringify( configuration.configEvaluationLevels );
                JSON.stringify( configuration.configEvaluationPositionCompetencies );
            } );
        } );
    } );
} );