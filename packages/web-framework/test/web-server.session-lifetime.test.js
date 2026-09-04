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
 * How long a signed-in user stays signed in, and what makes the clock restart.
 *
 * Two defects met here, and both are guarded below because either alone is enough to throw somebody out mid-task.
 *
 * 1. The unit. `cookies.maxAge` feeds express-session's `cookie.maxAge`, whose setter is `set maxAge(ms)` —
 *    MILLISECONDS. The shipped value was `604800`, which is seven days expressed in SECONDS, so every session
 *    actually lasted 604.8 seconds: ten minutes. A seconds-shaped number in that field is the regression this
 *    guards, and it is invisible by inspection because the number looks entirely reasonable.
 *
 * 2. The clock. express-session re-sends the cookie only when the session is new, when `rolling` is on, or when the
 *    session data itself changed (`shouldSetCookie`). Nothing changes it after sign-in — `augmentSession` runs once
 *    inside `regenerateAndSaveSession`, and the CSRF handler writes its token only when absent — so without
 *    `rolling` the cookie was stamped at sign-in and never refreshed. That is an ABSOLUTE limit: working hard did
 *    not extend it. The store-side TTL slid correctly the whole time (`SessionStore.touch`), which hid the problem
 *    from the server's point of view while the browser quietly dropped the cookie.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const express = require( "express" );
const session = require( "express-session" );

const applyWebConfigEnvOverrides = require( "#web-config-env" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const shippedConfig = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "bin", "web-server.json" ), "utf8" ) );
const webServerSource = fs.readFileSync( path.join( PACKAGE_ROOT, "bin", "web-server.js" ), "utf8" );

const MINUTE = 60 * 1000;

/**
 * Signs in against a throwaway express-session app wired with the given options, then makes one ordinary follow-up
 * request carrying the resulting cookie. Answers the only two questions that matter: how long the browser was told
 * to keep the session, and whether an ordinary request restarts that clock.
 *
 * @param {Object} cookieOptions Passed through as express-session's `cookie`.
 * @param {boolean} rolling
 * @returns {Promise<{lifetimeMs: number, slidOnUse: boolean, stillSignedIn: boolean}>}
 */
function measureSession( cookieOptions, rolling ) {
    return new Promise( ( resolve, reject ) => {
        const app = express();
        app.use( session( {
            secret: "test-only",
            resave: false,
            saveUninitialized: false,
            rolling: rolling,
            cookie: cookieOptions,
            unset: "destroy"
        } ) );
        app.get( "/sign-in", ( request, response ) => {
            request.session.user = { employeeID: "1" };
            response.send( "ok" );
        } );
        // Deliberately does NOT touch the session — the shape of every request the app makes after sign-in.
        app.get( "/work", ( request, response ) => response.send( String( !!( request.session && request.session.user ) ) ) );

        const server = app.listen( 0, async () => {
            try {
                const signIn = await fetch( `http://127.0.0.1:${ server.address().port }/sign-in` );
                const setCookie = signIn.headers.get( "set-cookie" ) || "";
                const expires = /Expires=([^;]+)/i.exec( setCookie );
                const cookie = setCookie.split( ";" )[ 0 ];

                const work = await fetch( `http://127.0.0.1:${ server.address().port }/work`, { headers: { cookie: cookie } } );
                resolve( {
                    lifetimeMs: expires ? ( new Date( expires[ 1 ] ).getTime() - Date.now() ) : 0,
                    slidOnUse: Boolean( work.headers.get( "set-cookie" ) ),
                    stillSignedIn: ( await work.text() ) === "true"
                } );
            } catch ( error ) {
                reject( error );
            } finally {
                server.close();
            }
        } );
    } );
}

