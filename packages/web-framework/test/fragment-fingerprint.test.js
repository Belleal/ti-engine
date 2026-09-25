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
 * Covers the content address of the fragments an application declares `immutable`, and the rewrite that puts it into
 * the HTML (CA-183).
 * <br/>
 * A revalidated screen costs one round trip per visit, and on a hosted deployment that trip was 0.6-0.9 s while the
 * process spent 4-7 ms. A screen whose markup is the same for everyone until the next deployment can instead be asked
 * for by an address that names its content, and kept. These tests hold the rewrite to that: it changes exactly the
 * references it should, keeps the address bar clean, and does not mistake markup inside a comment, a script or a
 * quoted attribute for a tag.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const fragmentFingerprint = require( "#fragment-fingerprint" );

const IDENTIFIERS = new Set( [ "help-overview", "help-getting-started" ] );
const VERSION = "0123456789ab";
const address = ( html ) => fragmentFingerprint.addressFragmentReferences( html, IDENTIFIERS, VERSION );

describe( "the version", () => {

    it( "is 12 hex characters, and does not depend on the order the fragments were registered in", () => {
        const forward = fragmentFingerprint.versionOf( new Map( [ [ "a", "1" ], [ "b", "2" ] ] ) );
        const reverse = fragmentFingerprint.versionOf( new Map( [ [ "b", "2" ], [ "a", "1" ] ] ) );
        assert.match( forward, /^[0-9a-f]{12}$/ );
        assert.equal( forward, reverse );
    } );

    it( "moves when any member's markup does", () => {
        const before = fragmentFingerprint.versionOf( new Map( [ [ "a", fragmentFingerprint.digestOf( "<p>a</p>" ) ], [ "b", fragmentFingerprint.digestOf( "<p>b</p>" ) ] ] ) );
        const after = fragmentFingerprint.versionOf( new Map( [ [ "a", fragmentFingerprint.digestOf( "<p>a</p>" ) ], [ "b", fragmentFingerprint.digestOf( "<p>b, edited</p>" ) ] ] ) );
        assert.notEqual( before, after );
    } );

} );

describe( "addressing references to immutable screens", () => {

    it( "adds the version to an hx-get naming one, and keeps the pushed URL plain", () => {
        // HTMX pushes the URL it requested: without the second change the address bar would show `?v=`.
        assert.equal(
            address( `<button hx-get="/app/help-overview" hx-target="#ti-content" hx-push-url="true">Help</button>` ),
            `<button hx-get="/app/help-overview?v=${ VERSION }" hx-target="#ti-content" hx-push-url="/app/help-overview">Help</button>`
        );
    } );

    it( "does the same for hx-replace-url and for the data-hx-* spellings, keeping single quotes and quoting bare values", () => {
        assert.equal(
            address( `<a data-hx-get='/app/help-overview' data-hx-push-url=true>a</a><div hx-get="/app/help-getting-started" hx-replace-url="true"></div>` ),
            `<a data-hx-get='/app/help-overview?v=${ VERSION }' data-hx-push-url="/app/help-overview">a</a><div hx-get="/app/help-getting-started?v=${ VERSION }" hx-replace-url="/app/help-getting-started"></div>`
        );
    } );

    it( "leaves a pushed URL the element already chose, and one it declined", () => {
        assert.equal(
            address( `<a hx-get="/app/help-overview" hx-push-url="/guide">a</a><a hx-get="/app/help-overview" hx-push-url="false">b</a>` ),
            `<a hx-get="/app/help-overview?v=${ VERSION }" hx-push-url="/guide">a</a><a hx-get="/app/help-overview?v=${ VERSION }" hx-push-url="false">b</a>`
        );
    } );

    it( "leaves other screens, references that carry a query, and plain links alone", () => {
        const html = `<a hx-get="/app/dashboard" hx-push-url="true">d</a><a hx-get="/app/help-overview?section=2">q</a><a href="/app/help-overview">link</a>`;
        assert.equal( address( html ), html );
    } );

    it( "reads a quoted attribute whole, so an Alpine expression with `>` or quotes does not end the tag early", () => {
        assert.equal(
            address( `<a x-show="count > 0" @click="active = 'help'" x-bind:class="{ active: active === 'help' }" hx-get="/app/help-overview" hx-push-url="true">x</a>` ),
            `<a x-show="count > 0" @click="active = 'help'" x-bind:class="{ active: active === 'help' }" hx-get="/app/help-overview?v=${ VERSION }" hx-push-url="/app/help-overview">x</a>`
        );
    } );

    it( "skips comments and the raw text of scripts and styles", () => {
        const html = `<!-- <a hx-get="/app/help-overview" hx-push-url="true"> -->`
            + `<script>if ( a < b ) { render( "<a hx-get=\\"/app/help-overview\\">" ); }</script>`
            + `<style>a[hx-get="/app/help-overview"] { color: red; }</style>`;
        assert.equal( address( html ), html );
    } );

    it( "changes nothing without a version or without immutable screens", () => {
        const html = `<a hx-get="/app/help-overview" hx-push-url="true">a</a>`;
        assert.equal( fragmentFingerprint.addressFragmentReferences( html, IDENTIFIERS, "" ), html );
        assert.equal( fragmentFingerprint.addressFragmentReferences( html, new Set(), VERSION ), html );
    } );

} );
