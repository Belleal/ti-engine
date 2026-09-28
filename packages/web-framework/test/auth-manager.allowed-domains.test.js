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
 * `auth.oauth2.<provider>.allowedDomains` — which e-mail domains may sign in through each OpenID provider.
 *
 * A consumer maps the signed-in identity to an application principal by e-mail, and the admin allowlist matches the
 * user ID, the username or the e-mail. With two providers enabled, that made the weaker provider a way to claim an
 * identity the stronger one owns: an organization's Entra tenant vouches for `someone@is-bg.net`, but anybody can
 * register a consumer Google account under that same address, and Google reports it as verified once the mailbox
 * has confirmed a code — so a Google sign-in arrived carrying the organization's address, and the application
 * resolved it to the organization's employee. The provider list could not be narrowed without dropping Google, and
 * competence needs Google as its fallback administrator sign-in.
 *
 * The reproduction that opened this suite: with Google configured for `gmail.com` alone, a verified
 * `someone@is-bg.net` Google identity was admitted, because nothing read the setting — driven through the real
 * `openid-client` against the in-process provider in `helpers/fake-openid-provider.js`.
 */

const { describe, it, beforeEach, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const AuthManager = require( "#auth-manager" );
const { installFakeOpenIDProvider } = require( "./helpers/fake-openid-provider" );

// Every provider variable the constructor reads, so a developer's shell cannot leak into a case.
const OAUTH_ENV_KEYS = [
    "TI_GCLOUD_AUTH_CLIENT_ID", "TI_GCLOUD_AUTH_CLIENT_SECRET", "TI_GCLOUD_AUTH_CALLBACK_URL", "TI_GCLOUD_AUTH_DISCOVERY_URL", "TI_GCLOUD_AUTH_ALLOWED_DOMAINS",
    "TI_AZURE_AUTH_CLIENT_ID", "TI_AZURE_AUTH_CLIENT_SECRET", "TI_AZURE_AUTH_CALLBACK_URL", "TI_AZURE_AUTH_DISCOVERY_URL", "TI_AZURE_AUTH_ALLOWED_DOMAINS"
];

describe( "AuthManager.toDomainList", () => {

    it( "reads nothing as no restriction", () => {
        assert.deepEqual( AuthManager.toDomainList( undefined ), [] );
        assert.deepEqual( AuthManager.toDomainList( null ), [] );
        assert.deepEqual( AuthManager.toDomainList( "" ), [] );
        assert.deepEqual( AuthManager.toDomainList( [] ), [] );
    } );

    it( "splits a comma-separated value, as an environment variable carries one", () => {
        assert.deepEqual( AuthManager.toDomainList( "is-bg.net,example.org" ), [ "is-bg.net", "example.org" ] );
    } );

    it( "trims, lower-cases, drops blank entries and removes duplicates", () => {
        assert.deepEqual( AuthManager.toDomainList( " IS-BG.net , ,is-bg.NET," ), [ "is-bg.net" ] );
        assert.deepEqual( AuthManager.toDomainList( [ "Gmail.com", " gmail.com " ] ), [ "gmail.com" ] );
    } );

    it( "accepts a domain written with its leading @", () => {
        // "@gmail.com" is a common way to write a domain; comparing it verbatim would match no address at all.
        assert.deepEqual( AuthManager.toDomainList( [ "@gmail.com", " @ is-bg.net" ] ), [ "gmail.com", "is-bg.net" ] );
    } );

    it( "splits an array entry that holds a comma-separated list", () => {
        assert.deepEqual( AuthManager.toDomainList( [ "a.org,b.org" ] ), [ "a.org", "b.org" ] );
    } );

    it( "keeps a malformed entry, so a mistake narrows access rather than widening it", () => {
        // Dropping entries that do not look like domains would turn a list of nothing but mistakes into an empty
        // list — which means "any domain". Kept, a malformed entry simply matches no address.
        assert.deepEqual( AuthManager.toDomainList( [ 42 ] ), [ "42" ] );
        assert.deepEqual( AuthManager.toDomainList( true ), [ "true" ] );
    } );

} );

describe( "AuthManager.isIdentityDomainAllowed", () => {

    const google = ( email ) => ( { userID: "oauth2:g-1", username: email, email: email } );

    it( "allows any identity when the provider has no list", () => {
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "someone@anywhere.test" ), [] ), true );
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "someone@anywhere.test" ), undefined ), true );
        // Unrestricted means unrestricted: an identity carrying no address at all is not this rule's business.
        assert.equal( AuthManager.isIdentityDomainAllowed( { userID: "oauth2:x", username: "sub:x" }, [] ), true );
    } );

    it( "allows an address in a listed domain", () => {
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "kostadinov.boris@gmail.com" ), [ "gmail.com" ] ), true );
    } );

    it( "refuses an address outside the list — the organization's address arriving through Google", () => {
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "someone@is-bg.net" ), [ "gmail.com" ] ), false );
    } );

    it( "compares domains without regard to case", () => {
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "Someone@GMAIL.com" ), [ "gmail.com" ] ), true );
    } );

    it( "matches a domain exactly: no subdomain, no suffix, no prefix", () => {
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "a@mail.gmail.com" ), [ "gmail.com" ] ), false );
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "a@evilgmail.com" ), [ "gmail.com" ] ), false );
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "a@gmail.com.evil.test" ), [ "gmail.com" ] ), false );
    } );

    it( "reads the domain after the last @", () => {
        assert.equal( AuthManager.isIdentityDomainAllowed( google( "a@is-bg.net@gmail.com" ), [ "is-bg.net" ] ), false );
    } );

    it( "allows an Entra UPN in a listed domain when the directory supplies no e-mail", () => {
        const entra = { userID: "oauth2:a1", username: "b.kostadinov@is-bg.net" };
        assert.equal( AuthManager.isIdentityDomainAllowed( entra, [ "is-bg.net" ] ), true );
    } );

    it( "requires EVERY address on the identity to be in a listed domain", () => {
        // A consumer resolves its directory by the e-mail while the admin allowlist also matches the username, so
        // an allowed UPN must not carry an e-mail from elsewhere onto the session.
        const entra = { userID: "oauth2:a1", username: "b.kostadinov@is-bg.net", email: "someone@gmail.com" };
        assert.equal( AuthManager.isIdentityDomainAllowed( entra, [ "is-bg.net" ] ), false );
        assert.equal( AuthManager.isIdentityDomainAllowed( entra, [ "is-bg.net", "gmail.com" ] ), true );
    } );

    it( "refuses an Entra guest, whose UPN is in the tenant's onmicrosoft.com domain", () => {
        const guest = { userID: "oauth2:g", username: "someone_gmail.com#EXT#@isbg.onmicrosoft.com" };
        assert.equal( AuthManager.isIdentityDomainAllowed( guest, [ "is-bg.net" ] ), false );
    } );

    it( "refuses an identity that carries no address at all once a list is set", () => {
        // A domain that cannot be established is not in the list.
        assert.equal( AuthManager.isIdentityDomainAllowed( { userID: "oauth2:x", username: "sub:x" }, [ "is-bg.net" ] ), false );
    } );

    it( "checks a username that is e-mail-shaped even when it is not an address the provider vouched for", () => {
        // The username can fall back to a display name, which the account holder chooses — and the admin allowlist
        // matches the username. A display name shaped like an allowlisted address must not slip through a list.
        const spoof = { userID: "oauth2:x", username: "kostadinov.boris@gmail.com", email: "someone@is-bg.net" };
        assert.equal( AuthManager.isIdentityDomainAllowed( spoof, [ "is-bg.net" ] ), false );
    } );

} );

