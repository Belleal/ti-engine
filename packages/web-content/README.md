# @ti-engine/web-content

A content-publishing engine for [ti-engine](https://github.com/Belleal/ti-engine) sites, layered on `@ti-engine/web-framework` the way `@ti-engine/competence` is. It turns a set of registered content sources into a public website:

- **Path-index routing** — every URL (current, legacy, translated, aliased) is an index entry resolved by a single catch-all, not a set of competing route patterns.
- **Deny-by-default visibility** — a record with no explicit, recognised `visibility` is visible to nobody. Filtering is applied once, in the repository query layer, so every surface (listings, archives, sitemap, RSS, search, counts, prev/next) inherits it.
- **SEO documents** — full server-rendered HTML per URL with canonical, `hreflang`, Open Graph, and JSON-LD generated from the record.
- **Feeds & capture** — `sitemap.xml` / `rss.xml` / `robots.txt`, and an email-capture primitive (preorders / newsletter / beta signups).

> **Status: work in progress (0.x).** The architecture, module surface, and API are still settling. See [`design/author-site-engine.md`](design/author-site-engine.md) for the design record and phased plan, and the consuming site's specs under `Site/docs/` for the content schemas, token contract, and build spec.

## Requirements

- Node.js `>= 20.12`
- `@ti-engine/web-framework` `>= 1.17.0`

## License

Apache-2.0 © Boris Kostadinov
