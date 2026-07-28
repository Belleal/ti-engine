/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Input/value-binding guard for the Alpine (CSP) HTML fragments — two related failure modes that both silently
 * corrupt user text on the appraisal forms.
 *
 * 1. Dead event binding. The app dispatches only two custom events — `ti-chart:select` (ti-charts.js) and the
 *    flyout-close event (ti-framework.js) — and registers only two Alpine directives (`text-label`, `ti-chart`).
 *    There is no `ti-input` directive and no code path dispatches a `ti-input` event, so an `@ti-input` /
 *    `x-on:ti-input` handler in a fragment is dead wiring: it never fires and the bound setter never runs. This
 *    silently dropped user text on the interview-outcome form (CA-85) and again on the evaluation Written Feedback
 *    textareas (CA-88). Native form controls must use the DOM `input`/`change` events with `$event.target.value`,
 *    matching the working editor screens.
 *
 * 2. Placeholder-as-value binding. `getFeedbackComment` substitutes a localized "not provided" placeholder for an
 *    empty note — correct for the read-only display, but wrong as the `value` of an EDITABLE control: the field then
 *    shows the literal placeholder text as if it were prior input, and (because the binding is reactive) clearing the
 *    field re-inserts it, so a clean note can't be entered. Editable feedback textareas must bind their value to the
 *    raw-value getter `getFeedbackDraft` (empty when empty), never `getFeedbackComment` (CA-88).
 *
 * Each guard fails if the broken pattern reappears.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const FRAGMENTS_DIR = path.join( path.resolve( __dirname, ".." ), "bin", "static", "fragments" );
const EVALUATION_FRAGMENT = path.join( FRAGMENTS_DIR, "frame-competence-evaluation.html" );

// Alpine binds a listener for a DOM event named after the `@`/`x-on:` directive. `ti-input` is never dispatched,
// so both spellings of a handler for it are always dead. Match either, with any modifier suffix (e.g. `.stop`).
const DEAD_TI_INPUT_BINDING = /(?:@|x-on:)ti-input\b/;

// An editable control's value must never be bound to getFeedbackComment (which returns the placeholder for an empty
// note); it must use getFeedbackDraft. Whitespace-tolerant.
const PLACEHOLDER_VALUE_BINDING = /x-bind:value\s*=\s*"\s*getFeedbackComment\s*\(/;

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

    it( "editable feedback textareas do not bind their value to the placeholder getter", () => {
        const offenders = [];
        const lines = fs.readFileSync( EVALUATION_FRAGMENT, "utf8" ).split( /\r?\n/ );
        lines.forEach( ( line, index ) => {
            if ( PLACEHOLDER_VALUE_BINDING.test( line ) ) {
                offenders.push( `${ path.basename( EVALUATION_FRAGMENT ) }:${ index + 1 }` );
            }
        } );
        assert.deepEqual( offenders, [], `Editable controls binding value to getFeedbackComment (use getFeedbackDraft — the raw value, empty when empty):\n  ${ offenders.join( "\n  " ) }` );
    } );

    // Research-use consent radios (CA-###) — the same class of bug this suite exists for: a control that silently
    // drops input because it binds a custom event nothing ever dispatches. `[^>]*` spans newlines here (attributes
    // are wrapped across lines), so this matches each whole `<input ...>` tag regardless of how it's line-wrapped.
    it( "the research-consent radios bind the native change event, not the dead ti-input event", () => {
        const markup = fs.readFileSync( EVALUATION_FRAGMENT, "utf8" );
        const radios = markup.match( /<input[^>]*name="research-consent[^"]*"[^>]*>/g ) || [];
        assert.ok( radios.length >= 4, "expected the consent radios in both the form-entry panel and the Scores change panel" );
        for ( const radio of radios ) {
            assert.ok( /(?:@|x-on:)change\s*=/.test( radio ), `consent radio must bind a dispatched change event: ${ radio }` );
            assert.ok( !DEAD_TI_INPUT_BINDING.test( radio ), `consent radio must not bind the never-dispatched ti-input event: ${ radio }` );
        }
    } );

    // Consent capture-panel canEdit guard (CA-###). Every other editable control on this fragment (grade pill
    // groups, feedback textareas, the sticky submit bar) additionally gates on `canEdit`, so a completed/lapsed
    // evaluation degrades them to read-only. The consent radios must follow the same convention — otherwise an
    // employee revisiting a submitted or deadline-lapsed evaluation sees a live, clickable consent control with no
    // reachable Submit button, and clicking it gives the false impression something was recorded. The Scores
    // read/change (withdrawal) panel must NOT pick up `canEdit`: it is deliberately available at any evaluation
    // status, including Closed, because withdrawal cannot be conditional on workflow state.
    it( "the capture panel's consent gate requires canEdit; the Scores withdrawal panel's does not", () => {
        const markup = fs.readFileSync( EVALUATION_FRAGMENT, "utf8" );

        const captureSection = markup.match( /<section[^>]*x-show="consent\.enabled && userRole === 1 && !isMyResults[^"]*"[^>]*>/ );
        assert.ok( captureSection, "expected to find the consent capture panel's <section x-show=\"...\">" );
        assert.ok( /canEdit/.test( captureSection[ 0 ] ),
            `consent capture panel must also gate on canEdit, matching every other editable control on this fragment: ${ captureSection[ 0 ] }` );

        const scoresSection = markup.match( /<section[^>]*x-show="consent\.enabled && isMyResults && isOwnResults[^"]*"[^>]*>/ );
        assert.ok( scoresSection, "expected to find the Scores consent (withdrawal) panel's <section x-show=\"...\">" );
        assert.ok( !/canEdit/.test( scoresSection[ 0 ] ),
            `Scores withdrawal panel must stay independent of canEdit — withdrawal cannot be conditional on workflow state: ${ scoresSection[ 0 ] }` );
    } );

} );
