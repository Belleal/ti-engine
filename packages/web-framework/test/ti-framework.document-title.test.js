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
 * Covers the topbar's document title: the screen's name, followed by the application's when the application declares
 * one in `<meta name="application-name">` (CA-326).
 * <br/>
 * The topbar replaces `document.title` with the screen's name on every navigation, so the `<title>` an application
 * serves never showed, and every tab read as a bare screen name ("Dashboard") whatever application it belonged to.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

const LABELS = { interface: { topbar: { dashboard: "Dashboard", profile: "Your profile", about: "About Competence@Work" } } };

/**
 * A topbar on a page that declares the given application name (or none), started on the dashboard, with Alpine's
 * `$watch` stood in for so a screen change can be driven by hand.
 *
 * @method
 * @param {string} [applicationName] The meta's `content`; leave out for a page with no such meta.
 * @returns {{ tiApplication: Object, document: Object, navigate: function( Object ): void }}
 * @private
 */
function topbarOnPage( applicationName ) {
    const { stores, components, sandbox } = loadTiFramework();
    sandbox.document.querySelector = ( selector ) => ( applicationName !== undefined && selector === "meta[name=\"application-name\"]" )
        ? { getAttribute: ( name ) => ( name === "content" ? applicationName : null ) }
        : null;
    stores.tiApplication.configuration = { labels: LABELS };

    const watchers = [];
    const topbar = components.tiComponentTopbar();
    topbar.$watch = ( getter, callback ) => watchers.push( callback );
    topbar.init();

    return {
        tiApplication: stores.tiApplication,
        document: sandbox.document,
        navigate: ( change ) => {
            Object.assign( stores.tiApplication, change );
            watchers.forEach( ( callback ) => callback() );
        }
    };
}

describe( "the topbar's document title — the screen, then the application's name", () => {

    it( "follows the screen's name with the application's, through navigation and a screen's own title", () => {
        const page = topbarOnPage( "Competence@Work" );
        assert.equal( page.document.title, "Dashboard · Competence@Work" );

        page.navigate( { currentScreen: "profile" } );
        assert.equal( page.document.title, "Your profile · Competence@Work" );

        page.navigate( { screenTitleOverride: "Ivan Petrov" } );
        assert.equal( page.document.title, "Ivan Petrov · Competence@Work" );
    } );

    it( "keeps the bare screen name on a page that declares no application name, or an empty one", () => {
        assert.equal( topbarOnPage().document.title, "Dashboard" );
        assert.equal( topbarOnPage( "   " ).document.title, "Dashboard" );
    } );

    it( "names the application once on a screen whose own title already names it", () => {
        const page = topbarOnPage( "Competence@Work" );
        page.navigate( { currentScreen: "about" } );
        assert.equal( page.document.title, "About Competence@Work", "not \"About Competence@Work · Competence@Work\"" );
    } );

    it( "leaves the title alone on a screen with no name of its own", () => {
        const page = topbarOnPage( "Competence@Work" );
        page.navigate( { currentScreen: "unlabelled-screen" } );
        assert.equal( page.document.title, "Dashboard · Competence@Work" );
    } );

} );
