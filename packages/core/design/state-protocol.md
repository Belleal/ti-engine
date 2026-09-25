# The state protocol

The contract `HttpCacheProvider` speaks. Anything that answers it correctly can back the engine's cache.

It exists because a container has no business holding a database credential. Where the engine runs inside a Cloudflare container, the durable store is reachable only through a Worker binding, so the container talks HTTP to a virtual hostname and the Worker resolves it. The provider is therefore named for its transport rather than for D1 — what answers is the deployment's business, and the test suite answers it with `node:http`.

---

## 1. Transport

- Every operation is a `POST` with a JSON body, except the health probe, which is a `GET` with none.
- Request bodies are `application/json`. Responses are JSON; an empty body is a valid acknowledgement for an operation with nothing to return.
- Each path answers exactly one method. A service must reject the wrong verb rather than guess.
- `Authorization: Bearer <token>` is sent when `memoryCache.stateAuthToken` is configured, and omitted otherwise. The provider refuses to start if that token would travel as plain HTTP to anywhere but this machine, unless `memoryCache.stateAllowInsecureAuth` says the platform already protects the hop. The documented Cloudflare deployment sets no token at all — the Worker binding *is* the authentication — so it never meets this rule.
- **The service never redirects.** The provider sends `redirect: "manual"` and treats every 3xx as a failed call. A `307` or `308` preserves method and body, so following one would resend stored state, and the credentials with it, to a host no configuration ever named.
- **An expired key is gone on read.** `values/get`, `hashes/get` and `keys/match` must not return anything whose deadline has passed. A service that recorded durations without applying them would satisfy every assertion about what the provider *sent* and still serve the value forever.
- A request that times out or never connects is a **transport failure**: the provider announces `onConnectionDisrupted`, which takes the whole cache out of service, and starts probing for recovery.
- A response with a non-2xx status is an **operation failure**: that one call rejects and the connection is left up. A single bad key must never take the store down.

**Nothing is retried, deliberately.** A dropped request fails its call and takes the cache out of service until the probe finds the service again. Retrying would be safe for the reads and wrong for the writes: this protocol carries no idempotency key, so a retried `documents/merge` whose first attempt actually landed would apply twice. Merge-patch happens to be idempotent for a plain field set, but not for a caller who is counting, and `values/set` with an expiration is not idempotent at all. If retries are ever wanted, they need a request identifier first.

**The provider never escalates to `onConnectionLost`.** Redis raises it for a connection that is gone for good, which crashes the instance. HTTP has no equivalent signal — a service that is not answering now may answer in a second — so this provider only ever reports disruption and recovery.

A path the service does not recognise must answer `404`. The set of paths below is the entire vocabulary the container has; that is the containment boundary the arrangement is for.

---

## 2. Operations

| Path | Request | Response |
|---|---|---|
| `GET /v1/health` | — | `{ "ok": true }` |
| `POST /v1/keys/match` | `{ pattern }` | `{ keys: string[] }` |
| `POST /v1/keys/expire` | `{ key, seconds, hash? }` | `{ ok: true }` |
| `POST /v1/values/set` | `{ key, value, expiration? }` | `{ ok: true }` |
| `POST /v1/values/get` | `{ key }` | `{ value: string \| null }` |
| `POST /v1/values/delete` | `{ key }` | `{ deleted: boolean }` |
| `POST /v1/hashes/set` | `{ key, field, value }` | `{ ok: true }` |
| `POST /v1/hashes/get` | `{ key, field }` | `{ value: string \| null }` |
| `POST /v1/hashes/delete` | `{ key, field }` | `{ deleted: boolean }` |
| `POST /v1/documents/set` | `{ key, path, value, overrideMode }` | `{ ok: true }` |
| `POST /v1/documents/get` | `{ key, path }` | `{ value: string \| null }` |
| `POST /v1/documents/merge` | `{ key, path, value }` | `{ ok: true }` |

`pattern` is a Redis-style key glob: `*` and `?`. `GET` is the health probe's method; every other path is `POST`.

