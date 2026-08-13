# Login Identity Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the acting employee from the authenticated login's email instead of the hard-coded `"20"` fallback, and refuse the login fail-closed when no usable employee record matches.

**Architecture:** `web-framework` gains the reusable mechanism — a refused `augmentSession` hook destroys the session before rejecting, any 401 on an HTML request redirects to the login page with an error code, and the login page renders that error. `competence` gains the policy — a pure `identity-resolver` singleton, an email index on the org graph, and an `augmentSession` that is thin glue over both. No `core` change.

**Tech Stack:** Node.js ≥20.19, CommonJS, Express 5, express-session, graphology, Alpine.js (CSP build), `node --test`.

**Spec:** [`docs/superpowers/specs/2026-08-13-competence-login-identity-resolution-design.md`](../specs/2026-08-13-competence-login-identity-resolution-design.md)

## Global Constraints

- **Branch:** `ca-95-login-identity` (already created off `current`). Do not commit to `current` or `master`.
- **CommonJS everywhere** — `require()` / `module.exports`. No ESM.
- **Internal imports use the `#alias` map** in each package's `package.json` (`#web-handlers`, `#identity-resolver`), never relative paths. Cross-package imports use the `exports` map.
- **Alpine.js runs in CSP mode** in the web-framework shell: in HTML expressions **no inline `style="..."`**, **no optional chaining (`?.`)**, and no `Array`/`Object` globals. Use CSS classes and JS helpers.
- **New singletons follow the frozen-instance pattern**: `const instance = new X(); module.exports.instance = Object.freeze( instance );` — mirroring `role-resolver.js`.
- **Every commit message references `(CA-95)`** and uses Conventional Commits scoped to the package.
- **Never commit `.run/*.run.xml`** — they carry live local credentials.
- **web-framework ships generated `.d.ts`**: after changing any public signature or JSDoc there, run `npm run build:types -w @ti-engine/web-framework` and commit the regenerated `types/`.
- **Version targets:** web-framework `1.21.0` → `1.22.0`; competence `3.18.0` → `3.19.0`. Bump `package.json` **and** `CHANGELOG.md` together.
  **Renumbered mid-execution.** Tasks 4 and 8 were written against `1.21.0` / `3.18.0`. While this branch was in
  flight, CA-99 merged to `current` and published `@ti-engine/web-framework@1.21.0` to npm (tag
  `web-framework-v1.21.0`, commit `f2f0c46`), claiming both numbers. An npm publish is irreversible, so this branch
  moved. Task 4's step text below still names the original numbers — it records what was executed at the time; the
  values in this constraints block are the ones that ship.
- **Refusal reasons** are exactly these four strings: `no-email`, `no-record`, `terminated`, `ambiguous-email`.
- **Employment statuses permitted to sign in** are exactly `active` and `on-leave`. Any other value — including an unrecognized one — fails closed as `terminated`.
- **Copy (English):** `We couldn't sign you in. Check your credentials, or contact your administrator if your account is not set up for this application.`

---

## File Structure

**web-framework**

| File | Responsibility |
|---|---|
| `components/web-handlers.js` | *Modify.* Destroy the session when the augment hook throws; widen the login-failure redirect to any 401. |
| `bin/web-server.js` | *Modify.* Document the `augmentSession` refusal contract in JSDoc. |
| `bin/static/fragments/frame-login.html` | *Modify.* Bind `#ti-error` to the new component. |
| `bin/static/scripts/ti-framework.js` | *Modify.* Add + register `tiLoginError`. |
| `bin/localization/web-server-labels.json` | *Modify.* Add the generic error label (en/bg). |
| `test/web-handlers.session-fail-closed.test.js` | *Create.* |
| `test/web-handlers.login-error-redirect.test.js` | *Create.* |
| `test/frame-login.error-binding.test.js` | *Create.* Static guard: binding present, label key exists, no inline styles. |

**competence**

| File | Responsibility |
|---|---|
| `application/identity-resolver.js` | *Create.* Pure: cookie parsing, the resolve decision, and applying an outcome to a session. |
| `application/organization-manager.js` | *Modify.* Email index + `resolveEmployeeIDByEmail` + `hasEmployee`. |
| `bin/competence-web-server.js` | *Modify.* `augmentSession` becomes glue; `#readTestUserSelection` and the `"20"` literal are deleted. |
| `package.json` | *Modify.* Add the `#identity-resolver` alias. |
| `test/identity-resolver.test.js` | *Create.* |
| `test/organization-email-index.test.js` | *Create.* |

---

## Task 1: Fail-closed session on a throwing augment hook

**Files:**
- Modify: `packages/web-framework/components/web-handlers.js:170-177`
- Test: `packages/web-framework/test/web-handlers.session-fail-closed.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the guarantee that a `modifier` throwing inside `regenerateAndSaveSession` destroys the session and never saves it. Task 7 depends on this for its refusal path.

**Why:** `session.user` is assigned *in place* before the hook runs, and `verifySession` is only `Boolean(session.user)`. Without this, a refused login still yields a persistable session.

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/web-handlers.session-fail-closed.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const webHandlers = require( "#web-handlers" );

// Minimal express-session double recording which lifecycle calls were made.
function mockSession( initial = {} ) {
    const session = Object.assign( {
        calls: { regenerate: 0, save: 0, destroy: 0 },
        regenerate( callback ) {
            session.calls.regenerate++;
            callback( null );
        },
        save( callback ) {
            session.calls.save++;
            callback( null );
        },
        destroy( callback ) {
            session.calls.destroy++;
            callback( null );
        }
    }, initial );
    return session;
}

function mockRequest( session ) {
    const headers = { host: "app.example", accept: "text/html" };
    return {
        method: "GET",
        secure: true,
        originalUrl: "/login/openid-azure/callback?code=abc&state=xyz",
        query: { code: "abc", state: "xyz" },
        session: session,
        get: ( name ) => headers[ String( name ).toLowerCase() ],
        accepts: ( type ) => type
    };
}

// A user double shaped like the framework User's asJSON() output.
const AUTHENTICATED_USER = {
    asJSON: () => ( { userID: "u-1", username: "someone", email: "someone@example.com", roles: [], permissions: [], details: {} } ),
    language: "en"
};

describe( "a refused augmentSession must not leave a usable session", () => {

    it( "destroys the session and never saves it when the augment hook throws", async () => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: () => {
                throw new Error( "no employee record" );
            }
        };

        let forwarded;
        const next = ( error ) => {
            forwarded = error;
        };

        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, {}, next );
        await new Promise( ( resolve ) => setImmediate( resolve ) );

        assert.equal( session.calls.destroy, 1, "the session must be destroyed when the hook refuses" );
        assert.equal( session.calls.save, 0, "a refused login must never persist the session" );
        assert.ok( forwarded, "the error must be forwarded to the error handler" );
    } );

    it( "saves the session normally when the augment hook succeeds", async () => {
        const session = mockSession( { oidc: { codeVerifier: "verifier", state: "xyz" } } );
        const request = mockRequest( session );
        const instance = {
            serviceConfig: { language: "en", auth: { admins: [] } },
            authorize: () => Promise.resolve( AUTHENTICATED_USER ),
            augmentSession: ( session ) => session
        };

        const response = { redirect: () => {} };
        webHandlers.authorizedOAuth2CallbackHandler( instance, "openid-azure" )( request, response, () => {} );
        await new Promise( ( resolve ) => setImmediate( resolve ) );

        assert.equal( session.calls.save, 1, "a successful login must save the session" );
        assert.equal( session.calls.destroy, 0, "a successful login must not destroy the session" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/web-handlers.session-fail-closed.test.js
```

