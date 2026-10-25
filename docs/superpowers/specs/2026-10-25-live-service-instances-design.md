# Design — A call to a service with no running instance is refused at once

| | |
| --- | --- |
| **Date** | 2026-10-25 |
| **Packages** | `packages/core` |
| **Status** | Decided by Boris on 2026-10-25 (§3, ABO-73 option A); the rules in §4 follow from the decision and the measurements in §7. |
| **Version target** | core `1.21.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-560`](https://belleal.youtrack.cloud/issue/CA-560), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11); asked for by Abominations' ABO-73 |

---

## 1. Why

A call to a service whose instances have all stopped is accepted, and then waits out the whole `executionTimeout`,
180 s by default, before it fails with `E_COM_SERVICE_EXEC_TIMEOUT`. Its request sits in a queue that nobody reads.
Abominations met this in its service checks (CP-E §8, ABO-43): a call to a service that had been shut down hung for
the full three minutes. A gateway in front of such a service holds the user's request for as long, and anything
retrying behind it piles up.

It is the same after a clean stop and after a crash, and with one instance or several. Nothing in core's suite started
a real provider and stopped it, so nothing had seen it.

## 2. What exists

- **The catalog.** A `ServiceProvider` adds each alias it serves to `ti:services:registry:catalog:<domain>`
  (`SERVICE_REGISTRY_ADDRESS`) when it starts. Nothing takes an alias out. The set is one per domain, shared by every
  instance of it.
- **The caller's check.** `findServiceInRegistry` in `components/service-caller.js` asks whether the alias is a member
  of that set, and nothing else. A member is called; anything else is refused with `E_COM_SERVICE_NOT_REGISTERED`
  (3003).
- **The heartbeat.** Every instance writes `ti:services:registry:health:<domain>:<instanceID>`
  (`SERVICE_HEALTH_CHECK_ADDRESS`) once a second with a 3 s expiry (`SERVICE_HEALTH_CHECK_INTERVAL`,
  `SERVICE_HEALTH_CHECK_TIMEOUT`), unless the health check is switched off (`TI_SERVICE_HEALTH_CHECK_ENABLED=false`) or
  `reportHealthy` is overridden. Nothing reads it.
- **The cache contract** has `addToSet`, `isSetMember` and `membersOfSet`, but no set removal. It has `hashSetField`,
  `hashGetField` and `hashDeleteField`, but no way to list a hash's fields. It has no transaction or compare-and-set.

## 3. Decided (Boris, 2026-10-25)

Of two fixes put to him, a **live-instance check** (option A), not a last-instance-out purge of the catalog (option B):

- each provider instance records itself in a per-domain roster when it starts, and removes itself on a clean stop;
- the caller accepts an alias only while at least one recorded instance is running, and otherwise answers
  `E_COM_SERVICE_NOT_REGISTERED` at once;
- a clean stop is seen at once and a crash within the heartbeat's expiry, and several instances per domain stay
  correct.

## 4. The design

### 4.1 The roster

One hash per domain, `ti:services:registry:instances:<domain>`, under the new setting
`serviceConfig.serviceInstancesAddress` (`SERVICE_INSTANCES_ADDRESS`):

| Field | Value | Written by |
| --- | --- | --- |
| `ti-<uuid>` (the instance ID) | `{ heartbeat: true \| false, startedOn }` | the instance: on joining, and on every beat after it |
| `~roster` | `true` | every join and every leave; never removed |

- **A record is watched** when it says `heartbeat: true`: the instance's own heartbeat key tells whether it is still
  running. The flag is set only when that key was written before the instance joined. A record must never promise a
  heartbeat before there is one, or a caller would read a live instance as dead, and the next instance to start would
  drop it.
- **A record is unwatched** when it says `heartbeat: false`: the health check is off, or `reportHealthy` is overridden
  without writing the built-in key. Such an instance counts as running for as long as it is recorded. That is how
  every instance counted before 1.21.0.
- **The marker keeps "no roster" apart from "nobody left".** A domain whose providers predate 1.21.0 has no roster,
  and must be called as before. A roster whose last record has gone must not look like that. Instance IDs all begin
  with `ti-` (`ServiceInstance` adds it), so `~roster` cannot collide with one.

The module is `components/service-roster.js` (`#service-roster`): `join`, `confirm`, `leave` and `isLive`.

### 4.2 A provider's start and stop

- **Join, once `onStart` has finished** (`#postStart`). Before that the instance has nothing to answer with.
  1. One beat first, through `reportHealthy()`, so that an override is honoured. The record is watched only if that
     beat wrote the built-in key.
  2. Drop the records of instances that died: the watched ones whose heartbeat key has expired.
  3. Write the instance's record, then the marker. In that order, a caller never finds a kept roster with nobody in it
     while the first instance is joining.
  4. Only then schedule the regular beat and log the start.
- **Every beat after the join rewrites the record as watched** (`confirm`). A record that was lost, or dropped while
  the instance's beats had paused, comes back within a beat.
- **Leave on a clean stop** (`#preStop`), before `onStop` shuts the exchange down. Callers stop sending while requests
  are still being received.
  1. Stop beating: no new beat starts once the stop has begun.
  2. Wait for the join and for any beat still under way. Either landing after the removal would write the record back,
     and a join records the instance as running whether it is watched or not.
  3. Write the marker again, then delete the record. Writing the marker first is what keeps a roster that was lost
     while the instance ran from vanishing into a domain without one.
- **A stop that arrives while the instance is still starting** has already run by the time the join would. The join
  sees the stop and records nothing, and no beat is scheduled after it.
- **A start that fails after the join leaves again.** Should scheduling the beat throw, `start()` rejects, and
  `bin/start-instance.js` exits without a stop. The record is taken back first, through the same steps as a clean
  stop's leave and nothing of `onStop`, so the instance does not count as running until its heartbeat expires, or for
  good were it unwatched.
- **A failure is logged, not fatal.** A join that fails leaves the instance unrecorded, and callers may refuse it until
  a beat records it (with the heartbeat on, the next one does). A leave that fails leaves the record for its heartbeat
  to expire.
- **Only providers join**, and only with the message exchange on: a `ServiceConsumer` (a web server) serves no calls,
  and a provider without the exchange takes none.

### 4.3 The caller

`findServiceInRegistry` reads the catalog and the roster together:

| Catalog has the alias | Roster | Result |
| --- | --- | --- |
| no | — | refused, `E_COM_SERVICE_NOT_REGISTERED`, as before |
| yes | none (no fields at all) | called: the providers predate 1.21.0 |
| yes | any unwatched record | called |
| yes | only watched records, at least one with a live heartbeat | called |
| yes | the marker alone, or only watched records whose heartbeats have expired | refused at once, `E_COM_SERVICE_NOT_REGISTERED`, with `details` naming the domain and the alias |

The code is the one a caller already handles for an unknown service, so nothing upstream changes. The roster is read
beside the catalog, and the heartbeats after the roster (one `MGET` through `getValues`), so the check costs one round
trip more than the membership test did. The heartbeats are read only when every record is watched.

### 4.4 The cache contract

`CacheProvider#hashGetAll( key )` is new, under `HASH_FIELDS`: every field of a hash as a map, empty when the hash does
not exist. The roster needs it to know who is recorded.

- **Redis** answers it with `HGETALL`. ioredis returns an object, inside a transaction too, and `{}` for a missing hash
  (measured, §7). The map is built without a prototype, because the field names are not the framework's to trust: one
  named `__proto__` would otherwise repoint the map instead of becoming an entry.
- **`HttpCacheProvider` leaves it abstract**, as it leaves `hashSetFields`. Its protocol carries the hash methods a
  field at a time. A deployment that takes service calls runs the exchange on Redis, and its catalog already needs
  `SETS`, which the HTTP backend does not declare either.
- **A backend without it leaves calls as they were.** An application's own backend, written for the earlier contract,
  rejects `hashGetAll` as an abstract method call. The caller then counts every domain as having a running instance,
  which is how every domain counted before 1.21.0, and the process logs one WARNING saying so. Passed on, the
  rejection refused every service call, which a minor release must not do (the review pass, §10).

This is the one addition to the contract. The decision card had said option A needed none. The roster as a set would
have, and could not shrink (§5).

### 4.5 Upgrading

- **Callers before providers** is safe. A caller on 1.21.0 finds no roster for a domain whose providers are older, and
  calls it as before.
- **Providers before callers** is safe. An older caller never reads the roster, and still hangs on a stopped service
  until it is upgraded.
- **Instances of one domain must not mix versions** before and after 1.21.0 once a roster exists. An older instance
  keeps no record. Once the newer instances have gone, a caller reads "nobody left" while the older one runs, and
  refuses calls it would answer. That is the state a **rollback** leaves: delete the domain's roster key
  (`DEL ti:services:registry:instances:<domain>`) when going back to an older provider.

## 5. Rejected

- **A last-instance-out purge of the catalog** (option B). It does nothing for a crash, which still hangs for the full
  timeout. Without a transaction, an instance that starts while the last one is stopping can have its aliases deleted
  after it added them.
- **The heartbeat keys alone.** A caller could look for any live heartbeat of the domain with a pattern match. That is
  a `KEYS` or a `SCAN` on every call, and an instance with the heartbeat off would read as dead while it runs.
- **A roster that is a set.** The contract has `addToSet` and `membersOfSet`, but no set removal, so an instance could
  never leave one. Adding set removal instead of `hashGetAll` would have been the same size of change, and a set has no
  room for the `heartbeat` flag.
- **Every record treated as watched.** An instance with the heartbeat off, or with its own `reportHealthy`, would be
  refused three seconds after it started.
- **Pruning on every call.** The caller only reads. Writes to the roster come from the instances, on their own start
  and stop, so a dead record costs a caller one heartbeat lookup until the next instance starts, never a wrong answer.

## 6. Limits

- **A crash is seen only once its heartbeat expires**: up to `SERVICE_HEALTH_CHECK_TIMEOUT` (3 s) plus a beat. A call
  made in that window is accepted and waits out the timeout, as every call to a crashed instance did before.
- **An unwatched instance that crashes keeps its record** until it is removed by hand: nothing can tell it from a
  running one, so pruning leaves it alone. While it is there every call to the domain is accepted, and one that no
  instance is left to answer hangs as before.
- **A gap with no instance running refuses calls that used to wait.** A call made between one instance stopping and the
  next one joining (a single-instance domain restarting, for example) is refused at once. Before, its request waited
  in the queue, and the next instance answered it within the timeout. That is what "refused at once" means when
  nobody is there; starting the new instance before stopping the old one leaves no gap.
- **A long pause can read a live instance as dead.** If an instance's beats stop for longer than the expiry (a stalled
  event loop, a lost connection), callers refuse it, and the next instance to start drops its record. Its next beat
  writes the record back.
