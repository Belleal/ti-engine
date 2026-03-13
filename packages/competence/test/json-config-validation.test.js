/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert" );
const path = require( "node:path" );
const fs = require( "node:fs" );

describe( "JSON Configuration Files Validation", () => {
    const configDir = path.join( __dirname, "../bin/config" );
    const dataDir = path.join( __dirname, "../bin/data" );

    describe( "competencies.json", () => {
        let competencies;
        const filePath = path.join( configDir, "competencies.json" );

        before( () => {
            assert.ok( fs.existsSync( filePath ), "competencies.json should exist" );
            competencies = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
        } );

        it( "should exist and be valid JSON", () => {
            assert.doesNotThrow(
                () => JSON.parse( fs.readFileSync( filePath, "utf8" ) ),
                "competencies.json should be valid JSON"
            );
        } );

        it( "should have categories and competencies properties", () => {
            assert.ok( competencies.categories, "Should have categories property" );
            assert.ok( competencies.competencies, "Should have competencies property" );
            assert.strictEqual( typeof competencies.categories, "object" );
            assert.strictEqual( typeof competencies.competencies, "object" );
        } );

        it( "should have valid category structure", () => {
            Object.entries( competencies.categories ).forEach( ( [ categoryId, category ] ) => {
                assert.ok( category.name, `Category ${ categoryId } should have name` );
                assert.ok( category.description, `Category ${ categoryId } should have description` );
                assert.ok( category.subcategories, `Category ${ categoryId } should have subcategories` );
                assert.strictEqual( typeof category.subcategories, "object" );
            } );
        } );

        it( "should have valid competency structure", () => {
            const filePath = path.join( configDir, "competencies.json" );
            competencies = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( competencies.competencies ).forEach( ( [ competencyId, competency ] ) => {
                assert.ok( competency.name, `Competency ${ competencyId } should have name` );
                assert.ok( competency.description, `Competency ${ competencyId } should have description` );
                assert.ok( competency.category, `Competency ${ competencyId } should have category` );
                assert.ok( competency.subcategory, `Competency ${ competencyId } should have subcategory` );
                assert.ok( competency.scope, `Competency ${ competencyId } should have scope` );
                assert.ok( competency.relevancy, `Competency ${ competencyId } should have relevancy` );
            } );
        } );

        it( "should have consistent category references", () => {
            const filePath = path.join( configDir, "competencies.json" );
            competencies = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( competencies.competencies ).forEach( ( [ competencyId, competency ] ) => {
                assert.ok(
                    competencies.categories[ competency.category ],
                    `Competency ${ competencyId } references non-existent category ${ competency.category }`
                );
            } );
        } );

        it( "should have consistent subcategory references", () => {
            const filePath = path.join( configDir, "competencies.json" );
            competencies = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( competencies.competencies ).forEach( ( [ competencyId, competency ] ) => {
                const category = competencies.categories[ competency.category ];
                assert.ok(
                    category && category.subcategories[ competency.subcategory ],
                    `Competency ${ competencyId } references non-existent subcategory ${ competency.subcategory }`
                );
            } );
        } );
    } );

    describe( "grades.json", () => {
        let grades;

        it( "should exist and be valid JSON", () => {
            const filePath = path.join( configDir, "grades.json" );
            assert.ok( fs.existsSync( filePath ), "grades.json should exist" );

            const content = fs.readFileSync( filePath, "utf8" );
            assert.doesNotThrow( () => {
                grades = JSON.parse( content );
            }, "grades.json should be valid JSON" );
        } );

        it( "should have expected grade codes", () => {
            const filePath = path.join( configDir, "grades.json" );
            grades = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            assert.ok( grades.U, "Should have U grade" );
            assert.ok( grades.R, "Should have R grade" );
            assert.ok( grades.S, "Should have S grade" );
        } );

        it( "should have description for each grade", () => {
            const filePath = path.join( configDir, "grades.json" );
            grades = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( grades ).forEach( ( [ gradeId, grade ] ) => {
                assert.ok( grade.description, `Grade ${ gradeId } should have description` );
            } );
        } );
    } );

    describe( "positionLevels.json", () => {
        let levels;

        it( "should exist and be valid JSON", () => {
            const filePath = path.join( configDir, "positionLevels.json" );
            assert.ok( fs.existsSync( filePath ), "positionLevels.json should exist" );

            const content = fs.readFileSync( filePath, "utf8" );
            assert.doesNotThrow( () => {
                levels = JSON.parse( content );
            }, "positionLevels.json should be valid JSON" );
        } );

        it( "should have expected level codes", () => {
            const filePath = path.join( configDir, "positionLevels.json" );
            levels = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            const expectedLevels = [ "N", "J", "R", "S", "X", "T" ];
            expectedLevels.forEach( levelCode => {
                assert.ok( levels[ levelCode ], `Should have ${ levelCode } level` );
            } );
        } );

        it( "should have valid level structure", () => {
            const filePath = path.join( configDir, "positionLevels.json" );
            levels = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( levels ).forEach( ( [ levelId, level ] ) => {
                assert.ok( level.name, `Level ${ levelId } should have name` );
                assert.ok( level.description, `Level ${ levelId } should have description` );
                assert.ok( typeof level.grade === "number", `Level ${ levelId } should have numeric grade` );
                assert.ok( typeof level.stages === "number", `Level ${ levelId } should have numeric stages` );
                assert.ok( Array.isArray( level.previous ), `Level ${ levelId } should have previous array` );
                assert.ok( Array.isArray( level.next ), `Level ${ levelId } should have next array` );
            } );
        } );

        it( "should have valid progression links", () => {
            const filePath = path.join( configDir, "positionLevels.json" );
            levels = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( levels ).forEach( ( [ levelId, level ] ) => {
                level.previous.forEach( prevId => {
                    assert.ok( levels[ prevId ], `Level ${ levelId } references non-existent previous level ${ prevId }` );
                } );
                level.next.forEach( nextId => {
                    assert.ok( levels[ nextId ], `Level ${ levelId } references non-existent next level ${ nextId }` );
                } );
            } );
        } );
    } );

    describe( "positions.json", () => {
        let positions;

        it( "should exist and be valid JSON", () => {
            const filePath = path.join( configDir, "positions.json" );
            assert.ok( fs.existsSync( filePath ), "positions.json should exist" );

            const content = fs.readFileSync( filePath, "utf8" );
            assert.doesNotThrow( () => {
                positions = JSON.parse( content );
            }, "positions.json should be valid JSON" );
        } );

        it( "should have valid position structure", () => {
            const filePath = path.join( configDir, "positions.json" );
            positions = JSON.parse( fs.readFileSync( filePath, "utf8" ) );

            Object.entries( positions ).forEach( ( [ positionKey, positionData ] ) => {
                assert.ok( Array.isArray( positionData ), `Position ${ positionKey } should be an array` );
                assert.strictEqual( positionData.length, 3, `Position ${ positionKey } should have 3 elements` );
                assert.ok( typeof positionData[ 0 ] === "string", "First element should be position ID number" );
                assert.ok( typeof positionData[ 1 ] === "string", "Second element should be position name" );
                assert.ok( typeof positionData[ 2 ] === "string", "Third element should be position description" );
            } );
        } );
    } );

    describe( "roles (now in configuration-loader)", () => {
        it( "should be available as roleCode enum in configuration-loader", () => {
            const configLoader = require( "#configuration-loader" );
            assert.ok( configLoader.roleCode, "roleCode should be exported from configuration-loader" );
            assert.ok( configLoader.roleCode.EMPLOYEE, "Should have EMPLOYEE role" );
            assert.ok( configLoader.roleCode.MANAGER, "Should have MANAGER role" );
            assert.ok( configLoader.roleCode.SUPERVISOR, "Should have SUPERVISOR role" );
            assert.ok( configLoader.roleCode.TEAM_MEMBER, "Should have TEAM_MEMBER role" );
        } );

        it( "should have valid role values", () => {
            const configLoader = require( "#configuration-loader" );
            assert.strictEqual( configLoader.roleCode.EMPLOYEE, 1 );
            assert.strictEqual( configLoader.roleCode.MANAGER, 2 );
            assert.strictEqual( configLoader.roleCode.SUPERVISOR, 3 );
            assert.strictEqual( configLoader.roleCode.TEAM_MEMBER, 4 );
        } );
    } );

    describe( "positionCompetencies.json", () => {
        let positionCompetencies;
        it( "should exist and be valid JSON", () => {
            const filePath = path.join( configDir, "positionCompetencies.json" );
            assert.ok( fs.existsSync( filePath ), "positionCompetencies.json should exist" );
            const content = fs.readFileSync( filePath, "utf8" );
            assert.doesNotThrow( () => {
                positionCompetencies = JSON.parse( content );
            }, "positionCompetencies.json should be valid JSON" );
        } );
        it( "should have competency mappings for positions", () => {
            const filePath = path.join( configDir, "positionCompetencies.json" );
            positionCompetencies = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
            assert.ok( Object.keys( positionCompetencies ).length > 0, "Should have at least one position mapping" );
            Object.entries( positionCompetencies ).forEach( ( [ position, levelMappings ] ) => {
                assert.ok(
                    levelMappings && !Array.isArray( levelMappings ),
                    `${ position } should have level mappings object`
                );
                Object.entries( levelMappings ).forEach( ( [ level, competencies ] ) => {
                    assert.ok( Array.isArray( competencies ), `${ position }.${ level } should be an array of competencies` );
                    competencies.forEach( competency => {
                        assert.strictEqual( typeof competency, "string", "Competency ID should be a string" );
                    } );
                } );
            } );
        } );
    } );

    describe( "employees.json (moved to seeders)", () => {
        let employees;
        it( "should exist and be valid JSON", () => {
            const filePath = path.join( dataDir, "seeders", "employees.json" );
            assert.ok( fs.existsSync( filePath ), "employees.json should exist in seeders" );
            const content = fs.readFileSync( filePath, "utf8" );
            assert.doesNotThrow( () => {
                employees = JSON.parse( content );
            }, "employees.json should be valid JSON" );
        } );
        it( "should have employees array", () => {
            const filePath = path.join( dataDir, "seeders", "employees.json" );
            employees = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
            assert.ok( employees.employees, "Should have employees property" );
            assert.ok( Array.isArray( employees.employees ), "employees should be an array" );
        } );
        it( "should have valid employee structure", () => {
            const filePath = path.join( dataDir, "seeders", "employees.json" );
            employees = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
            employees.employees.forEach( ( employee, index ) => {
                assert.ok(
                    employee.employeeID !== undefined && employee.employeeID !== null,
                    `Employee ${ index } should have employeeID`
                );
                assert.ok( employee.personal, `Employee ${ index } should have personal info` );
                assert.ok( employee.personal.name, `Employee ${ index } should have name` );
                assert.ok( typeof employee.personal.position === "string", `Employee ${ index } should have enum position` );
                assert.ok( employee.personal.department, `Employee ${ index } should have department` );
                assert.ok( employee.manager, `Employee ${ index } should have manager info` );
                assert.ok( employee.manager.managerID, `Employee ${ index } should have managerID` );
                assert.ok( employee.personal.level, `Employee ${ index } should have level` );
                assert.ok( typeof employee.personal.stage === "number", `Employee ${ index } should have number stage` );
                const startingDate = new Date( employee.personal.startingDate );
                assert.ok(
                    !Number.isNaN( startingDate.getTime() ),
                    `Employee ${ index } should have proper starting date`
                );
                assert.strictEqual(
                    typeof employee.personal.level,
                    "string",
                    `Employee ${ index } should have level`
                );
            } );
        } );
    } );

    describe( "evaluations.json (moved to seeders)", () => {
        let evaluations;
        it( "should exist and be valid JSON", () => {
            const filePath = path.join( dataDir, "seeders", "evaluations.json" );
            assert.ok( fs.existsSync( filePath ), "evaluations.json should exist in seeders" );
            const content = fs.readFileSync( filePath, "utf8" );
            assert.doesNotThrow( () => {
                evaluations = JSON.parse( content );
            }, "evaluations.json should be valid JSON" );
        } );
        it( "should have evaluations array", () => {
            const filePath = path.join( dataDir, "seeders", "evaluations.json" );
            evaluations = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
            assert.ok( evaluations.evaluations, "Should have evaluations property" );
            assert.ok( Array.isArray( evaluations.evaluations ), "evaluations should be an array" );
        } );
        it( "should have valid evaluation structure", () => {
            const filePath = path.join( dataDir, "seeders", "evaluations.json" );
            evaluations = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
            evaluations.evaluations.forEach( ( evaluation, index ) => {
                assert.ok( evaluation.evaluationID, `Evaluation ${ index } should have evaluationID` );
                assert.ok(
                    evaluation.employeeID !== undefined && evaluation.employeeID !== null,
                    `Evaluation ${ index } should have employeeID`
                );
                assert.ok( evaluation.cycleID, `Evaluation ${ index } should have cycleID` );
                assert.ok( evaluation.cycleDate, `Evaluation ${ index } should have cycleDate` );
                assert.ok( evaluation.grades, `Evaluation ${ index } should have grades` );
                assert.strictEqual( typeof evaluation.grades, "object", "grades should be an object" );
            } );
        } );
        it( "should have valid grade structure in evaluations", () => {
            const filePath = path.join( dataDir, "seeders", "evaluations.json" );
            evaluations = JSON.parse( fs.readFileSync( filePath, "utf8" ) );
            evaluations.evaluations.forEach( ( evaluation, evalIndex ) => {
                Object.entries( evaluation.grades ).forEach( ( [ competencyId, grade ] ) => {
                    assert.ok( grade.hasOwnProperty( "employee" ), `Evaluation ${ evalIndex }, competency ${ competencyId } should have employee grade` );
                    assert.ok( grade.hasOwnProperty( "manager" ), `Evaluation ${ evalIndex }, competency ${ competencyId } should have manager grade` );
                    assert.ok( grade.hasOwnProperty( "team" ), `Evaluation ${ evalIndex }, competency ${ competencyId } should have team grade` );
                    // Validate new team structure with cumulative and individual
                    assert.ok( typeof grade.team === "object", `Evaluation ${ evalIndex }, competency ${ competencyId } team should be an object` );
                    assert.ok( grade.team.hasOwnProperty( "cumulative" ), `Evaluation ${ evalIndex }, competency ${ competencyId } team should have cumulative grade` );
                    assert.ok( grade.team.hasOwnProperty( "individual" ), `Evaluation ${ evalIndex }, competency ${ competencyId } team should have individual grades array` );
                    assert.ok( Array.isArray( grade.team.individual ), `Evaluation ${ evalIndex }, competency ${ competencyId } team.individual should be an array` );
                } );
            } );
        } );
    } );

    describe( "Cross-file Data Consistency", () => {
        it( "should have consistent employee-evaluation relationships", () => {
            const employeesPath = path.join( dataDir, "seeders", "employees.json" );
            const evaluationsPath = path.join( dataDir, "seeders", "evaluations.json" );

            const employees = JSON.parse( fs.readFileSync( employeesPath, "utf8" ) );
            const evaluations = JSON.parse( fs.readFileSync( evaluationsPath, "utf8" ) );

            const employeeIds = new Set( employees.employees.map( e => e.employeeID ) );

            evaluations.evaluations.forEach( ( evaluation, index ) => {
                assert.ok(
                    employeeIds.has( evaluation.employeeID ),
                    `Evaluation ${ index } references non-existent employee ${ evaluation.employeeID }`
                );
            } );
        } );

        it( "should have consistent competency references in evaluations", () => {
            const competenciesPath = path.join( configDir, "competencies.json" );
            const evaluationsPath = path.join( dataDir, "seeders", "evaluations.json" );

            const competenciesConfig = JSON.parse( fs.readFileSync( competenciesPath, "utf8" ) );
            const evaluations = JSON.parse( fs.readFileSync( evaluationsPath, "utf8" ) );

            const validCompetencyIds = new Set( Object.keys( competenciesConfig.competencies ) );

            evaluations.evaluations.forEach( ( evaluation, evalIndex ) => {
                Object.keys( evaluation.grades ).forEach( competencyId => {
                    assert.ok(
                        validCompetencyIds.has( competencyId ),
                        `Evaluation ${ evalIndex } references non-existent competency ${ competencyId }`
                    );
                } );
            } );
        } );
    } );
} );