# Design — The D1 state service in core, partitioned documents, and stores of one's own

| | |
|---|---|
| **Date** | 2026-09-25 |
| **Packages** | `packages/core` |
| **Status** | Implemented in core 1.17.0 — see §7 |
| **Version targets** | core `1.16.0` → `1.17.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-177`](https://belleal.youtrack.cloud/issue/CA-177) and [`CA-178`](https://belleal.youtrack.cloud/issue/CA-178) (under `CA-175`, the move of competence to Cloudflare) |

---

## 1. Why

The Boris Khan site runs its container behind a Worker that answers core's state protocol from D1 — and that service
lives only in the site's repository. competence is moving to the same arrangement (CA-175) and needs the same service,
plus one thing the site never did: store an **application collection** in D1.

The site stores each document as one row. For a collection that is fatal twice over: D1 caps a row at 2 MB, and
competence's evaluations document — every evaluation of every employee, 17–21 KB each — reaches it at roughly a
hundred evaluations; and every edit to one evaluation re-writes all of them.

Two smaller gaps travel with it:

- **An application cannot open a store of its own.** `CommonMemoryCache` is a singleton over the one provider the
  settings name, so competence's records must live wherever the framework's sessions do — which is exactly what its
  owner asked to decouple (CA-176).
- **`getJSON` answers two shapes** (CA-178): RedisJSON's list of matches from Redis, the bare value over HTTP. A caller
  that unwraps `result[ 0 ]` truncates a stored array on HTTP — measured, a baseline became its first code, then empty.

## 2. Decisions

1. **The service lives in core**, as `@ti-engine/core/state-service`, beside the protocol it implements
   (`design/state-protocol.md`) and the client that speaks it (`HttpCacheProvider`). A new package was considered and
   rejected on a concrete cost: npm trusted publishing cannot create a package, and `npm-publish-plan.js` refuses the
   whole run while any workspace package has never been published — so a new package blocks every other release until
   someone publishes it by hand. The module is self-contained (no core imports, global `Response` only), so a Worker
   bundling it pulls in nothing else from core.
2. **Partitioned documents are a service-side extension, invisible to the client.** A service is created with a
   *partition spec*; for a key it names, `documents/get|set|merge` behave as they do for any document, but each
   **entity** is its own row. `HttpCacheProvider` is unchanged, so an application reaches a partitioned collection
   with the same `getJSON` / `setJSON` / `editJSON` it always used.
3. **Merge stays atomic** — the one requirement the protocol makes of an implementer. A merge touching several
   entities becomes one `json_patch` upsert per entity, executed as **one D1 batch** (a transaction). Two merges into
   different entities no longer contend at all; two into the same entity are still one statement each.
4. **`createCacheStore( identifier, { provider, settings, requiredCapabilities } )`** opens an independent store:
   a `CommonMemoryCache` with its own provider, connection observation and capability check, never the singleton.
   `HttpCacheProvider` accepts its settings as an optional constructor argument, overriding the configured ones.
5. **`getJSONValue( key, path )`** — additive, one documented shape: the addressed value, or `null`. Redis unwraps
   JSONPath's match list (the first match for a wildcard); HTTP answers the value already. `getJSON` is unchanged and
   its JSDoc now states the divergence.

## 3. Partitioned documents

### 3.1 The spec

`partitions: { [key]: Pattern[] }`. A pattern is an array of segments, each `"*"` (any key) or a literal. It names the
depth at which one entity sits. competence's, for example:

```js
{
    "ti:competence:data:employees":        [ [ "*" ] ],
    "ti:competence:data:evaluations":      [ [ "*", "*" ] ],             // employee → evaluation
    "ti:competence:data:calendars":        [ [ "*", "*", "*" ] ],        // cycle → manager → slot
    "ti:competence:data:audit-log":        [ [ "employees", "*", "*" ], [ "evaluations", "*", "*" ] ],
    "ti:competence:data:research-consent": [ [ "texts", "*" ], [ "decisions", "*", "*", "*" ] ]
}
```

Validated when the service is created: every pattern non-empty, segments strings, and **no two patterns of a key
overlap** — they must differ in a literal at some position — so any concrete path is claimed by at most one pattern.

### 3.2 Addressing

For a concrete path `S` and the pattern `p` that agrees with it on their common length:

| Case | Condition | Meaning |
|---|---|---|
| **above** | `\|S\| < \|p\|` | a subtree over entities — assembled from, or decomposed into, many rows |
| **at** | `\|S\| = \|p\|` | one entity — one row |
| **below** | `\|S\| > \|p\|` | inside one entity's JSON |
| **outside** | no pattern agrees | nothing can be stored here: a write is refused (400), a read answers `null` |

### 3.3 Operations

- **`documents/get`** — *at/below*: the row, then the inner path. *above*: every row under `S`, assembled into its
  nested object; the root of an existing key assembles to `{}` when it holds no entity. A `"*"` in `S` is a wildcard
  only where the claiming pattern has one, within the entity path: the answer is the **first** matching entity in path
  order, then the rest of the path inside it — which is what a RedisJSON wildcard read gave every caller that took
  `result[ 0 ]`, since the ids it is used with are unique. Anywhere else — above the entity level, facing a literal,
  inside an entity — 400: the service would have to scan, and a `null` would claim there was nothing to find.
- **`documents/set`** — *root*: the value is decomposed along the spec; `overrideMode` tests the key's existence (a
  marker row). *above*: rows under `S` replaced by the decomposition; the mode tests whether any exist. Both tests are
  made by the batch's first statement, which leaves a guard row only if the test passes, and every write in the batch
  requires that row (§4), so nothing can land between the test and the write. *at*: one
  row — insert-if-absent, update-if-present or upsert. *below*: one `json_set` inside the entity with the mode in its
  `WHERE` clause; only when it changes nothing does the service look for the entity, and an absent one is 400. An
  inner segment holding a double quote, a backslash or a control character is 400 too: SQLite cannot be relied on to
  read it inside a quoted label (§7), and a merge reaches it without one. A value
  that does not fit the spec — a scalar where the spec expects nesting, a key no pattern admits, a key spelled `*` on
  the entity path — is refused, 400, naming the path. So is a `*` in a written path.
