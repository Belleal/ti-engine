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
