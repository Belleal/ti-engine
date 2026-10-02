# ti-engine cloudflare changelog

This document contains the list of changes made to the cloudflare package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

A rule added to or widened in the probe filter applies to every application the moment it takes the release, so every
such change is called out here.

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