- **`documents/merge`** — the patch is nested at `S` and decomposed: at an entity, `null` deletes the row and anything
  else is `json_patch`ed into it (a new row starts from `{}`, which is RFC 7386 against an absent target); above an
  entity, an object recurses and `null` deletes the subtree; anything else is refused. One batch.
- **`keys/match`** includes partitioned keys (by their marker), and compares with `GLOB`, case-sensitively, as Redis
  does. **`keys/expire`** on a partitioned key is refused: an
  application collection does not expire, and silently ignoring the call would be a lie.

### 3.4 What a caller can tell apart from a single document, stated

An **empty object** has no row. Written above an entity level (`setJSON( key, {}, [ cycle ], NX )`), it leaves nothing
behind: a later read of that path answers `null` where a single document would answer `{}`, and a set-if-absent there
finds nothing and writes. Every read competence makes above an entity level already takes `null` and `{}` down the
same branch — an employee's evaluations, a manager's and a cycle's interview slots, an employee's and an evaluation's
audit entries, the three consent-chain reads and a cycle's peer-review markers, checked call by call on 2026-09-25 —
because RedisJSON answered a missing path and an empty one differently too. The peer-review roster is the case in
point: a map of reviewers to `{}`, written only so that RedisJSON would accept the markers beneath it, which the
partitioned store neither needs nor keeps.

**Key order** above the entity level is path order — by the ids' UTF-8 bytes — not insertion order. RedisJSON keeps
insertion order, JavaScript already moves integer-like keys to the front of any object, and JSON does not order keys
at all. In competence the difference is visible in one place: the research-consent register lists employees in the
order the store returns them, so on D1 it reads in id order where Redis gave creation order. Every other list it
renders sorts first (employees and the peer picker by name, cycles by creation, snapshots chronologically, audit
entries by time), because a store's order was already known not to mean anything — its phase-3 change can sort that
one list by name too.

The differential test in §5 normalizes exactly these two and nothing else.

## 4. Schema

```sql
CREATE TABLE IF NOT EXISTS state_partitions (
    key   TEXT NOT NULL,
    path  TEXT NOT NULL,   -- the entity path as a JSON array; '[]' is the key's marker row
    leaf  TEXT,            -- the entity path's last segment: answers a wildcard read by id
    value TEXT NOT NULL,
    PRIMARY KEY ( key, path )
);
CREATE INDEX IF NOT EXISTS state_partitions_leaf ON state_partitions ( key, leaf );
CREATE INDEX IF NOT EXISTS state_partitions_markers ON state_partitions ( key ) WHERE path = '[]';
CREATE TABLE IF NOT EXISTS state_guards (
    token TEXT PRIMARY KEY  -- one conditional batch's verdict; empty between batches
);
```

alongside the site's three tables (`state_values`, `state_hash_fields`, `state_documents`), shipped as
`components/cache/d1-state-schema.sql` for `wrangler d1 execute --file`.

A subtree is a **range of the primary key**: `path >= prefix AND path < upper`, where the prefix is the path's JSON
array text without its closing bracket plus a comma, and `upper` is the same with the comma raised to `-`. Under
SQLite's BINARY collation the half-open range holds exactly the strings with that prefix, and it needs none of the
`%`/`_` escaping a `LIKE` would. The first version compared `substr( path, 1, length( ?2 ) ) = ?2`, which is just as
exact and reads every row of the key to find the few it wants: measured with 3,000 rows, it answered ten after
visiting all 3,000, where the range seeks to them. D1 bills rows read.

