/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const Ajv = require( "ajv" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const CONFIG_DIR = path.join( PACKAGE_ROOT, "bin", "config" );
const SEEDERS_DIR = path.join( PACKAGE_ROOT, "bin", "data", "seeders" );
const SCHEMAS_DIR = path.join( PACKAGE_ROOT, "bin", "data", "schemas" );

/**
 * Reads and parses a JSON file. Throws a descriptive error if the file is missing or malformed.
 */
function readJSON( filePath ) {
    return JSON.parse( fs.readFileSync( filePath, "utf8" ) );
}

/**
 * Builds an Ajv instance preloaded with every schema in `bin/data/schemas/` so cross-schema `$ref`s resolve. Schemas
 * are keyed by their URL `$id`; the package-local `config.application.schema.json` (which has no `$id`) is keyed by its
 * filename — the stable key that `config.application.json`'s relative `$schema` reference resolves to.
 */
function buildAjv() {
    // ajv 6 (shipped via the workspace) supports JSON Schema Draft-07 as a strict superset of what we use. Our
    // schema files declare Draft 2020-12 in `$schema` for editor support, but ajv 6 doesn't know that meta-schema
    // URL — strip the annotation and tell ajv to skip schema-against-meta validation so it just uses Draft-07.
    const ajv = new Ajv( {
        allErrors: true,
        schemaId: "$id",
        meta: true,
        validateSchema: false
    } );

    function loadSchema( filePath ) {
        const schema = readJSON( filePath );
        // Strip declarations the ajv-6 meta-schema cannot resolve; the structural validation is Draft-07 compatible.
        if ( schema.$schema && schema.$schema.includes( "draft/2020-12" ) ) {
            delete schema.$schema;
        }
        return schema;
    }

    // Pre-load every schema in the schemas folder so $ref by $id resolves correctly. Schemas with a URL $id are keyed
    // by it; the package-local application schema has no $id, so it is keyed by its filename (the stable key that the
    // relative $schema reference inside config.application.json resolves to).
    for ( const entry of fs.readdirSync( SCHEMAS_DIR ) ) {
        if ( !entry.endsWith( ".schema.json" ) ) continue;
        const schema = loadSchema( path.join( SCHEMAS_DIR, entry ) );
        if ( schema.$id ) {
            ajv.addSchema( schema );
        } else {
            ajv.addSchema( schema, entry );
        }
    }

    return ajv;
}

let ajv;

before( () => {
    ajv = buildAjv();
} );

/**
 * Helper to assert a config file validates against the given schema $id (or local key).
 */
function expectValid( schemaKey, dataPath ) {
    const validate = ajv.getSchema( schemaKey );
    assert.ok( validate, `Schema '${ schemaKey }' must be loaded.` );
    const data = readJSON( dataPath );
    const ok = validate( data );
    if ( !ok ) {
        const details = ( validate.errors || [] ).map( ( e ) => `${ e.dataPath || e.instancePath || "<root>" } ${ e.message } (params: ${ JSON.stringify( e.params ) })` ).join( "\n  " );
        assert.fail( `${ path.basename( dataPath ) } failed validation against '${ schemaKey }':\n  ${ details }` );
    }
}

describe( "Configuration files validate against their schemas", () => {

    it( "config.application.json validates against config.application.schema.json", () => {
        expectValid( "config.application.schema.json", path.join( CONFIG_DIR, "config.application.json" ) );
    } );

    it( "config.competencies.json validates against competencies.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/competencies.json", path.join( CONFIG_DIR, "config.competencies.json" ) );
    } );

    it( "config.relevancy-archetypes.json validates against relevancy-archetypes.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/relevancy-archetypes.json", path.join( CONFIG_DIR, "config.relevancy-archetypes.json" ) );
    } );

    it( "config.role-families.json validates against role-families.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/role-families.json", path.join( CONFIG_DIR, "config.role-families.json" ) );
    } );

    it( "config.active-competency-sets.json validates against active-competency-sets.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/active-competency-sets.json", path.join( CONFIG_DIR, "config.active-competency-sets.json" ) );
    } );

    it( "config.stage-levels.json validates against stage-levels.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/stage-levels.json", path.join( CONFIG_DIR, "config.stage-levels.json" ) );
    } );

    it( "config.role-family-competencies.json validates against role-family-competencies.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/role-family-competencies.json", path.join( CONFIG_DIR, "config.role-family-competencies.json" ) );
    } );

} );

