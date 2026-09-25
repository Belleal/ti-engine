# Design — Deliver less: labels as a cached bundle, compression, revalidated fragments

| | |
|---|---|
| **Date** | 2026-09-25 |
| **Packages** | `packages/web-framework` (the mechanism); `Belleal/competence` adopts it (narrows its client catalogue) |
| **Status** | Implemented — see §6 |
| **Version targets** | web-framework `1.38.1` → `1.39.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-174`](https://belleal.youtrack.cloud/issue/CA-174) (subtask of `CA-11` Platform & Quality) |

---

## 1. What prompted it

competence is moving to Cloudflare (CA-175), and the question asked was whether the label catalogue — "1.36 MB,
and growing, delivered on every refresh" — would make that expensive. The answer needed a measurement rather than a
recollection, so this record starts from one.

### 1.1 Measured

A real competence 3.50.0 server (web-framework 1.37.0, Redis with RedisJSON) driven by Chromium through CDP, English
UI, one signed-in manager. Bytes are `encodedDataLength` — what crossed the wire, headers included.

| Moment | Requests | On the wire |
|---|---|---|
| First visit — the login page, cold cache | 14 | **1,486 KB** |
| Sign-in and application boot | 18 (10 of them 304) | 488 KB |
| **Every refresh (F5)** | 15 (10 of them 304) | **484 KB** |
| A screen switch | 2–10 | 9–68 KB |

What makes up those numbers:

1. **Nothing is compressed.** No response carries `Content-Encoding`. The largest assets compress four to seven
   times: 1,201 KB → 304 KB gzip → 266 KB brotli.
2. **`/app/config` carries the entire per-language label catalogue, `no-store`, on every page load** — 410 KB in
   English and **745 KB in Bulgarian**. The 1.36 MB figure is the source file, which holds both languages; a user
   receives one. It is fetched twice around sign-in, anonymous and then authenticated, with identical labels.
3. **Three quarters of the catalogue is never read in the browser.** competence resolves competency descriptions and
   scope anchors on the server, into the evaluation payloads. The browser reads `interface.*`, `error.*`,
   `framework.*`, and — in two Insights drills — `competency.name.*` and `category.sub.name.*`. Static analysis finds
   812 `x-text-label` attributes and ~270 `getLabel` call sites, all in those groups; a 13-screen walk resolved 285
   distinct keys. `competency.scope` and `competency.description` are 305 KB (en) / 571 KB (bg).
4. **Screen fragments are `no-store`** although they are static templates: 5–59 KB re-sent on every screen switch.
   Only the shell (`index.html`) carries a nonce placeholder and only the login fragment a CSRF placeholder.
5. **Static assets revalidate on every page load** (`max-age=0, must-revalidate`) — 10–11 conditional requests per
   refresh, each a round trip to the application.
6. **Every static asset request goes through the session middleware.** `/static` is mounted after
   `express-session`, so a stylesheet costs a session read and — `rolling: true` — a TTL write that express-session
   awaits before ending the response. Counted at the store with `MONITOR`: one refresh issued 15 session reads (plus
   their touches, one per request) and 7 document reads.
7. `favicon.ico` is a single 256×256 PNG inside an ICO: **75 KB**.
8. `/me` answers the user's identity with no `Cache-Control` at all.

### 1.2 What it costs on Cloudflare — the framing, corrected

Bandwidth is not where the money goes. Workers bill no egress; container egress is $0.025/GB after 1 TB a month
(Containers pricing page, updated 2026-08-28). At 484 KB a refresh, the included terabyte is ~2 million refreshes.

What *is* billed is **the container being awake and busy**, and every request that reaches it — each one a Worker
request, a Durable Object request, CPU time, and here up to two store round trips before the first byte. Items 2, 4,
5 and 6 above are that cost. And the user-facing cost is latency: half a megabyte per refresh is slow on a phone.

So the goals are: nothing re-sent that has not changed; nothing sent that is never read; and requests that do not need
the application not reaching it.

## 2. Decisions

1. **Labels become a content-addressed bundle.** `GET /app/labels/<language>/<hash>` serves one language's client
   catalogue. `/app/config` carries `labelsBundle: { language, hash, url }` instead of the tree.
   - A request whose hash matches is answered `public, max-age=31536000, immutable` — legitimately, because the URL
     *is* the content's hash (the rule this repository learned twice: never promise `immutable` for a URL that is not
     content-addressed). The browser then serves the catalogue from its own cache with **no request at all** until a
     release changes it.
   - A request whose hash does not match — a page loaded just before a deploy — gets the current catalogue with
     `no-store`: usable for that page, cached nowhere.
   - The labels are deep-frozen at boot (core `localization`), so a catalogue cannot change inside a process; the
     hash is computed once per language and held. Language is validated against a strict pattern and the cache is
     bounded, so the route cannot be used to make the process build catalogues without limit.
   - **The hash is the "has it changed?" signal** the original request asked for. `localStorage` was considered and
     rejected as the mechanism: the HTTP cache already stores by URL, needs no code to invalidate (a new hash is a new
     URL), has no quota or private-mode failure mode, and does not even issue a conditional request for an
     `immutable` response. The client keeps the tree in memory exactly as before.
