/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Runs `competence-user-interface.js` — a browser script with no exports, which registers its components through
 * `Alpine.data()` on an `alpine:init` listener — inside a VM sandbox, and hands back the factory for one of them.
 *
 * The repo's other UI guards read the source as text, which is right for wiring but cannot say whether a behaviour
 * works. Timers are supplied by the caller rather than the runtime, so a debounce can be driven deterministically
 * instead of waited on: `flushTimers()` is the passage of time.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const vm = require( "node:vm" );

const SCRIPT = path.join( path.resolve( __dirname, "..", ".." ), "bin", "static", "scripts", "competence-user-interface.js" );

/**
 * @param {string} componentName The name passed to `Alpine.data`, e.g. "competenceEvaluation".
 * @param {Object} [stores] Overrides merged onto the default `tiApplication` / `tiToolbox` store stubs.
 * @returns {{ component: Object, requests: Array, notices: Array, flushTimers: function(): void, pendingTimers: function(): number }}
 */
function loadComponent( componentName, stores = {} ) {
    const requests = [];
    const notices = [];

    // A scheduler the test owns outright. Nothing here fires on its own, so a debounce that failed to cancel its
    // predecessor shows up as two pending timers rather than as a flake.
    let sequence = 0;
    let timers = [];
    const setTimeoutStub = ( fn, ms ) => {
        sequence += 1;
        timers.push( { id: sequence, fn: fn, ms: ms } );
        return sequence;
    };
    const clearTimeoutStub = ( id ) => {
        timers = timers.filter( ( timer ) => timer.id !== id );
    };
    const flushTimers = () => {
        const due = timers;
        timers = [];
        due.forEach( ( timer ) => timer.fn() );
    };

    const tiApplication = {
        isInitialized: true,
        configuration: { grades: {} },
        user: { employeeID: "1" },
        sendRequest: ( url, method, body ) => {
            const record = { url: url, method: method || "GET", body: body };
            requests.push( record );
            record.promise = Promise.resolve( { isSuccessful: true, data: {} } );
            return record.promise;
        },
        notify: ( message ) => notices.push( message ),
        getLabel: ( key, fallback ) => fallback || key,
        setTopbarSubtitle: () => {},
        openScreen: () => {},
        formatException: ( error ) => ( { message: String( error && error.message || error ) } ),
        ...( stores.tiApplication || {} )
    };

    const tiToolbox = {
        structuredClone: ( value ) => JSON.parse( JSON.stringify( value === undefined ? null : value ) ),
        getUrlParam: () => null,
        generateAvatarStyle: () => "",
        ...( stores.tiToolbox || {} )
    };

    const registered = {};
    const sandbox = {
        Alpine: {
            data: ( name, factory ) => { registered[ name ] = factory; },
            store: ( name ) => ( name === "tiApplication" ? tiApplication : tiToolbox ),
            directive: () => {},
            magic: () => {}
        },
        document: {
            addEventListener: ( event, callback ) => { if ( event === "alpine:init" ) callback(); },
            getElementById: () => null,
            querySelectorAll: () => []
        },
        window: { location: { href: "", search: "" }, history: { pushState: () => {} } },
        setTimeout: setTimeoutStub,
        clearTimeout: clearTimeoutStub,
        setInterval: () => 0,
        clearInterval: () => {},
        console: console,
        URLSearchParams: URLSearchParams,
        Date: Date,
        Math: Math,
        JSON: JSON,
        Object: Object,
        Array: Array,
        String: String,
        Number: Number,
        Boolean: Boolean,
        Promise: Promise,
        isNaN: isNaN,
        parseInt: parseInt,
        parseFloat: parseFloat
    };
    sandbox.globalThis = sandbox;

    vm.createContext( sandbox );
    vm.runInContext( fs.readFileSync( SCRIPT, "utf8" ), sandbox, { filename: SCRIPT } );

    const factory = registered[ componentName ];
    if ( typeof factory !== "function" ) {
        throw new Error( `component '${ componentName }' was never registered — Alpine.data names: ${ Object.keys( registered ).join( ", " ) }` );
    }

    return {
        component: factory(),
        requests: requests,
        notices: notices,
        flushTimers: flushTimers,
        pendingTimers: () => timers.length
    };
}

module.exports = { loadComponent };
