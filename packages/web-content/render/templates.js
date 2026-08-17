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

/*
 * Page templates -- the <main> body for each content type, plus the gate and the state panel.
 *
 * A record is rendered in one of two modes, decided by the repository and passed in the context: `full` (the viewer
 * may read it) or `teaser` (a gated record seen by someone who may not). A template NEVER decides that for itself
 * and never inspects `visibility` -- the repository is the only place that judgement is made.
 *
 * The gate renders BOTH doors because sign-in and capture are independent mechanisms: signing in opens a record that
 * exists, while capture covers one not published yet. `.gate-cut` is the fade over the end of the teaser, marked
 * aria-hidden because it is purely visual -- the panel's heading is what announces the state.
 */

const { html, raw } = require( "#html" );
const markdown = require( "#markdown" );
const { renderSection } = require( "#sections" );

// The three states a book or release can be in. Validated so a record value cannot inject a class name.
// Taken from the schema rather than restated: these values are also a CSS contract (`state-*` / `on-*`), so a
// copy that drifted would silently stop matching the stylesheet and sections would quietly never show.
const RELEASE_STATES = new Set( require( "#schema" ).RELEASE_STATES );

/**
 * Renders a record's <main> content for its type.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderMain( record, context ) {
    if ( record.type === "post" ) {
        return renderPost( record, context );
    }
    return renderComposed( record, context );
}

/**
 * `post` -- the article: breadcrumb, header, body (or gate), footnotes, terms, adjacent-post navigation.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderPost( record, context ) {
    const body = ( context.mode === "teaser" )
        ? renderGate( record, context )
        : html`<div class="prose">${ renderProseBody( record ) }</div>`;

    const parts = [
        renderBreadcrumb( record, context ),
        renderPostHeader( record, context ),
        body,
        renderTermPills( record, context ),
        renderPostNav( context )
    ];

    return html`<article class="section bg-abyss"><div class="wrap-page">${ parts }</div></article>`;
}

/**
 * `page`, `book`, `release` -- composed records: a list of sections, each dispatched through the section registry.
 * A gated composed record shows its gate in place of the sections.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderComposed( record, context ) {
    if ( context.mode === "teaser" ) {
        return html`<article class="section bg-abyss"><div class="wrap-page">${ renderPostHeader( record, context ) }${ renderGate( record, context ) }</div></article>`;
    }
    const sections = Array.isArray( record.sections ) ? record.sections : [];

    // Two classes, both scoped on the outermost element: a per-release palette, and the release state.
    //
    // The state MUST be a class, not a data attribute: the theme drives it with `.state-prerelease
    // .on-announced { display: none }`, so a data attribute leaves the whole mechanism inert and copy
    // that only makes sense before release stays visible after it.
    const classes = [];
    if ( record.theme ) {
        classes.push( "theme-" + record.theme );
    }
    if ( RELEASE_STATES.has( record.releaseState ) ) {
        classes.push( "state-" + record.releaseState );
    }
    const attr = classes.length ? html` class="${ classes.join( " " ) }"` : raw( "" );
    return html`<article${ attr }>${ sections.map( ( section ) => renderSection( section, context ) ) }</article>`;
}

/**
 * A record's prose body. `bodyFormat: "html"` is dormant and withheld -- see render/editorial/text.js.
 *
 * @param {Object} record
 * @returns {import("./html.js").SafeString}
 */
function renderProseBody( record ) {
    if ( !record.body || record.bodyFormat === "html" ) {
        return raw( "" );
    }
    return markdown.render( record.body );
}

