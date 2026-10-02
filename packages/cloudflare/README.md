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

> **Status: work in progress (0.x).** Steps 1 and 2 of four are done. The design record, including what comes next, is
> [`docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`](https://github.com/Belleal/ti-engine/blob/master/docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md).

## Usage

```js
import { getContainer } from "@cloudflare/containers";
import { createProbeFilter, probeResponse } from "@ti-engine/cloudflare/probes";
import { forContainer } from "@ti-engine/cloudflare/forwarding";

// Built once, when the module loads, so a malformed option fails the deploy rather than a request.
const isProbe = createProbeFilter( { except: { wordpress: [ "/wp-content/uploads/" ] } } );

export default {
    async fetch( request, env ) {
        const url = new URL( request.url );
        // First, before anything else: a probe passed on would wake the container to say "not found".
        if ( isProbe( url.pathname, url.search ) === true ) {
            return probeResponse();
        }
        return getContainer( env.CONTAINER ).fetch( forContainer( request ) );
    }
};
```

Every module is CommonJS and requires nothing. Each uses only globals that Workers and Node both provide. wrangler's
bundler and Node's ESM loader both import them by name, so a Worker bundles the one module it uses and nothing else.

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

```js
import { Container } from "@cloudflare/containers";
import {
    STATE_ADDRESS, CONTAINER_PORT, containerEnvironment, allowedHosts, INTERCEPTED_HTTPS_SETTINGS, sleepAfter
} from "@ti-engine/cloudflare/container";

export class ApplicationContainer extends Container {

    defaultPort = CONTAINER_PORT;
    enableInternet = false;
    interceptHttps = true;

    constructor( ctx, env, options ) {
        super( ctx, env, options );
        // Every TI_* setting on the Worker, every APP_* setting, and a sign-in method when none is set.
        this.envVars = containerEnvironment( env, {
            prefixes: [ "APP" ],
            defaults: { TI_WEB_AUTH_METHODS: "openid-azure" },
            settings: INTERCEPTED_HTTPS_SETTINGS
        } );
        this.allowedHosts = allowedHosts( this.envVars );
        this.sleepAfter = sleepAfter( env.APP_CONTAINER_SLEEP_AFTER, "10m" );
    }

}
```

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

- **Intercepted HTTPS**, for a container that makes HTTPS calls itself, such as an OpenID sign-in.
  - The class sets `interceptHttps = true`.
  - The environment carries `INTERCEPTED_HTTPS_SETTINGS`, so Node trusts the CA Cloudflare re-signs that traffic
    with.
  - `allowedHosts( environment )` lists the state address and the server-side hosts of each enabled sign-in method
    (`IDENTITY_PROVIDER_HOSTS`), plus the host of a discovery URL pointed elsewhere.
- **Brokered by the Worker**, for a container that should reach nothing but the state address.
  `createBroker( { path, url, contentType } )` is one call the Worker makes on the container's behalf:
  - the container sends it over plain HTTP to `broker.address`, at the state address;
  - the Worker's handler for that address checks `broker.matches( request )` and returns `broker.forward( request )`.

  The broker takes POST only and forwards to one HTTPS URL. Of the container's headers, it passes on only the content
  type. A URL it cannot reach answers `502`. Turnstile's `siteverify` is a call of this kind:

```js
const siteverify = createBroker( {
    path: "/turnstile/v0/siteverify",
    url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    contentType: "application/x-www-form-urlencoded"
} );

ApplicationContainer.outboundByHost = {
    [ STATE_ADDRESS ]: ( request, env ) => siteverify.matches( request )
        ? siteverify.forward( request )
        : createD1StateService( env.DB )( request )
};
```

A broker's path cannot be under `/v1/`, where the state protocol is, so the two can share the address.

This package knows nothing of the applications that use it. No application's prefix, path, setting or host is in it:
each application states its own through these options.

## Requirements

- Node `>= 20.12` to run the tests.
- No dependencies.

## License

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
