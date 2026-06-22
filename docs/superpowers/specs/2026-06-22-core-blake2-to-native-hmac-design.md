# Design — Replace `blake2` with native `node:crypto` in `@ti-engine/core`

| | |
|---|---|
| **Date** | 2026-06-22 |
| **Package** | `packages/core` |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version target** | core `1.5.1` → `1.6.0` (minor, with `!` breaking markers) |
| **Author** | Boris Kostadinov (with Claude) |

---

## 1. Background & motivation

`@ti-engine/core` depends on **`blake2`** (`^5.0.1`), a native node-gyp-compiled addon, used in exactly **one** place: `MessageHandler.createMessageHash()` ([components/exchange/message-handler.js:122](../../../packages/core/components/exchange/message-handler.js)). It produces a **keyed BLAKE2b MAC** over each message envelope for in-transit tamper detection.

Two problems motivate removing it:

1. **It does not build on Node 26.** `blake2@5.0.1` fails to compile via node-gyp/MSBuild on the current runtime (Node v26.3.1). Because `require("blake2")` sits at the top of `message-handler.js` — the base class of both `MessageSender` and `MessageReceiver` — the **message exchange cannot load at all** on Node 26. This is effectively a prerequisite to run the framework on the current Node, not just cleanup.
2. **It is a native build dependency.** Removing it eliminates the entire node-gyp/MSVC build-toolchain requirement and the `allowScripts` allow-listing it needs.

Node's built-in `node:crypto` (in-process OpenSSL 3.5.7) fully covers the requirement with **no new dependency** — and `core` already uses `require("node:crypto")` (e.g. [utils/tools.js:10](../../../packages/core/utils/tools.js)).

## 2. Goals & non-goals

**Goals**
- Remove the `blake2` dependency entirely.
- Preserve the message-integrity capability (keyed MAC, tamper detection) with no loss of security or performance.
- Make the security-critical comparison and the hash itself unit-testable (core has **no tests today**; this adds the first).
- Opportunistically harden two pre-existing weaknesses uncovered while in this code: a non-constant-time hash comparison, and a shipped default MAC key.

**Non-goals**
- No change to the canonical message serialization (`tools.decycle` → `tools.decomposeJSON`). Its input is unchanged; only the MAC primitive changes.
- No zero-downtime cross-version migration mechanism (explicitly rejected in brainstorming — clean swap + documentation instead).
- No change to `web-framework`'s existing `safeEquals` (a future consolidation candidate, out of scope).
- No change to the public `exports`/API surface of `core`.

## 3. Current behavior (the contract)

The hash is a **symmetric, ephemeral keyed MAC**:

- **Produce** — [message-sender.js:121](../../../packages/core/components/exchange/message-sender.js) `#preSend`: when `MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED`, stamps `message.hash = createMessageHash(message)` before pushing to Redis.
- **Verify** — [message-receiver.js:158-176](../../../packages/core/components/exchange/message-receiver.js) `#postReceive`: strips `message.hash`, recomputes, compares; mismatch → `E_SEC_MESSAGE_TAMPERING_DETECTED` (carrying `messageID`, `receivedHash`, `currentHash`).
- The hash lives **only on the in-flight envelope in Redis** — never persisted, never compared across versions. Both peers normally run the same `core` version.

`createMessageHash` today:
```js
const blake2 = require( "blake2" );
createMessageHash( message ) {
    let transformed = tools.decomposeJSON( tools.decycle( message ) );
    let hash = blake2.createKeyedHash( "blake2b", Buffer.from( config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY ) ) );
    hash.update( Buffer.from( transformed ) );
    return hash.digest( "hex" );
}
```
Verify today: `if ( receivedHash && receivedHash === currentHash )` — a plain, non-constant-time string compare (the `receivedHash &&` guard makes a missing hash fail closed).

**Implication for replacement:** because produce and verify call the *same* function and nothing is persisted, the algorithm is a purely internal contract. There is **no stored-data migration**. The only compatibility window is a mixed-version cluster mid-rolling-restart (§9).

## 4. Design

### 4.1 `createMessageHash` → native HMAC-SHA256

In [message-handler.js](../../../packages/core/components/exchange/message-handler.js), replace the `blake2` import with `node:crypto` and swap the primitive. The transform pipeline and hex-digest output are **unchanged**; only the MAC primitive changes.

