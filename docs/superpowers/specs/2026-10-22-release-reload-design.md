# Design — A page left open across a release reloads at a safe moment

| | |
| --- | --- |
| **Date** | 2026-10-22 |
| **Packages** | `packages/web-framework` |
| **Status** | Decided by Boris on 2026-10-22 (§3); the rules in §4 follow from the decision and the measurements in §6. |
| **Version target** | web-framework `1.60.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-553`](https://belleal.youtrack.cloud/issue/CA-553), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11) |

---

## 1. Why

Boris, 2026-10-22: *"when we release new version and the user has not refreshed their web app in a while, can we
somehow force the app to refresh to the latest version?"*

A tab keeps the scripts of the release it was loaded with for as long as it stays open. The scripts and stylesheets
are content-addressed, so a reload always gets the new release, but nothing tells an open tab that one happened. Every
screen it opens afterwards is fetched from the new server, so new markup meets old code. A screen can then break, or
read a payload whose shape has changed. Competence ships a release most days, and a person who leaves the application
open across a week runs a mix of several.

## 2. What exists

- **The shell page** is `bin/static/index.html`, filled in by `TiWebAppManager#transformHtml` (`isHome`). An
  application can ship its own copy at the same path: competence does, so a placeholder added to the framework's copy
  would not reach it.
- **A screen change** is `tiApplication.openScreenNow( screen )`. It pushes `/app/<screen>` into the address bar, then
  asks HTMX for the same URL into `#ti-content`. A full page load of that URL renders the shell with that screen, so a
  screen's address is always a page's address.
- **HTMX 2.0.11** sends `HX-Target` with the target element's `id` (`ti-content`), and reads `HX-Redirect` on any answer
  before it swaps anything: it sets `location.href` and stops (measured in the bundled `htmx.min.js`).
- **`sendRequest`** is the one `fetch` the shell's screens use for data and writes; HTMX carries the fragments.
- **`frame-application.html`** holds the topbar, `#ti-content` and the toast stack, through placeholders the manager
  fills in order. Competence ships its own topbar and sidebar, not this frame.
- **The application's identity** — its package name, version and the framework components with theirs — is built once
  by `application-info.buildApplicationInfo` for the About screen.

## 3. Decided (Boris, 2026-10-22)

Of three answers — reload as soon as a release is seen, a banner only, or a reload at a safe moment with a banner
otherwise — he chose **a reload at a safe moment, with a banner otherwise**. Nothing reloads while someone is typing.

## 4. The rules

### 4.1 The release identity

`TiWebAppManager#releaseId` is the first 16 hex digits of the SHA-256 of the application's package name, its version
and each framework component's name and version (`buildApplicationInfo`). It is opaque on purpose: it is sent to
visitors who have not signed in, and naming the framework's exact versions to them helps nobody but a scanner. It is
the same in every process of one release, because it is computed from what the release ships, not from when or where it
started. A release that changes nothing but the server still changes the application's version, which every release
does here, so old code never reads a payload it was not written for. The version counted is both the manifest's and
the one the About screen reports, which `TI_WEB_APP_VERSION` overrides: a deployment that pinned the override would
otherwise keep one release for good.

### 4.2 The server

- **Every response carries `X-Ti-Release: <releaseId>`**, from a middleware ahead of everything that answers: static
  files, `/health`, fragments, data and errors alike.
- **The shell page carries `<meta name="ti-release" content="<releaseId>">`**, inserted right after the opening
  `<head>` tag of the home page. The manager inserts it after the application's `transformHtml`, never inside it: an
  application overrides that method, and an override that skipped the base would lose the tag. HTML lets that tag be
  left out, so the fallbacks are, in order,
  after `<html>`, after the doctype and at the very start; the parser puts the tag in the head from each. It is never
  left out: a page without it names no release, and the next rule would answer every screen change it makes with the
  whole page. Inserted, not a placeholder, so an application's own `index.html` carries it without a change. The page
  reads its own release from here: the scripts and this tag come in one answer, so they cannot disagree.
- **A screen change from an older page is answered with a full page load of that screen.** A `GET` with `HX-Request`
  aimed at `#ti-content` (`HX-Target: ti-content`) whose `X-Ti-Release` is not the server's, or is missing, is answered
  `200` with `HX-Redirect: <the same URL>`, no body and `Cache-Control: no-store`. HTMX then loads the page, which is
  the screen asked for, from the new release. The URL loses the content address `v` that a reference to an immutable
  fragment carries, as the screen's own link pushes it without one. A page loaded before this release sends no identity, so it is covered by
  the same rule: its next screen change reloads it.
  - Only a `GET` aimed at `#ti-content`: every such request is a screen, whose URL is a page. A write, or a fragment
    swapped into anything else, is answered as before, so a reload never lands in the middle of a save.
  - The application's own leave guards run first, as on any screen change: the request is the same one, only its
    answer differs. Competence's evaluation sends its waiting draft on `htmx:beforeRequest`, and a hidden page sends it
    again as a `keepalive` request (`pagehide`), which the unload does not cancel.
- **Every screen answer varies on the page's release** (`Vary: HX-Request, X-Ti-Release`). It does: the same request
  from another release is answered with the page. And an immutable fragment the browser keeps carries the release that
  served it. Without the `Vary`, a fragment kept from an earlier release, unchanged and so at the same address, answered
  a page of the current release from the cache. That page then read a release other than its own, and showed the
  banner to the newest page there is (measured in Chromium).
- **A fragment is kept for good only for a page of this release.** An immutable answer to a page of another release,
  or of none, is `private, no-cache` instead. In a rollout, an outgoing instance asked by a page of the new release for
  a fragment aimed outside `#ti-content`, which is not redirected, would otherwise give that page an immutable copy
  with the old release's header, read from the cache for a year. The cost is one fetch per fragment per release.
- **A manager that names no release** (`releaseId` not a string) answers as before 1.60.0: no header, no tag, no
  redirect, and immutable fragments kept as they were.

### 4.3 The browser

- **Every request carries the page's release**: HTMX through `htmx:configRequest`, `sendRequest` in its own headers.
- **Every answer is read for the server's**: HTMX on the request's own `loadend`, as the busy state is, since
  `htmx:afterRequest` goes unheard when the answer replaced every element that could carry it to the document;
  `sendRequest` from its response. **The latest answer decides** `tiApplication.newRelease`: another release sets it,
  the page's own clears it, since an answer from an instance a rollout or a rollback has since replaced is not news for
  good. A missing header (a proxy's error page, a Worker's own answer) is no news either way. An answer that sends the
  page away (`HX-Redirect`, `HX-Refresh: true`) is noted only if the page is still there three seconds later. Noted at
  once, the banner showed for the length of the navigation it announced. Never noted, a page whose leaving was
  cancelled, at an application's "unsaved changes" prompt, stayed on the old release with nothing to say why (measured
  in Chromium with competence's kind of `beforeunload` guard).
- **A tab coming back into view** after it was hidden for 30 minutes or more asks `HEAD /health` once and reads its
  `X-Ti-Release`. If a newer release is live and the page is idle (below), it reloads; otherwise it shows the banner,
  even one closed before the tab was left: half an hour later, it is news again. A tab opened in the background counts
  as hidden from the moment it loaded, since no `visibilitychange` says so. The question goes with the cookies, as
  every request of the page does. Behind a proxy that authenticates (Cloudflare Access and the like) a request without
  them is sent to a sign-in page on another origin and fails, and the check would never work there. With them it costs,
  once per return, what any request of the page costs: the session is read, its expiry slides, and the application's
  session refresh runs. The first review pass had dropped them for that cost, and the second showed the price.
- **Idle** means both:
  - **nobody has touched the page since the screen was shown**: no key or pointer press and no `input` or `change`,
    anywhere on the page, heard while capturing so a handler that stops the event cannot hide it;
  - no editable field has the focus.

  A touch anywhere, because a dialog an application moves out of the screen holds work as well, and a choice made with
  a click raises no `input`. Only a new screen swapped into `#ti-content` clears it. A write does not, since a preview
  or a reminder is a write the server takes and saves nothing typed beside it. Nor does a nested frame, which also
  loads inside a screen as a panel. Reading a touch as work costs the banner instead of a reload; reading work
  as idle would lose it. The first version counted only `input` and `change` inside `#ti-content`, cleared by any
  successful write, and the review pass showed each way that loses work.

  No reload repeats on its own: this one needs someone to come back to the tab after half an hour, and the other a
  screen change. So a release rolling out across two instances, which a page can meet in turn, cannot reload it over
  and over.
- **Otherwise a banner**, "A new version is available", with **Reload** and a close button. It sits in
  `frame-application.html` through a new placeholder, `<ti-component-release-banner-placeholder>`, so an application
  that keeps its own topbar gets it with no change. Closing it hides it until the next screen change, which reloads
  anyway. It is cloaked (`x-cloak`) until Alpine has read whether it shows: as plain markup it showed on every page
  load, and for good when the script did not load.

### 4.4 What an application does

Nothing. The tag is inserted into its own shell page, the banner sits in the framework's frame, and its screens'
requests go through HTMX and `sendRequest`. An application that ships its own `frame-application.html` places the new
placeholder where it wants the banner.

## 5. Rejected

- **Checking on a timer.** The Cloudflare Worker forwards every request but a scanner's probe to the container,
  `/health` included, so a check every few minutes from each open tab would wake a sleeping container and keep it
  awake. Competence's production container sleeps after 10 minutes without a request, staging's after 2. A tab learns
  of a release from the requests its user makes anyway, and from one check when they come back to it.
- **Reloading as soon as a release is seen.** Someone halfway through a form loses what they typed since its last
  save. Boris chose against it (§3).
- **Intercepting the screen change in the browser** and loading the page instead of sending the request. The
  application's leave guards listen to that request (competence's evaluation sends its draft on
  `htmx:beforeRequest`); cancelling it in the framework's own listener would race them. The server's answer keeps the
  request, and so the guards, exactly as they are.
