# Author-Site Content Engine — Design

| Field | Value |
|---|---|
| **Status** | Active — P0–P2, P3a/P3b, P4 + P6 complete + editorial markdown + P3c document assembly + P7 migration + draft preview + the account menu — **364 tests green**; the site boots and serves; theme + self-hosted fonts landed in `Site/`. Next: the editorial pass over the 27 registered drafts |
| **Created** | 2026-07-24 |
| **Last updated** | 2026-07-30 (rev 7) |
| **Owner** | Boris Kostadinov |
| **Scope** | New package `@ti-engine/web-content` (reusable engine) + a small enabling change in `@ti-engine/web-framework` (route seams) + the private `anarandaris` `Site/` app (content, theme, wiring) |
| **Relates to** | Realises the three `Site/docs/` specs — `build-spec.md`, `content-schemas.md`, `token-contract.md` — which remain the source of truth for *what*. This doc records *how it lands as a package* and **supersedes `build-spec.md` §2 on module placement** (framework column → `web-content`). |

## Implementation log

How this design lands in code — update as each step is committed (branch `current`).

| Phase / step | Status | Commit | Date |
|---|---|---|---|
| Design ratified (placement · name · seams · render model · deps · on-disk format · defer search) | ✅ ratified | — | 2026-07-24 |
| **P0** — Framework route seams (`registerRoute` + `addUnprotectedRoute`) + tests → web-framework `1.17.0` | ✅ committed | `d01dc6a` | 2026-07-24 |
| **P1a** — `web-content` package inception (package.json, CHANGELOG, README) | ✅ committed | `abfb51a` | 2026-07-24 |
| **P1b** — `content/schema.js` (ajv envelope + per-type) + **invariant tests written first** | ✅ 16 tests | `abfb51a` | 2026-07-24 |
| **P1c** — `content/loader.js` (validate records → indexes + conflict reporting) | ✅ 8 tests | `62e5f87` | 2026-07-24 |
| **P1d** — `content/repository.js` — THE visibility-filtered query layer | ✅ 17 tests | `5fe75b8` | 2026-07-24 |
| **P2a** — `transliterate.js` + `taxonomy.js` graph (dep-free) | ✅ 20 tests | `b4aebe4` | 2026-07-24 |
| **P2b** — `content/markdown.js` (markdown-it, `html:false`) + `content/sources.js` (front-matter/YAML reader, no directory scanning) | ✅ 22 tests | — | 2026-07-24 |
| **P3a** — `render/html.js` (escaping + `raw()`) + `render/document.js` (head/JSON-LD/hreflang) | ✅ 19 tests | `9ad6bf1` | 2026-07-24 |
| **P3b** — `render/sections.js` (registry + mechanical dispatch) + all 15 editorial components | ✅ 53 tests | — | 2026-07-30 |
| **P2c** — editorial markdown extensions (attrs · bracketed-spans · containers · footnotes) | ✅ 20 tests | — | 2026-07-30 |
| **P3c** — document assembly (shell · topbar · footer · gate · 404) + the vanilla site script | ✅ 25 tests + doc acceptance check | — | 2026-07-30 |
| **P4** — `routes/content-routes.js` (catch-all resolver + alias 301 + cache policy) · `routes/feeds.js` (sitemap/rss/robots) · `routes/index.js` mount helpers | ✅ 23 tests + e2e smoke | — | 2026-07-24 |
| **P5** — page context (eyebrow · meta · terms · breadcrumb · prev/next) · taxonomy-expanded queries · `?page=N` · generated term archives | ✅ 27 tests + live verification | — | 2026-07-30 |
| **P6** — `capture/store.js` · `capture/admin.js` · `capture/routes.js` (admin behind the `admin` role) | ✅ 31 tests + live verification | — | 2026-07-30 |
| **P7** — Migration tooling (URL inventory → WP REST export → uploads copy → redirect map) | ☐ pending | — | — |
| **P8a** — `Site/app` standup (`TiWebServer`/`TiWebAppManager` subclasses, content loader, config) — **boots and serves** | ✅ verified live | — | 2026-07-30 |
| **P8b** — Dockerfile → staging → redirect diff → cutover | ☐ pending | — | — |
| **Track B** (parallel, no code dep) — tokens → `anarand.css`; ten new editorial components; port existing components | ☐ pending | — | — |

> **On the per-phase test counts above.** They sum to 281, which is the web-content suite at the end of P6 — P0 is not in that figure because its tests live in `web-framework`, not here. The status line reports the suite as it stands today, which has grown past 281 with the review fixes, draft preview and the account menu. The two numbers count different things on purpose; neither is a running total of the other.

**Agreed framing (this conversation):**
- **Placement:** the generic engine is a **new sibling package `@ti-engine/web-content`** depending on `core` + `web-framework` — *not* folded into `web-framework` (which would turn a lean app server into an app-server-plus-CMS and force a second render path + markdown dependency onto every consumer, incl. `competence`). Mirrors how `competence` layers on top.
- **Split:** engine (schema/loader/repository/taxonomy/markdown/transliterate/render/routes/capture) + generic token-driven editorial components live in `web-content`. This site's content, theme values, and wiring live in `Site/`. The framework stays a lean authenticated-app server.
- **Editorial components ship generic** in `web-content/render/editorial/`, each declaring the `--tokens` it consumes with unthemed defaults; `Site/themes/anarand.css` supplies the values (realises `token-contract.md` §5).

