# ti-engine cloudflare changelog

This document contains the list of changes made to the cloudflare package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

A rule added to or widened in the probe filter applies to every application the moment it takes the release, so every
such change is called out here.

## Version 0.2.0

What the container starts with on Cloudflare, and what it may reach (CA-362). Both applications built these
themselves, around the same nine settings described in different words. Design:
`docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`, step 2.

* feat(container): `PLATFORM_SETTINGS`, `STATE_ADDRESS` and `CONTAINER_PORT` are what every ti-engine application on
  Cloudflare runs as:
  * state over the state protocol at `11.0.0.1`, an address because a container without the internet gets no DNS;
  * the capabilities it requires;
  * no message exchange and no health heartbeat;
  * JSON logs;
  * port 3000 without TLS.
* feat(container): `containerEnvironment( env, { passThrough, defaults, settings } )` builds the container's
  environment from the Worker's bindings, in four layers:
  * the string bindings a pattern names;
  * named bindings with a default for when one is absent, blank or not a string;
  * the platform settings, which no variable overrides;
  * the application's own settings, over everything.

  Only strings reach the container. A malformed option throws, a global or sticky pattern included, since `test` on one
  skips every other binding.
* feat(container): `allowedHosts( environment )`, `IDENTITY_PROVIDER_HOSTS` and `INTERCEPTED_HTTPS_SETTINGS` cover
  the intercepted-HTTPS way out. That is the state address, plus the server-side hosts of each enabled OpenID method
  and of a discovery URL pointed elsewhere, with the CA Node must trust.
* feat(container): `sleepAfter( value, fallback )` passes on exactly the durations `@cloudflare/containers` can parse
  above zero, and the fallback otherwise. A test holds it against the library's own `parseTimeExpression`.
  * A leading zero (`007m`) is now accepted, as the library accepts it. competence's own rule fell back on it.
* feat(container): `createBroker( { path, url, contentType } )` is a call the Worker makes for a container that
  reaches nothing but the state address.
  * It takes POST only and forwards to one HTTPS URL.
  * Of the container's headers, it passes on only the content type.
  * An unreachable URL answers 502.
  * A path under `/v1/`, where the state protocol is, is refused.

  This is the Boris Khan site's Turnstile `siteverify` broker, generalised.

## Version 0.1.0

The first release (CA-359). It takes two pieces out of the Workers in front of the Boris Khan site and competence,
which each carried its own copy of both, and the copies had drifted. Design:
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
  * The defaults answer every URL exactly as competence's filter did. With `/wp-content/uploads/` exempt from
    `wordpress`, it answers every URL exactly as the site's did. Measured over 1,113,160 URLs with no difference.
* feat(probes): `probeResponse()` is a plain `404 Not Found` in `text/plain`, new each time.
* feat(forwarding): `forContainer( request )` gives the container only what Cloudflare saw.
  * It drops every header in `FORWARDING_CLAIMS`: the 20 names a client can use to claim an address, a host or a
    scheme.
  * It sets `X-Forwarded-For` from `CF-Connecting-IP`, or claims no address when there is none, as in a local run.
  * It sets `X-Forwarded-Proto` from the URL actually requested.
  * The request it is given is not modified.
