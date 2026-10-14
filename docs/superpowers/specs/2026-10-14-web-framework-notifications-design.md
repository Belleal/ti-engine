# Design — notifications and scheduled jobs in web-framework

| | |
| --- | --- |
| **Date** | 2026-10-14 |
| **Packages** | `packages/web-framework`, `packages/cloudflare` |
| **Status** | Approved by Boris on 2026-10-14, with notices raised by configurable rules over events (§3.2). Implemented in web-framework 1.52.0 and cloudflare 0.5.0; what implementation settled is in §9. |
| **Version target** | web-framework `1.52.0`, cloudflare `0.5.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-486`](https://belleal.youtrack.cloud/issue/CA-486) (framework), [`CA-487`](https://belleal.youtrack.cloud/issue/CA-487) (the first application to adopt it), under [`CA-485`](https://belleal.youtrack.cloud/issue/CA-485) |

---

## 1. Why

Boris, 2026-10-14, on a request for e-mail reminders in the appraisal application: "we need to build it as reusable
capability in the web-framework instead. Then Competence can extend it and configure it for its own needs."

The first application wants two notices: one when a person gets a new task, and one when that task's deadline is
close. Both are application rules. What they need from the framework is generic:

- **a way to send** a rendered message to one person;
- **a guarantee** that the same notice is never sent twice, even when two paths try to send it;
- **a clock**: something that runs application code on a schedule, so a deadline can be noticed without anyone
  opening a screen.

The framework has none of the three today (§2). The framework knows nothing of the applications that use it
(`CLAUDE.md`): every rule about *who* is told *what* stays in the application, which registers its notices and decides
when to raise them.

## 2. What exists, read from the code

- **No mail code anywhere.** No package sends mail; there is no SMTP client, `nodemailer` or `send_email` binding.
  web-content's e-mail capture (`capture/store.js`) stores consented sign-ups and sends nothing.
- **No scheduler, outbox or queue.** core depends on `node-schedule`, but uses it only for the health heartbeat
  (`core/components/service-instance.js:313`), which the Cloudflare platform switches off
  (`TI_SERVICE_HEALTH_CHECK_ENABLED=false`, `cloudflare/worker/container.js:91`). web-framework runs no timer.
- **The Worker's cron never reaches the application.** `createWorker` builds a `scheduled` handler only when given a
  `sweep`, and that handler only sweeps expired state rows in D1 (`cloudflare/worker/worker.js:217-221`). The container
  is never called.
- **The container already has a channel to the Worker.** It sends plain HTTP to `11.0.0.1` (`STATE_ADDRESS`,
  `container.js:54`). The egress layer of `@cloudflare/containers` intercepts it, and the Worker answers it through
  `outboundByHost`, from its own bindings (`container.js:624-662`). "No token: the binding is the authentication"
  (`container.js:79-80`). Brokers already add POST-only paths on that address for calls the Worker makes on the
  container's behalf (`createBroker`, `container.js:415`). The container has no internet access of its own
  (`enableInternet: false`, `container.js:577`).
- **There is a store and a lock to build on.** `cache.instance` offers JSON documents with an atomic merge over HTTP
  (`editJSON`) and per-entry expiry (`expireValue`). `tools.KeyedLock#exclusively( keys, task )` orders tasks inside one
  process (`core/utils/tools.js:710-729`). `ConfigStore` is the pattern to copy: key prefixes, a lock, one writer.
- **There is no language per user**, only per session. `User.language` exists, but no sign-in sets it
  (`auth-manager.js:264-269`); a session's language comes from the sign-in choice, the cookie or the deployment's
  `TI_LOCALIZATION_LANGUAGE`. A notice sent from a job has no session.
- **Cloudflare Email Service** (measured against its documentation on 2026-10-14):
  - **Three ways to send:** a Worker binding (`send_email`), a REST API with an API token, and SMTP.
  - **Sending is labelled Beta.** It needs the Workers Paid plan, which includes 3,000 messages a month, then $0.35
    per 1,000.
  - **The sending domain must use Cloudflare DNS.** Onboarding adds SPF, DKIM and DMARC records under `cf-bounce`.
  - **New accounts start on a conservative daily quota** that rises with reputation.
  - **A binding can be restricted** to listed senders (`allowed_sender_addresses`) and recipients
    (`allowed_destination_addresses`).
  - **`env.EMAIL.send( { from, to, subject, text, html, replyTo, headers } )`** resolves to `{ messageId }`, or throws
    an `Error` whose `code` names the failure (`E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`,
    `E_RECIPIENT_SUPPRESSED`, `E_SENDER_NOT_VERIFIED`, …).
  - **Up to 50 recipients and 5 MiB** per message.

## 3. The capability

Four parts in web-framework and two in cloudflare. An application declares the **events** it can raise and the
**notices** it can send. A configuration document holds the **rules** that join the two: which event, filtered by
which of its attributes, sends which notice. Boris, approving the design: "let's make this configurable - i.e.,
event-based thing". Which tasks notify is a rule, so changing it is an edit, not a release.

### 3.1 Notices (`@ti-engine/web-framework/notifications`)

Everything below hangs off one frozen singleton, `NotificationService.instance`, exported as
`@ti-engine/web-framework/notifications`.

- **`registerNotice( kind, { subject, text, link? } )`.** Registered at start-up, like a config document.
  - `subject` and `text` are **label keys**, rendered per recipient language with `{placeholder}` substitution from the
    notice's data, through core's `getLabel( label, language )`.
  - `link( data )` returns a path, which is joined to the deployment's public base URL.
  - The HTML part is the text, escaped, in a fixed minimal template. It has no remote images, no tracking pixel and no
    link rewriting. A notice is a pointer to the application, not a report.
- **`notify( { kind, key, recipient, data } )`.** This is the low-level send. An application normally calls `emit`
  (§3.2) and lets the rules choose the notice.
  - **`recipient`** is `{ id, email, name?, language? }`. `language` falls back to the deployment's.
  - **It resolves once the notice is in the outbox,** not once it is delivered, so a request handler never waits on mail.
  - **It is idempotent per `key`.** A key already queued or already sent is a no-op that resolves `false`. The
    application's key names the occurrence, for example a task and the deadline it was given. Two paths raising the same
    notice, such as a write and a nightly catch-up, therefore send it once.
  - **It never throws for a delivery failure.** It throws only for a malformed call, such as an unknown kind or a
    missing key or address.
- **The outbox and the sent ledger** live in the state store as values, under two prefixes per notice, named by a
  digest of the recipient's ID and a SHA-256 of the key (§9):
  - `ti:notify:pending:<hash>` holds what sending needs: the kind, the recipient, the data and the attempts so far.
  - `ti:notify:done:<hash>` is the ledger entry, written once the notice is sent or given up. It holds the kind, the
    recipient's ID, the outcome, the time and the provider's message ID. It holds no address and no rendered text.
  - `notify` reads both under a `KeyedLock` on the hash, and writes the pending entry only if neither exists.
  - The dispatcher lists only the pending prefix. That list stays as short as the backlog, while the done entries pile
    up for as long as they are kept.
  - Done entries expire after a retention period (default 180 days), which bounds the store and what an erasure has to
    find.
  - `forget( recipientID )` removes a person's queued notices and ledger entries, for an application's erasure path.
- **The dispatcher** drains the outbox in the background after each `notify` and on every job tick.
  - It works one message at a time, up to a cap per run.
  - A transient failure (a provider error) is retried after 1, 5, 15 and 60 minutes, five attempts in all.
  - A permanent failure (suppressed recipient, unverified sender) is recorded and not retried.
  - The daily limit stops the run until the next UTC day, and a rate limit for a minute. Neither counts an attempt.
  - **Delivery is at least once.** The done entry is written straight after the provider accepts, and the pending entry
    is removed after it. A crash between the provider accepting and the done entry being written resends one notice. A
    notice that informs tolerates that; a missing one is worse. A pending entry whose done entry exists is removed
    without sending.
- **Logging never carries an address or a rendered text.** A line names the kind, the recipient's ID and the outcome.
  This is the rule the first application already enforces with a test on `@` in its logs.
- **Deployment settings** live in the server configuration, under `notifications` and `jobs`. As every other setting
  does, each can be overridden from the environment (`web-config-env.js`):
  - `TI_WEB_NOTIFY_TRANSPORT`: `off` (the default), `log` or `cloudflare`;
  - `TI_WEB_NOTIFY_SENDER` and `TI_WEB_NOTIFY_SENDER_NAME`: the from address and its display name;
  - `TI_WEB_NOTIFY_REPLY_TO`: optional;
  - `TI_WEB_NOTIFY_RELAY_URL`: where the `cloudflare` transport posts. The cloudflare package sets it for every
    container, to `http://11.0.0.1/v1/mail/send`;
  - `TI_WEB_PUBLIC_URL`: the base for links in a notice. A notice is rendered outside any request, so the base cannot
    be taken from one.

### 3.2 Events and rules

- **`registerEvent( name, { attributes } )`.** It names an event the application raises and the attributes a rule may
  filter on, for example `task.created` with `task`.
- **`emit( name, { key, recipient, data } )`.**
  - It reads the rules, picks every enabled rule for the event whose filter the data passes, and calls `notify` for
    each. The notice's key is the rule's notice joined to the event's key, so two rules for the same notice still send
    it once.
  - It resolves to the number of notices queued. It never throws for delivery, and throws for an unregistered event.
- **The rules are a configuration document, `notifications`.** The framework defines its schema and its semantic
  validator, and the application supplies the default it seeds: `notifications.configDocument( { rules } )` returns
  the definition to pass to `registerConfigDocument`.
  - Its shape is `{ enabled, rules: [ { id, event, notice, when, enabled } ] }`.
  - `when` maps an attribute to the values that pass, for example `{ "task": [ "self-evaluation" ] }`. An empty or
    absent `when` passes everything.
  - The validator refuses a rule that names an unregistered event or notice, or an attribute its event does not
    declare.
  - The document is drift-tracked, so a release that changes the default rules reaches a seeded deployment through the
    drift panel, as any document does.
  - An application may also give it an editor on its configuration screen.
- **The rules are read from the store on every `emit`**, through the config service. At a few thousand events a
  cycle that costs less than a cache would, and an edit takes effect at once.

### 3.3 Transports

- **The interface:** `send( { from, to, subject, text, html, replyTo } )` resolves to `{ messageId }`, or rejects with
  `{ code, transient }`.
- **`log`** records that a notice would have gone, with no address. It is meant for development, tests and any
  environment that must not mail people.
- **`cloudflare`** POSTs the message to `TI_WEB_NOTIFY_RELAY_URL`, which on the platform is
  `http://11.0.0.1/v1/mail/send`, the channel the state service already uses. The Worker answers from its `send_email`
  binding (§3.5), so there is no token and no new allowed host.
- **`setNotificationTransport( transport )`** lets an application bring its own transport, such as SMTP or Microsoft
  Graph, without the framework depending on either.

### 3.4 Scheduled jobs

- **`registerJob( name, { every, at?, run } )`.**
  - `every` is `"hour"` or `"day"`; `at` is `"HH:MM"` in UTC, for a daily job.
  - `run( { now } )` is the application's code.
- **`runDueJobs( now )`** runs each job whose period has passed since its last run, one at a time. The last run is
  recorded in the store (`ti:jobs:last:<name>`). A failing job is logged and does not stop the others. A job that runs
  twice must be harmless, which `notify`'s keys make true for notices.
- **Two triggers, chosen by `TI_WEB_JOBS_TRIGGER`,** `internal` unless stated, or `off`:
  - **`route`:** `POST /_ti/jobs/run` runs the due jobs and answers `204`. It is outside sign-in, and meant to be
    reachable only from the Worker, which refuses the path from the internet (§3.5). The framework refuses to start a
    `route` trigger unless the deployment says it sits behind such a Worker (`TI_WEB_JOBS_BEHIND_WORKER=true`), so a
    directly exposed server cannot be made to run jobs by a stranger.
  - **The route is mounted after the start-up gate and before the session.** The gate means it waits for the
    application to finish starting. Being before the session means it needs no cookie and no CSRF token, which the
    Worker's request cannot carry.
  - **`internal`:** an in-process timer every 15 minutes calls `runDueJobs`, for a deployment without a Worker.
- **Both assume one instance,** as the lock already does.

### 3.5 cloudflare (`@ti-engine/cloudflare`)

- **`outboundByHost( { state, brokers, mail } )`.**
  - `mail: { binding: "EMAIL" }` answers `POST /v1/mail/send` on `STATE_ADDRESS` by calling the binding's `send`.
  - It maps a thrown `code` to `{ code, transient }`. `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`,
    `E_DELIVERY_FAILED` and `E_INTERNAL_SERVER_ERROR` are transient; the rest are permanent.
  - It accepts exactly one recipient per call.
  - Which senders and recipients are allowed is the binding's own configuration in the application's wrangler file,
    which is where a staging environment keeps itself from mailing real people.
- **`createWorker( { …, jobs: true } )`.**
  - `scheduled` also sends `POST /_ti/jobs/run` to the container through its binding, waking it if it sleeps, beside the
    existing sweep.
  - `fetch` answers `404` to anything under `/_ti/` from the internet before the request reaches the container,
    without case and with or without a trailing slash, since Express routes match either way.
  - How often the cron fires stays in the application's wrangler file.
- **The template's `wrangler.jsonc`** gains a commented `send_email` binding and the cron line.

## 4. What an application does

1. Registers its events and its notices, with label keys in every language it ships, and the `notifications`
   document with its default rules.
2. Calls `emit` where something happens that a rule may want to hear about, after the write that made it happen has
   settled. It does not call it under a write lock.
3. Registers a job for anything that becomes due with the passing of time, such as an approaching deadline.
4. Sets the environment (transport, sender, public URL, trigger) and, on Cloudflare, the `send_email` binding and the
   cron.
5. Calls `forget( id )` from its erasure path, if it has one.

The application decides what an event means and who receives it. The rules decide whether it becomes an e-mail.

## 5. Rejected

- **SMTP or `nodemailer` in the framework now.** No consumer needs it yet, and it would add a dependency and a socket to
  every application. The transport seam lets one be added later, framework-wide or per application.
- **The REST API with an API token from the container.** That needs a secret in the container and a new allowed host.
  The binding is authenticated by being a binding, as the state service already is.
- **Cloudflare Queues for the outbox.** That adds another binding and another bill for a few thousand messages a month.
  The state store already gives an ordered, durable outbox.
- **Detecting new tasks by comparing snapshots on a timer only.** That leaves a delay of up to a day, or wakes the
  container every few minutes. Notices raised on the write, with a daily pass as a safety net, give both promptness
  and completeness.
- **A digest.** One summary per person per day was offered; the first application chose a notice per task. The API
  does not prevent a digest kind later.

## 6. Risks

- **Email Service is Beta.** The transport seam is the mitigation: another transport is a configuration change.
- **The daily quota of a new account.** The dispatcher stops at the limit and resumes the next tick. The first cycle's
  opening day is the burst to watch.
- **No data-residency statement** for Email Service, where the application's own data is held in the EU. The
  mitigation is content: a notice names the task and its date, and links to the application, never more.
- **At-least-once delivery** can repeat one notice after a crash (§3.1).

## 7. Tests and delivery

- **web-framework:**
  - rules: matching, filters, disabled rules, and the validator's refusals;
  - rendering per language;
  - idempotency under two concurrent `notify` calls on one key;
  - retries and their limits;
  - the daily-limit stop;
  - `forget`;
  - jobs that are due and not due;
  - the `route` trigger refused without `TI_WEB_JOBS_BEHIND_WORKER`;
  - no `@` in any log line.
- **cloudflare:** the relay's mapping of every documented error code, against a fake binding; `scheduled` calling the
  container; `fetch` refusing the reserved path.
- **Docs:**
  - TypeScript declarations regenerated;
  - README sections for notifications and jobs;
  - the skill updated;
  - CHANGELOG sections for web-framework 1.52.0 and cloudflare 0.5.0.

## 8. Settled while designing

- **`TI_WEB_PUBLIC_URL` is a setting of its own.** The framework derives a base URL only from a request
  (`getBaseUrl`), and a notice raised by a job has none. The OpenID callback holds the public origin, but it belongs to
  one provider and is absent under local sign-in.
- **Done entries are kept 180 days**, long enough to span a cycle.

## 9. Settled while implementing

- **Values, not JSON documents.** The outbox, the ledger and a job's last run are string values. D1's state service has
  no way to delete a document: `/v1/values/delete` reaches `state_values` alone, where Redis's `DEL` removes any key.
  An outbox written with `setJSON` could be emptied on Redis and never on D1. A value also takes its expiry in the write
  that stores it. The in-memory test store now behaves like D1 here, so a component relying on deleting a document
  fails in the tests. That D1 cannot delete a document at all is core's to decide, and is not changed here.
- **The recipient is part of the key.** Entries are `ti:notify:pending:<16 hex of SHA-256 of the ID>:<SHA-256 of the
  key>`. `forget( id )` then matches one prefix and reads nothing, where a key of the notice alone meant reading every
  ledger entry of the retention period to find a person's. Digests, so an ID or key holding `*`, `?` or `[` cannot
  widen the match.
- **A rate limit pauses the run, like the daily limit.** Counted as an ordinary transient failure, one rate limit would
  have spent an attempt of every queued notice in a single pass.
- **A recipient ID holding `@` is refused.** The ID is what the logs and the ledger name, so the rule that no line
  carries an address holds whatever an application uses as an ID.
- **`internal` is the default trigger.** A deployment that registers a job and sets nothing still runs it; the timer
  starts only when there is a job or a transport, and never holds the process open.
- **The relay answers with a status that says the outcome:** `200`, `503` for a transient code, `422` for a permanent
  one, `400` for a malformed message and `503 E_MAIL_BINDING_MISSING`, permanent, for a deployment without the binding.
- **No application seams on `TiWebAppManager`.** An application imports `/notifications` and `/jobs` directly; the
  manager only registers the `notifications` document, as it does any other.