describe( "Seed data files validate against their schemas", () => {

    it( "seeders/employees.json validates against employees.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/employees.json", path.join( SEEDERS_DIR, "employees.json" ) );
    } );

    it( "seeders/evaluations.json validates against evaluations.schema.json", () => {
        expectValid( "https://ti-engine.dev/schemas/competence/evaluations.json", path.join( SEEDERS_DIR, "evaluations.json" ) );
    } );

} );

describe( "Active competency sets satisfy floor coverage for the seeded cycle", () => {

    const SUBCATEGORIES = [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ];

    it( "every configured baseline covers all nine subcategories", () => {
        const competencies = readJSON( path.join( CONFIG_DIR, "config.competencies.json" ) ).competencies;
        const sets = readJSON( path.join( CONFIG_DIR, "config.active-competency-sets.json" ) );

        const failures = [];
        for ( const [ family, familyEntry ] of Object.entries( sets ) ) {
            if ( !familyEntry || !familyEntry.baseline ) continue;
            for ( const [ cycleID, codes ] of Object.entries( familyEntry.baseline ) ) {
                const covered = new Set();
                for ( const code of codes ) {
                    const comp = competencies[ code ];
                    if ( !comp ) {
                        failures.push( `${ family } baseline ${ cycleID }: unknown competency code '${ code }'` );
                        continue;
                    }
                    covered.add( comp.subcategory );
                }
                for ( const sub of SUBCATEGORIES ) {
                    if ( !covered.has( sub ) ) {
                        failures.push( `${ family } baseline ${ cycleID }: subcategory '${ sub }' is missing` );
                    }
                }
            }
        }
        assert.deepEqual( failures, [], `Floor-coverage failures:\n  ${ failures.join( "\n  " ) }` );
    } );

    it( "every specialization references existing competency codes only", () => {
        const competencies = readJSON( path.join( CONFIG_DIR, "config.competencies.json" ) ).competencies;
        const sets = readJSON( path.join( CONFIG_DIR, "config.active-competency-sets.json" ) );
        const failures = [];
        for ( const [ family, familyEntry ] of Object.entries( sets ) ) {
            for ( const [ key, cycleMap ] of Object.entries( familyEntry ) ) {
                for ( const [ cycleID, codes ] of Object.entries( cycleMap ) ) {
                    for ( const code of codes ) {
                        if ( !competencies[ code ] ) {
                            failures.push( `${ family }.${ key }.${ cycleID }: unknown competency code '${ code }'` );
                        }
                    }
                }
            }
        }
        assert.deepEqual( failures, [], `Unknown-code failures:\n  ${ failures.join( "\n  " ) }` );
    } );

    it( "every specialization key referenced under a family is a valid specialization of that family", () => {
        const roleFamilies = readJSON( path.join( CONFIG_DIR, "config.role-families.json" ) );
        const sets = readJSON( path.join( CONFIG_DIR, "config.active-competency-sets.json" ) );
        const failures = [];
        for ( const [ family, familyEntry ] of Object.entries( sets ) ) {
            const validSpecs = new Set( Object.keys( roleFamilies[ family ]?.specializations || {} ) );
            for ( const key of Object.keys( familyEntry ) ) {
                if ( key === "baseline" ) continue;
                if ( !validSpecs.has( key ) ) {
                    failures.push( `${ family }.${ key }: not a valid specialization of '${ family }'` );
                }
            }
        }
        assert.deepEqual( failures, [], `Invalid specialization key failures:\n  ${ failures.join( "\n  " ) }` );
    } );

} );

