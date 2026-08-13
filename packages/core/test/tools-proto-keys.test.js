/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const tools = require( "@ti-engine/core/tools" );

/**
 * Builds an object carrying a genuine own property named `key`.
 *
 * An object literal cannot be used for this: in `{ __proto__: x }` the name is a prototype *setter*, not a key, so
 * the property never exists and a test written that way would pass against the very bug it means to catch.
 *
 * @param {string} key
 * @param {*} value
 * @param {Object} [rest]
 * @returns {Object}
 */
function withOwnKey( key, value, rest = {} ) {
    const object = Object.create( null );
    object[ key ] = value;
    Object.keys( rest ).forEach( ( name ) => {
        object[ name ] = rest[ name ];
    } );
    return object;
}

describe( "decycle preserves a key named __proto__", () => {

    it( "keeps the key instead of silently turning it into the replica's prototype", () => {
        const source = withOwnKey( "__proto__", { hello: "world" }, { ada: { name: "Ada" } } );
        const replica = tools.decycle( source );
        assert.ok( Object.prototype.hasOwnProperty.call( replica, "__proto__" ), "the key must survive as an own property" );
        assert.deepEqual( Object.keys( replica ).sort(), [ "__proto__", "ada" ] );
    } );

    it( "serializes it rather than leaking its fields to the top level", () => {
        // The regression: this produced {"ada":{"name":"Ada"},"hello":"world"} — the key gone and `hello`, a field of
        // its value, promoted to a sibling of `ada`. Silent corruption that reached Redis through cache.setJSON.
        const source = withOwnKey( "__proto__", { hello: "world" }, { ada: { name: "Ada" } } );
        const serialized = tools.stringifyJSON( source );
        // The expectation is written out as a literal string on purpose. Building it with
        // `JSON.stringify( { "__proto__": … } )` does not work: even quoted, `__proto__` in an object literal is a
        // prototype setter rather than a key, so the "expected" value would itself lose the key and the assertion
        // would compare against the bug's output.
        assert.equal( serialized, "{\"__proto__\":{\"hello\":\"world\"},\"ada\":{\"name\":\"Ada\"}}" );
        assert.doesNotMatch( serialized, /^\{"ada"/, "a top-level `hello` would mean the value was flattened in" );
    } );

    it( "handles the key nested below the root", () => {
        const inner = withOwnKey( "__proto__", { hello: "world" } );
        const source = { outer: inner };
        const parsed = JSON.parse( tools.stringifyJSON( source ) );
        assert.ok( Object.prototype.hasOwnProperty.call( parsed.outer, "__proto__" ) );
        assert.equal( parsed.outer[ "__proto__" ].hello, "world" );
    } );

    it( "round-trips the key back through JSON.parse as an own property", () => {
        const source = withOwnKey( "__proto__", { hello: "world" } );
        const parsed = JSON.parse( tools.stringifyJSON( source ) );
        assert.ok( Object.prototype.hasOwnProperty.call( parsed, "__proto__" ) );
        assert.equal( Object.getPrototypeOf( parsed ), Object.prototype, "the value must not become the prototype" );
    } );

    it( "leaves a key named constructor alone, which was never affected", () => {
        // Recorded deliberately: `constructor` is an ordinary writable data property with no setter, so bracket
        // assignment always shadowed it correctly. Only `__proto__` was ever broken, and a future reader should not
        // assume otherwise from the fix's shape.
        const source = withOwnKey( "constructor", { x: 1 }, { ada: { y: 2 } } );
        assert.equal( tools.stringifyJSON( source ), JSON.stringify( { constructor: { x: 1 }, ada: { y: 2 } } ) );
    } );

} );

describe( "decycle still does what it exists for", () => {

    it( "leaves an ordinary object untouched", () => {
        assert.equal( tools.stringifyJSON( { a: 1, b: { c: 2 } } ), JSON.stringify( { a: 1, b: { c: 2 } } ) );
    } );

    it( "still replaces a cycle with a $ref", () => {
        const circular = { n: 1 };
        circular.self = circular;
        assert.equal( tools.stringifyJSON( circular ), JSON.stringify( { n: 1, self: { $ref: "$" } } ) );
    } );

    it( "still replicates arrays", () => {
        assert.equal( tools.stringifyJSON( { list: [ 1, { a: 2 } ] } ), JSON.stringify( { list: [ 1, { a: 2 } ] } ) );
    } );

    it( "still restores a cycle through retrocycle", () => {
        const circular = { n: 1 };
        circular.self = circular;
        const restored = tools.retrocycle( JSON.parse( tools.stringifyJSON( circular ) ) );
        assert.equal( restored.self, restored, "retrocycle must resolve the $ref back to the object itself" );
    } );

} );

describe( "the consumers of decycle's output still work", () => {

    it( "decomposeJSON accepts the null-prototype replica", () => {
        // This is the message-exchange integrity-hash path (message-handler.js does
        // `decomposeJSON( decycle( message ) )`), so a replica shape it rejected would break message hashing.
        const decomposed = tools.decomposeJSON( tools.decycle( { a: 1, b: { c: 2 } } ) );
        assert.equal( decomposed, tools.decomposeJSON( { a: 1, b: { c: 2 } } ) );
    } );

    it( "produces the same hash input for equal messages whether or not they went through decycle", () => {
        const message = { id: "abc", payload: { value: 1 } };
        assert.equal( tools.decomposeJSON( tools.decycle( message ) ), tools.decomposeJSON( message ) );
    } );

} );

describe( "errorToJSON", () => {

    it( "copies an error's own properties", () => {
        const error = new Error( "something failed" );
        const copied = tools.errorToJSON( error );
        assert.equal( copied.message, "something failed" );
        assert.ok( copied.stack );
    } );

    it( "keeps an own property named __proto__ rather than repointing the copy's prototype", () => {
        const error = new Error( "something failed" );
        Object.defineProperty( error, "__proto__", { value: { hello: "world" }, enumerable: true, writable: true, configurable: true } );
        const copied = tools.errorToJSON( error );
        assert.ok( Object.prototype.hasOwnProperty.call( copied, "__proto__" ) );
        assert.equal( copied[ "__proto__" ].hello, "world" );
    } );

} );
