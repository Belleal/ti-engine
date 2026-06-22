"use strict";

// Set a deterministic key BEFORE requiring core modules (config reads env at load time and freezes).
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = "unit-test-key-0123456789";

const { test } = require( "node:test" );
const assert = require( "node:assert" );
const tools = require( "../utils/tools.js" );

test( "constantTimeEquals: equal non-empty strings are equal", () => {
    assert.strictEqual( tools.constantTimeEquals( "abc123", "abc123" ), true );
} );

test( "constantTimeEquals: different same-length strings are not equal", () => {
    assert.strictEqual( tools.constantTimeEquals( "abc123", "abc124" ), false );
} );

test( "constantTimeEquals: different-length strings are not equal", () => {
    assert.strictEqual( tools.constantTimeEquals( "abc", "abcdef" ), false );
} );

test( "constantTimeEquals: hostile/empty inputs return false without throwing", () => {
    // Each second argument differs in length from the coerced first, so all are non-matches.
    assert.strictEqual( tools.constantTimeEquals( undefined, "x" ), false ); // "" (0) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( null, "x" ), false );      // "" (0) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( 123, "x" ), false );       // "123" (3) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( {}, "x" ), false );        // "[object Object]" (15) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( "", "x" ), false );        // "" (0) vs "x" (1)
    assert.doesNotThrow( () => tools.constantTimeEquals( { a: 1 }, [ 1, 2 ] ) );
} );

const crypto = require( "node:crypto" );
const MessageHandler = require( "../components/exchange/message-handler.js" );

const TEST_KEY = process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY;
const hashOf = ( msg ) => MessageHandler.prototype.createMessageHash.call( {}, msg );
const expectedHash = ( msg, key ) => {
    const transformed = tools.decomposeJSON( tools.decycle( msg ) );
    return crypto.createHmac( "sha256", Buffer.from( key ) ).update( Buffer.from( transformed ) ).digest( "hex" );
};

const SAMPLE = { messageID: "m-1", type: 1, source: "svc-a", payload: { a: "b", n: 2 } };

test( "createMessageHash: produces a 64-char lowercase hex HMAC-SHA256 matching node:crypto", () => {
    const h = hashOf( SAMPLE );
    assert.match( h, /^[0-9a-f]{64}$/ );
    assert.strictEqual( h, expectedHash( SAMPLE, TEST_KEY ) );
} );

test( "createMessageHash: deterministic for the same message", () => {
    assert.strictEqual( hashOf( SAMPLE ), hashOf( SAMPLE ) );
} );

test( "createMessageHash: key-insertion order does not change the digest", () => {
    const a = { messageID: "m-1", type: 1, source: "svc-a", payload: { a: "b", n: 2 } };
    const b = { payload: { n: 2, a: "b" }, source: "svc-a", type: 1, messageID: "m-1" };
    assert.strictEqual( hashOf( a ), hashOf( b ) );
} );

test( "createMessageHash: mutating any field changes the digest (tamper detection)", () => {
    const tampered = { ...SAMPLE, payload: { a: "b", n: 3 } };
    assert.notStrictEqual( hashOf( SAMPLE ), hashOf( tampered ) );
} );

test( "createMessageHash: digest depends on the key", () => {
    assert.notStrictEqual( hashOf( SAMPLE ), expectedHash( SAMPLE, "a-totally-different-key" ) );
} );

test( "createMessageHash: empty object hashes to a stable value without throwing", () => {
    const h = hashOf( {} );
    assert.match( h, /^[0-9a-f]{64}$/ );
    assert.strictEqual( h, expectedHash( {}, TEST_KEY ) );
} );
