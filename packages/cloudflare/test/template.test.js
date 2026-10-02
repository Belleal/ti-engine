/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/*
 * The template a new application copies (CA-371).
 *
 * Its own guard tests run against it in this suite, `template/test/cloudflare.test.mjs`, and those are what prove the
 * template works with this release. What is held here is what they cannot see from inside an application: that the
 * package publishes every file an application is told to copy, and that this suite runs them.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE = path.join( __dirname, ".." );
const TEMPLATE = path.join( PACKAGE, "template" );
const MANIFEST = JSON.parse( fs.readFileSync( path.join( PACKAGE, "package.json" ), "utf8" ) );

/**
 * What an application copies from the template, by its path there.
 *
 * @type {string[]}
 */
const COPIED = [ "wrangler.jsonc", "Dockerfile", ".dockerignore", "worker/index.mjs", "test/cloudflare.test.mjs" ];

describe( "template — what an application copies", () => {

    it( "is published with the package, so it always fits the release an application installs", () => {
        assert.ok( MANIFEST.files.includes( "template/" ) );
    } );

    it( "has every file its README tells an application to copy", () => {
        const readme = fs.readFileSync( path.join( TEMPLATE, "README.md" ), "utf8" );
        for ( const file of COPIED ) {
            assert.ok( fs.existsSync( path.join( TEMPLATE, file ) ), file );
            assert.ok( readme.includes( `\`${ file }\`` ), `the README names ${ file }` );
        }
    } );

    it( "tells an application to keep wrangler's local state out of git, since npm publishes no .gitignore", () => {
        // npm leaves every `.gitignore` out of a package, so the line cannot travel in a file.
        const readme = fs.readFileSync( path.join( TEMPLATE, "README.md" ), "utf8" );
        assert.match( readme, /`\.gitignore`[^\n]*`\.wrangler\/`|`\.wrangler\/`[^\n]*`\.gitignore`/ );
    } );

    it( "has its guard tests run by this package's suite, against the template itself", () => {
        assert.match( MANIFEST.scripts.test, /(^| )template\/test\/\*\.test\.mjs( |$)/ );
    } );

} );