```js
const crypto = require( "node:crypto" );   // replaces: const blake2 = require( "blake2" );

createMessageHash( message ) {
    let transformed = tools.decomposeJSON( tools.decycle( message ) );
    let hmac = crypto.createHmac( "sha256", Buffer.from( config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY ) ) );
    hmac.update( Buffer.from( transformed ) );
    return hmac.digest( "hex" );
}
```

- Output: 64 lowercase hex chars (was 128). Nothing depends on the length (verified across the monorepo).
- Same call sites, same `string` return type, same key setting.
- HMAC is the canonical keyed-MAC construction; HMAC-SHA256 is an equal-or-stronger MAC than native keyed-BLAKE2b for this use, and HMAC accepts keys of any length (a strict improvement over BLAKE2b's 64-byte key cap).
- Per-call `createHmac` allocation is **correct and required** — HMAC objects are single-use (throw after `digest()`). The old `blake2` code allocated per call too; no regression. No caching/pooling/streaming.

> The pre-existing `Buffer.from(transformed)` throws only if `transformed` is `undefined`, which `decomposeJSON` returns only for `null`/`undefined` input — never for a real `Message` envelope (those decompose to at least `""`). This is identical before and after; **not a regression**, left as-is.

### 4.2 Constant-time comparison helper in `tools.js`

Add a pure, exported, unit-testable helper to [utils/tools.js](../../../packages/core/utils/tools.js) (which already imports `node:crypto`). It mirrors the audited `web-handlers` idiom **exactly**, using **utf8** encoding (not hex — hex decoding is lenient: silent truncation on invalid chars, uppercase collisions):

```js
/**
 * Constant-time string comparison. Never throws on hostile input; returns false
 * for any non-matching, wrong-length, or non-string value.
 *
 * @method
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
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

The `String(x || "")` coercion is **load-bearing**: undefined/number/object/empty all coerce to a 0-length (or non-matching) buffer that fails the length check, so a missing or wrong-type `receivedHash` returns `false` (fail closed) instead of throwing a `TypeError` that would mask the `E_SEC_MESSAGE_TAMPERING_DETECTED` failure class.

### 4.3 Use the helper in `#postReceive`

In [message-receiver.js](../../../packages/core/components/exchange/message-receiver.js) `#postReceive`, replace the plain `===` comparison while preserving the exact reject structure and exception detail:

```js
let receivedHash = message.hash;
delete message.hash;
let currentHash = this.createMessageHash( message );
if ( tools.constantTimeEquals( receivedHash, currentHash ) ) {
    resolve( message );
} else {
    reject( exceptions.raise( exceptions.exceptionCode.E_SEC_MESSAGE_TAMPERING_DETECTED, {
        messageID: message.messageID,
        receivedHash: receivedHash,
        currentHash: currentHash
    } ) );
}
```
A missing `receivedHash` (`undefined`) still fails closed: `String(undefined || "")` → `""` (length 0 ≠ 64) → `false` → reject. Behavior matches today's `receivedHash &&` guard.

### 4.4 Harden the default `securityHashKey`

The shipped default key (`23e7bdc7-…` in [settings.json:29](../../../packages/core/bin/settings.json)) is a **public shared secret** in an open-source repo — with it, the MAC provides zero integrity against anyone who has read the repo. Decision: **empty default + loud one-time startup warning** (no fail-fast — `operationMode` defaults to `"production"`, so a prod fail-fast would break the out-of-box run).

1. In `settings.json`, change `messageExchange.securityHashKey` from the UUID to `""` (matches the existing empty-placeholder precedent of `gcloudIntegration.apiKey`/`projectID`). Clean-swap already redeploys all services together, so this is compat-safe.
2. In `message-handler.js`, emit a **one-time** `WARNING` (module-level guard, fired on first `createMessageHash` call — which only happens when `securityHashEnabled` is true) when the resolved key is empty/missing **or** equals the old published default UUID:

```js
const OLD_DEFAULT_HASH_KEY = "23e7bdc7-a793-41f9-856e-6760332f0c73";
let keyWarningEmitted = false;
// inside createMessageHash, before computing:
const key = config.getSetting( config.setting.MESSAGE_EXCHANGE_SECURITY_HASH_KEY );
if ( !keyWarningEmitted ) {
    keyWarningEmitted = true;
    if ( !key || key === OLD_DEFAULT_HASH_KEY ) {
        logger.log( "Message-exchange security hash is enabled but using a missing/default key — set TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY to a private value, otherwise tamper protection is ineffective.", logger.logSeverity.WARNING );
    }
}
```
(`logger` is already imported in `message-handler.js`; the `WARNING` severity pattern is already used at line 142.)

### 4.5 Remove the dependency (two locations)

- [packages/core/package.json](../../../packages/core/package.json): remove `"blake2": "^5.0.1"` from `dependencies`.
- [package.json](../../../package.json) (root): remove `"blake2@5.0.1": true` from the `allowScripts` lavamoat block (dead config once the addon is gone). **Keep** `"zeromq@6.5.0": true` (still an optional dep of core).
- No lockfile exists in the repo — nothing to regenerate.

### 4.6 Documentation updates

- [packages/core/README.md:482](../../../packages/core/README.md): replace ``hashing with `blake2` is rapid`` → reference `HMAC-SHA256` / "the keyed hash". Line 487: fix the inaccurate "encryption key" wording → "HMAC key". Add a sentence that the default key **must** be overridden in any real deployment (leaving it default/empty disables protection).
- [.claude/commands/ti-engine.md:85](../../../.claude/commands/ti-engine.md): `"blake2 HMAC key"` → `"message-exchange HMAC-SHA256 key"`. (Note: the old "HMAC" wording was always slightly inaccurate — `blake2.createKeyedHash` is a keyed MAC, not HMAC; the new code genuinely *is* HMAC.)
- `definitions.types.js`, `.env`, and the rest of `settings.json` are algorithm-agnostic — **no change**.

### 4.7 Version & changelog

`core` `1.5.1` → **`1.6.0`** (minor, matching repo precedent where v1.4.0 carried `!` breaking entries as a minor). Update `packages/core/package.json` version and prepend a `CHANGELOG.md` entry with `!` markers and a prominent clean-swap note:

```markdown
## Version 1.6.0
* refactor(exchange)!: replace the blake2 keyed hash with native node:crypto HMAC-SHA256 in the message integrity check
* build(deps)!: remove the blake2 native addon dependency (no longer builds on Node 26; replaced by built-in node:crypto)
* fix(exchange): use a constant-time comparison for the message security hash
* fix(exchange): ship an empty default securityHashKey and warn (once) when the security hash is enabled with a missing/default key
* test(exchange): add the first core test suite covering message-hash determinism, tamper detection, and the constant-time comparison

> BREAKING (wire): the message security hash changes from keyed-BLAKE2b (128 hex) to HMAC-SHA256 (64 hex). Old and new core versions produce mutually incompatible hashes. When upgrading across this version with `securityHashEnabled=true`, redeploy all services together — recommended order: set `securityHashEnabled=false` everywhere → deploy new core to all services → re-enable. HMAC also accepts keys of any length (custom keys >64 bytes that previously failed under blake2b now work).
```

### 4.8 Tests (first test suite in `core`)

Add [packages/core/test/message-hash.test.js](../../../packages/core/test/message-hash.test.js) using the built-in `node --test` runner (same as other packages), and a `"test": "node --test test/*.test.js"` script to `packages/core/package.json`.

The test file sets a deterministic key **before** requiring core modules (config reads env at require-time and freezes):
```js
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = "unit-test-key-0123456789";
```
It tests `createMessageHash` via a minimal concrete subclass (the method uses no instance state, only module-level `config`/`tools`):
```js
const MessageHandler = require( "../components/exchange/message-handler.js" );
class TestHandler extends MessageHandler { enable(){ return Promise.resolve(); } disable(){ return Promise.resolve(); } }
```

Cases:
- **(a) Determinism** — same envelope → same digest; digest is 64 lowercase hex chars.
- **(b) Order-independence** — two logically-equal envelopes with keys inserted in different order → identical digest (exercises `decomposeJSON` sort).
- **(c) Tamper detection** — mutating any field → different digest.
- **(d) Key sensitivity** — different key → different digest (run with both the fixed key and a `randomUUID` key).
- **(e) Constant-time compare** (`tools.constantTimeEquals`, tested directly) — returns `true` for equal hashes; `false` for unequal, wrong-length, `undefined`, `null`, number, object, empty string — **without throwing**. This is the case that guards against a naive `timingSafeEqual` rewrite.
- **(f) Degenerate envelope** — `{}` hashes to a stable value without throwing.

## 5. Security considerations

- **MAC strength:** HMAC-SHA256 (256-bit) is an equal-or-stronger, FIPS-blessed keyed MAC vs native keyed-BLAKE2b-512 for ephemeral in-transit tamper detection. No downgrade.
- **Constant-time compare:** §4.2 closes a pre-existing timing side-channel (low exploitability here, but free defense-in-depth and consistent with `web-handlers`). The utf8 guard never throws on hostile input and fails closed.
- **Fail-closed on missing hash:** preserved (§4.3).
- **Default key:** §4.4 removes a shipped usable secret (aligns with org config policy) and makes misconfiguration visible. Not byte-format-affecting, so compat-safe.
- **Canonicalization caveat (pre-existing, out of scope):** `decomposeJSON` is non-injective (drops `undefined`, `:`-joins) — two structurally different messages could in principle canonicalize identically. Unchanged by this swap; noted for a future hardening pass. Do **not** alter `decomposeJSON` here (would change hashes for an unrelated reason and compound rollover risk).

## 6. Performance

**No regression** (benchmarked, Node v26.3.1 / OpenSSL 3.5.7):
- In-process OpenSSL HMAC-SHA256 has lower per-call overhead than the old `blake2` node-gyp addon (no JS↔C++ addon marshalling; SHA-NI hardware acceleration).
- HMAC-SHA256 is the fastest native candidate (e.g. ~22 µs/op at 2 KB vs ~28 µs for HMAC-SHA512/HMAC-BLAKE2b512; SHA3-256 far slower). It also yields a shorter hex string on the envelope.
- Hash runs once per send and once per receive when enabled — identical call frequency to before. The constant-time compare over a fixed 64-char string is sub-microsecond.
- Practically, since `blake2` will not load on Node 26, any working HMAC is an infinite improvement (the old process won't start).

## 7. Files touched (complete)

| File | Change |
|------|--------|
| `packages/core/components/exchange/message-handler.js` | `blake2`→`node:crypto`; HMAC-SHA256 in `createMessageHash`; one-time weak-key warning |
| `packages/core/utils/tools.js` | add `constantTimeEquals(a, b)` |
| `packages/core/components/exchange/message-receiver.js` | use `tools.constantTimeEquals` in `#postReceive` |
| `packages/core/bin/settings.json` | `securityHashKey` default → `""` |
| `packages/core/package.json` | remove `blake2` dep; add `test` script; version → `1.6.0` |
| `packages/core/CHANGELOG.md` | new `1.6.0` entry with `!` markers + clean-swap note |
| `packages/core/README.md` | reword lines ~482 / ~487 |
| `packages/core/test/message-hash.test.js` | **new** — first core test suite |
| `package.json` (root) | remove `blake2@5.0.1` from `allowScripts` |
| `.claude/commands/ti-engine.md` | reword line 85 |

## 8. Compatibility & rollout

The wire-format hash changes (keyed-BLAKE2b 128 hex → HMAC-SHA256 64 hex). Old and new produce mutually incompatible MACs → an old↔new message pair with the hash enabled fails closed as tampering. The hash is ephemeral (in-flight only; no persisted data to migrate). **Clean swap**: documented in CHANGELOG — recommended rollover is disable `securityHashEnabled` everywhere → deploy new core to all services → re-enable. Largely theoretical here since old core can't run on Node 26 anyway.

## 9. Verification plan

- `npm test` in `packages/core` (new suite) passes all cases (a)–(f).
- `npm run test:json` (if applicable) and ESLint clean.
- Manual: with a non-default key set, a round-trip send/receive succeeds with `securityHashEnabled=true`; a manually-mutated envelope is rejected with `E_SEC_MESSAGE_TAMPERING_DETECTED`; a stripped-hash envelope is rejected.
- Grep the monorepo confirms zero remaining `blake2` references.
- Confirm core loads and the tester service runs on Node 26 (previously impossible).

## 10. Out of scope / future

- Consolidating `web-framework`'s `safeEquals` onto `tools.constantTimeEquals`.
- An injective canonical serialization for the MAC input.
- A config-load assertion that the key is non-empty in production (fail-fast) — deferred (warning-only chosen).

## Appendix — adversarial review (4 lenses, 0 blockers, 6 important)

Reviewed before writing this spec across Correctness, Security, Completeness/Blast-radius, and Performance lenses. All approved. The important findings are incorporated above: the exact utf8 constant-time idiom (§4.2/§4.3), fail-closed preservation (§4.3), the default-key hardening (§4.4), the root `allowScripts` removal (§4.5), the 4th doc reference (§4.6), and the `!`-marked version note (§4.7).