Expected: the first test FAILS on `the session must be destroyed when the hook refuses` (actual `0`, expected `1`). The second test passes already.

- [ ] **Step 3: Make the change**

In `packages/web-framework/components/web-handlers.js`, replace the `catch` block inside `regenerateAndSaveSession` (currently lines 174-177):

```js
                } catch ( error ) {
                    reject( error );
                    return;
                }
```

with:

```js
                } catch ( error ) {
                    // The application's augment hook refused this login. `session.user` was already assigned in place
                    // before the hook ran, and `verifySession` only checks that it exists — so a merely-rejected
                    // session would still be persisted by express-session at response end and would admit the user.
                    // Destroy it before rejecting so a refusal is genuinely fail-closed.
                    request.session.destroy( () => {
                        reject( error );
                    } );
                    return;
                }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/web-handlers.session-fail-closed.test.js
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole web-framework suite for regressions**

```bash
npm test -w @ti-engine/web-framework
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/components/web-handlers.js packages/web-framework/test/web-handlers.session-fail-closed.test.js
git commit -m "fix(web-handlers): destroy the session when an augment hook refuses a login (CA-95)"
```

---

## Task 2: Method-agnostic login-failure redirect

**Files:**
- Modify: `packages/web-framework/components/web-handlers.js:531`
- Test: `packages/web-framework/test/web-handlers.login-error-redirect.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the guarantee that any HTML-accepting, non-HTMX request producing a **401** is answered with `303 → /?error=<code>`. Task 3 renders that error.

**Why:** the redirect is currently GET-only, so the Azure callback is covered but the local login POST falls through to a raw payload. Local auth is becoming a production-viable method, so its failures must present identically.

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/web-handlers.login-error-redirect.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const exceptions = require( "@ti-engine/core/exceptions" );
const webHandlers = require( "#web-handlers" );

function mockRequest( { method = "POST", accept = "text/html", htmx = false } = {} ) {
    const headers = { accept: accept };
    if ( htmx ) {
        headers[ "hx-request" ] = "true";
    }
    return {
        method: method,
        session: { language: "en" },
        originalUrl: "/login/local",
        get: ( name ) => headers[ String( name ).toLowerCase() ],
        accepts: ( type ) => ( accept.includes( type ) || accept.includes( "*/*" ) ) ? type : false
    };
}

function mockResponse() {
    const captured = { redirectedTo: null, status: null, body: undefined, headers: null };
    return {
        captured: captured,
        redirect: ( code, target ) => {
            captured.status = code;
            captured.redirectedTo = target;
        },
        status: ( code ) => {
            captured.status = code;
            return { send: ( body ) => { captured.body = body; } };
        },
        set: ( headers ) => { captured.headers = headers; }
    };
}

function runErrorHandler( error, request ) {
    const response = mockResponse();
    webHandlers.defaultErrorHandler()( error, request, response, () => {} );
    return response.captured;
}