---

## 1. Architecture spine (unchanged from the specs — affirmed)

Two decisions from the specs are correct and carried verbatim:

1. **Routing is path-index resolution, not route patterns** (`build-spec.md` §1). Specific routes register first; one catch-all `GET` resolves the request path against the content index — hit on `path` → render, hit on `aliases` → 301 to `path`, miss → 404. Every URL shape (current, legacy, Bulgarian, transliterated) is an index entry, so there is no ordering bug to have.
2. **Deny-by-default visibility, filtered once in the repository** (`CLAUDE.md` 1–2, `content-schemas.md` §1). A record with no recognised `visibility` is visible to nobody and logged. Every surface — listing, archive, sitemap, RSS, search, count, prev/next, related, curated `featured` lists — inherits the filter because it goes through `repository.query()`. Route-level access (P4) only opens the door to the resolver; the resolver applies per-record `visibility`. Two independent layers, content authoritative.

The §8 "silent-failure" invariants are the guard suite and are written **before** the code they cover (see §9).

---

## 2. Package placement & the split

```
core  →  web-framework  →  ┬─ competence      (existing HR app)
                           └─ web-content      (NEW — the content engine)
                                   ↑
                                   └─ Site/     (private repo: content, theme, wiring)
```

`CLAUDE.md` rule 7 ("framework code contains nothing site-specific") is satisfied because the engine is generic. The only question the specs left unargued was *which package* — settled as a new sibling. Rationale: keeps `web-framework` lean and its dependency set unchanged for `competence`; versions the CMS independently; makes it reusable across the other properties (the Saga site, Dark Intent, the music releases).

---

## 3. `web-content` module layout

Relocated verbatim from `build-spec.md` §2's framework column:

```
packages/web-content/
  content/
    schema.js         ajv schemas: common envelope + each type
    sources.js        reads EXPLICITLY REGISTERED files (front-matter md / YAML); never scans a directory
    loader.js         validates records, builds indexes, reports conflicts
    repository.js     THE query layer — all visibility filtering lives here
    taxonomy.js       vocabulary load, one-level parent expansion, term resolution
    archives.js       term-archive page records generated from the vocabulary, once, at load
    markdown.js       markdown-it wrapper, html:false
    transliterate.js  Streamlined System (BG 2009), slug generation
  render/
    html.js           escaping tagged template + raw()
    document.js       full document: head, meta, JSON-LD, shell, cache headers
    context.js        the page context templates need: eyebrow · meta · terms · breadcrumb · prev/next
    sections.js       section-type registry, shared chrome, mechanical type→class dispatch
    editorial/        the 15 section bodies, grouped by kind (generic, token-driven):
                        text.js       prose · verse · closing · languageExample
                        media.js      hero · gallery · audio
                        lore.js       characterCards · agePanels · timeStrip · timeline
                        listing.js    featured · postList (+ post card, pagination)
                        forms.js      capture (+ form status)
                        dictionary.js dictionary
                        index.js      aggregator bound into the registry
  routes/
    content-routes.js catch-all resolver, alias 301s, archives, pagination (?page=N)
    feeds.js          sitemap.xml, rss.xml, robots.txt
    media.js          legacy media at its ORIGINAL URLs (/wp-content/uploads/...)
    index.js          mountContentRoutes() + defineContentUnprotectedRoutes() helpers
  capture/
    store.js          email-capture records (dedupe on (email,purpose); no IP)
    admin.js          totals, per-purpose/edition counts, CSV export, erasure-by-email
  design/
    author-site-engine.md   ← this doc
  test/               the §8 invariants + unit tests
  package.json · CHANGELOG.md · README.md
```

---

## 4. `web-content/package.json`

```jsonc
{
  "name": "@ti-engine/web-content",
  "version": "0.1.0",                    // new package, pre-1.0 while Draft-1 shapes settle
  "description": "Content-publishing engine (path-index routing, deny-by-default visibility, SEO documents, feeds, capture) for ti-engine sites.",
  "type": "commonjs",
  "license": "GPL-3.0",
  "dependencies": {
    "@ti-engine/core": "*",
    "@ti-engine/web-framework": "*",     // effective minimum 1.17.0 — the P0 route seams
    "ajv": "^8",                         // declared directly — schema.js uses it (ratified)
    "markdown-it": "^14",
    "gray-matter": "^4"                  // YAML front-matter + pure-YAML records (bundles js-yaml)
  },
  "exports": {
    "./repository": "./content/repository.js",
    "./loader": "./content/loader.js",
    "./schema": "./content/schema.js",
    "./taxonomy": "./content/taxonomy.js",
    "./transliterate": "./content/transliterate.js",
    "./markdown": "./content/markdown.js",
    "./render": "./render/document.js",
    "./html": "./render/html.js",
    "./sections": "./render/sections.js",
    "./routes": "./routes/index.js",
    "./capture": "./capture/store.js"
  },
  "imports": { "#...": "./..." },        // internal modules via #alias, per house convention
  "scripts": { "test": "node --test test/*.test.js" }
}
```

