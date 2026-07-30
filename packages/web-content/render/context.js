/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The page context -- everything an article template needs that is not in the record itself: its eyebrow, meta line,
 * term pills, breadcrumb trail, and the posts either side of it.
 *
 * The templates accept all of this and render nothing when it is absent, which is exactly why it has to be built
 * somewhere explicit: a template that silently omits a breadcrumb looks identical to one that never had a trail to
 * show. This module is that somewhere.
 *
 * ADJACENT POSTS ARE RESOLVED FOR THE SAME VIEWER as the page itself, through the repository. Computing them from
 * the raw index would link a reader to a record the repository would not have shown them, which is the one way a
 * navigation control can leak the existence of gated or unpublished work.
 *
 * Per-language archive paths come from configuration. The engine must not know that this site keeps its Bulgarian
 * archives under `/bg/writings/` -- it only knows that a language has a pattern.
 */

const ARCHIVE_FACETS = [ "world", "form" ];

/**
 * Formats an ISO date for display in the record's own language.
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
 * A rough word count for the meta line. Markdown syntax is stripped only enough that the number reads true; it is a
 * reading-length signal, not an accounting figure.
 *
 * @param {string} body
 * @returns {number}
 */
function wordCount( body ) {
    if ( !body ) {
        return 0;
    }
    const prose = String( body )
        .replace( /```[\s\S]*?```/g, " " )
        .replace( /!?\[([^\]]*)\]\([^)]*\)/g, "$1" )
        .replace( /\{[^}]*\}/g, " " )
        .replace( /^:::.*$/gm, " " )
        .replace( /[#>*_`~-]/g, " " );
    const words = prose.split( /\s+/ ).filter( ( word ) => /[\p{L}\p{N}]/u.test( word ) );
    return words.length;
}

/**
 * The archive configuration for a language, or null when none is configured.
 *
 * @param {Object} site
 * @param {string} lang
 * @returns {Object|null}
 */
function archiveConfigFor( site, lang ) {
    const archives = ( site && site.archives ) || null;
    if ( !archives ) {
        return null;
    }
    return archives[ lang ] || archives[ ( site && site.defaultLanguage ) || "en" ] || null;
}

/**
 * The archive URL for a term, or null when the language has no archive scheme or the term has no slug.
 *
 * @param {Object} term
 * @param {string} lang
 * @param {Object} site
 * @returns {string|null}
 */
function archiveHref( term, lang, site ) {
    const config = archiveConfigFor( site, lang );
    if ( !config || !config.termPath || !term ) {
        return null;
    }
    const slug = ( term.slug && ( term.slug[ lang ] || term.slug[ ( site && site.defaultLanguage ) || "en" ] ) ) || term.id;
    return slug ? String( config.termPath ).replace( "{slug}", slug ) : null;
}

/**
 * The display label for a term in a language, falling back to the raw id so an unlabelled term is still legible.
 *
 * @param {Object} term
 * @param {string} lang
 * @returns {string}
 */
function termLabel( term, lang ) {
    if ( !term ) {
        return "";
    }
    return ( term.label && ( term.label[ lang ] || term.label.en ) ) || term.id;
}

/**
 * The posts immediately older and newer than this one, for the same viewer.
 *
 * `previous` is the older post and `next` the newer, matching the reading direction the controls imply.
 *
 * @param {Object} record
 * @param {Object} repository
 * @param {Object} viewer
 * @returns {{ previous: (Object|null), next: (Object|null) }}
 */
function adjacentPosts( record, repository, viewer ) {
    if ( !repository || record.type !== "post" ) {
        return { previous: null, next: null };
    }
    const items = repository.list( { type: "post", lang: record.lang, sort: "recent" }, viewer );
    const position = items.findIndex( ( item ) => item.record.id === record.id );
    if ( position === -1 ) {
        return { previous: null, next: null };
    }
    // Sorted newest-first, so the older post sits after this one in the list.
    const older = items[ position + 1 ];
    const newer = items[ position - 1 ];
    return {
        previous: older ? { path: older.record.path, title: older.record.title } : null,
        next: newer ? { path: newer.record.path, title: newer.record.title } : null
    };
}

/**
 * Builds the render context a page template needs beyond the record itself.
 *
 * @param {Object} record
 * @param {{ repository?: Object, taxonomy?: Object, site?: Object, labels?: Object, viewer?: Object }} options
 * @returns {Object}  eyebrow, meta, terms, breadcrumb, previous, next -- each omitted when there is nothing to show.
 */
function buildPageContext( record, options ) {
    const opts = options || {};
    const site = opts.site || {};
    const taxonomy = opts.taxonomy;
    const lang = record.lang || site.defaultLanguage || "en";
    const context = {};

    if ( record.type !== "post" ) {
        return context;
    }

    const resolveTerm = ( facet, id ) => ( taxonomy && id ) ? taxonomy.resolve( facet, id ) : null;
    const worldTerm = resolveTerm( "world", record.world );
    const formTerm = resolveTerm( "form", record.form );

    // Eyebrow: the world the writing belongs to, in the page's own language. The composite two-language label the
    // old site had to use is exactly what per-language labels retire.
    const eyebrow = worldTerm ? termLabel( worldTerm, lang ) : record.world;
    if ( eyebrow ) {
        context.eyebrow = eyebrow;
    }

    const meta = [];
    if ( record.publishedAt ) {
        meta.push( formatDate( record.publishedAt, lang ) );
    }
    if ( formTerm || record.form ) {
        meta.push( formTerm ? termLabel( formTerm, lang ) : record.form );
    }
    const words = wordCount( record.body );
    if ( words >= 100 ) {
        // Below a hundred words the figure says nothing useful and just adds noise to the line.
        meta.push( words.toLocaleString( lang === "bg" ? "bg-BG" : "en-GB" ) + " " + ( ( opts.labels && opts.labels.words ) || "words" ) );
    }
    if ( meta.filter( Boolean ).length ) {
        context.meta = meta.filter( Boolean );
    }

    const terms = [];
    for ( const facet of ARCHIVE_FACETS ) {
        const term = ( facet === "world" ) ? worldTerm : formTerm;
        const href = archiveHref( term, lang, site );
        if ( term && href ) {
            terms.push( { label: termLabel( term, lang ), href: href } );
        }
    }
    if ( terms.length ) {
        context.terms = terms;
    }

    const archive = archiveConfigFor( site, lang );
    if ( archive ) {
        const trail = [];
        if ( archive.homePath ) {
            trail.push( { label: archive.homeLabel || "Home", href: archive.homePath } );
        }
        if ( archive.root ) {
            trail.push( { label: archive.label || "Writings", href: archive.root } );
        }
        // The world archive, when the post has one -- the most specific step before the post itself.
        const worldHref = archiveHref( worldTerm, lang, site );
        if ( worldTerm && worldHref ) {
            trail.push( { label: termLabel( worldTerm, lang ), href: worldHref } );
        }
        if ( trail.length ) {
            context.breadcrumb = trail;
        }
    }

    const adjacent = adjacentPosts( record, opts.repository, opts.viewer );
    if ( adjacent.previous ) {
        context.previous = adjacent.previous;
    }
    if ( adjacent.next ) {
        context.next = adjacent.next;
    }

    return context;
}

module.exports = {
    buildPageContext: buildPageContext,
    adjacentPosts: adjacentPosts,
    archiveHref: archiveHref,
    termLabel: termLabel,
    formatDate: formatDate,
    wordCount: wordCount,
    ARCHIVE_FACETS: ARCHIVE_FACETS
};
