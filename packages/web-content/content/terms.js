/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Term resolution -- how a taxonomy term becomes a slug, a label, and an archive URL.
 *
 * Archive GENERATION (`content/archives.js`) and PAGE RENDERING (`render/context.js`) both have to answer these
 * questions, and each used to answer them with its own copy of the fallback chain. Of all the duplications in the
 * package this is the one that cannot be allowed to drift: a generated record's `path` IS the archive URL, and a
 * rendered pill's `href` has to be the same string or the link 404s. Two copies of "which slug, in which language,
 * falling back to what" is a broken-link generator with a delay fuse.
 *
 * It had already gone off. When `termPath` gained its per-facet object form -- the escape hatch for two vocabularies
 * that share a slug -- only the generator learned about it; rendering still did `String( termPath )` and produced
 * `[object Object]` for every pill and breadcrumb on a site that used it. One helper, consumed by both, is what makes
 * that class of divergence impossible rather than merely fixed.
 *
 * NOTE: `Taxonomy#slugFor( facet, id, lang )` asks a different question -- it looks a term up in a vocabulary and
 * answers `null` when that language has no slug. These functions take a term already in hand and answer with
 * something usable, falling back to the id so an unlabelled or unslugged term stays legible and linkable.
 */

const DEFAULT_LANGUAGE = "en";

/**
 * The slug to address a term by in a given language.
 *
 * Falls back to the default language and then to the raw id, because a term with no slug in the language being
 * rendered still has to be reachable -- an addressable ugly URL beats no archive at all.
 *
 * @param {Object} term
 * @param {string} lang
 * @param {string} [defaultLanguage="en"]
 * @returns {string|null}  Null only when there is no term, or one with neither slug nor id.
 */
function termSlug( term, lang, defaultLanguage ) {
    if ( !term ) {
        return null;
    }
    const slugs = ( term.slug && typeof term.slug === "object" ) ? term.slug : {};
    return slugs[ lang ] || slugs[ defaultLanguage || DEFAULT_LANGUAGE ] || term.id || null;
}

/**
 * The display label for a term in a language, falling back to English and then to the raw id so an unlabelled term is
 * still legible rather than blank.
 *
 * @param {Object} term
 * @param {string} lang
 * @returns {string}  Empty only when there is no term at all.
 */
function termLabel( term, lang ) {
    if ( !term ) {
        return "";
    }
    return ( term.label && ( term.label[ lang ] || term.label[ DEFAULT_LANGUAGE ] ) ) || term.id || "";
}

/**
 * The archive path pattern for one facet.
 *
 * `termPath` is a single string when every facet shares a URL namespace -- which is a deliberate choice, not an
 * oversight: a flat `/writings/{slug}/` reads better than `/writings/world/{slug}/` and is usually what a migration
 * has to preserve. The cost is that a world term and a form term sharing a slug produce the SAME path, and the loader
 * then reports a conflict and drops one archive to a 404.
 *
 * So the pattern may also be given per facet, `{ world: "...", form: "..." }`, which is the escape hatch when two
 * vocabularies do collide -- without forcing every site to namespace URLs it does not need to.
 *
 * @param {string|Object} termPath
 * @param {string} [facet]  Required to resolve the per-facet form; a caller that does not know the facet gets null
 *        rather than a guess, since guessing here means emitting a link to the wrong archive.
 * @returns {string|null}
 */
function termPathPattern( termPath, facet ) {
    if ( typeof termPath === "string" ) {
        return termPath;
    }
    if ( termPath && typeof termPath === "object" && typeof termPath[ facet ] === "string" ) {
        return termPath[ facet ];
    }
    return null;
}

/**
 * A term's archive path -- the single place `{slug}` is substituted, so a generated `path` and a rendered `href` are
 * the same string by construction.
 *
 * @param {string} pattern  A resolved pattern from {@link termPathPattern}.
 * @param {Object} term
 * @param {string} lang
 * @param {string} [defaultLanguage="en"]
 * @returns {string|null}  Null when there is no pattern or the term cannot be addressed.
 */
function termArchivePath( pattern, term, lang, defaultLanguage ) {
    const slug = termSlug( term, lang, defaultLanguage );
    return ( pattern && slug ) ? String( pattern ).replace( "{slug}", slug ) : null;
}

module.exports = {
    termSlug: termSlug,
    termLabel: termLabel,
    termPathPattern: termPathPattern,
    termArchivePath: termArchivePath,
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE
};