describe( "Session lifetime — the shipped configuration", () => {

    it( "expresses cookies.maxAge in milliseconds, not seconds", () => {
        // The regression itself. 604800 (seven days of SECONDS) lands here as ten minutes; so would any other
        // seconds-shaped value. Nothing sensible puts a session under half an hour, so that is the floor.
        const maxAge = shippedConfig.cookies.maxAge;
        assert.equal( typeof maxAge, "number" );
        assert.ok( maxAge >= 30 * MINUTE,
            `cookies.maxAge is ${ maxAge }ms (${ Math.round( maxAge / MINUTE ) } minutes) — a value this small is almost certainly seconds written into a milliseconds field` );
        assert.ok( maxAge <= 7 * 24 * 60 * MINUTE, `cookies.maxAge of ${ maxAge }ms is longer than a week` );
    } );

    it( "opts into rolling sessions, so the window slides with use", () => {
        assert.match( webServerSource, /rolling:\s*true/ );
    } );

} );

describe( "Session lifetime — express-session semantics we depend on", () => {

    it( "restarts the clock on an ordinary request once rolling is on", async () => {
        const result = await measureSession( { path: "/", httpOnly: true, maxAge: 30 * MINUTE }, true );
        assert.equal( result.slidOnUse, true, "a request that does not modify the session must still re-stamp the cookie" );
        assert.equal( result.stillSignedIn, true );
    } );

    it( "does NOT restart it without rolling — the defect this replaces", async () => {
        // Pins the reason `rolling` is needed rather than trusting the option name: with it off, an ordinary
        // request leaves the original expiry standing, so the limit runs from sign-in whatever the user does.
        const result = await measureSession( { path: "/", httpOnly: true, maxAge: 30 * MINUTE }, false );
        assert.equal( result.slidOnUse, false );
    } );

    it( "reads maxAge as milliseconds, which is what made 604800 a ten-minute session", async () => {
        const result = await measureSession( { path: "/", httpOnly: true, maxAge: 604800 }, true );
        assert.ok( result.lifetimeMs < 11 * MINUTE,
            `604800 in that field yielded ${ Math.round( result.lifetimeMs / 1000 ) }s — it is milliseconds, not seconds` );
    } );

    it( "gives the shipped value the lifetime the config intends", async () => {
        const result = await measureSession( { path: "/", httpOnly: true, maxAge: shippedConfig.cookies.maxAge }, true );
        // Second-granularity Expires header, so allow a couple of seconds of slack.
        assert.ok( Math.abs( result.lifetimeMs - shippedConfig.cookies.maxAge ) < 2000 );
    } );

} );

describe( "TI_WEB_SESSION_IDLE_TIMEOUT", () => {

    const config = () => ( { cookies: { path: "/", httpOnly: true, maxAge: 28800000 } } );

    it( "is read in minutes and stored as milliseconds", () => {
        const target = config();
        applyWebConfigEnvOverrides( target, { TI_WEB_SESSION_IDLE_TIMEOUT: "90" } );
        assert.equal( target.cookies.maxAge, 90 * MINUTE );
    } );

    it( "leaves the shipped value alone when unset", () => {
        const target = config();
        applyWebConfigEnvOverrides( target, {} );
        assert.equal( target.cookies.maxAge, 28800000 );
    } );

    it( "ignores a value that is not a positive whole number of minutes", () => {
        // Same posture as TI_WEB_STATIC_MAX_AGE: a bad value leaves the config value standing rather than being
        // coerced into something surprising. Zero would mean a session that expires before the response lands.
        for ( const bad of [ "0", "-5", "abc", "", "12.5" ] ) {
            const target = config();
            applyWebConfigEnvOverrides( target, { TI_WEB_SESSION_IDLE_TIMEOUT: bad } );
            assert.equal( target.cookies.maxAge, 28800000, `'${ bad }' must not take effect` );
        }
    } );

    it( "creates the cookies section when the config has none", () => {
        const target = {};
        applyWebConfigEnvOverrides( target, { TI_WEB_SESSION_IDLE_TIMEOUT: "45" } );
        assert.equal( target.cookies.maxAge, 45 * MINUTE );
    } );

} );
