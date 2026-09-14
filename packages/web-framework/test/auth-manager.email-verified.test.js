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
 * `AuthManager.isEmailReportedUnverified` — the OpenID `email_verified` gate.
 *
 * A consumer maps the authenticated identity to an application principal by e-mail (competence resolves it against
 * the employee directory), so an address the provider reports as unverified is an unauthenticated claim to be
 * someone. Nothing checked it.
 *
 * The asymmetry is the point, and is why these cases are pinned rather than a single truthiness check: Google emits
 * `email_verified`, the Microsoft identity platform does not emit it at all, and the published container image
 * defaults to Azure. Treating an ABSENT claim as unverified would refuse every sign-in on the default deployment.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const AuthManager = require( "#auth-manager" );

describe( "AuthManager.isEmailReportedUnverified", () => {

    it( "rejects only an explicit false", () => {
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email: "a@b.c", email_verified: false } ), true );
    } );

    it( "accepts an explicit true", () => {
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email: "a@b.c", email_verified: true } ), false );
    } );

    it( "accepts a provider that does not emit the claim at all", () => {
        // Azure AD v2.0 — refusing here would take down the container image's default sign-in method.
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email: "a@b.c" } ), false );
    } );

    it( "does not treat a falsy-but-not-false claim as a rejection", () => {
        // Only the provider SAYING "unverified" is a rejection; an empty or null claim says nothing.
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email_verified: undefined } ), false );
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email_verified: null } ), false );
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email_verified: "" } ), false );
    } );

    it( "does not treat the string \"false\" as a rejection", () => {
        // A string is not the claim's specified type; silently coercing one would be guessing at a provider's intent.
        assert.equal( AuthManager.isEmailReportedUnverified( { sub: "s", email_verified: "false" } ), false );
    } );

    it( "tolerates a missing or empty userinfo response", () => {
        assert.equal( AuthManager.isEmailReportedUnverified( undefined ), false );
        assert.equal( AuthManager.isEmailReportedUnverified( null ), false );
        assert.equal( AuthManager.isEmailReportedUnverified( {} ), false );
    } );

} );
