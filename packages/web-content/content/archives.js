/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Archive records generated from the taxonomy.
 *
 * A term archive is a query, not a document -- there is nothing to author, and hand-writing one record per term
 * would guarantee that adding a term one day leaves its archive 404ing. So they are generated.
 *
 * This does NOT contradict "content is never discovered by scanning": the vocabulary IS the explicit register, and
 * these records are derived from it. Nor does it contradict "path is data, never computed at request time" -- the
 * paths are computed ONCE here, at load, and stored on ordinary records that the path index resolves like any
 * other. Nothing is derived per request.
 *
 * The site's own listing page (`/writings/`) is deliberately not generated: the specs call for a composed page with
 * curation over a listing, which is authored content, not a query.
 */

const DEFAULT_LIMIT = 12;

/**
 * Builds one `page` record per (language, facet, term) that has an archive path configured.
 *
 * @param {Object} taxonomy  A Taxonomy instance.
 * @param {{ archives: Object, languages?: string[], defaultLanguage?: string, facets?: string[], limit?: number }} config
 * @returns {Object[]}  Archive page records, ready to be indexed alongside the authored ones.
 */
function buildArchiveRecords( taxonomy, config ) {
    const options = config || {};
    const archives = options.archives || {};
    const languages = Array.isArray( options.languages ) && options.languages.length ? options.languages : Object.keys( archives );
    const facets = Array.isArray( options.facets ) && options.facets.length ? options.facets : [ "world", "form" ];
    const limit = Number.isInteger( options.limit ) ? options.limit : DEFAULT_LIMIT;
    const records = [];

    if ( !taxonomy || typeof taxonomy.terms !== "function" ) {
        return records;
    }

    for ( const lang of languages ) {
        const archive = archives[ lang ];
        if ( !archive || !archive.termPath ) {
            continue;
        }
        for ( const facet of facets ) {
            for ( const term of taxonomy.terms( facet ) ) {
                const slug = slugFor( term, lang, options.defaultLanguage );
                if ( !slug ) {
                    continue;
                }
                records.push( {
                    id: "archive-" + lang + "-" + facet + "-" + term.id,
                    type: "page",
                    path: String( archive.termPath ).replace( "{slug}", slug ),
                    lang: lang,
                    title: labelFor( term, lang ),
                    visibility: "public",
                    status: "published",
                    seo: { description: describeArchive( term, lang, archive ) },
                    sections: [ {
                        type: "postList",
                        // The section chrome carries the heading, so the archive reads as a place rather than a list.
                        title: labelFor( term, lang ),
                        background: "abyss",
                        recordType: "post",
                        [ facet ]: term.id,
                        lang: lang,
                        sort: "recent",
                        limit: limit,
                        paginated: true
                    } ]
                } );
            }
        }
    }

    return records;
}

/**
 * @param {Object} term
 * @param {string} lang
 * @param {string} [defaultLanguage]
 * @returns {string|null}
 */
function slugFor( term, lang, defaultLanguage ) {
    if ( !term || !term.slug ) {
        return term && term.id ? term.id : null;
    }
    return term.slug[ lang ] || term.slug[ defaultLanguage || "en" ] || term.id || null;
}

/**
 * @param {Object} term
 * @param {string} lang
 * @returns {string}
 */
function labelFor( term, lang ) {
    return ( term.label && ( term.label[ lang ] || term.label.en ) ) || term.id;
}

/**
 * @param {Object} term
 * @param {string} lang
 * @param {Object} archive
 * @returns {string}
 */
function describeArchive( term, lang, archive ) {
    const label = labelFor( term, lang );
    return archive.descriptionPattern
        ? String( archive.descriptionPattern ).replace( "{term}", label )
        : label;
}

module.exports = {
    buildArchiveRecords: buildArchiveRecords,
    DEFAULT_LIMIT: DEFAULT_LIMIT
};