Root `workspaces: ["packages/*"]` picks it up automatically once the folder has a `package.json`. `ajv` is declared **directly** (ratified) — `schema.js` uses it, so it is not left to the transitive dep hoisted from `web-framework`.

---

## 5. Framework enablement (P0) — the seams the specs assumed but don't exist

`build-spec.md` §4 assumes `this.addUnprotectedRoute(...)`, and §1/§3 assume a subclass can register the catch-all route. **Neither is possible today** — `TiWebServer` keeps both the Express app (`#webServer`) and the unprotected-route list (`#unprotectedRoutes`) private, and exposes no adder. `competence` never hit this because apps extend the framework through *fragments* (`addFragment` + the base `/app/:view` route), never through Express routes. The site is the first consumer that needs arbitrary routes.

Add two small, **generic, site-agnostic** seams to `web-framework` (satisfies rule 7; useful to any future consumer):

```js
// TiWebServer — new public instance methods (pure logic lives in static helpers on the class)

registerRoute( method, path, ...handlers ) {
    const verb = TiWebServer.normalizeRegistrableMethod( method );   // static: get|post|...|all, else null
    if ( verb === null ) throw exceptions.raise( E_GEN_INVALID_ARGUMENT_TYPE, { method } );
    if ( !this.#webServer ) throw exceptions.raise( E_GEN_NOT_INITIALIZED, { detail: "call from a defineWebApplicationRoutes() override" } );
    this.#webServer[ verb ]( path, ...handlers );
    return this;
}

addUnprotectedRoute( pattern ) {                         // string (exact) or RegExp (tested); anything else ignored + warn
    if ( _.isString( pattern ) || _.isRegExp( pattern ) ) this.#unprotectedRoutes.push( pattern );
    return this;
}
```

- Ships as web-framework **`1.17.0`** (`feat(web-server): route + unprotected-route registration seams`). Both instance methods delegate to pure, **public static** helper methods on the class — `TiWebServer.normalizeRegistrableMethod` and `TiWebServer.isRouteInList` — kept inside the class per the codebase convention (no standalone module-level functions in a class-file) and static so the tests can reach them **without standing up the live server** (the framework's test convention — see `web-server-env-overrides.test.js`). Coverage: the verb allowlist (`use` deliberately rejected) and the match logic (string exact-match / RegExp test, defensive `lastIndex` reset, and the site's `^/(?!admin/).*$` inversion). `isUnprotectedRoute` is refactored to share `TiWebServer.isRouteInList`; the new suite is `test/web-server.route-seams.test.js` (16 tests) and the full framework suite stays green (169 tests).
- **Verified against `onStart` (web-server.js):** the security/session stack — nonce, Helmet, CSP, `express.json`/`urlencoded`, `cookieParser`, `session`, CSRF, and the `resourceProtectionHandler` auth gate that consults `isUnprotectedRoute` — is all `use`d **before** `defineWebApplicationRoutes()` (line 318), so a route registered via `registerRoute` inherits the full request context the render pipeline needs (`build-spec.md` §3: `lang, user, nonce, csrf, theme`). Crucially, the framework's own catch-all `this.#webServer.all( "*splat", invalidRouteHandler )` is registered at line 326 — **after** `defineWebApplicationRoutes()` — so the content resolver's catch-all `GET`, registered inside the override, matches first and the framework 404 only fires for genuinely unhandled methods/paths. `defineUnprotectedRoutes()` runs later in `onStart` (line 330) but still before listening, so the unprotected list is fully populated with no request-time race.
- `registerRoute` deliberately stays narrow (per-verb, per-route, extra middleware as trailing handlers) rather than exposing the whole Express app. If an `app.use`-style mount is later needed, add `registerMiddleware` then — not now.

---

## 6. The integration seam

`web-content/routes/index.js` exports two helpers; `Site/app/web-server.js` (extends `TiWebServer`) calls them from its two overrides:

```js
// Site/app/web-server.js
const { mountContentRoutes, defineContentUnprotectedRoutes } = require( "@ti-engine/web-content/routes" );

defineUnprotectedRoutes() {
    super.defineUnprotectedRoutes();
    defineContentUnprotectedRoutes( this );      // → addUnprotectedRoute( /^\/(?!admin\/).*$/ )
}

defineWebApplicationRoutes() {
    super.defineWebApplicationRoutes();          // framework routes first (incl. /admin/config/*)
    mountContentRoutes( this, {                  // feeds first, catch-all resolver LAST
        repository: contentRepository,
        capture:    captureStore
    } );
}
```

`mountContentRoutes` uses only the public `registerRoute` seam — it never touches Express internals — registering `/sitemap.xml`, `/rss.xml`, `/robots.txt`, `POST /capture`, the admin capture views, and finally the catch-all `GET`. The resolver reads `req` context (nonce/csrf/session/user) that the framework middleware already attached, does the path-index lookup, applies `repository` visibility, and composes the document. **Public-by-default at the route layer + per-record visibility in the repository = the two independent layers the specs require.**

---

## 7. Two rendering paths, coexisting

