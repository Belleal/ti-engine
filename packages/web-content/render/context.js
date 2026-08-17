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

const { termLabel, termPathPattern, termArchivePath } = require( "#terms" );

const ARCHIVE_FACETS = [ "world", "form" ];

// The last resort when a configured locale is unusable and the language tag is no better. English is not a preference
// here, it is the one tag guaranteed to format.
const DEFAULT_LOCALE = "en";

/**
 * Whether a value is a locale `Intl` will actually accept.
 *
 * `Intl` answers a malformed tag by THROWING -- `"en-G"`, `"en_GB"` and `""` are each a RangeError, not a fallback --
 * and the tags here come from site configuration, where a plausible typo in a region subtag is one keystroke away.
 * Unguarded, that typo does not produce an odd-looking date: it takes down the render of every page and every post
 * card in that language with a 500. So the tag is proven usable before it is used.
 *
 * Structural validity is shared across the `Intl` constructors, so one check covers dates and numbers both. A tag
 * that is well-formed but unsupported (`zz-ZZ`) does not throw and is left alone -- that is `Intl`'s fallback to
 * honour, not ours to second-guess.
 *
 * @param {*} locale
 * @returns {boolean}
 */
function isUsableLocale( locale ) {
    if ( typeof locale !== "string" || locale.trim() === "" ) {
        return false;
    }
    try {
        Intl.DateTimeFormat.supportedLocalesOf( locale );
        return true;
    } catch {
        return false;
    }
}

/**
 * Formats an ISO date for display in the record's own language.
 *
 * Takes a resolved BCP-47 LOCALE, not a language tag -- see {@link localeFor}. A bare tag still works, so a caller
 * that has no site config is not broken by it, but it then bypasses any configured region. An unusable one formats in
 * English rather than throwing: a date in the wrong language is a blemish, a thrown RangeError is a blank page.
 *
 * @param {string} iso
 * @param {string} [locale]
 * @returns {string}
 */
function formatDate( iso, locale ) {
    const date = new Date( iso );
    if ( isNaN( date.getTime() ) ) {
        return "";
    }
    const usable = isUsableLocale( locale ) ? locale : DEFAULT_LOCALE;
    return date.toLocaleDateString( usable, { day: "numeric", month: "long", year: "numeric" } );
}

/**
 * The BCP-47 locale to format dates and numbers in for a language.
 *
 * Taken from `site.locales`, because this package is generic and must contain nothing site-specific: a hard-coded
 * `lang === "bg" ? "bg-BG" : "en-GB"` encodes one site's two languages as a fact about the engine, and every other
 * language it is ever given then silently formats as British English -- a wrong date order that looks deliberate.
 *
 * The fallback is the language tag itself rather than a default region. `toLocaleDateString( "bg" )` already
 * formats Bulgarian correctly; a configured entry is only needed to pin a particular REGION.
 *
 * A configured value that `Intl` would reject falls through that same chain, so a mistyped `bg-B` still formats
 * Bulgarian by its bare tag instead of demoting the whole language to English. Only when the tag itself is unusable
 * too is English reached -- see {@link isUsableLocale} for why an unchecked value cannot be passed on.
 *
 * @param {string} lang
 * @param {Object} site
 * @returns {string}  Always a locale `Intl` accepts.
 */
function localeFor( lang, site ) {
    const locales = ( site && site.locales ) || {};
    if ( isUsableLocale( locales[ lang ] ) ) {
        return locales[ lang ];
    }
    return isUsableLocale( lang ) ? lang : DEFAULT_LOCALE;
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
 * Resolved through the same helper the archive records are GENERATED with, so this href and that record's `path` are
 * the same string by construction rather than by two implementations agreeing. They did not agree: the per-facet
 * `termPath` form was understood only by the generator, and this produced `[object Object]` for every term pill on a
 * site that used it.
 *
 * @param {Object} term
 * @param {string} lang
 * @param {Object} site
 * @param {string} [facet]  Needed only for a per-facet `termPath`; omitting it there yields null rather than a link to
 *        whichever archive happened to be listed first.
 * @returns {string|null}
 */
function archiveHref( term, lang, site, facet ) {
    const config = archiveConfigFor( site, lang );
    const pattern = config ? termPathPattern( config.termPath, facet ) : null;
    return pattern ? termArchivePath( pattern, term, lang, ( site && site.defaultLanguage ) || "en" ) : null;
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
    // Resolved ONCE and passed to both formatters, so a date and a word count on the same line can never disagree
    // about which locale the page is in -- and validated there, which is why the number below needs no guard of its
    // own: `toLocaleString` rejects a malformed tag exactly as loudly as `toLocaleDateString` does.
    const locale = localeFor( lang, site );
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
        meta.push( formatDate( record.publishedAt, locale ) );
    }
    if ( formTerm || record.form ) {
        meta.push( formTerm ? termLabel( formTerm, lang ) : record.form );
    }
    const words = wordCount( record.body );
    if ( words >= 100 ) {
        // Below a hundred words the figure says nothing useful and just adds noise to the line.
        meta.push( words.toLocaleString( locale ) + " " + ( ( opts.labels && opts.labels.words ) || "words" ) );
    }
    if ( meta.filter( Boolean ).length ) {
        context.meta = meta.filter( Boolean );
    }

    const terms = [];
    for ( const facet of ARCHIVE_FACETS ) {
        const term = ( facet === "world" ) ? worldTerm : formTerm;
        const href = archiveHref( term, lang, site, facet );
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
        const worldHref = archiveHref( worldTerm, lang, site, "world" );
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
    localeFor: localeFor,
    wordCount: wordCount,
    ARCHIVE_FACETS: ARCHIVE_FACETS
};
