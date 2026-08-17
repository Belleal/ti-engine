# Local User Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `admin`/`admin` local-auth mock with a real user directory — a JSON file of pre-hashed records loaded on boot and reconciled into Redis, whose records carry an email so a local login can resolve to an employee.

**Architecture:** One new `web-framework` module splits into an I/O-free half (record validation, scrypt hashing and verification) and a Redis half (reconcile, lookup). `auth-manager` loses its hardcoded credentials and consults the directory instead, and its `authorize()` returns a `User` carrying `userID`, `username`, `email` and `name`. `competence` needs no code change — it starts working because `session.user.email` is finally populated.

**Tech Stack:** Node.js ≥20, CommonJS, `node:crypto` (scrypt), RedisJSON via `@ti-engine/core/cache`, `node --test`.

**Spec:** [`docs/superpowers/specs/2026-08-13-local-user-directory-design.md`](../specs/2026-08-13-local-user-directory-design.md)

## Global Constraints

- **Branch:** `ca-100-local-user-directory` (already created off `current`). Do not commit to `current` or `master`.
- **CommonJS only** — `require()` / `module.exports`.
- **Internal imports use the `#alias` map** in `packages/web-framework/package.json`, never relative paths. Every alias entry there uses the `{ "types": …, "default": … }` condition shape — match it.
- **Every commit message references `(CA-100)`** and uses Conventional Commits scoped to the package.
- **Never commit `.run/*.run.xml`** — they carry live credentials.
- **web-framework ships generated `.d.ts`.** After changing any public signature, run `npm run build:types` (**the root script** — the per-workspace `build:types` is `tsc` alone and skips the Node-reference post-processing) and commit the regenerated `types/`.
- **Version targets:** web-framework `1.22.0` → `1.23.0`; competence `3.19.0` → `3.19.1` (docs only). Bump `package.json` **and** `CHANGELOG.md` together.
- **No real or realistic credential** may appear in any test, example file, or documentation snippet. Use obvious placeholders (`"REPLACE-ME"`, `"placeholder-hash"`, `not-a-real-password`).
- **Hash encoding:** `scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>`. Defaults `N=16384`, `r=8`, `p=1`, 16-byte salt, 64-byte key.
- **`verifyPassword` is asynchronous.** `scryptSync` blocks the event loop for ~100 ms per call, which on a login endpoint is a self-inflicted denial of service. Use the callback form wrapped in a Promise.
- **Usernames match exactly (case-sensitively)** at load and at lookup.
- **Redis cache key:** `ti:web:auth:local-users`, an object keyed by username.

---

## File Structure

| File | Responsibility |
|---|---|
| `components/local-user-directory.js` | *Create.* Record validation, scrypt hash/verify, Redis reconcile and lookup. |
| `bin/build/hash-password.js` | *Create.* CLI: password on stdin → encoded hash on stdout. |
| `bin/config/local-users.example.json` | *Create.* Example with placeholder hashes only. |
| `components/auth-manager.js` | *Modify.* Delete the hardcoded credentials; real `#authenticateLocal`; `authorize()` returns a full `User`; load + reconcile in `initialize()`. |
| `components/web-config-env.js` | *Modify.* Add the `TI_WEB_AUTH_LOCAL_USERS_PATH` override. |
| `bin/web-server.json` | *Modify.* Add `auth.local.usersPath` (empty default). |
| `package.json` | *Modify.* `#local-user-directory` alias, `hash-password` script, version. |
| `test/local-user-directory.test.js` | *Create.* The I/O-free half. |
| `test/local-user-directory.store.test.js` | *Create.* Reconcile + lookup against the in-memory cache stub. |
| `test/auth-manager.test.js` | *Modify.* Local-auth behaviour through the manager. |
| `test/web-server-env-overrides.test.js` | *Modify.* The new override. |

---

## Task 1: The I/O-free core — validation, hashing, verification

**Files:**
- Create: `packages/web-framework/components/local-user-directory.js`
- Modify: `packages/web-framework/package.json` (add the `#local-user-directory` alias)
- Test: `packages/web-framework/test/local-user-directory.test.js`

**Interfaces produced** (on `require( "#local-user-directory" )`):
- `parseRecords( raw ) → { records: LocalUserRecord[], problems: string[] }`
- `hashPassword( password ) → string` (synchronous; CLI only)
- `verifyPassword( password, encoded ) → Promise<boolean>`
- `HASH_DEFAULTS → { N: 16384, r: 8, p: 1, saltBytes: 16, keyBytes: 64 }` (frozen)

where `LocalUserRecord` is `{ userID: string, username: string, email: string, name: string, passwordHash: string, disabled: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/local-user-directory.test.js`:

