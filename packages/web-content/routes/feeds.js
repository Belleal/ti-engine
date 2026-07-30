/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Feed generation -- sitemap.xml, rss.xml, robots.txt. Every membership decision goes through the repository with an
 * ANONYMOUS viewer, so hidden records and drafts are excluded structurally rather than by a filter anyone could
 * forget to write.
 *
 * Sitemap membership (§8): a public record is included; a GATED record is included only when it has a `teaser` --
 * that teaser page is public and indexable, so it belongs, while the gated body itself is rendered noindex. A gated
 * record with no teaser has nothing public to index and stays out.
 *
 * RSS carries PUBLIC records only. The specs pin the sitemap rule but leave the feed open, so the conservative
 * reading wins: a syndicated item travels far and is cached by aggregators, and nothing gated should ride along.
 */

const { escapeHtml } = require( "#html" );
const { canonicalUrl, joinUrl } = require( "#document" );

// Feed membership is always decided as an anonymous visitor would see the site.
const ANONYMOUS = { authenticated: false, roles: [] };

/**
 * The records that belong in the sitemap: public records, plus gated records that expose a public teaser.
 *
 * @param {import("../content/repository.js")} repository
 * @param {Object} [criteria]  Optional repository criteria (e.g. { type: "post" }).
 * @returns {Array<{ record: Object, verdict: string }>}
 */
function sitemapEntries( repository, criteria ) {
    return repository.list( criteria || {}, ANONYMOUS ).filter( ( item ) => {
        if ( item.verdict === "visible" ) {
            return true;
        }
        return item.verdict === "gated" && !!item.record.teaser;
    } );
}

/**
 * Renders a sitemap XML document from sitemap entries.
 *
 * @param {Array<{ record: Object }>} entries
 * @param {string} baseUrl
 * @returns {string}
 */
function renderSitemap( entries, baseUrl ) {
    const urls = entries.map( ( entry ) => {
        const loc = escapeHtml( canonicalUrl( entry.record, baseUrl ) );
        const lastmod = entry.record.updatedAt || entry.record.publishedAt;
        const lastmodTag = lastmod ? `\n    <lastmod>${ escapeHtml( lastmod ) }</lastmod>` : "";
        return `  <url>\n    <loc>${ loc }</loc>${ lastmodTag }\n  </url>`;
    } ).join( "\n" );

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${ urls }\n</urlset>\n`;
}

/**
 * The records that belong in the RSS feed: public records only, most recent first.
 *
 * @param {import("../content/repository.js")} repository
 * @param {{ limit?: number, type?: string }} [options]
 * @returns {Array<{ record: Object, verdict: string }>}
 */
function rssItems( repository, options ) {
    const opts = options || {};
    const criteria = { sort: "recent" };
    if ( opts.type ) {
        criteria.type = opts.type;
    }
    if ( Number.isInteger( opts.limit ) ) {
        criteria.limit = opts.limit;
    }
    return repository.list( criteria, ANONYMOUS ).filter( ( item ) => item.verdict === "visible" && item.record.visibility === "public" );
}

/**
 * Renders an RSS 2.0 document.
 *
 * @param {Array<{ record: Object }>} items
 * @param {{ baseUrl: string, title?: string, description?: string, language?: string }} options
 * @returns {string}
 */
function renderRss( items, options ) {
    const opts = options || {};
    const baseUrl = opts.baseUrl || "";
    const entries = items.map( ( item ) => {
        const record = item.record;
        const link = escapeHtml( canonicalUrl( record, baseUrl ) );
        const description = ( record.seo && record.seo.description ) || record.summary || "";
        const pubDate = record.publishedAt ? `\n      <pubDate>${ escapeHtml( new Date( record.publishedAt ).toUTCString() ) }</pubDate>` : "";
        return `    <item>\n      <title>${ escapeHtml( record.title ) }</title>\n      <link>${ link }</link>\n      <guid isPermaLink="true">${ link }</guid>${ pubDate }\n      <description>${ escapeHtml( description ) }</description>\n    </item>`;
    } ).join( "\n" );

    return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${ escapeHtml( opts.title || "" ) }</title>\n    <link>${ escapeHtml( baseUrl ) }</link>\n    <description>${ escapeHtml( opts.description || "" ) }</description>\n    <language>${ escapeHtml( opts.language || "en" ) }</language>\n${ entries }\n  </channel>\n</rss>\n`;
}

/**
 * Renders robots.txt. A site marked non-indexable (e.g. staging) disallows everything and advertises no sitemap, so
 * a staging crawl can never seed the index.
 *
 * @param {{ baseUrl: string, allowIndexing?: boolean, disallow?: string[] }} options
 * @returns {string}
 */
function renderRobots( options ) {
    const opts = options || {};
    if ( opts.allowIndexing === false ) {
        return "User-agent: *\nDisallow: /\n";
    }
    const disallow = Array.isArray( opts.disallow ) ? opts.disallow : [ "/admin/" ];
    const rules = disallow.map( ( rule ) => `Disallow: ${ rule }` ).join( "\n" );
    // joinUrl, rather than a local `/\/+$/` trim, so the trailing-slash handling lives in one linear place:
    return `User-agent: *\n${ rules }\n\nSitemap: ${ joinUrl( opts.baseUrl, "/sitemap.xml" ) }\n`;
}

module.exports = {
    sitemapEntries: sitemapEntries,
    renderSitemap: renderSitemap,
    rssItems: rssItems,
    renderRss: renderRss,
    renderRobots: renderRobots
};