/**
 * The breadcrumb trail. Built from configured ancestors plus the current record; omitted when nothing precedes it,
 * because a breadcrumb of one item is noise.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderBreadcrumb( record, context ) {
    const trail = Array.isArray( context.breadcrumb ) ? context.breadcrumb.filter( ( item ) => item && item.href && item.label ) : [];
    if ( trail.length === 0 ) {
        return raw( "" );
    }
    const labels = context.labels || {};
    const items = [];
    for ( const item of trail ) {
        items.push( html`<li class="breadcrumb-item"><a href="${ item.href }">${ item.label }</a></li>` );
        items.push( html`<li class="breadcrumb-sep" aria-hidden="true">·</li>` );
    }
    items.push( html`<li class="breadcrumb-item breadcrumb-current" aria-current="page">${ record.title }</li>` );
    return html`<nav aria-label="${ labels.breadcrumb || "Breadcrumb" }"><ol class="breadcrumb">${ items }</ol></nav>`;
}

/**
 * The article header: eyebrow, title, subtitle, and the dot-separated meta line.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderPostHeader( record, context ) {
    const eyebrow = context.eyebrow ? html`<p class="post-eyebrow">${ context.eyebrow }</p>` : raw( "" );
    const subtitle = record.subtitle ? html`<p class="post-subtitle">${ record.subtitle }</p>` : raw( "" );

    const meta = ( Array.isArray( context.meta ) ? context.meta : [] ).filter( Boolean );
    const metaLine = meta.length
        ? html`<div class="post-meta">${ meta.map( ( entry, index ) => index === 0
            ? html`<span>${ entry }</span>`
            : html`<span class="post-meta-sep" aria-hidden="true">·</span><span>${ entry }</span>` ) }</div>`
        : raw( "" );

    return html`<header class="post-header">${ eyebrow }<h1 class="post-title">${ record.title }</h1>${ subtitle }${ metaLine }</header>`;
}

/**
 * The taxonomy pills in the article footer.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderTermPills( record, context ) {
    const terms = ( Array.isArray( context.terms ) ? context.terms : [] ).filter( ( term ) => term && term.href && term.label );
    if ( terms.length === 0 ) {
        return raw( "" );
    }
    const pills = terms.map( ( term ) => {
        const count = Number.isInteger( term.count ) ? html` <span class="term-pill-count">${ term.count }</span>` : raw( "" );
        const classes = term.current ? "term-pill term-pill-current" : "term-pill";
        return html`<li><a class="${ classes }" href="${ term.href }">${ term.label }${ count }</a></li>`;
    } );
    return html`<footer class="post-footer"><ul class="term-pills">${ pills }</ul></footer>`;
}

/**
 * Previous / next navigation. Each side is emitted only when it exists, so the last post shows one control rather
 * than a dead one.
 *
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderPostNav( context ) {
    const labels = context.labels || {};
    const previous = context.previous;
    const next = context.next;
    if ( !previous && !next ) {
        return raw( "" );
    }
    const link = ( target, modifier, direction ) => html`<a class="post-nav-item ${ modifier }" href="${ target.path }"><span class="post-nav-dir">${ direction }</span><span class="post-nav-title">${ target.title }</span></a>`;
    const parts = [];
    if ( previous ) {
        parts.push( link( previous, "post-nav-prev", labels.previousPost || "← Previous" ) );
    }
    if ( next ) {
        parts.push( link( next, "post-nav-next", labels.nextPost || "Next →" ) );
    }
    return html`<nav class="post-nav" aria-label="${ labels.adjacentPosts || "Adjacent posts" }">${ parts }</nav>`;
}

/**
 * The gate: the teaser with its fade, then the panel offering both doors.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {import("./html.js").SafeString}
 */
function renderGate( record, context ) {
    const labels = context.labels || {};
    const site = context.site || {};

    const teaser = record.teaser
        ? html`<div class="gate-teaser"><div class="prose">${ markdown.render( record.teaser ) }</div><div class="gate-cut" aria-hidden="true"></div></div>`
        : raw( "" );

    const eyebrow = labels.gateEyebrow ? html`<p class="gate-eyebrow">${ labels.gateEyebrow }</p>` : raw( "" );
    const body = labels.gateBody ? html`<p class="gate-body">${ labels.gateBody }</p>` : raw( "" );
    const alt = labels.gateAlt ? html`<p class="gate-alt">${ labels.gateAlt }</p>` : raw( "" );

    const actions = [];
    if ( site.signInPath ) {
        actions.push( html`<a class="btn btn-accept" href="${ site.signInPath }">${ labels.gateSignIn || "Sign in to keep reading" }</a>` );
    }
    if ( site.registerPath ) {
        actions.push( html`<a class="btn btn-deny" href="${ site.registerPath }">${ labels.gateRegister || "Create an account" }</a>` );
    }
    const actionRow = actions.length ? html`<div class="gate-actions">${ actions }</div>` : raw( "" );

    return html`${ teaser }<div class="gate-panel">${ eyebrow }<h2 class="gate-title">${ labels.gateTitle || "The rest is behind a sign-in" }</h2>${ body }${ actionRow }${ alt }</div>`;
}

/**
 * The state panel -- used by 404 and by an empty archive.
 *
 * NOTE for the 404 caller: the copy must NOT distinguish hidden, unpublished and unknown. `content-routes.js` falls
 * through to the same place for all three deliberately, and saying which one it was would leak exactly what the
 * deny-by-default rule exists to hide.
 *
 * @param {{ mark?: string, title: string, body?: string, actions?: Array<{href: string, label: string, tone?: string}> }} options
 * @returns {import("./html.js").SafeString}
 */
function renderStatePanel( options ) {
    const opts = options || {};
    const mark = html`<p class="state-mark">${ opts.mark || "◆" }</p>`;
    const body = opts.body ? html`<p class="state-body">${ opts.body }</p>` : raw( "" );
    const actions = ( Array.isArray( opts.actions ) ? opts.actions : [] ).filter( ( action ) => action && action.href );
    const row = actions.length
        ? html`<div class="btn-row">${ actions.map( ( action ) => html`<a class="btn ${ action.tone || "btn-accept" }" href="${ action.href }">${ action.label }</a>` ) }</div>`
        : raw( "" );
    return html`<div class="state-panel">${ mark }<h1 class="state-title">${ opts.title || "" }</h1>${ body }${ row }</div>`;
}

module.exports = {
    renderMain: renderMain,
    renderPost: renderPost,
    renderComposed: renderComposed,
    renderBreadcrumb: renderBreadcrumb,
    renderPostHeader: renderPostHeader,
    renderTermPills: renderTermPills,
    renderPostNav: renderPostNav,
    renderGate: renderGate,
    renderStatePanel: renderStatePanel
};
