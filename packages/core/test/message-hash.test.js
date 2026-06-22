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
