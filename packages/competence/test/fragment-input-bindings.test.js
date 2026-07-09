/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Input-binding guard for the Alpine (CSP) HTML fragments. The app dispatches only two custom events —
 * `ti-chart:select` (ti-charts.js) and the flyout-close event (ti-framework.js) — and registers only two Alpine
 * directives (`text-label`, `ti-chart`). There is no `ti-input` directive and no code path dispatches a `ti-input`
 * event, so an `@ti-input` / `x-on:ti-input` handler in a fragment is dead wiring: it never fires and the bound
 * setter never runs. This silently dropped user text on the interview-outcome form (CA-85) and again on the
 * evaluation Written Feedback textareas (CA-88). Native form controls must use the DOM `input`/`change` events with
 * `$event.target.value`, matching the working editor screens. This guard fails if the broken pattern reappears.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const FRAGMENTS_DIR = path.join( path.resolve( __dirname, ".." ), "bin", "static", "fragments" );

// Alpine binds a listener for a DOM event named after the `@`/`x-on:` directive. `ti-input` is never dispatched,
// so both spellings of a handler for it are always dead. Match either, with any modifier suffix (e.g. `.stop`).
const DEAD_TI_INPUT_BINDING = /(?:@|x-on:)ti-input\b/;

function fragmentFiles() {
    return fs.readdirSync( FRAGMENTS_DIR )
        .filter( ( name ) => name.endsWith( ".html" ) )
        .map( ( name ) => path.join( FRAGMENTS_DIR, name ) );
}

describe( "Fragment input bindings", () => {

    it( "no fragment wires a handler to the never-dispatched `ti-input` event", () => {
        const offenders = [];
        for ( const filePath of fragmentFiles() ) {
            const lines = fs.readFileSync( filePath, "utf8" ).split( /\r?\n/ );
            lines.forEach( ( line, index ) => {
                if ( DEAD_TI_INPUT_BINDING.test( line ) ) {
                    offenders.push( `${ path.basename( filePath ) }:${ index + 1 }` );
                }
            } );
        }
        assert.deepEqual( offenders, [], `Fragments binding to the dead \`ti-input\` event (use native @input/@change with $event.target.value):\n  ${ offenders.join( "\n  " ) }` );
    } );

} );
