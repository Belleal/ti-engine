"use strict";

/**
 * Builds the published TypeScript declarations.
 *
 * Usage: node .github/scripts/build-types.js
 *
 * This is `tsc -p tsconfig.types.json` per package, plus one thing the compiler will not do for us:
 * a declaration that names a Node global — `NodeJS.Process`, a `node:` module — needs
 * `/// <reference types="node" />` to bring those types into a consumer's scope. TypeScript emits
 * no such reference, whether the directive is written in the JavaScript source or `types` is set in
 * the emit configuration; both were tried.
 *
 * Without it the packages type-check only for a consumer who has separately configured Node types.
 * One who has not — even with `@types/node` installed, which these packages depend on — gets
 * `TS2503: Cannot find namespace 'NodeJS'` from inside our own declarations. That is the whole
 * failure mode this machinery exists to prevent, so the reference is added here rather than left to
 * the consumer's configuration.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const { runTsc } = require( "./tsc-runner" );

const REPOSITORY_ROOT = path.resolve( __dirname, "..", ".." );
const PACKAGES = [ "core", "web-framework", "web-content" ];
const REFERENCE = "/// <reference types=\"node\" />";

// `NodeJS.<something>` as a type, or a `node:` builtin named in an import type.
const NEEDS_NODE = /\bNodeJS\.[A-Z]|["']node:[a-z]/;

/**
 * Adds the Node types reference to every emitted declaration that names a Node global.
 *
 * @param {string} directory The package's `types` directory.
 * @returns {string[]} The files the reference was added to.
 */
function addNodeReferences( directory ) {
    const touched = [];
    if ( !fs.existsSync( directory ) ) {
        return touched;
    }
    for ( const file of fs.readdirSync( directory, { recursive: true, withFileTypes: true } ) ) {
        if ( !file.isFile() || !file.name.endsWith( ".d.ts" ) ) {
            continue;
        }
        const full = path.join( file.parentPath || file.path, file.name );
        const content = fs.readFileSync( full, "utf8" );
        if ( content.includes( REFERENCE ) || !NEEDS_NODE.test( content ) ) {
            continue;
        }
        fs.writeFileSync( full, REFERENCE + "\n" + content );
        touched.push( path.relative( REPOSITORY_ROOT, full ) );
    }
    return touched;
}

function main() {
    for ( const name of PACKAGES ) {
        const directory = path.join( REPOSITORY_ROOT, "packages", name );
        const result = runTsc( [ "-p", "tsconfig.types.json" ], directory );
        if ( result.code !== 0 ) {
            process.stderr.write( result.output );
            process.exit( 1 );
        }
        const touched = addNodeReferences( path.join( directory, "types" ) );
        process.stdout.write( `${ name }: declarations built`
            + ( touched.length > 0 ? `, node reference added to ${ touched.join( ", " ) }` : "" ) + "\n" );
    }
}

main();
