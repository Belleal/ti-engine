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

const { termLabel, termPathPattern, termArchivePath } = require( "#terms" );

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
            const termPath = termPathPattern( archive.termPath, facet );
            if ( !termPath ) {
                continue;
            }
            for ( const term of taxonomy.terms( facet ) ) {
                // The same helper the renderer links with, so a generated path and a rendered href cannot disagree.
                const path = termArchivePath( termPath, term, lang, options.defaultLanguage );
                if ( !path ) {
                    continue;
                }
                records.push( {
                    id: "archive-" + lang + "-" + facet + "-" + term.id,
                    type: "page",
                    path: path,
                    lang: lang,
                    title: termLabel( term, lang ),
                    visibility: "public",
                    status: "published",
                    seo: { description: describeArchive( term, lang, archive ) },
                    sections: [ {
                        type: "postList",
                        // The section chrome carries the heading, so the archive reads as a place rather than a list.
                        title: termLabel( term, lang ),
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
 * @param {Object} archive
 * @returns {string}
 */
function describeArchive( term, lang, archive ) {
    const label = termLabel( term, lang );
    return archive.descriptionPattern
        ? String( archive.descriptionPattern ).replace( "{term}", label )
        : label;
}

module.exports = {
    buildArchiveRecords: buildArchiveRecords,
    DEFAULT_LIMIT: DEFAULT_LIMIT
};
