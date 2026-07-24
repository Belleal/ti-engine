# Author-Site Content Engine — Design

| Field | Value |
|---|---|
| **Status** | Active — P0 + P1 committed; P2 + P3 dep-free halves done (transliterate, taxonomy graph, html escaping, document head — 80 tests green); deferred (need `npm install` for `gray-matter`/`markdown-it`): `taxonomies.yml` loader, `markdown.js`, `sections.js` + body rendering |
| **Created** | 2026-07-24 |
| **Last updated** | 2026-07-24 |
| **Owner** | Boris Kostadinov |
| **Scope** | New package `@ti-engine/web-content` (reusable engine) + a small enabling change in `@ti-engine/web-framework` (route seams) + the private `anarandaris` `Site/` app (content, theme, wiring) |
| **Relates to** | Realises the three `Site/docs/` specs — `build-spec.md`, `content-schemas.md`, `token-contract.md` — which remain the source of truth for *what*. This doc records *how it lands as a package* and **supersedes `build-spec.md` §2 on module placement** (framework column → `web-content`). |

## Implementation log

How this design lands in code — update as each step is committed (branch `current`). Nothing built yet.

| Phase / step | Status | Commit | Date |
|---|---|---|---|
| Design ratified (placement · name · seams · render model · deps · on-disk format · defer search) | ✅ ratified | — | 2026-07-24 |
| **P0** — Framework route seams (`registerRoute` + `addUnprotectedRoute`) + tests → web-framework `1.17.0` | ✅ committed | `d01dc6a` | 2026-07-24 |
| **P1a** — `web-content` package inception (package.json, CHANGELOG, README) | ✅ done (uncommitted) | — | 2026-07-24 |
| **P1b** — `content/schema.js` (ajv envelope + per-type) + **invariant tests written first** | ✅ 16 tests green (uncommitted) | — | 2026-07-24 |
| **P1c** — `content/loader.js` (validate records → indexes + conflict reporting; disk source-reader deferred) | ✅ 8 tests green | — | 2026-07-24 |
| **P1d** — `content/repository.js` — THE visibility-filtered query layer | ✅ 17 tests green (uncommitted) | — | 2026-07-24 |
| **P2** — `transliterate.js` ✅ + `taxonomy.js` graph ✅ (dep-free, 20 tests); `taxonomies.yml` loader + `markdown.js` deferred (need `gray-matter`/`markdown-it`) | ◑ partial | — | 2026-07-24 |
| **P3** — `render/html.js` (escaping) ✅ + `render/document.js` (head/JSON-LD/hreflang) ✅ (dep-free, 19 tests); `sections.js` + body rendering deferred (need `markdown-it`) | ◑ partial | — | 2026-07-24 |
| **P4** — `routes/content-routes.js` (catch-all resolver + alias 301) · `routes/feeds.js` (sitemap/rss/robots) · `mountContentRoutes` helpers | ☐ pending | — | — |
| **P5** — `render/editorial/*` components + page templates (showcase first) — Track B meets Track A here | ☐ pending | — | — |
| **P6** — `capture/store.js` + `capture/admin.js` (behind `role:admin`) | ☐ pending | — | — |
| **P7** — Migration tooling (URL inventory → WP REST export → uploads copy → redirect map) | ☐ pending | — | — |
| **P8** — `Site/app` standup (`TiWebServer`/`TiWebAppManager` subclasses, config, Dockerfile) → staging → redirect diff → cutover | ☐ pending | — | — |
| **Track B** (parallel, no code dep) — tokens → `anarand.css`; ten new editorial components; port existing components | ☐ pending | — | — |

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
    loader.js         reads registered sources, validates, builds indexes
    repository.js     THE query layer — all visibility filtering lives here
    taxonomy.js       vocabulary load, one-level parent expansion, term resolution
    markdown.js       markdown-it wrapper, html:false
    transliterate.js  Streamlined System (BG 2009), slug generation
  render/
    html.js           escaping tagged template + raw()
    document.js       full document: head, meta, JSON-LD, shell, cache headers
    sections.js       section-type registry and dispatch
    editorial/        prose · verse · characterCards · languageExample · audio ·
                      agePanels · timeStrip · timeline · gallery · capture ·
                      featured · postList · closing · hero  (generic, token-driven)
  routes/
    content-routes.js catch-all resolver, alias 301s, archives, pagination (?page=N)
    feeds.js          sitemap.xml, rss.xml, robots.txt
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

1. **Runtime also needs a YAML/front-matter parser** — `gray-matter` (bundles `js-yaml`) — for `taxonomies.yml`, front-matter posts, and the structured YAML records. Not optional.
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
