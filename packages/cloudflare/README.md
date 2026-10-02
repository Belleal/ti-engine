# @ti-engine/cloudflare

The Cloudflare edge of a [ti-engine](https://github.com/Belleal/ti-engine) application. On Cloudflare, an application
built on `@ti-engine/web-framework` runs in a container behind a Worker. This package holds what that Worker decides,
so that every application decides it the same way:

- **Scanner probes, answered at the Worker.** Requests for WordPress, leaked secrets, server scripts and the like
  never reach the container. Passed on, each one would wake a sleeping container just to say "not found".
- **Forwarding headers made true.** The container is told the visitor's address and scheme as Cloudflare saw them,
  and nothing a client claimed.
- **The container's environment and egress.** What the container starts with, and what it may reach: the settings
  every ti-engine application on Cloudflare runs with, the Worker's bindings it receives, and the calls it makes out.
- **The Worker, assembled.** The order every request is decided in, the answers at the state address, and the
  scheduled sweep. An application writes only what is its own: an edge cache, timing, headers.
- **A template for the next application.** `wrangler.jsonc`, the Dockerfile, the Worker and the guard tests a new
  application copies, tested in this package's suite.

> **Status: work in progress (0.x).** All four steps of the plan are done. The design record is
> [`docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`](https://github.com/Belleal/ti-engine/blob/master/docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md).

## Usage

A whole Worker, in front of a container whose state lives in D1:

```js
import { Container, getContainer } from "@cloudflare/containers";
import { createD1StateService, sweepExpired } from "@ti-engine/core/state-service";
import { containerSetup, outboundByHost } from "@ti-engine/cloudflare/container";
import { createWorker } from "@ti-engine/cloudflare/worker";

// The runtime finds this among the Worker's exports by name, and routes the container's outbound traffic through it.
// Without it the container never starts.
export { ContainerProxy } from "@cloudflare/containers";

// Built once, when the module loads, so a malformed option fails the deploy rather than the container's start.
const setup = containerSetup( { egress: "brokered", environment: { prefixes: [ "APP" ] }, sleepAfter: "2m" } );

// The class keeps the name `wrangler.jsonc` gives it.
export class ApplicationContainer extends Container {
    constructor( ctx, env, options ) {
        super( ctx, env, options );
        Object.assign( this, setup( env ) );
    }
}

ApplicationContainer.outboundByHost = outboundByHost( { state: ( database ) => createD1StateService( database ) } );

export default createWorker( { getContainer, sweep: sweepExpired } );
```

The [template](#the-template) has this Worker, with the rest of what an application needs on Cloudflare.

Every module is CommonJS, and each uses only globals that Workers and Node both provide. `probes`, `forwarding` and
`container` require nothing; `worker` requires those three and nothing outside this package. wrangler's bundler and
Node's ESM loader both import them by name, so a Worker bundles only what it uses.

`@cloudflare/containers` and `@ti-engine/core` stay the application's, and it passes in what the Worker needs from
them: `getContainer`, the state service and the sweep. The library's ES module entry resolves only through a bundler,
so a module that imported it could not be loaded by Node, in tests included. The state service should be the same
release of core as the container's client, which is the application's to choose.

## Scanner probes

`createProbeFilter( options )` returns `isProbe( pathname, search )`. It takes the path as `URL` gives it,
percent-encoded, and the query with its `?`. `probeResponse()` is the answer: a plain `404 Not Found`, new each time.

Every application gets every rule:

| Rule | Matched against | Takes |
| --- | --- | --- |
| `encoded-separators` | the path as sent | an encoded slash, backslash or percent sign (`%2F`, `%5C`, `%25`), which scanners send to slip past a filter that decodes once |
| `server-files` | the decoded path | `.php`, `.env`, `.log`, `.ini`, `.sql`, `.bak`, `.cgi`, `.axd`, `.asp`, `.aspx`, `.jsp`, `.yml`, `.yaml`, at the end of the path or before a `/` |
| `wordpress` | the decoded path | everything under `/wp-`: the admin, the REST API (`/wp-json/`), the core sitemaps |
| `graphql` | the decoded path | `/graphql` and everything under it |
| `seo-sitemaps` | the decoded path | an SEO plugin's sitemaps, which list the authors: `/sitemap_index.xml`, `/author-sitemap.xml`. An application's own `/sitemap.xml` is not one |
| `dot-paths` | the decoded path | any segment starting with a dot, except `/.well-known/` |
| `user-enumeration` | the query's parameter names | `rest_route` and `author`, which make WordPress name its users. Matched as PHP reads them, case and all, never by value |

A path that does not decode at all is always a probe, whatever is configured.

### Fitting the rules to an application

An application whose own URLs fall under a rule has two options. Nothing else is configurable.

- **`except`** exempts paths from one rule: `{ <rule>: [ <path prefixes> ] }`. A prefix is compared with the decoded
  path, ignoring case, so it is written decoded, starting with `/`, and without a query. Every other rule still applies
  under it. An application that kept its media library at WordPress's addresses exempts `/wp-content/uploads/` from
  `wordpress`; a `.php` file under that prefix is still a probe.
- **`disable`** turns rules off altogether: `[ <rule>, … ]`. An application with a real GraphQL endpoint disables
  `graphql`.

An unknown option, an unknown rule, or an exception that is not a rooted, decoded path throws a `TypeError`. Ignoring
it would be invisible: the application's own URLs would 404 at the edge, with nothing in any log to say why.

**Hold your own URLs clear in a test.** Run every URL the application serves through the filter it configures, and
assert that none is a probe: its static files, the paths its pages request, the query parameters it sends. A rule added
or widened in a later release takes effect the moment the application takes that release. The changelog calls out
every rule change, and that test catches the ones that matter to you.

## Forwarding headers

`forContainer( request )` returns the request the container should receive.

web-framework turns Express's `trust proxy` on, so an application believes the forwarding headers that reach it.
`request.ip` is the first `X-Forwarded-For` entry, and `request.hostname` follows `X-Forwarded-Host`. The scheme
decides whether the session cookie is `Secure` and which OpenID callback is built. `forContainer` therefore:

- drops every header in `FORWARDING_CLAIMS`: `Forwarded`, the `X-Forwarded-*` family, `X-Real-IP`, `True-Client-IP`
  and the rest a client can forge;
- sets `X-Forwarded-For` to `CF-Connecting-IP`, the address Cloudflare connected to. With no connecting address, as in
  a local `wrangler dev`, it claims none;
- sets `X-Forwarded-Proto` to the scheme of the URL actually requested.

Everything else passes unchanged: method, URL, body, cookies, `Host`, and Cloudflare's own headers. The request it is
given is not modified, so a Worker can still use it as a cache key.

## The container's environment and egress

`@ti-engine/cloudflare/container` is for the container class the Worker defines. It covers what the container starts
with and what it may reach.

`containerSetup( options )` takes one description of the container, checks it, and returns the function that builds
the class's fields from the Worker's bindings as each container starts: `defaultPort`, `enableInternet`,
`interceptHttps`, `allowedHosts`, `envVars` and `sleepAfter`.

```js
// A container that signs people in itself, with OpenID: every TI_* and APP_* setting on the Worker, a sign-in method
// when none is set, and a sleep timer read from a setting, ten minutes when it is not one the library can use.
const setup = containerSetup( {
    egress: "intercepted",
    environment: { prefixes: [ "APP" ], defaults: { TI_WEB_AUTH_METHODS: "openid-azure" } },
    sleepAfter: { setting: "APP_CONTAINER_SLEEP_AFTER", fallback: "10m" }
} );
```

- `egress` is the way out, below: `brokered` unless stated, or `intercepted`. It is one choice because it is three
  settings that must agree: `interceptHttps`, the allowlist, and the CA setting in the environment.
- `environment` is what `containerEnvironment` builds the environment from: the application's `prefixes`, `defaults`
  and `settings`.
- `sleepAfter` is a duration such as `2m`, or `{ setting, fallback }` to read it from a binding. It decides the bill
  more than traffic does, so it is stated, never defaulted.

The pieces it is built from are exported too, for a class that needs them on their own: `containerEnvironment`,
`allowedHosts`, `sleepAfter` and `INTERCEPTED_HTTPS_SETTINGS`.

### What it starts with

`PLATFORM_SETTINGS` is what every ti-engine application on Cloudflare runs as:

- port `CONTAINER_PORT` (3000) without TLS, since the Worker terminates it;
- sessions and the configuration store over the state protocol at `STATE_ADDRESS` (`11.0.0.1`), which the Worker
  answers from D1;
- the state capabilities the framework requires;
- no message exchange and no health heartbeat, since one container has nothing to talk to and a heartbeat is a
  billed D1 write every second;
- JSON logs, which Cloudflare records as one event per entry.

The state is reached at an address, not a hostname, because a container without the internet gets no DNS.

`containerEnvironment( env, { prefixes, defaults, settings } )` builds the rest from the Worker's bindings, in four
layers, each over the one before:

1. Every string binding named `TI_<NAME>`, the framework's own settings, and `<PREFIX>_<NAME>` for each of
   `prefixes`, the application's own (`[ "APP" ]` passes `APP_*`). A prefix is written in capitals without its
   underscore.
2. `defaults`: each named binding when it is a non-blank string, and its default otherwise, so the container always
   receives it.
3. `PLATFORM_SETTINGS`, which no variable can override.
4. `settings`: the application's own fixed values, over everything.

Only strings reach the container. A binding that is not one, such as D1, a Durable Object namespace or a JSON
variable, never does. A malformed option throws a `TypeError` where it is written.

`sleepAfter( value, fallback )` is how long the container stays awake without a request. It returns `value` when
`@cloudflare/containers` can use it (`2m`, `10m`, `1h`), and `fallback` otherwise. The library parses the value inside
the Durable Object's start-up, so a value it cannot parse would stop the container from ever starting. Zero, which it
accepts, would cold-start every request.

### What it may reach

Both ways out start from `enableInternet = false`, which denies everything not listed:

- **Intercepted HTTPS** (`egress: "intercepted"`), for a container that makes HTTPS calls itself, such as an OpenID
  sign-in. `containerSetup` sets three things together:
  - `interceptHttps = true`;
  - `INTERCEPTED_HTTPS_SETTINGS` in the environment, under the application's own settings, so Node trusts the CA
    Cloudflare re-signs that traffic with;
  - the allowlist from `allowedHosts( environment )`: the state address and the server-side hosts of each enabled
    sign-in method (`IDENTITY_PROVIDER_HOSTS`), plus the host of a discovery URL pointed elsewhere when it is a plain
    host name. `@cloudflare/containers` reads `*` in an allowed host as a glob, so a discovery URL at
    `*.example.com` adds nothing, rather than every subdomain.
- **Brokered by the Worker** (`egress: "brokered"`, unless stated), for a container that should reach nothing but the
  state address. Its allowlist is that address alone. `createBroker( { path, url, contentType } )` is one call the
  Worker makes on the container's behalf:
  - the container sends it over plain HTTP to `broker.address`, at the state address;
  - the Worker's handler for that address checks `broker.matches( request )` and returns `broker.forward( request )`.

  The broker takes POST only and forwards the body, byte for byte, to one HTTPS URL. Of the container's headers, it
  passes on only the content type. It never follows a redirect, which would carry the body to a URL it was never
  given: a redirect answers `502`, as a URL it cannot reach does. Turnstile's `siteverify` is a call of this kind:

```js
const siteverify = createBroker( {
    path: "/turnstile/v0/siteverify",
    url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    contentType: "application/x-www-form-urlencoded"
} );

ApplicationContainer.outboundByHost = outboundByHost( {
    brokers: [ siteverify ],
    state: ( database ) => createD1StateService( database )
} );
```

A broker's path cannot be under `/v1/`, where the state protocol is, so the two can share the address.

### The answers at the state address

`outboundByHost( { state, database, brokers } )` is the container class's `outboundByHost`: each broker's call on its
own path, and the state service for everything else.

- `state( database )` builds the state service over the database binding, such as
  `( database ) => createD1StateService( database )`. It is built the first time it is needed, and again only for
  another binding.
- `database` is the binding's name: `DB` unless stated.
- `brokers` are the calls the Worker makes for the container, no two on the same path.

Set it on the class the Worker exports, under the name `wrangler.jsonc` gives it. `@cloudflare/containers` keeps a
class's outbound handlers under the name of the class they are set on, and looks them up by the name of the class a
container runs as. Set on a parent class, they would never be found: the container would never reach its state.

## The Worker

`@ti-engine/cloudflare/worker` assembles the Worker's handlers. `createWorker( options )` returns its `fetch` and,
with a `sweep`, its `scheduled`, for the module's default export. Every request is decided in this order:

1. A scanner's probe is answered `404` there and then, for any method. Neither the application's hook nor the
   container sees it, so it never wakes the container or holds it awake.
2. The application's `edge` hook, when it has one, gets the request as the Worker received it, `origin`, and a
   context of `env`, `ctx` and the parsed `url`. Calling `origin()` sends the request to the container. The hook may
   answer without calling it, as an edge cache does on a hit, or call it once and work on the answer, as timing does.
3. The container gets the request as `forContainer` gives it: told the visitor's address and scheme as Cloudflare saw
   them, and nothing a client claimed.

Every response then passes through the application's `finish`, a probe's answer included: the place for headers that
belong on every response. A WebSocket upgrade passes through untouched, since it cannot be rebuilt.

```js
export default createWorker( {
    getContainer,
    probes: { except: { wordpress: [ "/wp-content/uploads/" ] } },
    edge: ( request, origin, { ctx } ) => cachedAtTheEdge( request, origin, caches.default, ctx ),
    finish: ( response, { url } ) => withOwnHeaders( response, url ),
    sweep: sweepExpired
} );
```

| Option | What it is |
| --- | --- |
| `getContainer` | `@cloudflare/containers`' `getContainer`. Required |
| `binding` | The container's Durable Object binding: `CONTAINER` unless stated |
| `probes` | What `createProbeFilter` takes: the application's `except` and `disable` |
| `edge` | `( request, origin, context )`, the application's step before the container |
| `finish` | `( response, context )`, applied to every response |
| `sweep` | `( database )`, run on the Worker's schedule, such as core's `sweepExpired` |
| `database` | The binding the sweep is given: `DB` unless stated |

An unknown option, or one that is not what it should be, throws a `TypeError` when the module loads. A hook that
answers with something other than a response, such as a branch that returns nothing, fails the request with a
`TypeError` that names the hook.

The Worker module must still export `ContainerProxy` itself, as the usage above does. The runtime looks for it among
the module's own exports, so no package can export it on the module's behalf.

This package knows nothing of the applications that use it. No application's prefix, path, setting or host is in it:
each application states its own through these options.

## The template

`template/`, published with the package, is what a new application copies to run on Cloudflare: `wrangler.jsonc`, the
Dockerfile and its `.dockerignore`, the Worker, and guard tests. An application copies it from
`node_modules/@ti-engine/cloudflare/template/`, so the copy fits the release it installs. Its
[README](template/README.md) says what to copy, which names to change, and how to deploy the first time.

The guard tests hold what has failed silently before, in production first: the probes answered at the Worker and the
application's own URLs let through, `ContainerProxy` exported, the outbound handlers kept under the class
`wrangler.jsonc` names, the container's settings and port, the sweep, and the schema core ships. They load the Worker as
it is, with only `@cloudflare/containers` replaced by a stand-in, so they need no bundler. They run in this package's
suite against the template itself, so a release cannot change what the template relies on without failing here.

## Requirements

- Node `>= 20.12` to run the tests.
- No dependencies.

## License

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
