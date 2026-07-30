/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Content schema — ajv validators for the common envelope and each content type, plus the capture record.
 *
 * Deny-by-default visibility is anchored here: `visibility` is a required, pattern-constrained envelope field, so a
 * record can never be *silently* accepted without an explicit, recognised value. The cross-surface guarantee (such a
 * record appears in no listing/feed/sitemap) is the repository's job — this layer makes the omission a loud, hard
 * validation failure at load time. See design/author-site-engine.md §10 and Site/docs/content-schemas.md §1.
 */

const Ajv = require( "ajv" );

const ajv = new Ajv( { allErrors: true, allowUnionTypes: true } );

/**
 * The recognised content record types.
 *
 * @type {string[]}
 */
const CONTENT_TYPES = [ "post", "page", "book", "release" ];

/**
 * Pattern for a recognised `visibility` value: `public`, `authenticated`, or `role:<name>` (lower-case name of
 * letters, digits, `_` or `-`). Anchored end-to-end so trailing whitespace or an empty role name is rejected.
 *
 * @type {string}
 */
const VISIBILITY_PATTERN = "^(public|authenticated|role:[a-z0-9_-]+)$";

/**
 * Section types a `page` may compose (Site/docs/content-schemas.md §3).
 *
 * @type {string[]}
 */
const SECTION_TYPES = [ "hero", "prose", "verse", "characterCards", "audio", "languageExample", "agePanels", "timeStrip", "timeline", "gallery", "capture", "featured", "postList", "closing" ];

const RELEASE_STATES = [ "announced", "prerelease", "released" ];

// Common envelope properties shared by every content record.
const envelopeProperties = {
    id: { type: "string", minLength: 1 },
    type: { enum: CONTENT_TYPES },
    path: { type: "string", pattern: "^/" },
    aliases: { type: "array", items: { type: "string" } },
    lang: { enum: [ "en", "bg" ] },
    translationOf: { type: [ "string", "null" ] },
    title: { type: "string", minLength: 1 },
    subtitle: { type: [ "string", "null" ] },
    visibility: { type: "string", pattern: VISIBILITY_PATTERN },
    status: { enum: [ "draft", "published" ] },
    publishedAt: { type: [ "string", "null" ] },
    updatedAt: { type: [ "string", "null" ] },
    seo: {
        type: "object",
        properties: {
            description: { type: "string" },
            ogImage: { type: [ "string", "null" ] },
            noindex: { type: "boolean" }
        },
        required: [ "description" ]
    }
};

// Envelope fields that must be present on every record. `visibility` is deliberately here — its absence is a hard
// failure, never a silent default.
const ENVELOPE_REQUIRED = [ "id", "type", "path", "lang", "title", "visibility", "status" ];

// Per-type property + required-field extensions to the envelope.
const typeExtensions = {
    post: {
        properties: {
            world: { type: "string", minLength: 1 },
            form: { type: "string", minLength: 1 },
            body: { type: "string" },
            bodyFormat: { enum: [ "markdown", "html" ] },
            summary: { type: [ "string", "null" ] },
            teaser: { type: [ "string", "null" ] },
            sections: { type: "array" }
        },
        required: [ "world", "form" ]
    },
    page: {
        properties: {
            sections: {
                type: "array",
                items: {
                    type: "object",
                    properties: { type: { enum: SECTION_TYPES } },
                    required: [ "type" ]
                }
            }
        },
        required: [ "sections" ]
    },
    book: {
        properties: {
            seriesPosition: { type: "integer" },
            originalTitle: { type: [ "string", "null" ] },
            cover: { type: "string", minLength: 1 },
            blurb: { type: "string" },
            excerpt: { type: [ "string", "null" ] },
            editions: { type: "array" },
            awards: { type: "array" },
            releaseState: { enum: RELEASE_STATES },
            relatedRelease: { type: [ "string", "null" ] }
        },
        required: [ "cover", "blurb" ]
    },
    release: {
        properties: {
            releaseState: { enum: RELEASE_STATES },
            releaseDate: { type: [ "string", "null" ] },
            format: { enum: [ "ep", "single", "album", "soundtrack" ] },
            cover: { type: "string", minLength: 1 },
            tracks: { type: "array" },
            links: { type: "object" },
            relatedBook: { type: [ "string", "null" ] }
        },
        required: [ "releaseState", "format", "cover" ]
    }
};

// Compile one validator per content type: envelope + type extension, with `type` pinned to the exact value so a
// record cannot claim a type it is not shaped for.
const recordValidators = {};
for ( const contentType of CONTENT_TYPES ) {
    const extension = typeExtensions[ contentType ];
    recordValidators[ contentType ] = ajv.compile( {
        type: "object",
        properties: Object.assign( {}, envelopeProperties, extension.properties, { type: { const: contentType } } ),
        required: ENVELOPE_REQUIRED.concat( extension.required )
    } );
}

// Capture is data, not content — it carries no envelope (Site/docs/content-schemas.md §6).
const captureValidator = ajv.compile( {
    type: "object",
    properties: {
        email: { type: "string", minLength: 3 },
        purpose: { type: "string", minLength: 1 },
        edition: { type: [ "string", "null" ] },
        source: { type: [ "string", "null" ] },
        locale: { enum: [ "en", "bg" ] },
        consentAt: { type: "string", minLength: 1 },
        createdAt: { type: "string" }
    },
    required: [ "email", "purpose", "consentAt" ]
} );

/**
 * Turns ajv errors into readable `<path> <message>` strings.
 *
 * @param {Array<Object>} errors
 * @returns {string[]}
 */
function formatErrors( errors ) {
    return ( errors || [] ).map( ( error ) => `${ error.instancePath || "(root)" } ${ error.message }`.trim() );
}

/**
 * True for a non-array plain object.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject( value ) {
    return typeof value === "object" && value !== null && Array.isArray( value ) === false;
}

/**
 * Validates a content record against its type schema (envelope + type-specific).
 *
 * @param {Object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRecord( record ) {
    if ( isPlainObject( record ) === false ) {
        return { valid: false, errors: [ "record must be an object" ] };
    }
    const validate = recordValidators[ record.type ];
    if ( !validate ) {
        return { valid: false, errors: [ `unknown or missing content type: ${ JSON.stringify( record.type ) }` ] };
    }
    const valid = validate( record );
    return { valid: valid, errors: valid ? [] : formatErrors( validate.errors ) };
}

/**
 * Validates an email-capture record (preorder / newsletter / beta signup).
 *
 * @param {Object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCapture( record ) {
    if ( isPlainObject( record ) === false ) {
        return { valid: false, errors: [ "capture record must be an object" ] };
    }
    const valid = captureValidator( record );
    return { valid: valid, errors: valid ? [] : formatErrors( captureValidator.errors ) };
}

module.exports = {
    CONTENT_TYPES: CONTENT_TYPES,
    SECTION_TYPES: SECTION_TYPES,
    VISIBILITY_PATTERN: VISIBILITY_PATTERN,
    validateRecord: validateRecord,
    validateCapture: validateCapture
};
