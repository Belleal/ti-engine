"use strict";

/**
 * Verifies the published TypeScript declarations the way a consumer experiences them.
 *
 * Usage: node .github/scripts/check-types.js
 *
 * Three things are checked, in the order that makes a failure cheapest to read:
 *
 *   1. Drift — the declarations are regenerated and compared against what is committed, because
 *      the publish job runs no install and no lifecycle scripts, so whatever is in `types/` is
 *      exactly what ships.
 *   2. The declarations themselves, with `skipLibCheck: false`. This is the check whose absence
 *      let a broken set of declarations look verified: `skipLibCheck: true` suppresses errors
 *      *inside* `.d.ts` files, which is the entire class of error declaration emit produces.
 *      TypeScript's own default is `false`, so this is what an ordinary consumer sees.
 *   3. A generated consumer that imports every public subpath of every package and reaches for the
 *      surfaces people actually use. Checking the declarations alone cannot catch a missing `types`
 *      condition in an exports map, or a type that resolves but exposes nothing usable.
 *
 * Step 2 is deliberately run per package rather than over all three at once. A parse error anywhere
 * in a program suppresses the whole semantic pass, so one malformed file in one package would
 * silently hide every unresolved-name error in the other two — which is exactly how a 251-error
 * surface once measured as 7.
 */

