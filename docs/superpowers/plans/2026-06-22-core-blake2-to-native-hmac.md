# Replace blake2 with native HMAC-SHA256 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `blake2` native addon from `@ti-engine/core` and compute the message-integrity MAC with Node's built-in `node:crypto` (HMAC-SHA256), adding a constant-time comparison, an empty-default hash key with a startup warning, and the first test suite in `core`.

**Architecture:** `MessageHandler.createMessageHash()` is the single consumer of `blake2`. Swap its keyed-BLAKE2b call for `crypto.createHmac("sha256", …)` — the canonical-serialization input (`tools.decycle` → `tools.decomposeJSON`) and hex output are unchanged. Verification moves from a plain `===` to a new pure `tools.constantTimeEquals` helper. The shipped default key becomes `""` with a one-time warning when the hash runs without a real key.

**Tech Stack:** Node.js ≥20 (running v26), CommonJS, `node:crypto` (built-in), `node --test` runner. No new dependencies; one dependency removed.

## Global Constraints

- **CommonJS only** — `require()` / `module.exports`. No ESM.
- **Internal imports use the `#alias` map** from `packages/core/package.json` `imports` (e.g. `#tools`, `#config`, `#logger`), not relative paths — in production code. (Test files use relative `../…` requires.)
- **`require("node:crypto")`** — use the `node:` prefix (matches `utils/tools.js:10`, `web-framework`).
- **Node `>=20`**; the dev/runtime here is Node v26 (where `blake2` will not build).
- **Conventional Commits, scoped to the package**; breaking changes carry `!`. Bump `packages/core/package.json` version **and** `CHANGELOG.md` together.
- **Never commit `.run/*.run.xml`** (live local credentials).
- **`deepFreeze` on config** — settings are immutable after load; do not mutate them.
- **Do not change `tools.decomposeJSON` / `tools.decycle`** — altering the MAC input is out of scope and would change hashes for an unrelated reason.
- The MAC is **ephemeral** (only on the in-flight Redis envelope). No persisted-data migration. Cross-version interop is a clean swap (documented), not a runtime concern.

---

### Task 1: Bootstrap a runnable test environment

The workspace has **no `node_modules`**, and a normal `npm install` would try to compile `blake2` (fails on Node 26). Install with build scripts skipped so the pure-JS deps (lodash, etc.) are present and the test runner can load `core` modules. This task changes no tracked files — it produces no commit.

**Files:** none (installs into git-ignored `node_modules/`).

- [ ] **Step 1: Install workspace dependencies without running build scripts**

Run (from repo root `C:\Users\b.kostadinov\WebstormProjects\ti-engine`):
```bash
npm install --ignore-scripts
```
Expected: completes without a node-gyp/MSBuild error; `node_modules/` is created. (`blake2` downloads but is left unbuilt — fine, nothing in this plan requires it.)

- [ ] **Step 2: Verify lodash resolves and the test runner works**

Run:
```bash
node -e "require('lodash'); console.log('lodash ok')"
( cd packages/core && node --test ) 2>&1 | tail -n 3
```
Expected: prints `lodash ok`; the `node --test` call reports no test files yet (e.g. "tests 0") and exits cleanly. (No commit — `node_modules` is git-ignored.)

---

### Task 2: Add `tools.constantTimeEquals` (pure, constant-time string compare)

A reusable, never-throws comparison mirroring the audited `web-framework/components/web-handlers.js` idiom, using **utf8** encoding. This is the verification primitive used in Task 4.

**Files:**
- Modify: `packages/core/utils/tools.js` (insert after `decomposeJSON`, which ends at line 500, before the `RetryPolicy` class at line 502)
- Modify: `packages/core/package.json` (add `test` script)
- Test: `packages/core/test/message-hash.test.js` (new)

**Interfaces:**
- Produces: `tools.constantTimeEquals(a: *, b: *) => boolean` — `true` only when both coerce to equal-length, byte-identical utf8 strings; `false` for any non-matching, wrong-length, `null`/`undefined`/number/object input; never throws.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/message-hash.test.js`:
```js
"use strict";

// Set a deterministic key BEFORE requiring core modules (config reads env at load time and freezes).
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = "unit-test-key-0123456789";