`hash` on `keys/expire`, when present, names the hash the field belongs to — and `key` is then the field within it. That reads backwards; it is the established argument order of `CacheProvider#expireValue` and is preserved rather than quietly improved.

`overrideMode` is `0` to write unconditionally, `1` to write only if the path is absent, `2` only if it is present. A skipped write is still a `200`.

`values/delete` reports whether it removed anything. The Redis backend's `deleteValue` resolves the raw command result instead, contradicting its own signature; nothing calls it, so this protocol follows the declared contract rather than that behaviour.

There is no operation for lists, sets, or multi-key batching. Those are used exclusively by the message exchange, and a deployment on this protocol has it disabled. `HttpCacheProvider` leaves those methods abstract, so calling one raises an exception naming the method rather than silently returning nothing.

---

## 3. Values are strings

Every `value` on the wire is a **string**, and the service stores and returns it verbatim. It is opaque except to `documents/*`, which must parse it as JSON.

This is not decoration. `tools.stringifyJSON` serialises objects and passes scalars through untouched, which is safe over the Redis protocol because every argument is coerced to a string on its way out. JSON is not so forgiving: a stored `42` would arrive as a number, fail the `isString` check that decides whether a key exists, and read back as absent. The provider coerces so that both backends store and return exactly the same thing.

`null` in a response's `value` means *absent*. The provider turns that into `undefined` for `values/get` and `null` for `hashes/get` and `documents/get`, because that is what the Redis backend returns and callers distinguish the two.

---

## 4. Paths travel as segments, never as a path expression

`path` is an **array of literal key segments**. The root document is `[]`.

The provider never sends a JSONPath string. RedisJSON wants `$["a"]`, SQLite wants `$."a"`, and a provider that picked one would be handing the service a dialect to re-parse — which is how an escaping bug gets in. Quoting is the store's business, at the point where the store is known.

A segment is a literal key. `["user.name"]` addresses one key called `user.name`, not a path through `user` to `name`.

---

## 5. `documents/merge` must be atomic

This is the one requirement the protocol makes of its implementer, and the reason `HttpCacheProvider` declares `atomic-json-edit`.

