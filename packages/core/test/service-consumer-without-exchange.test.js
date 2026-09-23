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

const assert = require( "node:assert" );
const { after, before, describe, it } = require( "node:test" );
const { startStubStateServer } = require( "./fixtures/stub-state-server.js" );

// The configuration a Cloudflare container runs: state over HTTP, and no message exchange. It is also the
// configuration 1.14.0 introduced and never started a real service under - which is how every web server came to
// crash at boot with the exchange off. `TiWebServer` is a ServiceConsumer, so this file is its shape.
//
// Set before anything from core is required, because `config` snapshots the environment when first loaded; and one
// ServiceInstance per process, so the provider's shape has a file of its own.
let stub = null;
let consumer = null;
let exceptions = null;
let messageDispatcher = null;

before( async () => {
    stub = await startStubStateServer();

    process.env.TI_MEMORY_CACHE_PROVIDER = "http";
    process.env.TI_MEMORY_CACHE_STATE_URL = stub.baseUrl;
    process.env.TI_MESSAGE_EXCHANGE_ENABLED = "false";

    const ServiceConsumer = require( "#service-consumer" );
    exceptions = require( "#exceptions" );
    messageDispatcher = require( "#message-dispatcher" );

    class SiteLikeConsumer extends ServiceConsumer {}
    consumer = new SiteLikeConsumer( "without-exchange-consumer" );
} );

after( async () => {
    if ( stub && stub.server.listening === true ) {
        stub.server.close();
    }
} );

describe( "a ServiceConsumer with the message exchange disabled", () => {

    it( "starts", async () => {
        // The whole regression. Before the fix this rejected with "Cannot read properties of undefined (reading
        // 'addMessageObserverResponsesIn')", because onStart registered with a dispatcher that was never initialized.
        await consumer.start();
    } );

    it( "refuses a service call and says why, rather than blaming the registry", async () => {
        let result = await consumer.callService( { serviceDomainName: "elsewhere", serviceAlias: "anything" }, {}, {} );

        // Without the check the failure names the wrong thing: an unimplemented `isSetMember` on a backend without
        // sets, or an unregistered service on one with them. Neither says calls cannot travel without an exchange.
        assert.equal( result.isSuccessful, false );
        assert.equal( result.exception.code, exceptions.exceptionCode.E_GEN_FEATURE_UNSUPPORTED );
        assert.match( result.exception.data.details, /message exchange, which is disabled/ );
        assert.match( result.exception.data.details, /elsewhere\.anything/ );
    } );

    it( "stops", async () => {
        await consumer.stop();
    } );

} );

describe( "the message dispatcher, when nothing initialized it", () => {

    it( "fails with a named exception rather than a TypeError, from every entry point", async () => {
        // The TypeError is what made the 1.14.0 crash hard to read: it names a property on `undefined` and nothing
        // about which component was missing, or why.
        const notInitialized = ( error ) => {
            assert.equal( error.code, exceptions.exceptionCode.E_GEN_NOT_INITIALIZED );
            assert.match( error.data.details, /no exchange/ );
            return true;
        };

        assert.throws( () => messageDispatcher.instance.addMessageObserverResponsesIn( {} ), notInitialized );
        assert.throws( () => messageDispatcher.instance.addMessageObserverRequestsIn( {} ), notInitialized );
        await assert.rejects( messageDispatcher.instance.sendRequest( { chainID: "x" } ), notInitialized );
        await assert.rejects( messageDispatcher.instance.sendResponse( { chainID: "x" } ), notInitialized );
        await assert.rejects( messageDispatcher.instance.shutDown(), notInitialized );
    } );

} );
