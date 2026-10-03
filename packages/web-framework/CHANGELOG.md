# ti-engine web-framework changelog

This document will contain the list of changes made to the framework. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.48.0

* feat (localization): **the visitor chooses the interface language on the sign-in screen, and the session starts in
  it** (CA-410). Design record: `docs/superpowers/specs/2026-10-03-language-choice-at-sign-in-design.md`.
  <br/>
  **What was missing.** A session's language was settled before the visitor arrived:
  - **At sign-in**, `user.language`, which no sign-in sets, else the configured language, else the deployment's.
  - **The sign-in screen** was always in the deployment's language.
  - **A served fragment** was bound to one file when it was registered, and `transformHtml` saw no language.
  - **Immutable fragments** shared one content address, which cannot tell two languages apart.
  <br/>
  **What changed.**
  - **`languages` in the server configuration** (`TI_WEB_LANGUAGES`) lists what a visitor may choose; a code core does
    not know is left out with a warning. Configuring nothing changes nothing.
  - **`GET /language/:code`**, reachable before sign-in, keeps an offered choice in a `ti-language` cookie for a year
    (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS) and redirects home. A signed-in session takes it at once. A plain
    link, so the switch needs no script, and no CSRF token is minted for an anonymous visit.
  - **`resolveRequestLanguage( request, instance )`** decides a request's language: the signed-in session's, else the
    choice, else the configured, else the deployment's. `/app/config`, `/app/labels/:hash` and every rendered view
    ask it.
  - **Sign-in** takes the choice first, then `user.language`, then the configured language.
  - **`transformHtml`** receives `options.language` and `options.languages`.
    - `{ti-language-placeholder}` is filled with the language, and `index.html` writes `<html lang>` with it.
    - `{ti-language-switch-placeholder}`, at the foot of the sign-in card, becomes the switch, or nothing with fewer
      than two languages. Each language is a link showing its code and named by its own name, with `aria-current` on
      the current one.
  - **A fragment `path` may contain `{language}`.** It is served in the request's language, else the deployment's,
    else English, with one warning per fragment and language.
  - **Immutable fragments get one content address per language,** so a browser keeps one copy per language and never
    serves one for the other.
  - Labels `interface.language-name` and `interface.default.login.language-switch` (en, bg), with a built-in table of
    each language's own name for an application that does not carry the first. README → *Choosing the language on
    the sign-in screen*.
  <br/>
  **Verified.**
  - `test/language-choice.test.js` (27) and two sign-in cases in `web-handlers.session-language` catch all 22
    mutations tried.
  - The sign-in label sweep exempts a lone server token, and its self-check proves a token beside words is still
    caught.
  - **In Chromium, through an application offering en and bg:**
    - a first visit is in English;
    - BG re-renders the sign-in screen in Bulgarian, with the cookie set;
    - signing in gives Bulgarian, the guide included;
    - a return without a session remembers the choice;
    - EN gives English, with the guide at another address;
    - `/language/bg` while signed in switches at once.

## Version 1.47.0

* feat (shell): **on a narrow screen the sidebar is a drawer, opened from a menu button in the topbar** (CA-406).
  <br/>
  **What was wrong.** The shell was a two-column grid, `var(--sidebar-w) 1fr`, at every width. Measured in Chromium at
  390x844 with competence's 280px sidebar, the grid resolved to `280px 110px`, and the dashboard's heading broke after
  two letters. Collapsing the sidebar gave back only 216px, and a phone visitor has no reason to look for that button.
  <br/>
  **What changed.**
  - **Below 900px the shell is one column,** and the sidebar is fixed off the left edge, `visibility: hidden` so its
    entries are out of the tab order.
  - **`component-navigation-toggle.html`,** whose placeholder the framework's topbar carries first, is a menu button
    with `aria-expanded`. It slides the sidebar in over a scrim that it teleports to `<body>`: a topbar can carry a
    backdrop filter, which would trap a fixed scrim inside the topbar.
  - **Opening** makes `#ti-content` `inert` and moves the focus to the active entry.
  - **Closing:** Escape and the scrim close it and give the focus back to the button. Any request for `#ti-content`
    closes it as it starts (`htmx:beforeRequest`), and so does `openScreen`, so a tap on an entry closes the drawer
    before a sleeping container answers.
  - **Widening the window** past the breakpoint closes it.
  - **The collapsed state never applies to the drawer** (`collapsed` reads false while `navigationDrawer` is true).
  - **The shell takes `100dvh` there.**
  - **The topbar's buttons stay on the page.** On a narrow screen the subtitle is hidden, and the title takes an
    ellipsis when it still runs out of room. Measured at 390px, the title and subtitle pushed a screen's own topbar
    action ("New cycle") off the edge. Shrinking the two by weight left neither readable ("Cycl…" beside "Aut…").
  - **The drawer applies only where the page holds the button** (`.ti-application:has(.ti-navigation-toggle)`). An
    application whose own topbar predates the button keeps the column, rather than losing navigation.
  - `.ti-icon.menu`; the label `interface.navigation-toggle.label` (en "Menu", bg "Меню"); README → *On a narrow
    screen*.
  - **`test/ti-framework.navigation-drawer.test.js` (21 tests)** covers the store and the component in the sandbox,
    the markup and its assembly into the topbar, and the stylesheet read from inside its own `@media` block. That
    includes the guard on every rule, and the breakpoint agreeing with the script's. It catches all 16 mutations
    tried.
  <br/>
  **Verified in Chromium** at 390x844 through competence, in two themes:
  - one column with no horizontal overflow on the dashboard;
  - the drawer opens with the focus on the active entry and the screen inert;
  - a tap on an entry closes it and loads the screen;
  - Escape and the scrim return the focus to the button;
  - widening to 1280 puts the sidebar back in its column.
* fix (shell): **the sidebar's user menu opens inside the window** (CA-408).
  <br/>
  **What was wrong.** The flyout placed its panel once, in the `$nextTick` after opening. Alpine's `x-show` reveals an
  element on the next animation frame, after that tick, so the panel was measured while still `display: none`: 0x0,
  which the clamp to the window could not hold. The user menu opens upward from the bottom edge of a button pinned to
  the bottom of the sidebar, so it opened below the window, with sign-out in it.
  - **Measured on 1.46.0:** at 1280x844, 112px of its 124px were off the page; at 1440x1000, 12px showed.
  - **Inside the drawer,** the clamp also ignored the panel's own 20px `margin-left`, which put it 12px past a 390px
    window's edge.
  <br/>
  **What changed.**
  - The flyout places its panel again whenever the panel's size changes, through a `ResizeObserver` attached a tick
    after `init`, when its ref exists. That includes the frame `x-show` reveals it in.
  - The clamp holds the margin.
  - **Measured after:** inside the window at 1280x844 (y=710), at 1440x1000 (y=866) and at 390x844.
  - **`test/ti-framework.sidebar-flyout.test.js` (6 tests)** models Alpine's order, the refs arriving after `init`. It
    catches all 5 mutations tried.

## Version 1.46.1

* fix (build): **the bundled htmx and Alpine are the declared versions again** (CA-402).
  <br/>
  **What was wrong.** web-framework ships htmx and Alpine's CSP build as committed files in `bin/static/scripts/lib/`.
  The postinstall regenerates them from `node_modules` on every install, and the publish job packs what is committed,
  with no install. `fbf55ce` (2026-09-24) raised the ranges to `htmx.org ^2.0.11` and `@alpinejs/csp ^3.17.4`
  without an install, so the files stayed at htmx 2.0.10 and Alpine 3.17.3.
  - **Measured on the published tarballs:** 1.38.0 was consistent, at 2.0.10 and 3.17.3 against `^2.0.10` and
    `^3.17.3`. 1.39.0, 1.42.0 and 1.46.0 ship 2.0.10 and 3.17.3 against `^2.0.11` and `^3.17.4`.
  - **Who got the stale copies:** a consumer whose install runs the postinstall got the installed versions, and one
    that installs with scripts off got the old ones.
  <br/>
  **Why it survived.** Nothing compared the committed copies with the declared versions, and CI's own install
  rewrites them before any test runs, so CI always saw fresh files. A local `npm install` does regenerate them; I
  measured it with npm 10 and npm 11.
  <br/>
  **What changed.**
  - The files are regenerated: htmx 2.0.11, and Alpine CSP 3.17.4.
  - **Both dependencies are pinned exactly**, so the version installed, bundled and declared is one version. A newer
    upstream patch therefore changes nothing until a pin moves.
  - **CI and the publish workflow's test job check the bundle after their install.** Each fails when the install
    changed the committed copies, which is what a pin moved without an install looks like.
  - **`test/bundled-libraries.test.js` (7 tests)** checks that both pins are exact, that each file states its pinned
    version, that each is a byte-for-byte copy of the installed package's file, and that the postinstall still copies
    from those paths.
  - README → *The bundled browser libraries*.
  <br/>
  **Rejected:** keeping the ranges and checking against whatever CI installs. With no lockfile in this repository, CI
  installs the newest match, so any upstream patch release would turn every open pull request red at once.

## Version 1.46.0

* feat (login): **a heading slot inside the sign-in card** (CA-387).
  <br/>
  **What was missing.** The login screen renders before sign-in, so an application reaches it only through the
  framework's slots, and both of those sit outside the card: the brand slot above it (1.40.0, CA-179) and the extension
  slot below it (1.36.0, CA-129). competence's sign-in, as its designer drew it, titles the card "Sign *in*" with a line
  on which account to use, and nothing an application could ship would put that inside the card.
  <br/>
  **What changed.** `fragments/components/component-login-card-head.html`, the third slot, works like the other two:
  - it is declared on the `login` descriptor;
  - it resolves through the same reverse-order static-path search, so an application's copy wins;
  - it ships empty, so a consumer that supplies nothing sees no change.

  Its placeholder is the card's first child, before the error box and the controls, which is the order a screen
  reader announces.
  <br/>
  **Rejected:** letting the application override `frame-login.html` wholesale. It needs no release, but it forks the
  auth-method blocks, which is what the slots exist to avoid.
* feat (login): **the Microsoft button carries Microsoft's mark and name** (CA-387). The `openid-azure` button showed
  the old Azure "A" beside "Sign in with Azure".
  - The people signing in know their work account as Microsoft's, and Microsoft's branding guidelines for "Sign in
    with Microsoft" ask for its four-square logo.
  - The button now has that logo, the fragment's own text reads "Sign in with Microsoft", and the catalogue's
    `interface.default.login.sign-in-azure` reads "Sign In - Microsoft" and "Вход с Microsoft".
  - The method and the label key are unchanged, so no configuration changes. An application with its own label for
    the key keeps it.
* docs: README → *The login screen* lists the three slots.
* test: `test/login-card-head-slot.test.js` (7) pins the placeholder's place in the card, the declaration, the empty
  default, an application's heading resolved inside the card, the auth-method gating, and the Microsoft button. The
  login label sweep covers the new component. Of 6 deliberate breakages, all were caught. The suite is 781 tests
  across 63 files.
  <br/>
  Checked in Chromium through competence's sign-in page, with this release's three files in its installed copy, in
  both its languages and themes. Its heading renders as the card's first child, above the local form and the
  provider buttons. Microsoft's logo shows on the button, nothing overflows, and the console shows no errors.

## Version 1.45.1

* fix (styles): **the shell no longer bounces when a scroll reaches its end** (CA-354).
  <br/>
  **What was wrong.** Edge on Windows draws an elastic overscroll. Scroll a page past its last line with a touchpad or
  a wheel and the page stretches, then springs back. Chrome on Windows has no such effect, so the same screen bounced in
  one browser and stood still in the other. Boris saw it in competence.
  - The effect fires where a scroll has nowhere left to go: at the end of the shell's page scroller, which hands the
    rest of the gesture to the document.
  - Neither the document nor the page scroller declared `overscroll-behavior`.
  - The sidebar declared `contain`. That stops the hand-over, but it still lets the sidebar itself bounce.
  <br/>
  **What changed.** `overscroll-behavior: none` on the document and on every scroller the shell declares.
  - The document: `html`, and `body`, which propagates its `overflow` to the viewport. Engines have taken the
    viewport's value from either element.
  - The scrollers: `.ti-page-scrollable`, `.ti-content.pane`, `.ti-sidebar` and `.ti-modal-body`.
  - `none` turns the effect off and also ends scroll chaining. A scroller an application nests inside a page keeps the
    default and hands its overscroll to the page, which now drops it.
  - **Android's pull-to-refresh is off too.** In Chrome on Android, pulling down at the top of the page is the same
    overscroll effect on the document, so it no longer reloads the application and loses what was on the screen. An
    application that wants it back sets `overscroll-behavior-y: auto` on `html` and `body`.
  <br/>
  **Verification.**
  - **Edge's effect cannot be measured here.** Chromium on Linux does not build elastic overscroll.
  - **`test/ti-framework.overscroll.test.js`** pins the declarations: on the document, on each shell scroller, and as
    a sweep of every scroller the stylesheet declares. A scroller added later without it fails there instead of
    bouncing in Edge. All 6 tests fail on 1.45.0.
  - **The cascade-resolving reader** `ti-framework.sidebar-overflow` already used moved to
    `test/helpers/stylesheet-cascade.js`, so the two suites share one. It now reads a selector out of a selector list,
    which `html` and `body` needed. The sidebar suite's 13 tests resolve exactly as before.
  - **In Chromium**, competence's Org chart was served this stylesheet. The wheel moved the page in the same steps to
    its end (3821 px), the document never moved, and the sidebar still scrolled its own overflow.

## Version 1.45.0

* feat (web-handlers): **an application can add sources to the Content-Security-Policy** (CA-352).
  <br/>
  **What was wrong.** `cspHeaderHandler` built a fixed set of directives with no `frame-src`. A frame from anywhere but
  this origin therefore fell back to `default-src 'self'` and was refused. A Cloudflare Turnstile widget is exactly
  that: an iframe from `https://challenges.cloudflare.com`. Its script loads under `'strict-dynamic'` by carrying the
  nonce, but the widget never drew, and nothing an application could configure changed that. The Boris Khan site needs
  it on its newsletter form, which is its one public write, and bots already scan the domain.
  <br/>
  **What changed.**
  - `contentSecurityPolicy.additionalSources` in the web server configuration maps a directive to extra sources:
    `{ "frameSrc": [ "https://challenges.cloudflare.com" ] }`.
    - Only `frameSrc`, `connectSrc`, `imgSrc`, `mediaSrc` and `fontSrc` can be extended.
    - A directive the base policy does not declare starts from `'self'`, so adding a source never takes one away.
    - `scriptSrc` cannot be extended: under `'strict-dynamic'` a host there would be ignored by the browser.
  - `resolveCspAdditions` validates the section once, when the handler is built. A directive that cannot be extended
    is dropped, each logged at ERROR, and so is any source that is not an `https://` host:
    - a keyword such as `'unsafe-inline'`;
    - `*`;
    - `https:`, `data:` or `blob:`;
    - a plain `http://` host;
    - a value containing a quote, a comma, whitespace or a `;`. A `;` would otherwise end the directive and start one of
      the configuration's own choosing.
  - `TiWebServer` hands the handler its `contentSecurityPolicy` section. `bin/web-server.json` ships it empty, so the
    policy is unchanged unless an application sets it.
  <br/>
  **Evidence.** `test/web-handlers.csp-sources.test.js` adds 10 tests, and 9 of them fail on 1.44.0, the wiring in
  `web-server.js` among them. The tenth, that an unconfigured policy is unchanged, passes on both by design. The 18
  existing tests in `web-handlers.csp-upgrade-insecure.test.js` pass unchanged.

## Version 1.44.0

