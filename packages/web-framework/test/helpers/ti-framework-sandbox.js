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

/**
 * Test helper that loads the browser-side `ti-framework.js` in a Node sandbox and hands back what it registered
 * with Alpine, so the stores can be exercised as real code instead of asserted against as source text.
 * <br/>
 * The script is a plain browser script — no module exports — that registers everything from an `alpine:init`
 * listener. So the sandbox stands in for the handful of browser globals the factories touch while being
 * constructed, then fires that event and collects the registrations.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const vm = require( "node:vm" );

const SCRIPT_PATH = path.join( __dirname, "..", "..", "bin", "static", "scripts", "ti-framework.js" );

/**
 * Minimal in-memory stand-in for `window.localStorage`.
 *
 * @method
 * @returns {Object}
 * @private
 */
const createStorage = () => {
    const values = new Map();
    return {
        getItem: ( key ) => ( values.has( key ) ? values.get( key ) : null ),
        setItem: ( key, value ) => {
            values.set( key, String( value ) );
        },
        removeItem: ( key ) => {
            values.delete( key );
        }
    };
};

/**
 * Loads `ti-framework.js` and returns the Alpine registrations it produced.
 *
 * @method
 * @returns {{stores: Object, components: Object, directives: Object, sandbox: Object}}
 * @public
 */
const loadTiFramework = () => {
    const stores = {};
    const components = {};
    const directives = {};
    const documentListeners = new Map();

    const Alpine = {
        store: function ( name, value ) {
            if ( arguments.length > 1 ) {
                stores[ name ] = value;
                return value;
            }
            return stores[ name ];
        },
        data: ( name, factory ) => {
            components[ name ] = factory;
        },
        directive: ( name, handler ) => {
            directives[ name ] = handler;
        }
    };

    const documentStub = {
        cookie: "",
        title: "",
        documentElement: { clientWidth: 1280, clientHeight: 800, dataset: {} },
        addEventListener: ( type, handler ) => {
            documentListeners.set( type, ( documentListeners.get( type ) || [] ).concat( handler ) );
        },
        removeEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => []
    };

    const sandbox = {
        console: console,
        Alpine: Alpine,
        document: documentStub,
        localStorage: createStorage()
    };
    // The script reads globals both bare and off `window`, so the sandbox is its own `window`:
    sandbox.window = sandbox;
    sandbox.location = { pathname: "/app/dashboard", search: "", href: "/" };
    sandbox.innerWidth = 1280;
    sandbox.innerHeight = 800;
    sandbox.scrollX = 0;
    sandbox.scrollY = 0;
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};
    sandbox.dispatchEvent = () => {};

    vm.createContext( sandbox );
    vm.runInContext( fs.readFileSync( SCRIPT_PATH, "utf8" ), sandbox, { filename: SCRIPT_PATH } );

    ( documentListeners.get( "alpine:init" ) || [] ).forEach( ( handler ) => handler() );

    return { stores: stores, components: components, directives: directives, sandbox: sandbox };
};

module.exports = { loadTiFramework: loadTiFramework, SCRIPT_PATH: SCRIPT_PATH };
