/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * How this image's HEALTHCHECK is wired. What the probe *does* is the framework's business and is tested there
 * (`packages/web-framework/test/healthcheck.test.js`); what belongs here is that the Dockerfile calls it, and calls
 * it rather than reinventing it.
 *
 * The failure this guards against is a regression to an inline `node -e`, which is where the bug was: hardcoding
 * `require('http')` and an `http://` URL made the probe report a TLS-enabled container unhealthy forever. A copy of
 * the framework's logic pasted into this Dockerfile would be the same mistake one step removed — it would keep
 * working until the framework's behaviour changed, and then quietly diverge.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const dockerfile = fs.readFileSync( path.join( PACKAGE_ROOT, "Dockerfile" ), "utf8" );
const healthcheck = /HEALTHCHECK[\s\S]*?(?=\n[A-Z]|$)/.exec( dockerfile )[ 0 ];

describe( "Dockerfile healthcheck wiring", () => {

    it( "runs the framework's probe", () => {
        assert.match( healthcheck, /CMD \[\s*"node",\s*"\/app\/node_modules\/@ti-engine\/web-framework\/bin\/healthcheck\.js"\s*\]/ );
    } );

    it( "the probe it names is actually shipped by the framework", () => {
        // The Dockerfile references a path inside node_modules, which no linter checks. If the file is renamed or
        // dropped, the container's HEALTHCHECK becomes "node: cannot find module" on every interval — reported as
        // unhealthy, with the cause buried in `docker inspect`.
        const probe = path.join( PACKAGE_ROOT, "..", "web-framework", "bin", "healthcheck.js" );
        assert.ok( fs.existsSync( probe ), "packages/web-framework/bin/healthcheck.js is gone" );
    } );

    it( "the framework publishes it, so the path exists in an installed image too", () => {
        // The runtime image installs the workspace rather than copying it, so a file excluded from `files` would be
        // present here and absent in the container.
        const manifest = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "..", "web-framework", "package.json" ), "utf8" ) );
        assert.ok( ( manifest.files || [] ).includes( "bin/" ), "web-framework must publish bin/ for the probe to reach the image" );
    } );

    it( "reimplements nothing the framework owns", () => {
        assert.equal( /require\(/.test( healthcheck ), false, "an inline probe is how the TLS bug got in" );
        assert.equal( /http:\/\//.test( healthcheck ), false, "the scheme belongs to TI_WEB_USE_TLS, not the Dockerfile" );
    } );

} );
