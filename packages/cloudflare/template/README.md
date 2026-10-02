# The template: a ti-engine application on Cloudflare

What a new application copies to run on Cloudflare: one Worker in front of one container, with D1 behind the Worker.
The template is published with every release of `@ti-engine/cloudflare`, so the copy fits the release you install. Its
guard tests run in the package's own suite, against the template itself.

| File | What it is |
| --- | --- |
| `wrangler.jsonc` | The Worker, the container class and its Durable Object, the D1 database and the sweep's schedule |
| `Dockerfile` | The container's image: the application, installed without dev dependencies and run unprivileged |
| `.dockerignore` | What the image never carries: wrangler's local state, `.env` files, the Worker and its tests |
| `worker/index.mjs` | The Worker: the container's setup, the container class, its outbound handler and `createWorker` |
| `test/cloudflare.test.mjs` | The guard tests, to run before every deploy |

## 1. Copy it

From the application's root:

```bash
npm install --save-dev @ti-engine/cloudflare @cloudflare/containers wrangler
npm install @ti-engine/core   # unless the application depends on it already

T=node_modules/@ti-engine/cloudflare/template
cp $T/wrangler.jsonc $T/Dockerfile $T/.dockerignore .
mkdir -p worker test
cp $T/worker/index.mjs worker/
cp $T/test/cloudflare.test.mjs test/
```

Merge `.dockerignore` with your own if you have one. Add `.wrangler/` to the application's `.gitignore`: npm publishes
no `.gitignore`, so the line cannot come with the template. The image installs the application's dependencies without
its dev dependencies, so the three the Worker alone needs stay out of it.

Then add these scripts to `package.json`. The migrate scripts apply core's schema, which its state service reads, to
the database bound as `DB`:

```json
"test": "node --test test/*.test.mjs",
"deploy": "wrangler deploy",
"migrate:local": "wrangler d1 execute DB --local --file=node_modules/@ti-engine/core/components/cache/d1-state-schema.sql",
"migrate:remote": "wrangler d1 execute DB --remote --file=node_modules/@ti-engine/core/components/cache/d1-state-schema.sql"
```

If the application already has a test script, add `test/cloudflare.test.mjs` to what it runs instead.

## 2. Change the names

| Name | Where | What it names |
| --- | --- | --- |
| `ti-application` | `wrangler.jsonc` (`name`), `Dockerfile` (`TI_INSTANCE_NAME`) | The Worker, and the application's instance |
| `ApplicationContainer` | `wrangler.jsonc` (three places), `worker/index.mjs` (the class and the line setting its `outboundByHost`) | The container class |
| `ti-application-state`, and the `database_id` | `wrangler.jsonc` (`d1_databases`) | The D1 database |
| `APP` | `worker/index.mjs` (`prefixes`) | The application's own settings, `APP_*`, which reach the container beside the framework's `TI_*` |
| `web-server.js`, `web-server.json` | `Dockerfile` (`TI_INSTANCE_CLASS`, `TI_INSTANCE_CONFIG`) | The application's service class and its configuration, relative to the image's working directory |

The guard tests read the class and the bindings from `wrangler.jsonc`, so a rename that misses one place fails them.

## 3. Say what is the application's own

At the top of `test/cloudflare.test.mjs`:

- `ROUTES`: the paths the application serves. web-framework's own are there already; add the application's.
- `STATIC_DIRECTORIES`: the directories whose files it serves, by the path they are served under.
- `QUERY_PARAMETERS`: the names of the query parameters its pages send.

Every one of them must reach the container. The package's probe rules answer a scanner's request at the Worker, and a
path or parameter of the application's own that a rule matched would be answered 404 there, with nothing in the
application's logs to say why.

In `worker/index.mjs`, through the package's options (its README describes each):

- `containerSetup`: `egress`, the `environment` (`prefixes`, `defaults` and `settings`), and `sleepAfter`, a duration,
  or `{ setting, fallback }` to read it from a binding so that each environment can have its own timer.
- `outboundByHost`: `brokers`, for a call the container should not make itself, which the Worker makes for it.
- `createWorker`: `probes`, to exempt a path from one rule or turn a rule off; `edge`, for the application's own step
  before the container, such as an edge cache or timing; and `finish`, for headers on every response.

The template's way out is `intercepted`. The container then reaches the identity providers of the OpenID methods that
`TI_WEB_AUTH_METHODS` enables, and nothing else; with none enabled, nothing but the state address. `brokered` reaches
the state address alone. With it, an OpenID method that has a client ID fails its discovery when the application
starts, and the container never starts; without one, web-framework leaves the method out.

## 4. The first deploy

1. Create the database with `npx wrangler d1 create ti-application-state`, and put the id it prints in
   `wrangler.jsonc`.
2. Apply core's schema: `npm run migrate:remote`. Do it again whenever a core upgrade changes the schema: the guard
   tests stop the build until then, and take the new hash in `APPLIED_SCHEMA_SHA256`.
3. Set the secrets, which never go in `wrangler.jsonc`: `npx wrangler secret put TI_WEB_COOKIE_SECRET`, and any other
   the application reads. Without a cookie secret, web-framework signs sessions with a random one it makes at every
   start, and every cold start signs everyone out.
4. Deploy with `npm run deploy`. Or connect the repository to Workers Builds, with the root directory where
   `wrangler.jsonc` is, `npm test` as the build command and `npx wrangler deploy` as the deploy command, and the guard
   tests run before every deploy.

A second environment, such as `env.production`, must repeat `vars`, `durable_objects`, `containers` and
`d1_databases`, with a database of its own: wrangler does not inherit them (4.144 warns about each). Its migrate script
names it: `wrangler d1 execute DB --remote --env production --file=…`.

## What the guard tests hold

Each is something that fails silently: the deploy succeeds, and the failure shows first in production.

- A scanner's probe is answered at the Worker, one for each rule. Every path, file and query parameter the application
  serves reaches the container. A rule turned off is a probe to take out of that list too.
- The container is told the visitor's address and scheme as Cloudflare saw them, and nothing a client claimed.
- `ContainerProxy` is exported. Without it the container's requests never reach the Worker, and the container never
  starts.
- The container's outbound handlers are kept under the name `wrangler.jsonc` gives its class, and a state request
  reaches the database bound as `DB`. `@cloudflare/containers` keeps handlers under the class's name, so handlers set
  on any other class are never found.
- The container starts with the platform's settings, on the port the Dockerfile exposes, and the image runs
  unprivileged.
- The sweep reaches the database, on the schedule `wrangler.jsonc` sets.
- Wrangler's local state, a local D1 database among it, stays out of git and out of the image, and so do `.env` files.
- The schema the installed core ships is the one last applied.

The Worker is loaded as it is. Node cannot load `@cloudflare/containers`, so the tests replace that one import with a
stand-in that keeps outbound handlers under the class's name, as the library does. Everything else is the code that
ships, so no bundler is needed.

## Upgrading

A later release of the package may change the template; its changelog says what changed. Compare each file you copied
with the new release's, for example:

```bash
diff node_modules/@ti-engine/cloudflare/template/worker/index.mjs worker/index.mjs
```
