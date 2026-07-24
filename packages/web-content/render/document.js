/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Document-head composition -- generated from the record, never hand-written (build-spec §3). Pins two §8
 * invariants: canonical always points at the record's `path`, and hreflang pairs are reciprocal (with x-default on
 * the English side). Non-public bodies are forced noindex while their public teasers stay indexable, and JSON-LD is
 * emitted per type (Article / Book / MusicAlbum). Full-body vs teaser assembly and the sitewide Person node are
 * layered in with the page templates (P5); this module is the pure, dep-free head builder.
 */

const { html, raw } = require( "#html" );

const OG_TYPE = { post: "article", book: "book", release: "music.album", page: "website" };

/**
 * Joins a base URL and a record path with exactly one slash between them.
 *
 * @param {string} baseUrl
 * @param {string} path
 * @returns {string}
 */
function joinUrl( baseUrl, path ) {
    const base = String( baseUrl || "" ).replace( /\/+$/, "" );
    const suffix = String( path || "" );
    return base + ( suffix.charAt( 0 ) === "/" ? suffix : "/" + suffix );
}

/**
 * The canonical URL of a record: the site base joined to the record's explicit `path`.
 *
 * @param {Object} record
 * @param {string} baseUrl
 * @returns {string}
 */
function canonicalUrl( record, baseUrl ) {
    return joinUrl( baseUrl, record.path );
}

/**
 * Whether the response should carry a `noindex` robots directive. The public teaser of a gated record stays
 * indexable; the full body of any non-public record is noindex, as is any record with an explicit `seo.noindex`.
 *
 * @param {Object} record
 * @param {string} [mode]  "full" (default) or "teaser".
 * @returns {boolean}
 */
function shouldNoindex( record, mode ) {
    if ( record && record.seo && record.seo.noindex === true ) {
        return true;
    }
    if ( mode === "teaser" ) {
        return false;
    }
    return !record || record.visibility !== "public";
}

/**
 * Reciprocal hreflang alternates for a translated pair, with `x-default` pointing at the English side. Empty for a
 * single-language record (no counterpart).
 *
 * @param {Object} record
 * @param {Object} counterpart  The translation counterpart (resolved from `translationOf`), or null.
 * @param {string} baseUrl
 * @returns {Array<{ lang: string, href: string }>}
 */
function hreflangLinks( record, counterpart, baseUrl ) {
    if ( !record || !counterpart ) {
        return [];
    }
    const english = record.lang === "en" ? record : ( counterpart.lang === "en" ? counterpart : record );
    return [
        { lang: record.lang, href: canonicalUrl( record, baseUrl ) },
        { lang: counterpart.lang, href: canonicalUrl( counterpart, baseUrl ) },
        { lang: "x-default", href: canonicalUrl( english, baseUrl ) }
    ];
}

/**
 * Builds the schema.org JSON-LD object for a record: Article (post), Book (book), MusicAlbum (release), else
 * CreativeWork. Undefined fields are dropped by JSON.stringify.
 *
 * @param {Object} record
 * @param {{ baseUrl?: string, author?: string }} [context]
 * @returns {Object}
 */
function jsonLd( record, context ) {
    const ctx = context || {};
    const url = canonicalUrl( record, ctx.baseUrl || "" );
    const author = ctx.author ? { "@type": "Person", "name": ctx.author } : undefined;
    if ( record.type === "post" ) {
        return { "@context": "https://schema.org", "@type": "Article", "headline": record.title, "url": url, "inLanguage": record.lang, "datePublished": record.publishedAt || undefined, "author": author };
    }
    if ( record.type === "book" ) {
        return { "@context": "https://schema.org", "@type": "Book", "name": record.title, "url": url, "inLanguage": record.lang, "author": author };
    }
    if ( record.type === "release" ) {
        return { "@context": "https://schema.org", "@type": "MusicAlbum", "name": record.title, "url": url, "inLanguage": record.lang, "byArtist": author };
    }
    return { "@context": "https://schema.org", "@type": "CreativeWork", "name": record.title, "url": url, "inLanguage": record.lang };
}

/**
 * Composes the inner HTML of the document `<head>` for a record: title, description, canonical, robots (when
 * noindex), hreflang alternates, Open Graph, Twitter card, and the JSON-LD block. All interpolations are escaped by
 * the html`` template; the JSON-LD `<` characters are neutralised so a title cannot break out of the script tag.
 *
 * @param {Object} record
 * @param {{ baseUrl?: string, mode?: string, counterpart?: Object, author?: string }} [context]
 * @returns {import("./html.js").SafeString}
 */
function composeHead( record, context ) {
    const ctx = context || {};
    const baseUrl = ctx.baseUrl || "";
    const canonical = canonicalUrl( record, baseUrl );
    const description = ( record.seo && record.seo.description ) || record.subtitle || "";
    const noindex = shouldNoindex( record, ctx.mode || "full" );
    const alternates = hreflangLinks( record, ctx.counterpart, baseUrl );
    const ldJson = JSON.stringify( jsonLd( record, ctx ) ).replace( /</g, "\\u003c" );
    const ogType = OG_TYPE[ record.type ] || "website";

    return html`<title>${ record.title }</title>
<meta name="description" content="${ description }">
<link rel="canonical" href="${ canonical }">
${ noindex ? html`<meta name="robots" content="noindex,follow">` : raw( "" ) }
${ alternates.map( ( alternate ) => html`<link rel="alternate" hreflang="${ alternate.lang }" href="${ alternate.href }">` ) }
<meta property="og:title" content="${ record.title }">
<meta property="og:type" content="${ ogType }">
<meta property="og:url" content="${ canonical }">
${ description ? html`<meta property="og:description" content="${ description }">` : raw( "" ) }
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ raw( ldJson ) }</script>`;
}

module.exports = {
    canonicalUrl: canonicalUrl,
    shouldNoindex: shouldNoindex,
    hreflangLinks: hreflangLinks,
    jsonLd: jsonLd,
    composeHead: composeHead
};
