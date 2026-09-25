# Design — Screen switches: time the round trip, and skip it for screens that cannot change

| | |
|---|---|
| **Date** | 2026-09-26 |
| **Packages** | `packages/web-framework` (both mechanisms); `Belleal/competence` adopts them (CA-184) |
| **Status** | Implemented — see §6 |
| **Version targets** | web-framework `1.40.0` → `1.41.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-183`](https://belleal.youtrack.cloud/issue/CA-183) (subtask of `CA-11` Platform & Quality); competence's half is [`CA-184`](https://belleal.youtrack.cloud/issue/CA-184) |
| **Follows** | [`2026-09-25-web-framework-delivery-design.md`](2026-09-25-web-framework-delivery-design.md) (CA-174), which left latency out on purpose |

---

## 1. What prompted it

On competence's Cloudflare deployment, reopening a User Guide chapter that had already been opened took 0.6–0.9 s.
DevTools showed the request answered `304`, 1.2 kB. The question asked was whether the container or the framework
was to blame.

### 1.1 Measured

The same guide walk ran in two places.

**Locally, in Chromium.** competence 3.53.2 on web-framework 1.40.0, run as its container runs: core's D1 state
service over `node:sqlite`, Bulgarian. Every call to the state store was timed.

| Request | Server time | Calls to the state store | On the wire |
|---|---|---|---|
| A chapter, first open | 6.1–6.7 ms | 1: the session read, 0.8–1.0 ms | 6.8 kB |
| The same chapter again (`304`) | 4.0–5.2 ms | 1: the session read, 0.8 ms | 0.3 kB |

**In production** (the reported DevTools screenshot):

| Request | Time |
|---|---|
| A chapter, first open (`200`) | 771–859 ms |
| The same chapter again (`304`) | 583–818 ms |
| Every other request that reached the application | 423 ms–1.33 s |

So more than 99% of a revisit is spent outside the process. It is the round trip itself: browser → Worker at the
edge → Durable Object → container, plus one hop back out to D1 for the session. Cloudflare documents that a Durable
Object and its container are not guaranteed to be co-located, and that a container starts at the nearest location
with a pre-fetched image. Where the time goes along that route is competence's problem (CA-184).

Two things belong to the framework:

1. **Nothing in a response says where its time went.** Local measurement gave the process time and the store calls.
   In production those numbers are invisible, so every leg of the route is inference.
2. **Every screen switch is a round trip, even to a screen that cannot have changed.** CA-174 made the switch a
   revalidation: `private, no-cache` plus an ETag, so a revisit is a `304`. That was the right trade for bytes.
   It cannot save time, because the server must render the screen to compare ETags, and the trip costs the same
   whatever comes back. The nine guide chapters are the same for every viewer until the next deployment, and the
   browser asks about them on every visit anyway.

## 2. Decisions

### 2.1 `Server-Timing`, opt-in

1. **`serverTiming: false` in `web-server.json`, overridden by `TI_WEB_SERVER_TIMING`.** Off by default: timings are
   a small disclosure, and a consumer chooses to make it.
2. **When on, every response carries `Server-Timing`**, including static files, `304`s and errors:
   - **`app`** — from the request reaching the process to its headers being written. The middleware that records it
     is mounted first, so nothing the process does escapes it.
   - **`session`** — how long express-session took to load the session, which is the state-store round trip. It is
     present only on requests that pass the session middleware, so a `/static` request has none.
3. **`TiWebServer#describeInstance()`**, a virtual method that returns `undefined` by default, supplies the `app`
   metric's `desc`. A subclass on a container platform returns where the platform placed it; competence reads
   Cloudflare's `CLOUDFLARE_LOCATION`. It is read once, at start. It is sanitised to printable ASCII, because a header
   value outside Latin-1 throws, and quoted.
4. **The header is appended to, never replaced.** A proxy or Worker in front adds its own metrics, and DevTools lists
   them together.

The session write that renews a rolling session's expiry (at most once a minute, CA-174) happens after the headers,
so it is not in the header. It delays the end of the body, not its start.

### 2.2 Content-addressed fragments

1. **An application declares a fragment `immutable: true`** in `addFragment`. The declaration is a promise: the
   fragment renders the same bytes for every viewer and every request until the next deployment. The User Guide
   qualifies. A screen whose data arrives by a separate request also renders the same markup, but it is not what
   this is for: its template changes with releases just the same, and it gains nothing a `304` does not already
   give it. Declaring `immutable` is meant for content that is complete in the fragment itself.
2. **A fragment with `roles` cannot be declared `immutable`**; `addFragment` throws `E_GEN_FEATURE_UNSUPPORTED`. A
   browser's cache belongs to the browser, not the session. A copy cached for one person is served to whoever next
   uses that browser, and served without `verifyAccess`, because the request never leaves the browser. That is
   harmless only for content every signed-in user may see.
3. **One version addresses the whole set.** The version is the first 12 hex characters of a SHA-256 over every
   immutable fragment's markup, taken in identifier order. A per-fragment hash cannot work: chapters link to each
   other, so each hash would contain the other's, a cycle with no fixed point. A per-fragment hash that ignored the
   links would go stale. If only chapter B changed, chapter A's cached copy would keep linking to B's old address,
   and the browser would keep serving the old B from its cache. With one version, any change to any member gives
   every member a new address. A deployment that changes none of them keeps every cached copy.
4. **The markup hashed is what the process would send, before this rewrite**: the file, its components, the
   application's `transformHtml`, and the `/static` fingerprints. A stylesheet change that alters a chapter's
   `?v=` therefore changes the version too. It is rendered as a partial with no nonce and no CSRF token.
5. **Every `hx-get="/app/<id>"` naming an immutable fragment gains `?v=<version>`**, in every served fragment,
   including the shell's sidebar. It runs after the application's transform and the `/static` fingerprinting, as the
   last step of rendering. A reference that already carries a query is left alone, as `/static` fingerprinting does.
6. **`hx-push-url="true"` on the same element becomes `hx-push-url="/app/<id>"`**, and the same for
   `hx-replace-url`. HTMX pushes the URL it requested, so without this the address bar would read
   `/app/help-overview?v=3f2a…`. Rewriting the attribute is scoped to the one start tag, with a tokenizer that reads
   quoted attribute values, so Alpine's `x-show="a > b"` does not end a tag early. It skips comments and the raw
   text of `<script>`/`<style>`.
7. **A request is answered `private, max-age=31536000, immutable` only when both hold:**
   - its `v` is the current version;
   - the markup rendered for this request hashes to what was recorded for that fragment.

   Anything else gets the CA-174 policy, `private, no-cache`. The second check is what makes the promise safe to
   rely on. A fragment whose output depends on the request (a nonce placeholder, a CSRF token, anything an override
   of `transformHtml` adds) never matches, is never cached for good, and is reported once as a warning. A CSRF-bearing
   view stays `no-store` whatever it declares.
8. **Addressing requires the fragment file cache**, which is on unless `TI_WEB_APP_STATIC_CACHE_DISABLED=true`.
   Without it, a file edited under a running process would change its markup while its version could not. The copy
   the browser cached for good would then outlive the edit. With the cache off, which is a development setting,
   nothing is addressed and every fragment revalidates as before.
9. **The version is computed once per process, lazily**, on the first render that needs it. It renders every
   immutable fragment once; competence has ten. A failure is logged, and nothing is addressed.

The address bar and deep links are unchanged. A reload of `/app/help-overview` is a full page, `no-store` as before,
and the page route ignores a stray `v`.

## 3. Deliberately not done

- **The `HX-Push-Url` response header** instead of rewriting `hx-push-url`. It pushes whether or not the element
  asked for a push, and a cached response is replayed to every element that requests the URL. An element that
  loads a chapter into a panel without navigating would start rewriting history.
- **A short `max-age` without an address** (for example a day). A release would then reach a returning reader up to
  a day late. The 1.19.0 lesson holds: a URL that does not name its content must not promise it.
- **Everything immutable by default.** The framework cannot know that a fragment's output is viewer-independent;
  the runtime check can refuse a broken promise, but only a declaration can make one.
- **`Server-Timing` on by default.** It is diagnostic, and a small disclosure of internals.
- **Skipping the session for immutable fragments.** Only the first fetch per release reaches the server, and it must
  still pass authentication.
- **An HTMX history cache.** CA-174 rejected it: it keeps screens with personal data in `localStorage`. This change
  caches only fragments that carry none.

## 4. Compatibility

Nothing changes for a consumer that does not opt in: `serverTiming` defaults to `false`, and no fragment is
`immutable` unless declared. With `immutable` declared:

- `hx-get` references to that fragment carry `?v=`;
- an element that asked to push the URL pushes the clean one;
- a revisit makes no request at all.

## 5. Testing

- **Server-Timing:** off by default; on through config and `TI_WEB_SERVER_TIMING`. `app` is on every response,
  including a `304` and a static file. `session` is present behind the session middleware and absent for
  `/static`. The description is sanitised and quoted. An existing header is appended to.
- **Registration:** `immutable` with `roles` throws.
- **The rewrite:** a pure function, tested alone.
  - A reference gains `?v=`, and push/replace URLs become the clean path.
  - A reference with a query is untouched, as are non-immutable identifiers and `data-hx-*` twins.
  - A `>` inside a quoted attribute does not end a tag.
  - Comments, `<script>` and `<style>` are skipped.
- **Serving**, with the real manager and handler over test fragments:
  - A matching `v` is `immutable`; a stale or absent one is `no-cache`.
  - A fragment with a nonce placeholder, declared `immutable`, is never `immutable`, and warns.
  - The shell's references carry the version.
  - The version changes when any member's markup changes, and not when a non-member's does.
  - With the file cache off, nothing is addressed.
- **Measured end to end** in Chromium against competence: the second visit to a chapter makes no request.

## 6. Implementation log

**2026-09-26: implemented as designed.**

- `components/fragment-fingerprint.js` (new, `#fragment-fingerprint`): `digestOf`, `versionOf`,
  `addressFragmentReferences`.
- `TiWebAppManager`:
  - `addFragment` refuses `immutable` with `roles`, and resets the version.
  - `#renderFragmentMarkup` is split out of `#getHtmlFragment`, which then addresses references.
  - `#resolveImmutableAddressing` computes the version; `#reportUnaddressable` warns once per fragment.
  - `#getHtmlFragment` removes `version` and `onAddressed` from the options before `transformHtml` sees them. An
    override therefore renders an immutable fragment from exactly the options its version was computed with.
- `webAppHandler` passes `v` and chooses `immutable` only for an addressed partial.
- `serverTimingHandler` and `timedHandler` in `web-handlers.js`; `TiWebServer#describeInstance`; `serverTiming` and
  `TI_WEB_SERVER_TIMING`.
- One existing test changed: `session-store.delivery.test.js` located the session middleware by the literal
  `this.#webServer.use( session( {`. The session is now built first and mounted, timed or not, one statement later.
  The order it guards is unchanged.
- Tests: 618 → 647, 130 → 139 suites, 47 → 50 files. Lint 0 errors (65 warnings, all present before). `check:types`
  clean.
- The safety check is load-bearing. With the per-response digest comparison removed, the nonce-bearing fragment
  declared `immutable` is answered `immutable`, and its test fails.

**Measured end to end**, in Chromium via CDP. competence 3.53.2, with this tree packed by `npm pack` and installed in
its place, the ten guide fragments declared `immutable`, and `TI_WEB_SERVER_TIMING=true`. The state service was core's
D1 service over `node:sqlite`, in Bulgarian, and every state-store call was counted.

| Step | Before (1.40.0) | After |
|---|---|---|
| Open *Overview*, first time | 1 request, 200, `private, no-cache`; 1 store call | 1 request, 200, `private, max-age=31536000, immutable`; 1 store call |
| Open *Getting started*, first time | 1 request, 200; 1 store call | 1 request, 200, `immutable`; 1 store call |
| Open *Overview* again | 1 request, **304**; 1 store call | **no request** (from the browser's cache); **0** store calls |
| Open *Getting started* again | 1 request, **304**; 1 store call | **no request**; **0** store calls |

- The address bar reads `/app/help-overview`, not `?v=`.
- Back, reload, and a deep link carrying a stale `v` all render the right chapter, with no errors.
- The Dashboard is unchanged: its fragment revalidates, and its data is `no-store`.
- **A kept response does not replay its cookie.** An `immutable` response also carries the rolling session's
  `Set-Cookie`, so the question was whether a cache hit could restore an old session ID. Measured in Chromium, in this
  order:
  1. Sign in (session 1) and open a chapter.
  2. Sign out, and sign in again (session 2).
  3. Reopen the chapter. It came from the disk cache.

  The cookie stayed session 2, and the next request was signed in. The browser cache is per browser, not per person,
  which is why `roles` are refused (§2.2).
- Every response carried, for example, `Server-Timing: app;dur=4.1;desc="Frankfurt am Main (WEUR, DE)", session;dur=2.4`.
  The description came from competence's `describeInstance()` over `CLOUDFLARE_LOCATION` / `REGION` /
  `COUNTRY_A2`, set by hand for the run.
