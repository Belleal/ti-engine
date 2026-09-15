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
 * `AuthManager.resolveOpenIDIdentity` — which identity strings an OpenID sign-in puts on the session.
 *
 * The identity was built from the `userinfo` response alone, with the ID token read only for the `sub` that fetch is
 * verified against. That works for Google and fails for the Microsoft identity platform: its `userinfo` endpoint
 * returns `sub`, `name`, `family_name`, `given_name`, `picture` and an optional `email` from the directory's `mail`
 * attribute, and it never returns `preferred_username` — on Entra that claim is in the ID token, holding the UPN.
 *
 * The UPN is the address an operator knows, lists in `TI_WEB_AUTH_ADMINS` and writes into an application record, so
 * dropping it meant the one identifier the deployment is configured around never reached the session:
 * `authorization.isAdminIdentity` had nothing to match, the admin exception never fired, and the consumer reported
 * the refusal as a missing application record. On a fresh deployment, where that exception is the only way in,
 * that is a lock-out — which is exactly how it was found.
 *
 * The Entra cases below are therefore the point of the suite; the Google ones pin that the old behaviour is intact.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const AuthManager = require( "#auth-manager" );
const authorization = require( "#authorization" );

describe( "AuthManager.resolveOpenIDIdentity", () => {

    describe( "Microsoft Entra ID", () => {

        // What Entra's /oidc/userinfo actually returns: no `preferred_username`, and `email` only when the optional
        // claim is configured and the directory's `mail` attribute is populated.
        const ENTRA_USERINFO = Object.freeze( { sub: "a1b2c3", name: "Boris Kostadinov", family_name: "Kostadinov", given_name: "Boris" } );
        const ENTRA_CLAIMS = Object.freeze( { sub: "a1b2c3", preferred_username: "b.kostadinov@is-bg.net", name: "Boris Kostadinov" } );

        it( "takes the UPN from the ID token when userinfo does not carry one", () => {
            const identity = AuthManager.resolveOpenIDIdentity( ENTRA_USERINFO, ENTRA_CLAIMS );
            assert.equal( identity.username, "b.kostadinov@is-bg.net" );
            assert.equal( identity.userID, "oauth2:a1b2c3" );
        } );

        it( "accepts `upn` as well as `preferred_username`", () => {
            // Entra can be configured to emit the UPN under either name.
            const identity = AuthManager.resolveOpenIDIdentity( ENTRA_USERINFO, { sub: "a1b2c3", upn: "b.kostadinov@is-bg.net" } );
            assert.equal( identity.username, "b.kostadinov@is-bg.net" );
        } );

        it( "keeps the UPN as the username even when `mail` differs from it", () => {
            // The case that produced the lock-out: both are present and they are not the same address.
            const identity = AuthManager.resolveOpenIDIdentity( { ...ENTRA_USERINFO, email: "Boris.Kostadinov@is-bg.net" }, ENTRA_CLAIMS );
            assert.equal( identity.username, "b.kostadinov@is-bg.net" );
            assert.equal( identity.email, "Boris.Kostadinov@is-bg.net" );
        } );

        it( "does NOT pass the UPN off as an e-mail", () => {
            // A UPN is a sign-in name, not a mailbox, and `email` is what a consumer resolves its own directory by.
            // Widening that would change which application principal an identity maps to.
            const identity = AuthManager.resolveOpenIDIdentity( ENTRA_USERINFO, ENTRA_CLAIMS );
            assert.equal( identity.email, undefined );
        } );

        it( "takes the e-mail from the ID token when userinfo omits it", () => {
            const identity = AuthManager.resolveOpenIDIdentity( ENTRA_USERINFO, { ...ENTRA_CLAIMS, email: "b.kostadinov@is-bg.net" } );
            assert.equal( identity.email, "b.kostadinov@is-bg.net" );
        } );

        it( "lets an allowlisted administrator match on the UPN", () => {
            // The end-to-end point of the fix, asserted against the gate that was failing rather than restated:
            // `auth.admins` is matched against the session user's userID, username or e-mail.
            const identity = AuthManager.resolveOpenIDIdentity( ENTRA_USERINFO, ENTRA_CLAIMS );
            assert.equal( authorization.isAdminIdentity( identity, [ "b.kostadinov@is-bg.net" ] ), true );
            // And the same identity as it was built before the fix does not — this is the defect, pinned.
            assert.equal( authorization.isAdminIdentity( { userID: "oauth2:a1b2c3", username: "Boris Kostadinov" }, [ "b.kostadinov@is-bg.net" ] ), false );
        } );

    } );

    describe( "Google", () => {

        const GOOGLE = Object.freeze( { sub: "g-1", email: "someone@example.com", email_verified: true, name: "Some One" } );

        it( "is unchanged — userinfo carries everything and wins", () => {
            const identity = AuthManager.resolveOpenIDIdentity( GOOGLE, GOOGLE );
            assert.deepEqual( identity, {
                userID: "oauth2:g-1",
                username: "someone@example.com",
                email: "someone@example.com",
                name: "Some One",
                sources: { userID: "userinfo.sub", email: "userinfo.email", name: "userinfo.name", username: "userinfo.email" }
            } );
        } );

        it( "prefers userinfo over the ID token where both carry a value", () => {
            // userinfo is the fresher of the two — the ID token is a snapshot from authentication time — and
            // `fetchUserInfo` has already verified both describe the same subject.
            const identity = AuthManager.resolveOpenIDIdentity( GOOGLE, { sub: "g-1", email: "stale@example.com", name: "Stale Name" } );
            assert.equal( identity.email, "someone@example.com" );
            assert.equal( identity.name, "Some One" );
        } );

    } );

    describe( "values a provider should not be able to smuggle onto a session", () => {

        it( "ignores an empty or whitespace-only claim", () => {
            // Coercing one would put a matchable identity on the session that means nothing.
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s", email: "", name: "  " }, { sub: "s", preferred_username: "   " } );
            assert.equal( identity.email, undefined );
            assert.equal( identity.name, undefined );
            assert.equal( identity.username, "sub:s" );
        } );

        it( "ignores a claim that is not a string", () => {
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s", name: [ "A" ] }, { sub: "s", preferred_username: 42, email: { address: "a@b.c" } } );
            assert.equal( identity.username, "sub:s" );
            assert.equal( identity.email, undefined );
            assert.equal( identity.name, undefined );
        } );

        it( "trims a padded claim rather than carrying the padding onto the session", () => {
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s", email: " a@b.c " }, { sub: "s" } );
            assert.equal( identity.email, "a@b.c" );
        } );

    } );

    describe( "degenerate responses", () => {

        it( "falls back through username candidates in order", () => {
            assert.equal( AuthManager.resolveOpenIDIdentity( { sub: "s", email: "a@b.c", name: "A B" }, { sub: "s" } ).username, "a@b.c" );
            assert.equal( AuthManager.resolveOpenIDIdentity( { sub: "s", name: "A B" }, { sub: "s" } ).username, "A B" );
            assert.equal( AuthManager.resolveOpenIDIdentity( { sub: "s" }, { sub: "s" } ).username, "sub:s" );
        } );

        it( "tolerates a missing source on either side", () => {
            assert.equal( AuthManager.resolveOpenIDIdentity( undefined, { sub: "s", preferred_username: "u" } ).username, "u" );
            assert.equal( AuthManager.resolveOpenIDIdentity( { sub: "s", email: "a@b.c" }, undefined ).email, "a@b.c" );
            assert.deepEqual( AuthManager.resolveOpenIDIdentity( undefined, undefined ), { userID: "oauth2:", username: "sub:", email: undefined, name: undefined, sources: {} } );
        } );

    } );

    describe( "the two precedence rules", () => {

        it( "prefers `preferred_username` over `upn` even when `upn` is the one in userinfo", () => {
            // The claim rule outranks the source rule, and only for `username`, which is the one field choosing
            // between two DIFFERENT claims. `preferred_username` is the standard OIDC claim for a human-readable
            // identifier; `upn` is a Microsoft extension. "Fresher" earns `userinfo` its precedence for mutable
            // profile data, and earns nothing between two stable identifiers — so it does not get to promote a
            // vendor extension over the standard claim on the strength of which response carried it.
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s", upn: "from-userinfo@example.com" }, { sub: "s", preferred_username: "from-token@example.com" } );
            assert.equal( identity.username, "from-token@example.com" );
            assert.equal( identity.sources.username, "claims.preferred_username" );
        } );

        it( "still prefers userinfo WITHIN a claim", () => {
            // The source rule is intact where it applies: same claim, two responses, userinfo wins.
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s", preferred_username: "from-userinfo@example.com" }, { sub: "s", preferred_username: "from-token@example.com" } );
            assert.equal( identity.username, "from-userinfo@example.com" );
            assert.equal( identity.sources.username, "userinfo.preferred_username" );
        } );

        it( "prefers userinfo's `upn` when neither response carries `preferred_username`", () => {
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s", upn: "from-userinfo@example.com" }, { sub: "s", upn: "from-token@example.com" } );
            assert.equal( identity.username, "from-userinfo@example.com" );
            assert.equal( identity.sources.username, "userinfo.upn" );
        } );

    } );

    describe( "provenance, so a deployment need not log identifiers to report how it read its provider", () => {

        it( "names the claim and the response each value came from", () => {
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "a1b2c3", name: "Boris Kostadinov" }, { sub: "a1b2c3", preferred_username: "b.kostadinov@is-bg.net", email: "b.kostadinov@is-bg.net" } );
            assert.deepEqual( identity.sources, {
                userID: "userinfo.sub",
                username: "claims.preferred_username",
                email: "claims.email",
                name: "userinfo.name"
            } );
        } );

        it( "carries no identity of its own — every value is a claim name", () => {
            // The point of the field: `auditing.logMinLevel` ships at 0 with console logging on, so a DEBUG line
            // carrying the values would write every signed-in person's identifiers to a default deployment's
            // console. These strings are safe to log because none of them is anybody's.
            const secrets = [ "a1b2c3", "b.kostadinov@is-bg.net", "Boris Kostadinov" ];
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "a1b2c3", name: "Boris Kostadinov" }, { sub: "a1b2c3", preferred_username: "b.kostadinov@is-bg.net" } );
            for ( const origin of Object.values( identity.sources ) ) {
                assert.equal( secrets.some( ( secret ) => origin.includes( secret ) ), false, `source '${ origin }' leaks an identifier` );
            }
        } );

        it( "omits a field the provider never supplied", () => {
            const identity = AuthManager.resolveOpenIDIdentity( { sub: "s" }, { sub: "s" } );
            assert.equal( identity.sources.email, undefined );
            assert.equal( identity.sources.username, undefined );
        } );

    } );

} );
