# ti-engine cloudflare changelog

This document contains the list of changes made to the cloudflare package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

A rule added to or widened in the probe filter applies to every application the moment it takes the release, so every
such change is called out here.

## Version 0.6.0

* feat(container): **the mail relay passes a message's files** to the `send_email` binding (CA-502).
  * **What was wrong.** The relay passed `from`, `to`, `subject`, `text`, `html` and `replyTo` and dropped everything
    else, so the files web-framework 1.55.0 attaches to a notice, such as a calendar entry, never reached the binding.
    The e-mail was still sent, without them.
  * **Now.** `attachments` reaches the binding, each file rebuilt to `{ filename, type, disposition: "attachment",
    content }`. Anything else posted on a file, such as an inline `contentId` or headers, is dropped, so nothing
    posted can stand in for part of the body.
  * **Refused as `400 E_MAIL_INVALID`:**
    * a list that is empty or holds more than 10 files;
    * a name that is not plain ASCII or holds a path, quote or line break;
    * a type that is not RFC 2045 tokens;
    * content that is not padded base64;
    * a disposition other than `attachment`;
    * more than 4 MiB of base64 together.
  * **Who it affects.** An application's Worker gets this when it takes 0.6.0. Until then its relay drops the files and
    sends the e-mail without them.

Tests: 4 new in `container.test.js`, and all 4 fail on 0.5.1.

## Version 0.5.1

* feat(template): **the cron fires every hour**, `0 * * * *`, where it fired daily at 04:00 UTC (CA-496).
  * **Why.** The cron is what ticks web-framework's jobs. From 1.54.0, web-framework sends waiting e-mail once per
    interval of the `notifications` document's `sendEveryHours`, which can be as short as an hour. A daily cron would
    have held that mail back for a day, whatever the document said.
  * **What does not change.** A daily job still runs once a day at its own time.
  * **What it costs.** Each tick wakes a sleeping container.
  * **Who it affects.** The template is copied into an application, so an application's own wrangler file changes only
    when it is edited.

## Version 0.5.0

The Cloudflare end of web-framework 1.52.0's notifications and scheduled jobs (CA-486). Design:
`docs/superpowers/specs/2026-10-14-web-framework-notifications-design.md`, §3.5.

* feat(container): **the mail relay.** `outboundByHost( { …, mail: { binding: "EMAIL" } } )` answers
  `POST /v1/mail/send` (`MAIL_PATH`) at the state address by sending the posted message through the Worker's
  `send_email` binding. The container holds no credential and reaches no new host: the binding is the authentication,
  as it is for the state.
  - One call is one message to one person: only `from`, `to`, `subject`, `text`, `html` and `replyTo` reach the
    binding, a list of recipients is refused, and `cc`, `bcc` and headers are dropped.
  - It answers `200 { messageId }`, or `{ code, transient }`. Email Service's `E_RATE_LIMIT_EXCEEDED`,
    `E_DAILY_LIMIT_EXCEEDED`, `E_DELIVERY_FAILED` and `E_INTERNAL_SERVER_ERROR` are transient (`503`); every other
    code is permanent (`422`). An error without a code is taken for the runtime's and is transient. A malformed
    message is `400 E_MAIL_INVALID`, and a deployment without the binding `503 E_MAIL_BINDING_MISSING`, both permanent.
  - Who may be written to is the binding's own configuration (`allowed_destination_addresses`), which is where a
    staging environment keeps itself from mailing real people. Nothing here logs the message.
* feat(container): **`PLATFORM_SETTINGS` gains `TI_WEB_NOTIFY_RELAY_URL`**, `http://11.0.0.1/v1/mail/send`, for every
  application. It changes every application's container the moment it takes the release, and does nothing until the
  application chooses the `cloudflare` transport.
* feat(worker): **`createWorker( { …, jobs: true } )`** also posts `/_ti/jobs/run` (`JOBS_PATH`) to the container on
  the schedule, waking it if it sleeps, for an application whose web-framework jobs trigger is `route`. With a sweep,
  both run to the end on every tick, and the first failure, such as the container answering anything but a success,
  is what the cron's log reports. Without `jobs`, the schedule is the sweep alone, exactly as before.
