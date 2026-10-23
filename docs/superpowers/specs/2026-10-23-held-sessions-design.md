# Design — Sessions held in the process

| | |
| --- | --- |
| **Date** | 2026-10-23 |
| **Packages** | `packages/web-framework` |
| **Status** | Decided by Boris on 2026-10-23 (§3): held until written, opt-in. |
| **Version target** | web-framework `1.61.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-557`](https://belleal.youtrack.cloud/issue/CA-557), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11) |

---

## 1. Why

On 2026-10-23 production's D1 export showed small calls stalling for 1 to 5.5 s with no large read in flight, and 141
of its 269 calls were the session store's. CA-556 took the big reads off every screen and CA-557's first PR took the
cycles. Item 2 of the card asked what the session store costs and whether the expiry touch could be throttled.

## 2. What was measured

Competence 3.147.2 on web-framework 1.60.0, run over core's D1 state service on SQLite, sessions and records both in it,
the way the Worker serves the container. A Supervisor signed in and clicked through all 29 screens in real Chromium, and
every state call was counted.

| | Count |
| --- | --- |
| Requests reaching the application (not `/static`) | 95 |
| State calls | 194 |
| Session-store calls | 99: 90 `hashes/get`, 4 `hashes/set`, 4 `keys/expire`, 1 `hashes/delete` |

* **The touch is already throttled**: once a minute per session since 1.39.0 (CA-174). That premise of the card did not
  hold.
* **Every request that reaches the session middleware reads its session.** express-session calls `store.get` for each,
  and a screen that makes 9 or 10 requests pays 9 or 10 reads. That is the 90.
* The share matches production's: 99 of 194 here, 141 of 269 there.

## 3. Decision

Boris, 2026-10-23, from three options: **hold until written, as an opt-in**. The others were to hold each session for
60 seconds and read it again (safe with more than one container, saves less), and to leave sessions as they are.

## 4. Rules

* **Off by default.** `sessions.held` (`TI_WEB_SESSIONS_HELD`) ships `false`. A deployment says it serves its sessions from
  one process before they are held, as competence's held evaluations and cycles assume of their records. A session
  another process changes or signs out is not seen by a process holding it. `TiWebServer` logs a NOTICE at start when it
  is on.
* **The store is written first.** `set` and `destroy` go to the state store, and the copy changes only once the write has
  landed. A read is answered from the copy only after a read or a write of this process put it there.
* **A copy is dropped when a write to its session starts**, and a read already in flight does not hold what it gets: it
  could have read the session before the write landed.
* **Writes to one session that overlapped hold nothing**: the store keeps whichever it applies last, and the order the
  answers come back in does not say which. The next read takes the store's.
* **A failed write puts the session in doubt for two minutes**, during which it is read from the store and not held. A
  write that timed out may still be applied (core 1.20.1 never sends one twice for that reason), so a sign-out that
  timed out and landed late must not leave the session signed in here.
* **A copy is the session as it was sent.** It is serialized when the write starts, as the provider serializes what it sends, since express-session hands over its live session and the request goes on changing it.
* **A read that overlaps a write is never held**, whichever side of the write it was answered on: a write's start and its end both drop the reads in flight.
* **A touch moves only the copy it found.** One held since came from a later write, whose own expiry stands.
* **A call that throws before it returns a promise** is a failed write, and a write ends once however often it is ended.
* **A copy never outlives the store's expiry.** `set` holds it until the expiry it wrote, counted from when the write
  started. A read holds it for one touch interval, the least the store can have left, since every expiry carries that
  interval over the cookie's lifetime; the touch that ends the request moves the expiry to the one it writes.
  express-session 1.19.0 does not check expiry when it reads, so the store does.
* **Each caller is answered a copy of its own**, parsed from the text the store keeps, and on a later turn, as a store
  read is: express-session copies a session's fields onto `request.session` without cloning them.
* **At most 10,000 sessions are held**; past it the expired go first, then the one answered least recently. A read
  that finds a copy moves it to the end of the order, so a busy session is not the first to go for having been held
  first.

## 5. What was rejected

* **A memo for the length of a request.** The read every request makes is the cost.
* **Asking the store whether a session changed.** Still one round trip per request.
* **Holding by default.** It changes a framework's posture for every deployment, and only the deployment knows whether
  it runs one container.

## 6. Verification

`test/session-store.held.test.js`, 29 cases, over a store that keeps session fields as text and can hold any call until
released. Removing each rule in turn fails its own case: the dropping of a read at the start of a write, the check for a
write in flight, the two minutes of doubt, the touch moving the expiry, the expiry check, the limit, the copy per caller,
the opt-in itself, and the five rules the review pass added (§7).

## 7. The review pass

A separate pass over the whole diff (`code-review` at `high`, `origin/master...HEAD`) found ten. Verified against the code
and measured:

* **Fixed, each with a test that fails without it:** a read begun while a write was in flight and answered before it
  landed was held when it returned after, re-holding the session as it was before the write (a sign-out would have been
  undone); the copy was serialized when the write landed, from express-session's live object, not when it was sent; a
  success path whose callback throws ended the write twice and the second end threw inside a `.catch`; a touch that began
  before a newer write replaced that write's expiry with its own; a call that throws before it returns a promise left the
  in-flight count raised for good.
* **Fixed, measured:** at the limit every new session scanned the held map, the in-doubt map and the keys again, to evict
  one; now the sweep runs at most once per touch interval and the oldest goes in constant time (5,000 sets past the
  limit: 1,683 ms before, 791 ms after). The in-doubt map was swept only at the held limit, so failures during an
  outage grew it; it is swept when it reaches the limit too (heap after 60,000 failed writes across 18 simulated
  minutes: 4 MB before, 1 MB after).
* **Fixed, no test:** the held and unheld read were two copies of one block, now one; the new phrase in
  `web-config-env.js`'s description sat in the middle of a long sentence.
* **Declined:** "a held copy is served after the cookie has lapsed". The store's own copy lives to the same instant,
  because every expiry written carries one touch interval over the cookie's lifetime, so an unheld read answers it
  too; the held copy's expiry is a lower bound of the store's, and `never outlives the store's expiry` pins it. A browser
  does not send a lapsed cookie either way.

## 8. The pull request's review

CodeRabbit raised two findings on the pull request, both verified against the code:

* **Fixed, with a test:** `SessionStore#set` serialized the session inside the call, so a session that cannot be
  serialized (a `BigInt` in it) threw to express-session instead of reaching the callback, and held mode serialized
  earlier than the unheld path did. It now serializes up front inside a `try` and hands the failure to the callback, and
  nothing is held or counted in flight for a session that was never sent.
* **Fixed, replaced:** a test that read `web-server.js` as text and matched the option's name proved the source contained
  a string, not that the option reaches the store. `test/web-server.sessions-held.test.js` replaces it: a real
  `TiWebServer` with `sessions: { held: true }` and a cache that counts `hashGetField`, a local sign-in, five
  authenticated requests and no session read after the first; after a sign-out the next request is the sign-in page. With
  the wiring changed to `held: false` its read count fails.

## 9. The second review pass

After the pull request's own review, the `code-review` skill ran again at `high` on the final diff
(`origin/master...HEAD`), as the working agreement asks after a change of substance. It ran after 1.61.0 had been merged
and published, so the fixes below ship as 1.61.1. It reported eight. Each was checked
against the code.

* **Fixed, each with a test that fails on the previous code:**
  * *Overlapping writes.* A held write was kept if it was the latest sent and the last to answer. The store keeps whichever
    it applies last, and answers can come back in the other order, so the copy could be the write the store had overwritten.
    Writes that overlapped now hold nothing (the stub applies the second write at once and answers it last; the next
    read must reach the store).
  * *The env switch failed open.* `tools.toBool` reads every string but `false`, `0`, `no` and `N` as true, measured:
    `off`, `disabled`, ` false`, `false `, `n`, `null` and `nope` all hold the sessions. `TI_WEB_SESSIONS_HELD` now turns on
    for `true` or `1` and for nothing else, since holding is unsound with more than one process.
  * *A hold that throws turned a good read into an error.* The copy was built inside the `.then` that answers the caller,
    so a provider answering with an object that does not serialize (a BigInt) made the read fail. The hold is guarded and
    the caller is answered.
  * *Eviction was first in, first out.* A hit did not reorder the map, so the busiest, longest-lived session was the first
    to go at the limit. A hit now moves the copy to the end, which makes the order least recently answered.
* **Fixed, a comment:** the read copy's note said one touch interval was the least the store could have left. That holds
  for a cookie stamped at the last save; under a rolling cookie, after a touch was skipped, the store can have less left.
  The note now says what is true: the overshoot is under one interval, only when the touch that ends the request does not land, and only
  for a session whose cookie was valid at the read. The reviewer's remedy, capping the copy at the stored
  `cookie.expires`, is not available: that is the cookie of the last save, and a touch changes only the key's lifetime.
* **Declined, with the measurement:**
  * *Serialising twice.* Held mode serialises once on a write and once on a miss, and parses on a hit. Measured with
    `tools.stringifyJSON` and `tools.parseJSON`, 20,000 runs: a 370-byte session 9.0 µs and 2.4 µs, a 2.4 KB session
    22.6 µs and 19.5 µs. The core cache API takes the object, not text, so the provider's own text can't be reused, and
    the cost is microseconds on the request path against the round trip removed from every request.
  * *One sweep timestamp for two maps.* A sweep walks both maps whenever it runs, so one started from the in-doubt map has
    already dropped the lapsed held copies. What lapses in the minute after costs at most one extra store read per new
    session, at the limit, during an outage that put 10,000 sessions in doubt.
  * *A string in a config file leaves it off.* `serverTiming` and the other switches in `web-server.json` are read as
    `=== true` too, and failing closed is the safe side for this one. The env path is now as strict.
  * *A 30-second cookie.* The store keeps a session for the cookie's lifetime plus one touch interval, whatever the
    lifetime is, so the interval is the slack at any `maxAge`; see the comment fix above for the edge that remains.