const child = require( "node:child_process" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const REPOSITORY_ROOT = path.resolve( __dirname, "..", ".." );
const PACKAGES = [ "core", "web-framework", "web-content" ];
const WORK_DIRECTORY = path.join( REPOSITORY_ROOT, ".types-check" );

// `types` and `typeRoots` are pinned rather than left to discovery: the configs are written into
// `.types-check/`, so the automatic `@types` lookup would start from there instead of the
// repository root and miss the Node types that `core`'s declarations reference by name.
const COMPILER_OPTIONS = {
    noEmit: true,
    skipLibCheck: false,
    module: "node16",
    moduleResolution: "node16",
    target: "es2022",
    types: [ "node" ],
    typeRoots: [ path.join( REPOSITORY_ROOT, "node_modules", "@types" ) ]
};

/**
 * Runs a command and returns its combined output alongside the exit code.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {{ code: number, output: string }}
 */
function run( command, args, cwd = REPOSITORY_ROOT ) {
    const result = child.spawnSync( command, args, { cwd: cwd, encoding: "utf8", shell: false } );
    return { code: result.status === null ? 1 : result.status, output: ( result.stdout || "" ) + ( result.stderr || "" ) };
}

/**
 * Counts the compiler diagnostics in a tsc run's output.
 *
 * @param {string} output
 * @returns {number}
 */
function countErrors( output ) {
    return output.split( "\n" ).filter( ( line ) => /error TS\d+/.test( line ) ).length;
}

/**
 * Writes a tsconfig for one check and runs the compiler against it.
 *
 * @param {string} name Used for the config filename and the reported step name.
 * @param {Object} config
 * @returns {{ code: number, output: string }}
 */
function typeCheck( name, config ) {
    const file = path.join( WORK_DIRECTORY, `tsconfig.${ name }.json` );
    fs.writeFileSync( file, JSON.stringify( config, null, 2 ) + "\n" );
    return run( "npx", [ "tsc", "-p", file ] );
}

/**
 * Reads every declaration currently on disk, keyed by its path relative to the repository root.
 *
 * @returns {Map<string,string>}
 */
function readDeclarations() {
    const declarations = new Map();
    for ( const name of PACKAGES ) {
        const root = path.join( REPOSITORY_ROOT, "packages", name, "types" );
        if ( !fs.existsSync( root ) ) {
            continue;
        }
        for ( const file of fs.readdirSync( root, { recursive: true, withFileTypes: true } ) ) {
            if ( file.isFile() && file.name.endsWith( ".d.ts" ) ) {
                const full = path.join( file.parentPath || file.path, file.name );
                declarations.set( path.relative( REPOSITORY_ROOT, full ), fs.readFileSync( full, "utf8" ) );
            }
        }
    }
    return declarations;
}

/**
 * Regenerates every package's declarations and reports which of them the rebuild changed.
 *
 * The comparison is on file content rather than on `git status`, so a declaration that is correct
 * but not yet committed does not read as drift, and one whose content changed does — regardless of
 * what git happens to know about it.
 *
 * @returns {string[]} The paths that differ, empty when the committed output is current.
 */
function checkDrift() {
    const before = readDeclarations();
    for ( const name of PACKAGES ) {
        const result = run( "npx", [ "tsc", "-p", "tsconfig.types.json" ], path.join( REPOSITORY_ROOT, "packages", name ) );
        if ( result.code !== 0 ) {
            process.stderr.write( result.output );
            throw new Error( `declaration emit failed for ${ name }` );
        }
    }
    const after = readDeclarations();
    const differences = [];
    for ( const [ file, content ] of after ) {
        if ( !before.has( file ) ) {
            differences.push( `added   ${ file }` );
        } else if ( before.get( file ) !== content ) {
            differences.push( `changed ${ file }` );
        }
    }
    for ( const file of before.keys() ) {
        if ( !after.has( file ) ) {
            differences.push( `removed ${ file }` );
        }
    }
    return differences;
}

/**
 * Builds the consumer module: every public subpath of every package, plus the surfaces a reader of
 * the README would reach for first.
 *
 * @returns {number} The number of subpaths imported.
 */
function writeConsumer() {
    const lines = [ "// Generated by .github/scripts/check-types.js — not committed.", "" ];
    let count = 0;
    for ( const name of PACKAGES ) {
        const manifest = JSON.parse( fs.readFileSync( path.join( REPOSITORY_ROOT, "packages", name, "package.json" ), "utf8" ) );
        for ( const subpath of Object.keys( manifest.exports || {} ) ) {
            const specifier = subpath === "." ? manifest.name : manifest.name + subpath.slice( 1 );
            lines.push( `import * as module${ count } from "${ specifier }";`, `void module${ count };` );
            count += 1;
        }
    }
    lines.push(
        "",
        "// A resolvable type is not the same as a usable one: every enum was once emitted as bare",
        "// `Object`, which resolves fine and exposes no member at all.",
        "import * as exceptions from \"@ti-engine/core/exceptions\";",
        "import * as logger from \"@ti-engine/core/logger\";",
        "const exceptionCode: number | string = exceptions.exceptionCode.E_GEN_BAD_SERVICE_HANDLER;",
        "const severity: number | string = logger.logSeverity.ERROR;",
        "const named: string | undefined = exceptions.exceptionCode.name( exceptionCode );",
        "void exceptionCode; void severity; void named;",
        "",
        "// @ts-expect-error — a member that does not exist must still be an error, or the mapped",
        "// enum type has collapsed to something that accepts anything.",
        "void exceptions.exceptionCode.NOT_A_REAL_MEMBER;"
    );
    fs.writeFileSync( path.join( WORK_DIRECTORY, "consumer.ts" ), lines.join( "\n" ) + "\n" );
    return count;
}

function main() {
    fs.mkdirSync( WORK_DIRECTORY, { recursive: true } );
    let failed = false;

    const drift = checkDrift();
    if ( drift.length > 0 ) {
        process.stdout.write( `drift: ${ drift.length } declaration path(s) differ from the committed output\n` );
        drift.forEach( ( line ) => process.stdout.write( `  ${ line }\n` ) );
        process.stdout.write( "  run `npm run build:types --workspaces --if-present` and commit the result\n" );
        failed = true;
    } else {
        process.stdout.write( "drift: committed declarations match a fresh build\n" );
    }

    for ( const name of PACKAGES ) {
        const result = typeCheck( name, {
            compilerOptions: COMPILER_OPTIONS,
            include: [ path.join( REPOSITORY_ROOT, "packages", name, "types", "**", "*.d.ts" ) ]
        } );
        const errors = countErrors( result.output );
        process.stdout.write( `declarations (${ name }): ${ errors } error(s)\n` );
        if ( errors > 0 ) {
            process.stdout.write( result.output );
            failed = true;
        }
    }

    const subpaths = writeConsumer();
    const consumer = typeCheck( "consumer", {
        compilerOptions: Object.assign( {}, COMPILER_OPTIONS, { strict: true } ),
        include: [ path.join( WORK_DIRECTORY, "consumer.ts" ) ]
    } );
    const consumerErrors = countErrors( consumer.output );
    process.stdout.write( `consumer (${ subpaths } subpaths): ${ consumerErrors } error(s)\n` );
    if ( consumerErrors > 0 ) {
        process.stdout.write( consumer.output );
        failed = true;
    }

    process.exit( failed ? 1 : 0 );
}

main();