- **A service worker.** It would cache the shell and add a second release mechanism to reason about, for a problem the
  next request already reveals.
- **The application's version alone as the identity.** A framework release adopted without an application version
  bump would go unseen, and the version is not something to hand an anonymous visitor.
- **Hashing the shipped files as the identity.** It would also catch a build shipped without a version bump. No
  release here is one: every merge that ships bumps a version and its changelog section. The identity must also be
  ready for the first response, which the static fingerprints, computed per file on first use, are not.
- **Telling an older release from a newer one.** The identity is opaque, so a page cannot tell which is newer, and it
  does not need to: the server it talks to is the release it must run. During a rollback it reloads into the older
  release, which is the one serving. During a rollout two releases may each answer a screen change, and the page
  follows the one that answered. Each step needs a screen change and lands on the screen asked for. The supported
  deployments run one instance (Cloudflare's container, Kubernetes with `replicas: 1` and `Recreate`), so the window
  is the rollout's own.

## 6. Measurements

- **HTMX 2.0.11 and `HX-Redirect`.** `handleAjaxResponse` checks `HX-Redirect` before `HX-Refresh` and before any swap,
  sets `location.href` and returns, whatever the request. So an `htmx.ajax` call, which `openScreenNow` makes, follows
  it as a link does.
- **`HX-Target`.** HTMX sends `HX-Target` as the target element's `id`. `#ti-content` has `id="ti-content"`; the landing
  screen's request targets its placeholder, which has no `id`, so it never matches.
- **The Worker.** `@ti-engine/cloudflare`'s Worker answers only a scanner's probes itself (`probes.js`) and forwards the
  rest, `/health` included.
- **Competence's drafts.** `guardLeaving` sends the waiting draft on `htmx:beforeRequest` into `#ti-content`, and again
  on `pagehide` and on a hidden page, through `fetch` with `keepalive: true`, which outlives the page.

## 7. Verification

- **Server** (`test/web-handlers.release-reload.test.js`, real HTTP):
  - `releaseId` is 16 hex digits and the same for the same identity. It differs when the application's version or a
    component's changes, and when the manifest's changes under a pinned `TI_WEB_APP_VERSION`. It names no version;
  - `X-Ti-Release` is on `/health`, `/app/config`, a fragment, a static file and a 404;
  - the shell page carries the meta tag: with the framework's `index.html`, with an application's copy that has no
    placeholder, and with one that has no `<head>`, no `<html>` or neither;
  - a screen change with no identity or an older one is answered `HX-Redirect` to the same URL and `no-store`, with no
    body, while one with the current identity gets its fragment;
  - a screen answer, and an immutable fragment the browser keeps, vary on `X-Ti-Release`, and a fragment is kept for
    good only for a page of this release;
  - the tag is in the shell of an application whose `transformHtml` never calls the base;
  - a manager that names no release answers as before 1.60.0;
  - a `POST`, a fragment aimed elsewhere and a non-HTMX `GET` are answered as before.
- **Browser** (`test/ti-framework.release-reload.test.js`, the real script in the sandbox):
  - HTMX requests and `sendRequest` carry the page's release;
  - an answer with another release sets `newRelease`, one with the page's own clears it, and one without the header
    changes nothing;
  - a return after 30 minutes hidden asks `HEAD /health` once, with the cookies, and reloads an idle page; so does a
    first look at a tab opened in the background half an hour earlier;
  - an answer that sends the page away is noted after three seconds, not at once;
  - it shows the banner instead after any touch (a key, a pointer, an input, a change), heard while capturing, or when
    a field has the focus;
  - a write, or a panel loading inside the screen, keeps a touched screen touched, and only a new screen clears it;
  - the answer to the return question wins over an earlier one;
  - a return after less than 30 minutes asks nothing.
- **Fragments:** the banner's texts are catalogue labels, in English and Bulgarian, kept in a feedback picture
  (`picture-keep.fragments`), and its placeholder is in `frame-application.html`. Its region takes the column's full
  width, since `.ti-content` centres what it holds, and it is cloaked until Alpine runs.
- **Chromium** (Playwright, the real shell and handlers, a release the check switches):
  - a screen change on the same release swaps in place;
  - after a release, `openScreen` loads the page whole at that screen. HTMX does not reject the request's promise,
    which would have sent the page to `/`;
  - a data answer shows the banner;
  - a return with unsaved typing keeps the page and shows the banner;
  - an idle return reloads;
  - no console errors, in both themes and at 390 px;
  - an immutable fragment kept from an earlier release is fetched again for a page of the current one, rather than
    read from the cache;
  - with Alpine blocked, the banner stays hidden;
  - a page whose redirect is cancelled at a `beforeunload` prompt stays, without the banner at 0.8 s and with it at
    3.8 s.

## 8. Not in this change

- **Back and Forward** are left as they are. HTMX restores an entry it made by reloading the page, because the shell
  keeps no history cache (`historyCacheSize: 0`, `refreshOnHistoryMiss: true`, measured in the bundled `htmx.min.js`),
  and a reload is the new release already.
- **A forced reload of a page nobody looks at.** A hidden tab learns nothing until someone comes back to it.
