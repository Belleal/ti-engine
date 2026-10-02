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
 * The probe filter in front of a ti-engine application on Cloudflare (CA-359).
 *
 * Neither of its two failures shows on its own:
 * - a probe let through wakes a sleeping container to say "not found", which is the cost the filter exists to save;
 * - an application's own URL taken for a probe answers 404 at the edge, with nothing in any log to say why.
 *
 * The probes are ones scanners sent to applications on this stack in their first days live (CA-351, CA-358).
 * The other half of the second failure lives in each application, which holds every URL it serves clear of the filter
 * it configures.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { createProbeFilter, probeResponse, PROBE_RULES } = require( "#probes" );

/**
 * Asks a filter about a URL the way a Worker does: with the path still percent-encoded, and the query with its `?`.
 *
 * @param {function(string, string): boolean} isProbe
 * @param {string} target
 * @returns {boolean}
 */
function ask( isProbe, target ) {
    const url = new URL( target, "https://app.example" );
    return isProbe( url.pathname, url.search );
}

// Everything here is a probe under the defaults. Gathered from both applications' logs, plus the usual neighbours.
const PROBES = [
    // WordPress, and the backdoors planted on hacked installs.
    "/wp-login.php", "/WP-LOGIN.PHP", "/xmlrpc.php", "/wp-cron.php", "/wp-editor.php", "/wp-admin", "/wp-admin/",
    "/wp-admin/txets.php", "/wp-includes/txets.php", "/wp-includes/js/jquery/jquery.js", "/wp-content",
    "/wp-content/style.php", "/wp-content/themes/txets.php", "/wp-content/plugins/akismet/readme.txt",
    "/wp-content/uploads/2024/01/cover.webp", "/goods.php", "/lufix.php", "/index.php/2024/01/01/a-post/",
    // Leaked secrets, logs and dumps.
    "/.env", "/api/.env", "/.git/config", "/docker-secrets.env", "/debug.log", "/elmah.axd", "/dnscfg.cgi",
    "/backup.sql", "/web.config.bak", "/docker-compose.yml", "/default.aspx",
    // The same targets with each slash encoded twice, to slip past a filter that decodes once.
    "/%252fdev%252f.env", "/%252fdocker-secrets.env", "/%252felmah%252eaxd", "/%252fcredentials%252ejson",
    "/%252fetc%252fshadow", "/%252fde%252f_next%252fdata%252fbuild_id%252findex.json", "/%252fcraco%252econfig%252ejs",
    // Only the dot encoded, or a backslash.
    "/foo%2ephp", "/%2eenv", "/static/..%5c..%5capp", "/wp-content/uploads/..%5c..%5cx",
    // Not decodable at all, so no URL any application published.
    "/%E0%A4%A",
    // A sweep for WordPress usernames, from a dozen networks, one request every eight seconds (CA-358).
    "/wp-json/", "/wp-json/wp/v2/users", "/wp-json/wp/v2/posts?per_page=20&_embed=author&_fields=_embedded",
    "/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fexample.com&format=json", "/graphql", "/graphql/",
    "/author-sitemap.xml", "/post-sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/wp-sitemap-users-1.xml",
    "/?rest_route=%2Fwp%2Fv2%2Fusers&_jsonp=callback&per_page=100&_fields=id%2Cslug", "/app?rest_route=/wp/v2/users",
    "/?author=1"
];

// What the two applications serve, which no rule may take: pages in two scripts, feeds, the framework's own paths,
// static files, and the query parameters their front ends send.
const SERVED = [
    "/", "/bg/", "/bg/%D0%BD%D0%B0%D1%87%D0%B0%D0%BB%D0%BE/", "/2026/03/20/a-post/", "/posts/page/2/",
    "/posts/?page=2", "/newsletter/?signup=success", "/feed/", "/sitemap.xml", "/robots.txt", "/rss.xml",
    "/static/web-content.js", "/static/fonts/serif-500.woff2", "/images/cover.webp",
    "/audio/preview.mp3", "/.well-known/security.txt", "/.well-known/", "/health", "/csrf-token",
    "/logout", "/login/openid-azure", "/login/azure-callback?code=abc&state=def", "/app", "/app/", "/app/dashboard",
    "/app/labels/0f3a9c", "/app?reportID=4&personID=12&groupBy=team", "/admin/", "/graphqlish", "/wp",
    // A parameter's value is never read, and its name is matched as PHP reads it, case and all.
    "/search?q=author", "/search?q=rest_route", "/?Author=1"
];

