# @ti-engine/web-content

A content-publishing engine for [ti-engine](https://github.com/Belleal/ti-engine) sites, layered on `@ti-engine/web-framework` the way `@ti-engine/competence` is. It turns a set of registered content sources into a public website:

- **Path-index routing** — every URL (current, legacy, translated, aliased) is an index entry resolved by a single catch-all, not a set of competing route patterns.
- **Deny-by-default visibility** — a record with no explicit, recognised `visibility` is visible to nobody. Filtering is applied once, in the repository query layer, so every surface (listings, archives, sitemap, RSS, search, counts, prev/next) inherits it.
- **SEO documents** — full server-rendered HTML per URL with canonical, `hreflang`, Open Graph, and JSON-LD generated from the record.
- **Feeds & capture** — `sitemap.xml` / `rss.xml` / `robots.txt`, and an email-capture primitive (preorders / newsletter / beta signups).

> **Status: work in progress (0.x).** The architecture, module surface, and API are still settling. See [`design/author-site-engine.md`](design/author-site-engine.md) for the design record and phased plan, and the consuming site's specs under `Site/docs/` for the content schemas, token contract, and build spec.

## Bot protection on the capture form

A capture form carries the session's CSRF token, which stops a forged cross-site post. It does not stop a script, which
loads the page first and posts back what it was given. From 0.5.0, the form can carry a
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) challenge, which is verified before anything is
stored:

```js
// The site key is public; the secret belongs in the deployment's secret store, never in a committed file.
const turnstile = { siteKey: siteConfig.turnstile.siteKey, secret: process.env.TURNSTILE_SECRET, theme: "dark" };

mountContentRoutes( server, { /* … */ turnstile } );         // draws the widget in every capture form
mountCaptureRoutes( server, { store, repository, turnstile } ); // verifies each submission's token
```

- **The secret never reaches a page.** It is safe to hand both functions the same object: the content routes copy only
  `siteKey` and `theme` into a render context, the 404 page's included.
- **What the form gets.** The widget is drawn inside the form, so its token is submitted with it. Cloudflare's script is
  loaded once per page, with the response's CSP nonce.
- **The policy must admit the widget's frame.** That needs web-framework 1.45.0 or later, with
  `contentSecurityPolicy.additionalSources.frameSrc: [ "https://challenges.cloudflare.com" ]` in the web server
  configuration.
- **Everything that fails the check is refused, as `?capture=error`, and logged with Cloudflare's reason.** That covers:
  - a missing, failed or reused token;
  - an unreachable `siteverify`;
  - a token issued for another action.

  The visitor's IP is not sent to Cloudflare, in keeping with the capture store's rule that no IP is ever read.
- **One half without the other is a misconfiguration.** A site key with no secret, or a secret with no site key, makes
  the capture endpoint refuse every submission, and logs the cause at ERROR when it is mounted. The site keeps serving
  pages.
- **The server must be able to reach `https://challenges.cloudflare.com`.** A container that denies outbound traffic
  needs that host allowed.
- **A visitor without JavaScript cannot complete the challenge, and so cannot sign up.**

## Requirements

- Node.js `>= 20.12`
- `@ti-engine/web-framework` `>= 1.17.0`; `>= 1.45.0` for a Turnstile challenge on the capture form

## License

Apache-2.0 © Boris Kostadinov