`keys/match` finds partitioned keys by their markers through the partial index, which holds the markers and nothing
else: without it the lookup read every entity row of every partitioned key — 5,511 index entries for eleven markers in
the measurement — and `keys/match` is what the configuration store's history view calls.

A conditional set above the entity level cannot put its test in one statement's WHERE clause: it is a batch that
deletes a subtree and writes the entities under it. The batch's first statement inserts a row into `state_guards`,
under a random token, only if the test passes (`INSERT … SELECT ?token WHERE [NOT] EXISTS ( … )`). Every write after
it carries `EXISTS ( SELECT 1 FROM state_guards WHERE token = ?1 )`, and an insert takes `SELECT … WHERE` in place of
`VALUES` to carry that condition. The last statement deletes the row. The first statement's change count is the
answer: 0 means skipped. The first version tested with a query and then sent the batch, so the answer could be stale
by the time the batch ran. When two instances seeded one collection at once, the second one's seed deleted the
evaluation the first had just stored. Two alternatives were rejected. Writing the marker last lets the root's test
stay true until the batch's own writes, but only the root has a marker. A first statement that aborts the batch would
work everywhere, but the service could then tell a skip from a failure only by D1's error text.

`keys/match` compares with `GLOB`, not `LIKE`. `LIKE` folds ASCII case, where Redis does not, and so matched another
key's capitalization. And no index on the key can serve a comparison that folds case: by `EXPLAIN QUERY PLAN`, the
`LIKE` statement read every live row of the three tables through their expiry indexes and scanned every marker. The
`GLOB` statement reads the primary-key range that a pattern's literal prefix names in each of the four. A `[` in a
pattern is sent as `[[]`, since it opens a class in `GLOB` and is itself in the protocol.

The leaf index is used only if the statement has **no `ORDER BY`**: with `ORDER BY path` and no table statistics,
SQLite preferred the primary key (which delivers that order) and scanned the key. The matches are sorted afterwards
by their UTF-8 bytes, which is SQLite's order — JavaScript's `<` compares UTF-16 code units and disagrees past the
Basic Multilingual Plane.

## 5. Testing

- The protocol, against real SQLite through `node:sqlite` shaped as a D1 binding (the site's approach): every
  operation, expiry, the path grammar's refusals, the atomicity claim (a merge is one statement per entity, in one
  batch), 404/405/400.
- **A differential test**: the same operation sequences — the ones competence's DataManager actually performs, and
  seeded random ones — against a reference single-document model (RFC 7386 merge, literal-segment paths) and against
  the partitioned service, comparing every read, with only §3.4's empty objects normalized.
- `createCacheStore`: two stores, two providers, independent operational state; the singleton untouched.
- `getJSONValue`: both providers, the array case CA-178 was about.
- Races, through a fixture hook that lands another request's write just before the unit of work a test picks — a
  statement run on its own, or a whole batch. D1 runs one transaction at a time, so those are the only points at which
  one can land.

## 6. Not done

- **Filtering in the store.** A read above an entity level returns every row under it; a whole-collection read of
  evaluations returns every evaluation, as the single document did. Pushing DataManager's filters down is its own
  change, if collection sizes ever make it worth one.
- **Migrating the site** to this module. It keeps its own handler until someone chooses to move it — and that handler
  (anarandaris `Site/worker/src/state-handler.js` at d14fdf5) still reads a branch with `json_extract` and tests
  existence with it, the two statements §7 replaced. Nothing the site stores today is a string read on its own at a
  branch, so neither has bitten it. It also has the two defects the review below found here: a conditional branch set
  checked by a query ahead of its write, and `keys/match` by `LIKE`, which folds case and reads every key.
- **A write into an expired document** that has not been swept keeps the passed deadline, so the write is invisible;
  Redis would have started a fresh key. The one caller that expires a document is the message tracer, and the
  exchange is off wherever this service runs.
- **Expiring partitioned keys**, and batching across keys.
- **D1's per-invocation query limit** (1,000 on Workers Paid) caps a merge at 999 entities, since each is one
  statement in the batch. Nothing in competence writes more than one family's sets or one roster at a time.

## 7. Implementation log

**core 1.17.0 — 2026-09-25.**

- `components/cache/d1-state-service.js`, exported as `@ti-engine/core/state-service`: the protocol and partitioned
  documents as §3 describes. `components/cache/d1-state-schema.sql` beside it; not in the exports map, because
  `check:types` imports every subpath as a module and a `.sql` one fails it — a consumer locates it beside
  `require.resolve( "@ti-engine/core/state-service" )`.