The merge applies [RFC 7386](https://www.rfc-editor.org/rfc/rfc7386) merge-patch semantics at the addressed path: object keys are merged recursively, a `null` removes a key, and a non-object target is replaced. It must be applied **in a single statement at the store**.

A service that implements it as a read, a change and a separate write breaks a guarantee callers rely on, and breaks it silently. Two records written into one document in the same moment both read the old document and both write it back; one is simply gone. Nothing throws. The count is wrong, and nobody finds out until somebody asks why a subscriber never received anything.

If a store cannot do this, the service in front of it must not answer this protocol — the provider declaring the capability is what allows startup validation to pass.

---

## 6. Implementing it on Cloudflare D1

Non-normative, but it is the implementation this protocol was designed against. D1 is SQLite, so the merge maps onto `json_patch`, which implements RFC 7386 exactly.

**core ships it** (1.17.0): `@ti-engine/core/state-service` exports `createD1StateService( database, { partitions, now } )`, which returns the Worker's handler — a `Request` in, a `Response` out — and `sweepExpired( database )` for a scheduled prune. Its schema is `components/cache/d1-state-schema.sql`, beside the module, for `wrangler d1 execute --file`. The module imports nothing else from core, so a Worker bundling it bundles only it. What follows is the reasoning; the module is the reference.

```sql
CREATE TABLE documents ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
```

The merge is one statement, and the path never appears in it:

```sql
UPDATE documents SET value = json_patch( value, ?1 ) WHERE key = ?2;
```

`?1` is the patch **nested inside the path segments**. For path `["rec-1"]` and value `{"email":"one@example.com"}`, the bound parameter is `{"rec-1":{"email":"one@example.com"}}`. Merge-patch is recursive and creates missing objects, so nesting reaches any depth, and the statement is atomic because SQLite applies one statement atomically.

The obvious alternative — `json_set( value, ?path, json_patch( coalesce( json_extract( value, ?path ), '{}' ), ?patch ) )` — also works and is also one statement, but it needs a path expression, and SQLite's JSON path grammar has no escape for a double quote inside a quoted label. Verified against SQLite 3.45.1:

| Key | `json_set` with a path expression | Nested `json_patch` |
|---|---|---|
| `rec-1` | works | works |
| `user.name` | works (quoted) | works |
| `he said "hi"` | **`bad JSON path`** | works |
| `$`, `[0]` | works (quoted; 3.51.2) | works |
| `a\b` | **addresses a different key** (3.51.2): the read misses, and `json_set` writes a new key beside it with nothing raised | works |

Nesting the patch has no escaping surface at all, which is why it is the mapping recorded here. Where a path expression cannot be avoided — reading or replacing a branch — the shipped service refuses a segment containing a double quote, a backslash or a control character with a 400, rather than depend on how a given SQLite version reads escapes inside a quoted label; a merge reaches any key. It is also what vindicates §4: because the provider sends segments rather than an expression, the handler has a structure to nest and never a string to quote.

The remaining operations are ordinary rows — `values` and `hashes` tables with an `expires_at` column, filtered on read and swept on a schedule. None of them carries a guarantee beyond doing what it says.

### Reading a branch

A read addresses its branch with `value -> ?path`, not `json_extract( value, ?path )`. Both are one statement; they differ in what they answer. `json_extract` returns a string **unquoted**, and the provider parses whatever it is given, so a stored `"42"` came back as the number `42` and a stored `"null"` as absent. `->` answers JSON text for whatever is there and SQL NULL only where nothing is. For the same reason a set-if-absent tests `json_type( value, ?path )`, which is NULL only for an absent path, where `json_extract` is NULL for a stored `null` too. Measured against SQLite 3.51.2.

### Partitioned documents

A document that is an application's **collection** cannot be one row: D1 caps a row at 2 MB, and every edit to one record would rewrite all of them. The service therefore takes a **partition spec** — for a named key, the depth at which one entity sits (`[ [ "*", "*" ] ]` for `{ employee: { evaluation: … } }`) — and keeps each entity as its own row. It is a service-side extension and invisible to the client: the provider sends the same `documents/get|set|merge`, and the service assembles or decomposes.

The requirement of §5 carries over as one **batch**: a merge touching several entities becomes one `json_patch` upsert per entity, submitted together, which D1 runs as a transaction. Two merges into different entities no longer contend at all.

What a caller can observe is recorded in `docs/superpowers/specs/2026-09-25-d1-state-service-design.md` (in the repository, not the package), which is the design of record: an empty object above the entity level leaves no row, so it reads back as `null`; a subtree comes back in path order, not insertion order; `*` in a path is a wildcard where the spec has one, answered from an index, and refused anywhere else; a partitioned key does not expire.

---

## 7. Testing an implementation

`packages/core/test/fixtures/stub-state-server.js` is a complete in-memory implementation. Two suites run against it:

- `http-cache-provider.test.js` exercises the provider directly, including the test that matters most here — that `editJSON` issues exactly one `documents/merge` and no `documents/get`. A provider that emulated the merge fails it.
- `http-cache-integration.test.js` drives the whole path through `CommonMemoryCache`, and pins the recovery behaviour described in §1. The stub can sever a socket without answering, which is a genuine transport failure rather than an error status, so the suite can take the cache out of service, watch the guard refuse a second call *before* it reaches the provider, restore the service, and wait for the cache to come back with nothing having called it. Verified to fail when the probe is disabled.

That test is the capability claim made checkable. The equivalent assurance for a real service is that its merge is one statement; there is no way to observe the difference from the outside until it is too late.

The shipped D1 service is tested the same way the site tested its own: against real SQLite through `node:sqlite`, shaped as a D1 binding (`test/fixtures/d1-sqlite.js`, whose `batch()` is one transaction and which logs every statement it runs). That log is what makes §5 checkable here — a merge is asserted to be statements inside one batch with nothing read before it — and `d1-state-service.differential.test.js` holds partitioned documents to the single-document behaviour this protocol describes, over competence's own operation sequence and seeded random ones. The suites skip on a Node without `node:sqlite` (before 22.5).