const { test } = require( "node:test" );
const assert = require( "node:assert" );
const tools = require( "../utils/tools.js" );

test( "constantTimeEquals: equal non-empty strings are equal", () => {
    assert.strictEqual( tools.constantTimeEquals( "abc123", "abc123" ), true );
} );

test( "constantTimeEquals: different same-length strings are not equal", () => {
    assert.strictEqual( tools.constantTimeEquals( "abc123", "abc124" ), false );
} );

test( "constantTimeEquals: different-length strings are not equal", () => {
    assert.strictEqual( tools.constantTimeEquals( "abc", "abcdef" ), false );
} );

test( "constantTimeEquals: hostile/empty inputs return false without throwing", () => {
    // Each second argument differs in length from the coerced first, so all are non-matches.
    assert.strictEqual( tools.constantTimeEquals( undefined, "x" ), false ); // "" (0) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( null, "x" ), false );      // "" (0) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( 123, "x" ), false );       // "123" (3) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( {}, "x" ), false );        // "[object Object]" (15) vs "x" (1)
    assert.strictEqual( tools.constantTimeEquals( "", "x" ), false );        // "" (0) vs "x" (1)
    assert.doesNotThrow( () => tools.constantTimeEquals( { a: 1 }, [ 1, 2 ] ) );
} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test packages/core/test/message-hash.test.js
```
Expected: FAIL — `tools.constantTimeEquals is not a function`.

- [ ] **Step 3: Implement the helper**

In `packages/core/utils/tools.js`, insert immediately after the `decomposeJSON` export (after the closing `};` on line 500, before the `/** … RetryPolicy */` block):
```js
/**
 * Constant-time string comparison. Mirrors the web-framework safe-compare idiom: coerces inputs to
 * utf8 buffers, short-circuits on length mismatch, and never throws on hostile/non-string input.
 *
 * @method
 * @param {*} a
 * @param {*} b
 * @returns {boolean} True only when both inputs coerce to equal-length, byte-identical strings.
 * @public
 */
