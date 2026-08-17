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
 * Tests for the web-framework integration seam. The pattern below is what inverts the framework's protect-by-default
 * stance, so anything it wrongly declares public bypasses authentication entirely — the bare `/admin` case in
 * particular, which an `admin/`-only lookahead lets through.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { PUBLIC_EXCEPT_ADMIN, defineContentUnprotectedRoutes } = require( "#routes" );

describe( "routes — PUBLIC_EXCEPT_ADMIN", () => {

    it( "does not declare the admin area public, including the bare /admin path", () => {
        for ( const path of [ "/admin", "/admin/", "/admin/config", "/admin/config/competencies" ] ) {
            assert.equal( PUBLIC_EXCEPT_ADMIN.test( path ), false, `${ path } must stay protected` );
        }
    } );

    it( "declares ordinary content paths public", () => {
        for ( const path of [ "/", "/about/", "/posts/a-song/", "/rss.xml", "/sitemap.xml" ] ) {
            assert.equal( PUBLIC_EXCEPT_ADMIN.test( path ), true, `${ path } must be public` );
        }
    } );

    it( "does not treat a path that merely starts with the letters 'admin' as the admin area", () => {
        for ( const path of [ "/administrator/", "/admin-notes/", "/administrivia" ] ) {
            assert.equal( PUBLIC_EXCEPT_ADMIN.test( path ), true, `${ path } is not the admin area` );
        }
    } );

} );

describe( "routes — defineContentUnprotectedRoutes", () => {

    it( "registers the default pattern on the server, and returns whatever the server returns for chaining", () => {
        const registered = [];
        const server = {
            addUnprotectedRoute( pattern ) {
                registered.push( pattern );
                return this;
            }
        };
        assert.equal( defineContentUnprotectedRoutes( server ), server );
        assert.deepEqual( registered, [ PUBLIC_EXCEPT_ADMIN ] );
    } );

    it( "registers a caller-supplied pattern instead of the default when one is given", () => {
        const registered = [];
        const server = {
            addUnprotectedRoute( pattern ) {
                registered.push( pattern );
                return this;
            }
        };
        const custom = /^\/public\//;
        defineContentUnprotectedRoutes( server, { pattern: custom } );
        assert.deepEqual( registered, [ custom ] );
    } );

} );
