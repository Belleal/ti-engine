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

/**
 * Requests no ti-engine application serves, which scanners send to every domain they find, answered by the Worker so
 * they never reach the container (CA-359; first written for the Boris Khan site and competence, CA-351 and CA-358).
 * <br/>
 * A container on Cloudflare sleeps when nobody asks it anything, and every request renews its timer. A scanner asks
 * hundreds of questions, each answered "not found": passed on, a two-minute scan keeps the container awake, billed, for
 * those two minutes and its whole sleep timer after them, twelve minutes for competence's production container (CA-316).
 * <br/>
 * The filter is a set of named rules ({@link PROBE_RULES}), and every application gets all of them. One whose own URLs
 * fall under a rule exempts the paths it serves from that rule alone (`except`), or turns the rule off (`disable`), and
 * holds every URL it serves clear of the result in its own tests. The Boris Khan site keeps its migrated media library
 * at WordPress's addresses, so it exempts `/wp-content/uploads/` from the `wordpress` rule, and from nothing else: a
 * script under it is still a probe.
 * <br/>
 * NOTE: Runs in the Workers runtime, so it requires nothing, not even another module of this package, and uses only the
 * `URLSearchParams`, `Response` and `decodeURIComponent` globals both Workers and Node provide.
 *
 * @module probes
 */

/**
 * The rules, in the order they are applied, each matched against one part of the request:
 * - `encoded-separators`, the path as sent: an encoded slash, backslash or percent sign. No application publishes one,
 *   since a non-Latin path encodes letters, never separators. Scanners send them to slip past a filter that decodes
 *   once, aimed at a server that decodes twice (`/%252fdev%252f.env`).
 * - `server-files`, the decoded path: server-side scripts, secrets, logs and dumps by their extension (`.php`, `.env`,
 *   `.sql`, `.yml` and the rest), at the end of the path or before a slash (`/index.php/2024/…`).
 * - `wordpress`, the decoded path: everything under `/wp-`, its admin, its REST API (`/wp-json/`) and its sitemaps.
 * - `graphql`, the decoded path: `/graphql`, which a sweep for WordPress usernames asks too.
 * - `seo-sitemaps`, the decoded path: the sitemaps an SEO plugin writes (`/author-sitemap.xml`, `/sitemap_index.xml`),
 *   which list the authors. An application's own `/sitemap.xml` matches neither form.
 * - `dot-paths`, the decoded path: any segment starting with a dot but `/.well-known/`, the one a standard can give a
 *   meaning to. The others are `.env`, `.git` and the like.
 * - `user-enumeration`, the query's parameter names: `rest_route` (WordPress's REST API without pretty URLs) and
 *   `author` (which redirects to an archive naming the user), on any path. Matched as PHP reads them, case and all, and
 *   never by their values.
 *
 * @type {Object<string, {on: string, pattern: (RegExp|undefined), names: (string[]|undefined)}>}
 * @private
 */
const RULES = Object.freeze( {
    "encoded-separators": Object.freeze( { on: "sent", pattern: /%(2f|5c|25)/i } ),
    "server-files": Object.freeze( { on: "path", pattern: /\.(php|env|log|ini|sql|bak|cgi|axd|aspx?|jsp|ya?ml)(\/|$)/i } ),
    "wordpress": Object.freeze( { on: "path", pattern: /^\/wp-/i } ),
    "graphql": Object.freeze( { on: "path", pattern: /^\/graphql(\/|$)/i } ),
    "seo-sitemaps": Object.freeze( { on: "path", pattern: /^\/(sitemap_index|[a-z0-9_]+-sitemap[0-9]*)\.xml$/i } ),
    "dot-paths": Object.freeze( { on: "path", pattern: /\/\.(?!well-known(\/|$))/i } ),
    "user-enumeration": Object.freeze( { on: "query", names: Object.freeze( [ "rest_route", "author" ] ) } )
} );

/**
 * The name of every rule, which is what `except` and `disable` take.
 *
 * @type {string[]}
 * @public
 */
const PROBE_RULES = Object.freeze( Object.keys( RULES ) );

/**
 * The options {@link createProbeFilter} takes.
 *
 * @type {string[]}
 * @private
 */
const OPTIONS = Object.freeze( [ "except", "disable" ] );

/**
 * @param {*} value
 * @returns {boolean} True for a non-null, non-array object.
 * @private
 */
function isPlainObject( value ) {
    return value !== null && typeof value === "object" && Array.isArray( value ) === false;
}

/**
 * Refuses a name that is not a rule's, naming the ones that are.
 *
 * @param {*} name
 * @param {string} where Which option the name was found in.
 * @throws {TypeError} If it is not a rule's name.
 * @private
 */
function checkRuleName( name, where ) {
    if ( PROBE_RULES.includes( name ) === false ) {
        throw new TypeError( `createProbeFilter: ${ JSON.stringify( name ) } in '${ where }' is not a rule. The rules are ${ PROBE_RULES.join( ", " ) }.` );
    }
}