describe( "login failures redirect to the login page regardless of HTTP method", () => {

    it( "redirects an HTML-accepting POST that produced a 401", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        const captured = runErrorHandler( error, mockRequest( { method: "POST" } ) );

        assert.equal( captured.status, 303 );
        assert.ok( captured.redirectedTo.startsWith( "/?error=" ), `expected a login redirect, got "${ captured.redirectedTo }"` );
    } );

    it( "still redirects an HTML-accepting GET (the OAuth callback path)", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        const captured = runErrorHandler( error, mockRequest( { method: "GET" } ) );

        assert.equal( captured.status, 303 );
        assert.ok( captured.redirectedTo.startsWith( "/?error=" ) );
    } );

    it( "leaves a non-401 HTML POST on the payload response", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND, null, exceptions.httpCode.C_422 );
        const captured = runErrorHandler( error, mockRequest( { method: "POST" } ) );

        assert.equal( captured.redirectedTo, null, "widening the rule must not swallow ordinary form errors" );
        assert.equal( captured.status, 422 );
        assert.ok( captured.body );
    } );

    it( "leaves an HTMX request on the HX-Trigger branch", () => {
        const error = exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
        const captured = runErrorHandler( error, mockRequest( { method: "POST", htmx: true } ) );

        assert.equal( captured.redirectedTo, null );
        assert.ok( captured.headers && captured.headers[ "HX-Trigger" ], "an HTMX caller must keep receiving HX-Trigger" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/web-handlers.login-error-redirect.test.js
```

Expected: the first test FAILS — `captured.redirectedTo` is `null` because the POST fell through to the payload branch. The other three pass.

- [ ] **Step 3: Make the change**

In `packages/web-framework/components/web-handlers.js`, in `defaultErrorHandler`, replace line 531:

```js
            } else if ( isAcceptingResponseType( request, "html" ) && request.method === "GET" ) {
```

with:

```js
                // A 401 on an HTML request means "you are not signed in" whatever the method — the useful answer is the
                // sign-in page carrying the reason, so local auth's POST presents exactly like the OAuth callback's GET.
            } else if ( isAcceptingResponseType( request, "html" ) && ( request.method === "GET" || status === exceptions.httpCode.C_401 ) ) {
```

Leave the `404` branch above (line 513) unchanged — a 404 is not a sign-in failure.

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/web-handlers.login-error-redirect.test.js
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole web-framework suite**

```bash
npm test -w @ti-engine/web-framework
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/components/web-handlers.js packages/web-framework/test/web-handlers.login-error-redirect.test.js
git commit -m "feat(web-handlers): redirect any HTML 401 to the login page, not just GETs (CA-95)"
```

---

## Task 3: Render the login error

**Files:**
- Modify: `packages/web-framework/bin/localization/web-server-labels.json`
- Modify: `packages/web-framework/bin/static/scripts/ti-framework.js` (add `configureLoginError`; register it in the `alpine:init` block near line 1426)
- Modify: `packages/web-framework/bin/static/fragments/frame-login.html:15`
- Test: `packages/web-framework/test/frame-login.error-binding.test.js`

**Interfaces:**
- Consumes: the `/?error=<code>` redirect from Task 2.
- Produces: a visible, localized message on the login page. Nothing depends on it.

**Why:** `#ti-error` is an empty div and `getUrlParam` has no call sites, so the redirect currently renders a blank login page.

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/frame-login.error-binding.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const LABEL_KEY = "interface.default.login.error-sign-in-failed";

const fragment = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "fragments", "frame-login.html" ), "utf8" );
const script = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.js" ), "utf8" );
const labels = JSON.parse( fs.readFileSync( path.join( __dirname, "..", "bin", "localization", "web-server-labels.json" ), "utf8" ) );

function labelAt( keyPath ) {
    return keyPath.split( "." ).reduce( ( node, key ) => ( node && node[ key ] !== undefined ) ? node[ key ] : undefined, labels );
}

describe( "login error surface", () => {

    it( "binds #ti-error to the tiLoginError component", () => {
        assert.match( fragment, /id="ti-error"[^>]*x-data="tiLoginError"/, "#ti-error must carry x-data=\"tiLoginError\"" );
    } );

    it( "shows the error conditionally and renders it through the label directive", () => {
        // Deliberately x-bind:class, not x-show: `.ti-login-error` is `display: none` in the stylesheet, and x-show
        // reveals an element by clearing its inline display — which would fall straight back to that `none`.
        assert.match( fragment, /id="ti-error"[^>]*x-bind:class="\{ visible: hasError \}"/, "#ti-error must toggle the visible class from hasError" );
        assert.ok( fragment.includes( `x-text-label="${ LABEL_KEY }"` ), `the message must render via x-text-label="${ LABEL_KEY }"` );
    } );

    it( "has a stylesheet rule that actually reveals the element", () => {
        const styles = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.css" ), "utf8" );
        assert.match( styles, /\.ti-login-error\.visible\s*\{[^}]*display:\s*block/, "a .ti-login-error.visible rule must exist, or the message can never appear" );
    } );

    it( "registers the component with Alpine", () => {
        assert.ok( script.includes( `Alpine.data( "tiLoginError", configureLoginError )` ), "tiLoginError must be registered in the alpine:init block" );
    } );

    it( "carries the label in both supported languages", () => {
        const label = labelAt( LABEL_KEY );
        assert.ok( label, `missing label ${ LABEL_KEY }` );
        assert.ok( label.en && label.en.length > 0, "English copy is required" );
        assert.ok( label.bg && label.bg.length > 0, "Bulgarian copy is required" );
    } );

    it( "uses no inline styles, which the Alpine CSP build forbids", () => {
        assert.doesNotMatch( fragment, /\sstyle="/, "inline style attributes are forbidden under the CSP build" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/frame-login.error-binding.test.js
```

Expected: FAIL on the binding, registration and label assertions.

- [ ] **Step 3: Add the label**

In `packages/web-framework/bin/localization/web-server-labels.json`, inside the existing `interface.default.login` object (which already holds `sign-in`, `sign-in-azure`, …), add:

```json
        "error-sign-in-failed": {
          "en": "We couldn't sign you in. Check your credentials, or contact your administrator if your account is not set up for this application.",
          "bg": "Неуспешно влизане. Проверете данните си за достъп или се свържете с администратора, ако акаунтът ви не е настроен за това приложение."
        },
```

This matches the shape of the neighbouring `sign-in` / `sign-in-azure` entries exactly: a key holding `en` and `bg` strings. Keep the keys in the block's existing alphabetical order (`error-sign-in-failed` sorts before `password`).

- [ ] **Step 4: Add the Alpine component**

In `packages/web-framework/bin/static/scripts/ti-framework.js`, immediately **before** `const configureLoginTestUserPanel = () => {` (currently line 1316), insert:

```js
/**
 * Returns a configuration object for the login screen error message.
 * <br/>
 * The login handlers answer a failed sign-in with a `303` to `/?error=<code>` (see `defaultErrorHandler`). This reads
 * that parameter and reveals the message element; the copy itself stays declarative via `x-text-label` so it localizes
 * through the normal path. Deliberately independent of the throwaway test-user panel so it survives that panel's removal.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureLoginError = () => {
    return {
        hasError: false,

        init() {
            const tiToolbox = Alpine.store( "tiToolbox" );
            this.hasError = Boolean( tiToolbox.getUrlParam( "error" ) );
        }
    };
};
```

Then, in the `alpine:init` listener, add the registration directly after the `tiLoginTestUserPanel` line (currently line 1426):

```js
    Alpine.data( "tiLoginError", configureLoginError );
```

- [ ] **Step 5: Add the reveal rule to the stylesheet**

In `packages/web-framework/bin/static/scripts/ti-framework.css`, directly after the `.ti-login-error` block (which ends at line 2411 with its closing brace), add:

```css
.ti-login-error.visible {
    display: block;
}
```

- [ ] **Step 6: Bind the fragment**

In `packages/web-framework/bin/static/fragments/frame-login.html`, replace line 15:

```html
            <div id="ti-error" class="ti-login-error"></div>
```

with:

```html
            <div id="ti-error"
                 class="ti-login-error"
                 x-data="tiLoginError"
                 x-bind:class="{ visible: hasError }"
                 role="alert"
                 x-text-label="interface.default.login.error-sign-in-failed"></div>
```

Note `x-bind:class`, not `x-show`. `.ti-login-error` is `display: none` in the stylesheet and `x-show` reveals an
element by clearing its *inline* display — which would fall straight back to that `none` and the message would never
appear. The object-literal class binding is the same CSP-safe pattern the test-user pills already use in this fragment
(line 102). No `style` attribute and no `?.` — both are rejected by the CSP build.

- [ ] **Step 7: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/frame-login.error-binding.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/web-framework/bin/localization/web-server-labels.json packages/web-framework/bin/static/scripts/ti-framework.js packages/web-framework/bin/static/scripts/ti-framework.css packages/web-framework/bin/static/fragments/frame-login.html packages/web-framework/test/frame-login.error-binding.test.js
git commit -m "feat(web-app): render the sign-in failure message on the login page (CA-95)"
```

---

## Task 4: Document the refusal contract and release web-framework 1.21.0

**Files:**
- Modify: `packages/web-framework/bin/web-server.js:429-443` (the `augmentSession` JSDoc)
- Modify: `packages/web-framework/README.md`
- Modify: `packages/web-framework/package.json` (`exports` map **and** version)
- Modify: `packages/web-framework/CHANGELOG.md`
- Regenerate: `packages/web-framework/types/**`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: web-framework `1.21.0`, plus a new `@ti-engine/web-framework/authorization` subpath export. Task 7 imports `isAdminIdentity` through it — today the module is internal and unreachable by a consumer.

- [ ] **Step 1: Document the contract**

In `packages/web-framework/bin/web-server.js`, extend the `augmentSession` JSDoc. Keep the existing text and add, before the `@method` tag:

```js
     * <br/>
     * **Refusing a login.** Throwing from this hook refuses the sign-in: the framework destroys the freshly regenerated
     * session (so no usable session survives the refusal), the login handler raises `401`, and the error handler
     * redirects the browser to the login page with the exception code in `?error=`. Throw when the authenticated
     * identity cannot be mapped to an application principal; return the session unchanged to accept it.
```

- [ ] **Step 2: Document it in the README**

In `packages/web-framework/README.md`, find the section describing `augmentSession` (search for `augmentSession`) and add one paragraph stating the same contract in prose. If no such section exists, add it under the authentication/authorization heading.

- [ ] **Step 3: Export the authorization module**

`components/authorization.js` is currently internal — the `exports` map lists only `./config-management`, `./web-application`, `./web-server` and `./definitions` — so a consumer cannot reach `isAdminIdentity`, which Task 7 needs for the admin exception. In `packages/web-framework/package.json`, add to `exports`, following the `types`/`default` condition shape the other entries use:

```json
    "./authorization": {
      "types": "./types/components/authorization.d.ts",
      "default": "./components/authorization.js"
    },
```

Then confirm it resolves:

```bash
node -e "console.log(typeof require('@ti-engine/web-framework/authorization').isAdminIdentity)"
```

Expected: `function`.

- [ ] **Step 4: Regenerate the type declarations**

```bash
npm run build:types -w @ti-engine/web-framework
```

Expected: completes without error and updates files under `packages/web-framework/types/`.

- [ ] **Step 5: Bump the version**

In `packages/web-framework/package.json`, change `"version": "1.20.1"` to `"version": "1.21.0"`.

- [ ] **Step 6: Add the changelog section**

At the top of `packages/web-framework/CHANGELOG.md`, directly below the intro paragraph and above `## Version 1.20.1`:

```markdown
## Version 1.21.0

An application may now refuse a sign-in from its `augmentSession` hook, and that refusal is genuinely fail-closed.
Sign-in failures also present identically across every auth method, which local (username/password) auth needs before
it can be offered as a production option.

* fix(web-handlers): destroy the session when an augment hook throws. `session.user` is assigned in place before the
  hook runs and `verifySession` only checks that it exists, so a merely-rejected session was still persisted by
  express-session at response end and would have admitted the refused user
* feat(web-server): document the `augmentSession` refusal contract — throwing refuses the login, destroys the session,
  and redirects to the login page carrying the exception code
* feat(web-handlers): redirect any HTML-accepting, non-HTMX **401** to `/?error=<code>`, not only `GET` requests, so a
  local-auth POST failure presents exactly like an OAuth callback failure. Non-401 responses are unaffected
* feat(web-app): render the sign-in failure message on the login page. `#ti-error` was an empty element and the
  `getUrlParam` helper had no call sites, so a failed sign-in previously returned a blank login form
* feat(exports): expose the authorization helpers as `@ti-engine/web-framework/authorization`, so an application can
  reuse `isAdminIdentity` for its own allowlist decisions instead of reimplementing the match
* build(release): bump package version from `1.20.1` to `1.21.0`
```

- [ ] **Step 7: Run the full suite**

```bash
npm test -w @ti-engine/web-framework
```

Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web-framework/bin/web-server.js packages/web-framework/README.md packages/web-framework/package.json packages/web-framework/CHANGELOG.md packages/web-framework/types
git commit -m "docs(web-server): document the augmentSession refusal contract; release 1.21.0 (CA-95)"
```

---

## Task 5: The pure identity resolver

**Files:**
- Create: `packages/competence/application/identity-resolver.js`
- Modify: `packages/competence/package.json` (add the `#identity-resolver` alias after `#data-manager`, keeping alphabetical order)
- Test: `packages/competence/test/identity-resolver.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, on `require( "#identity-resolver" ).instance`:
  - `REFUSAL_REASON` → frozen `{ NO_EMAIL: "no-email", NO_RECORD: "no-record", TERMINATED: "terminated", AMBIGUOUS_EMAIL: "ambiguous-email" }`
  - `parseTestUserCookie( raw: string ) → { employeeID: string, roles: number[] } | null`
  - `resolve( facts ) → { employeeID: string|null, overrideRoles: number[]|null, adminOnly: boolean, reason: string|null }`
    where `facts` is `{ email?: string, testUserCookie?: string, testUserEnabled?: boolean, isAdmin?: boolean, lookupByEmail: (email: string) => ({ employeeID: string, employmentStatus: string } | { ambiguous: true } | null), employeeExists: (employeeID: string) => boolean }`
  - `applyIdentity( session, outcome, resolveRoles: (employeeID: string) => number[] ) → session` — throws `TiException` when `outcome.reason` is set

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/identity-resolver.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const identityResolver = require( "#identity-resolver" );

const resolver = identityResolver.instance;

// A directory double: email -> record, plus the set of known employee IDs.
function directory( { records = {}, ambiguous = [] } = {} ) {
    return {
        lookupByEmail: ( email ) => {
            if ( ambiguous.includes( email ) ) {
                return { ambiguous: true };
            }
            return records[ email ] || null;
        },
        employeeExists: ( employeeID ) => Object.values( records ).some( ( record ) => record.employeeID === employeeID )
    };
}

const DIRECTORY = directory( {
    records: {
        "ada@example.com": { employeeID: "11", employmentStatus: "active" },
        "grace@example.com": { employeeID: "12", employmentStatus: "on-leave" },
        "alan@example.com": { employeeID: "13", employmentStatus: "terminated" },
        "edsger@example.com": { employeeID: "14", employmentStatus: "seconded" }
    },
    ambiguous: [ "twins@example.com" ]
} );

describe( "identityResolver.parseTestUserCookie", () => {

    it( "parses a URI-encoded selection", () => {
        const raw = encodeURIComponent( JSON.stringify( { employeeID: "22", roles: [ 1, 2, 3 ] } ) );
        assert.deepEqual( resolver.parseTestUserCookie( raw ), { employeeID: "22", roles: [ 1, 2, 3 ] } );
    } );

    it( "returns an empty roles array when the cookie carries no override", () => {
        const raw = encodeURIComponent( JSON.stringify( { employeeID: "22" } ) );
        assert.deepEqual( resolver.parseTestUserCookie( raw ), { employeeID: "22", roles: [] } );
    } );

    it( "drops non-numeric roles rather than trusting them", () => {
        const raw = encodeURIComponent( JSON.stringify( { employeeID: "22", roles: [ 1, "admin", null, 3 ] } ) );
        assert.deepEqual( resolver.parseTestUserCookie( raw ), { employeeID: "22", roles: [ 1, 3 ] } );
    } );

    it( "returns null for malformed or empty values", () => {
        assert.equal( resolver.parseTestUserCookie( "not-json" ), null );
        assert.equal( resolver.parseTestUserCookie( "" ), null );
        assert.equal( resolver.parseTestUserCookie( undefined ), null );
        assert.equal( resolver.parseTestUserCookie( encodeURIComponent( JSON.stringify( { roles: [ 1 ] } ) ) ), null );
    } );

} );

describe( "identityResolver.resolve — email identity", () => {

    it( "resolves an active employee by email", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com" }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11" );
        assert.equal( outcome.reason, null );
        assert.equal( outcome.adminOnly, false );
    } );

    it( "matches case-insensitively and ignores surrounding whitespace", () => {
        const outcome = resolver.resolve( Object.assign( { email: "  ADA@Example.COM  " }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11" );
    } );

    it( "admits an employee who is on leave", () => {
        const outcome = resolver.resolve( Object.assign( { email: "grace@example.com" }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "12" );
        assert.equal( outcome.reason, null );
    } );

    it( "refuses a terminated employee", () => {
        const outcome = resolver.resolve( Object.assign( { email: "alan@example.com" }, DIRECTORY ) );
        assert.equal( outcome.employeeID, null );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.TERMINATED );
    } );

    it( "refuses an unrecognized employment status, failing closed", () => {
        const outcome = resolver.resolve( Object.assign( { email: "edsger@example.com" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.TERMINATED );
    } );

    it( "refuses an identity with no matching record", () => {
        const outcome = resolver.resolve( Object.assign( { email: "nobody@example.com" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.NO_RECORD );
    } );

    it( "refuses an identity carrying no email at all", () => {
        const outcome = resolver.resolve( Object.assign( { email: "" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.NO_EMAIL );
    } );

    it( "refuses an ambiguous email rather than guessing between records", () => {
        const outcome = resolver.resolve( Object.assign( { email: "twins@example.com" }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.AMBIGUOUS_EMAIL );
    } );

} );

describe( "identityResolver.resolve — admin exception", () => {

    it( "admits an allowlisted admin with no employee record, with no employeeID and no roles", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ops@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.adminOnly, true );
        assert.equal( outcome.employeeID, null );
        assert.equal( outcome.reason, null );
    } );

    it( "admits an allowlisted admin whose record is terminated", () => {
        const outcome = resolver.resolve( Object.assign( { email: "alan@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.adminOnly, true );
        assert.equal( outcome.reason, null );
    } );

    it( "admits an allowlisted admin whose email is ambiguous", () => {
        const outcome = resolver.resolve( Object.assign( { email: "twins@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.adminOnly, true );
    } );

    it( "prefers a real employee record over the admin exception", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", isAdmin: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11" );
        assert.equal( outcome.adminOnly, false );
    } );

} );

describe( "identityResolver.resolve — dev test-user cookie", () => {

    const cookie = encodeURIComponent( JSON.stringify( { employeeID: "12", roles: [ 1, 2 ] } ) );

    it( "ignores the cookie entirely when the flag is off", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: cookie, testUserEnabled: false }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "11", "the email identity must win when the dev flag is off" );
        assert.equal( outcome.overrideRoles, null );
    } );

    it( "honors the cookie identity and role override when the flag is on", () => {
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: cookie, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "12" );
        assert.deepEqual( outcome.overrideRoles, [ 1, 2 ] );
    } );

    it( "derives roles when the cookie names an identity without a role override", () => {
        const identityOnly = encodeURIComponent( JSON.stringify( { employeeID: "12" } ) );
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: identityOnly, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "12" );
        assert.equal( outcome.overrideRoles, null, "an absent override must fall through to derived roles" );
    } );

    it( "refuses a cookie naming an employee who does not exist, so a dev typo is visible", () => {
        const missing = encodeURIComponent( JSON.stringify( { employeeID: "999" } ) );
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: missing, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.reason, resolver.REFUSAL_REASON.NO_RECORD );
    } );

    it( "does not gate the cookie on employment status, so a terminated employee stays testable", () => {
        const terminated = encodeURIComponent( JSON.stringify( { employeeID: "13" } ) );
        const outcome = resolver.resolve( Object.assign( { email: "ada@example.com", testUserCookie: terminated, testUserEnabled: true }, DIRECTORY ) );
        assert.equal( outcome.employeeID, "13" );
        assert.equal( outcome.reason, null );
    } );

} );

describe( "identityResolver.applyIdentity", () => {

    it( "writes the resolved identity and derived roles onto the session", () => {
        const session = { user: {} };
        resolver.applyIdentity( session, { employeeID: "11", overrideRoles: null, adminOnly: false, reason: null }, () => [ 1, 2 ] );
        assert.equal( session.user.employeeID, "11" );
        assert.deepEqual( session.user.roles, [ 1, 2 ] );
    } );

    it( "prefers the override roles over the derived ones", () => {
        const session = { user: {} };
        resolver.applyIdentity( session, { employeeID: "11", overrideRoles: [ 3 ], adminOnly: false, reason: null }, () => [ 1, 2 ] );
        assert.deepEqual( session.user.roles, [ 3 ] );
    } );

    it( "gives an admin-only session no employeeID and no application roles", () => {
        const session = { user: {} };
        resolver.applyIdentity( session, { employeeID: null, overrideRoles: null, adminOnly: true, reason: null }, () => [ 1, 2 ] );
        assert.equal( session.user.employeeID, null );
        assert.deepEqual( session.user.roles, [] );
    } );

    it( "throws on a refusal and leaves no identity behind", () => {
        const session = { user: {} };
        assert.throws( () => {
            resolver.applyIdentity( session, { employeeID: null, overrideRoles: null, adminOnly: false, reason: "no-record" }, () => [ 1 ] );
        } );
        assert.equal( session.user.employeeID, undefined );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/competence/test/identity-resolver.test.js
```

Expected: FAIL — `Cannot find module '#identity-resolver'`.

- [ ] **Step 3: Register the import alias**

In `packages/competence/package.json`, inside `"imports"`, add the entry so the block reads (surrounding entries shown for placement):

```json
    "#identity-resolver": "./application/identity-resolver.js",
    "#organization-manager": "./application/organization-manager.js",
    "#role-resolver": "./application/role-resolver.js",
    "#task-resolver": "./application/task-resolver.js"
```

Keep the existing alphabetical ordering of the block; add only the `#identity-resolver` line.

- [ ] **Step 4: Write the implementation**

Create `packages/competence/application/identity-resolver.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const exceptions = require( "@ti-engine/core/exceptions" );

/**
 * @typedef {Object} EmployeeDirectoryRecord
 * @property {string} employeeID
 * @property {string} employmentStatus
 */

/**
 * @typedef {Object} IdentityFacts
 * @property {string} [email] - The email the user authenticated with.
 * @property {string} [testUserCookie] - Raw value of the dev `ti-test-user` cookie.
 * @property {boolean} [testUserEnabled] - Whether the dev cookie may be honored at all.
 * @property {boolean} [isAdmin] - Whether the identity is on the deployment's admin allowlist.
 * @property {function(string): (EmployeeDirectoryRecord|{ambiguous: boolean}|null)} lookupByEmail
 * @property {function(string): boolean} employeeExists
 */

/**
 * @typedef {Object} IdentityOutcome
 * @property {string|null} employeeID
 * @property {number[]|null} overrideRoles
 * @property {boolean} adminOnly
 * @property {string|null} reason
 */

// The employment statuses permitted to sign in. Anything else — including an unrecognized value — is refused, so a
// future status added to the employee schema fails closed until it is deliberately listed here.
const LOGIN_PERMITTED_STATUSES = Object.freeze( [ "active", "on-leave" ] );

const REFUSAL_REASON = Object.freeze( {
    NO_EMAIL: "no-email",
    NO_RECORD: "no-record",
    TERMINATED: "terminated",
    AMBIGUOUS_EMAIL: "ambiguous-email"
} );

/**
 * Pure resolver mapping an authenticated identity to the acting employee. Performs no I/O — the caller injects the
 * directory lookups (mirrors the {@link RoleResolver} and {@link TaskResolver} pattern), keeping every rule
 * unit-testable with plain objects. Knows nothing about sessions beyond {@link IdentityResolver#applyIdentity}.
 *
 * @class IdentityResolver
 * @singleton
 * @public
 */
class IdentityResolver {

    static #instance = null;

    /**
     * @constructor
     * @returns {IdentityResolver}
     */
    constructor() {
        if ( !IdentityResolver.#instance ) {
            IdentityResolver.#instance = this;
        }
        return IdentityResolver.#instance;
    }

    /* Public interface */

    /**
     * The four reasons a sign-in can be refused.
     *
     * @property
     * @returns {Object}
     * @public
     */
    get REFUSAL_REASON() {
        return REFUSAL_REASON;
    }

    /**
     * Parses the dev `ti-test-user` cookie. Roles are coerced to finite numbers and anything else is dropped, so the
     * cookie can never inject the string `admin` role. Pure.
     *
     * @method
     * @param {string} [raw]
     * @returns {{employeeID: string, roles: number[]}|null}
     * @public
     */
    parseTestUserCookie( raw ) {
        if ( !raw ) {
            return null;
        }
        try {
            const parsed = JSON.parse( decodeURIComponent( raw ) );
            if ( parsed && parsed.employeeID ) {
                return {
                    employeeID: String( parsed.employeeID ),
                    roles: Array.isArray( parsed.roles ) ? parsed.roles.map( ( role ) => Number( role ) ).filter( ( role ) => Number.isFinite( role ) ) : []
                };
            }
        } catch {
            // A malformed cookie is treated as absent.
        }
        return null;
    }

    /**
     * Decides which employee an authenticated identity acts as. Precedence: the dev cookie (only when explicitly
     * enabled), then the email identity, then the admin exception, then refusal. Pure.
     *
     * @method
     * @param {IdentityFacts} facts
     * @returns {IdentityOutcome}
     * @public
     */
    resolve( facts ) {
        const context = facts || {};
        const lookupByEmail = context.lookupByEmail || ( () => null );
        const employeeExists = context.employeeExists || ( () => false );

        // 1. The dev test-user cookie, honored only behind the explicit flag. Identity is overridden wholesale, so the
        //    only check is that the employee exists — employment status is deliberately not enforced here, keeping a
        //    terminated employee testable locally.
        if ( context.testUserEnabled === true ) {
            const selection = this.parseTestUserCookie( context.testUserCookie );
            if ( selection ) {
                return employeeExists( selection.employeeID )
                    ? this.#admit( selection.employeeID, selection.roles.length > 0 ? selection.roles : null )
                    : this.#refuse( REFUSAL_REASON.NO_RECORD, context.isAdmin === true );
            }
        }

        // 2. The authenticated email.
        const email = String( context.email == null ? "" : context.email ).trim().toLowerCase();
        if ( !email ) {
            return this.#refuse( REFUSAL_REASON.NO_EMAIL, context.isAdmin === true );
        }

        const record = lookupByEmail( email );
        if ( !record ) {
            return this.#refuse( REFUSAL_REASON.NO_RECORD, context.isAdmin === true );
        }
        if ( record.ambiguous === true ) {
            return this.#refuse( REFUSAL_REASON.AMBIGUOUS_EMAIL, context.isAdmin === true );
        }
        if ( !LOGIN_PERMITTED_STATUSES.includes( record.employmentStatus ) ) {
            return this.#refuse( REFUSAL_REASON.TERMINATED, context.isAdmin === true );
        }

        return this.#admit( record.employeeID, null );
    }

    /**
     * Applies a resolved outcome to the session, or throws when the outcome is a refusal. Throwing is the framework's
     * documented way for an application to refuse a login (see `TiWebServer#augmentSession`): the session is destroyed
     * and the browser is redirected to the login page carrying the error code.
     *
     * @method
     * @param {Object} session
     * @param {IdentityOutcome} outcome
     * @param {function(string): number[]} resolveRoles
     * @returns {Object} The session, for chaining.
     * @public
     */
    applyIdentity( session, outcome, resolveRoles ) {
        if ( outcome.reason ) {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { reason: outcome.reason }, exceptions.httpCode.C_401 );
        }

        if ( outcome.adminOnly === true ) {
            // An admin with no employee record has no appraisal identity: no employeeID and no application roles. The
            // framework's `applyAdminRole` adds the string `admin` role immediately after this returns.
            session.user.employeeID = null;
            session.user.roles = [];
            return session;
        }

        session.user.employeeID = outcome.employeeID;
        session.user.roles = outcome.overrideRoles || resolveRoles( outcome.employeeID );
        return session;
    }

    /* Private interface */

    /**
     * @method
     * @param {string} employeeID
     * @param {number[]|null} overrideRoles
     * @returns {IdentityOutcome}
     * @private
     */
    #admit( employeeID, overrideRoles ) {
        return { employeeID: employeeID, overrideRoles: overrideRoles, adminOnly: false, reason: null };
    }

    /**
     * Turns a refusal into the admin exception when the identity is on the allowlist. The exception covers every
     * reason, not only a missing record: the recovery path it protects is worth least exactly when the employee data
     * is in a bad state.
     *
     * @method
     * @param {string} reason
     * @param {boolean} isAdmin
     * @returns {IdentityOutcome}
     * @private
     */
    #refuse( reason, isAdmin ) {
        if ( isAdmin === true ) {
            return { employeeID: null, overrideRoles: null, adminOnly: true, reason: null };
        }
        return { employeeID: null, overrideRoles: null, adminOnly: false, reason: reason };
    }

}

const instance = new IdentityResolver();
module.exports.instance = Object.freeze( instance );
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test packages/competence/test/identity-resolver.test.js
```

Expected: PASS, 25 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/application/identity-resolver.js packages/competence/package.json packages/competence/test/identity-resolver.test.js
git commit -m "feat(competence): add the pure identity resolver for login-derived identity (CA-95)"
```

---

## Task 6: Email index on the organization chart

**Files:**
- Modify: `packages/competence/application/organization-manager.js` (add `#emailIndex`, populate it in `buildOrganizationChart`, add two public methods)
- Test: `packages/competence/test/organization-email-index.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, on `require( "#organization-manager" ).instance`:
  - `resolveEmployeeIDByEmail( email: string ) → { employeeID: string, employmentStatus: string } | { ambiguous: true } | null`
  - `hasEmployee( employeeID: string ) → boolean`

  These are exactly the two functions Task 7 injects into `identityResolver.resolve` as `lookupByEmail` and `employeeExists`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/organization-email-index.test.js`:

```js
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const organizationManager = require( "#organization-manager" );

// Employees whose emails exercise the index: a plain match, a mixed-case match, a duplicate pair, and one with no
// email at all. organizationUnitID is left null — the index is built from the employee records themselves, and an
// employee with no unit simply gets no membership edge, which does not affect these assertions.
const TEST_EMPLOYEES = [
    { employeeID: "901", email: "Ada@Example.com", employmentStatus: "active", personal: { firstName: "Ada", lastName: "L" }, career: { organizationUnitID: null } },
    { employeeID: "902", email: "grace@example.com", employmentStatus: "on-leave", personal: { firstName: "Grace", lastName: "H" }, career: { organizationUnitID: null } },
    { employeeID: "903", email: "twins@example.com", employmentStatus: "active", personal: { firstName: "Twin", lastName: "One" }, career: { organizationUnitID: null } },
    { employeeID: "904", email: "twins@example.com", employmentStatus: "active", personal: { firstName: "Twin", lastName: "Two" }, career: { organizationUnitID: null } },
    { employeeID: "905", employmentStatus: "active", personal: { firstName: "No", lastName: "Email" }, career: { organizationUnitID: null } }
];

describe( "organizationManager email index", () => {

    before( async () => {
        // Seed the store through the in-memory cache stub, then build the chart from it. This is the established
        // pattern in the other organization-* suites. Do NOT try to replace `dataManager.instance.fetchEmployees`:
        // the singleton is exported frozen, so assigning a new own property silently no-ops and the real store read
        // would run instead.
        const stub = installInMemoryCache();
        const employeeMap = {};
        TEST_EMPLOYEES.forEach( ( employee ) => {
            employeeMap[ employee.employeeID ] = employee;
        } );
        await stub.setJSON( "ti:competence:data:employees", employeeMap );
        await organizationManager.instance.buildOrganizationChart();
    } );

    it( "resolves an employee by their exact email", () => {
        assert.deepEqual( organizationManager.instance.resolveEmployeeIDByEmail( "grace@example.com" ), {
            employeeID: "902",
            employmentStatus: "on-leave"
        } );
    } );

    it( "matches case-insensitively and ignores surrounding whitespace", () => {
        const result = organizationManager.instance.resolveEmployeeIDByEmail( "  ada@EXAMPLE.com " );
        assert.equal( result.employeeID, "901" );
    } );

    it( "reports a duplicated email as ambiguous instead of picking one", () => {
        assert.deepEqual( organizationManager.instance.resolveEmployeeIDByEmail( "twins@example.com" ), { ambiguous: true } );
    } );

    it( "returns null for an unknown email", () => {
        assert.equal( organizationManager.instance.resolveEmployeeIDByEmail( "nobody@example.com" ), null );
    } );

    it( "returns null for an empty or missing email", () => {
        assert.equal( organizationManager.instance.resolveEmployeeIDByEmail( "" ), null );
        assert.equal( organizationManager.instance.resolveEmployeeIDByEmail( undefined ), null );
    } );

    it( "knows which employees exist", () => {
        assert.equal( organizationManager.instance.hasEmployee( "901" ), true );
        assert.equal( organizationManager.instance.hasEmployee( "905" ), true, "an employee with no email still exists" );
        assert.equal( organizationManager.instance.hasEmployee( "999" ), false );
        assert.equal( organizationManager.instance.hasEmployee( "" ), false );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/competence/test/organization-email-index.test.js
```

Expected: FAIL — `organizationManager.instance.resolveEmployeeIDByEmail is not a function`.

- [ ] **Step 3: Add the logger import**

At the top of `packages/competence/application/organization-manager.js`, add the logger to the existing require block (it currently imports `exceptions`, `localization`, `configurationLoader`, `dataManager`, `roleResolver`, `graphology`):

```js
const logger = require( "@ti-engine/core/logger" );
```

- [ ] **Step 4: Add the index field**

Directly below `#organizationChart = null;` (line 27), add:

```js
    // Email -> { employeeID, employmentStatus } | { ambiguous: true }, rebuilt with the chart. Backs the synchronous
    // login-time identity lookup, which cannot await a store read (augmentSession runs inside a sync session callback).
    #emailIndex = new Map();
```

- [ ] **Step 5: Populate the index during the chart build**

In `buildOrganizationChart`, replace the single line `this.#organizationChart = graph;` (line 157) with:

```js
                this.#organizationChart = graph;
                this.#emailIndex = this.#buildEmailIndex( employees );
```

- [ ] **Step 6: Add the private builder and the two public methods**

Add the builder to the private section of the class, next to `#managedUnitIDs`:

```js
    /**
     * Builds the email -> employee index. A duplicated email is recorded as ambiguous rather than resolved, and is
     * reported once here at build time so an operator learns about the bad data at deploy rather than from one user's
     * failed login.
     *
     * @method
     * @param {Array<Object>} employees
     * @returns {Map<string, Object>}
     * @private
     */
    #buildEmailIndex( employees ) {
        const index = new Map();
        const duplicates = new Map();

        ( Array.isArray( employees ) ? employees : [] ).forEach( ( employee ) => {
            const employeeID = employee?.employeeID;
            const email = String( employee?.email == null ? "" : employee.email ).trim().toLowerCase();
            if ( !employeeID || !email ) {
                return;
            }

            const existing = index.get( email );
            if ( existing ) {
                const collided = duplicates.get( email ) || [ existing.employeeID ];
                collided.push( employeeID );
                duplicates.set( email, collided );
                index.set( email, { ambiguous: true } );
                return;
            }

            index.set( email, { employeeID: employeeID, employmentStatus: employee.employmentStatus || "active" } );
        } );

        duplicates.forEach( ( employeeIDs, email ) => {
            logger.log(
                `Employee email '${ email }' is shared by ${ employeeIDs.length } records (${ employeeIDs.join( ", " ) }). Sign-in with this address will be refused as ambiguous until the duplication is resolved.`,
                logger.logSeverity.WARNING
            );
        } );

        return index;
    }
```

Add the two public methods to the public section, directly after `isAutoSupervisor` (which currently ends at line 553):

```js
    /**
     * Resolves an authenticated email to the acting employee. Synchronous by design — login-time identity resolution
     * runs inside a synchronous session callback, so it reads the in-memory index rather than the store.
     *
     * @method
     * @param {string} email
     * @returns {{employeeID: string, employmentStatus: string}|{ambiguous: boolean}|null}
     * @public
     */
    resolveEmployeeIDByEmail( email ) {
        const normalized = String( email == null ? "" : email ).trim().toLowerCase();
        if ( !normalized ) {
            return null;
        }
        return this.#emailIndex.get( normalized ) || null;
    }

    /**
     * Whether an employee node exists in the current organization chart.
     *
     * @method
     * @param {string} employeeID
     * @returns {boolean}
     * @public
     */
    hasEmployee( employeeID ) {
        if ( !employeeID || !this.#organizationChart ) {
            return false;
        }
        return this.#organizationChart.hasNode( this.toEmployeeNodeID( employeeID ) );
    }
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
node --test packages/competence/test/organization-email-index.test.js
```

Expected: PASS, 6 tests. A WARNING line about `twins@example.com` in the output is the duplicate detection working.

- [ ] **Step 8: Run the whole competence suite for regressions**

```bash
npm test -w @ti-engine/competence
```

Expected: all suites pass. The other `organization-*` suites build the chart too — confirm none of them broke.

- [ ] **Step 9: Commit**

```bash
git add packages/competence/application/organization-manager.js packages/competence/test/organization-email-index.test.js
git commit -m "feat(competence): index employee emails on the org chart for login identity lookup (CA-95)"
```

---

## Task 7: Rewrite augmentSession

**Files:**
- Modify: `packages/competence/bin/competence-web-server.js:93-165` (`augmentSession`, and delete `#readTestUserSelection`)

**Interfaces:**
- Consumes: `identityResolver.instance.resolve` / `.applyIdentity` (Task 5), `organizationManager.instance.resolveEmployeeIDByEmail` / `.hasEmployee` (Task 6), the framework refusal contract (Tasks 1, 2, 4).
- Produces: nothing further.

**Why:** this is the task that deletes the `|| "20"` fallback. Everything before it was groundwork.

- [ ] **Step 1: Add the required imports**

In `packages/competence/bin/competence-web-server.js`, add to the existing require block (which already provides `logger`, `exceptions`, `tools`, `organizationManager` and `roleResolver`):

```js
const authorization = require( "@ti-engine/web-framework/authorization" );
const identityResolver = require( "#identity-resolver" );
```

The `./authorization` subpath was added to web-framework's `exports` in Task 4 Step 3 — if that step was skipped this require throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Confirm it resolves before continuing:

```bash
node -e "console.log(typeof require('@ti-engine/web-framework/authorization').isAdminIdentity)"
```

Expected: `function`.

- [ ] **Step 2: Replace `augmentSession`**

Replace the whole `augmentSession` method (lines 93-108) with:

```js
    /**
     * Used to augment the session with the acting employee identity and their derived roles.
     * <br/>
     * Identity comes from the email the user authenticated with, resolved against the employee directory. An identity
     * with no usable employee record is REFUSED — throwing refuses the login per the framework's documented
     * `augmentSession` contract, which destroys the session and returns the browser to the login page. The one
     * exception is an identity on the deployment's admin allowlist, which is admitted with no employeeID and no
     * application roles so the admin configuration UI stays reachable when the employee data itself is wrong.
     * <br/>
     * The dev `ti-test-user` cookie still overrides identity, but only behind the off-by-default
     * `COMPETENCE_TEST_USER_ENABLED` flag (see {@link IdentityResolver#resolve}).
     *
     * @method
     * @override
     * @param {TiSession} session
     * @param {Object} [request] Express request used to read the dev test-user selection (cookie).
     * @returns {TiSession}
     * @public
     */
    augmentSession( session, request ) {
        if ( !session.user ) {
            return session;
        }

        const outcome = identityResolver.instance.resolve( {
            email: session.user.email,
            testUserCookie: request && request.cookies && request.cookies[ "ti-test-user" ],
            testUserEnabled: tools.toBool( process.env.COMPETENCE_TEST_USER_ENABLED ),
            isAdmin: authorization.isAdminIdentity( session.user, this.serviceConfig?.auth?.admins ),
            lookupByEmail: ( email ) => organizationManager.instance.resolveEmployeeIDByEmail( email ),
            employeeExists: ( employeeID ) => organizationManager.instance.hasEmployee( employeeID )
        } );

        if ( outcome.reason ) {
            logger.log( `Refusing sign-in for '${ session.user.email || session.user.userID }': ${ outcome.reason }.`, logger.logSeverity.WARNING );
        }

        return identityResolver.instance.applyIdentity( session, outcome, ( employeeID ) => this.#resolveUserRoles( employeeID ) );
    }
```

- [ ] **Step 3: Delete the superseded private method**

Delete `#readTestUserSelection` entirely (lines 130-165 in the original file, including its JSDoc block). Its parsing now lives in `identityResolver.parseTestUserCookie`. Keep `#resolveUserRoles` exactly as it is.

- [ ] **Step 4: Verify the fallback is gone**

```bash
grep -n '"20"' packages/competence/bin/competence-web-server.js
```

Expected: **no output**. Any match means the fallback survived.

- [ ] **Step 5: Verify the imports are all still used**

```bash
npm run lint
```

Expected: clean. If `exceptions` or another import became unused after deleting `#readTestUserSelection`, remove it.

- [ ] **Step 6: Run the whole competence suite**

```bash
npm test -w @ti-engine/competence
```

Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/bin/competence-web-server.js
git commit -m "feat(competence)!: derive login identity from the authenticated email, refusing unknown identities (CA-95)"
```

---

## Task 8: Documentation and the competence 3.19.0 release

**Files:**
- Modify: `packages/competence/INSTALL.md`
- Modify: `packages/competence/README.md`
- Modify: `packages/competence/package.json:3`
- Modify: `packages/competence/CHANGELOG.md`

- [ ] **Step 1: Document the operational requirement in INSTALL.md**

In `packages/competence/INSTALL.md`, add a subsection to the identity/auth area (near the existing `COMPETENCE_TEST_USER_ENABLED` guidance around line 17 and the env table around line 145):

```markdown
### Employee identity and sign-in

The acting employee is resolved from the email the user signs in with, matched against the `email` field of their
employee record. **Employee emails must match the addresses your identity provider issues** — an authenticated user
with no matching record cannot sign in, and sees a generic "we couldn't sign you in" message.

Sign-in is refused when:

- no employee record carries that email;
- the matching record's `employmentStatus` is anything other than `active` or `on-leave`;
- two or more employee records share the email (the app refuses rather than guessing; the duplicate is also logged as
  a `WARNING` at startup).

**Recovery.** An identity listed in `TI_WEB_AUTH_ADMINS` (or `auth.admins`) may sign in *without* an employee record.
That session has no employee identity and no application roles — it reaches only the administration screens — and
exists so a deployment with wrong or missing employee data can still be fixed through the admin UI. Set at least one
admin before enabling SSO.
```

- [ ] **Step 2: Update the README env table**

In `packages/competence/README.md`, in the row for `COMPETENCE_TEST_USER_ENABLED` (around line 1074), append to the description:

```
When `false` (the default), identity is derived from the authenticated login's email instead.
```

- [ ] **Step 3: Bump the version**

In `packages/competence/package.json`, change `"version": "3.17.0"` to `"version": "3.19.0"`.

`3.18.0` is deliberately skipped: CA-99 took it on `current` while this branch was in flight. This branch does not
carry that release, so the file reads `3.17.0` here — but the merged result must be `3.19.0`, which is why the jump
looks like two steps.

- [ ] **Step 4: Add the changelog section**

At the top of `packages/competence/CHANGELOG.md`, directly below the intro paragraph and above `## Version 3.17.0`
(after the merge, CA-99's `## Version 3.18.0` section will sit between them):

```markdown
## Version 3.19.0

Identity now comes from the login. Until now `augmentSession` fell back to a hard-coded `"20"` whenever the dev
test-user cookie was disabled — and because the framework's user model carries no `employeeID`, that fallback was
reached by *every* user on any deployment with the cookie off. On the Azure-SSO staging environment everyone signed in
as employee 20, inheriting that employee's manager scope over their team. Identity is now resolved from the
authenticated email against the employee directory, and an identity that cannot be resolved is refused rather than
substituted (CA-95).

* feat(competence)!: derive the acting employee from the authenticated login's email and **remove the employee-20
  fallback**. An authenticated identity with no employee record, with an `employmentStatus` other than `active` or
  `on-leave`, or whose email is shared by more than one record, is refused — no code path may invent an identity
* feat(competence): add `application/identity-resolver.js`, a pure frozen-singleton owning every identity rule — dev
  cookie parsing, the resolve precedence, the four refusal reasons, and applying an outcome to a session
* feat(organization): index employee emails on the organization chart, with `resolveEmployeeIDByEmail` and
  `hasEmployee` for synchronous login-time lookup. A duplicated email is reported once at startup as a `WARNING` and
  refuses sign-in as ambiguous rather than resolving to an arbitrary record
* feat(competence): admit an identity on the admin allowlist that has no employee record, with no `employeeID` and no
  application roles, so the administration UI stays reachable when the employee data itself needs fixing
* docs(competence): document in `INSTALL.md` that employee emails must match the identity provider's, what causes a
  refused sign-in, and the admin allowlist as the recovery path
* build(release): bump package version from `3.18.0` to `3.19.0`
```

Note the `!` on the first entry: existing deployments relying on the implicit employee-20 identity will stop working, which is the point.

- [ ] **Step 5: Run everything**

```bash
npm test
```

Expected: all workspace suites pass.

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/INSTALL.md packages/competence/README.md packages/competence/package.json packages/competence/CHANGELOG.md
git commit -m "docs(competence): document login identity resolution; release 3.18.0 (CA-95)"
```

---

## Manual verification (after Task 8)

The unit tests cover the decision logic; these steps confirm the wiring end-to-end. Run the dev stack:

```bash
docker compose up --build
```

- [ ] **Dev cookie still works.** The compose stack sets `COMPETENCE_TEST_USER_ENABLED=true`. At `http://localhost:3000`, pick each test-user pill and confirm the app opens as that employee with the expected roles — the behavior that worked before this change must be unchanged.
- [ ] **Email identity resolves.** Stop the stack, set `COMPETENCE_TEST_USER_ENABLED=false` in `docker-compose.yml`, restart, and sign in with local auth as a user whose email matches a seeded employee. Confirm the app opens as *that* employee, not employee 20.
- [ ] **An unknown identity is refused.** Sign in with credentials whose email matches no employee. Confirm: the login page reappears with the error message visible, the URL carries `?error=`, the server log shows the specific reason, and — critically — no session was created (navigating to `/` returns the login page, not the dashboard).
- [ ] **The admin exception works.** Set `TI_WEB_AUTH_ADMINS` to an identity with no employee record, sign in, and confirm the administration screens are reachable while the appraisal screens are not.

Use the Browser pane rather than manual clicking where possible; note that coordinate clicks on this app are unreliable — drive interactions with `javascript_tool` `element.click()`.

---

## Self-Review Notes

- **Spec coverage.** §4.1(a)→Task 1, §4.1(b)→Task 4, §4.1(c)→Task 3, §4.1(d)→Task 2, §4.1(e)→Task 4 Step 3, §4.2(a)→Task 5, §4.2(b)→Task 6, §4.2(c)→Task 7, §6.3 (no core change) held throughout — no task touches `packages/core`, §7 copy→Task 3 Step 3, §8 type declarations→Task 4 Step 4, §10 docs→Tasks 4 and 8.
- **Three conditional steps were resolved against the codebase rather than left to the implementer:** the label shape is `{ en, bg }` like its neighbours; `./authorization` is genuinely unexported, so adding it became a real step in Task 4; and `.ti-login-error` is already `display: none`, which rules out `x-show` entirely — Task 3 uses the class-toggle pattern instead, with a test asserting the reveal rule exists.
- **§6.4 open item.** The spec requires confirming no screen dereferences `employeeID` before checking roles. This is covered by the last manual verification step rather than a unit test, because it is a property of the whole screen set, not of one module.
- **Type consistency.** `resolveEmployeeIDByEmail` and `hasEmployee` (Task 6) are named identically where Task 7 injects them as `lookupByEmail` and `employeeExists`; the outcome shape `{ employeeID, overrideRoles, adminOnly, reason }` is identical in Task 5's implementation, its tests, and Task 7's consumption.