```js
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

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const directory = require( "#local-user-directory" );

// Obvious placeholder — never a realistic credential.
const PLACEHOLDER_PASSWORD = "not-a-real-password";

function validEntry( overrides = {} ) {
    return Object.assign( {
        username: "someone",
        email: "someone@example.com",
        name: "Some One",
        passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA=="
    }, overrides );
}

describe( "localUserDirectory.parseRecords", () => {

    it( "accepts a valid record and normalizes its optional fields", () => {
        const result = directory.parseRecords( [ validEntry() ] );
        assert.equal( result.problems.length, 0 );
        assert.equal( result.records.length, 1 );
        assert.equal( result.records[ 0 ].username, "someone" );
        assert.equal( result.records[ 0 ].email, "someone@example.com" );
        assert.equal( result.records[ 0 ].disabled, false );
    } );

    it( "defaults userID to local:<username>", () => {
        const result = directory.parseRecords( [ validEntry() ] );
        assert.equal( result.records[ 0 ].userID, "local:someone" );
    } );

    it( "keeps an explicitly provided userID", () => {
        const result = directory.parseRecords( [ validEntry( { userID: "custom-id" } ) ] );
        assert.equal( result.records[ 0 ].userID, "custom-id" );
    } );

    it( "preserves disabled", () => {
        const result = directory.parseRecords( [ validEntry( { disabled: true } ) ] );
        assert.equal( result.records[ 0 ].disabled, true );
    } );

    it( "drops a record with no username, reporting why", () => {
        const result = directory.parseRecords( [ validEntry( { username: undefined } ) ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
        assert.match( result.problems[ 0 ], /username/ );
    } );

    it( "drops a record with no email — the field an application resolves identity by", () => {
        const result = directory.parseRecords( [ validEntry( { email: undefined } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /email/ );
    } );

    it( "drops a record with no passwordHash", () => {
        const result = directory.parseRecords( [ validEntry( { passwordHash: undefined } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "drops a record whose passwordHash is not a recognized encoding", () => {
        const result = directory.parseRecords( [ validEntry( { passwordHash: "plaintext-oops" } ) ] );
        assert.equal( result.records.length, 0 );
        assert.match( result.problems[ 0 ], /passwordHash/ );
    } );

    it( "reports a duplicate username instead of silently overwriting", () => {
        const result = directory.parseRecords( [ validEntry(), validEntry( { email: "other@example.com" } ) ] );
        assert.equal( result.records.length, 1, "only the first occurrence is kept" );
        assert.equal( result.records[ 0 ].email, "someone@example.com" );
        assert.match( result.problems.join( " " ), /duplicate/i );
    } );

    it( "treats usernames case-sensitively, so two casings are two users", () => {
        const result = directory.parseRecords( [ validEntry(), validEntry( { username: "SomeOne" } ) ] );
        assert.equal( result.records.length, 2 );
        assert.equal( result.problems.length, 0 );
    } );

    it( "reports a non-array input without throwing", () => {
        const result = directory.parseRecords( { username: "someone" } );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 1 );
    } );

    it( "reports a non-object entry without throwing", () => {
        const result = directory.parseRecords( [ "someone", null, 42 ] );
        assert.equal( result.records.length, 0 );
        assert.equal( result.problems.length, 3 );
    } );

} );

describe( "localUserDirectory hashing", () => {

    it( "verifies a password against its own hash", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, encoded ), true );
    } );

    it( "rejects a wrong password", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        assert.equal( await directory.verifyPassword( "something-else", encoded ), false );
    } );

    it( "produces a different hash each time, so the salt is genuinely per-call", () => {
        assert.notEqual( directory.hashPassword( PLACEHOLDER_PASSWORD ), directory.hashPassword( PLACEHOLDER_PASSWORD ) );
    } );

    it( "records its cost parameters in the encoding", () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        const parts = encoded.split( "$" );
        assert.equal( parts[ 0 ], "scrypt" );
        assert.equal( Number( parts[ 1 ] ), directory.HASH_DEFAULTS.N );
        assert.equal( Number( parts[ 2 ] ), directory.HASH_DEFAULTS.r );
        assert.equal( Number( parts[ 3 ] ), directory.HASH_DEFAULTS.p );
    } );

    it( "verifies a hash carrying non-default cost parameters", async () => {
        // This is what proves the encoding is genuinely self-describing rather than assuming the current defaults:
        // a hash produced with a lower N must still verify after the defaults are raised.
        const crypto = require( "node:crypto" );
        const salt = crypto.randomBytes( 16 );
        const N = 1024;
        const key = crypto.scryptSync( PLACEHOLDER_PASSWORD, salt, 64, { N: N, r: 8, p: 1 } );
        const encoded = `scrypt$${ N }$8$1$${ salt.toString( "base64" ) }$${ key.toString( "base64" ) }`;
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, encoded ), true );
    } );

    it( "returns false rather than throwing on a malformed encoding", async () => {
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "garbage" ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "scrypt$16384$8" ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "" ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, undefined ), false );
        assert.equal( await directory.verifyPassword( PLACEHOLDER_PASSWORD, "bcrypt$16384$8$1$c2FsdA==$aGFzaA==" ), false );
    } );

    it( "returns false for an empty password rather than matching anything", async () => {
        const encoded = directory.hashPassword( PLACEHOLDER_PASSWORD );
        assert.equal( await directory.verifyPassword( "", encoded ), false );
        assert.equal( await directory.verifyPassword( undefined, encoded ), false );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/local-user-directory.test.js
```

Expected: FAIL — `Cannot find module '#local-user-directory'`.

- [ ] **Step 3: Register the import alias**

In `packages/web-framework/package.json`, add to `imports`, keeping the block's alphabetical order (it sorts between `#definitions` and `#session-store`) and matching the surrounding condition shape:

```json
    "#local-user-directory": {
      "types": "./types/components/local-user-directory.d.ts",
      "default": "./components/local-user-directory.js"
    },
```

- [ ] **Step 4: Write the implementation**

Create `packages/web-framework/components/local-user-directory.js` with the licence header used by every other file in this package, then:

```js
const crypto = require( "node:crypto" );
const tools = require( "@ti-engine/core/tools" );

/**
 * @typedef {Object} LocalUserRecord
 * @property {string} userID
 * @property {string} username
 * @property {string} email
 * @property {string} name
 * @property {string} passwordHash
 * @property {boolean} disabled
 */

const ALGORITHM = "scrypt";

// scrypt at N=16384, r=8 needs 128 * N * r = 16 MiB, comfortably inside node's 32 MiB default `maxmem`.
const HASH_DEFAULTS = Object.freeze( { N: 16384, r: 8, p: 1, saltBytes: 16, keyBytes: 64 } );

/**
 * Derives a key with scrypt. Asynchronous on purpose: `scryptSync` blocks the event loop for roughly 100 ms at
 * these parameters, which on a login endpoint is a self-inflicted denial of service.
 *
 * @param {string} password
 * @param {Buffer} salt
 * @param {{N: number, r: number, p: number}} parameters
 * @param {number} keyBytes
 * @returns {Promise<Buffer>}
 */
function deriveKey( password, salt, parameters, keyBytes ) {
    return new Promise( ( resolve, reject ) => {
        crypto.scrypt( password, salt, keyBytes, parameters, ( error, key ) => {
            if ( error ) {
                reject( error );
            } else {
                resolve( key );
            }
        } );
    } );
}

/**
 * Splits an encoded hash into its parameters and material, or returns `null` when it is not a recognized encoding.
 *
 * @param {string} encoded
 * @returns {{parameters: {N: number, r: number, p: number}, salt: Buffer, key: Buffer}|null}
 */
function decodeHash( encoded ) {
    if ( typeof encoded !== "string" ) {
        return null;
    }
    const parts = encoded.split( "$" );
    if ( parts.length !== 6 || parts[ 0 ] !== ALGORITHM ) {
        return null;
    }
    const [ , rawN, rawR, rawP, rawSalt, rawKey ] = parts;
    const N = Number( rawN );
    const r = Number( rawR );
    const p = Number( rawP );
    if ( !Number.isInteger( N ) || !Number.isInteger( r ) || !Number.isInteger( p ) || N < 2 || r < 1 || p < 1 ) {
        return null;
    }
    try {
        const salt = Buffer.from( rawSalt, "base64" );
        const key = Buffer.from( rawKey, "base64" );
        if ( salt.length === 0 || key.length === 0 ) {
            return null;
        }
        return { parameters: { N: N, r: r, p: p }, salt: salt, key: key };
    } catch {
        return null;
    }
}

/**
 * Hashes a password for storage in a local-users file. Synchronous because its only caller is the one-shot CLI,
 * where blocking is free — never call it on a request path.
 *
 * @method
 * @param {string} password
 * @returns {string} The encoded hash: `scrypt$N$r$p$salt$hash`, base64 salt and key.
 * @public
 */
function hashPassword( password ) {
    const salt = crypto.randomBytes( HASH_DEFAULTS.saltBytes );
    const parameters = { N: HASH_DEFAULTS.N, r: HASH_DEFAULTS.r, p: HASH_DEFAULTS.p };
    const key = crypto.scryptSync( password, salt, HASH_DEFAULTS.keyBytes, parameters );
    return [ ALGORITHM, parameters.N, parameters.r, parameters.p, salt.toString( "base64" ), key.toString( "base64" ) ].join( "$" );
}

/**
 * Verifies a password against an encoded hash. The cost parameters come from the stored string rather than the
 * current defaults, so raising the defaults never invalidates an existing hash.
 *
 * @method
 * @param {string} password
 * @param {string} encoded
 * @returns {Promise<boolean>} `false` for a malformed encoding or an absent password — never a throw, because a
 *          bad stored value must read as "does not match", not as a server error on the login path.
 * @public
 */
function verifyPassword( password, encoded ) {
    const decoded = decodeHash( encoded );
    if ( !decoded || typeof password !== "string" || password.length === 0 ) {
        return Promise.resolve( false );
    }
    return deriveKey( password, decoded.salt, decoded.parameters, decoded.key.length )
        .then( ( key ) => tools.constantTimeEquals( key.toString( "base64" ), decoded.key.toString( "base64" ) ) )
        .catch( () => false );
}

/**
 * Validates raw file content into records, reporting why any entry was excluded. Never throws: a malformed row is
 * data, not a crash, so one bad entry cannot take an instance down.
 *
 * @method
 * @param {*} raw
 * @returns {{records: LocalUserRecord[], problems: string[]}}
 * @public
 */
function parseRecords( raw ) {
    const problems = [];
    if ( !Array.isArray( raw ) ) {
        return { records: [], problems: [ "the local users file must contain a JSON array of user records" ] };
    }

    const records = [];
    const seen = new Set();
    raw.forEach( ( entry, index ) => {
        if ( !entry || typeof entry !== "object" || Array.isArray( entry ) ) {
            problems.push( `entry ${ index } is not an object` );
            return;
        }
        const username = typeof entry.username === "string" ? entry.username.trim() : "";
        const email = typeof entry.email === "string" ? entry.email.trim() : "";
        const passwordHash = typeof entry.passwordHash === "string" ? entry.passwordHash.trim() : "";

        if ( !username ) {
            problems.push( `entry ${ index } has no username` );
            return;
        }
        if ( !email ) {
            problems.push( `user '${ username }' has no email, which is the field an application resolves identity by` );
            return;
        }
        if ( !passwordHash || !decodeHash( passwordHash ) ) {
            problems.push( `user '${ username }' has no usable passwordHash — generate one with \`npm run hash-password -w @ti-engine/web-framework\`` );
            return;
        }
        // Usernames are matched exactly, so a repeat is a genuine duplicate. Keyed storage would silently keep the
        // last one and leave the operator unable to tell which password is live, so it is reported instead.
        if ( seen.has( username ) ) {
            problems.push( `duplicate username '${ username }' at entry ${ index } — ignored, the first occurrence is kept` );
            return;
        }
        seen.add( username );

        records.push( {
            userID: ( typeof entry.userID === "string" && entry.userID.trim() ) || `local:${ username }`,
            username: username,
            email: email,
            name: ( typeof entry.name === "string" && entry.name.trim() ) || username,
            passwordHash: passwordHash,
            disabled: entry.disabled === true
        } );
    } );

    return { records: records, problems: problems };
}

module.exports = { ALGORITHM, HASH_DEFAULTS, hashPassword, verifyPassword, parseRecords };
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/local-user-directory.test.js
```

Expected: PASS, 21 tests.

- [ ] **Step 6: Run the full package suite**

```bash
npm test -w @ti-engine/web-framework
```

Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web-framework/components/local-user-directory.js packages/web-framework/package.json packages/web-framework/test/local-user-directory.test.js
git commit -m "feat(local-user-directory): add record validation and scrypt password hashing (CA-100)"
```

---

## Task 2: The Redis half — reconcile and lookup

**Files:**
- Modify: `packages/web-framework/components/local-user-directory.js`
- Test: `packages/web-framework/test/local-user-directory.store.test.js`