The framework's existing HTML path is **SPA-shell + HTMX fragments** (`TiWebAppManager.assembleHtmlView` + placeholder component replacement) for authenticated app UIs. The site needs the opposite: **server-rendered full documents per URL** (SEO head, canonical, hreflang, JSON-LD, per-visibility cache headers). `web-content`'s `render/document.js` is a *second, parallel* path — it does not extend or fight the fragment machinery, and it lives in a different package. They share only the framework's request context (nonce/csrf/session). This separation is another reason the engine reads as its own package rather than a `web-app-manager` extension.

The escaping tagged template (`render/html.js`) is the one primitive small and generic enough that it *could* also serve the framework; keep it in `web-content` for now and promote later only if a second consumer wants it (extract-when-the-seam-is-real).

---

## 8. On-disk content format (ratified 2026-07-24)

The specs pin the *schema* but not the *authoring format*. Proposed:

| Type | Format | Why |
|---|---|---|
| `post` | Markdown file with YAML **front-matter** | Long-form prose is the body; envelope fields sit in front-matter. Ergonomic for writing. |
| `page` · `book` · `release` | YAML file | Structured records (section trees, editions, tracks). Prose-bearing fields (`blurb`, `teaser`, section `body`) hold Markdown strings the renderer runs through `markdown.js`. |
| `taxonomies.yml` | YAML | Already specified (`content-schemas.md` §7). |

`gray-matter` parses both front-matter Markdown and pure-YAML. Records validate against the ajv schemas in `schema.js` at load; a validation failure is a hard load error, never a silent skip (`CLAUDE.md` 5).

---

## 9. Dependencies — correcting `build-spec.md` §2

`build-spec.md` §2 says "new dependencies: `markdown-it` only." Two amendments:

1. **Runtime also needs a YAML/front-matter parser** — `gray-matter` (bundles `js-yaml`) — for `taxonomies.yml`, front-matter posts, and the structured YAML records. Not optional. *(Installed 2026-07-24; `sources.js` uses `matter.engines.yaml` for pure-YAML records rather than requiring `js-yaml` transitively.)*
2. **HTML sanitising for legacy WordPress import is a *migration-tooling* dependency, not a runtime one.** `markdown-it` with `html:false` *escapes*; it does not *sanitise* real HTML. Legacy bodies are "sanitised once at import and stored clean" (`content-schemas.md` §2), so a sanitiser (e.g. `sanitize-html`) belongs to the P7 import script (a `devDependency` there), and the deployed image stays `markdown-it` + `gray-matter` only.

`ajv`, RedisJSON via `cache.instance`, `express` 5, session/auth all come from the existing stack.

---

## 10. Test-first invariants (written before implementation)

The `build-spec.md` §8 list — the failures that don't throw — become the first tests in `web-content/test/`, ahead of the modules:

- A record with no `visibility` appears in **no** query surface (listing, archive, sitemap, feed, search, count, prev/next).
- Gated bodies are excluded from `sitemap.xml`; their teasers are included.
- An alias resolves 301 to `path`; canonical always points at `path`.
- `hreflang` pairs are reciprocal (EN↔BG).
- Non-public responses never carry `public` cache headers (`private, no-store` + `Vary: Cookie`).
- A title containing `<script>` renders escaped.
- Taxonomy parent expansion: querying `dark-intent` returns posts tagged `alexander-dark`.
- Transliteration is stable — same input, same slug, forever.
- Curated `featured` lists are visibility-filtered — a gated item renders its teaser card, an unpublished one drops out.

> **P1b schema notes (2026-07-24):** `content/schema.js` anchors deny-by-default by making `visibility` a **required**, pattern-constrained envelope field (`^(public|authenticated|role:[a-z0-9_-]+)$`), so a missing/unrecognised value is a hard validation failure — the repository (P1d) is the second layer that keeps such a record out of every surface. Decisions worth flagging: (1) added an optional `post.bodyFormat` enum (`markdown`|`html`) so the renderer distinguishes legacy-HTML posts from Markdown without inference; (2) required fields kept minimal per type (`post`→world+form, `page`→sections with recognised section `type`, `book`→cover+blurb, `release`→releaseState+format+cover) and `additionalProperties` left open for now — strictness can tighten once the WordPress import (P7) shows the real field spread; (3) `capture` validates separately (no envelope). 16 invariant tests in `test/schema.test.js`.

> **P1c loader note (2026-07-24):** `content/loader.js` is refined from the §2 sketch: it does **validate + build indexes only** (pure, records in → index out), and the disk source-reader (front-matter / YAML parsing via `gray-matter`) is a separate input stage deferred until real content is wired — so the index build stays filesystem-free and fully unit-tested. It excludes invalid records and reports id/path/alias conflicts (incl. an alias shadowed by a real path) rather than throwing; first record wins a collision. 8 tests in `test/loader.test.js`.

> **P1d repository note (2026-07-24):** `content/repository.js` (class `ContentRepository`, constructed over a loader index) is the single visibility chokepoint. `resolveVisibility(record, viewer)` (public static, pure) returns `visible`/`gated`/`hidden` per the ratified model; `role:__none__`, empty, missing, or unrecognised → hidden (deny-all, admins included — no implicit role hierarchy). `resolve` / `list` / `count` / `getById` / `resolveIds` all route through it, and drafts are excluded from every surface. §8 invariants green here: a no-visibility/deny-all record appears in no surface (incl. defense-in-depth against a schema-bypassing bogus value), curated `featured` ids are visibility-filtered, gated records stay listable as teasers. Deferred to their surfaces: sitemap body-exclusion + `noindex` (P4 feeds / P3 render), taxonomy parent expansion (P2), hreflang reciprocity + escaping + cache headers (P3 render). 17 tests in `test/repository.test.js`.