- **The two start and stop races of §4.2 are closed by reading, not by a test.** Both windows are a few milliseconds
  wide between `onStart` finishing and the join landing, and no hook lets a test hold a provider there.

## 7. Measurements

- **ioredis `HGETALL`** (ioredis 6.0.0, Redis 7.0.15): inside `multi()` it answers `[ null, { field: "value", … } ]`, and
  `[ null, {} ]` for a hash that does not exist.
- **The hang on 1.20.1.** The suite in §8, with start-up readiness taken from the heartbeat (1.20.1 keeps no roster to
  wait for): 7 of the 9 call cases fail. In six the call was still waiting after 2 s, so it would have waited out the
  180 s. The seventh needs a roster to exist. The two
  that pass pin what must not change: a running provider answers, and a domain without a roster is still called.
- **On 1.21.0** all 11 cases pass on Redis 7.0.15 and on `redis:8-alpine` (8.10.2), Node 24.22, every refusal within
  the suite's 1 s bound.
- **A killed instance's heartbeat** is gone within its 3 s expiry plus 1.5 s in every run; the suite asserts it.

## 8. Verification

- **`test/service-caller.live-instances.test.js`** (11 cases). A real Redis, providers started by
  `bin/start-instance.js` as their own processes, stopped with SIGTERM (a clean stop) or killed with SIGKILL, and a
  consumer in the test's process. Only one `ServiceInstance` may exist per process, which is why the providers cannot
  run in it too. A provider counts as started once its record is in the roster, not at its first heartbeat: it beats
  once before it joins, and a test that went on at the heartbeat would race the join.
  1. A running provider answers.
  2. The only instance stops cleanly: refused at once, while the catalog still lists the alias.
  3. The same after the roster was deleted while the instance ran: the next beat writes the record back, and the leave
     writes the marker.
  4. The only instance is killed: refused at once once its heartbeat has expired.
  5. Two instances: one stops and the other still answers; then both have stopped and the call is refused.
  6. The heartbeat is off: refused at once after a clean stop.
  7. `reportHealthy` overridden to write nothing: still answers three seconds on, and is refused at once after it stops.
  8. A domain whose roster is gone is called on the catalog alone, as an older provider's is.
  9. A killed instance's record is dropped when the next instance starts.
  10. `hashGetAll` on Redis: every field parsed, a field named `__proto__` kept as an entry, `{}` for a missing hash.
  11. A start that fails after joining, its health report's scheduling made to throw: the process exits with no record
      left, and the call is refused at once.