2. **An application narrows what the browser receives** through a virtual `getClientLabels( language )`, defaulting to
   everything `localization.getAllLabels` returns. competence drops `competency.scope` and `competency.description`:
   **410 → 105 KB raw, 26.5 KB brotli** (en); **745 → 174 KB, 32.5 KB** (bg).
3. **Responses are compressed** — brotli or gzip by `Accept-Encoding`, through the `compression` middleware (1.8.x,
   which added brotli). Never a response that embeds a CSRF token: the login fragment carries one, and a compressed
   secret next to attacker-influenced bytes is the BREACH shape. Nothing in the framework reflects request input into
   that fragment today; the exclusion makes that not matter.
4. **HTMX fragment responses revalidate instead of being re-sent**: `private, no-cache` with the ETag Express already
   computes, and `Vary: HX-Request` because the same URL answers a full page to a navigation and a fragment to HTMX.
   A repeat visit to a screen becomes a 304. `private` keeps them out of any shared cache; `verifyAccess` still runs
   before the 304 is decided, because Express decides freshness inside `send`. Full pages keep `no-store` — they carry
   the per-request nonce — and so does any fragment that embedded a CSRF token.
5. **`/static` and `/.well-known` are served before the session middleware** — after the nonce, Helmet and CSP
   handlers, so every security header still applies. A stylesheet no longer reads or writes a session, and no longer
   carries `Set-Cookie`.
6. **Session TTL writes are throttled.** `SessionStore#touch` skips the store write when this instance wrote that
   session's expiry less than 60 s ago. To keep the store from expiring a session before its cookie, every write sets
   the TTL to the cookie's `maxAge` **plus** that interval: a write at *t₀* expires at *t₀ + M + I*, the cookie at
   *t₁ + M*, and a touch is skipped only while *t₁ − t₀ < I*.
7. **Static references in HTML carry a content hash.** Every `src`/`href` pointing at `/static/…` in a served fragment
   gains `?v=<sha-256 prefix>` of the file express.static would serve for it (the same reverse-order resolution, so an
   application's override is the file hashed). A `/static` request whose `v` matches is served `immutable`; any other
   keeps the existing revalidating policy. A fingerprint is revalidated against the file's size and mtime before it is
   trusted, so an edited file — in development, or a tree replaced under a running process — gets a new URL at once;
   that made a development-only exemption unnecessary, and it was dropped from the first draft of this record.
8. **A 7 KB favicon** — the same image at 16/32/48 px instead of one 256 px PNG.
9. **`/me` is `no-store`.**

## 3. Deliberately not done

- **Per-screen label slices delivered with each fragment.** Measured after decisions 1–2, the whole client catalogue
  is 26.5 KB (en) / 32.5 KB (bg) brotli, downloaded once per release. Of that, the chrome every screen needs is
  11.5 / 14.5 KB, and every per-screen group is 0.3–3.4 KB. Slicing would save at most ~15–18 KB, once per release,
  and would need each fragment to declare the label prefixes its JavaScript assembles at run time — competence builds
  about forty keys that way (`"interface.insights.cycle.reports." + key + "." + field`), and a missed prefix degrades
  silently to fallback text on one screen. Worth revisiting only if the `interface` groups themselves grow by an order
  of magnitude.
- **Minifying or bundling** the JavaScript and CSS. Compression takes 1.2 MB to ~0.3 MB; with fingerprinted URLs that
  is paid once per release per browser. A build step is not justified by what remains.
- **An HTMX history cache.** `historyCacheSize: 0` with `refreshOnHistoryMiss` makes Back a full reload. HTMX keeps its
  history snapshots in `localStorage`, which for this application means rendered screens with personal data at rest
  in the browser. After this change a reload costs ~15 KB instead of ~484 KB, which removes the reason to revisit it.
- **Deferring the application bundle on the login page**, and **pre-assembling `/` for a signed-in user** (the boot is
  a waterfall: shell → `/app/enter` → dashboard → its data). Both are latency, not bytes, and both are shell changes
  with their own risk.
- **Self-hosting the web fonts** competence's shell loads from Fontshare and Google Fonts. A privacy and latency
  question for the application, not a framework one.

## 4. Compatibility

- `/app/config` no longer carries `labels`. The shipped client fetches `labelsBundle.url` and assigns the tree to
  `configuration.labels`, so `getLabel`, `x-text-label` and any application code reading `configuration.labels` see
  what they saw before. A server that still answers `labels` directly (an override, or an older release behind a new
  shell) is honoured as-is.
- An application overriding `processDataRequest( "config" )` and spreading `super`'s result — competence does —
  carries `labelsBundle` through unchanged.
- No configuration is required. The compression, the fragment policy and the reordering apply to every consumer.

## 5. Testing

- The label route: matching hash → `immutable`; mismatching → `no-store` with the current catalogue; malformed
  language → 404; `getClientLabels` narrowing reaches the hash.
- The client: `init()` against a stubbed `fetch` — config, then the bundle with the browser's default cache mode (not
  `no-store`, which `sendRequest` uses and which would defeat the whole point), then `/me`; `isInitialized` only after
  the labels are in; a legacy `labels` payload honoured.