**Interfaces:**
- Consumes: `parseRecords` from Task 1 (for the test fixtures' shape).
- Produces: `reconcile( records ) → Promise<{ added: string[], updated: string[], removed: string[] }>` and `findByUsername( username ) → Promise<LocalUserRecord|null>`, plus `CACHE_KEY = "ti:web:auth:local-users"`.

**Note on the storage shape:** the directory is stored as one object keyed by username, written whole. `@ti-engine/core/cache` exposes `setJSON` / `getJSON` / `editJSON` but no delete, so writing the complete set is also what makes removal work — which suits "the file is the source of truth" exactly.

- [ ] **Step 1: Write the failing test**

Create `packages/web-framework/test/local-user-directory.store.test.js`:

```js
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

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const directory = require( "#local-user-directory" );

function record( username, overrides = {} ) {
    return Object.assign( {
        userID: `local:${ username }`,
        username: username,
        email: `${ username }@example.com`,
        name: username,
        passwordHash: "scrypt$16384$8$1$c2FsdA==$aGFzaA==",
        disabled: false
    }, overrides );
}

describe( "localUserDirectory reconcile", () => {

    beforeEach( () => {
        installInMemoryCache();
    } );

    it( "adds every record on a first reconcile", async () => {
        const result = await directory.reconcile( [ record( "ada" ), record( "grace" ) ] );
        assert.deepEqual( result.added.sort(), [ "ada", "grace" ] );
        assert.equal( result.updated.length, 0 );
        assert.equal( result.removed.length, 0 );
        assert.equal( ( await directory.findByUsername( "ada" ) ).email, "ada@example.com" );
    } );

    it( "reports a changed record as updated", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        const result = await directory.reconcile( [ record( "ada", { name: "Ada L" } ) ] );
        assert.deepEqual( result.updated, [ "ada" ] );
        assert.equal( result.added.length, 0 );
        assert.equal( ( await directory.findByUsername( "ada" ) ).name, "Ada L" );
    } );

    it( "reports an unchanged record as neither added nor updated", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        const result = await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( result.added.length, 0 );
        assert.equal( result.updated.length, 0 );
        assert.equal( result.removed.length, 0 );
    } );

    it( "removes a username absent from the new set, so revocation works by editing the file", async () => {
        await directory.reconcile( [ record( "ada" ), record( "grace" ) ] );
        const result = await directory.reconcile( [ record( "ada" ) ] );
        assert.deepEqual( result.removed, [ "grace" ] );
        assert.equal( await directory.findByUsername( "grace" ), null );
        assert.ok( await directory.findByUsername( "ada" ) );
    } );

    it( "clears the directory when reconciled with an empty set", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        const result = await directory.reconcile( [] );
        assert.deepEqual( result.removed, [ "ada" ] );
        assert.equal( await directory.findByUsername( "ada" ), null );
    } );

} );

describe( "localUserDirectory findByUsername", () => {

    beforeEach( () => {
        installInMemoryCache();
    } );

    it( "returns null for an unknown username", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( await directory.findByUsername( "nobody" ), null );
    } );

    it( "is case-sensitive", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( await directory.findByUsername( "Ada" ), null );
    } );

    it( "returns null for an empty or absent username without querying", async () => {
        await directory.reconcile( [ record( "ada" ) ] );
        assert.equal( await directory.findByUsername( "" ), null );
        assert.equal( await directory.findByUsername( undefined ), null );
    } );

    it( "returns null when the directory was never populated", async () => {
        assert.equal( await directory.findByUsername( "ada" ), null );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/local-user-directory.store.test.js
```

Expected: FAIL — `directory.reconcile is not a function`.

- [ ] **Step 3: Add the Redis half**

In `packages/web-framework/components/local-user-directory.js`, add the cache import beside the existing ones:

```js
const cache = require( "@ti-engine/core/cache" );
```

Add the key constant beside `ALGORITHM`:

```js
const CACHE_KEY = "ti:web:auth:local-users";
```

Then add these two functions before `module.exports`:

```js
/**
 * Reads the whole stored directory, or an empty object when it has never been written.
 *
 * @returns {Promise<Object>}
 */
function readStored() {
    return cache.instance.getJSON( CACHE_KEY ).then( ( stored ) => {
        return ( stored && typeof stored === "object" && !Array.isArray( stored ) ) ? stored : {};
    } ).catch( () => ( {} ) );
}

/**
 * Writes the records as the complete directory, keyed by username, and reports what changed.
 * <br/>
 * The whole set is written rather than patched because the file is the source of truth: a username absent from
 * `records` must disappear, which is what makes revocation-by-file-edit work. `@ti-engine/core/cache` exposes no
 * delete, so a whole-object write is also the only way to remove a key.
 *
 * @method
 * @param {LocalUserRecord[]} records
 * @returns {Promise<{added: string[], updated: string[], removed: string[]}>}
 * @public
 */
function reconcile( records ) {
    const incoming = {};
    ( Array.isArray( records ) ? records : [] ).forEach( ( record ) => {
        incoming[ record.username ] = record;
    } );

    return readStored().then( ( stored ) => {
        const added = [];
        const updated = [];
        Object.keys( incoming ).forEach( ( username ) => {
            if ( !stored[ username ] ) {
                added.push( username );
            } else if ( JSON.stringify( stored[ username ] ) !== JSON.stringify( incoming[ username ] ) ) {
                updated.push( username );
            }
        } );
        const removed = Object.keys( stored ).filter( ( username ) => !incoming[ username ] );

        return cache.instance.setJSON( CACHE_KEY, incoming ).then( () => {
            return { added: added, updated: updated, removed: removed };
        } );
    } );
}

/**
 * Looks a user up by exact username.
 *
 * @method
 * @param {string} username
 * @returns {Promise<LocalUserRecord|null>}
 * @public
 */
function findByUsername( username ) {
    if ( typeof username !== "string" || username.length === 0 ) {
        return Promise.resolve( null );
    }
    return readStored().then( ( stored ) => stored[ username ] || null );
}
```

Extend the export to `module.exports = { ALGORITHM, CACHE_KEY, HASH_DEFAULTS, hashPassword, verifyPassword, parseRecords, reconcile, findByUsername };`

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/local-user-directory.store.test.js
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full package suite**

```bash
npm test -w @ti-engine/web-framework
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/components/local-user-directory.js packages/web-framework/test/local-user-directory.store.test.js
git commit -m "feat(local-user-directory): reconcile the directory into Redis and look users up (CA-100)"
```

---

## Task 3: Configuration and the environment override

**Files:**
- Modify: `packages/web-framework/bin/web-server.json` (add `auth.local.usersPath`)
- Modify: `packages/web-framework/components/web-config-env.js`
- Test: `packages/web-framework/test/web-server-env-overrides.test.js`

**Interfaces produced:** `config.auth.local.usersPath`, overridable by `TI_WEB_AUTH_LOCAL_USERS_PATH`. Task 5 reads it.

- [ ] **Step 1: Write the failing test**

Append to `packages/web-framework/test/web-server-env-overrides.test.js`, matching the file's existing describe/it style:

```js
describe( "TI_WEB_AUTH_LOCAL_USERS_PATH", () => {

    it( "sets the local users file path", () => {
        const config = applyWebConfigEnvOverrides( { auth: {} }, { TI_WEB_AUTH_LOCAL_USERS_PATH: "/run/secrets/local-users.json" } );
        assert.equal( config.auth.local.usersPath, "/run/secrets/local-users.json" );
    } );

    it( "creates the auth and local blocks when absent", () => {
        const config = applyWebConfigEnvOverrides( {}, { TI_WEB_AUTH_LOCAL_USERS_PATH: "/tmp/users.json" } );
        assert.equal( config.auth.local.usersPath, "/tmp/users.json" );
    } );

    it( "leaves the configured value untouched when the variable is absent", () => {
        const config = applyWebConfigEnvOverrides( { auth: { local: { usersPath: "configured.json" } } }, {} );
        assert.equal( config.auth.local.usersPath, "configured.json" );
    } );

    it( "an explicitly empty value clears the path, which disables the directory", () => {
        const config = applyWebConfigEnvOverrides( { auth: { local: { usersPath: "configured.json" } } }, { TI_WEB_AUTH_LOCAL_USERS_PATH: "" } );
        assert.equal( config.auth.local.usersPath, "" );
    } );

} );
```

Use whatever import name the file already uses for `applyWebConfigEnvOverrides`; do not add a second import.

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/web-server-env-overrides.test.js
```

Expected: FAIL — `config.auth.local` is undefined.

- [ ] **Step 3: Add the override**

In `packages/web-framework/components/web-config-env.js`, after the `TI_WEB_AUTH_ADMINS` block:

```js
    if ( env.TI_WEB_AUTH_LOCAL_USERS_PATH !== undefined ) {
        config.auth = config.auth || {};
        config.auth.local = config.auth.local || {};
        config.auth.local.usersPath = env.TI_WEB_AUTH_LOCAL_USERS_PATH;
    }
```

An explicitly empty value is kept as an empty string rather than ignored — that is how an operator turns the directory off, and it matches how the other list-valued overrides treat an empty value as "none".

Also extend the module's JSDoc summary list of what is overridable to mention the local users path.

- [ ] **Step 4: Add the config default**

In `packages/web-framework/bin/web-server.json`, inside `auth`, add:

```json
    "local": {
      "usersPath": ""
    },
```

Empty by default: the framework ships no directory, so local auth is inert until an operator points it at a file.

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/web-server-env-overrides.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/bin/web-server.json packages/web-framework/components/web-config-env.js packages/web-framework/test/web-server-env-overrides.test.js
git commit -m "feat(web-config-env): add the TI_WEB_AUTH_LOCAL_USERS_PATH override (CA-100)"
```

---

## Task 4: The hash-generation CLI and the example file

**Files:**
- Create: `packages/web-framework/bin/build/hash-password.js`
- Create: `packages/web-framework/bin/config/local-users.example.json`
- Modify: `packages/web-framework/package.json` (add the `hash-password` script)

**Interfaces:** consumes `hashPassword` from Task 1. Nothing consumes this task.

**Why stdin and not argv:** a password passed as an argument lands in shell history and is readable by any other user on the machine via `ps`. Reading stdin keeps it out of both.

- [ ] **Step 1: Write the CLI**

Create `packages/web-framework/bin/build/hash-password.js` with the package's licence header, then:

```js
"use strict";

/**
 * Generates a password hash for a local-users file entry.
 *
 * Usage: npm run hash-password -w @ti-engine/web-framework
 *
 * The password is read from stdin, never from an argument: an argv value lands in shell history and is visible to
 * every other user on the machine through `ps`. Only the resulting hash is written to stdout — the password itself
 * is never echoed, logged, or written to a file by this tool.
 */

const directory = require( "#local-user-directory" );

let input = "";
process.stdin.setEncoding( "utf8" );
process.stdin.on( "data", ( chunk ) => {
    input += chunk;
} );
process.stdin.on( "end", () => {
    // Strip only the trailing newline a shell or editor adds; a password may legitimately contain spaces.
    const password = input.replace( /\r?\n$/, "" );
    if ( password.length === 0 ) {
        process.stderr.write( "hash-password: no password on stdin\n" );
        process.exit( 1 );
    }
    process.stdout.write( directory.hashPassword( password ) + "\n" );
} );
```

- [ ] **Step 2: Add the npm script**

In `packages/web-framework/package.json`, add to `scripts`:

```json
    "hash-password": "node ./bin/build/hash-password.js",
```

- [ ] **Step 3: Verify the CLI end to end**

```bash
printf 'not-a-real-password' | node packages/web-framework/bin/build/hash-password.js
```

Expected: one line beginning `scrypt$16384$8$1$`. Then confirm it verifies:

```bash
node -e "const d=require('./packages/web-framework/components/local-user-directory.js');const h=process.argv[1];d.verifyPassword('not-a-real-password',h).then(r=>console.log('verifies:',r))" "$(printf 'not-a-real-password' | node packages/web-framework/bin/build/hash-password.js)"
```

Expected: `verifies: true`.

Also confirm the empty-input guard:

```bash
printf '' | node packages/web-framework/bin/build/hash-password.js; echo "exit=$?"
```

Expected: the `no password on stdin` message and `exit=1`.

- [ ] **Step 4: Write the example file**

Create `packages/web-framework/bin/config/local-users.example.json`:

```json
[
  {
    "username": "REPLACE-ME",
    "email": "replace-me@example.com",
    "name": "Replace Me",
    "passwordHash": "GENERATE-WITH-npm-run-hash-password"
  }
]
```

The `passwordHash` value is deliberately **not** a valid encoding, so copying this file without generating real hashes produces a clear "no usable passwordHash" warning per record rather than an account nobody can sign in to for unclear reasons.

- [ ] **Step 5: Confirm the example file behaves as intended**

```bash
node -e "const d=require('./packages/web-framework/components/local-user-directory.js');const raw=require('./packages/web-framework/bin/config/local-users.example.json');const r=d.parseRecords(raw);console.log('records:',r.records.length);console.log('problems:',r.problems)"
```

Expected: `records: 0` and one problem naming `passwordHash`.

- [ ] **Step 6: Commit**

```bash
git add packages/web-framework/bin/build/hash-password.js packages/web-framework/bin/config/local-users.example.json packages/web-framework/package.json
git commit -m "feat(build): add the hash-password CLI and a local-users example file (CA-100)"
```

---

## Task 5: Wire the directory into auth-manager

**Files:**
- Modify: `packages/web-framework/components/auth-manager.js` (delete `:76-79`; rewrite `#authenticateLocal`; `authorize()` for LOCAL; load + reconcile in `initialize()`)
- Test: `packages/web-framework/test/auth-manager.test.js`

**Interfaces consumed:** `parseRecords`, `verifyPassword`, `reconcile`, `findByUsername` (Tasks 1-2); `config.auth.local.usersPath` (Task 3).

**This is the task that removes the mock.** Verification below includes proving the hardcoded credentials are gone.

- [ ] **Step 1: Write the failing test**

Append to `packages/web-framework/test/auth-manager.test.js`. The file already imports `describe`/`it`/`beforeEach`/`afterEach`, `assert`, and `AuthManager` from `#auth-manager`, and constructs managers as `new AuthManager( { enabledMethods: [ … ], oauth2: {} } )` — match that style. It does **not** yet import the cache stub or the directory, so add both at the top:

```js
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const localUserDirectory = require( "#local-user-directory" );
```

Then add:

```js
describe( "local authentication against the user directory", () => {

    const PLACEHOLDER_PASSWORD = "not-a-real-password";

    it( "rejects every local login when the directory is empty", async () => {
        installInMemoryCache();
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "someone", password: PLACEHOLDER_PASSWORD } ) );
    } );

    it( "no longer accepts the removed hardcoded admin/admin pair", async () => {
        installInMemoryCache();
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "admin", password: "admin" } ) );
    } );

    it( "accepts a directory user with the right password", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } );
    } );

    it( "rejects a directory user with the wrong password", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: "wrong" } ) );
    } );

    it( "rejects a disabled user even with the right password", async () => {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: true
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        await assert.rejects( () => manager.authenticate( "local", { username: "ada", password: PLACEHOLDER_PASSWORD } ) );
    } );

} );

describe( "local authorization builds a usable session user", () => {

    const PLACEHOLDER_PASSWORD = "not-a-real-password";

    async function seedAda() {
        installInMemoryCache();
        await localUserDirectory.reconcile( [ {
            userID: "local:ada", username: "ada", email: "ada@example.com", name: "Ada L",
            passwordHash: localUserDirectory.hashPassword( PLACEHOLDER_PASSWORD ), disabled: false
        } ] );
        const manager = new AuthManager( { enabledMethods: [ "local" ], local: {}, oauth2: {} } );
        await manager.initialize();
        return manager;
    }

    it( "carries the email, which is what lets an application resolve the identity", async () => {
        const manager = await seedAda();
        const user = await manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } );
        assert.equal( user.email, "ada@example.com" );
        assert.equal( user.name, "Ada L" );
        assert.equal( user.username, "ada" );
    } );

    it( "uses a stable userID across logins, so an admin allowlist can match it", async () => {
        const manager = await seedAda();
        const first = await manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } );
        const second = await manager.authorize( "local", new URL( "https://app.example/login/local" ), { username: "ada" } );
        assert.equal( first.userID, second.userID );
        assert.equal( first.userID, "local:ada" );
    } );

} );
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test packages/web-framework/test/auth-manager.test.js
```

Expected: FAIL — the hardcoded-pair test fails because `admin`/`admin` is still accepted, and the authorize tests fail because `email` is undefined.

- [ ] **Step 3: Delete the hardcoded credentials**

In `packages/web-framework/components/auth-manager.js`, delete this entire block from the constructor (currently lines 74-80):

```js
        // Set up local authentication configuration:
        if ( this.isAuthEnabled( authMethodEnum.LOCAL ) ) {
            // TODO: For testing purposes only! Implement real local auth later!
            this.#authSettings.local = this.#authSettings.local || {};
            this.#authSettings.local.username = "admin";
            this.#authSettings.local.password = "admin";
        }
```

- [ ] **Step 4: Load and reconcile the directory in `initialize()`**

Add the imports beside the existing ones:

```js
const fs = require( "node:fs" );
const localUserDirectory = require( "#local-user-directory" );
```

Add a private field beside the others: `#localDirectoryReady = false;`

In `initialize()`, immediately after the `this.#dropUnconfiguredOpenIDProviders();` call, add:

```js
        if ( this.isAuthEnabled( authMethodEnum.LOCAL ) ) {
            promises.push( this.#loadLocalUserDirectory() );
        }
```

placing it after `let promises = [];` is declared — move the declaration above this block if needed.

Then add the private method:

```js
    /**
     * Loads the configured local users file and reconciles it into the directory. Every failure path leaves the
     * directory unusable and logs why, so local authentication refuses rather than admits — the same fail-soft
     * stance as {@link AuthManager#dropUnconfiguredOpenIDProviders}: a bad local-users file must not take down an
     * instance whose other auth method works, and must not let anyone in either.
     * <br/>
     * A failed read deliberately does NOT reconcile, so a broken volume mount leaves the stored records untouched
     * instead of destroying them. They are inert while the load is failing, because logins are refused anyway.
     *
     * @method
     * @returns {Promise}
     */
    #loadLocalUserDirectory() {
        const usersPath = this.#authSettings.local?.usersPath;
        if ( !usersPath ) {
            logger.log( "Local authentication is enabled but no 'auth.local.usersPath' is configured (see TI_WEB_AUTH_LOCAL_USERS_PATH) — every local sign-in will be refused.", logger.logSeverity.WARNING );
            return Promise.resolve();
        }

        let raw;
        try {
            raw = JSON.parse( fs.readFileSync( usersPath, "utf8" ) );
        } catch ( error ) {
            logger.log( `Could not read the local users file '${ usersPath }' — every local sign-in will be refused. Previously stored records are left untouched.`, logger.logSeverity.WARNING, exceptions.raise( error ) );
            return Promise.resolve();
        }

        const parsed = localUserDirectory.parseRecords( raw );
        parsed.problems.forEach( ( problem ) => {
            logger.log( `Local users file '${ usersPath }': ${ problem }`, logger.logSeverity.WARNING );
        } );
        if ( parsed.records.length === 0 ) {
            logger.log( `The local users file '${ usersPath }' yielded no usable records — every local sign-in will be refused.`, logger.logSeverity.WARNING );
        }

        return localUserDirectory.reconcile( parsed.records ).then( ( result ) => {
            this.#localDirectoryReady = parsed.records.length > 0;
            logger.log( `Local user directory reconciled: ${ result.added.length } added, ${ result.updated.length } updated, ${ result.removed.length } removed.`, logger.logSeverity.NOTICE );
        } ).catch( ( error ) => {
            logger.log( "Could not reconcile the local user directory — every local sign-in will be refused.", logger.logSeverity.WARNING, exceptions.raise( error ) );
        } );
    }
```

- [ ] **Step 5: Rewrite `#authenticateLocal`**

Replace the whole method (currently lines 365-374) with:

```js
    /**
     * Verifies a local sign-in against the user directory.
     * <br/>
     * An unknown username still performs a hash computation against a placeholder before failing, so a missing user
     * and a wrong password take comparable time. Without it the response time answers "does this username exist?",
     * which turns the login form into an enumeration oracle.
     *
     * @method
     * @param {string} username
     * @param {string} password
     * @returns {Promise}
     */
    #authenticateLocal( username, password ) {
        if ( !this.isAuthEnabled( authMethodEnum.LOCAL ) ) {
            return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );
        }

        const refuse = () => Promise.reject( exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 ) );

        return localUserDirectory.findByUsername( username ).then( ( record ) => {
            if ( !record || record.disabled === true ) {
                // Burn comparable time before refusing, so timing does not reveal whether the username exists.
                return localUserDirectory.verifyPassword( password, AuthManager.#TIMING_DECOY_HASH ).then( () => refuse() );
            }
            return localUserDirectory.verifyPassword( password, record.passwordHash ).then( ( matches ) => {
                return matches ? Promise.resolve() : refuse();
            } );
        } );
    }
```

Add the decoy as a static private field near the top of the class:

```js
    // A fixed, valid encoding used only to spend comparable time on an unknown or disabled username. It corresponds
    // to no usable password: it is generated once at load from random bytes, so nothing can ever verify against it.
    static #TIMING_DECOY_HASH = localUserDirectory.hashPassword( randomBytes( 32 ).toString( "base64" ) );
```

Note `randomBytes`, not `crypto.randomBytes`: this file already imports it destructured at line 12
(`const { randomBytes } = require( "node:crypto" );`) for the OIDC nonce. Reuse that — do not add a second import.

- [ ] **Step 6: Rewrite `authorize()` for LOCAL**

Replace the LOCAL case (currently line 201):

```js
            case authMethodEnum.LOCAL:
                return Promise.resolve( new User( { userID: `local:${ tools.getUUID() }`, username: oidc.username } ) );
```

with:

```js
            case authMethodEnum.LOCAL:
                return localUserDirectory.findByUsername( oidc.username ).then( ( record ) => {
                    if ( !record ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, null, exceptions.httpCode.C_401 );
                    }
                    return new User( {
                        userID: record.userID,
                        username: record.username,
                        email: record.email,
                        name: record.name
                    } );
                } );
```

The `email` is the whole point: it is what lets a consuming application's `augmentSession` resolve the identity. The `userID` is now stable, so `auth.admins` can match a local user by it.

- [ ] **Step 7: Run the test to verify it passes**

```bash
node --test packages/web-framework/test/auth-manager.test.js
```

Expected: PASS.

- [ ] **Step 8: Prove the mock is gone**

```bash
grep -n '"admin"' packages/web-framework/components/auth-manager.js
```

Expected: **no output**. Any match means the hardcoded pair survived.

- [ ] **Step 9: Check whether `tools` is still used**

Deleting the UUID call may have left the `tools` import unused.

```bash
grep -n "tools\." packages/web-framework/components/auth-manager.js
```

If there is no output, remove the `tools` import. Then:

```bash
npm run lint
```

Expected: no new warnings from this file.

- [ ] **Step 10: Run the full package suite**

```bash
npm test -w @ti-engine/web-framework
```

Expected: all suites pass.

- [ ] **Step 11: Commit**

```bash
git add packages/web-framework/components/auth-manager.js packages/web-framework/test/auth-manager.test.js
git commit -m "feat(auth-manager)!: authenticate local sign-ins against the user directory (CA-100)"
```

---

## Task 6: Documentation and the releases

**Files:**
- Modify: `packages/web-framework/README.md`, `package.json`, `CHANGELOG.md`
- Modify: `packages/competence/INSTALL.md`, `package.json`, `CHANGELOG.md`
- Regenerate: `packages/web-framework/types/**`

- [ ] **Step 1: Document the directory in the web-framework README**

Add a section covering: the record shape (`username`, `email`, `name`, `passwordHash`, optional `userID` and `disabled`); that `email` is required because a consuming application resolves identity by it; generating a hash with `npm run hash-password -w @ti-engine/web-framework` (password on **stdin**, never argv); `auth.local.usersPath` and `TI_WEB_AUTH_LOCAL_USERS_PATH`; that the file is the source of truth and a removed user is revoked on the next boot; and that every failure refuses rather than admits. State plainly that there is **no rate limiting, lockout or password policy yet**.

Use a placeholder hash in any snippet — never a real one.

- [ ] **Step 2: Rewrite competence's INSTALL.md local-auth passages**

Five passages describe local auth as a dev-only stand-in with hardcoded `admin`/`admin`. Find them:

```bash
grep -n -i "admin/admin\|local auth\|\`local\`" packages/competence/INSTALL.md
```

They are in §1 (the break-glass warning), §7 ("Local auth" under *Employee identity and sign-in*), §10 (Method D, "Locked out?"), §11 (First run) and §16 (the Troubleshooting table row). Rewrite each against the new behaviour:

- Local auth is a **real** option, configured with a users file — not a hardcoded stand-in.
- A local user **has an email**, so it resolves to an employee exactly like an SSO identity. The previous "local auth signs in nobody" caveat is obsolete and must go.
- Break-glass is now "provision a directory entry", not "enable hardcoded credentials".
- §10's Cloud Run recovery: the actionable path is a local users file plus an allowlisted identity.
- §16's row: `admin`/`admin` is no longer accepted at all; the row should describe the real symptom (a local sign-in working) and its real cause (a directory entry exists).
- Keep the standing warning that rate limiting and lockout do not exist yet, so `local` on an internet-facing deployment is still a deliberate risk.

Read the surrounding text and keep each edit consistent with the others — the file must tell one story about local auth, which is exactly what went wrong the last time these passages were touched piecemeal.

- [ ] **Step 3: Regenerate the type declarations**

```bash
npm run build:types
```

Expected: completes, reporting the Node reference added to `web-server.d.ts`. Commit the regenerated `types/`. Use the **root** script — the per-workspace one skips the post-processing.

- [ ] **Step 4: Bump both versions**

`packages/web-framework/package.json`: `1.22.0` → `1.23.0`.
`packages/competence/package.json`: `3.19.0` → `3.19.1`.

- [ ] **Step 5: Add the web-framework changelog section**

At the top of `packages/web-framework/CHANGELOG.md`, below the intro and above `## Version 1.22.0`:

```markdown
## Version 1.23.0

Local (username/password) authentication is real. It had never been implemented: the constructor overwrote whatever
was configured with `admin`/`admin` behind a "for testing purposes only" TODO, the check was a plain `===` on both
fields, and the session user it produced carried no email — which since `competence` began resolving identity by
email meant a local sign-in could not reach an application at all.

* feat(local-user-directory): new `#local-user-directory` module — a JSON file of user records loaded on boot and
  reconciled into Redis under `ti:web:auth:local-users`. Records carry `username`, `email`, `name` and a
  `passwordHash`; `email` is required, because it is the field a consuming application resolves an identity by. The
  file is the source of truth: a boot reconcile adds, updates and **removes**, so deleting a user revokes access
* feat(local-user-directory): scrypt password hashing via `node:crypto` — no new dependency — with a per-user random
  salt and the cost parameters recorded in each hash, so they can be raised later without invalidating existing
  hashes. Verification is timing-safe, and an unknown username still performs a hash computation so the login form
  is not a username-enumeration oracle
* feat(auth-manager)!: **the hardcoded `admin`/`admin` pair is gone.** Local sign-ins are verified against the
  directory, and `authorize()` returns a `User` carrying `userID`, `username`, `email` and `name` instead of a
  random-UUID stub. Any deployment relying on the hardcoded credentials must provision a users file
* fix(auth-manager): a local user's `userID` is stable across logins. It was a fresh UUID each time, so
  `auth.admins` could never match a local user by userID — only by username
* feat(build): `npm run hash-password` generates a record's hash, reading the password from **stdin** rather than
  argv, which would put it in shell history and in `ps`
* feat(web-config-env): `TI_WEB_AUTH_LOCAL_USERS_PATH` overrides `auth.local.usersPath`
* build(release): bump package version from `1.22.0` to `1.23.0`

**Not included, and required before `local` is the sole method on an internet-facing deployment:** rate limiting,
lockout after repeated failures, and password policy.
```

- [ ] **Step 6: Add the competence changelog section**

At the top of `packages/competence/CHANGELOG.md`, below the intro and above `## Version 3.19.0`:

```markdown
## Version 3.19.1

* docs(competence): rewrite the `INSTALL.md` local-auth passages (§1, §7, §10, §11, §16) against
  `@ti-engine/web-framework` 1.23.0's real local user directory. Local auth is no longer a dev-only stand-in with
  hardcoded credentials, and a local user now carries an email, so it resolves to an employee like any SSO identity
  — which makes the previous "local auth signs in nobody" caveat obsolete
* build(release): bump package version from `3.19.0` to `3.19.1`
```

- [ ] **Step 7: Run everything**

```bash
npm test
```

Expected: all workspace suites pass.

```bash
npm run lint
```

Expected: no new warnings.

```bash
npm run check:types
```

Expected: exit 0, no drift, 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/web-framework/README.md packages/web-framework/package.json packages/web-framework/CHANGELOG.md packages/web-framework/types packages/competence/INSTALL.md packages/competence/package.json packages/competence/CHANGELOG.md
git commit -m "docs(web-framework): document the local user directory; release 1.23.0 (CA-100)"
```

---

## Manual verification (after Task 6)

- [ ] **Generate a hash and provision a user.** Run the CLI, put the hash in a local users file with an email matching a seeded competence employee, point `TI_WEB_AUTH_LOCAL_USERS_PATH` at it, and set `TI_WEB_AUTH_METHODS=local` with `COMPETENCE_TEST_USER_ENABLED=false` in `docker-compose.yml`.
- [ ] **Sign in and confirm the identity resolves.** The user should reach the application **as that employee** — not refused, and not employee 20. This is the end-to-end case that has been impossible to verify since CA-95 and is the whole point of this change.
- [ ] **Confirm a wrong password is refused** and the login page shows the generic message.
- [ ] **Confirm revocation works:** remove the user from the file, restart, and confirm the sign-in is refused.
- [ ] **Confirm `admin`/`admin` is dead** — with a users file that has no such entry, it must be refused.

Drive the browser checks with the Browser pane; note that coordinate clicks are unreliable on this app, so use `javascript_tool` `element.click()`.

---

## Self-Review Notes

- **Spec coverage.** §5.1 (I/O-free half) → Task 1; §5.1 (Redis half) → Task 2; §5.2 record shape → Task 1; §5.3 encoding → Task 1; §5.4 CLI → Task 4; §5.5 auth-manager → Task 5; §5.6 config → Task 3; §7 failure modes → Task 5 Step 4 (load paths) and Task 1 (record-level); §8 testing → Tasks 1, 2, 5; §9 follow-ups → recorded in the changelog rather than implemented; §10 docs → Task 6.
- **Type consistency.** `parseRecords` / `hashPassword` / `verifyPassword` / `reconcile` / `findByUsername` keep identical signatures between Task 1's implementation, Task 2's extension, their tests, and Task 5's consumption. `LocalUserRecord` has the same six fields everywhere.
- **Three assumptions were verified against the real files rather than left as guesses:** `auth-manager.js:12` imports `randomBytes` **destructured** (so the decoy hash must call `randomBytes(…)`, not `crypto.randomBytes(…)`); `@ti-engine/core/cache` exports a frozen `instance`, so `cache.instance.getJSON` / `.setJSON` is correct; and `test/auth-manager.test.js` constructs `new AuthManager( { enabledMethods, oauth2 } )` but imports neither the cache stub nor the directory, so Task 5 names both imports explicitly.
