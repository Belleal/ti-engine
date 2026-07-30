/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Full document assembly: <head> (render/document.js) + shell (render/shell.js) + the type's <main> body
 * (render/templates.js). This is what `mountContentRoutes` installs as the default page renderer.
 *
 * EVERY <script> AND <link> CARRIES THE NONCE. The framework's CSP uses `'strict-dynamic'`, under which supporting
 * browsers IGNORE `'self'` and `https:` in script-src -- only a nonce (or hash) loads a script at all. So a
 * nonce-less <script src> is not "slightly less strict", it simply never executes, and the failure looks like a
 * script that mysteriously does nothing.
 *
 * Stylesheets and the site script are declared by the CONSUMER through `context.assets`, because which files exist
 * and where they live is a deployment concern, not an engine one.
 */

const { html, raw } = require( "#html" );
const { composeHead } = require( "#document" );
const shell = require( "#shell" );
const templates = require( "#templates" );

/**
 * Renders the complete HTML document for a record.
 *
 * @param {Object} record
 * @param {Object} context  mode, viewer, repository, baseUrl, lang, counterpart, nonce, site, labels, assets…
 * @returns {string}
 */
function renderDocument( record, context ) {
    const ctx = context || {};
    const body = templates.renderMain( record, ctx );
    return assemble( {
        lang: record.lang || ( ctx.site && ctx.site.defaultLanguage ) || "en",
        head: composeHead( record, ctx ),
        body: body,
        context: ctx,
        bodyClass: record.theme ? "theme-" + record.theme : null
    } );
}

/**
 * Renders a standalone state document -- 404, or any other page with no record behind it.
 *
 * The 404 copy must not distinguish hidden, unpublished and unknown: the resolver falls through to the same place
 * for all three deliberately, and naming which one it was would leak what deny-by-default exists to hide.
 *
 * @param {{ title: string, body?: string, mark?: string, actions?: Array<Object>, status?: number }} state
 * @param {Object} context
 * @returns {string}
 */
function renderStateDocument( state, context ) {
    const ctx = context || {};
    const site = ctx.site || {};
    const opts = state || {};
    return assemble( {
        lang: ctx.lang || site.defaultLanguage || "en",
        head: html`<title>${ opts.title || "" }</title>
<meta name="robots" content="noindex,follow">`,
        body: html`<div class="section bg-abyss"><div class="wrap-page">${ templates.renderStatePanel( opts ) }</div></div>`,
        context: ctx,
        bodyClass: null
    } );
}

/**
 * The boot script: marks the document as script-capable before anything paints.
 *
 * The theme gates its hidden reveal state on `.js`, so this is what keeps the reveal choreography an enhancement
 * rather than a visibility gate. `opacity: 0` with no script to lift it hides content permanently, and a blocked,
 * disabled or errored script must never be able to do that. It is emitted FIRST in <head> and runs synchronously so
 * the class is set before first paint -- deferring it would show a flash of the un-revealed state.
 *
 * Rendered only when a nonce is available, because under `strict-dynamic` a nonce-less inline script would not
 * execute anyway, and emitting a dead script tag is worse than emitting none.
 *
 * @param {string} [nonce]
 * @returns {import("./html.js").SafeString}
 */
function renderBootScript( nonce ) {
    if ( !nonce ) {
        return raw( "" );
    }
    return html`<script nonce="${ nonce }">document.documentElement.classList.add("js")</script>`;
}

/**
 * The common document skeleton.
 *
 * @param {{ lang: string, head: Object, body: Object, context: Object, bodyClass: (string|null) }} parts
 * @returns {string}
 */
function assemble( parts ) {
    const ctx = parts.context;
    const nonce = ctx.nonce;
    const assets = ctx.assets || {};

    const stylesheets = ( Array.isArray( assets.stylesheets ) ? assets.stylesheets : [] )
        .map( ( href ) => nonce
            ? html`<link rel="stylesheet" href="${ href }" nonce="${ nonce }">`
            : html`<link rel="stylesheet" href="${ href }">` );

    // Preloading the body face removes the flash the swap would otherwise cause on first paint.
    const preloads = ( Array.isArray( assets.preloadFonts ) ? assets.preloadFonts : [] )
        .map( ( href ) => html`<link rel="preload" href="${ href }" as="font" type="font/woff2" crossorigin>` );

    const scripts = ( Array.isArray( assets.scripts ) ? assets.scripts : [] )
        .map( ( src ) => nonce
            ? html`<script src="${ src }" nonce="${ nonce }" defer></script>`
            : html`<script src="${ src }" defer></script>` );

    const bodyAttr = parts.bodyClass ? html` class="${ parts.bodyClass }"` : raw( "" );

    return "<!DOCTYPE html>\n" + html`<html lang="${ parts.lang }"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${ renderBootScript( nonce ) }${ parts.head }${ preloads }${ stylesheets }</head><body${ bodyAttr }>${ shell.renderNoiseLayer() }${ shell.renderSkipLink( ctx.labels ) }${ shell.renderTopbar( ctx ) }<main id="content">${ parts.body }</main>${ shell.renderFooter( ctx ) }${ scripts }</body></html>`.toString() + "\n";
}

module.exports = {
    renderDocument: renderDocument,
    renderStateDocument: renderStateDocument
};