> **P2 note (2026-07-24):** the dependency-free half is in. `transliterate.js` (Streamlined System + `slugify`, deterministic — 9 tests, incl. the stability invariant and reference slugs) and `taxonomy.js` (pure term-graph over an in-memory vocabulary: `resolve` by id/per-language slug, one-level `expand`/`ancestors`/`children`, `slugFor` — 11 tests) are complete. Deferred until the first `npm install` with network access (needed for P3/P5 regardless): the `taxonomies.yml` reader (`gray-matter`/`js-yaml`) and `markdown.js` (`markdown-it`, `html:false`). The §8 taxonomy-parent-expansion invariant is proven at the graph level — `expand('world','dark-intent')` includes `alexander-dark`; wiring it into `repository.list` archive queries lands with the routes (P4/P5).

> **P3 note (2026-07-24):** the dep-free render primitives are in. `render/html.js` — the escaping tagged template + `raw()` (SafeString; arrays and nested `html\`\`` compose without double-escaping; the §8 `<script>`-in-title invariant — 8 tests). `render/document.js` — pure head composition (11 tests): `canonicalUrl` (canonical → `path`), reciprocal `hreflangLinks` (+ x-default → English side), `shouldNoindex` (non-public body noindex; teaser stays indexable), per-type `jsonLd` (Article/Book/MusicAlbum), and `composeHead` assembling them (title escaped in-head; JSON-LD `<` neutralised against `</script>` breakout). Deferred (need `markdown-it`): `sections.js`, the editorial components, full-body vs teaser document assembly, and the sitewide Person JSON-LD node — all land with P5 templates.

> **P2b note (2026-07-24, deps installed):** `markdown-it@14.3.0` + `gray-matter@4.0.3` installed; `@ti-engine/web-framework` resolves to the **local workspace** package (verified), and a pre-existing transitive `fast-uri` advisory (via `ajv`, monorepo-wide — not from these deps) was cleared by an in-range bump to 3.1.4, leaving **0 vulnerabilities**. Two modules landed:
> - `content/markdown.js` — markdown-it with **`html: false`** (raw HTML in authored markdown is *escaped*, never passed through — this module is one of only two sanctioned `raw()` sites, so its output must be trustworthy), returning `SafeString` so it composes with `html\`\``. `renderInline` serves summaries/blurbs. **Typographer and linkify are deliberately OFF**: the manuscripts already carry authored Unicode punctuation (em dashes, curly quotes) from the editorial process, and re-transforming it would silently alter deliberate prose. 8 tests.
> - `content/sources.js` — the disk input stage, split out of `loader.js` (which stays pure): parses markdown-with-front-matter and pure YAML via `gray-matter` (using `matter.engines.yaml` so no transitive `js-yaml` dependency), with parsing separated from I/O so format handling is unit-testable. **Enforces CLAUDE.md 5** — a directory passed to `readSources()` is reported as an *error*, never expanded, and the module exposes no glob/scan/readdir capability (pinned by a test asserting no such export exists). Read/parse failures are collected, not thrown. `readVocabulary` covers `taxonomies.yml`. 14 tests.

> **P4 note (2026-07-24):** the resolver and feeds are in, and an **end-to-end smoke test** now serves real content files (a front-matter post + a gated beta chapter) through sources -> loader -> repository -> routes.
> - `routes/content-routes.js` -- the catch-all: alias -> 301, miss -> `next()` (falls through to the framework 404, so hidden / unpublished / unknown are indistinguishable from outside), hit -> render. **Cache policy is keyed on the record's `visibility`, not on what was rendered** -- a gated record's *teaser* is `private, no-store` + `Vary: Cookie` too, because the response for that path differs by who is asking and must never be shared by a CDN. `renderPage` is injectable; a minimal fallback document ships until P5 templates land.
> - `routes/feeds.js` -- sitemap membership is decided through the repository as an **anonymous** viewer, so hidden records and drafts are excluded structurally. The Section 8 rule is implemented: public records are included; a **gated record is included only when it has a `teaser`** (that teaser page is public and indexable) while its body renders `noindex`. RSS is **public-only** -- the specs pin the sitemap rule but leave the feed open, and a syndicated item travels far and is cached by aggregators, so the conservative reading wins.
> - `routes/index.js` -- `mountContentRoutes` / `defineContentUnprotectedRoutes`, using only the public P0 seams (`registerRoute` / `addUnprotectedRoute`), never Express internals; the catch-all is registered last.
>
> **Bug caught by the smoke test, not by the unit tests:** YAML silently parses an unquoted ISO timestamp (`publishedAt: 2026-03-20T00:00:00Z`) into a **Date object**, which failed the schema's string constraint and *silently excluded* an otherwise valid post from the site -- precisely the class of failure this project exists to prevent. Fixed by normalising Dates to ISO strings at the source boundary (`normalizeDates`, recursive, covering nested structures), so authors never have to remember to quote a date. Three regression tests added. Worth remembering: unit tests built on hand-written fixtures cannot catch format-boundary bugs -- only real files can.


