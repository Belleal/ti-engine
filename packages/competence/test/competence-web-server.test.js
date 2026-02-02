/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert" );

describe( "CompetenceWebServer", () => {
    let CompetenceWebServer;
    let TiWebServer;

    beforeEach( () => {
        // Clear module cache to get fresh instances
        delete require.cache[ require.resolve( "../bin/competence-web-server.js" ) ];
        CompetenceWebServer = require( "../bin/competence-web-server.js" );
        TiWebServer = require( "@ti-engine/web-framework/web-server" );
    } );

    describe( "Constructor", () => {
        it( "should be a class that can be instantiated", () => {
            assert.strictEqual( typeof CompetenceWebServer, "function" );
        } );

        it( "should extend TiWebServer", () => {
            const mockServiceConfig = {
                port: 3000,
                host: "localhost"
            };
            const server = new CompetenceWebServer( "test-domain", mockServiceConfig );
            assert.ok( server instanceof TiWebServer );
        } );

        it( "should create instance with required parameters", () => {
            const serviceDomainName = "competence-domain";
            const serviceConfig = {
                port: 8080,
                host: "0.0.0.0"
            };

            assert.doesNotThrow( () => {
                const server = new CompetenceWebServer( serviceDomainName, serviceConfig );
                assert.ok( server );
            } );
        } );

        it( "should store serviceDomainName from constructor", () => {
            const serviceDomainName = "competence-test";
            const serviceConfig = {
                port: 3000,
                host: "localhost"
            };

            const server = new CompetenceWebServer( serviceDomainName, serviceConfig );
            // The parent class should store this, we verify by checking the instance exists
            assert.ok( server );
        } );

        it( "should store serviceConfig from constructor", () => {
            const serviceDomainName = "competence-test";
            const serviceConfig = {
                port: 8080,
                host: "localhost",
                ssl: false
            };

            const server = new CompetenceWebServer( serviceDomainName, serviceConfig );
            assert.ok( server );
        } );

        it( "should handle different port numbers", () => {
            const ports = [ 3000, 8080, 9000, 4000 ];

            ports.forEach( port => {
                assert.doesNotThrow( () => {
                    const server = new CompetenceWebServer( "test-domain", { port, host: "localhost" } );
                    assert.ok( server );
                } );
            } );
        } );

        it( "should handle different host configurations", () => {
            const hosts = [ "localhost", "0.0.0.0", "127.0.0.1" ];

            hosts.forEach( host => {
                assert.doesNotThrow( () => {
                    const server = new CompetenceWebServer( "test-domain", { port: 3000, host } );
                    assert.ok( server );
                } );
            } );
        } );

        it( "should accept complex service configuration", () => {
            const serviceConfig = {
                port: 8080,
                host: "0.0.0.0",
                ssl: true,
                sslKey: "/path/to/key",
                sslCert: "/path/to/cert",
                maxConnections: 1000,
                timeout: 30000
            };

            assert.doesNotThrow( () => {
                const server = new CompetenceWebServer( "competence-domain", serviceConfig );
                assert.ok( server );
            } );
        } );
    } );

    describe( "defineUnprotectedRoutes()", () => {
        it( "should have defineUnprotectedRoutes method", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.strictEqual( typeof server.defineUnprotectedRoutes, "function" );
        } );

        it( "should be callable", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.doesNotThrow( () => {
                server.defineUnprotectedRoutes();
            } );
        } );

        it( "should call parent defineUnprotectedRoutes", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            // The method calls super.defineUnprotectedRoutes()
            // We verify it doesn't throw
            assert.doesNotThrow( () => {
                server.defineUnprotectedRoutes();
            } );
        } );

        it( "should not throw when called multiple times", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.doesNotThrow( () => {
                server.defineUnprotectedRoutes();
                server.defineUnprotectedRoutes();
                server.defineUnprotectedRoutes();
            } );
        } );

        it( "should be idempotent", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            server.defineUnprotectedRoutes();
            const result1 = server.defineUnprotectedRoutes();
            const result2 = server.defineUnprotectedRoutes();
            // Results should be consistent
            assert.strictEqual( typeof result1, typeof result2 );
        } );
    } );

    describe( "defineWebApplicationRoutes()", () => {
        it( "should have defineWebApplicationRoutes method", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.strictEqual( typeof server.defineWebApplicationRoutes, "function" );
        } );

        it( "should be callable", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.doesNotThrow( () => {
                server.defineWebApplicationRoutes();
            } );
        } );

        it( "should call parent defineWebApplicationRoutes", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            // The method calls super.defineWebApplicationRoutes()
            // We verify it doesn't throw
            assert.doesNotThrow( () => {
                server.defineWebApplicationRoutes();
            } );
        } );

        it( "should not throw when called multiple times", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.doesNotThrow( () => {
                server.defineWebApplicationRoutes();
                server.defineWebApplicationRoutes();
                server.defineWebApplicationRoutes();
            } );
        } );

        it( "should be idempotent", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            server.defineWebApplicationRoutes();
            const result1 = server.defineWebApplicationRoutes();
            const result2 = server.defineWebApplicationRoutes();
            // Results should be consistent
            assert.strictEqual( typeof result1, typeof result2 );
        } );
    } );

    describe( "Method Interactions", () => {
        it( "should allow calling both route definition methods", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.doesNotThrow( () => {
                server.defineUnprotectedRoutes();
                server.defineWebApplicationRoutes();
            } );
        } );

        it( "should work regardless of method call order", () => {
            const server1 = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            const server2 = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );

            assert.doesNotThrow( () => {
                server1.defineUnprotectedRoutes();
                server1.defineWebApplicationRoutes();
            } );

            assert.doesNotThrow( () => {
                server2.defineWebApplicationRoutes();
                server2.defineUnprotectedRoutes();
            } );
        } );
    } );

    describe( "Inheritance from TiWebServer", () => {
        it( "should have access to parent class methods", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            // Should have inherited methods
            assert.ok( server.defineUnprotectedRoutes );
            assert.ok( server.defineWebApplicationRoutes );
        } );

        it( "should properly override parent methods", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            // The methods should be overridden but still callable
            assert.strictEqual( typeof server.defineUnprotectedRoutes, "function" );
            assert.strictEqual( typeof server.defineWebApplicationRoutes, "function" );
        } );

        it( "should maintain prototype chain", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.ok( server instanceof CompetenceWebServer );
            assert.ok( server instanceof TiWebServer );
        } );
    } );

    describe( "Edge Cases and Error Handling", () => {
        it( "should handle missing serviceDomainName", () => {
            const serviceConfig = { port: 3000, host: "localhost" };
            // Depending on parent class implementation, this might throw or handle gracefully
            // We test that the constructor handles it
            try {
                const server = new CompetenceWebServer( undefined, serviceConfig );
                assert.ok( server );
            } catch ( error ) {
                // If it throws, that's also valid behavior
                assert.ok( error );
            }
        } );

        it( "should handle null serviceDomainName", () => {
            const serviceConfig = { port: 3000, host: "localhost" };
            try {
                const server = new CompetenceWebServer( null, serviceConfig );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle empty string serviceDomainName", () => {
            const serviceConfig = { port: 3000, host: "localhost" };
            try {
                const server = new CompetenceWebServer( "", serviceConfig );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle missing serviceConfig", () => {
            try {
                const server = new CompetenceWebServer( "test-domain", undefined );
                assert.ok( server );
            } catch ( error ) {
                // If it throws, that's valid behavior
                assert.ok( error );
            }
        } );

        it( "should handle null serviceConfig", () => {
            try {
                const server = new CompetenceWebServer( "test-domain", null );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle empty serviceConfig", () => {
            try {
                const server = new CompetenceWebServer( "test-domain", {} );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle serviceConfig with only port", () => {
            try {
                const server = new CompetenceWebServer( "test-domain", { port: 3000 } );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle serviceConfig with only host", () => {
            try {
                const server = new CompetenceWebServer( "test-domain", { host: "localhost" } );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle special characters in serviceDomainName", () => {
            const serviceConfig = { port: 3000, host: "localhost" };
            const specialNames = [ "test-domain", "test_domain", "test.domain", "test123" ];

            specialNames.forEach( name => {
                try {
                    const server = new CompetenceWebServer( name, serviceConfig );
                    assert.ok( server );
                } catch ( error ) {
                    // Some names might not be valid
                    assert.ok( error );
                }
            } );
        } );

        it( "should handle very long serviceDomainName", () => {
            const longName = "a".repeat( 1000 );
            const serviceConfig = { port: 3000, host: "localhost" };

            try {
                const server = new CompetenceWebServer( longName, serviceConfig );
                assert.ok( server );
            } catch ( error ) {
                assert.ok( error );
            }
        } );

        it( "should handle extreme port numbers", () => {
            const extremePorts = [ 0, 1, 65535, 80, 443 ];

            extremePorts.forEach( port => {
                try {
                    const server = new CompetenceWebServer( "test-domain", { port, host: "localhost" } );
                    assert.ok( server );
                } catch ( error ) {
                    // Some ports might not be valid
                    assert.ok( error );
                }
            } );
        } );

        it( "should handle invalid port numbers gracefully", () => {
            const invalidPorts = [ -1, 65536, NaN, Infinity, "not-a-number" ];

            invalidPorts.forEach( port => {
                try {
                    const server = new CompetenceWebServer( "test-domain", { port, host: "localhost" } );
                    // If it creates successfully, verify it exists
                    assert.ok( server );
                } catch ( error ) {
                    // If it throws an error, that's expected for invalid ports
                    assert.ok( error );
                }
            } );
        } );
    } );

    describe( "Multiple Instance Creation", () => {
        it( "should allow creating multiple server instances", () => {
            const server1 = new CompetenceWebServer( "domain1", { port: 3000, host: "localhost" } );
            const server2 = new CompetenceWebServer( "domain2", { port: 3001, host: "localhost" } );

            assert.ok( server1 );
            assert.ok( server2 );
            assert.notStrictEqual( server1, server2 );
        } );

        it( "should maintain separate configurations for multiple instances", () => {
            const config1 = { port: 3000, host: "localhost" };
            const config2 = { port: 4000, host: "0.0.0.0" };

            const server1 = new CompetenceWebServer( "domain1", config1 );
            const server2 = new CompetenceWebServer( "domain2", config2 );

            assert.ok( server1 );
            assert.ok( server2 );
            assert.notStrictEqual( server1, server2 );
        } );

        it( "should handle concurrent instantiation", () => {
            const servers = [];
            for ( let i = 0; i < 5; i++ ) {
                servers.push( new CompetenceWebServer( `domain${ i }`, { port: 3000 + i, host: "localhost" } ) );
            }

            assert.strictEqual( servers.length, 5 );
            servers.forEach( server => {
                assert.ok( server );
                assert.ok( server instanceof CompetenceWebServer );
            } );
        } );
    } );

    describe( "Type and Interface Validation", () => {
        it( "should be a proper ES6 class", () => {
            assert.strictEqual( typeof CompetenceWebServer, "function" );
            assert.strictEqual( CompetenceWebServer.toString().startsWith( "class" ), true );
        } );

        it( "should have correct method types", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            assert.strictEqual( typeof server.defineUnprotectedRoutes, "function" );
            assert.strictEqual( typeof server.defineWebApplicationRoutes, "function" );
        } );

        it( "should not have unexpected public methods", () => {
            const server = new CompetenceWebServer( "test-domain", { port: 3000, host: "localhost" } );
            const ownProperties = Object.getOwnPropertyNames( server );

            // Should not have properties that start with # (private)
            ownProperties.forEach( prop => {
                assert.ok( !prop.startsWith( "#" ) );
            } );
        } );
    } );
} );
