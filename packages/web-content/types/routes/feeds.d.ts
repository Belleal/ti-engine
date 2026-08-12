declare const _exports: {
    sitemapEntries: typeof sitemapEntries;
    renderSitemap: typeof renderSitemap;
    rssItems: typeof rssItems;
    renderRss: typeof renderRss;
    renderRobots: typeof renderRobots;
};
export = _exports;
/**
 * The records that belong in the sitemap: public records, plus gated records that expose a public teaser.
 *
 * @param {import("../content/repository.js")} repository
 * @param {Object} [criteria]  Optional repository criteria (e.g. { type: "post" }).
 * @returns {Array<{ record: Object, verdict: string }>}
 */
declare function sitemapEntries(repository: import("../content/repository.js"), criteria?: Object): Array<{
    record: Object;
    verdict: string;
}>;
/**
 * Renders a sitemap XML document from sitemap entries.
 *
 * @param {Array<{ record: Object }>} entries
 * @param {string} baseUrl
 * @returns {string}
 */
declare function renderSitemap(entries: Array<{
    record: Object;
}>, baseUrl: string): string;
/**
 * The records that belong in the RSS feed: public records only, most recent first.
 *
 * @param {import("../content/repository.js")} repository
 * @param {{ limit?: number, type?: string }} [options]
 * @returns {Array<{ record: Object, verdict: string }>}
 */
declare function rssItems(repository: import("../content/repository.js"), options?: {
    limit?: number;
    type?: string;
}): Array<{
    record: Object;
    verdict: string;
}>;
/**
 * Renders an RSS 2.0 document.
 *
 * @param {Array<{ record: Object }>} items
 * @param {{ baseUrl: string, title?: string, description?: string, language?: string }} options
 * @returns {string}
 */
declare function renderRss(items: Array<{
    record: Object;
}>, options: {
    baseUrl: string;
    title?: string;
    description?: string;
    language?: string;
}): string;
/**
 * Renders robots.txt. A site marked non-indexable (e.g. staging) disallows everything and advertises no sitemap, so
 * a staging crawl can never seed the index.
 *
 * @param {{ baseUrl: string, allowIndexing?: boolean, disallow?: string[] }} options
 * @returns {string}
 */
declare function renderRobots(options: {
    baseUrl: string;
    allowIndexing?: boolean;
    disallow?: string[];
}): string;