/**
 * Validates one rule's exceptions and returns them folded to lower case, as they are compared.
 * <br/>
 * An exception is compared with the decoded path, so it is written as the path reads: rooted, and neither
 * percent-encoded nor carrying a query, either of which would never match anything.
 *
 * @param {string} rule
 * @param {*} prefixes
 * @returns {string[]}
 * @throws {TypeError} If an exception is malformed.
 * @private
 */
function readExceptions( rule, prefixes ) {
    if ( Array.isArray( prefixes ) === false ) {
        throw new TypeError( `createProbeFilter: the exceptions to '${ rule }' must be an array of path prefixes.` );
    }
    return prefixes.map( ( prefix ) => {
        if ( typeof prefix !== "string" || prefix.startsWith( "/" ) === false || /[%?#]/.test( prefix ) === true ) {
            throw new TypeError( `createProbeFilter: an exception to '${ rule }' must be a path prefix starting with "/", written decoded and without a query: ${ JSON.stringify( prefix ) }` );
        }
        return prefix.toLowerCase();
    } );
}

/**
 * Builds the rules a filter applies from its options: every rule not disabled, with its exceptions.
 *
 * @param {Object} [options]
 * @returns {Array<{on: string, pattern: (RegExp|undefined), names: (string[]|undefined), exempt: string[]}>}
 * @throws {TypeError} If the options are malformed.
 * @private
 */
function readOptions( options ) {
    if ( options === undefined || options === null ) {
        return PROBE_RULES.map( ( name ) => Object.assign( { exempt: [] }, RULES[ name ] ) );
    }
    if ( isPlainObject( options ) === false ) {
        throw new TypeError( "createProbeFilter: the options must be an object." );
    }
    for ( const key of Object.keys( options ) ) {
        if ( OPTIONS.includes( key ) === false ) {
            throw new TypeError( `createProbeFilter: '${ key }' is not an option. The options are ${ OPTIONS.join( " and " ) }.` );
        }
    }

    const except = ( options.except === undefined ) ? {} : options.except;
    if ( isPlainObject( except ) === false ) {
        throw new TypeError( "createProbeFilter: 'except' must be an object mapping a rule's name to the path prefixes it is not applied under." );
    }
    const exempt = new Map();
    for ( const [ rule, prefixes ] of Object.entries( except ) ) {
        checkRuleName( rule, "except" );
        exempt.set( rule, readExceptions( rule, prefixes ) );
    }

    const disable = ( options.disable === undefined ) ? [] : options.disable;
    if ( Array.isArray( disable ) === false ) {
        throw new TypeError( "createProbeFilter: 'disable' must be an array of rule names." );
    }
    disable.forEach( ( rule ) => checkRuleName( rule, "disable" ) );

    return PROBE_RULES
        .filter( ( name ) => disable.includes( name ) === false )
        .map( ( name ) => Object.assign( { exempt: exempt.get( name ) || [] }, RULES[ name ] ) );
}

/**
 * Builds the filter a Worker asks about every request, before anything else, so a probe is answered without waking
 * the container.
 * <br/>
 * The options are read once, here. An option or a rule that does not exist is refused rather than ignored: the filter
 * is built when the Worker's module loads, so the refusal fails the deploy, where ignoring it would leave the
 * application's own URLs answering 404 at the edge with nothing in any log to say why.
 *
 * @method
 * @param {Object} [options]
 * @param {Object<string, string[]>} [options.except] Rule name → the path prefixes it is not applied under, compared
 * with the decoded path, ignoring case: `{ wordpress: [ "/wp-content/uploads/" ] }`. Every other rule still applies
 * under them.
 * @param {string[]} [options.disable] The names of rules not applied at all.
 * @returns {(pathname: string, search?: string) => boolean} `isProbe`: the path as `URL` gives it,
 * percent-encoded, and its query with the `?`. A path that does not decode is always a probe: no application
 * published it, and no server behind the Worker could route it.
 * @throws {TypeError} If an option, a rule's name or an exception is malformed.
 * @public
 */
function createProbeFilter( options ) {
    const rules = readOptions( options );

    return function isProbe( pathname, search ) {
        const sent = String( pathname || "" );
        let path;
        try {
            path = decodeURIComponent( sent );
        } catch {
            return true;
        }
        const folded = path.toLowerCase();
        const parameters = ( typeof search === "string" && search.length > 1 ) ? new URLSearchParams( search ) : null;

        return rules.some( ( rule ) => {
            if ( rule.exempt.some( ( prefix ) => folded.startsWith( prefix ) ) === true ) {
                return false;
            }
            if ( rule.on === "query" ) {
                return parameters !== null && rule.names.some( ( name ) => parameters.has( name ) );
            }
            return rule.pattern.test( rule.on === "sent" ? sent : path );
        } );
    };
}

/**
 * The answer to a probe: a plain 404, which says nothing about what does exist. A new one each time, since a body can
 * be read once.
 *
 * @method
 * @returns {Response}
 * @public
 */
function probeResponse() {
    return new Response( "Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } } );
}

module.exports = {
    createProbeFilter: createProbeFilter,
    probeResponse: probeResponse,
    PROBE_RULES: PROBE_RULES
};