> **P3b note (2026-07-30):** the section layer is in, built against the ratified `Site/docs/markup-contract.md`. `render/sections.js` holds the registry, the shared wrapper/chrome, and the **mechanical** type -> class derivation (`characterCards` -> `.section-character-cards`); the full 15-type map is pinned in a test, because a CSS rule written against a class the renderer never emits is a silent no-op. All 15 bodies live in `render/editorial/`, grouped by kind (text · media · lore · listing · forms · dictionary) rather than one file per component. 53 tests.
>
> Verified by rendering all 17 section variants and diffing every emitted class against `anarand.css`: **161 classes emitted, zero style attributes**, and the only undefined ones are the deliberate mechanical `section-*` hooks plus three genuine gaps (below).
>
> Decisions worth recording: (1) `featured` and `postList` resolve through `repository.resolveIds()` / `list()`, so a curated id list inherits visibility filtering — a gated item shows its `teaser` and **never** its `summary`, since a summary may be derived from the withheld body; (2) the capture form emits the framework's `csrfToken` hidden input, without which every submission 403s; (3) era/phase/accent modifiers are validated against allow-lists so a record value cannot inject a class name; (4) the contract's table said `.section-language` for `languageExample` while its stated rule derives `.section-language-example` — the table was aligned to the rule (neither was styled, so nothing broke).
>
> **Gap raised, not papered over:** `verse.attribution`, `audio.subtitle`, and `languageExample[].note` are declared in `content-schemas.md` §3 but have no rule in `anarand.css`. The renderer emits `.verse-attribution` / `.audio-subtitle` / `.language-note` so styling can land without touching markup, and the contract now records them under *Pending theme coverage* — either style them or drop the fields; leaving both is the state that rots.

> **Legacy-HTML decision + editorial markdown (2026-07-30):** boriskhan.com will be **re-authored page by page in this framework** rather than imported as legacy HTML. That removes the markup escape hatch, which raises the bar on the authoring layer: a prose primitive markdown cannot express is a primitive nobody can use. Four plugins close the gap in `content/markdown.js` — `markdown-it-attrs` (classes on any block/inline), `markdown-it-bracketed-spans` (inline `[text]{.anarandian-inline}`), `markdown-it-container` (pull-quote · chapter-opener · language-example · figure, with **positional auto-classing** so the common case needs no annotation), and `markdown-it-footnote` remapped onto the contract's classes and `fn-N`/`fnref-N` ids. The syntax is documented for authors in `Site/docs/markup-contract.md` § *Authoring syntax*.
>
> **The attribute allowlist is a security boundary, not a convenience.** Unrestricted, `markdown-it-attrs` would let authored content write a `style` or `onclick` attribute straight into the page — breaching the contract's hardest rule from inside content. Only `class` and `id` are permitted, and that is the first thing the test file asserts.
>
> `bodyFormat: "html"` is **kept but dormant** (ratified): the field stays as an escape hatch should a page ever resist the section vocabulary, but no importer sanitises it, so **every** renderer withholds it. That fixed a real inconsistency introduced in P3b — `renderProse` emitted it via `raw()` while the fallback page withheld it, a live XSS vector for any record carrying the field. A dormant path has to be dormant on every route, not merely on the one written first. `Site/CLAUDE.md` rule 8 now records that markdown output is the only live `raw()` source.
>
> Migration (P7) changes shape but not order: the **URL inventory, uploads copy and alias map are unchanged and still non-negotiable**, and are now doubly urgent because the inventory is the only thing that sizes the re-authoring work and proves whether 15 section types cover every page. The WordPress REST export survives as **draft source material** — converted to markdown as a starting point for hand-finishing, never as a shipped body.

> **P3c note (2026-07-30):** the rendering path is complete — a URL now produces a real page, not a placeholder. `render/shell.js` (noise layer · skip link · topbar · footer · language selector), `render/templates.js` (article · composed record · gate · state panel) and `render/page.js` (full document assembly) replace the fallback document, and `contentHandler` now defaults to `renderDocument`. The vanilla site script ships at `static/web-content.js` and is served by `mountContentRoutes` under `/static/`, so a consumer can override it by placing its own file at that path.
>
> **Everything site-specific is configuration.** The shell renders from `context.site` — title, logo, languages, nav, footer columns, social, sign-in paths — and an unconfigured site renders an empty shell rather than inventing content. Nothing in this package names the site.
>
> Details worth keeping: (1) **every `<script>` carries the nonce, including the JSON-LD block** — the framework's CSP uses `'strict-dynamic'`, under which a nonce-less script simply never executes, and a structured-data block silently dropped is exactly the failure nobody notices; (2) the language control emits an **inert option that says why** when `translationOf` is null, because hiding it makes a bilingual site look monolingual and linking it produces a 404; (3) the 404 copy is asserted not to mention draft/hidden/private — the resolver falls through identically for hidden, unpublished and unknown, and naming which one would leak what deny-by-default hides; (4) the audio progress percentage is written to the `--audio-progress` custom property, the token route the contract prescribes for a runtime value, never an inline width.
>
> **Acceptance check:** three full documents (article with every prose primitive, gated teaser, 404) rendered and diffed against `anarand.css` — **76 classes emitted, zero style attributes, every script and stylesheet nonced, no gated body in the teaser document**, and the only undefined class is the deliberate `post-nav-prev` marker.
>
> **Gap raised for a decision — since resolved.** The contract promised the reveal choreography is "never a visibility gate", but the CSS only forced `.reveal` visible under `prefers-reduced-motion`; for everyone else a blocked or errored script left that content invisible permanently. The script falls back when `IntersectionObserver` is missing, but cannot fall back when it never runs. The hidden state is now scoped to `:where(.js) .reveal`, so it applies only once the boot script has marked the document script-capable — and `:where()` contributes **zero specificity**, which is the point: a plain `.js .reveal` would outrank `.reveal-in` and leave revealed elements invisible, turning the fix into the very bug it removes. Content with no working script is now simply visible.

