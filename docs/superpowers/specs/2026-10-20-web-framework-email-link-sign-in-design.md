# Design — Sign in with a link sent by e-mail

| | |
| --- | --- |
| **Date** | 2026-10-20 |
| **Packages** | `packages/web-framework` |
| **Status** | Asked for by Boris on 2026-10-20 ("Yes, let's do that"). Implemented in web-framework 1.57.0. |
| **Version target** | web-framework `1.57.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-537`](https://belleal.youtrack.cloud/issue/CA-537), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11) |

---

## 1. Why

The framework signs people in three ways: a local username and password, Google, and Microsoft. Each assumes the
person already has an account the deployment trusts: a record in the users file, or a work or personal account with one
of two providers.

An application whose users are the general public has neither. VEDA Education's X-ray is used by parents, who sign in
to see their child's report. Most have a personal mailbox and no reason to create a password for one service, and many
do not sign in to anything with Google. Asking them for a password, or sending them to a provider's consent screen,
makes starting harder for exactly the people the application is for.

A link sent to the address they already read is the sign-in such an application needs. Nothing in it is specific to one
application, so it belongs in the framework, beside the other three methods.

## 2. What exists

- **`AuthManager`** knows three methods, each with an `authenticate` and an `authorize` step. A method that is enabled
  but cannot work is dropped at start-up with a warning, as an OpenID provider without a client ID is.
- **`authenticationHandler`** serves `GET` and `POST /login/:method`. A sign-in ends in `regenerateAndSaveSession`,
  which runs the application's `augmentSession` (throwing refuses the sign-in) and the `admin` allowlist.
- **`NotificationService`** sends e-mail through the deployment's transport (`off`, `log`, the Cloudflare relay, or an
  application's own). It renders a registered notice from label keys, with the deployment's `publicUrl` as the base of
  its link. Notices go through an outbox and a ledger, with retries; `sendTest` sends one at once, past both.
- **The state store** keeps values with an expiry, and `deleteValue` answers whether it removed something: Redis's
  `DEL` count, D1's `changes > 0`. That is what makes a token spendable once across instances.
- **The login page** gates its markup to the enabled methods with HTML-comment markers, and every string on it goes
  through `x-text-label` with its English as the fallback.

## 3. The design

### 3.1 The method

A fourth method, `email-link`, enabled like the others (`auth.enabledMethods`, `TI_WEB_AUTH_METHODS`). Its settings:

```jsonc
"auth": {
  "emailLink": {
    "lifetimeMinutes": 15,        // how long a link works
    "allowedDomains": [],         // as an OpenID provider's: empty admits any domain
    "hourlyLimitPerAddress": 5,   // links one address may be sent in an hour
    "hourlyLimitPerClient": 30    // links one client address may ask for in an hour
  }
}
```

`TI_WEB_AUTH_EMAIL_LINK_ALLOWED_DOMAINS` (comma-separated) replaces `allowedDomains`; a value naming no domain leaves
it, as an empty OpenID list variable does, since an empty list admits every domain.

The sign-in page is `/`, where the link lands and a request is answered: that is where the framework sends every sign-in
failure too (`/?error=`), so a page of its own would split the two.

### 3.2 Asking for a link

`POST /login/email-link` with `email` (and the CSRF token, as every form):

1. The address is trimmed and lower-cased, and checked against a pattern that runs in linear time: one `@`, no
   whitespace, control character or `<>",;:()[]\`, a domain of at least two labels. At most 254 characters.
2. The client's address and then the e-mail address are counted, each in a one-hour window that starts with the first
   request (`{ count, resetAt }`, a value expiring at `resetAt`). Over either limit, nothing is sent.
3. An address outside `allowedDomains` is sent nothing, and answered as if it had been.
4. Otherwise a token of 32 random bytes is made, and stored under the SHA-256 of the token, never the token itself,
   with the address, the language the request was answered in, and the moment it expires. The value expires then too.
5. The `sign-in-link` notice is sent at once, past the outbox and the ledger, through a new
   `NotificationService#sendNow`. Its link is `<publicUrl>/#email-link=<token>`.
6. The browser is sent back to `/?email-link=<outcome>`: `sent`, `limited`, `invalid-address` or `unavailable`
   (the store or the transport failed). A failure that certainly sent nothing — raised before the transport was asked,
   or the relay's own refusal — deletes the token and gives back the request's counts. One that may have followed a
   delivery, as a relay timeout may, keeps both: the e-mail may still arrive, and a slow relay is no way past a limit.

**The answer never says whether an address may sign in.** A refused domain reads `sent`, like an admitted one. Whether
the application will accept the person is decided at the end (§3.4), when they hold a link. The time the answer takes
can still tell an admitted domain from a refused one, since only the first waits for the transport; that reveals the
deployment's domain list, which is policy, never whether a person has an account.

### 3.3 Following the link

The token travels in the URL's **fragment**, which a browser never sends to a server. So it is in no access log, no
proxy log and no `Referer`. The login page reads it, removes it from the address bar, and shows one button,
*Continue*. That button posts the token, with the page's own CSRF token, to `POST /login/email-link`.

Before showing the button, the page asks the server which address the link signs in, without spending it
(`POST /login/email-link` with `{ token, peek: true }` as JSON, answered by `TiWebServer#peekEmailLink`), and shows it: "You are signing in as …", with "Not you?
Use another address" beside Continue. Otherwise anybody could ask for a link to their own address, send it to someone
waiting for theirs, and have that person continue into the sender's account and type their child's details there. A
link that can no longer sign anybody in goes straight back to the address form, saying so.

The extra click is the point. Mail scanners — Microsoft Defender's Safe Links, Gmail's link checks, antivirus gateways
— fetch a link before the person sees it, and some run its scripts. A link that signed in on `GET`, or a page that
posted the token by itself, would be spent by the scanner, and the person would arrive at an expired link.

### 3.4 Spending it

1. A token that is not 43 base64url characters is refused without a store read.
2. The entry is read, then **deleted**; only the request whose delete removed it may go on. Two requests racing with
   the same token both read it, and exactly one deletes it.
3. An entry past its `expiresAt` is refused (the store's own expiry is a backstop, not the check), and so is an address
   whose domain the list no longer admits: the list can be narrowed while a link is out, as an OpenID sign-in's domain
   is checked when it completes.
4. The user is `{ userID: "email:" + the first 32 hex digits of the address's SHA-256, username: address, email:
   address, language }`. The user ID is not the address because the framework writes user IDs to its log.
5. The session is regenerated exactly as for the other methods: `augmentSession` may refuse, the `admin` allowlist
   applies, the session language follows the same rules.

A token that is malformed, unknown, already spent or expired is refused by `authorize` with
`E_SEC_INVALID_AUTH_TOKEN`, and the handler answers that refusal, read from `authorize` alone, with a `303` to
`/?email-link=expired`, which the e-mail link's block explains: "Sign-in failed" would have the person try the same
link again. Every other refusal goes the way the other methods' do, a `401` the error handler turns into
`/?error=<code>`; so an application's `augmentSession` refusal reads "Sign-in failed" whatever code it raises.

### 3.5 Fail closed at start

The method is dropped, with a warning naming the reason, when sending cannot work: no transport, the `log` transport
(which delivers nothing, so every request would read `sent` and no link would ever arrive), no `publicUrl` (the link
would have no address), or the notice's subject or text not found in the deployment's language. Sending is checked
again on every request, since an application may switch the transport.

### 3.6 What is logged

Never an address and never a token. A line names the client or the address by the first 16 hex digits of its
HMAC-SHA-256 under a key made for each process: a plain SHA-256 of a network address is reversed by hashing all 2^32
IPv4 addresses, and of an e-mail address by hashing a list of guesses (CodeRabbit on the PR). A subject matches across
one process's lines, not across restarts. The user ID cannot be keyed that way, since it must be the same on every
instance and at every sign-in, so it is pseudonymous: an address someone guesses can be confirmed against it.

### 3.7 The login page

- An e-mail form, inside `<!--ti-auth-method:email-link-->`, above the local form.
- An *or* divider between the two forms, shown only when both are enabled (`<!--ti-auth-form-divider-->`). The
  existing *or continue with* divider now shows when **a** form and a provider are both enabled.
- A component, `tiLoginEmailLink`, with three steps: asking for the address (with a message for `limited`,
  `invalid-address` or `unavailable`), the link sent, and continuing from a link. The address form is the one shown
  before the script runs, so the page works without it.
- The shell takes a link's token out of the address bar as it starts, before any frame can push another address, and
  keeps it for the block to take (`tiApplication.takeSignInLink`). In a browser already signed in, `/` shows the
  application, so nothing takes it: the shell then says to sign out and open the link again.
- Its strings are `interface.default.login.email*` and `interface.default.login.or`, in English and Bulgarian. The
  notice's are `interface.notice.sign-in-link.{subject,text}`. An application carries those it wants in its catalogue,
  as for every framework string; the notice's two are required (§3.5).

## 4. Rejected

- **Signing in on `GET`.** Spent by mail scanners (§3.3).
- **A code to type instead of a link.** It works across devices, but six digits need an attempt limit per address to be
  safe, and typing a code from one app into another is harder on a phone than tapping a link. It could be added beside
  the link later.
- **Binding the link to the browser that asked for it.** Safer against a forwarded e-mail, but a phone's mail app opens
  links in its own browser, which has none of the asking browser's cookies, so the link would fail for many of the
  people this method is for.
- **Queueing the e-mail through the outbox.** A link sent after the outbox's first retry, a minute later, may arrive
  past its lifetime, and the outbox would hold the token in the store for its whole retention. One attempt, and the
  person asks again.
- **An application hook deciding at request time who may be sent a link.** The domain list covers an organization, and
  `augmentSession` decides at the end. A hook can be added when an application needs one.

## 5. Not done

- **The `log` transport sends nothing**, so a deployment on it cannot follow a link. A deployment that wants to try the
  method locally supplies its own transport with `setTransport`, in its constructor.
- **The client limit counts `request.ip`**, which under `trust proxy` is what the proxy in front reports. Behind a
  proxy that passes a client's own `X-Forwarded-For` through, a client can choose its address; the per-address limit
  still holds.
- **The counters are not atomic across instances.** Two instances can each admit a request the other has counted; the
  limit can be exceeded by the number of instances, not more.
- **The per-address limit can be spent by someone else.** It is what keeps an address from being flooded with links,
  and its price is that whoever asks five times in an hour holds that address's sign-in for the rest of the hour. A
  link already received still works. Counting per address and client together would end that and reopen the flood;
  a challenge on the form (Turnstile) is the remedy for both, and belongs to the application.
- **The client limit trusts `request.ip`.** On Cloudflare the Worker sets `X-Forwarded-For` to the address Cloudflare
  connected to (`cloudflare/worker/forwarding.js`), which a client cannot choose; elsewhere it is whatever the proxy in
  front reports, or the client's own header with no proxy at all.

## 6. What implementation settled

- **`NotificationService#sendNow`** is the public form of what `sendTest` did: one attempt, past the outbox and the
  ledger. It renders with the document's edited texts, or the shipped ones when the document cannot be read. The two
  share one private send. A getter, `publicUrl`, lets the method check it has a base for the link.
- **The method's rules live in `components/email-link.js`** (`EmailLink`), which `AuthManager` constructs when the
  method is enabled. `authenticate( EMAIL_LINK, { email, client, language } )` resolves `{ redirectTo, outcome }` for
  every outcome, a failure to send included; `peekEmailLink( token )` answers the address without spending it;
  `authorize( EMAIL_LINK, url, { token } )` spends the token.
- **Measured in Chromium** against a real server on a local D1 state service: the link lands with its token in the
  fragment, the address bar loses it at once, the page shows the address it signs in, `/me` is still refused before
  Continue, the session is the address's after it, a second use goes back to the address form saying the link has
  expired, and a sixth request in the hour shows the limit.
- **The review pass** (the `code-review` skill at `high` on the whole diff) found ten things. Fixed: a configurable
  sign-in page that worked only as `/` (removed); `log` passing the start-up check; an empty domain variable widening
  the list; the domain not checked again when a link is spent; the confirm step not saying which account it signs in
  (the address is shown now); and the sign-in's last steps copied into a third place (now one `signInUser` for every
  method). Declined, with the reasons in §3.2 and §5: the client limit's trust in `request.ip`, the per-address limit
  spendable by others, the counters across instances, and the timing of a refused domain.
- **A second review pass** on the result found six more, all taken: a double click on Continue posted the spent token
  again and showed "expired" over a sign-in that had worked (both forms now hold their button once sent, and let go on a
  page Back brings back); a link opened in a browser already signed in was read by nothing, so its token stayed in the
  address bar and the history (the shell now takes it out and says to sign out first); the peek rode on `authenticate`
  with a second answer shape (now `peekEmailLink`, which an application counting sign-in attempts does not see); the
  OpenID callback's `delete session.oidc`, a no-op after express-session's `regenerate`, took a parameter of its own
  in the shared completion (now one line in it); the domain list was normalized twice; and the package's changelog
  named the application.
- **A third pass** found the signed-in set-aside racing the shell's own loads (the first frame pushes its address, and
  the notification bar may not be there yet when `/me` answers: the token is now taken out as the shell starts, and the
  notice waits for the bar); a Continue step brought back by Back offering a spent token (it returns to the address
  form now); an outage using up the hourly budget (a request that sent nothing gives its counts back); the page reading
  the shared code 2000 as an expired link wherever it came from (the handler now answers a refusal from `authorize`
  with `?email-link=expired`, and the error box is as it was); the public `TiWebServer#authorize` note not naming the
  exception; and small duplicates and inline shapes (`TiEmailLinkRequest`, `TiEmailLinkRedeemed`). Declined: a store
  failure after the token is spent burns the link (that outage fails every sign-in, and un-spending a token would make
  "once" depend on what follows it); four store calls in a row before the send (a request made rarely, and the order
  is what keeps a client over its limit from counting against the address); and sharing a one-line hash helper across
  modules.
- **A fourth pass** found the third round's refund too generous and the original deletion too eager: a relay timeout
  may follow a delivery, so refunding it let a slow relay be a way past the limits, and deleting its token left an
  e-mail that arrived with a link that could not work. Both now apply only to a failure that certainly sent nothing.
  It also found a Continue step left by another link and brought back by Back losing its unspent link (now only a
  press of Continue drops it), buttons held for good when a request was stopped (they let go after eight seconds), the
  expired-link redirect skipping the log every other refused sign-in gets (DEBUG, without the token), a stale changelog
  line, and the limit key and expiry written twice. Declined: making `notify` itself queue a message until the
  notification bar exists, which would change every early notice in the framework, not this one.

