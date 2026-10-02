# Design — `@ti-engine/cloudflare`: the edge of a ti-engine application, kept in one place

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Packages** | `packages/cloudflare` (new) |
| **Status** | All four steps implemented, in cloudflare 0.1.0 to 0.4.0 (see §8) |
| **Version targets** | cloudflare `0.1.0` (first release), `0.2.0` (step 2), `0.3.0` (step 3), `0.4.0` (step 4) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-359`](https://belleal.youtrack.cloud/issue/CA-359), step 1, [`CA-362`](https://belleal.youtrack.cloud/issue/CA-362), step 2, and [`CA-366`](https://belleal.youtrack.cloud/issue/CA-366), step 3, and [`CA-371`](https://belleal.youtrack.cloud/issue/CA-371), step 4 (under `CA-11`) |

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

9. (Step 2) **Each application keeps its way out.** The package offers both ways the two applications reach beyond the
   state address, and changes neither application's.
   - **Intercepted HTTPS** is competence's: `interceptHttps`, an allowlist from the enabled sign-in methods, and the
     CA Node must trust. It is how competence's staging and production are set up to sign people in. A discovery URL
     pointed elsewhere adds its host only when that is a plain host name: `@cloudflare/containers` reads `*` in an
     allowed host as a glob, so `*.example.com` would let every subdomain through, and `*` every host.
   - **Brokered by the Worker** is the site's, for `siteverify`.

   **Both are proven live.** The brokered call has answered every sign-up on the site since 2026-10-02. The intercepted
   mode is how competence's staging and production sign people in, and Boris confirmed they do (2026-10-02). The
   site's §7 had doubted that a container without the internet could reach a public host at all, which is why it
   brokers; competence's sign-ins settle that. Which mode an application uses is the container class's choice, and
   step 3's to make simpler.
10. (Step 2) **One environment builder, in four layers.** In order, each over the one before:
    - the bindings that pass through;
    - the named defaults;
    - the platform;
    - the application's settings.

    The framework's own settings, `TI_*`, always pass through. An application adds its own prefix, such as
    `prefixes: [ "APP" ]` for `APP_*`, and names the settings it reads as always present in `defaults`. No variable
    overrides the platform. An application's own settings, which are code and reviewed, override everything.
11. (Step 2) **A default replaces a binding that is absent, blank or not a string.** That is competence's rule for
    `TI_WEB_AUTH_METHODS`. The site's `env.X || ""` differs only for a binding that is whitespace or not a string, and
    the site has neither: its one committed variable and its secrets are strings.
12. (Step 2) **The sleep timer passes exactly what the library parses above zero.** A test holds it against
    `@cloudflare/containers`' own `parseTimeExpression`. competence's rule also refused a leading zero (`007m`), which
    the library accepts; no configuration uses one. The library is a dev dependency for that test and nothing else.
    It becomes a peer dependency in step 3, when the package builds the class.
13. (Step 2) **A broker is one operation, never a proxy.**
    - It answers one path, takes POST only and forwards to one HTTPS URL.
    - Of the container's headers, it passes on only the content type, or a fixed one: the site's `siteverify` is sent
      as `application/x-www-form-urlencoded`, exactly as before.
    - The body goes on byte for byte. Read as text, a body that is not UTF-8 went out changed.
    - It never follows a redirect, which would carry the body, and any secret in it, to a URL the broker was never
      given. It asks for `redirect: "manual"` and answers a `3xx` with `502`. `redirect: "error"` is not an option:
      workerd refuses it outright, so every call would have been a `502` in production while Node's tests passed.
    - An unreachable URL is a `502`.
    - A path under `/v1/` is refused, so a broker can never shadow the state protocol at the address they share.
14. (Step 2) **The package knows nothing of the applications that use it** (Boris, 2026-10-02). No application's prefix,
    path, setting or host is in its code, tests, README or changelog. Each application states its own through options:
    `prefixes`, `defaults` and `settings`; a broker's path and URL; a filter's `except` and `disable`. The first draft
    of 0.2.0 took a pass-through pattern, and the example that exercised it was `/^(TI|COMPETENCE)_…$/`. That put one
    application's prefix where the framework's belongs and tied the two the wrong way. So the framework's `TI_*` became
    the default, and `prefixes` became the application's own. The step-1 modules' comments and tests were made neutral
    in the same release.
15. (Step 3) **The container class stays the application's own.** `@cloudflare/containers` keeps a class's outbound
    handlers in a map keyed by the class's name (`static set outboundByHost`, `this.name`). Its proxy looks them up by
    the name of the class a container runs as (`ctx.props.className`, from `this.constructor.name`). So handlers set on
    a class the package built would never be found for the application's subclass: the container would never reach its
    state, and the application would exit at boot, first in production. Registering from the constructor would lean on
    the proxy running in the same isolate as the Durable Object, which nothing promises; registering when the module
    loads, on the class the module exports, does not. So the package gives the class its fields (`containerSetup`) and
    its handlers (`outboundByHost`), and the class itself is the application's, named as its `wrangler.jsonc` names it.
16. (Step 3) **`@cloudflare/containers` and core are passed in, not required.** §3 planned the library as a peer
    dependency here. That would make `worker.js` import it, and the library's ES module entry uses extensionless
    specifiers that only a bundler resolves. Such a module could not be loaded by Node, neither by this package's tests
    nor by an application's. The Worker needs one function from the library, `getContainer`, and the application passes
    it in, with core's state service and sweep. Every module still loads in Node, and the applications' versions of
    both stay theirs: the state service should be the same core release as the container's client.
17. (Step 3) **One order, two hooks.** Every request goes probe, then the application's `edge` hook, then the container.
    `edge` gets the request as received, still a cache key, and `origin`, which sends it to the container with the
    forwarding cleaned. It may answer without the container, as the site's cache does on a hit, or wrap the answer, as
    competence's timing does. `finish` is applied to every response, a probe's answer included: the site's own headers
    go on every response, whatever produced it. A WebSocket upgrade is returned untouched, because it cannot be rebuilt.
18. (Step 3) **The way out is one choice.** `containerSetup`'s `egress` is `brokered` or `intercepted`, because the mode
    is three settings that must agree: `interceptHttps`, the allowlist, and the CA setting. Getting one of them wrong is
    silent until deployed: an intercepted class without the CA fails every sign-in on its certificate. `brokered`, the
    way out that reaches least, applies unless another is stated. The sleep timer is the opposite: it decides the bill
    more than traffic does, so it is stated, never defaulted.
19. (Step 3) **Options are checked when the module loads.** `containerSetup`, `outboundByHost` and `createWorker` are
    called at the top of the Worker's module, so a malformed option fails the deploy, as the probe filter's and a
    broker's already do, rather than the container's start or a request.
20. (Step 4) **The template is a directory in the package, published with it.** An application copies it from
    `node_modules/@ti-engine/cloudflare/template/`, so what it copies always fits the release it installs. Its names
    are neutral (`ti-application`, `ApplicationContainer`, `APP`), and its README lists each one to change.
21. (Step 4) **The template is tested where it lives.** Its guard tests are part of this package's suite, and they run
    against the template itself. A release that renames an option, changes a default or comes with a new schema in
    core fails here, before anyone copies it. The package's own test checks what the guard tests cannot: that every
    file the README names is published, and that the template names no application.
22. (Step 4) **The guard tests load the Worker as it is, with one import replaced.** Node cannot load
    `@cloudflare/containers` (decision 16), so a module hook (`module.register`) replaces that one import with a
    stand-in. The stand-in keeps a class's outbound handlers under the class's name, as the library does (decision 15).
    Everything else is the code that ships: the package's modules and core's state service. Nothing is bundled, so
    neither ti-engine nor an application needs a bundler for these tests. Measured on Node 22.22 and 24.21.
23. (Step 4) **The guard tests hold what failed silently before, in production first:**
    - a probe is answered at the Worker, and every URL the application serves reaches the container: web-framework's
      routes, the application's own, every file in its static directories, and every query parameter it sends;
    - `ContainerProxy` is exported;
    - the outbound handlers are kept under the class `wrangler.jsonc` names, and a state request reaches the database
      bound as `DB`;
    - the container starts with the platform's settings, on the port the Dockerfile exposes;
    - the sweep reaches that database, on the schedule `wrangler.jsonc` sets;
    - `.wrangler` stays out of git and out of the image;
    - the schema the installed core ships is the one last applied.
24. (Step 4) **The template's way out is `intercepted`.** With no OpenID method enabled, it reaches what `brokered`
    does, the state address alone, because the allowlist follows the methods the environment enables. With one
    enabled, it reaches that provider and nothing else. Under `brokered`, an OpenID method with a client ID fails its
    discovery at start (web-framework runs it then), and the container never starts. The package's default stays
    `brokered` (decision 18). The template chooses for an application that will most likely sign people in.
25. (Step 4) **The template's schema hash is core's current schema.** In ti-engine, a change to core's schema fails the
    template's guard test until the template takes the new hash, which keeps it current. In an application the hash
    is the schema last applied, so a core upgrade that changes it stops the build until `npm run migrate:remote` has
    run. A new application's first `npm run migrate:remote` applies exactly the schema the hash names.

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
3. **Worker assembly.** Done in 0.3.0 (§8):
   - `createWorker`, which builds the Worker's `fetch` and `scheduled` from the pieces above, with the application's
     hooks: the site's edge cache and headers, competence's timing;
   - `containerSetup` and `outboundByHost`, for the class that stays the application's (decision 15).

   `@cloudflare/containers` did not become a peer dependency after all: the application passes in `getContainer`
   (decision 16).
4. **The template.** What a new application copies. Done in 0.4.0 (§8), in `template/`:
   - `wrangler.jsonc`, the Dockerfile and `.dockerignore`;
   - the Worker, `worker/index.mjs`;
   - the guard tests, `test/cloudflare.test.mjs`, which hold its URLs clear of its filter and the rest of decision 23;
   - a README with the D1 migration scripts, the names to change and the first deploy.

## 4. Adoption

**Step 1.** Neither application changes behaviour. Measured before adoption, against each application's current filter,
over 1,113,160 URLs: every literal path in the three test suites, the site's URL inventory, redirects and published
files, competence's static files, and every combination of the rules' fragments three segments deep under eight queries.
The result was 0 differences: the site's configuration against `Site/worker/src/router.js`, the defaults against
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

**Step 2.** competence does not change behaviour; the site changes in one respect, below. The evidence is the real
container classes, bundled as wrangler bundles them, with a stand-in SDK, before and after each switch. Built from the
same bindings, each must give the same:

- `envVars`, `allowedHosts` and `sleepAfter`;
- `enableInternet`, `interceptHttps` and `defaultPort`;
- answers from its outbound handler.

What each application changes:

- **The site.**
  - `SiteContainer` takes `STATE_ADDRESS` and `CONTAINER_PORT` from the package.
  - It builds `envVars` with `containerEnvironment`: its five variables as `defaults`, and the `siteverify` address
    as a setting.
  - Every `TI_*` binding on its Worker now reaches the container, not only those five, because the framework's settings
    pass by default (decision 14). This is the one behaviour change. Its committed configuration has no other `TI_*`
    binding, but one set only in the dashboard now reaches the container too.
  - It brokers `siteverify` with `createBroker`, so `siteverify.js` goes.
  - Its allowlist stays the state address alone, and `sleepAfter` stays `2m`.
- **competence.**
  - `container-settings.js` builds its environment with `containerEnvironment`: its own prefix, its `openid-azure`
    default, and `COMPETENCE_DATA_STORE` with `INTERCEPTED_HTTPS_SETTINGS` as settings.
  - Its hosts come from `allowedHosts`, and its sleep timer from `sleepAfter`.
  - It keeps its exports, the partition fingerprint and the Server-Timing helpers, so `worker.mjs` and its tests do
    not change.

**Step 3.** Neither application changes behaviour, measured before adoption. Each application's Worker module was
bundled as wrangler bundles it, with a stand-in SDK, before and after an adoption written against this release:

- **The site**, over:
  - 15,555 sets of bindings: identical class fields;
  - its outbound handler: identical answers from the state service and `siteverify`, on identical databases;
  - 13,272 requests: identical answers, container calls and edge-cache lookups. These cover every probe and served
    path of its guard test, and the private paths, in three methods, with and without a cookie, on both hostnames,
    against seven kinds of container answer, each sent twice to reach the cache;
  - the scheduled sweep: identical.

  What the edge cache stores differs in one way: a stored response no longer carries the site's own headers, because
  `finish` now puts them on every response on its way out, a hit included. What it serves is identical.
- **competence**, over:
  - 3,600 sets of bindings: identical class fields, with staging's and production's committed vars among them;
  - its outbound handler: identical answers from the state service;
  - 722 requests: identical answers and container calls, with timing on and off, with and without a colo, against
    three kinds of container answer, and the Durable Object's own timing;
  - the scheduled sweep: identical.

What each application changes:

- **The site.**
  - `router.js` keeps its edge cache as `cachedAtTheEdge` and builds the Worker with `createWorker`: its probe
    exception, the cache as `edge`, and `withSiteHeaders` as `finish`.
  - `SiteContainer` takes its fields from `containerSetup`: `brokered`, its five defaults and its settings, `2m`.
  - Its `outboundByHost` is `outboundByHost( { brokers: [ siteverify ], state } )`.
- **competence.**
  - `worker.mjs` builds the Worker with `createWorker`, its timing as `edge`.
  - `CompetenceContainer` takes its fields from `containerSetup`: `intercepted`, its prefix, default and settings, and
    its sleep timer from `COMPETENCE_CONTAINER_SLEEP_AFTER`. It keeps its own `fetch`, for the Durable Object's timing.
  - Its `outboundByHost` is `outboundByHost( { state } )`, the state service built with its partitions.

**Step 4.** Nothing to adopt. Both applications already carry what the template holds, with their own guard tests,
and the template is for the next application. Each may take 0.4.0 at its next bump, for the clearer error a hook gets
when it answers with something other than a response.

## 5. Rejected

- **A pattern each application copies.** That is the arrangement this replaces, and it drifted within a day.
- **An allowlist of each application's own URLs.** It would be the strictest filter. But every new route would need
  an edge change too, and a missed one 404s at the edge. A denylist of what scanners ask for fails safe instead: a new
  probe reaches the container and is answered 404 there, as before any of this.
- **Rules in the Cloudflare dashboard** (WAF custom rules). They would live outside the repository, unreviewed and
  untested, set per zone and absent on `workers.dev`, and no guard test could reach them. The site's `CLAUDE.md`
  keeps its cache decision out of a dashboard Cache Rule for the same reason (its rule 9): such a rule "lives outside
  the repository, changes without a commit".
- (Step 3) **A container class built by the package.** It would have saved each application five lines, and
  `@cloudflare/containers` would never have found its outbound handlers (decision 15).
- (Step 3) **The library as a peer dependency, imported by the package.** It would have made `worker.js` loadable only
  through a bundler (decision 16).
- (Step 3) **The edge cache in the package.** What may be stored at the edge is the application's own decision, and
  the site's rule 9 keeps it in the site's repository, reviewed and tested there. The package gives it its place in the
  order, `edge`, and nothing more.
- (Step 4) **A scaffold command** (`npx @ti-engine/cloudflare init`). It would rename five names, and it would be one
  more surface to maintain and test for an application started a few times a year. The README's table does it.
- (Step 4) **A template repository.** It would be a second repository to keep in step with the package, outside the
  package's tests. In the package, the template is tested on every change and published with the release it fits.
- (Step 4) **Bundling the Worker for its guard tests**, as the site's own tests do with wrangler's esbuild. ti-engine
  has no bundler, and a new application should not need one to run its tests. A module hook replaces the one import
  Node cannot load (decision 22).
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

- **The template's second environment.** Each application has its own shape: one Worker and its workers.dev hostname,
  or a staging and a production Worker. The README says which keys an environment must repeat (wrangler 4.144 warns
  about `vars`, `durable_objects`, `containers` and `d1_databases`, which are not inherited).
- **What happens outside the repository.** The template's README lists the steps, but they are done once per
  application, in Cloudflare's dashboard or the command line: creating the D1 database, Workers Builds' settings, a
  custom domain, an Access policy on a staging hostname, the secrets.
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
  - `containerEnvironment( env, { prefixes, defaults, settings } )`;
  - `IDENTITY_PROVIDER_HOSTS`, `allowedHosts( environment )` and `INTERCEPTED_HTTPS_SETTINGS`;
  - `sleepAfter( value, fallback )`;
  - `createBroker( { path, url, contentType } )`.
- `@cloudflare/containers` ^0.3.7 is a dev dependency, for the test that holds `sleepAfter` against its parser.
- Tests: 51 new, 90 in all, in 12 suites across 3 files. They cover:
  - the platform, pinned;
  - each layer of the environment and its order;
  - both applications' bindings;
  - the hosts for every method and discovery URL, and a discovery host that is not a plain host name;
  - the sleep timer against the library;
  - the broker's forwarding, byte for byte, its refusals, redirects and failures;
  - every malformed option.
- Twenty-seven plausible defects were each made by hand, and the suite caught every one:
  - the platform put over the application's settings;
  - defaults by truthiness;
  - a non-string passed through;
  - `TI_*` not passed by default;
  - a prefix matched without its separator;
  - any prefix accepted;
  - sign-in methods left untrimmed;
  - a zero sleep timer accepted, or one left untrimmed;
  - every header forwarded;
  - any method forwarded;
  - a broker under `/v1/`;
  - plain HTTP as a broker's target;
  - the container's content type over the broker's;
  - an unreachable URL thrown instead of answered `502`;
  - a discovery host added whatever its characters, with `*` or `_` allowed, or matched unanchored;
  - a redirect followed, passed back to the container, or its body left open;
  - the redirect range off by one at either end, three ways;
  - the body decoded as text.
- CodeRabbit's review of #182 found the last three groups: ways out wider than the options named. Each fix was
  measured in workerd itself (miniflare 5 from wrangler 4.144.0), not only in Node:
  - a body that is not UTF-8 arrives exact, with its `Content-Length`;
  - a `307` is answered `502` after one call out, never a second;
  - the target's own `400` comes back as it came;
  - workerd's URL parser gives the same hosts as Node's.
- `check:types` gained consumer checks for the container module: the environment is `Record<string, string>`, a
  broker is callable, and a setting that is not a string is a type error.

**cloudflare 0.3.0 — 2026-10-02 (CA-366).**

- `worker/worker.js`, exported as `@ti-engine/cloudflare/worker`: `createWorker( { getContainer, binding, probes, edge,
  finish, sweep, database } )`. It requires `probes.js` and `forwarding.js`, and nothing outside the package.
- `worker/container.js` gained `containerSetup( { egress, environment, sleepAfter } )` and
  `outboundByHost( { state, database, brokers } )`.
- Tests: 53 new, 143 in all, in 17 suites across 4 files. They cover:
  - the order: a probe never reaches the hook or the container, and the hook sits before the container;
  - the forwarding the container gets;
  - `finish` on every response, a probe's included, and never on an upgrade;
  - the binding and database names;
  - both ways out and the CA's place under the application's settings;
  - the sleep timer, fixed and read from a binding;
  - brokers before the state service, built once per binding;
  - every refusal.
- Forty-three plausible defects were each made by hand, and the suite caught every one. Among them:
  - a probe passed to the hook;
  - the forwarding not cleaned;
  - the hook skipped;
  - `finish` skipped for a probe, or applied to an upgrade;
  - the sweep awaited rather than waited on;
  - the CA over the application's settings, left out when intercepted, or added when brokered;
  - the brokered allowlist taken from the environment;
  - the state service rebuilt for every request;
  - a broker answered after the state service;
  - each validation removed in turn.
- In workerd (miniflare 5 from wrangler 4.144.0), the module bundled as wrangler bundles it:
  - a probe was answered `404` and finished, for `GET` and `POST`;
  - an exempt path reached the container, its forged forwarding headers replaced;
  - `containerSetup` and `outboundByHost` gave the same fields and answers as in Node.
- `check:types` gained consumer checks for both modules: the fields, the answers at the state address and the Worker
  are typed. An egress mode there is not, a missing sleep timer, and a hook that does not answer with a response are
  type errors.
- Each application's adoption was measured before release (§4, step 3).

**cloudflare 0.4.0 — 2026-10-02 (CA-371).**

- `template/`, published with the package: `wrangler.jsonc`, `Dockerfile`, `.dockerignore`, `worker/index.mjs`,
  `test/cloudflare.test.mjs` and a README. Its `.gitignore` is in the repository only: npm leaves every `.gitignore`
  out of a package (measured with `npm pack`), so the README carries the line.
- `worker/worker.js`: a hook that answers with something other than an object fails the request with a `TypeError`
  that names `edge` or `finish`. CodeRabbit found this in review of #183.
- `eslint.config.mjs` parses `**/*.mjs` as modules; the template's Worker and tests could not be parsed before.
- Tests first: 19 new, 162 in the package in 21 suites across 6 files, and 1610 in the workspace, all passing. They are
  13 guard tests run against the template itself, 4 on what the package publishes, and 2 on the hooks' answers. Each
  failed before the code it covers.
- 24 defects were made by hand in the template, and the guard tests caught each one. Among them:
  - `ContainerProxy` not exported;
  - the class renamed in one place;
  - the handlers set on a base class;
  - another binding for the container or the state;
  - no sweep, or no schedule;
  - no migration;
  - another port, or root, in the Dockerfile;
  - `.wrangler` or `.env` in the image, `.wrangler` in git;
  - a schema not applied;
  - each of the seven rules turned off, with one probe for each that no other rule catches;
  - a route or a query parameter the rules swallow;
  - the state sent to a hostname.
  The 4 package tests were each shown to bite the same way.
- Outside the monorepo, a new application was set up exactly as the README says. It used cloudflare 0.3.0 and core
  1.19.0 from npm, since the template's Worker uses nothing newer.
  - Its guard tests passed 12 of 13 until `.wrangler/` went into its `.gitignore`, then 13.
  - `wrangler deploy --dry-run` (4.144.0) bundled it: 114.04 KiB, with `CONTAINER` and `DB` bound and the class's name
    kept.
  - The image the template's Dockerfile builds was checked too. For this session's network only, a copy had the
    proxy's CA added to its install stage. The image:
    - runs as `node`;
    - carries no dev dependency, no `.wrangler`, `.env`, Worker or tests;
    - started with the platform's settings against core's state service on SQLite, answered `/health` 200 within 2 s;
    - was reported healthy by Docker's `HEALTHCHECK`.
- With a dry run, wrangler 4.144 was measured not to let an environment inherit `vars`, `durable_objects`,
  `containers` and `d1_databases`. The README says so.
- The guard tests load the Worker the same way on Node 22.22 and 24.21.