> **Standup note (2026-07-30) — the site boots.** `Site/app` runs against a real broker and socket: content loaded (2 records, 0 invalid, 0 conflicts), Redis connected, web server listening. Verified in a real browser as well as over HTTP — body renders on `--bg-abyss` in **Spectral**, the hero in **Cormorant Unicase**, all four self-hosted families reporting `loaded`, `<html class="js">` set by the boot script, **zero style attributes in the live DOM**, and no console or CSP errors.
>
> **The boot found a defect no test could: a soft 404.** An unknown URL reached the framework's `invalidRouteHandler`, which redirects to `/not-found` — and that page answers **200**. Harmless for an authenticated app; wrong for a public site, where a crawler then records a success for a URL that does not exist, polluting the index and hiding broken links from every report that would surface them. `mountContentRoutes` now registers a terminal 404 that renders the state document with **status 404** and `private, no-store`. It is **GET-only on purpose** — the framework mounts `POST /service/:version/:name` *after* `defineWebApplicationRoutes()` returns, so a catch-all covering every method would shadow it. Switchable off via `notFound: false`.
>
> Two environment notes for whoever runs this next: the framework's cache needs **RedisJSON**, so plain `redis:7` is not enough — the local container is `redis/redis-stack-server`, and it runs on **6380** because another project already holds 6379. Paths in `web-server.json` and `.env` resolve from the working directory, which is `Site/app`.

> **P6 note (2026-07-30) — capture.** The only module holding personal data, so its rules are stricter than the rest of the engine and are stated in the file itself: **no IP is ever stored** (the handler never reads one, so there is nothing to leak or erase), **`consentAt` is stamped server-side** and a client-supplied timestamp is discarded (consent evidence the client can write is not evidence), **only the schema's fields are persisted** (copied field by field, never merged, so an extra POST field cannot ride along), dedupe is on **(email, purpose)** case-insensitively, and **erasure is by email across every purpose** — a person asking to be forgotten is asking about themselves, not about whichever lists they remember joining.
>
> Three boundaries worth keeping in mind, each silent when wrong:
> - **The admin endpoints fail closed.** An absent `requireAdmin` selects the built-in guard, never no guard — these routes list, export and erase every stored address, so a forgotten option must refuse rather than expose. The framework's `authorization` module is not exported from its package, so the check is reimplemented against the same session shape and the same `admin` role name.
> - **CSV export is a security boundary.** A spreadsheet executes a cell beginning with an equals, plus, minus or at sign, and `source` arrives from a query string — so every field is neutralised against formula interpretation as well as CSV-escaped.
> - **The post-submit redirect is validated against the content index.** `returnTo` is attacker-controlled; honouring it unchecked is an open redirect, exactly the primitive a phishing link wants. Only a path that resolves to a record is used; anything else falls back to `/`.
>
> **Bug found by running it, not by testing it:** RedisJSON refuses to create a nested path in a document that does not exist (`ERR new objects must be created at the root`), so the **first capture on a fresh deployment always failed** — and only there, since it works in dev the moment anything has seeded the key. The store now writes the whole map on the first record and edits a single path thereafter. The test fake was over-forgiving and hid this; it now models the refusal, and a regression test asserts the first record on a genuinely empty store succeeds.
>
> Verified live against Redis: first signup on a cleared store succeeds, the same address in different case with trailing space is a duplicate, the same address on a different purpose is accepted, missing consent and a malformed address are refused, a hostile `returnTo` still captures but redirects to `/`, a missing CSRF token is rejected 403 by the framework, erasure removes both of one address's records and leaves the others, and no stored record carries an IP field.