* feat (ti-framework): **the shell shows that it is working while a request is outstanding** (CA-345).
  <br/>
  **What was wrong.** A click on a sidebar entry asks for the screen through HTMX, and the screen then asks for its data
  through `sendRequest`. Until the first answer arrived nothing on the page changed: the old screen stayed up and the
  cursor stayed a pointer. On a warm server the wait is too short to notice. A container scaled to zero holds the first
  request for a second or two while it starts, and on competence's staging that read as a frozen application.
  <br/>
  **What changed.**
  - `tiApplication.busy`. Every `sendRequest` call and every HTMX request is counted from send to settle. `busy`
    turns on once one has been outstanding for 400 ms and off when the last one settles, so an ordinary click shows
    nothing. It is mirrored as `ti-busy` on `<html>`.
  - An HTMX request is counted out on its XHR's own `loadend`, which fires once whether the request loaded, failed,
    was aborted or timed out (measured in Chromium on HTMX 2.0.10 and 2.0.11). `htmx:afterRequest` is not reliable for
    this. HTMX dispatches it on the element that made the request, and, when the answer has replaced that element, on
    the nearest ancestor still in the document. When there is none, no listener on the document hears it, and the
    shell would stay busy for good.
  - While busy, every element shows the `progress` cursor: the application is working and still takes input. It is
    set with `!important`, because the element under the pointer is nearly always the button just clicked, and
    buttons set a cursor of their own.
  - `fragments/components/component-busy-indicator.html`, a new component. It draws an hourglass that fades in and is
    turned over while busy, and holds a `role="status"` region that says "Working…" to a screen reader. The region
    is always rendered; only the line inside it comes and goes, because a live region announces text added to it.
    Under `prefers-reduced-motion` the hourglass appears but does not turn.
  - The framework's topbar carries the placeholder, and the `application-main` fragment declares the component after
    the topbar, since placeholders are filled in that order. **An application with a topbar of its own places
    `<ti-component-busy-indicator-placeholder>` where it wants the hourglass.** Without it the cursor still changes.
  - `.ti-icon.hourglass`, the glyph the empty grade chip already draws, joins the icon set. `.ti-sr-only` is a general
    visually-hidden utility.
  - The label is `interface.busy-indicator.status`, in English and Bulgarian. An application that does not carry it
    in its own catalogue gets the fragment's English.
  <br/>
  **Rejected.** HTMX's own `hx-indicator`. It covers only HTMX requests, so a save through `sendRequest` would show
  nothing. It appears at once, so every click would flicker. And it needs an attribute on every trigger.
* test: `ti-framework.busy-indicator.test.js` (19) drives the real script in the sandbox with a hand-moved clock and a
  `fetch` that answers on cue. It covers:
  - the delay, overlapping requests, failures, and a GET aborted when the same GET is sent again;
  - an HTMX request ended by its XHR, and one whose `loadend` fires twice;
  - the stale-delay case: a request after an answered one still gets the full delay;
  - the component in the real `assembleHtmlView`, the status region, the label, and the stylesheet's rules.
  
  19 deliberate breakages of the change were each caught. The sandbox now provides the host's timers and a `classList`
  on `<html>`, without which `sendRequest`, which now starts a timer, failed the three existing `labels-bundle` tests.

## Version 1.43.1