describe( "Role-family competency pool integrity", () => {

    it( "every pool code exists in the dictionary", () => {
        const competencies = readJSON( path.join( CONFIG_DIR, "config.competencies.json" ) ).competencies;
        const pool = readJSON( path.join( CONFIG_DIR, "config.role-family-competencies.json" ) );
        const failures = [];
        for ( const [ family, codes ] of Object.entries( pool ) ) {
            for ( const code of codes ) {
                if ( !competencies[ code ] ) {
                    failures.push( `${ family }: unknown competency code '${ code }'` );
                }
            }
        }
        assert.deepEqual( failures, [], `Pool unknown-code failures:\n  ${ failures.join( "\n  " ) }` );
    } );

    it( "every pool family is a defined role family", () => {
        const roleFamilies = readJSON( path.join( CONFIG_DIR, "config.role-families.json" ) );
        const pool = readJSON( path.join( CONFIG_DIR, "config.role-family-competencies.json" ) );
        const failures = Object.keys( pool ).filter( ( family ) => !roleFamilies[ family ] ).map( ( family ) => `'${ family }' is not a defined role family` );
        assert.deepEqual( failures, [], `Pool unknown-family failures:\n  ${ failures.join( "\n  " ) }` );
    } );

    it( "every active-competency-set code is within its family's pool", () => {
        const pool = readJSON( path.join( CONFIG_DIR, "config.role-family-competencies.json" ) );
        const sets = readJSON( path.join( CONFIG_DIR, "config.active-competency-sets.json" ) );
        const failures = [];
        for ( const [ family, familyEntry ] of Object.entries( sets ) ) {
            const familyPool = Array.isArray( pool[ family ] ) ? new Set( pool[ family ] ) : null;
            if ( !familyPool ) continue;
            for ( const [ key, cycleMap ] of Object.entries( familyEntry ) ) {
                for ( const [ cycleID, codes ] of Object.entries( cycleMap ) ) {
                    for ( const code of codes ) {
                        if ( !familyPool.has( code ) ) {
                            failures.push( `${ family }.${ key }.${ cycleID }: '${ code }' is not in the '${ family }' pool` );
                        }
                    }
                }
            }
        }
        assert.deepEqual( failures, [], `Active-set pool-membership failures:\n  ${ failures.join( "\n  " ) }` );
    } );

} );

describe( "Relevancy archetypes resolve for every competency", () => {

    const LEVELS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];

    it( "every competency references an archetype defined in config.relevancy-archetypes.json", () => {
        const competencies = readJSON( path.join( CONFIG_DIR, "config.competencies.json" ) ).competencies;
        const archetypes = readJSON( path.join( CONFIG_DIR, "config.relevancy-archetypes.json" ) );
        const failures = [];
        for ( const [ code, competency ] of Object.entries( competencies ) ) {
            if ( !competency.relevancyArchetype ) {
                failures.push( `${ code }: missing relevancyArchetype` );
            } else if ( !archetypes[ competency.relevancyArchetype ] ) {
                failures.push( `${ code }: relevancyArchetype '${ competency.relevancyArchetype }' is not defined` );
            }
        }
        assert.deepEqual( failures, [], `Archetype-resolution failures:\n  ${ failures.join( "\n  " ) }` );
    } );

    it( "every archetype curve has all twelve stage-level weights in range 1-10", () => {
        const archetypes = readJSON( path.join( CONFIG_DIR, "config.relevancy-archetypes.json" ) );
        const failures = [];
        for ( const [ id, archetype ] of Object.entries( archetypes ) ) {
            for ( const level of LEVELS ) {
                const value = archetype.weights ? archetype.weights[ level ] : undefined;
                if ( !Number.isInteger( value ) || value < 1 || value > 10 ) {
                    failures.push( `${ id }.${ level } = ${ value }` );
                }
            }
        }
        assert.deepEqual( failures, [], `Archetype weight failures:\n  ${ failures.join( "\n  " ) }` );
    } );

} );
