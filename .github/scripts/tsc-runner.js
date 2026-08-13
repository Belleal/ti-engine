"use strict";

/**
 * Runs the workspace's TypeScript compiler, and Node itself, for the declaration build and its gate.
 *
 * Both scripts originally shelled out to `npx tsc`, which cannot run on Windows: `npx` is a `.cmd`
 * shim, and `spawnSync` without `shell: true` resolves no extension, so it reports `ENOENT`. That
 * failure was invisible — a failed launch leaves `status` at `null` with both streams `undefined`,
 * so the callers' `(stdout || "") + (stderr || "")` printed nothing and the process exited 1 with no
 * output at all. A Windows developer's only working route was then each package's own
 * `build:types` script, which is `tsc` alone and skips `addNodeReferences()` — silently shipping
 * declarations without the `/// <reference types="node" />` that `web-framework` 1.20.1 added.
 *
 * Resolving the compiler out of the workspace's own `typescript` install and running it with this
 * process's Node binary avoids the shim, the PATH lookup and the shell-quoting question at once, and
 * pins the compiler to the version the repository depends on rather than whatever `npx` would pick.
 */

const child = require( "node:child_process" );
const path = require( "node:path" );

/**
 * The compiler entry point declared by the installed `typescript` package.
 *
 * Resolution goes through the package manifest rather than `require.resolve( "typescript/bin/tsc" )`,
 * which TypeScript's `exports` map refuses (`ERR_PACKAGE_PATH_NOT_EXPORTED`), and rather than a
 * hard-coded `lib/tsc.js`, so the path stays whatever the installed package declares.
 *
 * @returns {string}
 */
function resolveCompiler() {
    const manifestPath = require.resolve( "typescript/package.json" );
    const manifest = require( manifestPath );
    const binary = manifest.bin && manifest.bin.tsc;
    if ( !binary ) {
        throw new Error( `the installed typescript package declares no "bin.tsc" (${ manifestPath })` );
    }
    return path.join( path.dirname( manifestPath ), binary );
}

/**
 * Runs a Node script and returns its combined output alongside the exit code.
 *
 * @param {string[]} args Arguments to the Node binary, starting with the script path.
 * @param {string} cwd
 * @returns {{ code: number, output: string }}
 */
function runNode( args, cwd ) {
    const result = child.spawnSync( process.execPath, args, { cwd: cwd, encoding: "utf8", shell: false } );

    // A failure to launch leaves `status` null and both streams undefined. Reporting `error` here is
    // what keeps such a failure from surfacing as a bare exit 1 with nothing written anywhere.
    if ( result.error ) {
        return { code: 1, output: `failed to run ${ args[ 0 ] }: ${ result.error.message }\n` };
    }
    return { code: result.status === null ? 1 : result.status, output: ( result.stdout || "" ) + ( result.stderr || "" ) };
}

/**
 * Runs the workspace's TypeScript compiler.
 *
 * @param {string[]} args Arguments passed to the compiler.
 * @param {string} cwd
 * @returns {{ code: number, output: string }}
 */
function runTsc( args, cwd ) {
    return runNode( [ resolveCompiler() ].concat( args ), cwd );
}

module.exports = { runNode, runTsc };
