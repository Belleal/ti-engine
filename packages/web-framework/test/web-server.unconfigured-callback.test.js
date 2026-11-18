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
 * An OpenID provider that is enabled but has no client ID, on a real server (CodeRabbit on #226).
 *
 * `AuthManager#initialize` drops such a provider, but it runs after the routes are defined, and the callback route was
 * registered on `isAuthEnabled` alone. So a provider nobody could sign in through still took its callback's path, ahead
 * of an application route at the same path, and answered it with a refused sign-in. That was so in 1.62 as well. The
 * callback is now registered on the rule the home's collision check uses, `AuthManager#isOpenIDProviderConfigured`.
 * One server per file, because core allows one ServiceInstance per process.
 */

process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";
process.env.TI_SERVICE_HEALTH_CHECK_ENABLED = "false";
process.env.TI_WEB_USE_TLS = "false";
process.env.TI_WEB_HOST = "127.0.0.1";
process.env.TI_WEB_PORT = "0";
process.env.TI_WEB_AUTH_METHODS = "openid-azure";
process.env.TI_AZURE_AUTH_CALLBACK_URL = "/partner/return";
// No client ID: the provider is enabled and cannot be used.
delete process.env.TI_AZURE_AUTH_CLIENT_ID;
delete process.env.TI_WEB_APPLICATION_HOME;

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

installInMemoryCache();

const TiWebServer = require( "#web-server" );

// An application whose own page lives at the path the unusable provider names as its callback.
class PartnerSite extends TiWebServer {

    constructor() {
        super( "ti-unconfigured-callback-test", {} );
    }

    defineUnprotectedRoutes() {
        super.defineUnprotectedRoutes();
        this.addUnprotectedRoute( "/partner/return" );
    }

    defineWebApplicationRoutes() {
        super.defineWebApplicationRoutes();
        this.registerRoute( "get", "/partner/return", ( request, response ) => {
            response.type( "text/plain" ).send( "the application's page" );
        } );
    }

}

describe( "an enabled OpenID provider with no client ID", () => {

    const server = new PartnerSite();
    let url;

    before( async () => {
        await server.start();
        url = server.serverUrl;
    } );

    after( () => server.stop() );

    it( "registers no callback, so the application's route at that path answers", async () => {
        const response = await fetch( url + "/partner/return", { redirect: "manual", headers: { accept: "text/html" } } );
        assert.equal( response.status, 200, `answered ${ response.status } ${ response.headers.get( "location" ) || "" }` );
        assert.equal( await response.text(), "the application's page" );
    } );

} );