describe( "probes — what the defaults answer at the edge", () => {

    const isProbe = createProbeFilter();

    it( "takes every probe scanners sent, however its path is encoded, and by its query's parameter names", () => {
        assert.deepEqual( PROBES.filter( ( target ) => ask( isProbe, target ) !== true ), [] );
    } );

    it( "lets through everything the applications serve", () => {
        assert.deepEqual( SERVED.filter( ( target ) => ask( isProbe, target ) === true ), [] );
    } );

    it( "takes a dot-path other than /.well-known/, and only that one", () => {
        assert.equal( ask( isProbe, "/.well-known/acme-challenge/token" ), false );
        assert.equal( ask( isProbe, "/.well-knownx" ), true );
        assert.equal( ask( isProbe, "/.well-known/.env" ), true );
    } );

    it( "answers a missing path or query as no probe", () => {
        assert.equal( isProbe( "/" ), false );
        assert.equal( isProbe( "/", "" ), false );
        assert.equal( isProbe( "/", "?" ), false );
        assert.equal( isProbe( "" ), false );
        assert.equal( isProbe( undefined ), false );
    } );

} );

describe( "probes — an application exempts the paths it serves", () => {

    // An application that kept its migrated media library at WordPress's URLs, so no inbound link broke.
    const isProbe = createProbeFilter( { except: { wordpress: [ "/wp-content/uploads/" ] } } );

    it( "serves the exempt paths, in any case and however they are encoded", () => {
        for ( const target of [
            "/wp-content/uploads/2023/10/Library.webp", "/WP-CONTENT/UPLOADS/2023/10/Library.webp",
            "/wp-content/uploads/2023/10/%D0%9A%D0%BD%D0%B8%D0%B3%D0%B0.webp", "/wp-content/upload%73/2023/10/Library.webp"
        ] ) {
            assert.equal( ask( isProbe, target ), false, target );
        }
        const capitalised = createProbeFilter( { except: { wordpress: [ "/WP-Content/Uploads/" ] } } );
        assert.equal( ask( capitalised, "/wp-content/uploads/2023/10/Library.webp" ), false, "an exception in capitals" );
    } );

    it( "exempts them from that rule alone: a script, a dotfile or an encoded separator under them is still a probe", () => {
        for ( const target of [
            "/wp-content/uploads/shell.php", "/wp-content/uploads/.htaccess", "/wp-content/uploads/..%5c..%5cx",
            "/wp-content/uploads/%252e%252e/x"
        ] ) {
            assert.equal( ask( isProbe, target ), true, target );
        }
    } );

    it( "exempts nothing outside the prefix, the directory itself included", () => {
        for ( const target of [ "/wp-content/uploads", "/wp-content/uploadsx/a.webp", "/wp-content/plugins/x/readme.txt", "/wp-admin/" ] ) {
            assert.equal( ask( isProbe, target ), true, target );
        }
        const elsewhere = PROBES.filter( ( target ) => target !== "/wp-content/uploads/2024/01/cover.webp" );
        assert.deepEqual( elsewhere.filter( ( target ) => ask( isProbe, target ) !== true ), [] );
    } );

    it( "cannot be climbed out of: the path is resolved before the Worker sees it", () => {
        // `URL` folds dot segments, encoded ones included, so a prefix never vouches for a path outside it.
        assert.equal( ask( isProbe, "/wp-content/uploads/../../wp-login.php" ), true );
        assert.equal( ask( isProbe, "/wp-content/uploads/%2e%2e/%2E%2e/wp-admin/" ), true );
    } );

    it( "exempts a path from a query rule the same way", () => {
        const filter = createProbeFilter( { except: { "user-enumeration": [ "/posts/" ] } } );
        assert.equal( ask( filter, "/posts/?author=2" ), false );
        assert.equal( ask( filter, "/POSTS/?author=2" ), false );
        assert.equal( ask( filter, "/?author=1" ), true );
    } );

    it( "exempts a path from the encoded-separator rule, and from nothing else", () => {
        const filter = createProbeFilter( { except: { "encoded-separators": [ "/files/" ] } } );
        assert.equal( ask( filter, "/files/a%2Fb" ), false );
        assert.equal( ask( filter, "/files/a%2Fb.php" ), true );
        assert.equal( ask( filter, "/other/a%2Fb" ), true );
    } );

    it( "reads its options once: changing them afterwards changes nothing", () => {
        const options = { except: { wordpress: [ "/wp-content/uploads/" ] }, disable: [] };
        const filter = createProbeFilter( options );
        options.except.wordpress.push( "/wp-admin/" );
        options.except.graphql = [ "/graphql" ];
        options.disable.push( "dot-paths" );
        assert.equal( ask( filter, "/wp-admin/" ), true );
        assert.equal( ask( filter, "/graphql" ), true );
        // Only the dot-path rule takes this one: `.env` would be taken by its extension as well.
        assert.equal( ask( filter, "/.git/config" ), true );
    } );

} );