- `createCacheStore` and the `HttpCacheProvider` settings argument; `getJSONValue` on `CacheProvider`, both backends
  and `CommonMemoryCache`.
- Measured while testing, and changed:
  - the subtree read and delete moved from `substr` to a primary-key range (§4): 3,000 rows visited for 10 answered;
  - the leaf lookup lost its `ORDER BY` (§4), without which SQLite never used the index;
  - `state_partitions_markers`, a partial index of the marker rows, so `keys/match` stops reading every entity row
    (5,511 for eleven markers);
  - the single-document branch read moved from `json_extract` to `->`, and its existence test to `json_type`: a
    stored `"42"` read back as `42`, a stored `"null"` as absent, and set-if-absent overwrote a stored `null` —
    each reproduced against the old statements before the change;
  - a path segment holding a backslash or a control character is refused like a double quote, wherever a path
    expression is needed: SQLite 3.51.2 reads a backslash in a quoted label as an escape, so `a\b` addressed a
    different key — the read answered `null`, and the write answered `ok` and added a second key beside it
    (reproduced against the quote-only rule);
  - a write inside an entity became one conditional statement, looking for the entity only when nothing changed;
  - a wildcard the spec cannot answer became a 400 instead of `null`, and a key spelled `*` on the entity path is
    refused.
- Tests, against real SQLite through `node:sqlite` shaped as a D1 binding (`test/fixtures/d1-sqlite.js`: `batch()`
  is one transaction, and every statement is logged with the batch it ran in): the protocol 27, partitioned
  documents 33, the differential suite 6, stores end to end through `HttpCacheProvider` 10. The differential suite
  runs competence's DataManager sequence (initialize twice, seed, then every read and write its methods make) and
  6 seeds × 250 operations on each of five shapes — one to three levels, two patterns under literals, two patterns of
  different depths — every answer compared with a one-document-per-key reference. Across the random runs every kind
  of operation met both outcomes: sets written and skipped in each override mode at every level, reads with and
  without a value at every level, wildcard reads that matched and did not.
- Eight service defects made by hand — a null that patches instead of deleting, the subtree delete dropped,
  set-if-absent tested against the marker, the last wildcard match taken, a merge that replaces, set-if-absent
  ignored at an entity, `{}` for an empty subtree, a subtree set that keeps what it replaced — each failed 4–6 of the
  differential suite's 6 tests; merges run outside a batch failed the atomicity and one-batch tests; a subtree
  prefix on the raw id failed the hard-ids test.
- Core 139 → 216 tests; ESLint 0 errors (64 → 65 warnings: the unused parameter on the new abstract method, as on
  every abstract method in that file); declarations regenerated, `check:types` clean over 40 subpaths.

**Review, PR #164 — 2026-09-25.** CodeRabbit raised six findings. Each was checked against the code; all six held, and
each defect was reproduced before it was changed.

- A subtree set-if-absent/-present tested its condition with a query ahead of its batch; the branch set in a single
  document did the same ahead of its `json_set`. A new fixture hook, `interleave( predicate, write )`, lands another
  request's write just before the unit of work a test picks. The three race tests built on it failed against the old
  code. Two instances seeding one collection at once lost the first one's evaluation. A subtree written or deleted
  just before was replaced or re-created. A branch value stored just before was overwritten, and one deleted just
  before came back. Now the branch set is one statement per mode and the subtree set is guarded (§4). The differential
  suite drives 405 guarded subtree sets (205 went ahead, 200 were skipped) and still agrees with its reference
  throughout.
- `keys/match` moved from `LIKE` to `GLOB` (§4): `a_b` had matched `A_b`, and the plan read every live key.
- A store that names its own `stateUrl` sent the configured service's bearer token there, and inherited its plain-HTTP
  exemption. Both now come only from the store's own settings. Reproduced with the token configured: the stub behind
  a store's own address received `Bearer configured-secret`.
- The table in §3.2 escaped none of its pipes, which a table row splits on even inside a code span. Rendered with
  markdown-it 15, each of the three rows came out as a lone backtick and an `S`, with the rest of the row lost.
- `getJSONValue`'s documentation promised Redis's wildcard behaviour on every backend. It now states each case: Redis
  resolves a wildcard anywhere, the D1 service only at an entity position of a partitioned document, and elsewhere
  over HTTP a segment is a literal key.
- Nine hand-made defects in the fixes each failed 1–11 tests: a guard condition dropped from the delete or from the
  upsert, the verdict inverted, the root tested against its entities instead of its marker, the skip read from the
  wrong statement, each branch condition dropped, the bracket unescaped, and the token inherited again.
- The protocol 29, partitioned documents 35, the differential suite 6, stores end to end 12; core 216 → 222 tests.
  ESLint 0 errors, 65 warnings (unchanged); declarations regenerated, `check:types` clean over 40 subpaths.