* fix (ti-framework): **`tiToolbox.formatDate` writes dates in the page's language, not the browser's** (CA-333).
  <br/>
  **What was wrong.** It called `toLocaleDateString()` with no locale, so the browser chose. A Bulgarian interface
  opened in an en-US browser wrote "7/1/2026", "11/30/2026" and "12/31/2026" between Bulgarian words (measured in
  Chromium on competence's dashboard), and two people reading the same screen saw the same date in two orders.
  <br/>
  **What changed.**
  - The locale is the document's `<html lang>`. A page that declares none keeps the browser's.
  - The month is written as a word: "1 Jul 2026" in `en-GB`, "Jul 1, 2026" in `en`, "1.07.2026 г." in `bg`. No reader can
    take 07/08 for the 8th of July or for the 7th of August.
  - A `lang` that is not a well-formed language tag (`en_GB`) makes Intl throw; the date is then written the way it was
    before, rather than not at all.
* test: `ti-framework.format-date.test.js` (5) runs the real script in the sandbox, whose default locale is en-US, which
  is the case that went wrong. Against the 1.43.0 script 3 of the 5 fail. The other two pin behaviour that must not
  change: the fallback for a malformed tag, and the placeholder.
* test: `ti-framework.document-title.test.js` fires a watcher only when the value it watches has changed, and with
  the new value, as Alpine does. It fired every watcher on every change, so a title recomputed from the wrong source
  could pass. Raised by CodeRabbit on Belleal/ti-engine#175.

## Version 1.43.0

* feat (ti-framework): **avatars take their colours from the theme** (CA-326).
  <br/>
  **What was wrong.** `tiToolbox.generateAvatarStyle` drew each avatar as a gradient of three hues at 62–70% saturation,
  set inline per person. No theme could tone that down, so under a muted brand palette (competence's Vellum and Claret)
  the avatars stayed bright green, magenta and blue.
  <br/>
  **What changed.**
  - The style is now `var( --avatar-tone-<n>, <the same gradient> )`. A theme that defines `--avatar-tone-1` to
    `--avatar-tone-7` gets one of its own tones per person: the same tone for the same person everywhere, and
    different tones spread over the people in a list.
  - A theme that defines none gets exactly the gradient it had before, so nothing changes for an application that
    does not opt in.
  - The tone is `djb2( seed + "A" ) % 7 + 1`, the same hash as before. Over 300 people the seven tones take 31 to 54
    each, where chance gives 42.9.
  - Seven is prime: djb2 multiplies by 33, which is 1 mod 8, so a count of 8 would follow only the sum of the
    characters, and every anagram would share a colour.
* feat (ti-framework): **the browser tab names the application after the screen** (CA-326).
  <br/>
  **What was wrong.** The topbar replaces `document.title` with the screen's name on every navigation. An
  application's own `<title>` therefore never showed, and every tab read as a bare screen name ("Dashboard"), whatever
  application it belonged to.
  <br/>
  **What changed.** A page that declares `<meta name="application-name" content="…">` gets "Dashboard · Competence@Work".
  The topbar reads the meta once, when it starts. A screen whose own title already contains the name keeps it once:
  "About Competence@Work", not "About Competence@Work · Competence@Work". A page without the meta keeps the bare screen
  name, as before.
* test: `ti-framework.avatar-style.test.js` (3) and `ti-framework.document-title.test.js` (4) run the real script in the
  sandbox. Against the 1.42.5 script, 5 of the 7 fail. The other two pin behaviour that must not change: the bare title on
  a page without the meta, and a title that already names the application.

## Version 1.42.5

* fix (web-handlers): **an OpenID sign-in that fails after the callback's checks is logged at WARNING**, naming the
  provider's own answer (CA-315).
  <br/>
  **What was wrong.** `authorizedOAuth2CallbackHandler` passes every failure of `authorize()` or of the session write
  on as a `401`. That includes the provider refusing the code exchange, `openid-client` unable to build it, and the
  session store failing. `defaultErrorHandler` therefore filed each one as the client's and logged it at DEBUG only,
  as CA-215 keeps every 4xx. None of them is the visitor's to fix: each is the deployment's configuration, the
  provider or the store. A production Worker holding the wrong Google client secret sent every Google sign-in to
  `?error=1000`, and below a production log level (`TI_AUDITING_LOG_MIN_LEVEL=200`) nothing said why. The handler's
  three refusals of its own were already logged at WARNING (1.33.0); this fourth case never had a line. It is not a
  regression: before 1.42.0 every failed request logged at DEBUG.
  <br/>
  **What changed.** The handler logs one WARNING when a sign-in fails after its checks, with the method and the
  exception's reference:
  - for a code exchange the provider refused, the provider's `error` and `error_description`, and for
    `invalid_client` a pointer to the client ID and secret;
  - otherwise the error's own account: a TiException's `details` (where core's HTTP cache provider says which state
    call failed and why) or an `Error`'s message, capped at 300 characters rather than the 100 a provider's value
    gets, which cut the cause off the end of the state service's account.

  A refusal (the security family) is left alone: an unverified e-mail, a domain outside the provider's list and the
  application's `augmentSession` each log where they are decided. Nothing sensitive is logged. The code, the state,
  the verifier and the nonce never appear, and the provider's text is escaped and capped like any external value.
  The visitor sees exactly what they saw before.
  <br/>
  **Evidence.** The real `AuthManager` and this handler were run against Google's token endpoint with a production
  client ID. A missing secret now logs `it could not be completed ("metadata.client_secret" must be a string)`. A
  wrong one logs `the provider answered 'invalid_client' (The provided client secret is invalid.). Check the client
  ID and secret this deployment holds for it.` Both still land on `?error=1000`. Seven new tests in
  `web-handlers.oauth-callback`, and five deliberate breaks each fail one to three of them: refusals no longer
  skipped, the provider's text unescaped, the line at DEBUG, the `invalid_client` pointer dropped, the account capped
  at 100.

## Version 1.42.4

* fix (config-service): `applyDefaults` refuses a document registered `driftTracked: false`, with reason
  `not-drift-tracked`, and writes nothing (CA-207).
  <br/>
  **What was wrong.** Such a document holds the deployment's own data and its file default is a sample, so applying it
  replaces that data rather than reconciling drift. Only the consumer's page kept it out of an apply: competence's
  drift panel hid it but still preselected it while it stood at version 1, the default the first start seeded. An
  image that shipped one organization's own tree as that default left it there, and the first release that drifted
  anything else replaced the tree with the shipped sample. The page is fixed in competence; the endpoint no longer
  depends on it, and refuses the document at any version. A consumer that wants the sample back saves it like any
  other edit.

  *Corrected after release:* this entry first said that importing an organization tree before the first start
  leaves it at version 1. It does not: competence's `import:config` writes on top of the seed, so an imported tree
  is at version 2.

  One test: a request naming an untracked document beside a tracked one is refused, and neither is written. It fails
  without the check.
* test: 716 → 717 tests.

## Version 1.42.3

* fix (web-handlers): an HTMX error on a session whose language is written outside Latin-1 notifies the user again,
  instead of crashing the error handler (CA-295).
  <br/>
  **What was wrong.** For an HTMX request, `defaultErrorHandler` sends the notification in the `HX-Trigger` header, and
  the payload carries the message in the session's language. Node refuses a header value with any character above
  U+00FF. On a Bulgarian session, which every session on a Bulgarian deployment has been since 1.42.0 (CA-198), setting
  the header threw `ERR_INVALID_CHAR` inside the error handler. Express's final handler then answered with a bare HTML
  500, which the client's fallback does not read, so a screen that failed to load showed nothing at all: a
  role-gated screen (403), a store outage or a slow start (503), and any other error on an HTMX request. The refusal
  itself was still logged at its own status; the header error went to stderr as an unstructured stack.
  <br/>
  **What changed.** The header's JSON writes every character outside printable ASCII as its `\uXXXX` escape. It is still
  JSON, so htmx's `JSON.parse` gives back the original text. Measured in Chromium with the bundled htmx on a Bulgarian
  503: before, the response was 500 and no notification fired; after, 503 with the Bulgarian message intact.

  4 tests on a real Express application, all of which failed before the fix: the refusal's own status, the message
  exactly as written in Bulgarian, an ASCII-only header, and a client error's data carrying a character outside the
  Basic Multilingual Plane.
* test: 712 → 716 tests.

## Version 1.42.2

* refactor (config-store): the lock that serializes a document's saves is core's `tools.KeyedLock` (1.19.0), and its
  writes are awaited with core's `tools.whenAllSettled`. Both were private copies (`#exclusively`, `#allWritten`). The
  behaviour is unchanged, and the 9 concurrent-save tests pass as they did.
* build (deps): `@ti-engine/core` `>=1.19.0`, for `KeyedLock` and `whenAllSettled`.

## Version 1.42.1

* fix (web-handlers): a server error keeps its `details` label, so the notification can still say what went wrong
  (CA-287).
  <br/>
  **What was wrong.** 1.42.0 sends a 5xx without its data, to keep the stack and any echoed request body away from the
  client (CA-215). A `details` label went with them, and that label is written for the user: `formatException` shows
  it as the notification's second line. competence's store-outage 503 then read only core's message for 1004, "The
  system cache required for proper engine operation is unavailable.", instead of the explanation it raises.
  <br/>
  **What changed.** A 5xx keeps `data.details` when it names a label the session's language has text for, and nothing
  else of its data. Raw text stays withheld, because it can name records or internals. So does a label with no text
  in the session's language, which the client could only show as its key.

  4 tests, of which the two that keep a label failed before the fix.
* test: 708 → 712 tests.

## Version 1.42.0

Go-live fixes from competence's pre-launch review. Requires `@ti-engine/core` 1.18.0, now declared as `>=1.18.0`
rather than `*`: a session's language comes from core's new `getSystemLanguage()`, and against an older core every
sign-in would throw.

* feat (auth-manager): bind each OpenID provider to the e-mail domains it may admit, with
  `auth.oauth2.azure.allowedDomains` / `auth.oauth2.google.allowedDomains`, or `TI_AZURE_AUTH_ALLOWED_DOMAINS` /
  `TI_GCLOUD_AUTH_ALLOWED_DOMAINS` (comma-separated), which replace them (CA-197).
  <br/>
  **What was wrong.** A consumer maps a signed-in identity to its own principal by e-mail, and the admin allowlist
  matches user ID, username or e-mail. With two providers enabled, the weaker one could claim an identity the stronger
  one owns: anybody can register a consumer Google account under an organization's address, and Google reports it as
  verified once the mailbox has confirmed a code. Reproduced through the real `openid-client`: with Google meant for
  `gmail.com` only, a verified `someone@is-bg.net` Google identity was admitted.
  <br/>
  **What changed.** `AuthManager.isIdentityDomainAllowed( identity, allowedDomains )` decides; `#authorizeOpenID`
  refuses with `E_SEC_UNAUTHORIZED_ACCESS` (401) and logs the subject and the domain, never the address, at WARNING.
  - Every e-mail-shaped identifier must be in a listed domain: the e-mail, and the username whenever it holds an `@`
    (an Entra UPN, or a display name the account holder chose, which the admin allowlist also matches).
  - An identity carrying no address is refused once a list is set; domains compare exactly, case aside, so a subdomain
    or an Entra guest's `onmicrosoft.com` UPN is refused unless listed.
  - `AuthManager.toDomainList` normalizes a list: lower-cased, de-duplicated, a leading `@` removed. Only blank entries
    are dropped; a malformed one is kept and matches nothing, so a typo narrows access instead of emptying the list.
  - An empty list, the default, admits any domain, as before. Each provider's start-up notice names the list in
    effect after the environment is applied.

  `test/helpers/fake-openid-provider.js` is an in-process provider behind `globalThis.fetch` — `openid-client` 6 is ES
  modules, so its exports cannot be stubbed under `require()` — with a real RS256-signed ID token. 24 tests.
* fix (web-handlers): a session starts in the deployment's language, not in English (CA-198).
  <br/>
  **What was wrong.** Both sign-in paths set `session.language = user.language || serviceConfig.language`, and
  `web-server.json` shipped `"language": "en"`. No identity provider puts a language on the user, so a deployment set to
  Bulgarian with `TI_LOCALIZATION_LANGUAGE` turned English the moment anybody signed in, while its login page, which
  asks core with no language, stayed Bulgarian.
  <br/>
  **What changed.** The shipped `language` is gone. A session takes the user's language, else the service
  configuration's when one is set, else `localization.getSystemLanguage()`. Sessions signed in before the upgrade keep
  the language they were given until their next sign-in. 7 tests, one of which keeps `language` out of the shipped
  configuration.
* fix (web-server): hold every request but `/health` until the instance has finished starting (CA-187).
  <br/>
  **What was wrong.** The server listens as the last step of the framework's `onStart`, and an application extends
  that as `super.onStart().then( … )`. Requests were therefore served while the application was still initializing.
  competence builds its org chart there; a request in that window found no chart, `verifySession` failed and the
  session was destroyed. The request that wakes a sleeping container lands in exactly that window, so the first person
  of the day was signed out on their first click.
  <br/>
  **What changed.** `TiWebServer#start()` marks the instance `starting` until its whole start resolves, an
  application's `onStart` chain included, and `webHandlers.startupGateHandler`, mounted after static content and
  before the session, holds requests until then. An application needs no change. `/health` is never held.
  - A request held for 30 s, or one that arrives after a failed start, is refused with `503`, `Retry-After: 5` and
    the new core code `E_GEN_SERVICE_STARTING`.
  - The default error handler answers a `503` on a navigation as text instead of redirecting it to `/`, which would
    have sent it back into the held request.
  - An instance started through `onStart()` directly, as tests do, is never held.

  Reproduced with a real server (no broker, in-memory cache) whose application initialization waits on the test: a
  request was answered before the initialization finished. 10 tests.
* fix (web-handlers): log server errors, and stop sending their internals to the client (CA-215).
  <br/>
  **What was wrong.** Every request error was logged at DEBUG, which production filters out, so no server failure was
  ever recorded. The payload carried `exception.asJSON()` with its data: for a raised `Error` that is the stack, and
  body-parser's echoed `body`. Reproduced with the real body parser: a malformed JSON body, which needs no session,
  came back as a `500` carrying the stack and the body.
  <br/>
  **What changed.**
  - A 5xx is logged at ERROR with the exception, under its ID, method and path, without the query string. The client
    gets the code, the localized message and that ID, which ties a report to the log line, but no data.
  - A 503 is logged at WARNING. A 4xx stays at DEBUG and keeps its data, which is how a form learns what was wrong.
  - An `Error` carrying a 4xx `status` (the `http-errors` convention every body parser follows) is raised as the
    client's error: 400 `E_WEB_INVALID_REQUEST_BODY`, 413 or 415, with nothing it carried.

  8 tests.
* fix (config-store): serialize a document's saves, so a concurrent save is refused as a conflict, not lost (CA-192).
  <br/>
  **What was wrong.** `saveChangeSet` checked each `expectedVersion` and then wrote, in separate store round trips.
  Two admins saving one document at version N both passed the check and both wrote N + 1. One edit was lost, the
  history entry for N + 1 held the other admin's content, and restoring the lost edit brought back the wrong one.
  <br/>
  **What changed.** The check and the writes run with every document of the change-set held. Each key's writes are
  queued behind the ones before them, so the second save reads N + 1 and is refused as a `version-conflict`.
  - A change-set spanning two documents and a save of one of them run in the order they arrived.
  - A save of an unrelated document is not held up.
  - A failed save releases its keys, but only once every one of its writes has settled. Released at the first refused
    write, the save left another write in flight, and that write landed on top of the next save's document or history
    entry.
  - `seedIfEmpty` takes the same lock.

  This orders writes within one process, which covers a deployment of one instance. 9 tests.
* fix (config-change-notifier): a subscriber that fails asynchronously is logged like one that throws, instead of
  ending the process (CA-187). The notifier caught a subscriber's synchronous throw, but nothing awaited a promise a
  subscriber returned, so its rejection was unhandled, and core exits on one. competence reloads its configuration
  from such a subscriber, and a store that timed out right after an admin's save took the whole application down.
  Reproduced: the runner reported the rejection as unhandled. 1 test.
* build (deps): `@ti-engine/core` `>=1.18.0`.
* test: 649 → 708 tests.

## Version 1.41.0

* feat (web-app-manager): serve screens that never change under content addresses, so a revisit makes no request
  (CA-183).
  <br/>
  **What was wrong.** Since 1.39.0 every screen switch revalidates: a repeat visit is a `304` of a few hundred bytes.
  That saved bytes but not the round trip, and on a hosted deployment the round trip is the whole cost. On
  competence's Cloudflare deployment, reopening a User Guide chapter took 583-818 ms for a `304`. The same request took
  4-7 ms of server time locally, with one state-store read.
  <br/>
  **What changed.** `addFragment( id, { ..., immutable: true } )` declares that a fragment renders the same markup for
  every viewer until the next deployment.
  - Every `hx-get="/app/<id>"` in every served fragment, the shell included, carries `?v=<version>`.
  - A `true` `hx-push-url` or `hx-replace-url` on the same element names the plain path, so the address bar is
    unchanged.
  - A request for the current version is answered `private, max-age=31536000, immutable`. Anything else revalidates
    as before.
  - One version covers every immutable fragment together, because they link to one another. Per-fragment hashes would
    either form a cycle or leave a cached chapter linking to a stale copy of the next.
  - Each response is also hashed and compared with the markup its version was computed from. A fragment whose output
    depends on the request (a nonce, a CSRF token, anything `transformHtml` adds) never qualifies, and is reported
    once.
  - `immutable` with `roles` throws, since the browser, not the session, keeps the copy.
  - Nothing is addressed while the fragment file cache is off.

  The rewrite is `#fragment-fingerprint`. It tokenizes start tags with quoted values read whole, so Alpine's
  `x-show="a > b"` does not end a tag, and it skips comments and `<script>`/`<style>` text.
* feat (web-server): opt-in `Server-Timing` on every response: `serverTiming`, or `TI_WEB_SERVER_TIMING` (CA-183).
  - `app` is the time from the request reaching the process to its headers.
  - `session` is the session lookup, one state-store round trip.
  - `describeInstance()`, a new virtual method, gives `app` a description, such as where a container platform placed the
    instance.

  An existing header is appended to, including one a handler passes to `writeHead( status, headers )`. The metrics are
  added through `on-headers`, now a declared dependency, which applies such headers before them. It is off by default,
  because timings disclose a little about the server. Without it, the only way to split a slow response between the
  process and the network was to reproduce it elsewhere.

Tests: 618 -> 649 web-framework tests, 130 -> 140 suites, 47 -> 50 files. Design record:
`docs/superpowers/specs/2026-09-26-web-framework-screen-latency-design.md`.

## Version 1.40.0

* feat (web-app-manager): give the login screen a brand slot, `component-login-brand`, above the sign-in card (CA-179).
  <br/>
  **What was wrong.** The brand block (the "T" mark, "Welcome back", "Sign in to continue") was written inline in
  `frame-login.html`. An application could not replace it. The login screen renders before sign-in, so none of its
  own fragments are in play, and its one seam, `component-login-extra`, renders *below* the card. Every consumer's
  login screen therefore opened with the framework's letter and a generic greeting, and none could name itself.
  <br/>
  **What changed.** The block is now `fragments/components/component-login-brand.html`, declared on the `login`
  descriptor beside `component-login-extra`. It is resolved by the same reverse-order static-path search, so an
  application's copy replaces the default. The default renders the same markup as before, now labelled. The
  placeholder sits before the card in the DOM, so a screen reader announces the brand first.
* fix (static): label every string on the login screen. The greeting, its prompt, both input placeholders, the "or
  continue with" divider and the no-sign-in-method message were literal English, so they stayed English in a
  Bulgarian deployment while the buttons and field labels beside them were translated. They go through `x-text-label`
  under `interface.default.login.*` (`welcome`, `sign-in-prompt`, `username-placeholder`, `password-placeholder`,
  `or-continue-with`, `no-sign-in-method`), each keeping its English as the fallback. An application loads its own
  catalogue, not this one, so it adds the keys it wants translated.
* fix (web-app-manager): an OpenID-only login screen no longer stores a session for every anonymous visit (CA-180).
  `transformHtml` filled the CSRF placeholder *before* the auth-method gating stripped the local form. So the token
  was minted, and a session saved and two cookies set to hold it, for a form that was then removed from the page.
  The gating now runs first, so a token is asked for only where the local form survives, as 1.38.0 (CA-166)
  intended. Measured on competence with Microsoft sign-in alone: an anonymous visit to the login screen set
  `ti-xsrf-token` and `connect.sid` and stored one more session row in D1. It now sets neither and stores nothing.
  With `local` enabled, the form still posts the token its cookie carries.

Compatibility: an application that ships neither component sees the same login screen as before. One that
overrides the whole of `frame-login.html` keeps its copy, and that copy has no brand placeholder, so nothing is
spliced into it.

## Version 1.39.0

* feat (web-app-manager): serve the label catalogue as a content-addressed bundle instead of inside `/app/config`
  (CA-174).
  <br/>
  **What was wrong.** `/app/config` is fetched `no-store` on every page load, and it carried the whole per-language
  catalogue: measured on competence, 410 KB in English and 745 KB in Bulgarian on every refresh, and twice around
  sign-in. Three quarters of it (competency descriptions and scope anchors) are resolved on the server and never read
  in the browser.
  <br/>
  **What changed.** `/app/config` carries `labelsBundle: { hash, url }`. `GET /app/labels/<hash>` (unprotected) answers
  the catalogue whose SHA-256 the hash is `public, max-age=31536000, immutable` — honest, because the address is the
  content — and any other hash with the current catalogue `no-store`. The shell fetches the URL with the browser's
  default cache mode and assigns the tree to `configuration.labels`, so after the first load of a release the
  catalogue costs no request at all. `getClientLabels( language )` (virtual) is the seam to leave out what the browser
  never reads; `getLabelsBundle` / `findLabelsBundle` build and find the serialized, hashed catalogue.
  <br/>
  **Compatibility.** `configuration.labels`, `getLabel` and `x-text-label` behave as before. A configuration payload
  that still carries `labels` (an application override, an older server behind a newer shell) is used as-is. An
  application that spreads `super.processDataRequest( session, "config" )` carries `labelsBundle` through unchanged.
* feat (web-server): compress responses — brotli (quality 4) or gzip by `Accept-Encoding` — through `compression`
  1.8. Nothing was compressed; the largest assets compress four to seven times. A view that embeds a CSRF token is
  never compressed (`response.locals.tiNoCompress`), since a compressed secret beside attacker-influenced bytes is the
  BREACH shape.
* feat (web-handlers): revalidate HTMX fragments instead of re-sending them. A fragment is a static template and was
  served `no-store`, 5–59 KB on every screen switch; it is now `private, no-cache` with `Vary: HX-Request`, so a
  repeat visit is a 304. Full pages (they carry the request's CSP nonce) and any view that embeds a CSRF token stay
  `no-store`.
* feat (web-server): fingerprint `/static` references. Every `src`/`href` pointing at `/static` in a served fragment
  gains `?v=<first 12 hex of the file's SHA-256>` (`components/static-fingerprint.js`, revalidated against size and
  mtime), resolved the way express.static resolves it so an application's override is the file hashed. A request
  whose `v` matches is answered `immutable`; a bare or stale one keeps the configured `staticCache` policy. Before,
  every page load cost one conditional request per script and stylesheet.
* perf (web-server): serve `/static` and `/.well-known` before cookies and the session. Mounted after them, every
  asset read the session from the store and — `rolling` — wrote its expiry back before its response could end, and
  carried a `Set-Cookie`. The security headers still apply; so does the shutdown refusal, which moves up with them.
* perf (session-store): write a session's expiry at most once a minute per instance. express-session awaits `touch`
  before ending every response of a rolling session; every expiry now carries that minute as slack over the cookie's
  `maxAge`, so skipping a touch inside it never lets the store expire a session its cookie still vouches for.
* fix (web-handlers): `GET /me` is `no-store`; it answered the signed-in identity with no cache policy at all.
* fix (static): the favicon is the same image at 16, 32 and 48 px — 7 KB instead of one 256 px PNG of 75 KB.
* build (deps): add `compression` ^1.8.2.

Measured on a real competence 3.50.0 server driven by Chromium, the same walk before (1.38.1) and after:

| Moment | Before | After |
|---|---|---|
| First visit (login page, cold cache) | 1,482 KB | 351 KB |
| Sign-in and application boot | 488 KB | 19 KB |
| Every refresh (F5) | 484 KB | 16 KB |
| Thirteen screen switches | 292 KB | 88 KB |
| Store operations per refresh | 37 | 11 |

## Version 1.38.1

* build (deps): update `@alpinejs/csp` from ^3.17.3 to ^3.17.4
* build (deps): update `@types/node` from ^26.5.1 to ^26.6.2
* build (deps): update `htmx.org` from ^2.0.10 to ^2.0.11

## Version 1.38.0

* feat (web-handlers)!: mint CSRF tokens on demand, so an anonymous page view no longer creates a session or sets a
  cookie (CA-166).
  <br/>
  **What was wrong.** `csrfInitHandler` wrote a token into the session on every GET that found none, then set the
  `ti-xsrf-token` cookie on every GET regardless. Writing to the session is what makes express-session save a
  brand-new session and cookie it - `saveUninitialized: false` only holds while nothing writes - so every response to
  a first-time visitor, a stylesheet included, carried two `Set-Cookie` headers. Every response was therefore
  private: a CDN could share nothing, every page view reached the server, and every one wrote a session to the store.
  Measured on the Boris Khan site's staging deploy: two `Set-Cookie` headers on `/`, on a post and on
  `/static/fonts.css`, and no page ever served from the edge.
  <br/>
  **What changed.** A token is minted only where one is needed:
    - eagerly on GET/HEAD for a session that already exists (signed in, or given a token earlier), so signed-in pages
      and the htmx and fetch clients that read the cookie work exactly as before;
    - through `request.csrfToken()`, now attached to every request, for a page that renders one. The framework's own
      views (`webAppHandler`) use it, so the sign-in page still carries its token;
    - through the new `GET /csrf-token` (unprotected, `no-store`, 204, answers through the cookie) for a script about
      to submit from a page that was shared-cached.

  Protection of state-changing requests is unchanged: a POST still needs the session's own token, and one from a
  visitor who never had a session is still refused. A session "exists" when it carries anything besides its cookie,
  which is how express-session 1.19 shapes a new session, a loaded one and one behind a stale cookie - measured, not
  assumed.
  <br/>
  **Breaking, narrowly.** `request.session.csrfToken` is no longer guaranteed on an anonymous request. Code that
  renders it for a visitor who may have no session must call `request.csrfToken()` instead. Nothing in this repository
  or in competence reads it that way; web-content's route did, and 0.4.0 changes it.
  <br/>
  **Verified.** 11 tests drive a real express-session app wired as `TiWebServer` wires it:
    - no cookie on an anonymous page view, where 1.37.0 sets both;
    - a token, and the session to hold it, for a page that renders one;
    - the endpoint's `no-store` 204;
    - a refresh without rotation for an existing session;
    - a signed-in session minted on its next view;
    - one cookie per response;
    - the protection cases.

  In real Chromium, against the real account-menu markup, a first-time visitor's sign-in fetches `/csrf-token` and
  passes the check, while the web-content 0.3.1 client is refused with 403 - so web-content 0.4.0 ships with this.
  Running the Boris Khan site on this tree, public pages carry no cookie and are edge-stored, a second anonymous
  visit is served from the edge without waking the container, and browsing writes nothing to the store.
  Web-framework 540 to 551 tests.

* fix (web-handlers): clear a `ti-xsrf-token` cookie that has no session behind it, on the next GET or HEAD (CA-166).
  Found by CodeRabbit on this release's own PR. Minting on every page view used to overwrite a token cookie that had
  outlived its session - signed out, or expired in the store - and nothing does now, so it stayed until it expired.
  web-content's account menu trusts that cookie, so after signing out the same browser could not sign back in: every
  attempt was refused with 403. Measured in real Chromium with the real account menu and the real `logoutHandler`: on
  the unfixed tree the second sign-in is refused and the dead cookie survives the reload; with this, the reload
  clears it, the menu asks `/csrf-token` for a new token, and the sign-in is accepted. The cookie's attributes now come
  from one place, because a clear only works with the path the cookie was set with. Clearing sets no session.
* fix (web-handlers): mint a framework view's CSRF token only if the view renders one (CA-166). `webAppHandler` minted
  for every view it served, and `/not-found` - where every unknown URL is redirected - has no form, so each probe of a
  random path stored a session and set two cookies. `TiWebAppManager#transformHtml` now also accepts the token as a
  function, called only where the HTML has a placeholder for it, and `webAppHandler` passes one. A token given as a
  string works as before, which is what competence's tests pass, and competence's `transformHtml` override only
  forwards the options. The sign-in view still mints, and it is the only anonymous form the framework serves.
  <br/>
  **Verified.** 5 more tests on the same harness: a dead token cookie is cleared and no session is created; after a
  real sign-out the old token is refused and a fresh one accepted; `/not-found`, rendered by the real manager through
  the real handler, sets no cookie; the sign-in view mints and renders its session's token; a string token still
  renders. The first three fail on the unfixed tree. Web-framework 551 to 556 tests.

## Version 1.37.0

* fix (ti-charts): size chart ink in pixels, so text, lines and bars no longer scale with the card. The heatmap now
  honours its `width` option, and an application can localize the screen-reader tables (CA-161).
  <br/>
  **What was wrong.** Every chart draws in a viewBox scaled to the card's width, and every text size and stroke
  width lived inside that viewBox. There a CSS pixel is one user unit, so a chart's ink grew and shrank with its
  card. Measured in Chromium on 1.36.0 at card widths from 280 to 960px:
    - stacked-bar labels 11–26px, over bars 25–58px thick, beside an HTML legend fixed at 12px;
    - line-chart axis labels 9–20.5px, on a line 2.8–6.4px wide;
    - box-plot labels 11–26px;
    - diverging-bar labels 5.6–12.8px.

  Separately, `renderHeatmap` hard-coded a 100-unit viewBox. `heatmapLayout` spreads the grid across the `width`
  option, so any `width` above 100 cut the grid off.
  <br/>
  **Why it survived.** Each chart looked right at the one width it was tuned for. The consuming application
  compensated chart by chart:
    - a box-plot viewBox sized so its 4-unit labels land on 12px at the 680px cap;
    - a 300px cap on the heatmap;
    - unit-sized `barThickness` and `valueFontSize` on the grouped bars.

  Each was right at exactly one card width. The heatmap's `width` did nothing except break the grid, so nobody
  passed it.
  <br/>
  **What changed.**
    - `renderChart` hands each drawn SVG to a ResizeObserver, one per figure. The observer sets `--ti-chart-u`, the
      size of one screen pixel in viewBox units, after layout and before paint. It measures again whenever the SVG's
      size changes, which covers a resized card and a hidden card being shown. Each render draws a new SVG, and a new
      SVG is a new observation, so a re-render at an unchanged size is measured too.
    - The size comes from the observer's content rect, which is the layout size. `getBoundingClientRect` would have
      included CSS transforms: a chart first measured inside a dialog still scaling in at 0.5 would have kept 22px
      text after the animation ended. Nothing reads layout synchronously during render.
    - The stylesheet multiplies every chart text size, stroke width, dash pattern and marker radius by that value:
        - labels render at `--fs-xs` (11px);
        - bar captions render at `--fs-sm` (12px);
        - lines are 1–2px and dots 3–4px.

      Each rule's `var()` fallback reproduces its old unit size exactly. An unmeasured chart (hidden, or in a browser
      without ResizeObserver) therefore renders as it did in 1.36.
    - Bars lay out in pixels with no viewBox: widths are percentages of the SVG and heights are pixels. A stacked bar
      is 10px (grouped and diverging bars 8px) under a 12px caption at every width. A chart with more rows only grows
      taller.
    - The heatmap's viewBox takes the layout's width.
    - `spec.a11yHeaders` replaces the screen-reader table's column headers by position; a missing entry keeps the
      English default. `data.sublabelName` names the gauge's sublabel row (default "Reporting"). A box plot's
      accessible name now uses its median header's name.
    - The gauge keeps unit sizes. Its text is part of the dial, and the dial is already capped at 240px.
      <br/>
      **Deprecated:** the grouped bars' `barThickness` and `valueFontSize`. Both are viewBox units, which the pixel layout
      has no use for. Passing either keeps the 1.36 unit layout for that chart, so the option's meaning does not change
      under a caller. A value caption now carries a `font-size` attribute only when `valueFontSize` asks for one.
      <br/>
      **Rejected:**
    - Measuring during render with `getBoundingClientRect`. It forces a synchronous layout per chart, and an observer
      is still needed for resizes and for charts rendered while hidden.
    - `vector-effect: non-scaling-stroke` for the lines. It needs no measurement, but it silently reinterprets every
      consumer's own unit `stroke-width` override as pixels. The consuming application sets 0.4 on its radar, which
      would have become a hairline.
    - Keeping the bars in a viewBox and laying them out again on resize. The observer would then change the height of
      the very element it observes.
      <br/>
      **Verification.**
    - Tests: 540 tests / 109 suites in this package, up from 524 / 107. The 16 new tests cover:
        - the pixel layout of all three bar modes, and the unit layout kept for `barThickness`;
        - the heatmap viewBox;
        - `a11yHeaders`, `sublabelName`, the box plot's accessible name and the sparkline class;
        - `unitsPerPixel`;
        - the observer wiring, via a stub ResizeObserver: resize, re-render at the same size, the layout box preferred
          over a transformed one, a hidden card, and bars never being observed;
        - three stylesheet guards: every chart ink size falls back to exactly its 1.36 unit size, resolves to fixed
          pixels when measured, and no chart rule sizes ink outside that table.
    - Regressions: seven deliberate regressions each fail a test:
        - a bare 4px heat label;
        - a wrong fallback;
        - the heatmap back at 100 units;
        - measuring the transformed box;
        - never releasing a replaced SVG;
        - observing the bars;
        - English scatter headers.
    - Chromium, every chart type at 280, 400, 560, 720 and 960px:
        - text is 11px (bar captions 12px), series lines 2px, dots 4px on lines and 3px on the radar, dashes 8/6px, all
          at every width;
        - with ResizeObserver removed, every measured size is identical to 1.36;
        - resizing, re-rendering at the same size, showing a hidden card, a 17-step resize sweep and detaching the figure
          produce no console errors and no ResizeObserver loop errors;
        - a chart rendered under `transform: scale(0.5)` shows 11px text once the transform is removed.
    - The consuming application's Insights route, served this build, puts the level-chart labels at 11px instead of
      7px at a 700px viewport.
      <br/>
      **Not done.**
    - Scatter bubble radii stay in viewBox units. A bubble's size encodes a value; it is not ink.
    - Gutters that hold text stay in viewBox units, sized by the caller: heatmap `rowLabelW` / `colLabelH`, box
      `padLeft` / `padBottom`, line `padL` / `padB`, and radar `labelPad`. On a very narrow card a long label can now
      outgrow its gutter, where before it shrank with it.
    - A consumer's own unit-sized `stroke-width` override keeps its unit size until the consumer changes it.

## Version 1.36.0

* feat (web-app-manager)!: the login screen gets an application-extension slot, and the application-specific test-user
  panel that used to occupy it is **removed**. BREAKING for any deployment relying on that panel — the identity
  picker no longer ships with the framework and a consuming application must supply its own.
  <br/>
  **What was wrong.** `frame-login.html` carried a "Test user" pill panel whose profile list was a literal array of
  one consuming application's employee IDs — 22, 20, 11, 1, 3, 4, 8, 9 — with that application's role codes, and
  `ti-framework.js` carried its behaviour and the `ti-test-user` cookie it writes. Application data, in the
  framework package, rendered on every deployment's login screen. Both files had marked it TEMPORARY since it was
  written: *"Remove once AD-driven identity is wired up"*.
  <br/>
  **Why it survived.** Nothing could remove it. The login screen is rendered before sign-in, so no application
  fragment is in play and an application had no way to put anything on that page — taking the panel out would have
  taken the capability with it. The panel also rendered unconditionally: the flag a consuming application gates the
  cookie with is a server-side environment variable that never reaches the client, and `applyAuthMethodVisibility`
  strips only the auth-method, divider, social and "none" markers, so nothing removed the panel on any path.
  <br/>
  **What changed.** The `login` fragment declares `components: [ "component-login-extra" ]`,
  `frame-login.html` carries a `<ti-component-login-extra-placeholder>`, and the framework ships
  `fragments/components/component-login-extra.html` **empty**. An application supplies its own copy of that
  relative path and `#locateStaticFile`'s reverse-order search resolves it in preference to the empty default —
  the same mechanism that already lets an application override `frame-dashboard.html`. No new API, and the
  framework keeps owning the login page.
  <br/>
  **Rejected:** letting the application override `frame-login.html` wholesale. It needs no framework release and
  works today, but it forks the login page — the auth-method marker blocks, the provider SVGs and the error element
  would be duplicated in every consumer and drift silently from fixes made here. Also rejected: a new
  `TiWebAppManager` hook returning login-extra HTML, which is more API surface for the same result.
  <br/>
  **Found while removing it:** the fragment's root element still bound `x-data="tiLoginTestUserPanel"`, which would
  have thrown on every login page render once the component was gone. The new test caught it.
  <br/>
  Verification: 524 tests / 107 suites in this package, 11 of them new in `test/login-extra-slot.test.js`. Eight
  assert against the **shipped files** — the panel is gone from the fragment, the script, the stylesheet and the
  cookie, and the slot is declared and ships empty. The other three drive the public `assembleHtmlView` end to end:
  framework paths alone leave no placeholder and no panel behind, an added application path renders that
  application's component, and the auth-method gating survives the splice either way. Removing the `components`
  declaration fails three of the eleven, which is what makes them regression coverage rather than description.

## Version 1.35.4

* fix (web-app): scroll the sidebar instead of clipping everything past the fold. `.ti-sidebar` is a
  `height: 100vh` flex column declaring `overflow: hidden`, and a consuming application appends its own sections
  as direct children — so once those exceeded the viewport the excess was simply cut off, with no way for a
  visitor to reach it. Measured against real Chromium with competence's 21 entries at 1440x800: 1094px of content
  in an 800px box, and a mouse wheel over the sidebar moved it **0px**.
  <br/>
  What went under the fold included `.ti-sidebar-foot`, which carries the theme toggle and the user menu — and
  the user menu is where **sign-out** lives. That held at every height tested, because the column never
  compressed, it was cut: the footer's bottom edge landed at 1082px whether the viewport was 640px or 1080px. So
  on any laptop the entries below the fold, the theme toggle and sign-out were all unreachable.
  <br/>
  It survived this long because a 1080px monitor shows almost everything — the footer misses by 2px and only the
  last section label visibly breaks. That label is the one part that *did* squash: `.ti-sidebar-section-label`
  is alone among the children in declaring no `min-height`, so it absorbed the whole of the column's shrink and
  clipped its own text, 25px down to 14px. A report of "the buttons get squashed" is therefore describing the
  only symptom a large screen shows, and the squashing was the least of it.
  <br/>
  The sidebar now scrolls its own overflow, with `.ti-sidebar-brand` and `.ti-sidebar-foot` pinned by
  `position: sticky` so the brand and the user menu stay put while the list moves, and `flex-shrink: 0` on every
  child so nothing squashes. The scroll container is `.ti-sidebar` itself rather than a new inner wrapper,
  because a wrapper is a markup change and every consumer that has overridden `component-sidebar.html` —
  competence has — would keep the broken layout until it adopted the new element. Three details this needed:
  the vertical padding moved from `.ti-sidebar` onto the pinned rows, since inside the scrollport the list
  scrolls visibly through the gap above the brand and below the footer; the pinned rows composite
  `--sidebar-bg` over `--bg-app`, because `--sidebar-bg` is translucent in the glass theme and the list would
  otherwise show through them; and `.ti-sidebar-collapse-btn` became `sticky` rather than `absolute`, because an
  absolutely positioned child of a scroll container scrolls away with the content.
  <br/>
  Unchanged where it already worked: a sidebar short enough to fit renders exactly as before — no scrollbar, and
  `margin-top: auto` still drops the footer to the bottom. The collapse button sits at the same 20px offset, and
  collapsed mode is unaffected apart from now being scrollable too. The `position: fixed` user flyout is not
  clipped by the new scroll container, which was checked rather than assumed.

## Version 1.35.3

* chore (build): trigger failed build in GitHub

## Version 1.35.2

* chore (package): update `package.json` structure

## Version 1.35.1

* fix (web-handlers): stop sending `upgrade-insecure-requests` to a visitor who is not on HTTPS. The directive was
  never declared in `cspHeaderHandler`'s own `directives` object — it arrived with Helmet's `useDefaults` set and
  went out on every response, telling the browser to rewrite this origin's `http://` URLs to `https://` on a
  `TI_WEB_USE_TLS=false` deployment that has no TLS listener to answer them.
  <br/>
  What it broke was **sign-out, and only sign-out**, which is why it survived this long. Chrome exempts a
  potentially-trustworthy host such as `localhost` when it issues the *first* request, so every ordinary XHR on an
  HTTP deployment works — but it applies the upgrade when it resolves a **redirect**, and `logoutHandler` is the one
  response in the framework that redirects. The sign-out `POST` succeeded, its `303` to `/` was followed to
  `https://` instead, and the handshake failed with `net::ERR_SSL_PROTOCOL_ERROR` — surfacing through htmx as
  `htmx:sendError`, which names neither the scheme nor the directive that chose it.
  <br/>
  The decision is per **request**, not per deployment: what the directive should follow is the scheme the *browser*
  is on, not the one the Node server happens to be listening with. A reverse proxy terminating TLS in front of an
  HTTP server therefore still gets it — `X-Forwarded-Proto` reports that, and `trust proxy` is already set — so the
  Cloud Run / IAP deployment is unchanged. Nothing is given up where the directive was correct; an HTTPS deployment
  keeps it.
  <br/>
  The scheme decision now lives in one place (`isSecureRequest`), shared by all three handlers that had been making
  it separately — `getBaseUrl`, `cspHeaderHandler` and `httpRedirectHandler`. Two of them disagreeing about whether
  a visitor is on HTTPS is how this bug would come back on one surface only, so their agreement is asserted by test
  rather than assumed.
  <br/>
  The helper leads with `request.secure`, which is already proxy-aware — `trust proxy` is set unconditionally, so
  Express resolves `X-Forwarded-Proto` itself and takes the first hop of a chain — and then reads the forwarded
  header as a second opinion for the one case Express gets wrong: it compares the forwarded scheme
  **case-sensitively**, so a proxy sending `HTTPS` reports as insecure and its visitors would be served the non-TLS
  policy. That clause reads as redundant beside `request.secure` and is not; the measured matrix is recorded in the
  test file so it is not simplified away. It stays an OR rather than an override, because letting the raw header
  win would make it authoritative for a consumer who has turned `trust proxy` off — the one configuration in which
  they have said not to trust it.

## Version 1.35.0

* fix (auth-manager)!: resolve an OpenID identity from the ID token claims **and** the `userinfo` response, instead
  of `userinfo` alone. The ID token was fetched, read for the `sub` that `fetchUserInfo` is verified against, and
  then discarded. That works for Google and fails for the Microsoft identity platform, whose `userinfo` endpoint
  returns `sub`, `name`, `family_name`, `given_name`, `picture` and — only when the optional claim is configured —
  an `email` taken from the directory's `mail` attribute. It never returns `preferred_username`: on Entra that
  claim is in the ID token, and it holds the **UPN**. So the one identifier an Entra deployment is configured
  around — the address an operator knows, lists in `TI_WEB_AUTH_ADMINS` and writes into an application record —
  never reached the session at all. `authorization.isAdminIdentity` had nothing to match, the admin exception
  never fired, and the consumer reported the refusal as a missing application record, naming the wrong thing
  entirely. On a fresh deployment, where that exception is the only way in, it is a lock-out. Exposed as the pure
  `AuthManager.resolveOpenIDIdentity( userInfo, claims )`; `userinfo` still wins wherever both carry a value.
  **BREAKING:** on Azure the session `username` now holds the UPN where it previously fell through to the `mail`
  address or the display name — an `auth.admins` entry listing a display name stops matching, and should be
  replaced with the UPN or the e-mail. The **UPN is deliberately not accepted as an `email`**: it is a sign-in name
  rather than a mailbox, and `email` is what a consumer resolves its own directory by, so widening it would change
  which principal an identity maps to.
* fix (auth-manager): read `email_verified` from the ID token claims as well as from `userinfo`. Now that the
  e-mail can come from either source, a tenant emitting it only in the ID token would otherwise have handed that
  address to the application while its `email_verified: false` sat in the half nobody looked at. An absent claim is
  still not a rejection, so an Azure sign-in is unaffected.
* feat (auth-manager): report where each resolved identifier came from, once per OpenID sign-in, at `DEBUG` — the
  claim and the response (`claims.preferred_username`, `userinfo.email`, …), never the value. An operator setting
  `TI_WEB_AUTH_ADMINS` has to know which claim their provider actually supplies, and before this the only way to
  find out was to guess; they already know their own address, so naming the claim answers the question the values
  would have, without the exposure. `auditing.logMinLevel` ships at `0` with console logging on, so logging the
  values would write every signed-in person's user ID, username and e-mail to a default deployment's console on
  every successful sign-in, for a diagnostic needed once per provider. The provenance is also returned from
  `resolveOpenIDIdentity` as `sources`, so a consumer can surface the same thing.
* fix (auth-manager): make the `username` precedence match what it is documented to do. `preferred_username` now
  beats `upn` whichever response carried it, where `userinfo.upn` previously beat `claims.preferred_username`.
  The two rules are separate and the claim rule is the stronger: `preferred_username` is the standard OIDC claim
  for a human-readable identifier and `upn` a Microsoft extension, while "fresher" is what earns `userinfo` its
  precedence for `email` and `name` — mutable profile data the ID token holds only as a snapshot — and earns
  nothing between two stable identifiers that do not differ across the two responses. Within a single claim
  `userinfo` still wins.

## Version 1.34.1

* build (deps): update `@types/node` from ^26.2.0 to ^26.5.1
* build (deps): update `@alpinejs/csp` from ^3.16.1 to ^3.17.3
* build (deps): update `openid-client` from ^6.8.5 to ^6.8.8

## Version 1.34.0

* fix (web-app): give the login error element fallback text, so it can never render as an empty box. The message
  has been unreadable since it was added (CA-95): `x-text-label` resolves
  `interface.default.login.error-sign-in-failed` out of **this package's** `web-server-labels.json`, and a consuming
  application configures exactly one labels path — its own — so the key does not resolve there. The directive then
  falls back to the element's own text content, and the element was empty. The result was a red alert box with
  nothing in it: visibly broken, and saying nothing to the person who had just failed to sign in. An application
  that wants it localized adds the key to its own catalogue, which is the same arrangement the Profile and About
  screens already use.
* fix (web-app): drop the `error` query parameter from the address bar once the login screen has shown it, via the
  new `tiToolbox.clearUrlParam( name )` (`history.replaceState`, so no history entry the visitor never navigated
  to). It is a one-time message, not state: left in place, a refresh replays a sign-in failure that already
  happened, a bookmark captures it, and the login screen cannot be returned to its blank state without editing the
  URL by hand. The parameter itself stays, because a top-level browser navigation — an OAuth callback, or a
  non-HTMX form post — cannot be answered with a body and still leave the visitor on the login page; a redirect is
  the only way, and a redirect carries no payload. HTMX requests were never affected: they already receive the
  error through the `ti:error` `HX-Trigger` and touch no query string.

## Version 1.33.0

* fix (web-handlers)!: refuse an OpenID Connect callback that cannot be completed through the normal error path
  instead of answering `response.status(400).end()`. That was a bare status with an empty body: the visitor got a
  blank page, nothing was logged, and the three distinct reasons a callback fails were collapsed into one
  indistinguishable response. Whoever had to work out why had neither a message nor a log line to start from. A
  refusal is now raised with an explicit `401`, so it presents exactly like every other sign-in failure — an
  HTML `GET` lands back on the login page with `?error=<code>`, and an API client gets the standard payload.
  Marked breaking because the status and body of a failed callback change; no caller should have been depending on
  an empty 400, but a caller that was will see a `303` or a `401`.
* feat (web-handlers): distinguish the three failure reasons in the log, with the fact that identifies each.
  `E_WEB_INVALID_REQUEST_QUERY` when the provider returned no authorization code, naming the provider's own
  `error` (usually `access_denied` — the visitor declined consent). `E_SEC_INVALID_EXPIRED_SESSION` when the
  session carries no OAuth state, **naming the host the callback arrived on and why that matters**: a session
  cookie is host-scoped, so a sign-in begun on one hostname and called back on another arrives with no cookie and
  therefore nothing to verify against. A service reachable under more than one name produces exactly this — a
  platform that assigns both a generated and a deterministic hostname, say — and so does a session that expired
  while the visitor sat on the consent screen. `E_SEC_UNAUTHORIZED_ACCESS` when the state does not match the one
  issued. The distinction is in the log rather than the response, because the visitor has no use for it and an
  attacker probing the endpoint should not be handed it. **Nothing secret is logged** — never the authorization
  code, the state values, the PKCE verifier or the nonce — and a test pins that.
* fix (web-handlers): escape externally-supplied text before it reaches a log line or an error payload. The
  previous two entries put two caller-controlled values into a `WARNING`: the provider's `error` query parameter
  and the request's host headers. The callback endpoint is unprotected and accepts any query string, and query
  parameters are percent-decoded before the handler sees them, so `%0A` arrives as a real newline. The console
  appender writes one line per entry, which makes that newline the end of the line — everything after it reads as a
  separate, entirely attacker-written entry, a forged `NOTICE - Sign-in succeeded for admin` sitting in the log
  looking exactly like a real one. Every character outside printable ASCII is now rendered as a visible `\uXXXX`
  escape and the value is capped at 100 characters, so a field stays diagnosable without being able to end the line
  or flood the log. Escaping happens where the value enters rather than at each use, so nothing downstream can
  reach the raw form. An allowlist of known OAuth error codes was the alternative and is worse: providers emit
  non-standard codes, and the unfamiliar ones are precisely the ones worth reading. Raised by CodeRabbit on the
  review of this branch.
* fix (web-handlers)!: refuse a callback whose session holds a PKCE verifier but no expected state, rather than
  skipping the comparison. The guard was `oidc.state && state !== oidc.state`, so an absent expected state
  disabled the check entirely. Nothing in the framework produces such a session — `authenticationHandler` writes
  the verifier and the state together — but an unverifiable callback is not a callback to trust, and a guard that
  silently turns itself off when its own input is missing is the wrong shape. `openid-client` checks
  `expectedState` as well; this keeps the refusal where it can be explained.

## Version 1.32.0

* fix (authorization)!: `applyAdminRole` now reconciles the `admin` role in **both** directions — granted when the
  identity is on the allowlist, removed when it is not. It only ever added, and it is the only place the role is
  granted, so it was also the only place it could be taken away: an identity removed from `auth.admins` kept `admin`
  for the life of its session, reaching `/admin/config/*` and every admin-gated screen, and since 1.26.0's `rolling`
  cookie that session need never end. Now that 1.29.0 re-applies the role on every request, removal takes effect on
  the next one. Marked breaking because a session that previously retained the role loses it; an empty or absent
  allowlist now means nobody is an administrator rather than that everybody keeps what they had. Raised by CodeRabbit
  on the review of this branch, fixed here rather than in the consumer because the framework owns the role.

## Version 1.31.0

* feat (web-handlers): destroy a session that carries a user and fails `verifySession`, instead of only redirecting
  it. `verifySession` had been a seam with a `TODO: Implement this!` and no consumer — the default returns true for
  any session carrying a user, so the "carries a user but fails verification" branch was unreachable. An application
  that overrides it needs the refusal to stick: leaving the session alive means re-deciding the same verdict on every
  request while the shell, which reads `auth.isAuthenticated`, goes on believing the visitor is signed in, and the
  redirect to `/` lands back on the application rather than on a login. The refusal shape is unchanged (`HX-Redirect`
  for HTMX, `303` to `/` for HTML, `401` otherwise) and is served even if the destroy itself fails — a store that
  cannot forget a session is no reason to honour it. **Nothing changes for a consumer using the default
  `verifySession`**, which cannot produce the case; its documentation now describes the override contract rather than
  carrying a TODO.

## Version 1.30.0

* feat (auth-manager)!: refuse an OpenID Connect sign-in whose e-mail the provider itself reports as unverified, and
  expose the decision as the pure `AuthManager.isEmailReportedUnverified( userInfo )`. A consumer maps the
  authenticated identity to an application principal by e-mail — competence resolves it against the employee
  directory — so an address the provider has not verified is an unauthenticated claim to be someone, and nothing
  checked it. **Only an explicit `email_verified: false` is a rejection.** An absent claim is not: Google emits the
  claim, the Microsoft identity platform does not emit it at all, and the published competence image defaults to
  Azure, so treating "absent" as "unverified" would refuse every sign-in on the default deployment. Marked breaking
  because a sign-in that previously succeeded can now be refused — but only where the provider was already saying
  the address was unverified. The residual assumption, for a provider that says nothing, is bound out the way
  `INSTALL.md` already prescribes: a tenant-pinned discovery URL, a domain-restricted provider, or matching on the
  stable `sub` rather than the mutable e-mail.

## Version 1.29.0

* feat (web-server): add `refreshSession( session, request )` — the per-request companion to `augmentSession` — and
  the `sessionRefreshHandler` middleware that calls it. Roles derived once at sign-in are roles that cannot be taken
  away: `augmentSession` runs inside `regenerateAndSaveSession` and nothing re-ran it, so an authority the
  application withdrew stayed live in every session already holding it, and since 1.26.0's `rolling` cookie an active
  user's session need never expire. The default hook is a no-op, so nothing changes for a consumer that does not
  override it. The middleware is mounted **after** the static handlers and **before** the application routes: an
  asset request carries the same cookie and has no reason to re-derive anything, while every route that can consult
  roles has passed through the hook first. The additive `admin` allowlist role is re-applied immediately afterwards,
  exactly as it is at sign-in, so a hook may replace `session.user.roles` wholesale without stranding an allowlisted
  administrator. Unlike `augmentSession`, throwing does not refuse anything — there is no sign-in to refuse — so a
  failing hook is logged, the session's application roles are dropped, and the request proceeds with the `admin` role
  alone: fail closed on authority, without one failed lookup taking the whole application down.

## Version 1.28.0

* feat (deploy): add `bin/healthcheck.js`, the container liveness probe for any `TiWebServer` application. Point a
  Dockerfile `HEALTHCHECK` at `node /app/node_modules/@ti-engine/web-framework/bin/healthcheck.js`. It belongs here
  rather than in each application because every input it reads is the framework's: `TI_WEB_USE_TLS`, `TI_WEB_PORT`
  and `TI_WEB_TLS_CERT_PATH` are the framework's environment overrides, and `/health` is the framework's own route,
  served by `webHandlers.healthHandler`. The framework has always provided the endpoint and never anything to call
  it, which left every consumer writing an inline `node -e` — and the obvious inline version hardcodes `http://`,
  so it reports a TLS-enabled container unhealthy forever and Docker restarts a server that is answering correctly.
  The transport comes from the same `tools.toBool` the server uses, so the two cannot drift. With TLS on the
  certificate is verified rather than skipped: trust is anchored to the server's own certificate and the name to
  check is read out of it, so one issued for a public hostname passes while the probe connects to `127.0.0.1`.
  Without a configured certificate the probe falls back to establishing that the port accepts connections — weaker,
  but it neither disables verification nor restarts a healthy container. Arrived in competence 3.34.0 and moved
  here unchanged in behaviour.

## Version 1.27.0

Session lifetime. Two defects that together threw a signed-in user out roughly ten minutes after sign-in, however
hard they were working.

* fix (web-server): `cookies.maxAge` was `604800` — seven days expressed in **seconds**, written into a field
  express-session reads as **milliseconds** (`set maxAge(ms)`). Every session therefore lasted 604.8 seconds. The
  value is now `28800000`: eight hours, in the unit the field actually takes.
* fix (web-server): enable `rolling: true`, making the window slide with use. express-session re-sends the cookie
  only when the session is new, when `rolling` is on, or when the session data itself changed (`shouldSetCookie`) — and nothing changes it after sign-in, since `augmentSession` runs once inside
  `regenerateAndSaveSession` and the CSRF handler writes its token only when absent. The limit was therefore
  absolute from sign-in rather than an idle timeout. The store side was never the problem: `SessionStore.touch`
  slid the Redis TTL correctly the whole time, which is precisely why the fault was invisible from the server —
  the browser was dropping an expired cookie the server still considered live. `resave: false` is unchanged, so
  this adds no store writes.
* feat (config): `TI_WEB_SESSION_IDLE_TIMEOUT` overrides the idle window, in whole **minutes**. The unit is named in
  the variable and converted internally, so the confusion above is not expressible through it. A non-integer or
  non-positive value is ignored, leaving the config value standing — the same posture as `TI_WEB_STATIC_MAX_AGE`.

Note for consumers choosing a value: a rolling window is refreshed by requests, and a browser filling in a form
makes none. Set it longer than the longest uninterrupted form-filling sitting your application expects, or that
user loses unsaved work when they finally submit.

## Version 1.26.0

* feat (config-management): report stored documents that no longer satisfy their registered schema.
  `ConfigService.listSchemaViolations()` returns one entry per registered document whose **stored** value fails its
  schema, and `ConfigRegistry.validateSchema( configKey, value )` exposes the schema half of validation on its own.
  Nothing validated a stored value on the way out before this: the store hands back whatever it holds and a consumer
  freezes it into its config exports, so a release that tightens a schema — adding a required top-level key, say —
  leaves any deployment seeded before the change serving a document that can no longer be saved. The failure used to
  surface much later, as an admin edit rejected for a key the admin never touched, in a screen unrelated to the
  change. Schema-only by design: a semantic validator may need a `ValidatorContext` the caller has no reason to
  build, and several are about an *edit* rather than the document standing alone. Read-only by design too —
  reconciling a stale document is the drift panel's job, under audit; an automatic repair here would write config
  outside the change-set machinery. A document that has never been stored is not a violation.
* refactor (config-management): `ConfigRegistry.validate()` now delegates its schema step to `validateSchema()`, so
  the two can never disagree about what is structurally admissible.

## Version 1.25.1

* fix (ti-framework): resolve a label key whose own name contains a literal dot. `getLabel` split the key on every
  dot and descended one object level per segment, so a group storing flat dotted keys — because the key IS a dotted
  path in the consuming application's domain, e.g. audit-log field labels keyed by employee field path (`"personal.workSite"`, `"career.roleFamily"`) — could never be reached. The miss was silent: the caller's
  fallback rendered instead, which is why competence's Employee Management audit tab had shown every changed field
  as its raw field path for as long as those labels have existed. Resolution now tries the longest literal key that
  matches at each level, shortens a segment at a time, and backtracks when a matched branch turns out not to hold
  the rest of the key — so a purely nested catalogue resolves exactly as before, a literal dotted key wins over the
  nested path of the same name, and a genuinely absent key still returns the fallback
* test (ti-framework): cover `tiApplication.getLabel` against the store the browser actually gets. `ti-framework.js`
  is a plain browser script with no module exports, so `test/helpers/ti-framework-sandbox.js` loads it in a Node
  sandbox, fires `alpine:init` and hands back the registered stores — exercising the shipped resolver rather than
  asserting against its source text, which is what let this defect sit unnoticed

## Version 1.25.0

* feat (config-management): surface a `driftTracked` flag on the `getDrift` / `listDrift` payloads, defaulting to
  `true` and set to `false` by a document registering `metadata.driftTracked: false`. Drift compares a stored value
  against the file default shipped in the image, which is meaningful for vendor-shipped product content and
  meaningless for a document holding customer data — that always differs, forever, and would drown a signal that
  otherwise means "a release changed something this deployment is not serving". Consumers now filter on data rather
  than on a hardcoded key list (CA-107)

## Version 1.24.2

Dependency maintenance only — no framework code changed.

* chore (deps): update `@alpinejs/csp` from `^3.15.12` to `^3.16.1`, and refresh the vendored
  `bin/static/scripts/lib/alpinejs-csp.min.js` to the matching build. The vendored file is what the browser actually
  loads, so it has to move with the dependency or the two silently disagree; it is byte-identical to
  `node_modules/@alpinejs/csp/dist/cdn.min.js` at 3.16.1
* chore (deps): update `openid-client` from `^6.8.4` to `^6.8.5`
* chore (deps): update `@types/express-session` from `^1.18.2` to `^1.19.0` (type declarations only — no runtime code)

## Version 1.24.1

License change only — no functional code changed.

* chore (license): relicense package from `GPL-3.0-or-later` to `Apache-2.0`. See `LICENSE` and `NOTICE`
* docs (license): update every source file's license header to the Apache-2.0 notice

## Version 1.24.0

A configuration file change shipped in a release could never reach a deployment that had already been seeded. The
store writes a file default only when the document has never been written, and the consuming application then lets
the stored value overwrite the file value on every boot — so the file default is consulted exactly once in a
deployment's lifetime. Restore could not help either, since it replays a previous version and the oldest version
*is* the stale one. The framework now detects that difference and lets an admin apply it deliberately.

* feat (config-drift): new `#config-drift` module — a pure structural diff between a document's registered file
  default and its stored value. Recurses into objects to report leaf paths, **set-diffs arrays of primitives** so a
  code-list change reads as `+27 codes` rather than an opaque "changed", and compares arrays of objects atomically.
  Paths use the same dot/bracket dialect as schema validation issues
* feat (config-service): `getDrift`, `listDrift` and `applyDefaults`. Applying routes through `applyEdits`, so a
  file default lands validated, versioned, correlated into one change-set, in the audit feed, and restorable —
  never as a side-channel write
* feat (config-service): interdependent documents apply as a **single** change-set, which is required rather than
  merely convenient: a semantic validator resolves its siblings at their *pending* value, so a document whose
  constraint spans another can only pass when both are applied together
* feat (admin-config-handlers): `GET /admin/config/drift`, `GET /admin/config/drift/:configKey` and
  `POST /admin/config/drift/apply`, all admin-gated
* build (release): bump package version from `1.23.0` to `1.24.0`

**Note on statuses:** `absent` (never seeded) is deliberately distinct from `drifted`. A document that is registered
but never seeded is not a problem to act on, and folding the two together would flag it on every boot of a clean
install — training operators to ignore exactly the signal this feature exists to raise.

## Version 1.23.0

Local (username/password) authentication is real. It had never been implemented: the constructor overwrote whatever
was configured with `admin`/`admin` behind a "for testing purposes only" TODO, the check was a plain `===` on both
fields, and the session user it produced carried no email — which since `competence` began resolving identity by
email meant a local sign-in could not reach an application at all.

* feat (local-user-directory): new `#local-user-directory` module — a JSON file of user records loaded on boot and
  reconciled into Redis under `ti:web:auth:local-users`. Records carry `username`, `email`, `name` and a
  `passwordHash`; `email` is required, because it is the field a consuming application resolves an identity by. The
  file is the source of truth: a boot reconcile adds, updates and **removes**, so deleting a user revokes access
* feat (local-user-directory): scrypt password hashing via `node:crypto` — no new dependency — with a per-user random
  salt and the cost parameters recorded in each hash, so they can be raised later without invalidating existing
  hashes. Verification is timing-safe, and an unknown username still performs a hash computation so the login form
  is not a username-enumeration oracle
* feat (auth-manager)!: **the hardcoded `admin`/`admin` pair is gone.** Local sign-ins are verified against the
  directory, and `authorize()` returns a `User` carrying `userID`, `username`, `email` and `name` instead of a
  random-UUID stub. Any deployment relying on the hardcoded credentials must provision a users file
* fix (auth-manager): a local user's `userID` is stable across logins. It was a fresh UUID each time, so
  `auth.admins` could never match a local user by userID — only by username
* feat (build): `npm run hash-password` generates a record's hash, reading the password from **stdin** rather than
  argv, which would put it in shell history and in `ps`
* feat (web-config-env): `TI_WEB_AUTH_LOCAL_USERS_PATH` overrides `auth.local.usersPath`
* fix (auth-manager): close a fail-open found by the whole-branch review — `#authenticateLocal` and `authorize()`
  consulted the Redis-backed directory directly, so a users file that failed to load (missing, unreadable, or
  unconfigured) still authenticated against records reconciled by an **earlier successful boot**, even while
  logging that every local sign-in would be refused. A new `#localDirectoryUsable` flag is required by both
  before any lookup, and is set only after a load that reconciled at least one record. `authorize()` also now
  refuses a `disabled` record on its own, rather than relying on `authenticate()` having already been called
* fix (auth-manager): a Redis error during directory reconcile is now logged with only its `message`/`code` —
  the raw ioredis error carries the failed command's full arguments, which for this call includes every user's
  salt and scrypt hash, so logging it verbatim printed the entire directory's credential material at WARNING level
* build (release): bump package version from `1.22.0` to `1.23.0`

**Not included, and required before `local` is the sole method on an internet-facing deployment:** rate limiting,
lockout after repeated failures, and password policy.

## Version 1.22.0

An application may now refuse a sign-in from its `augmentSession` hook, and that refusal is genuinely fail-closed.
Sign-in failures also present identically across every auth method, which local (username/password) auth needs before
it can be offered as a production option.

* fix (web-handlers): destroy the session when an augment hook throws. `session.user` is assigned in place before the
  hook runs and `verifySession` only checks that it exists, so a merely-rejected session was still persisted by
  express-session at response end and would have admitted the refused user
* feat (web-server): document the `augmentSession` refusal contract — throwing refuses the login, destroys the session,
  and redirects to the login page carrying the exception code
* feat (web-handlers): redirect any HTML-accepting, non-HTMX **401** to `/?error=<code>`, not only `GET` requests, so a
  local-auth POST failure presents exactly like an OAuth callback failure. Non-401 responses are unaffected
* feat (web-app): render the sign-in failure message on the login page. `#ti-error` was an empty element and the
  `getUrlParam` helper had no call sites, so a failed sign-in previously returned a blank login form
* feat (exports): expose the authorization helpers as `@ti-engine/web-framework/authorization`, so an application can
  reuse `isAdminIdentity` for its own allowlist decisions instead of reimplementing the match
* build (release): bump package version from `1.21.0` to `1.22.0`

## Version 1.21.0

Two read-only screens the framework now provides for every consumer: **Profile** — which has been a registered
fragment rendering a two-line placeholder since the shell was written — and a new **About**, so a running instance
can finally answer "which build is this?" without shell access. Both are the same kind of screen (facts, grouped
into labelled sections), so the framework owns the screen — fragment, Alpine component, CSS — and an application
supplies only the content, through two virtual descriptor methods. Design record:
`docs/superpowers/specs/2026-08-13-profile-and-about-screens-design.md` (CA-99).

* feat (web-application): add `getProfileInfo( session )` and `getApplicationInfo( session )` — virtual methods
  returning a display-ready `{ identity, sections }` descriptor, dispatched from `processDataRequest` for the
  `profile` and `about` views. A subclass overrides one or both and inherits the entire screen. Every string in a
  descriptor is resolved server-side, where the session language and the label catalogue are
* feat (application-info): new `#application-info` module — the pure `buildApplicationInfo()` normalizes a
  `package.json`-shaped manifest (display name derived from the package name, author contact stripped, a `git+…​.git`
  repository URL reduced to a browser-openable homepage) and applies the `TI_WEB_APP_NAME` / `TI_WEB_APP_VERSION` /
  `TI_WEB_APP_RELEASE_DATE` overrides; `readApplicationManifest()` is the one impure half and returns `{}` rather
  than throwing, so a missing or malformed manifest cannot take a request down
* feat (web-application): register the `about` fragment, and add `buildComponentsConfig( session )` supplying a
  default sidebar user menu (Profile · About · sign-out) so a consuming application gets a working user menu without
  configuring one
* feat (static): new `frame-about.html` and a rebuilt `frame-profile.html` — content-free renderers over the
  descriptor — plus the `tiScreenProfile` / `tiScreenAbout` Alpine components. The About screen's release, component
  and runtime sections are assembled client-side, where `getLabel` takes a fallback, which is what keeps them
  readable inside an application that loads only its own label catalogue
* feat (static): add the reusable `.ti-identity-*` / `.ti-info-*` CSS primitives (identity header with avatar or app
  mark, and the two-up grid of label/value sections), plus `.ti-kv-value.mono` / `.mono`-and-`.muted` modifiers
* feat (localization): add `interface.profile.*`, `interface.about.*`, `interface.topbar.profile|about` and
  `interface.user-menu.*` defaults in en/bg
* fix (web-application): a framework-owned screen that resolves its own strings server-side would render the
  not-found placeholder inside a consuming application, because an application configures exactly one labels path —
  its own — and never loads `web-server-labels.json`. Every such lookup now passes a readable English literal as the
  `getLabel` fallback added in `@ti-engine/core` 1.10.0 (**requires it**), rather than comparing the result against
  a hard-coded copy of core's placeholder string
* build (release): bump package version from `1.20.1` to `1.21.0`

## Version 1.20.1

* fix (types): emit `/// <reference types="node" />` into `web-server.d.ts`, which names `node:http`.
  Without it a consumer who has not separately configured Node's types gets `TS2591` from inside the
  published declarations. See `@ti-engine/core` 1.9.1 for why the 1.20.0 gate did not catch this
* build (release): bump package version from `1.20.0` to `1.20.1`

## Version 1.20.0

TypeScript declarations now ship with the package, verified against a consumer type-checking with `skipLibCheck: false`
before they can be committed. See `@ti-engine/core` 1.9.0 for why the previous attempt was withdrawn.

* feat (types): generate and publish `.d.ts` declarations for every module, wired through `types` conditions in both
  `exports` and `imports`
* feat (definitions): expose the shared type definitions as `@ti-engine/web-framework/definitions`
* fix (session-store)!: the store's `set`, `get` and `touch` are typed against `express-session`'s `SessionData`, which
  is what the `Store` contract hands them — not `TiSession`, which additionally requires `id`, `save`, `regenerate` and
  `destroy`. The implementation only ever reads `cookie.maxAge`, so the annotation was describing a stricter input than
  the base class can supply and than the code needs. Documentation only; no behaviour changes
* fix (web-handlers): `ExpressResponse` referred to `import("express").res`, which express does not export. It is
  `Response`
* refactor (exports): the extras hung off `module.exports` after a class assignment — `instance`, `authMethod`,
  `applyAuthMethodVisibility`, the static route matchers — are assigned to the class itself. `module.exports` *is* the
  class, so this is the same object with the same properties at runtime; as a declaration it is the difference between
  a namespace merge and an export assignment colliding with named exports, which is not valid TypeScript
* fix (types): the same closure-style `{function(...)}` and `@private`-on-`#member` corrections as `core` 1.9.0
* build (deps): add `@types/express`, `@types/express-session` and `@types/node`. The published declarations name types
  from all three

## Version 1.19.1

Documentation and packaging only — no functional change.

The `SemanticValidator` fix was found while attempting to generate TypeScript declarations from the framework's JSDoc. That work is **deferred to a later
release**, but this correction stands on its own: the typedef was written as `function(Object, ValidatorContext): (ConfigValidationIssue[]|Promise<ConfigValidationIssue[]>)`, whose parenthesised return type inside the Closure form no parser can read. It described the validator contract correctly to a human reader and not at all to a machine.

* fix (config-registry): rewrite the `SemanticValidator` typedef in arrow syntax
* feat (package): declare `keywords`, which the package had none of — the terms npm search matches against

## Version 1.19.0

`/static` was served with `max-age=1y, immutable` for every consumer of the framework. `immutable` is a promise that the bytes behind a URL will never change, and browsers honour it so completely that not even a manual reload revalidates — so the promise is only true for a content-addressed URL (`app.a1b2c3.css`). None of the framework's own assets are named that way (`/static/scripts/ti-framework.js`, the theme sheets), which made this an unsafe default that shipped to npm: a deployed CSS or JS fix would never reach anyone who had already visited, for up to a year, with no way to tell them otherwise. The standalone author's site had worked around it privately by fingerprinting its own asset URLs; every other consumer still inherited the bug.

* fix (web-server)!: the default `/static` cache policy is now `public, max-age=0, must-revalidate` instead of `max-age=1y, immutable`, so a deployed asset change actually reaches a returning visitor. `express.static` still attaches an `ETag`/`Last-Modified`, so a revalidation of an unchanged asset is answered with a `304` — headers, no body.
  **A consumer whose asset filenames are content-addressed should opt back
  in** with `staticCache: { maxAge: 31536000, immutable: true }`; one that appends a content hash to its asset URLs (rather than to the filenames) is equally entitled to it
* feat (web-server): add the `staticCache` configuration block — `maxAge` (whole
  **seconds**, mapping 1:1 onto the `Cache-Control` directive; an express-style `"1y"` duration string is reported rather than silently reinterpreted as milliseconds), `immutable`, and `immutablePaths` (path prefixes served long-lived and `immutable` regardless of the other two). `immutable` combined with a `maxAge` of 0 is a contradiction and is dropped with a warning, so a half-configured deployment costs a revalidation rather than a year of unreachable assets
* feat (web-server): `staticCache.immutablePaths` defaults to `[ "/fonts/" ]` — a released `.woff2` is an artifact rather than something edited in place, and its filename already carries the family, weight and style. Configurable, and clearable with an explicitly empty array, because that is a statement about how a given deployment manages its font files
* feat (web-framework): add the `TI_WEB_STATIC_MAX_AGE`, `TI_WEB_STATIC_IMMUTABLE`, and `TI_WEB_STATIC_IMMUTABLE_PATHS` environment overrides, so the cache policy is settable per deployment like every other web setting; `TI_WEB_STATIC_IMMUTABLE_PATHS`
  **replaces** the array, and an explicitly empty value means no long-lived paths
* refactor (web-server): the `/static` mounts write `Cache-Control` per file through `express.static`'s `setHeaders` rather than its `maxAge`/`immutable` options, since the policy is no longer uniform across the tree; the decision itself lives in the pure, unit-tested `TiWebServer.resolveStaticCachePolicy()` (config → policy + warnings, which the caller logs) and `TiWebServer.staticCacheControlFor()` (policy + file → header). The `staticCache` defaults deliberately live on the class rather than in `web-server.json`, because the constructor's `_.merge` merges arrays by index and a consumer's empty `immutablePaths` could otherwise never clear a default entry
* docs (web-framework): document the `staticCache` block, the revalidating default and the reasoning behind it, and the fingerprinting opt-in in the README
* build (release): bump package version from `1.18.1` to `1.19.0`

## Version 1.18.1

Enabling Azure SSO took the instance down at startup: the OAuth2 callback was registered by handing the configured callback value straight to Express as a route path, and the installation docs tell operators to set that value to the full absolute URL registered with the identity provider. Express 5 parses route patterns with path-to-regexp v8, where `:` opens a parameter name — so `https://host/login/azure-callback` throws `Missing parameter name at index 6` and the web server never starts. Google was affected identically, which also made this a prerequisite for the competence Cloud Run deployment, whose `deploy.sh` patches in an absolute callback URL (CA-97).

* fix (web-framework): register an OAuth2 callback by its
  **path** rather than by the configured value verbatim, so a callback given as the absolute URL registered with the provider no longer crashes startup; a callback that yields no usable path now logs a WARNING and skips that provider's endpoint instead of taking the instance down, matching how an enabled-but-unconfigured provider is already handled
* feat (web-framework): add `AuthManager.getOAuth2CallbackPath( authMethod )` and the pure, unit-tested `AuthManager.toCallbackPath( callbackUrl )` — reduces an absolute, protocol-relative, path or bare relative callback to its route path (query string and fragment stripped), or `null` when no usable path can be derived. The `redirect_uri` sent to the provider is deliberately left as configured, so an absolute callback keeps matching the provider registration exactly instead of depending on the forwarded protocol/host being correct
* docs (web-framework): document the OpenID Connect provider variables in the README, and state in the README, the competence `INSTALL.md` and `.env.example` that a callback URL may be given as either the absolute registered URL or a path — including what each implies for the `redirect_uri`, and that the path must be the one the app actually receives when a proxy strips a prefix
* build (release): bump package version from `1.18.0` to `1.18.1`

## Version 1.18.0

Every web-server setting a container deployment needs could be supplied per environment except one: the admin allowlist. `auth.admins` was readable only from the config file baked into the image, so a containerized deployment had no way to name an administrator — leaving the admin configuration screens unreachable, or forcing a real identity to be committed to the repository. This closes that gap in the existing `TI_WEB_*` override set (CA-94).

* feat (web-framework): add the `TI_WEB_AUTH_ADMINS` environment override — comma-separated,
  **replaces** `auth.admins` (matched against the session user's user ID, username or email), so the admin allowlist is configurable per environment like every other web setting; an explicitly empty value means no admins
* docs (web-framework): document `TI_WEB_AUTH_METHODS` and `TI_WEB_TRUSTED_ORIGINS` in the README's environment-variable list, which had never listed them
* build (release): bump package version from `1.17.1` to `1.18.0`

## Version 1.17.1

A validator that needs to compare its own config document against its previously committed state had no way to do so: `applyEdits`'s cross-document context resolves `getConfig` to the
*pending* value for any document inside the current edit batch — by design, so a validator can check a sibling document's post-edit state — but a document is always part of its own edit batch, so calling `getConfig` on itself just hands back the same incoming value already passed as the validator's argument, never its prior state. This silently defeated the competence `research-consent` config's version-bump guard (CA-93).

* feat (web-framework): add `getStoredConfig(key)` to the `applyEdits` validator context (`ConfigService`) — always resolves the current
  *committed* value from the store, even for the document currently under validation, so a validator comparing its own document against its previous state has a way to do it; purely additive — `getConfig`'s existing cross-document (pending-value) semantics are unchanged
* build (release): bump package version from `1.17.0` to `1.17.1`

## Version 1.17.0

Route-registration seams so an application subclass can add its own Express routes and unprotected-route patterns — enabling public, content-driven sites (the first consumer being the standalone author's site) to layer a catch-all content resolver over the framework without reaching into private state.

* feat (web-server): add `TiWebServer.registerRoute( method, path, ...handlers )` — registers a custom route on the underlying Express app from a `defineWebApplicationRoutes()` override (after `super()`), so a catch-all resolver can be mounted after the framework's own routes but before its `*splat` 404 handler. Limited to route-scoped verbs (get/post/put/patch/delete/options/head/all); raises `E_GEN_INVALID_ARGUMENT_TYPE` for any other method and `E_GEN_NOT_INITIALIZED` if called before the Express app exists. The method must be a
  **string** — a non-string is rejected outright rather than coerced, so a value whose `toString()` happens to yield a verb (`[ "get" ]`, `new String( "get" )`) cannot slip past the allowlist and register a route
* feat (web-server): add `TiWebServer.addUnprotectedRoute( pattern )` — appends a string (exact-match) or RegExp (tested) pattern to the unprotected-routes list from a `defineUnprotectedRoutes()` override, so a public-by-default site can invert the framework's protect-by-default stance; non-string/non-RegExp values are ignored with a warning
* refactor (web-server): extract the unprotected-route matching loop from `isUnprotectedRoute()` into the pure, unit-tested `isRouteInList()` helper (behavior unchanged, including the defensive `lastIndex` reset), and add the `normalizeRegistrableMethod()` helper — both exported for testing alongside the existing `RE_*` matcher constants
* build (release): bump package version from `1.16.0` to `1.17.0`

## Version 1.16.0

Support explicitly trusted request origins so state-changing requests (e.g. login) work behind proxies that do not present the app's external host — most notably GitHub Codespaces port forwarding (CA-90).

* feat (web-framework): add `TI_WEB_TRUSTED_ORIGINS` (comma-separated) / `config.trustedOrigins`. The `originRefererValidationHandler` now accepts a non-GET request whose `Origin`/`Referer` matches the server-reconstructed base URL
  **or** any configured trusted origin. Previously such a request behind a proxy that rewrote/omitted the forwarded host was rejected with `E_WEB_INVALID_REQUEST_PARAMETERS` (HTTP 403). Backward compatible (empty list = prior behavior); the CSRF double-submit token check is unchanged and still enforced
* build (release): bump package version from `1.15.0` to `1.16.0`

## Version 1.15.0

A dedicated health endpoint, a `TI_WEB_AUTH_METHODS` env override, and login-page gating for every auth method — completing the container-friendly auth/health story for the competence deployment (CA-90).

* feat (web-framework): add an unprotected `GET /health` endpoint (`healthHandler`) that returns `200` with `{ status, broker, uptime }` — a purpose-built liveness/readiness probe for container and orchestrator health checks, so probes no longer have to hit the user-facing login route; `broker` reports the Redis connection state
* feat (web-framework): add the `TI_WEB_AUTH_METHODS` env override (comma-separated) which REPLACES `auth.enabledMethods` — a clean, 12-factor way to select enabled auth methods per deployment (the config-file merge is by-index and cannot cleanly override an array)
* feat (web-framework): extend login-page auth gating from the OAuth buttons to every method — the `local` credentials form and the "or continue with" divider are now gated too, and a "no method configured" fallback is shown when nothing is enabled, so an SSO-only deployment presents no dead local form
* build (release): bump package version from `1.14.1` to `1.15.0`

## Version 1.14.1

Security hardening for the web-server CodeQL findings raised after the scanner was modernized in CA-90 (CA-91).

* fix (web-framework): rewrite the default unprotected static-asset route matchers from the ambiguous `(?:.+/)*` to segment-anchored `(?:[^/]+/)*` — the previous form backtracked exponentially and is evaluated against the raw request path in `isUnprotectedRoute()` before authentication, making it a pre-authentication denial-of-service vector (CodeQL js/redos); the matched language for realistic asset paths is unchanged, and the matchers are now the `RE_STATIC_UNPROTECTED` / `RE_WELL_KNOWN_UNPROTECTED` module constants
* fix (web-framework): replace the login-fragment section stripper's `open[\s\S]*?close` global-regex removal with a linear `indexOf`-based `stripMarkerSpans()` helper (also used for the per-provider stripper), eliminating the polynomial-time rescan on hostile input (CodeQL js/polynomial-redos)
* docs (web-framework): document that Helmet's built-in Content-Security-Policy is intentionally disabled because a per-request, nonce-based CSP is enforced by `cspHeaderHandler()` on the following middleware — added an explanatory comment and an inline CodeQL suppression (the alert is a false positive)
* build (release): bump package version from `1.14.0` to `1.14.1`

## Version 1.14.0

`TI_WEB_*` environment-variable overrides for the web server configuration, enabling 12-factor container deployments without per-environment config files (CA-90).

* feat (web-framework): add `applyWebConfigEnvOverrides( config, env = process.env )` (`#web-config-env`) — a pure helper applying `TI_WEB_HOST`, `TI_WEB_PORT`, `TI_WEB_USE_TLS`, `TI_WEB_TLS_CERT_PATH`, `TI_WEB_TLS_KEY_PATH`, and `TI_WEB_COOKIE_SECRET` overrides onto the merged `TiWebServer` configuration, only when each variable is defined (fully backward compatible)
* fix (web-framework): skip an enabled OpenID Connect provider that has no client ID instead of crashing the instance during discovery — an OAuth-less deployment (e.g. a container started without OAuth credentials) now boots on its remaining methods, with a warning, and reports the dropped provider as unavailable so a sign-in attempt against it fails per-request rather than at startup
* feat (web-framework): the login page now renders an OpenID provider button only when that provider is an effective enabled auth method — the web server passes the post-drop enabled methods to the app manager, which strips the Google/Azure button (and the whole "or continue with" section when no provider is available) from `frame-login.html` at render time
* build (release): bump package version from `1.13.2` to `1.14.0`

## Version 1.13.0

A reusable role-based screen gate and a per-screen title override (back the competence screen-access work and the evaluation/scores screen split).

* feat (web-framework): the default `TiWebAppManager.verifyAccess` now enforces a fragment's declared `roles` — a fragment registered (via `addFragment`) with a `roles` array is served only to sessions holding at least one of them (otherwise rejected `E_SEC_UNAUTHORIZED_ACCESS` 403), while a fragment with no `roles` stays public. This makes role-restricted screens unreachable by direct URL, not merely hidden in the UI; apps just declare `roles` on `addFragment` — no `verifyAccess` override needed. Backward compatible: all existing role-less fragments remain public
* feat (web-framework): add `authorization.isAccessAllowed( requiredRoles, userRoles )` — a pure, unit-tested access decision (empty/absent roles = public; otherwise ≥1 overlap; no implicit hierarchy, so an `admin` gate is never satisfied by a numeric role) that backs the default `verifyAccess`
* feat (web-framework): add `tiApplication.setScreenTitle( title )` — a per-screen topbar/document-title override (cleared automatically on navigation) so a screen can correct its own title at runtime (e.g. a manager viewing another user's scores must not read "My …")
* build (release): bump package version from `1.12.0` to `1.13.0`

## Version 1.12.0

Chart primitives gain legends + value labels for grouped bars and a legend for radar (backs the leaner competence evaluation results view) (CA-61).

* feat (web-framework): `ti-charts` grouped bars now render an optional swatch legend (`options.legend`) and per-bar value captions (`options.valueLabels`); radar charts render an optional legend, with a dashed swatch variant (`{ dashed: true }`) for dashed series such as an "expected" curve (CA-61)
* feat (web-framework): add `.ti-chart-bar-seg.tone-info`, `.ti-chart-legend-swatch.tone-info`, and `.ti-chart-legend-swatch.is-dashed` so grouped/radar source series and their legends share one colour scale across both themes (CA-61)
* feat (web-framework): `ti-charts` radar accepts an optional per-axis `tone`, applied as a `tone-*` class on the axis label so consumers can colour axis labels (e.g. by category) — threaded through `radarLayout` (CA-61)
* feat (web-framework): `ti-charts` grouped bars accept optional `options.barThickness` (bar height) and `options.valueFontSize` (value-caption font); value captions carry a dedicated `ti-chart-bar-value` class that intentionally sets no CSS `font-size`, so the renderer's `font-size` presentation attribute (default 4) actually governs — previously the caption also carried `ti-chart-bar-label`, whose CSS `font-size: 4px` overrode the attribute and made `valueFontSize` a no-op (CA-61)
* build (release): bump package version from `1.11.1` to `1.12.0`

## Version 1.11.1

Post-review fix from the CA-72 CodeRabbit review (PR #85) on the login test-user panel.

* fix (web-framework): turning the "override roles (dev)" toggle OFF now always strips any persisted roles from the `ti-test-user` cookie — even when the selected employee is no longer in the panel's profile list — so a stale roles array can't keep overriding the app's org-derived roles on the next login (CA-72)
* build (release): bump package version from `1.11.0` to `1.11.1`

## Version 1.11.0

Login test-user panel defaults to identity-only injection so the app derives roles itself (CA-72).

* feat (web-framework): login test-user panel injects identity only by default (roles derived by the app); role injection becomes an opt-in dev override (CA-72)
* docs (web-framework): clarify the augmentSession contract (derive vs. override) (CA-72)
* build (release): bump package version from `1.10.4` to `1.11.0`

## Version 1.10.4

Login test-user fixture follow-up (CA-71).

* chore (web-framework): login test-user `8` carries the `MANAGER` role (`[1, 2]`) so manager / self-manage scenarios (e.g. the competence Org Chart self-manage gate) can be exercised without re-seeding
* build (release): bump package version from `1.10.3` to `1.10.4`

## Version 1.10.3

Developer-tooling and formatting touch-ups on the shared frontend bundle.

* chore (web-framework): the login test-user panel offers more seeded employees (3, 8, 9 alongside 22/20/1/4) so manager / direct-report / skip-level scenarios can be exercised without re-seeding
* style (web-framework): minor formatting of `formatException`'s return object
* build (release): bump package version from `1.10.2` to `1.10.3`

## Version 1.10.2

Readability and scaling fixes for the chart primitives, surfaced while polishing the Statistics & Results screens (CA-61).

* fix (web-framework): stacked bar charts now caption each row (the group/cycle label plus an optional per-row value) and render an optional swatch legend driven by `spec.options.legend`, so a coverage "By group" chart reads as labelled bars instead of anonymous colour blocks; the row labels also land on the cross-cycle trend bars
* fix (css): horizontal bar charts opt out of the global `svg` `max-height` so bar thickness and label size stay identical regardless of row count — a tall org-wide chart is no longer uniformly scaled down and rendered finer than the same chart on a smaller subtree; the per-row geometry is trimmed for a cleaner look
* feat (css): `.ti-chart-legend` / `.ti-chart-legend-item` / `.ti-chart-legend-swatch` — a chart swatch legend whose colours route through the inherited grade/ink chart tokens
* build (release): bump package version from `1.10.1` to `1.10.2`

## Version 1.10.1

Review fixes for the ti-chart primitives (Statistics & Results, CA-61, PR #83 — CodeRabbit pass).

* fix (web-framework): drillable heatmap/box marks get an accessible name; `renderChart` clears stale `data-ti-chart-empty`/`aria-label` on rerender; `renderStat` renders a missing value as an em dash; the provisional line-dot stroke follows its `tone-*` class
* fix (css): `.ti-chart-sr` uses `clip-path: inset(50%)` instead of the deprecated `clip` property
* build (release): bump package version from `1.10.0` to `1.10.1`

## Version 1.10.0

### Charting primitive library (Statistics & Results, CA-61)

* feat (web-framework): new `ti-charts.js` — a CSP-safe SVG charting library backing the competence Statistics & Results reporting. Eight primitives via a single `renderChart(figure, spec)` dispatcher: `gauge`, `bars` (stacked / grouped / diverging modes), `stat`, `scatter`, `heatmap` (sequential / diverging scales), `box`, `radar`, and `line` (mean + p25–p75 band, sparkline, stacked, dashed-provisional trailing segment). The pure layout helpers (`gaugeArcPath`, `barSegments`, `scatterLayout`, `heatmapLayout`, `boxLayout`, `radarLayout`, `lineLayout`, …) are unit-tested in isolation
* feat (web-framework): register the `x-ti-chart` Alpine CSP directive (binds a spec object to a host `<figure>`); every chart builds its SVG with `createElementNS` + `setAttribute` only (never `element.style.*` except `setProperty("--var")`) and ships a visually-hidden `.ti-chart-sr` accessibility table
* feat (css): `.ti-chart-*` styles + per-type `figure[data-ti-chart-type]` size caps + `--chart-seq-1…5` sequential ramp tokens and grade/tone colours in both themes (daylight + black-glass)
* build (release): bump package version from `1.9.3` to `1.10.0`

## Version 1.9.3

* feat (css): an empty `.ti-grade-chip` (a competency whose rating is still awaited) now renders an hourglass glyph via `::before` instead of a literal dash, so "awaiting rating" reads as a clear visual state wherever an empty grade chip is shown to a permitted viewer
* build (release): bump package version from `1.9.2` to `1.9.3`

## Version 1.9.2

* feat (css): add `.ti-spacer` — a flexible spacer (`flex: 1 1 auto`) that pushes following siblings to the far end of a flex row/column. Promotes the bespoke per-screen `competence-empmgmt-actions-spacer` into a shared primitive, now consumed by the employee-management actions panel and the evaluation screen's team-feedback finalize bar
* build (release): bump package version from `1.9.1` to `1.9.2`

## Version 1.9.1

* build (deps): upgrade `ajv` from ^6.15.0 to ^8.20.0 — ajv 8 renamed the validation-error `dataPath` (dot style) to `instancePath` (JSON Pointer)
* fix (config-registry): normalize ajv 8's `instancePath` back to the dot/bracket data path the registry has always exposed on schema issues (e.g. `.competencies.E1-1.name`, array indices as `[0]`), so the public `ConfigValidationIssue.path` contract is unchanged across the upgrade; the ajv compile options (`meta`, `schemaId: "$id"`, `validateSchema: false`) and Draft-07 handling are unchanged
* build (deps): update `helmet` from ^8.1.0 to ^8.2.0

## Version 1.9.0

* feat (css): add `.ti-panel-body-intro` — the canonical description/intro line under a `.ti-panel-head` (`--fs-sm`, secondary foreground, `0 var(--s-3) var(--s-5)` padding, 1.5 line-height); replaces the per-screen intro paragraphs that screens used to hand-style
* refactor (css): tighten the key/value primitives — `.ti-kv-label` is now an uppercase `--fs-xs` 600-weight caption (0.05em letter-spacing); `.ti-kv-value` is `--fs-sm` 400-weight — for a consistent, scannable key/value rhythm across screens
* refactor (css): drop the redundant `margin-left: auto` from `.ti-panel-head-aside` (the panel head already positions it via its flex layout)
* fix (sidebar): the user-profile flyout actions (Profile, Settings, Logout) now actually fire. The menu items bind their `hx-*` attributes through Alpine (`x-bind`), which HTMX does not pick up on its initial document scan — so the buttons previously only closed the flyout. The flyout now runs `htmx.process` on its panel when it opens (idempotent on re-open), wiring up each button's `hx-get`/`hx-post`/`hx-target`/`hx-swap`
* fix (sidebar): the role/department line under the user name no longer overflows the fixed-width sidebar — `.ti-sidebar-user-name` and `.ti-sidebar-user-sub` truncate with an ellipsis, and `.ti-sidebar-user-text` gets `flex: 1` so it bounds the text column
* style (css): expand the `.ti-icon` size-modifier one-liners (`.xs`/`.sm`/`.md`/`.lg`/`.xl`) to block form for consistency with the rest of the sheet
* build (release): bump package version from `1.8.0` to `1.9.0`

## Version 1.8.0

* feat (notifications): notifications can now show a secondary
  **details** line under the generic message. `tiApplication.formatException` returns `{ message, details }` (resolved from the exception's `data.details`, falling back to the raw text for non-localized messages) and `tiApplication.notify` accepts that payload — so an error like "The request parameters are not recognized or not supported." now also shows the specifics (e.g. "Competency codes not in the 'QE' pool: …") in a smaller, muted font. The returned object stringifies to its message, so existing string usages keep working unchanged
* fix (css): raise the toast stack above the modal layer (`z-index` 1100 → 1300; the modal backdrop is 1200) so a notification raised while a modal is open is no longer hidden behind it

## Version 1.7.1

* fix (web-handlers): web-application request errors that carry no explicit `httpCode` are no longer reported as `500`. A new `resolveHttpCode` derives the status from the exception code — request-validation and application-logic errors (`E_WEB_*` / `E_APP_*`) map to `422 Unprocessable Content`, security (`E_SEC_*`) to `403`, resource not-found/already-exists to `404`/`409`, and method/URI/content errors to `405`/`404`/`415`; only genuine internal, communication, and unknown errors still default to `500`. An explicit `httpCode` on the exception always wins. Applied in both the `/app` request handler (`formatException`) and the default error handler

## Version 1.7.0

* feat (css): introduce `.ti-data-grid` family — `.ti-data-grid`, `.ti-data-grid-head`, `.ti-data-grid-rows`, `.ti-data-grid-row` with shared `--ti-grid-cols` template; row state modifiers `.is-current` (accent-soft, "current user") and `.is-selected` (accent-soft + left accent bar); wrapper variants `.bordered` (horizontal dividers for tabular displays) and `.compact` (denser padding); cell utilities `.ti-cell-center` / `.ti-cell-right` for per-cell alignment
* feat (css): introduce `.ti-page-head` as a vertical block stack (eyebrow above title, subtitle below) using `--fs-xs` for the eyebrow and clamping subtitle width at 60ch
* feat (css): introduce a reusable `.ti-form*` family — `.ti-form`, `.ti-form-section`, `.ti-form-section-title`, `.ti-form-grid` (with `.cols-1` / `.cols-3` modifiers), `.ti-form-row` (with `.wide` for grid-spanning), `.ti-form-readonly`, `.ti-form-hint`, `.ti-form-error`, `.ti-form-actions`, `.ti-form-state` (with `.saved` / `.unsaved`); single responsive collapse to one column under 720px
* feat (css): extend `.ti-panel-head` with sub-elements — `.ti-panel-head-icon` (32x32 framed icon slot), `.ti-panel-head-text` (title + subtitle stack inside a flex row), `.ti-panel-title-aside` (inline qualifier next to the title), `.ti-panel-subtitle` (dimmed sub line), `.ti-panel-head-aside` (right-aligned read-only info with left-border separator), and the `.bar` modifier (sunken full-width banner)
* feat (icons)!: rebase `.ti-icon` on `background-color: currentColor` so icons inherit the surrounding text colour; add size modifiers `.xs` (12px), `.sm` (14px), `.md` (16px), `.lg` (24px), `.xl` (32px); add `.legacy-gray` modifier to preserve the previous gray/hover behaviour for consumers that rely on the fixed colour scheme
* feat (icons): add 21 new `.ti-icon` variants (lucide / feather style, 24x24 viewBox) — `plus`, `close`, `check`, `check-clipboard`, `send`, `search`, `clock`, `warning-triangle`, `info-circle`, `bell`, `check-circle`, `eye`, `calendar-blank`, `user`, `users`, `briefcase`, `folder`, `book`, `help-circle`, `bar-chart`, `chevron-left`, `chevron-right`, `dashboard-grid`, `cycles-loop`, `sun`
* feat (icons): add `.ti-icon.moon` mask variant so theme toggles can mirror the target mode
* feat (framework): add `tiApplication.hasRole(roleCode)` helper that does the array-shape check in plain JS (the Alpine CSP build does not expose `Array` to its expression evaluator, so `Array.isArray(...)` written inline in a template raises `Undefined variable: Array`)
* feat (framework): add `tiApplication.topbarPrimaryCta` store slot plus `setTopbarPrimaryCta` / `setTopbarPrimaryCtaDisabled` API for per-screen CTA buttons in the topbar; auto-cleared on screen navigation so each screen owns its slot
* feat (css): native select chevron replaced by a custom down-chevron SVG positioned at right: 10px / 14x14; padding-right reserves the slot; glass theme overrides the SVG stroke colour because `background-image` can't pick up `currentColor`
* feat (css): subdue `::-webkit-calendar-picker-indicator` to opacity 0.7 (1 on hover) so date-input visual weight matches the chevron
* feat (notification bar): replace inline toast SVGs with `.ti-icon` mask classes (success check, danger close, warn triangle, info circle, close button)
* feat (sidebar): replace inline navigation SVGs with `.ti-icon` mask classes (collapse chevron, dashboard home, sun theme toggle)
* refactor (css): drop the screen-specific page-header, form, and tabular-layout CSS that duplicated framework primitives; all in-tree screens (`frame-employees-list`, `frame-cycles`, `frame-cycle-setup`, `frame-competence-evaluation`, `frame-new-evaluation`, `frame-manager-calendar`, `frame-interview-schedule`, `frame-employee-management`) now consume `.ti-page-head`, `.ti-data-grid`, `.ti-form*`, and `.ti-panel-head*` instead
* docs (modal): doc-block on `.ti-modal-*` confirming it as the canonical shared primitive (introduced in 1.6.3 via the competence cycle-setup work)
* build (release): bump package version from `1.6.3` to `1.7.0`

## Version 1.6.3

* feat (css): add `--ti-internal-padding` CSS variable to the design token system
* feat (css): add `--ti-border-color` CSS variable for consistent border theming
* feat (icons): add `.ti-icon.calendar` and `.ti-icon.schedule` icon variants with hover states
* feat (css): add `.ti-data-value.fill-space` modifier for flex-grow behavior in inline data value layouts
* fix (css): remove `min-width: 120px` constraint from `.ti-button.inline` for more flexible sizing
* fix (css): update z-index stacking values for dropdown and overlay elements to prevent layering conflicts
* build (deps): update `openid-client` from ^6.8.2 to ^6.8.4
* build (deps): update bundled `@alpinejs/csp` from ^3.15.11 to ^3.15.12
* build (deps): update bundled `htmx.org` from ^2.0.8 to ^2.0.10
* build (static): refresh bundled Alpine.js CSP and HTMX library files to match updated dependency versions

## Version 1.6.2

* feat (ui): replace Material Symbols usage with framework-native `.ti-icon` classes across sidebar flyouts, login actions, and notification bar
* feat (sidebar): merge administration and user flyout menus into a single `sidebarApplicationMenu` with configurable menu icon and updated actions
* feat (css): add embedded SVG mask icon variants (`app-menu`, `dashboard`, `settings`, `error`, `user-profile`, `login`, `logout`, `internet`) and increase default icon size to `24px`
* refactor (theme): remove Material Symbols-specific icon styling from the black-glass theme
* build (static): remove external Google Material Symbols stylesheet import from static `index.html`
* build (release): bump package version from `1.6.1` to `1.6.2`

## Version 1.6.1

* feat (css): add inline button support via `.ti-button.inline` and new `--ti-button-inline-height` design token
* refactor (ui): update sidebar flyout positioning logic to use shared `tiToolbox` viewport helpers (`getVisibleBox`, `clampToBox`)
* fix (ui): fix the call to utility functions `getVisibleBox` and `clampToBox` in the sidebar flyout component
* build (release): bump package version from `1.6.0` to `1.6.1`

## Version 1.6.0

* feat (toolbox): add Alpine.js `tiToolbox` store with shared utility methods (`deepMerge`, `deepFreeze`, `structuredClone`, `formatDate`, viewport helpers, and cookie access)
* feat (ui): move sidebar menu configuration into `ti-framework.js` and register `tiComponentsConfig` during Alpine.js initialization
* refactor (static): remove legacy `ti-user-interface.js` from static assets and stop loading it from `index.html`
* refactor (components): update framework components to consume toolbox utilities through Alpine stores
* refactor (docs): add and expand JSDoc typedefs and method-level documentation in `ti-framework.js`
* build (release): bump package version from `1.5.3` to `1.6.0`

## Version 1.5.3

* feat (framework): add `openScreen` method for in-app navigation
* fix (auth): add explicit HTTP `401` status to authentication failure

## Version 1.5.2

* feat (framework): expand application API by improving `sendRequest`, `notify`, and `getLabel` methods
* feat (tooltip): add helper methods `getTooltipMessage`, `handleEnter`, `handleLeave`, `showTooltip`, `hideTooltip` to the tooltip component
* feat (css): improve styles and style structure

## Version 1.5.1

* feat (framework): add `isValidDate` utility function for validating Date instances
* feat (framework): add `deepFreeze` utility function for recursive object freezing
* feat (framework): add `getLabel` method on application configuration for nested label resolution with dot notation
* feat (framework): add Alpine.js directive `x-text-label` for runtime label translation
* feat (framework): add a configuration object to replace labels object with enhanced structure
* feat (config): add authentication state (`auth.isAuthenticated`) to config endpoint response
* feat (placeholder): add inner content capture and injection for placeholder replacement
* feat (tooltip): add a new tooltip component with Alpine.js integration and positioning
* feat (css): add CSS custom properties for padding, margin, and font-family
* feat (css): add tooltip styling variables (background, foreground, size, shadow, arrow)
* feat (css): add `.ti-content.pane` block with flex layout and overflow handling
* feat (css): add error color, flyout item shadows, and separator color variables
* feat (css): add `.ti-glass-btn-black.large` variant with left-justified content
* refactor (framework): change user initialization from `undefined` to `null`
* refactor (framework): improve request failure handling with proper error rejection
* refactor (css): replace hard-coded spacing with CSS variables across components
* refactor (css): add `overflow: hidden` to body and `.ti-main` for better layout control
* refactor (css): convert color and styling values to CSS variables throughout
* refactor (handlers): add `convertUriToString` helper for safe URI object stringification
* refactor (handlers): add a request context object (query, params, headers, url, method) to JSON responses
* refactor (handlers): augment user data with default employeeID and roles in the user information handler
* build (deps): update express from ^5.1.0 to ^5.2.1
* build (deps): update express-session from ^1.18.2 to ^1.19.0
* build (deps): update lodash from ^4.17.21 to ^4.17.23
* build (deps): update openid-client from ^6.8.1 to ^6.8.2
* build (deps): update `@alpinejs/csp` from ^3.15.2 to ^3.15.8
* build (engines): update Node.js requirement from >=18.0.0 to >=20.0.0

## Version 1.5.0

* feat (web-app)!: change `TiWebAppManager` to be an abstract class
* feat (web-app): rename class `WebAppManager` to `TiWebAppManager` and add a static file caching mechanism
* feat (web-app): add `addFragment` method with override protection for custom HTML fragment registration
* feat (web-app): add `webAppIdentifier` getter to expose application identifier
* feat (web-server): add support for dynamic web application instantiation from config via `classPath`
* feat (web-server): add `defineWebApplicationRoutes` and `defineUnprotectedRoutes` extension points
* feat (web-server): add `endpointEnabled` flag to conditionally enable API endpoint proxy
* feat (web-server): add serving for `.well-known` directory for web standards compliance
* feat (package): add public exports for `./web-application` and `./web-server` subpaths
* feat (package): add `files` whitelist and repository metadata (homepage, bugs URL, git repository)
* feat (package): add Node.js version requirement (>=18.0.0) via the `engines` field
* feat (build): add a post-install script to vendor HTMX and Alpine.js CSP libraries locally
* refactor (web-app): replace `fullPublicPath` with `staticContentPaths` array for multi-path static content resolution
* refactor (web-app): add file location search algorithm with caching via `#locateStaticFile` method
* refactor (web-app): update `transformHtml` signature to remove `fullPublicPath` parameter
* refactor (web-app): update `assembleHtmlView` to accept `staticContentPaths` instead of `fullPublicPath`
* refactor (web-server): replace the single static path with configurable `staticContentPaths` array
* refactor (web-server): merge web server default config with the provided service config in constructor
* refactor (web-server): load web server default config directly from the package JSON import instead of the ENV configuration
* refactor (web-server): improve TLS initialization error handling to reject promise instead of throw
* refactor (package): reorganize imports from `./server/...` to `./bin/...` and `./components/...` paths
* refactor (package): move `@alpinejs/csp` from dependencies to devDependencies
* build (static): replace CDN script references with local copies for HTMX and Alpine.js CSP
* build (env): remove `TI_INSTANCE_CONFIG` and update `TI_LOCALIZATION_LABELS_PATH` to use `bin/localization/` path
* build (env): add `TI_AUDITING_LOG_MIN_LEVEL` configuration variable
* fix (ui): change `aria-expanded` binding from string to boolean in the sidebar flyout component
* fix (ui): remove incorrect `type="button"` attribute from `Home` anchor element
* docs: improve various documentation comments and class descriptions

## Version 1.4.0

* feat (ui): add a notification bar component with Alpine.js integration and auto-dismiss functionality
* feat (ui): add CSS variables and styles for the notification system
* feat (routes): add `/not-found` fragment and route for 404 error pages
* feat (routes): add `/app/error` route for error handling testing - will be removed later
* feat (routes): add `/app/config` data endpoint for serving application configuration
* feat (localization): add language property to `User` class with getter and JSON serialization
* feat (localization): integrate localization module for label management and localized error messages
* feat (session): add language property to session data populated from user or service configuration
* feat (handlers): add response type detection helper `isAcceptingResponseType` for content negotiation
* feat (handlers): enhance error responses with localized messages via localization module
* feat (handlers): add HTMX-aware error handling with HX-Redirect and HX-Retarget headers
* feat (handlers): implement `processDataRequest` method in WebAppManager for serving data resources
* feat (config): add a language configuration option to the `WebServiceConfiguration` object
* refactor (handlers): delegate error handling from resource protection to error middleware
* refactor (handlers): improve 401/404 response handling by routing through exceptions and middleware
* refactor (handlers): enhance CSRF and origin validation to use error middleware instead of direct responses
* refactor (handlers): improve service call error handling to raise exceptions and delegate to middleware
* refactor (handlers): refactor invalid route handler to raise exceptions instead of direct 404 responses
* fix (types): correct ExpressRequest typedef from `import("express").req` to `import("express").Request`
* build (config): update publicPath from `packages/web-framework/bin/static` to `bin/static`
* build (config): update TLS certificate paths to use relative `bin/tls/` paths
* build (env): update `TI_INSTANCE_CLASS` and `TI_INSTANCE_CONFIG` paths to use relative `bin/` paths
* build (env): add `TI_LOCALIZATION_LABELS_PATH` environment variable for custom labels
* build (run): update IDE run configuration to use relative paths and the correct working directory
* build (labels): add an empty `web-server-labels.json` file for custom localization labels

## Version 1.3.0

* feat: first working prototype version