> **Legacy media note (2026-07-30).** The framework mounts an application's public directory at `/static` only, but a migrated site's media is referenced by its original absolute paths from imported content, from other people's links, and from search results. **An inbound link on someone else's page cannot be rewritten**, so `/wp-content/uploads/...` has to keep resolving. `routes/media.js` registers a configured set of URL prefixes served from a media root whose **on-disk tree mirrors the URL** — which is what the migration plan's "copied verbatim, identical paths" means, and why the mount does no URL rewriting at all.
>
> Chosen over adding a `registerMiddleware` seam to the framework: a prefixed GET route with a wildcard reaches `express.static` just as well, so this needed no new framework surface. `fallthrough: true` sends a miss to the content resolver, which answers a **proper 404** rather than a bare one. `dotfiles: "deny"` and `index: false` mean a stray `.env` under the root cannot be served and a directory URL lists nothing; traversal protection comes from `send` itself.
>
> **The cache is deliberately not `immutable`.** A media library is not content-addressed — the same filename can be re-uploaded with different bytes — so a year-long unrevalidatable cache turns a corrected image into a year-long support problem. Thirty days, configurable.
>
> Verified live: a file serves at its original URL with the right content type, a missing one reaches the proper 404, four traversal attempts (including percent-encoded) leak nothing, a directory URL lists nothing, and the theme still serves from `/static`. Twelve tests, the security ones over real HTTP against a real Express app rather than a stub — a hand-rolled fake would prove nothing about traversal.
>
> **Open for the site to settle:** whether the migrated library is committed to git or fetched at deploy time. Recorded in `Site/public/README.md`; worth deciding before the copy step, since moving it afterwards means changing URLs, and never changing the URLs is the entire point.

> **P5 note (2026-07-30) — closing the gap between a page that renders and a page that reads right.** P3c built the templates; nothing populated them. A live article rendered as title plus body: no breadcrumb, no meta line, no term pills, no adjacent-post navigation, and listings ignored `?page=N`. The templates render nothing when context is absent, which is precisely why the omission was invisible — an article with no breadcrumb looks identical to one with no trail to show.
>
> Three fixes, in the order they matter:
> - **Taxonomy expansion moved into `repository.list()`.** The §8 invariant — querying `dark-intent` returns posts tagged `alexander-dark` — was proven at the graph level in P2 and **never wired to queries**. It lives at the repository now, the one place every surface passes through, so an archive cannot silently under-report. Optional and backward compatible: without a taxonomy the match stays exact, and a term the vocabulary does not know still matches itself rather than vanishing.
> - **`render/context.js`** builds eyebrow, meta line (date · form · reading length), term pills, breadcrumb and adjacent posts. **Adjacent posts resolve through the repository for the same viewer as the page** — computing them from the raw index would let prev/next point at a record the repository would have withheld, which is the one way a navigation control discloses gated work.
> - **`content/archives.js`** generates a term-archive record per (language, facet, term). Not a contradiction of "content is never discovered": the vocabulary *is* the explicit register. Not a contradiction of "path is data" either — paths are computed **once, at load**, and stored on ordinary records the path index resolves like any other. The site's own `/writings/` stays authored, since the specs call for curation over a listing, which is content rather than a query.
>
> Per-language archive schemes are configuration: the engine knows a language has a pattern, never that this site keeps Bulgarian archives under `/bg/writings/`.
>
> Verified live with a second post tagged with a **child** term: `/writings/dark-intent/` lists it under the parent, `/writings/anarandaris/` does not, prev/next reads in the right direction (previous = older), breadcrumb reaches the most specific term, both term pills resolve 200, and `?page=9` applies its offset instead of being ignored.
---

## 11. Phased plan (maps to the implementation log)

Two tracks with no dependency until they meet at templates (`build-spec.md` §5).

- **P0** framework seams → **P1** content backbone (schema+loader+repository, invariant tests first) → **P2** taxonomy/transliterate/markdown → **P3** render (html/document/sections) → **P4** routes + feeds + mount helpers. This is Track A, buildable with zero design input.
- **Track B** (parallel): token contract realised as `anarand.css`; the ten missing components designed (drop cap · pull quote · figure+caption · footnote · chapter opener · bilingual toggle · sign-in gate · capture form · pagination · breadcrumb); existing components ported from `anarand-dark-theme.css`.
- **They meet at P5:** section components + page templates. Build the **showcase page first** — it defines the component inventory; everything after is composition.
- **Then:** P6 capture, P7 migration (URL inventory is the non-negotiable first migration step — a path nobody recorded 404s silently), P8 standup → staging → redirect diff → DNS cutover, WordPress archived (not deleted) until logs are clean for a fortnight.

---

## 12. Spec sync owed to `Site/docs/`

Per `CLAUDE.md` ("update the spec in the same commit; a stale spec is worse than none"), ratifying this design obliges three edits, made when P0/P1 land:

- `build-spec.md` §2 — module layout header "Framework — `packages/web-framework`" → `@ti-engine/web-content`.
- `build-spec.md` §2 — "New dependencies: `markdown-it` only" → add `gray-matter`; note the import-time sanitiser.
- `build-spec.md` §4 — the `defineUnprotectedRoutes` snippet already matches; add a note that `addUnprotectedRoute` / `registerRoute` are provided by web-framework ≥1.17.0.

---

## 13. Resolutions

1. **Package name** — `@ti-engine/web-content`. ✅ settled.
2. **On-disk format** (§8) — Markdown-with-front-matter for `post`; YAML for `page`/`book`/`release`. ✅ ratified 2026-07-24.
3. **Search** — **deferred** unless a specific feature needs it. The repository stays the single visibility filter, so an on-site search surface added later is covered by the §10 invariant with no new gate to write. ✅ resolved 2026-07-24.
4. **`ajv`** — declared **directly** in `web-content` (used by `schema.js`), not via the transitive dep. ✅ resolved 2026-07-24.
