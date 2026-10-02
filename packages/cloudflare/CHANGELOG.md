# ti-engine cloudflare changelog

This document contains the list of changes made to the cloudflare package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

A rule added to or widened in the probe filter applies to every application the moment it takes the release, so every
such change is called out here.

## Version 0.2.0

What the container starts with on Cloudflare, and what it may reach (CA-362). Each application built these itself,
around the same nine settings described in different words. Design:
`docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`, step 2.

* feat(container): `PLATFORM_SETTINGS`, `STATE_ADDRESS` and `CONTAINER_PORT` are what every ti-engine application on
  Cloudflare runs as:
  * state over the state protocol at `11.0.0.1`, an address because a container without the internet gets no DNS;
  * the capabilities it requires;
  * no message exchange and no health heartbeat;
  * JSON logs;
  * port 3000 without TLS.
* feat(container): `containerEnvironment( env, { prefixes, defaults, settings } )` builds the container's
  environment from the Worker's bindings, in four layers:
  * every `TI_*` string binding, the framework's own settings, and `<PREFIX>_*` for each prefix the application names;
  * named bindings with a default for when one is absent, blank or not a string;
  * the platform settings, which no variable overrides;
  * the application's own settings, over everything.

  Only strings reach the container. A malformed option throws, a prefix in lower case or with its underscore included.
  The package names no application's prefix: an application states its own.
* feat(container): `allowedHosts( environment )`, `IDENTITY_PROVIDER_HOSTS` and `INTERCEPTED_HTTPS_SETTINGS` cover
  the intercepted-HTTPS way out. That is the state address, plus the server-side hosts of each enabled OpenID method
  and of a discovery URL pointed elsewhere, with the CA Node must trust.
  * A discovery URL's host counts only when it is a plain host name. `@cloudflare/containers` reads `*` in an allowed
    host as a glob, so `*.example.com` would have let every subdomain through.
* feat(container): `sleepAfter( value, fallback )` passes on exactly the durations `@cloudflare/containers` can parse
  above zero, and the fallback otherwise. A test holds it against the library's own `parseTimeExpression`.
  * A leading zero (`007m`) is accepted, as the library accepts it.
* feat(container): `createBroker( { path, url, contentType } )` is a call the Worker makes for a container that
  reaches nothing but the state address.
  * It takes POST only and forwards the body, byte for byte, to one HTTPS URL.
  * Of the container's headers, it passes on only the content type.
  * It never follows a redirect, which would carry the body to a URL it was never given. A redirect answers 502, as
    an unreachable URL does.
  * A path under `/v1/`, where the state protocol is, is refused.

  Turnstile's `siteverify`, which a container without the internet cannot make, is the call it was written for.

## Version 0.1.0

The first release (CA-359). It takes two pieces out of the Workers in front of two applications, each of which
carried its own copy of both, and the copies had drifted. Design:
`docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`.

* feat(probes): `createProbeFilter( { except, disable } )` returns `isProbe( pathname, search )`. The Worker uses it to
  answer a scanner's probe itself, without waking the container.
  * Seven named rules, applied in order: `encoded-separators`, `server-files`, `wordpress`, `graphql`, `seo-sitemaps`,
    `dot-paths` and `user-enumeration`. `PROBE_RULES` names them.
  * An application can exempt path prefixes from one rule (`except`) or turn a rule off (`disable`).
  * An unknown option or rule, or an exception that is not a rooted, decoded path, throws a `TypeError` when the
    filter is built. Ignoring it would leave the application's own URLs answering 404 at the edge, with nothing in any
    log to say why.
  * A path that does not decode is always a probe.
  * The defaults, and the same rules with `/wp-content/uploads/` exempt from `wordpress`, answer every URL exactly as
    the two filters they replace did. Measured over 1,113,160 URLs with no difference.
* feat(probes): `probeResponse()` is a plain `404 Not Found` in `text/plain`, new each time.
* feat(forwarding): `forContainer( request )` gives the container only what Cloudflare saw.
  * It drops every header in `FORWARDING_CLAIMS`: the 20 names a client can use to claim an address, a host or a
    scheme.
  * It sets `X-Forwarded-For` from `CF-Connecting-IP`, or claims no address when there is none, as in a local run.
  * It sets `X-Forwarded-Proto` from the URL actually requested.
  * The request it is given is not modified.
