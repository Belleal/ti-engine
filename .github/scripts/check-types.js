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

const fs = require( "node:fs" );
const path = require( "node:path" );
const { runNode, runTsc } = require( "./tsc-runner" );

const REPOSITORY_ROOT = path.resolve( __dirname, "..", ".." );
const PACKAGES = [ "core", "web-framework", "web-content" ];
const WORK_DIRECTORY = path.join( REPOSITORY_ROOT, ".types-check" );

// Nothing is pinned here on purpose. An earlier version set `types` and `typeRoots`, which put
// Node's types in scope for the check and for nothing else — the published declarations went out
// without the `/// <reference types="node" />` they needed, and the gate reported zero errors while
// a real consumer got two. The check now sees exactly what a consumer's compiler sees.
const COMPILER_OPTIONS = {
    noEmit: true,
    skipLibCheck: false,
    module: "node16",
    moduleResolution: "node16",
    target: "es2022"
};

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
 * Renders a filesystem path for use inside a tsconfig.
 *
 * A tsconfig `include` entry is a POSIX-style glob on every platform: TypeScript reads `\` as an
 * escape character, not a separator, so a Windows path from `path.join` matches nothing and the
 * compiler reports `TS18003: No inputs were found` — a green-looking "0 errors" for a check that
 * examined no files at all.
 *
 * @param {string} value
 * @returns {string}
 */
function toConfigPath( value ) {
    return value.split( path.sep ).join( "/" );
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
    return runTsc( [ "-p", file ], REPOSITORY_ROOT );
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
    const build = runNode( [ path.join( __dirname, "build-types.js" ) ], REPOSITORY_ROOT );
    if ( build.code !== 0 ) {
        process.stderr.write( build.output );
        throw new Error( "declaration build failed" );
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
        // Deliberately the root script, not `--workspaces`: each package's own `build:types` is `tsc`
        // alone and skips `addNodeReferences()`, so following that advice regenerates declarations
        // without the Node reference and reintroduces the very defect this gate exists to catch.
        process.stdout.write( "  run `npm run build:types` (the root script) and commit the result\n" );
        failed = true;
    } else {
        process.stdout.write( "drift: committed declarations match a fresh build\n" );
    }

    for ( const name of PACKAGES ) {
        const result = typeCheck( name, {
            compilerOptions: COMPILER_OPTIONS,
            include: [ toConfigPath( path.join( REPOSITORY_ROOT, "packages", name, "types", "**", "*.d.ts" ) ) ]
        } );
        const errors = countErrors( result.output );
        process.stdout.write( `declarations (${ name }): ${ errors } error(s)${ result.code !== 0 ? `, compiler exited ${ result.code }` : "" }\n` );
        // The exit code is checked as well as the diagnostic count, because they are not the same signal: a run that
        // fails to launch, crashes, is OOM-killed or dies on a signal exits nonzero while emitting no `error TS`
        // line at all, so counting alone reported "0 error(s)" and let the gate pass. `checkDrift` above and
        // build-types.js already gate on the code; these two branches were the ones that did not.
        if ( result.code !== 0 || errors > 0 ) {
            process.stdout.write( result.output );
            failed = true;
        }
    }

    const subpaths = writeConsumer();
    const consumer = typeCheck( "consumer", {
        compilerOptions: Object.assign( {}, COMPILER_OPTIONS, { strict: true } ),
        include: [ toConfigPath( path.join( WORK_DIRECTORY, "consumer.ts" ) ) ]
    } );
    const consumerErrors = countErrors( consumer.output );
    process.stdout.write( `consumer (${ subpaths } subpaths): ${ consumerErrors } error(s)${ consumer.code !== 0 ? `, compiler exited ${ consumer.code }` : "" }\n` );
    if ( consumer.code !== 0 || consumerErrors > 0 ) {
        process.stdout.write( consumer.output );
        failed = true;
    }

    process.exit( failed ? 1 : 0 );
}

main();