module.exports.constantTimeEquals = ( a, b ) => {
    try {
        const ba = Buffer.from( String( a || "" ), "utf8" );
        const bb = Buffer.from( String( b || "" ), "utf8" );
        return ( ba.length !== bb.length ) ? false : crypto.timingSafeEqual( ba, bb );
    } catch {
        return false;
    }
};
```
(`crypto` is already imported at `tools.js:10` as `const crypto = require( "node:crypto" );`.)

- [ ] **Step 4: Add the `test` script to core's package.json**

In `packages/core/package.json`, add a `scripts` block (the file currently has none) immediately after the `"exports"` block's closing `},` — i.e. before `"imports": {`:
```json
  "scripts": {
    "test": "node --test"
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
node --test packages/core/test/message-hash.test.js
```
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/utils/tools.js packages/core/package.json packages/core/test/message-hash.test.js
git commit -m "feat(tools): add constant-time string comparison helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Swap `createMessageHash` to native HMAC-SHA256

Replace the `blake2` keyed hash with `node:crypto` HMAC-SHA256 and drop the `blake2` require. This is what lets `message-handler.js` load on Node 26.

**Files:**
- Modify: `packages/core/components/exchange/message-handler.js:11` (require) and `:122-127` (`createMessageHash`)
- Test: `packages/core/test/message-hash.test.js` (extend)

**Interfaces:**
- Consumes: `tools.decycle`, `tools.decomposeJSON`, `config.getSetting`, `config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY`.
- Produces: `MessageHandler.prototype.createMessageHash(message) => string` — 64-char lowercase hex HMAC-SHA256 over `Buffer.from(decomposeJSON(decycle(message)))` keyed with the configured key. Uses no instance state (safe to call via `.call({}, msg)`).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/message-hash.test.js`:
```js
const crypto = require( "node:crypto" );
const MessageHandler = require( "../components/exchange/message-handler.js" );

const TEST_KEY = process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY;
const hashOf = ( msg ) => MessageHandler.prototype.createMessageHash.call( {}, msg );
const expectedHash = ( msg, key ) => {
    const transformed = tools.decomposeJSON( tools.decycle( msg ) );
    return crypto.createHmac( "sha256", Buffer.from( key ) ).update( Buffer.from( transformed ) ).digest( "hex" );
};

const SAMPLE = { messageID: "m-1", type: 1, source: "svc-a", payload: { a: "b", n: 2 } };

test( "createMessageHash: produces a 64-char lowercase hex HMAC-SHA256 matching node:crypto", () => {
    const h = hashOf( SAMPLE );
    assert.match( h, /^[0-9a-f]{64}$/ );
    assert.strictEqual( h, expectedHash( SAMPLE, TEST_KEY ) );
} );

test( "createMessageHash: deterministic for the same message", () => {
    assert.strictEqual( hashOf( SAMPLE ), hashOf( SAMPLE ) );
} );

test( "createMessageHash: key-insertion order does not change the digest", () => {
    const a = { messageID: "m-1", type: 1, source: "svc-a", payload: { a: "b", n: 2 } };
    const b = { payload: { n: 2, a: "b" }, source: "svc-a", type: 1, messageID: "m-1" };
    assert.strictEqual( hashOf( a ), hashOf( b ) );
} );

test( "createMessageHash: mutating any field changes the digest (tamper detection)", () => {
    const tampered = { ...SAMPLE, payload: { a: "b", n: 3 } };
    assert.notStrictEqual( hashOf( SAMPLE ), hashOf( tampered ) );
} );

test( "createMessageHash: digest depends on the key", () => {
    assert.notStrictEqual( hashOf( SAMPLE ), expectedHash( SAMPLE, "a-totally-different-key" ) );
} );

test( "createMessageHash: empty object hashes to a stable value without throwing", () => {
    const h = hashOf( {} );
    assert.match( h, /^[0-9a-f]{64}$/ );
    assert.strictEqual( h, expectedHash( {}, TEST_KEY ) );
} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test packages/core/test/message-hash.test.js
```
Expected: FAIL — loading `message-handler.js` errors with `Cannot find module 'blake2'` (the addon is present but unbuilt / not a usable binding), so the new `createMessageHash` tests cannot run.

- [ ] **Step 3: Replace the require**

In `packages/core/components/exchange/message-handler.js`, change line 11 from:
```js
const blake2 = require( "blake2" );
```
to:
```js
const crypto = require( "node:crypto" );
```

- [ ] **Step 4: Rewrite `createMessageHash`**

Replace the method body (lines 122-127) so it reads:
```js
    createMessageHash( message ) {
        let transformed = tools.decomposeJSON( tools.decycle( message ) );
        let hmac = crypto.createHmac( "sha256", Buffer.from( config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY ) ) );
        hmac.update( Buffer.from( transformed ) );
        return hmac.digest( "hex" );
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
node --test packages/core/test/message-hash.test.js
```
Expected: PASS — all tests (4 from Task 2 + 6 new) pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/components/exchange/message-handler.js packages/core/test/message-hash.test.js
git commit -m "refactor(exchange)!: replace blake2 keyed hash with node:crypto HMAC-SHA256

The message-integrity MAC now uses the built-in node:crypto HMAC-SHA256
instead of the blake2 native addon (which does not build on Node 26).
Ephemeral wire hash only; see CHANGELOG for the clean-swap note.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Use the constant-time comparison in `#postReceive`

Replace the plain `===` hash check with `tools.constantTimeEquals`, preserving the fail-closed-on-missing-hash behavior and the exception detail.

**Files:**
- Modify: `packages/core/components/exchange/message-receiver.js` (add `#tools` import at top; change the comparison in `#postReceive`, lines ~164)

**Interfaces:**
- Consumes: `tools.constantTimeEquals` (Task 2), `this.createMessageHash` (Task 3).

- [ ] **Step 1: Add the `#tools` import**

In `packages/core/components/exchange/message-receiver.js`, after line 12 (`const config = require( "#config" );`) add:
```js
const tools = require( "#tools" );
```

- [ ] **Step 2: Replace the comparison**

In `#postReceive`, change:
```js
                if ( receivedHash && receivedHash === currentHash ) {
```
to:
```js
                if ( tools.constantTimeEquals( receivedHash, currentHash ) ) {
```
(Leave the surrounding `let receivedHash = message.hash; delete message.hash; let currentHash = this.createMessageHash( message );` and the `reject( … E_SEC_MESSAGE_TAMPERING_DETECTED … )` block unchanged. A missing `receivedHash` still fails closed: `String(undefined || "")` → `""`, length 0 ≠ 64 → `false` → reject.)

- [ ] **Step 3: Verify the old comparison is gone and the suite is green**

Run:
```bash
grep -rn "receivedHash === currentHash" packages/core || echo "old comparison removed"
( cd packages/core && node --test )
```
Expected: prints `old comparison removed`; all tests pass.

- [ ] **Step 4: Lint the changed files**

Run (from repo root):
```bash
npx eslint packages/core/components/exchange/message-receiver.js packages/core/utils/tools.js packages/core/components/exchange/message-handler.js
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/components/exchange/message-receiver.js
git commit -m "fix(exchange): use a constant-time comparison for the message security hash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Empty default `securityHashKey` + one-time startup warning

Stop shipping a usable default MAC key; warn once when the hash runs with a missing or known-default key.

**Files:**
- Modify: `packages/core/bin/settings.json:29` (default key → `""`)
- Modify: `packages/core/components/exchange/message-handler.js` (module-level guard + warning inside `createMessageHash`)
- Test: `packages/core/test/security-hash-key-warning.test.js` (new — own file so the module-level guard is fresh in its own process)
- Test: `packages/core/test/message-hash.test.js` (add a "does not warn with a good key" assertion)

**Interfaces:**
- Consumes: `logger.log`, `logger.logSeverity.WARNING` (already imported in `message-handler.js`), `config.getSetting`.

- [ ] **Step 1: Write the failing warning test**

Create `packages/core/test/security-hash-key-warning.test.js`:
```js
"use strict";

// Empty key BEFORE requiring core modules so config resolves an empty securityHashKey.
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = "";

const { test } = require( "node:test" );
const assert = require( "node:assert" );
const logger = require( "../utils/logger.js" );

// Capture warnings emitted via logger.log.
const warnings = [];
const originalLog = logger.log;
logger.log = ( message, severity ) => { warnings.push( { message, severity } ); };

const MessageHandler = require( "../components/exchange/message-handler.js" );
const hashOf = ( msg ) => MessageHandler.prototype.createMessageHash.call( {}, msg );

test( "warns exactly once when the security hash runs with an empty/default key", () => {
    hashOf( { messageID: "m-1" } );
    hashOf( { messageID: "m-2" } ); // second call must NOT warn again
    const keyWarnings = warnings.filter( ( w ) => w.severity === logger.logSeverity.WARNING && /security hash/i.test( w.message ) );
    assert.strictEqual( keyWarnings.length, 1 );
    logger.log = originalLog;
} );
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
node --test packages/core/test/security-hash-key-warning.test.js
```
Expected: FAIL — `keyWarnings.length` is `0` (no warning implemented yet).

- [ ] **Step 3: Change the shipped default key**

In `packages/core/bin/settings.json`, change line 29 from:
```json
    "securityHashKey": "23e7bdc7-a793-41f9-856e-6760332f0c73",
```
to:
```json
    "securityHashKey": "",
```

- [ ] **Step 4: Add the module-level guard and the warning**

In `packages/core/components/exchange/message-handler.js`, after the `require` block (after line 15, `const config = require( "#config" );`) add:
```js
const OLD_DEFAULT_HASH_KEY = "23e7bdc7-a793-41f9-856e-6760332f0c73";
let keyWarningEmitted = false;
```
Then update `createMessageHash` (from Task 3) so it resolves the key once, warns once, then hashes:
```js
    createMessageHash( message ) {
        let key = config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY );
        if ( keyWarningEmitted === false ) {
            keyWarningEmitted = true;
            if ( !key || key === OLD_DEFAULT_HASH_KEY ) {
                logger.log( "Message-exchange security hash is enabled but no private key is set ('securityHashKey' is missing or the published default). Set TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY to a private value, otherwise tamper protection is ineffective.", logger.logSeverity.WARNING );
            }
        }
        let transformed = tools.decomposeJSON( tools.decycle( message ) );
        let hmac = crypto.createHmac( "sha256", Buffer.from( key ) );
        hmac.update( Buffer.from( transformed ) );
        return hmac.digest( "hex" );
    }
```

- [ ] **Step 5: Run the warning test to verify it passes**

Run:
```bash
node --test packages/core/test/security-hash-key-warning.test.js
```
Expected: PASS — exactly one warning recorded.

- [ ] **Step 6: Add a "does not warn with a good key" assertion**

In `packages/core/test/message-hash.test.js`, add a logger capture at the top (immediately after `const tools = require( "../utils/tools.js" );`):
```js
const logger = require( "../utils/logger.js" );
const seenWarnings = [];
const originalLog = logger.log;
logger.log = ( message, severity ) => { seenWarnings.push( { message, severity } ); };
```
and add this test (it relies on the good `TEST_KEY` set at the top of the file):
```js
test( "createMessageHash: does NOT warn when a non-default key is configured", () => {
    hashOf( SAMPLE );
    const keyWarnings = seenWarnings.filter( ( w ) => /security hash/i.test( w.message ) );
    assert.strictEqual( keyWarnings.length, 0 );
    logger.log = originalLog;
} );
```

- [ ] **Step 7: Run the full suite**

Run:
```bash
( cd packages/core && node --test )
```
Expected: PASS — all files green (`message-hash.test.js` and `security-hash-key-warning.test.js`).

- [ ] **Step 8: Commit**

```bash
git add packages/core/bin/settings.json packages/core/components/exchange/message-handler.js packages/core/test/message-hash.test.js packages/core/test/security-hash-key-warning.test.js
git commit -m "fix(exchange): empty default securityHashKey and warn on missing/default key

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Remove the blake2 dependency + version bump + CHANGELOG

Delete the now-unused dependency from both manifests, bump the version, and prove a clean install works without the native addon.

**Files:**
- Modify: `packages/core/package.json` (remove `blake2` dep; version `1.5.1` → `1.6.0`)
- Modify: `package.json` (root — remove `blake2@5.0.1` from `allowScripts`)
- Modify: `packages/core/CHANGELOG.md` (prepend `1.6.0` entry)

- [ ] **Step 1: Remove blake2 from core dependencies**

In `packages/core/package.json`, delete this line from `dependencies`:
```json
    "blake2": "^5.0.1",
```

- [ ] **Step 2: Bump the core version**

In `packages/core/package.json`, change:
```json
  "version": "1.5.1",
```
to:
```json
  "version": "1.6.0",
```

- [ ] **Step 3: Remove blake2 from the root allowScripts block**

In the root `package.json`, delete this line from `allowScripts` (keep `zeromq@6.5.0`):
```json
    "blake2@5.0.1": true,
```

- [ ] **Step 4: Prepend the CHANGELOG entry**

In `packages/core/CHANGELOG.md`, insert immediately after line 4 (the intro paragraph), before `## Version 1.5.1`:
```markdown
## Version 1.6.0

* refactor(exchange)!: replace the blake2 keyed hash with native `node:crypto` HMAC-SHA256 in the message integrity check
* build(deps)!: remove the `blake2` native addon dependency (no longer builds on Node 26; replaced by the built-in `node:crypto`)
* fix(exchange): use a constant-time comparison for the message security hash
* fix(exchange): ship an empty default `securityHashKey` and warn (once) when the security hash is enabled with a missing/default key
* test(exchange): add the first core test suite — message-hash determinism, tamper detection, and the constant-time comparison

> **BREAKING (wire):** the message security hash changes from keyed-BLAKE2b (128 hex) to HMAC-SHA256 (64 hex). Old and new core versions produce mutually incompatible hashes. When upgrading across this version with `securityHashEnabled=true`, redeploy all services together — recommended order: set `securityHashEnabled=false` everywhere → deploy the new core to all services → re-enable. HMAC also accepts keys of any length (custom keys >64 bytes that previously failed under blake2b now work). The default `securityHashKey` is now empty: set `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` in any real deployment, otherwise tamper protection is ineffective.

```

- [ ] **Step 5: Prove a clean install succeeds without blake2**

Run (from repo root):
```bash
rm -rf node_modules
npm install
```
Expected: completes with **no** node-gyp/MSBuild error (blake2 is gone; `zeromq` is optional and its build failure, if any, is non-fatal).

- [ ] **Step 6: Verify blake2 is fully gone and tests pass**

Run:
```bash
npm ls blake2 2>&1 | grep -i blake2 || echo "blake2 not in tree"
grep -rni "blake2" packages/core --include=*.js --include=*.json || echo "no blake2 in core source/manifests"
( cd packages/core && node --test )
```
Expected: `blake2 not in tree`; `no blake2 in core source/manifests`; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/package.json package.json packages/core/CHANGELOG.md
git commit -m "build(deps)!: remove blake2 native addon; bump core to 1.6.0

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Documentation wording

Fix the remaining blake2/“encryption key” references in the docs.

**Files:**
- Modify: `packages/core/README.md:482` and `:487`
- Modify: `.claude/commands/ti-engine.md:85`

- [ ] **Step 1: Update README — hash-enabled description (line 482)**

In `packages/core/README.md`, replace line 482:
```
: This setting controls whether the message exchange will use a control hash mechanism to ensure there is no tampering with the messages in between service calls. In most cases you would want to keep this enabled since it ensures the integrity of your data. If you are concerned about performance (hashing with `blake2` is rapid, but it still eats some milliseconds) you might want to try and disable this to see if it makes any notable difference.
```
with:
```
: This setting controls whether the message exchange will use a control hash mechanism to ensure there is no tampering with the messages in between service calls. In most cases you would want to keep this enabled since it ensures the integrity of your data. If you are concerned about performance (the keyed `HMAC-SHA256` hash is rapid, but it still eats some milliseconds) you might want to try and disable this to see if it makes any notable difference.
```

- [ ] **Step 2: Update README — hash key description (line 485 + 487)**

In `packages/core/README.md`, change line 485 from:
```
: JSON path `messageExchange.securityHashKey`, type `string`, default `random uuid`
```
to:
```
: JSON path `messageExchange.securityHashKey`, type `string`, default `empty (must be set)`
```
and replace line 487:
```
: This setting holds the encryption key used by the message exchange control hash mechanism. By default, this has a random uuid value that can be used for development only. For production environments you absolutely must provide your own encryption key via the ENV variable. Depending on your configuration and infrastructure, it might come from a secure storage, HSM, key vault, etc.
```
with:
```
: This setting holds the HMAC key used by the message exchange control hash mechanism. By default it is empty, which leaves tamper protection ineffective and logs a startup warning. You absolutely must provide your own private key via the ENV variable in any real deployment. Depending on your configuration and infrastructure, it might come from a secure storage, HSM, key vault, etc.
```

- [ ] **Step 3: Update the skill doc reference (line 85)**

In `.claude/commands/ti-engine.md`, change line 85 from:
```
- `MESSAGE_EXCHANGE_SECURITY_HASH_KEY` — blake2 HMAC key
```
to:
```
- `MESSAGE_EXCHANGE_SECURITY_HASH_KEY` — message-exchange HMAC-SHA256 key
```

- [ ] **Step 4: Confirm no blake2 references remain anywhere**

Run (from repo root):
```bash
grep -rni "blake2" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs || echo "no blake2 references remain"
```
Expected: `no blake2 references remain`. (The `docs/` specs/plans are historical design records and intentionally retain the name.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/README.md .claude/commands/ti-engine.md
git commit -m "docs(core): document HMAC-SHA256 migration and the empty default key

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Full suite:** `cd packages/core && node --test` → all green.
- [ ] **Lint:** `npx eslint packages/core` → no errors.
- [ ] **No blake2:** `grep -rni blake2 . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs` → none.
- [ ] **Loads on Node 26:** `node -e "require('./packages/core/components/exchange/message-receiver.js'); console.log('message exchange loads')"` → prints the message (previously impossible with the unbuildable addon).
- [ ] **Manual round-trip (optional, needs Redis):** with `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` set and `securityHashEnabled=true`, a normal service call succeeds; a manually-mutated or hash-stripped envelope is rejected with `E_SEC_MESSAGE_TAMPERING_DETECTED`.