describe( "probes — an application turns a rule off", () => {

    it( "applies every other rule as before", () => {
        const isProbe = createProbeFilter( { disable: [ "graphql", "user-enumeration" ] } );
        assert.equal( ask( isProbe, "/graphql" ), false );
        assert.equal( ask( isProbe, "/?author=1" ), false );
        assert.equal( ask( isProbe, "/wp-json/wp/v2/users" ), true );
        assert.equal( ask( isProbe, "/wp-login.php" ), true );
    } );

    it( "still takes a path that does not decode, with every rule off", () => {
        // Nothing behind the Worker can serve one: Express 5 answers it 400, failing to decode it.
        const isProbe = createProbeFilter( { disable: [ ...PROBE_RULES ] } );
        assert.equal( ask( isProbe, "/%E0%A4%A" ), true );
        assert.equal( ask( isProbe, "/wp-login.php" ), false );
        assert.equal( ask( isProbe, "/?author=1" ), false );
    } );

} );

describe( "probes — a configuration that cannot mean what it says is refused", () => {

    // The filter is built when the Worker's module loads, so a refusal fails the deploy instead of a request. Accepting
    // one would be invisible: a misspelt rule or option does nothing, and the application's own URLs 404 at the edge.
    const refusals = [
        [ "options that are not an object", "wordpress" ],
        [ "options that are an array", [ "wordpress" ] ],
        [ "an unknown option", { exempt: { wordpress: [ "/wp-content/uploads/" ] } } ],
        [ "exceptions that are not an object", { except: [ "/wp-content/uploads/" ] } ],
        [ "an exception for an unknown rule", { except: { wordpres: [ "/wp-content/uploads/" ] } } ],
        [ "exceptions that are not an array", { except: { wordpress: "/wp-content/uploads/" } } ],
        [ "an exception that is not a string", { except: { wordpress: [ 42 ] } } ],
        [ "an empty exception", { except: { wordpress: [ "" ] } } ],
        [ "an exception that is not rooted", { except: { wordpress: [ "wp-content/uploads/" ] } } ],
        [ "an exception written percent-encoded", { except: { wordpress: [ "/wp-content/uploads/%D0%9A/" ] } } ],
        [ "an exception carrying a query", { except: { "user-enumeration": [ "/posts/?author=" ] } } ],
        [ "a rule to disable that is not in an array", { disable: "graphql" } ],
        [ "an unknown rule to disable", { disable: [ "graph-ql" ] } ]
    ];

    for ( const [ name, options ] of refusals ) {
        it( `refuses ${ name }`, () => {
            assert.throws( () => createProbeFilter( options ), TypeError );
        } );
    }

    it( "names the rules there are, when a rule is not one of them", () => {
        assert.throws( () => createProbeFilter( { disable: [ "graph-ql" ] } ), ( error ) => {
            assert.match( error.message, /"graph-ql"/ );
            for ( const rule of PROBE_RULES ) {
                assert.ok( error.message.includes( rule ), `${ rule } is not named` );
            }
            return true;
        } );
    } );

    it( "accepts no options, and empty ones", () => {
        for ( const options of [ undefined, null, {}, { except: {} }, { disable: [] } ] ) {
            assert.equal( ask( createProbeFilter( options ), "/wp-login.php" ), true );
        }
    } );

} );

describe( "probes — the rules and the answer", () => {

    it( "names every rule an application can exempt or turn off", () => {
        // A new rule applies to every application the moment it takes the release, and may take one of its URLs. This
        // list changes only on purpose.
        assert.deepEqual( PROBE_RULES, [
            "encoded-separators", "server-files", "wordpress", "graphql", "seo-sitemaps", "dot-paths", "user-enumeration"
        ] );
        assert.ok( Object.isFrozen( PROBE_RULES ) );
    } );

    it( "answers with a plain 404 that names nothing, new for every probe", async () => {
        const first = probeResponse();
        const second = probeResponse();
        assert.notEqual( first, second, "a body can be read once" );
        assert.equal( first.status, 404 );
        assert.equal( first.headers.get( "content-type" ), "text/plain; charset=utf-8" );
        assert.equal( await first.text(), "Not Found" );
        assert.equal( await second.text(), "Not Found" );
    } );

} );
