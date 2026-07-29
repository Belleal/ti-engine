/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Query-bearing section bodies: featured (a curated list) and postList (a repository query).
 *
 * BOTH RESOLVE THROUGH repository.query -- `featured` via resolveIds(), `postList` via list(). A hand-picked list of
 * post ids looks like it has already cleared the visibility check; it has not (CLAUDE.md 2a). Resolving it through
 * the same filter is what stops a curated reference from leaking a gated or unpublished record: a gated item renders
 * its TEASER text, an unpublished one drops out silently.
 *
 * Consequently the card excerpt is chosen by verdict, not by field precedence: a gated record shows `teaser` and
 * never `summary`, because `summary` may be derived from the body being withheld.
 */

const { html, raw } = require( "#html" );

/**
 * The blurb a card may show for a record, given the viewer's verdict for it.
 *
 * @param {{ record: Object, verdict: string }} item
 * @returns {string}
 */
function excerptFor( item ) {
    if ( item.verdict === "gated" ) {
        return item.record.teaser || "";
    }
    if ( item.record.summary ) {
        return item.record.summary;
    }
    return ( item.record.seo && item.record.seo.description ) || "";
}

/**
 * The taxonomy line above a card title. The theme shows both facets separated by a middle dot; labels are resolved
 * through the taxonomy when one is available, falling back to the raw term id.
 *
 * @param {Object} record
 * @param {Object} context
 * @returns {string}
 */
function termLineFor( record, context ) {
    const taxonomy = context.taxonomy;
    const lang = record.lang || "en";
    const label = ( facet, id ) => {
        if ( !id ) {
            return null;
        }
        if ( taxonomy ) {
            const term = taxonomy.resolve( facet, id );
            if ( term && term.label && term.label[ lang ] ) {
                return term.label[ lang ];
            }
        }
        return id;
    };
    return [ label( "world", record.world ), label( "form", record.form ) ].filter( Boolean ).join( " · " );
}

/**
 * Renders one post card. `featured` promotes the same component with a modifier rather than introducing a second
 * one, so a pinned listing item and a featured section share the markup.
 *
 * @param {{ record: Object, verdict: string }} item
 * @param {Object} context
 * @param {boolean} [featured]
 * @returns {import("../html.js").SafeString}
 */
function renderPostCard( item, context, featured ) {
    const record = item.record;
    const classes = featured ? "post-card post-card-featured" : "post-card";
    const media = record.seo && record.seo.ogImage
        ? html`<div class="post-card-media"><img src="${ record.seo.ogImage }" alt="${ record.title }"></div>`
        : raw( "" );

    const termLine = termLineFor( record, context );
    const term = termLine ? html`<p class="post-card-term">${ termLine }</p>` : raw( "" );
    const excerpt = excerptFor( item );
    const body = excerpt ? html`<p class="post-card-excerpt">${ excerpt }</p>` : raw( "" );
    const date = record.publishedAt
        ? html`<span class="post-card-date">${ formatDate( record.publishedAt, record.lang ) }</span>`
        : raw( "" );
    const more = context.labels && context.labels.readMore
        ? html`<span class="post-card-more">${ context.labels.readMore }</span>`
        : raw( "" );

    return html`<article class="${ classes }">${ media }<div class="post-card-body">${ term }<h3 class="post-card-title"><a href="${ record.path }">${ record.title }</a></h3>${ body }<div class="post-card-foot">${ date }${ more }</div></div></article>`;
}

/**
 * Formats an ISO date for display. Deliberately simple and locale-aware only to the extent the site needs: the
 * record's own language decides the month name.
 *
 * @param {string} iso
 * @param {string} [lang]
 * @returns {string}
 */
function formatDate( iso, lang ) {
    const date = new Date( iso );
    if ( isNaN( date.getTime() ) ) {
        return "";
    }
    return date.toLocaleDateString( lang === "bg" ? "bg-BG" : "en-GB", { day: "numeric", month: "long", year: "numeric" } );
}