* feat(worker): **`/_ti/` is answered `404` from the internet**, like a probe: neither the application's hook nor the
  container sees it. web-framework keeps the prefix for calls from its own Worker, and its jobs route is outside
  sign-in. The check ignores case and a trailing slash, because Express routes match `/_TI/JOBS/RUN/` too. It applies
  with or without `jobs`.
* docs(template): `wrangler.jsonc` shows the `send_email` binding, commented, and the Worker says how to turn on the
  relay and the jobs. Neither is on by default: `jobs: true` against a container whose trigger is not `route` would
  fail every tick.
* test: **20 new tests; the suite is 184, all passing.** The relay against a fake binding, every documented code
  among them; the schedule calling the container, with and without a sweep, and failing visibly; six requests under the
  reserved prefix, in its spellings and methods, never reaching the hook or the container, and a path that only begins like it passing through.

## Version 0.4.0

The template for the next application (CA-371). Two applications learned the rest of their Cloudflare edge by hand,
several of its traps in production first, and a third would have copied one of the two. Design:
`docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`, step 4.

* feat(template): `template/`, published with the package, is what a new application copies:
  * `wrangler.jsonc`: the Worker, the container class with its Durable Object and migration, the D1 database and the
    sweep's schedule;
  * the `Dockerfile` and its `.dockerignore`: the application without dev dependencies, run unprivileged;
  * `worker/index.mjs`, the Worker: `containerSetup` with intercepted HTTPS, the container class, `outboundByHost` and
    `createWorker`;
  * `test/cloudflare.test.mjs`, the guard tests;
  * a README: what to copy, the names to change, the D1 migration scripts and the first deploy.

  Its names are neutral: `ti-application`, `ApplicationContainer`, `APP`.
* test(template): the guard tests load the Worker as it is, with only `@cloudflare/containers` replaced by a stand-in
  that keeps outbound handlers under the class's name, as the library does. They need no bundler. They hold:
  * the probes, one for each rule, answered at the Worker;
  * every path, file and query parameter the application serves let through to the container;
  * the forwarding, and `ContainerProxy` exported;
  * the outbound handlers kept under the class `wrangler.jsonc` names, and a state request answered from `DB`;
  * the container's settings and the Dockerfile's port, and the image run unprivileged;
  * the sweep, and its schedule;
  * `.wrangler` kept out of git and out of the image, with `.env`;
  * the schema the installed core ships, last applied.

  They run in this package's suite against the template itself.
* fix(worker): a hook that answers with something other than a `Response` fails the request with a `TypeError` that
  names it, `edge` or `finish`. A hook with a branch that returns nothing used to fail on `.status`, and a plain object
  failed later, in the runtime, neither naming the hook. From `edge`, a WebSocket upgrade passes as `origin` gave it.
  Found by CodeRabbit in review of 0.3.0 and 0.4.0.

## Version 0.3.0

The Worker, assembled from the pieces of 0.1.0 and 0.2.0 (CA-366). Each application wired its own Worker around them,
in the same order and with the same answers at the state address, and a third would have copied one of the two.
Design: `docs/superpowers/specs/2026-10-02-cloudflare-edge-package-design.md`, step 3.

* feat(worker): `createWorker( options )` returns the Worker's `fetch` and, with a `sweep`, its `scheduled`. Every
  request is decided in one order:
  * a scanner's probe is answered `404` first, for any method, without the application's hook or the container;
  * then the application's `edge` hook, with `origin` to reach the container, such as an edge cache or timing;
  * then the container, told only what Cloudflare saw, by `forContainer`.

  Every response then passes through the application's `finish`, a probe's answer included, apart from a WebSocket
  upgrade. `getContainer` is passed in, so the module requires nothing outside this package and loads in Node.
* feat(container): `containerSetup( options )` gives a container class its fields from one description, checked when
  the module loads.
  * The fields are `defaultPort`, `enableInternet`, `interceptHttps`, `allowedHosts`, `envVars` and `sleepAfter`.
  * The way out is one choice, `egress`: `brokered` (the default, the state address alone) or `intercepted`
    (interception, the identity providers' hosts and the CA setting, together).
  * The sleep timer is stated: a duration, or `{ setting, fallback }` to read it from a binding.
* feat(container): `outboundByHost( { state, database, brokers } )` is a container class's answers at the state
  address. Each broker's call goes on its own path, and everything else to the state service, built once per database
  binding. Set it on the class the Worker exports: `@cloudflare/containers` keeps outbound handlers under a class's
  name.

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
