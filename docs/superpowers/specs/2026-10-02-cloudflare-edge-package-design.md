# Design — `@ti-engine/cloudflare`: the edge of a ti-engine application, kept in one place

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Packages** | `packages/cloudflare` (new) |
| **Status** | Steps 1 and 2 implemented in cloudflare 0.1.0 and 0.2.0 (see §8). Steps 3–4 proposed, each waiting on its own go-ahead |
| **Version targets** | cloudflare `0.1.0` (first release), `0.2.0` (step 2) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-359`](https://belleal.youtrack.cloud/issue/CA-359), step 1, and [`CA-362`](https://belleal.youtrack.cloud/issue/CA-362), step 2 (under `CA-11`) |

---

## 1. Why

Two applications now run on Cloudflare in the same arrangement: a Worker in front of a container, with D1 behind the
Worker. They are the Boris Khan site (`anarandaris`, `Site/worker/`) and competence (`deploy/cloudflare/`). Each
carries its own copy of what the Worker decides, and the copies have already drifted.

- **The shape differs.** The site has `forOrigin( request, url )`, which drops 20 header names. competence has
  `forContainer( request )`, which drops 18 and handles the other two by hand. The site's module is ESM; competence's
  is CommonJS.
- **The substance has drifted too.** On 2026-10-02 scanners swept the site for WordPress usernames. Its probe pattern
  was widened that morning, and the same change was ported to competence by hand the same day (CA-358). Every scanner
  wave so far has meant two edits, two reviews and two deploys. A third application makes it three, and the copy that
  misses an edit is the one the next sweep walks through.

Only some of each Worker is truly per application:

| Concern | The same everywhere | Per application |
| --- | --- | --- |
| Scanner probes (step 1) | The rules, their order, how a path is decoded, the answer | The paths it exempts (the site: `/wp-content/uploads/`), the rules it turns off, the test that holds its own URLs clear |
| Forwarding headers (step 1) | The claims a client can forge, and what replaces them | Nothing |
| Container environment and egress (step 2) | Building `envVars` from the bindings; the hosts an OpenID method needs; the state address; brokering a call the container cannot make itself (the site's Turnstile `siteverify`) | Which variables, which sign-in methods, which brokered calls |
| Worker assembly (step 3) | The order a request is decided in (probe, then the application's own hook, then the container); the state service on `outboundByHost`; the `ContainerProxy` export; the scheduled sweep | The site's edge cache policy, competence's partition spec and timing |
| Application template (step 4) | `wrangler.jsonc`, the Dockerfile, the D1 migration scripts, a guard-test template | Names, routes, secrets |

## 2. Decisions

1. **A package of its own: `@ti-engine/cloudflare`, not web-framework and not core.** The D1 state service went into
   core rather than a new package (`2026-09-25-d1-state-service-design.md` §2.1), for a concrete reason: trusted
   publishing cannot create a package, and `npm-publish-plan.js` refuses every release while a listed package has never
   been published. That cost is real here too. It is paid once, by a hand publish **before** the merge (§6), so
   nothing is ever blocked. Each of the alternatives costs more every time:
   - **Not web-framework.** That package is the Express server inside the container. These modules run in the Worker,
     a different runtime with different globals. Step 3 brings `@cloudflare/containers`, which every web-framework
     consumer would then install, including one that never deploys to Cloudflare. competence ran on Google Cloud
     Run until late September (CA-175).
   - **Not core.** The state service belongs there because it is the other end of core's own protocol, beside the
     client that speaks it. Nothing here is core's.
2. **CommonJS that requires nothing.** Each module uses only globals both Workers and Node provide: `Request`,
   `Response`, `Headers`, `URL`, `URLSearchParams`, `decodeURIComponent`. So a Worker bundles one module and nothing
   else. Its named exports reach both kinds of consumer:
   - wrangler's bundler, which competence already relies on for `container-settings.js` and core's state service;
   - Node's ESM loader, which the site's tests use. Measured: it detects `module.exports = { name: name }` exports by
     name.
3. **Named rules, each with its own exceptions.** A rule can be turned off, or exempted under a path prefix; nothing
   else is configurable. The obvious alternative was a pattern each application copies and edits, and that is what
   drifted. The site shows why an exception belongs to one rule only. Its media library keeps WordPress's addresses,
   so `/wp-content/uploads/` must be exempt from the `wordpress` rule. A `.php` file, a dotfile or an encoded
   separator under that prefix must still be a probe. An application-wide allowlist could not say so.
4. **Exceptions are compared with the decoded path, ignoring case.** That is what the site's pattern did
   (`^\/wp-(?!content\/uploads\/)`, `/i`, on the decoded path), so the site's behaviour is kept exactly. An exception is
   therefore written decoded, rooted and without a query; anything else could never match, so it is refused.
   - Climbing out of an exempt prefix is not possible. `URL` folds dot segments before the Worker sees the path,
     encoded ones included (`/wp-content/uploads/%2e%2e/%2E%2e/wp-admin/` arrives as `/wp-admin/`, measured).
   - An encoded separator is a rule of its own.
5. **A configuration that cannot mean what it says is refused, not ignored.** This covers an unknown option, an
   unknown rule, or an exception that is not rooted. The filter is built when the Worker's module loads, so the
   refusal fails the deploy. Ignoring a typo would be invisible: the application's own URLs would 404 at the edge,
   with nothing in any log to say why.
6. **A path that does not decode is always a probe, whatever is configured.** No application published it, and
   nothing behind the Worker can serve it. Express 5.2.1 answers `/%E0%A4%A` with a 400 ("Failed to decode param")
   from a parameterised route, a catch-all and a static mount alike (measured).
7. **`forContainer` takes the site's shape.** It copies the headers into a new request and never changes the one it
   is given. A Worker may still need the original: the site stores the response under it. The runtime's own request
   has immutable headers anyway.
8. **0.x, and a rule change is a behaviour change for every application.** A rule added or widened can take a URL an
   application serves the moment it takes the release. The changelog calls every rule change out. The `PROBE_RULES`
   test pins the list, so a change is made on purpose. Each application's own guard test then catches a swallowed URL
   when its range is bumped.

Step 2 added these:

9. **Each application keeps its way out.** The package offers both ways the two applications reach beyond the state
   address, and changes neither application's.
   - **Intercepted HTTPS** is competence's: `interceptHttps`, an allowlist from the enabled sign-in methods, and the
     CA Node must trust. It is how competence's staging and production are set up to sign people in.
   - **Brokered by the Worker** is the site's, for `siteverify`.

   The site's §7 records that a container without the internet resolves no public hostname, which is why it brokers.
   competence's design record still calls the intercepted mode unproven; its live sign-ins are the test. Which mode an
   application uses is the container class's choice, and step 3's to make simpler.
10. **One environment builder, in four layers.** The pattern pass-through, the named defaults, the platform, then the
    application's settings. That covers both applications as they are:
    - competence passes every `TI_*`/`COMPETENCE_*` binding;
    - the site lists five, each always present, with an empty or `false` default.

    No variable overrides the platform. An application's own settings, which are code and reviewed, override
    everything.
11. **A default replaces a binding that is absent, blank or not a string.** That is competence's rule for
    `TI_WEB_AUTH_METHODS`. The site's `env.X || ""` differs only for a binding that is whitespace or not a string, and
    the site has neither: its one committed variable and its secrets are strings.
12. **The sleep timer passes exactly what the library parses above zero.** A test holds it against
    `@cloudflare/containers`' own `parseTimeExpression`. competence's rule also refused a leading zero (`007m`), which
    the library accepts; no configuration uses one. The library is a dev dependency for that test and nothing else.
    It becomes a peer dependency in step 3, when the package builds the class.
13. **A broker is one operation, never a proxy.**
    - It answers one path, takes POST only and forwards to one HTTPS URL.
    - Of the container's headers, it passes on only the content type, or a fixed one: the site's `siteverify` is sent
      as `application/x-www-form-urlencoded`, exactly as before.
    - The body goes on unread.
    - An unreachable URL is a `502`.
    - A path under `/v1/` is refused, so a broker can never shadow the state protocol at the address they share.

## 3. The steps

Each step is a minor release here and then an adoption change in each application. Each waits on its own go-ahead.

1. **Probes and forwarding.** `@ti-engine/cloudflare/probes` and `@ti-engine/cloudflare/forwarding`. Done in 0.1.0
   (§8).
2. **Container environment and egress.** `@ti-engine/cloudflare/container`. Done in 0.2.0 (§8):
   - `PLATFORM_SETTINGS`, `STATE_ADDRESS` and `CONTAINER_PORT`;
   - `containerEnvironment`;
   - `allowedHosts`, `IDENTITY_PROVIDER_HOSTS` and `INTERCEPTED_HTTPS_SETTINGS`;
   - `sleepAfter`;
   - `createBroker`.

   They come from competence's `containerEnvironment`, `allowedHosts` and `containerSleepAfter`, and from the site's
   `siteverify` broker, generalised.
3. **Worker assembly.** One function builds the Worker's `fetch` from the pieces above.
   - The application supplies its hooks: the site's edge cache, competence's timing.
   - `@cloudflare/containers` becomes a peer dependency here, not before.
4. **The template.** What a new application copies: `wrangler.jsonc`, the Dockerfile, the D1 migration scripts, and
   a guard test that holds its URLs clear of its filter.

## 4. Adoption

**Step 1.** Neither application changes behaviour. Measured before adoption, against each application's current filter, over
1,113,160 URLs: every literal path in the three test suites, the site's URL inventory, redirects and published files,
competence's static files, and every combination of the rules' fragments three segments deep under eight queries. The
result was 0 differences: the site's configuration against `Site/worker/src/router.js`, the defaults against
competence's `container-settings.js`.

- **The site.**
  - `Site/package.json` takes `@ti-engine/cloudflare`.
  - `router.js` builds `isProbe` with `createProbeFilter( { except: { wordpress: [ "/wp-content/uploads/" ] } } )`. It
    keeps exporting `isProbe`, so its guard test still runs over every legacy URL, configured redirect and published
    file.
  - `forOrigin` gives way to `forContainer`.
- **competence.**
  - `container-settings.js` builds `isProbe` from the defaults and re-exports it, with `probeResponse` and
    `forContainer`, so `worker.mjs` and its tests do not change.
  - Its guard tests still run: every static file, every path the front end requests, and every query parameter it
    sends.

**Step 2.** Again, neither application changes behaviour. The evidence is the real container classes, bundled as
wrangler bundles them, with a stand-in SDK, before and after each switch. Built from the same bindings, each must give
the same:
- `envVars`, `allowedHosts` and `sleepAfter`;
- `enableInternet`, `interceptHttps` and `defaultPort`;
- answers from its outbound handler.

- **The site.**
  - `SiteContainer` takes `STATE_ADDRESS` and `CONTAINER_PORT` from the package.
  - It builds `envVars` with `containerEnvironment`: its five variables as `defaults`, and the `siteverify` address
    as a setting.
  - It brokers `siteverify` with `createBroker`, so `siteverify.js` goes.
  - Its allowlist stays the state address alone, and `sleepAfter` stays `2m`.
- **competence.**
  - `container-settings.js` builds its environment with `containerEnvironment`: its pattern, its `openid-azure`
    default, and `COMPETENCE_DATA_STORE` with `INTERCEPTED_HTTPS_SETTINGS` as settings.
  - Its hosts come from `allowedHosts`, and its sleep timer from `sleepAfter`.
  - It keeps its exports, the partition fingerprint and the Server-Timing helpers, so `worker.mjs` and its tests do
    not change.

## 5. Rejected

- **A pattern each application copies.** That is the arrangement this replaces, and it drifted within a day.
- **An allowlist of each application's own URLs.** It would be the strictest filter. But every new route would need
  an edge change too, and a missed one 404s at the edge. A denylist of what scanners ask for fails safe instead: a new
  probe reaches the container and is answered 404 there, as before any of this.
- **Rules in the Cloudflare dashboard** (WAF custom rules). They would live outside the repository, unreviewed and
  untested, set per zone and absent on `workers.dev`, and no guard test could reach them. The site's `CLAUDE.md`
  keeps its cache decision out of a dashboard Cache Rule for the same reason (its rule 9): such a rule "lives outside
  the repository, changes without a commit".
- **Matching a parameter's value, or its name in any case.** `?author=` enumerates users because WordPress, in PHP,
  reads exactly that name. A value is the application's data, and `?q=author` is a search.

## 6. Releasing a new package

`npm-publish.yml` publishes through trusted publishing, which cannot create a package. Its planner refuses the whole
run while a listed package has never been published (`npm-publish-plan.js`). So the order is:

1. Review the pull request.
2. From its branch, `cd packages/cloudflare && npm publish --access public`, by the maintainer, signed in to npm. A
   scoped package's first publish is private unless `--access public` says otherwise. This one version carries no
   provenance attestation: only a version published through the workflow does.
3. On npmjs.com, add the package's trusted publisher: *Settings → Trusted Publisher → GitHub Actions*, organization
   `Belleal`, repository `ti-engine`, workflow `npm-publish.yml`, no environment.
4. Merge. The workflow finds 0.1.0 on the registry without its tag, so it publishes nothing. It tags `cloudflare-v0.1.0`
   and writes the release.

If the merge comes first, every release fails at the planner until step 2 is done. A re-run (`workflow_dispatch`) then
finishes the job.

## 7. Not done

- **Steps 3–4**, as §3 describes. Neither is started.
- **Counting probes.** Workers logs already record each 404 with its path, and that has been enough to read every
  sweep so far.
- **Rate limiting.** A probe already costs the container nothing. Rate limits are a zone feature, and nothing here
  calls for one.
- **The workspace root's own version and changelog** stay as they are. The root is private and never published, and
  this change only adds a name to three lists in its scripts.

## 8. Implementation log

**cloudflare 0.1.0 — 2026-10-02.**

- `worker/probes.js`:
  - `createProbeFilter( { except, disable } )` returns `isProbe( pathname, search )`;
  - `probeResponse()`;
  - `PROBE_RULES`: `encoded-separators`, `server-files`, `wordpress`, `graphql`, `seo-sitemaps`, `dot-paths` and
    `user-enumeration`, applied in that order.
- `worker/forwarding.js`: `forContainer( request )` and `FORWARDING_CLAIMS`, the site's 20 names.
- Tests, `node --test`: 39, in 7 suites across 2 files. They cover:
  - the union of both applications' probe and served lists;
  - the site's configuration;
  - exceptions on a path rule, a query rule and the encoded-separator rule;
  - every refusal;
  - the claims.
- Nine plausible defects were each made by hand, and the suite caught every one. Eight failed tests from the start:
  an exception applied to every rule, the encoded rule matched after decoding, the path compared without folding its
  case, an undecodable path let through, an unknown option ignored, the request given changed in place, a client's
  `X-Forwarded-For` kept, and a hard-coded scheme. The ninth, an exception compared in the case it was written in,
  survived at first; a test for it was added.
- `check:types` gained a consumer check for the filter's return type. TypeScript had emitted the Closure-style
  `function( string, string= ): boolean` as a bare `Function`, which resolves and accepts any call. The check failed
  on it (TS2322) before the JSDoc was rewritten.

**cloudflare 0.2.0 — 2026-10-02 (CA-362).**

- `worker/container.js`, exported as `@ti-engine/cloudflare/container`:
  - `STATE_ADDRESS`, `CONTAINER_PORT` and `PLATFORM_SETTINGS`, the nine settings both applications carried;
  - `containerEnvironment( env, { passThrough, defaults, settings } )`;
  - `IDENTITY_PROVIDER_HOSTS`, `allowedHosts( environment )` and `INTERCEPTED_HTTPS_SETTINGS`;
  - `sleepAfter( value, fallback )`;
  - `createBroker( { path, url, contentType } )`.
- `@cloudflare/containers` ^0.3.7 is a dev dependency, for the test that holds `sleepAfter` against its parser.
- Tests: 44 new, 83 in all, in 12 suites across 3 files. They cover:
  - the platform, pinned;
  - each layer of the environment and its order;
  - both applications' bindings;
  - the hosts for every method and discovery URL;
  - the sleep timer against the library;
  - the broker's forwarding, refusals and failures;
  - every malformed option.
- Twelve plausible defects were each made by hand, and the suite caught every one:
  - the platform put over the application's settings;
  - defaults by truthiness;
  - a non-string passed through;
  - a global pattern accepted;
  - sign-in methods left untrimmed;
  - a zero sleep timer accepted, or one left untrimmed;
  - every header forwarded;
  - any method forwarded;
  - a broker under `/v1/`;
  - plain HTTP as a broker's target;
  - the container's content type over the broker's.
- `check:types` gained consumer checks for the container module: the environment is `Record<string, string>`, a
  broker is callable, and a setting that is not a string is a type error.