describe( "allowed domains through a real OpenID sign-in", () => {

    const CLIENT_ID = "client-1";
    let provider;
    let saved;
    let logged;
    let originalLog;

    beforeEach( () => {
        saved = {};
        OAUTH_ENV_KEYS.forEach( ( key ) => {
            saved[ key ] = process.env[ key ];
            delete process.env[ key ];
        } );
        provider = installFakeOpenIDProvider( { clientID: CLIENT_ID } );
        logged = [];
        originalLog = logger.log;
        logger.log = ( message, severity ) => {
            logged.push( { message: String( message ), severity: severity } );
        };
    } );

    afterEach( () => {
        logger.log = originalLog;
        provider.uninstall();
        OAUTH_ENV_KEYS.forEach( ( key ) => {
            if ( saved[ key ] === undefined ) {
                delete process.env[ key ];
            } else {
                process.env[ key ] = saved[ key ];
            }
        } );
    } );

    const settingsFor = ( providerKey, overrides = {} ) => ( {
        enabledMethods: [ providerKey === "google" ? "openid-google" : "openid-azure" ],
        oauth2: {
            [ providerKey ]: Object.assign( {
                clientID: CLIENT_ID,
                clientSecret: "client-secret",
                callbackUrl: `/login/${ providerKey }-callback`,
                discoveryUrl: provider.discoveryUrl
            }, overrides )
        }
    } );

    // Begins a sign-in, has the provider answer with the given identity, and completes the callback.
    async function signIn( manager, method, { claims, userinfo } ) {
        const oidc = await manager.authenticate( method, { baseUrl: "https://app.test" } );
        provider.issue( { nonce: oidc.nonce, claims: claims, userinfo: userinfo } );
        const callback = new URL( `https://app.test/login/callback?code=code-1&state=${ oidc.state }` );
        return manager.authorize( method, callback, oidc );
    }

    const googleIdentity = ( email ) => ( {
        claims: { sub: "g-1", email: email, email_verified: true },
        userinfo: { sub: "g-1", email: email, email_verified: true }
    } );

    const entraIdentity = ( upn ) => ( {
        claims: { sub: "a-1", preferred_username: upn, name: "Someone" },
        userinfo: { sub: "a-1", name: "Someone" }
    } );

    it( "refuses a verified Google address outside Google's list", async () => {
        const manager = new AuthManager( settingsFor( "google", { allowedDomains: [ "gmail.com" ] } ) );
        await manager.initialize();

        await assert.rejects( signIn( manager, "openid-google", googleIdentity( "someone@is-bg.net" ) ), ( error ) => {
            assert.equal( error.code, exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS );
            assert.equal( error.httpCode, exceptions.httpCode.C_401 );
            return true;
        } );
        const refusal = logged.find( ( entry ) => entry.message.includes( "Refusing an OpenID sign-in" ) );
        assert.ok( refusal, "the refusal is logged" );
        assert.equal( refusal.severity, logger.logSeverity.WARNING );
        // The domain is what an operator needs to act on; the address is somebody's personal data.
        assert.match( refusal.message, /is-bg\.net/ );
        assert.doesNotMatch( refusal.message, /someone@/ );
    } );

    it( "admits a Google address in Google's list", async () => {
        const manager = new AuthManager( settingsFor( "google", { allowedDomains: [ "gmail.com" ] } ) );
        await manager.initialize();

        const user = await signIn( manager, "openid-google", googleIdentity( "kostadinov.boris@gmail.com" ) );
        assert.equal( user.email, "kostadinov.boris@gmail.com" );
    } );

    it( "lets the environment variable replace the configured list", async () => {
        process.env.TI_AZURE_AUTH_ALLOWED_DOMAINS = " IS-BG.net ";
        const manager = new AuthManager( settingsFor( "azure", { allowedDomains: [ "other.test" ] } ) );
        await manager.initialize();

        const user = await signIn( manager, "openid-azure", entraIdentity( "b.kostadinov@is-bg.net" ) );
        assert.equal( user.username, "b.kostadinov@is-bg.net" );
        await assert.rejects( signIn( manager, "openid-azure", entraIdentity( "someone@other.test" ) ) );
    } );

    it( "keeps the two providers' lists apart", async () => {
        process.env.TI_AZURE_AUTH_ALLOWED_DOMAINS = "is-bg.net";
        process.env.TI_GCLOUD_AUTH_ALLOWED_DOMAINS = "gmail.com";
        const settings = settingsFor( "google" );
        settings.enabledMethods.push( "openid-azure" );
        settings.oauth2.azure = Object.assign( {}, settings.oauth2.google, { callbackUrl: "/login/azure-callback" } );
        const manager = new AuthManager( settings );
        await manager.initialize();

        await assert.rejects( signIn( manager, "openid-google", googleIdentity( "someone@is-bg.net" ) ) );
        await assert.rejects( signIn( manager, "openid-azure", entraIdentity( "someone@gmail.com" ) ) );
        assert.equal( ( await signIn( manager, "openid-azure", entraIdentity( "someone@is-bg.net" ) ) ).username, "someone@is-bg.net" );
        assert.equal( ( await signIn( manager, "openid-google", googleIdentity( "someone@gmail.com" ) ) ).email, "someone@gmail.com" );
    } );

    it( "admits any domain when no list is configured, as before", async () => {
        const manager = new AuthManager( settingsFor( "google" ) );
        await manager.initialize();

        const user = await signIn( manager, "openid-google", googleIdentity( "someone@anywhere.test" ) );
        assert.equal( user.email, "someone@anywhere.test" );
    } );

    it( "names the list in effect when the provider is enabled", async () => {
        // The value in effect, not the value configured: a stale shell export silently beats a correct file, and a
        // start-up line naming the list is how an operator sees which one won.
        process.env.TI_GCLOUD_AUTH_ALLOWED_DOMAINS = "gmail.com";
        const manager = new AuthManager( settingsFor( "google", { allowedDomains: [ "other.test" ] } ) );
        await manager.initialize();

        const enabled = logged.find( ( entry ) => entry.message.includes( "Enabled OpenID Connect authentication with Google" ) );
        assert.ok( enabled );
        assert.match( enabled.message, /gmail\.com/ );
        assert.doesNotMatch( enabled.message, /other\.test/ );
    } );

    it( "says so when a provider admits any domain", async () => {
        const manager = new AuthManager( settingsFor( "google" ) );
        await manager.initialize();

        const enabled = logged.find( ( entry ) => entry.message.includes( "Enabled OpenID Connect authentication with Google" ) );
        assert.match( enabled.message, /any e-mail domain/i );
    } );

} );
