# ti-engine web-content changelog

This document will contain the list of changes made to the web-content package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 0.1.0

Initial scaffold of the content-publishing engine for the standalone author's site (design: `design/author-site-engine.md`). Layers on `@ti-engine/web-framework` >= 1.17.0 (the route-registration seams).

* feat(web-content): package inception — CommonJS package `@ti-engine/web-content` depending on `@ti-engine/core` and `@ti-engine/web-framework`; dependencies and `exports`/`imports` grow per phase
* feat(web-content): `content/schema.js` — ajv validators for the common envelope, each content type, and the capture record; `visibility` is required and pattern-constrained, so a missing or unrecognised value is a hard validation failure (deny-by-default)
* feat(web-content): `content/loader.js` — validates records and builds the id/path/alias/type indexes, excluding invalid records and reporting conflicts rather than throwing
* feat(web-content): `content/repository.js` — the single visibility chokepoint; `resolveVisibility` returns visible/gated/hidden and every query surface (resolve, list, count, getById, curated ids) routes through it
* feat(web-content): `content/transliterate.js` — Streamlined System romanisation + deterministic `slugify`
* feat(web-content): `content/taxonomy.js` — pure term graph with one-level parent expansion, per-language slug resolution
* feat(web-content): `content/markdown.js` — markdown-it wrapper with `html: false`; typographer/linkify off so authored Unicode punctuation is preserved verbatim
* feat(web-content): `content/sources.js` — reads explicitly registered front-matter/YAML files; a directory is an error, never scanned
* feat(web-content): `render/html.js` — escaping tagged template with an explicit `raw()` opt-out
* feat(web-content): `render/document.js` — document-head composition: canonical, reciprocal hreflang, noindex policy, and per-type JSON-LD
* feat(web-content): `routes/content-routes.js` — the catch-all path-index resolver (alias → 301, miss → `next()`, hit → render) with cache policy keyed on the record's visibility, so a non-public response never carries public cache headers
* feat(web-content): `routes/feeds.js` — `sitemap.xml`, `rss.xml`, `robots.txt`; sitemap membership resolved as an anonymous viewer, including gated records only when they expose a public teaser; RSS is public-only
* feat(web-content): `routes/index.js` — `mountContentRoutes` / `defineContentUnprotectedRoutes`, built on the web-framework 1.17.0 route seams
* fix(web-content): normalise YAML-parsed dates to ISO-8601 strings at the source boundary — an unquoted ISO timestamp parsed as a `Date` failed schema validation and silently excluded an otherwise valid record
* feat(web-content): add `dictionary` to `SECTION_TYPES` (15 values) — a lexicon is a section on a `page`, not a fifth content type
* feat(web-content): `render/sections.js` — the section registry, shared wrapper/chrome, and mechanical type→class derivation (`characterCards` → `.section-character-cards`), with the full type→class map pinned by test
* feat(web-content): `render/editorial/*` — all 15 section bodies emitting the DOM specified by the site's markup contract, grouped by kind; `featured` and `postList` resolve through the repository so a curated id list inherits visibility filtering, showing a gated record's teaser and never a summary derived from its withheld body
* feat(web-content): editorial markdown extensions — `markdown-it-attrs` (allowlisted to `class`/`id`), `markdown-it-bracketed-spans`, `markdown-it-container` (`pull-quote`, `chapter-opener`, `language-example`, `figure`, with positional auto-classing) and `markdown-it-footnote` remapped onto the contract's footnote classes, so every prose primitive is reachable from authored markdown
* feat(web-content): `render/shell.js`, `render/templates.js` and `render/page.js` — the document shell, per-type page templates (article, composed record, gate, state panel) and full document assembly; `contentHandler` now renders real pages instead of the placeholder fallback
* feat(web-content): ship `static/web-content.js` — the vanilla, dependency-free site script (reveal observer, dictionary toggle and filter, language menu, topbar toggle, audio player), served by `mountContentRoutes` under `/static/` and overridable by the consumer
* fix(web-content): give the JSON-LD block the CSP nonce — under `strict-dynamic` a nonce-less script tag can be dropped silently, and a structured-data block that quietly stops working is not a visible failure
* feat(web-content): `mountHomeRoute` — claims `/` for the content resolver before the framework binds it to the SPA shell; and a terminal GET-only 404 that answers **404** rather than redirecting to a page that answers 200 (a soft 404 pollutes the index and hides broken links)
* fix(web-content): withhold a dormant `bodyFormat: "html"` body in `renderProse` as well as in the fallback page — one renderer emitted it unsanitised while the other withheld it
* feat(web-content): `capture/` — the email-capture primitive serving preorders, newsletter and beta lists. No IP is stored, `consentAt` is stamped server-side, only schema fields are persisted, dedupe is on (email, purpose), and erasure is by email across every purpose. Admin reporting (totals, per-purpose and per-edition counts, CSV export, erase, delete) **fails closed** — an absent guard selects the built-in admin check, never none
* fix(web-content): write the whole record map on the first capture — RedisJSON cannot create a nested path in a document that does not exist, so the first signup on a fresh deployment failed
* feat(web-content): `routes/media.js` — serve a migrated media library at its **original** URLs (`/wp-content/uploads/...`) from a root whose tree mirrors the request path, so no rewriting is needed and inbound links keep working. Misses fall through to the proper 404; dotfiles and directory listings are refused; the cache is long but never `immutable`, since a media library is not content-addressed
* feat(web-content): `render/context.js` — the page context article templates need (eyebrow, meta line, term pills, breadcrumb, adjacent posts). Adjacent posts resolve through the repository for the same viewer, so prev/next can never link to a record the repository would withhold
* feat(web-content): `content/archives.js` — term-archive page records generated from the vocabulary once at load, with per-language paths from configuration
* fix(web-content): expand parent terms inside `repository.list()` — querying a parent term now returns records tagged with its children, at the one place every surface passes through. Optional and backward compatible
* fix(web-content): read `?page=N` from the request — paginated listings were always rendering page one
