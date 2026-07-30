/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Content source reader -- the disk input stage feeding loader.buildIndex(). Records are authored as markdown with
 * YAML front-matter (posts) or as pure YAML (page / book / release), per the ratified on-disk format.
 *
 * CONTENT IS NEVER DISCOVERED BY SCANNING A DIRECTORY (CLAUDE.md 5). Every source is an explicitly registered file
 * path; a directory handed to readSources() is reported as an error rather than expanded, and this module exposes no
 * glob/scan/readdir capability at all. Globbing a content folder is how an unpublished manuscript ends up served.
 *
 * Parsing is separated from disk access so the format handling stays pure and unit-testable. Read failures and
 * malformed files are collected and returned, never thrown -- one bad file must not take down the whole site, but it
 * must also never pass silently.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const matter = require( "gray-matter" );

const MARKDOWN_EXTENSIONS = new Set( [ ".md", ".markdown" ] );
const YAML_EXTENSIONS = new Set( [ ".yml", ".yaml" ] );

/**
 * Infers the source format from a file extension: "markdown" (front-matter + body) or "yaml" (structured record).
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function formatOf( filePath ) {
    const extension = path.extname( String( filePath || "" ) ).toLowerCase();
    if ( MARKDOWN_EXTENSIONS.has( extension ) ) {
        return "markdown";
    }
    if ( YAML_EXTENSIONS.has( extension ) ) {
        return "yaml";
    }
    return null;
}

/**
 * Recursively converts Date instances to ISO-8601 strings, in place-safe fashion.
 *
 * YAML silently parses an unquoted ISO timestamp (`publishedAt: 2026-03-20T00:00:00Z`) into a Date object, which
 * fails the schema's string constraint and would quietly exclude an otherwise valid record from the site. Authors
 * should not have to remember to quote every date, so the shape is normalised here instead -- one place, at the
 * boundary, keeping every downstream consumer on plain ISO strings.
 *
 * @param {*} value
 * @returns {*}
 */
function normalizeDates( value ) {
    if ( value instanceof Date ) {
        return value.toISOString();
    }
    if ( Array.isArray( value ) ) {
        return value.map( normalizeDates );
    }
    if ( value !== null && typeof value === "object" ) {
        const normalized = {};
        for ( const key of Object.keys( value ) ) {
            normalized[ key ] = normalizeDates( value[ key ] );
        }
        return normalized;
    }
    return value;
}

/**
 * Parses source text into a raw content record. Pure -- no validation happens here; the record is validated by the
 * loader when it is indexed.
 *
 * @param {string} text
 * @param {{ format: string }} options  format is "markdown" (YAML front-matter + body) or "yaml".
 * @returns {Object}
 * @throws on malformed YAML.
 */
function parseRecord( text, options ) {
    const source = ( text === null || text === undefined ) ? "" : String( text );
    if ( options && options.format === "yaml" ) {
        return normalizeDates( matter.engines.yaml.parse( source ) || {} );
    }

    const parsed = matter( source );
    const record = normalizeDates( Object.assign( {}, parsed.data ) );
    const body = String( parsed.content || "" ).trim();
    if ( body !== "" ) {
        record.body = body;
        // Markdown sources default to markdown rendering; an explicit front-matter bodyFormat (e.g. imported legacy
        // WordPress HTML) always wins.
        if ( record.bodyFormat === undefined ) {
            record.bodyFormat = "markdown";
        }
    }
    return record;
}

/**
 * Parses a taxonomy vocabulary file (taxonomies.yml).
 *
 * @param {string} text
 * @returns {Object}
 */
function parseVocabulary( text ) {
    return normalizeDates( matter.engines.yaml.parse( ( text === null || text === undefined ) ? "" : String( text ) ) || {} );
}

/**
 * Reads an explicitly registered list of content source files.
 *
 * @param {string[]} sources  Explicit file paths. A directory is an error, never expanded.
 * @returns {{ records: Object[], errors: Array<{ source: string, error: string }> }}
 */
function readSources( sources ) {
    const records = [];
    const errors = [];
    const list = Array.isArray( sources ) ? sources : [];

    for ( const source of list ) {
        try {
            const stats = fs.statSync( source );
            if ( stats.isDirectory() === true ) {
                // Deliberate: registering a directory is a configuration mistake, not a request to scan it.
                errors.push( { source: source, error: "source is a directory; content sources must be explicitly registered files" } );
                continue;
            }
            const format = formatOf( source );
            if ( format === null ) {
                errors.push( { source: source, error: "unsupported source extension; expected .md, .markdown, .yml or .yaml" } );
                continue;
            }
            const record = parseRecord( fs.readFileSync( source, "utf8" ), { format: format } );
            record.sourcePath = source;
            records.push( record );
        } catch ( error ) {
            errors.push( { source: String( source ), error: error.message } );
        }
    }

    return { records: records, errors: errors };
}

/**
 * Reads a taxonomy vocabulary file from disk.
 *
 * @param {string} filePath
 * @returns {Object}
 */
function readVocabulary( filePath ) {
    return parseVocabulary( fs.readFileSync( filePath, "utf8" ) );
}

module.exports = {
    parseRecord: parseRecord,
    parseVocabulary: parseVocabulary,
    readSources: readSources,
    readVocabulary: readVocabulary
};