- **Each guard fails its own case when removed:**

  | Guard removed | Fails |
  | --- | --- |
  | the marker written on leave | 3 |
  | `confirm` on every beat | 3 |
  | the record watched only after a heartbeat | 6, 7, 8 |
  | pruning on join | 9 |
  | leaving on a clean stop | 2, 3, 5, 6, 7 |
  | the caller's roster check | every refusal case |
  | the null-prototype map | 10 |
  | leaving when a start fails after the join | 11 |

- **Two more files, from the review pass** (§10), run without Redis on the HTTP backend and the stub state server:
  `service-instance.post-start-failure` (a throw while scheduling rejects `start()`) and
  `service-roster.without-hash-get-all` (a backend without the method leaves calls as they were).
- **Without Redis the suite skips**, so a developer without one still gets a green run. CI runs a `redis:8-alpine`
  service and sets `TI_TEST_REDIS_REQUIRED`, which turns the skip into a failure, so CI never passes by skipping.
- **Types** regenerated, and `check:types` clean.

## 9. Not in this change

- **A handler that returns its own `serviceParams`** has its response flagged as tampering, and the call then waits
  out the timeout. `decycle` writes the shared reference as `$ref` before the hash is taken. The test fixture returns a
  copy. It is a defect of its own, filed as [`CA-561`](https://belleal.youtrack.cloud/issue/CA-561).
- **A per-call deadline in a gateway.** The roster cannot see a crash before its heartbeat expires, so a caller that
  must answer quickly still needs its own deadline. That is the application's.
- **A configurable `executionTimeout` by environment.** It is a setting only, as before.

## 10. The review pass

`code-review` at high on `origin/master...HEAD` raised 10 findings. 2 were fixed, each with a test that fails without
the fix. 3 were limits of the design, now stated in §4.5 and §6. 5 were declined.

**Fixed:**
1. **A throw while scheduling the health report left `start()` waiting forever.** `#postStart` resolved from inside the
   join's callback, so the throw became an unhandled rejection. Before the join it rejected `start()`, and it does
   again. `test/service-instance.post-start-failure.test.js` replaces node-schedule's `scheduleJob` with one that
   throws.
2. **A cache backend without `hashGetAll` refused every service call** (§4.4). An application's own backend written for
   the earlier contract would have broken in a minor release. `test/service-roster.without-hash-get-all.test.js` runs
   the roster on `HttpCacheProvider`, which leaves the method abstract.

**Stated as limits:**
- **A restart gap refuses calls that used to wait in the queue** (§6). It is what option A means when nobody is there.
- **The marker outlives a rollback** (§4.5). Recovering by itself would need a key scan on every refused call. A stack
  deployed from one repository rolls its callers back with its providers, and an older caller never reads the roster.
- **An unwatched record that crashed stays** (§6). Nothing can tell that instance from a running one.

**Declined:**
- **"A healthCheckInterval longer than healthCheckTimeout would refuse live providers"**, and **"a provider and a
  caller with different healthCheckAddress values"**. Neither can be configured. `utils/config.js` reads
  `serviceConfig` from core's own `bin/settings.json`, deep-frozen, and the only override it takes is
  `TI_SERVICE_HEALTH_CHECK_ENABLED`. The interval is 1 s and the expiry 3 s in every process.
- **"Every call now makes O(instances) Redis calls, and the comment's one extra round trip is wrong."** The heartbeats are
  read with one `MULTI` of `GET`s (`getValues`), after the `HGETALL` and beside the `SISMEMBER`. That is one round trip
  more than before, as the comment says. A short-lived per-process cache of the answer would save that round trip at
  the cost of a refusal that lags a stop. That is a follow-up if a measured load ever asks for it.
- **"Every beat now writes twice."** It writes the heartbeat and an `HSET` of the record: one more write per instance
  per second. That write is what brings a lost or pruned record back (case 3 in §8 fails without it). Writing it only
  when missing would need a read per beat instead.
- **"`hashGetAll` would map a flat-array reply by index."** The Redis client is the one `redis-integration` builds, and
  no application configures it. ioredis 6.0.0 answers `HGETALL` with an object, inside a transaction too (§7).

**CodeRabbit, on the PR:**
- **A start that failed after the join left its record** (fixed). The first fix above made a throw while scheduling
  reject `start()`, but by then the join had landed, and `bin/start-instance.js` exits on a rejected start without a
  stop. The instance stayed recorded until its heartbeat expired, and for good had it been unwatched. `#postStart` now
  runs `#preStop` before it rethrows. CodeRabbit suggested `stop()`; `#preStop` is narrower on purpose. Only the join
  and the health job are the start's own to take back. `stop()` would also run `onStop` and shut the cache down, which
  on a rejected start is the caller's decision: an application that catches the rejection and calls `stop()` would
  run both twice. Case 11 in §8 fails without it, with the record still in the roster.