- The handler: fragment responses `private, no-cache` + `Vary: HX-Request`; full pages and a CSRF-bearing fragment
  `no-store`; a second request with `If-None-Match` answered 304.
- The middleware order: a `/static` request with a session cookie reaches the store zero times and carries no
  `Set-Cookie`.
- The session store: a touch inside the interval writes nothing; the TTL carries the slack.
- Fingerprints: a reference gains `?v=`, the application's override is the file hashed, a matching `v` is `immutable`
  and a stale one is not.
- Measured again, end to end, against the same server and walk as §1.1.

## 6. Implementation log

**2026-09-25 — implemented as designed, one deviation (decision 7, above).**

- `components/static-fingerprint.js` (new, `#static-fingerprint`); `TiWebServer.staticResponseCacheControl` and
  `TiWebServer.createCompressionHandler` are static so a test mounts exactly what the server does.
- `TiWebAppManager#getClientLabels` / `#getLabelsBundle` / `#findLabelsBundle`; `labelsBundleHandler`; the client's
  `_loadLabels`. At most 16 languages' catalogues are held — a session's language comes from its identity provider's
  claims, so it is not a closed set — and one beyond that is built and served, not held.
- One test trap worth recording: a revalidation test must use `node:http`, not `fetch`. The Fetch standard turns any
  request carrying `If-None-Match` into a `no-store` request with `Cache-Control: no-cache`, which Express correctly
  reads as an end-to-end reload and answers in full — the 304 path looks broken when it is not.
- Tests: 556 → 595 (five new files). Lint 0 errors; `check:types` clean.

**Measured end to end** — competence 3.50.0 on core 1.16.0, the same Chromium walk as §1.1 against the same Redis,
web-framework 1.38.1 from npm versus this tree. Bytes are `encodedDataLength`.

| Moment | Before (1.38.1) | After |
|---|---|---|
| First visit (login page, cold cache) | 14 requests, 1,482 KB | 15 requests, 351 KB |
| Sign-in and application boot | 18 requests (10 × 304), 488 KB | 19 requests (0 × 304), 19 KB |
| Every refresh (F5) | 15 requests (10 × 304), 484 KB | 16 requests (0 × 304), 16 KB |
| Thirteen screen switches | 292 KB | 88 KB (first visits; a repeat is a 304) |
| Refresh on a deep link | 488 KB | 11 KB |
| Store operations per refresh (`MONITOR` + touches) | 15 session reads + 15 touches + 7 document reads | 4 session reads + 0 touches + 7 document reads |

The first visit still carries competence's whole catalogue (409 KB → 105 KB brotli): narrowing it is competence's
half of this change, measured at 26.5 KB (en) / 32.5 KB (bg) brotli once it lands.