/**
 * `featured` -- either a static announcement card, or a curated row of records referenced by id. The curated form
 * resolves every id through the repository, so it inherits visibility filtering like any other surface.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
function renderFeatured( section, context ) {
    const ids = Array.isArray( section.items ) ? section.items : [];
    if ( ids.length > 0 ) {
        const repository = context.repository;
        if ( !repository ) {
            return raw( "" );
        }
        const items = repository.resolveIds( ids, context.viewer );
        if ( items.length === 0 ) {
            return raw( "" );
        }
        if ( section.variant === "cards" ) {
            return html`<div class="highlight-cards">${ items.map( ( item ) => {
                const termLine = termLineFor( item.record, context );
                const label = termLine ? html`<p class="highlight-label">${ termLine }</p>` : raw( "" );
                const description = excerptFor( item );
                const desc = description ? html`<p class="highlight-desc">${ description }</p>` : raw( "" );
                return html`<article class="highlight-card">${ label }<h4 class="highlight-title"><a href="${ item.record.path }">${ item.record.title }</a></h4>${ desc }</article>`;
            } ) }</div>`;
        }
        return html`<div class="post-grid">${ items.map( ( item ) => renderPostCard( item, context, true ) ) }</div>`;
    }

    // Static announcement -- no record behind it.
    const cardTitle = section.cardTitle ? html`<h4 class="featured-card-title">${ section.cardTitle }</h4>` : raw( "" );
    const cardBody = section.body ? html`<p class="featured-card-body">${ section.body }</p>` : raw( "" );
    if ( !section.cardTitle && !section.body ) {
        return raw( "" );
    }
    return html`<div class="featured-card">${ cardTitle }${ cardBody }</div>`;
}

/**
 * `postList` -- an inline repository query. Pagination is by `?page=N` (self-canonical), so no index entry is needed
 * per page.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
function renderPostList( section, context ) {
    const repository = context.repository;
    if ( !repository ) {
        return raw( "" );
    }

    const limit = Number.isInteger( section.limit ) ? section.limit : 12;
    const page = Number.isInteger( context.page ) && context.page > 0 ? context.page : 1;
    const criteria = {
        type: section.recordType || "post",
        sort: section.sort || "recent",
        world: section.world,
        form: section.form,
        lang: section.lang || context.lang,
        offset: ( page - 1 ) * limit,
        limit: limit
    };

    const total = repository.count( criteria, context.viewer );
    const items = repository.list( criteria, context.viewer );
    if ( items.length === 0 ) {
        return context.labels && context.labels.emptyArchive
            ? html`<div class="state-panel"><p class="state-mark">◆</p><p class="state-body">${ context.labels.emptyArchive }</p></div>`
            : raw( "" );
    }

    const grid = html`<div class="post-grid">${ items.map( ( item, index ) => renderPostCard( item, context, section.promoteFirst === true && page === 1 && index === 0 ) ) }</div>`;
    const pagination = ( section.paginated === true ) ? renderPagination( page, Math.ceil( total / limit ), context ) : raw( "" );
    return html`${ grid }${ pagination }`;
}

/**
 * Query-param pagination. The current page is a span with aria-current rather than a link, so the control never
 * points at the page the reader is already on.
 *
 * @param {number} page
 * @param {number} pages
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
function renderPagination( page, pages, context ) {
    if ( pages <= 1 ) {
        return raw( "" );
    }
    const labels = context.labels || {};
    const link = ( target, text ) => html`<li><a class="pagination-link" href="?page=${ target }">${ text }</a></li>`;

    const items = [];
    items.push( page > 1
        ? link( page - 1, labels.previousPage || "← Prev" )
        : html`<li><span class="pagination-link pagination-disabled">${ labels.previousPage || "← Prev" }</span></li>` );

    for ( let number = 1; number <= pages; number++ ) {
        const near = Math.abs( number - page ) <= 1 || number === 1 || number === pages;
        if ( !near ) {
            // Collapse a run into a single gap marker rather than repeating it per omitted page.
            if ( number === 2 || number === pages - 1 ) {
                items.push( html`<li><span class="pagination-gap">…</span></li>` );
            }
            continue;
        }
        items.push( number === page
            ? html`<li><span class="pagination-link pagination-current" aria-current="page">${ number }</span></li>`
            : link( number, number ) );
    }

    items.push( page < pages
        ? link( page + 1, labels.nextPage || "Next →" )
        : html`<li><span class="pagination-link pagination-disabled">${ labels.nextPage || "Next →" }</span></li>` );

    return html`<nav aria-label="${ labels.pagination || "Pagination" }"><ul class="pagination">${ items }</ul></nav>`;
}

module.exports = {
    renderFeatured: renderFeatured,
    renderPostList: renderPostList,
    renderPostCard: renderPostCard,
    renderPagination: renderPagination
};
