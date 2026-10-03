# Design — choosing the interface language on the sign-in screen

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Packages** | `packages/web-framework` |
| **Status** | Implemented in web-framework 1.48.0; implementation log in §6 |
| **Version target** | web-framework `1.48.0` (stacked on `1.47.0`, CA-406) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-410`](https://belleal.youtrack.cloud/issue/CA-410) (framework), [`CA-411`](https://belleal.youtrack.cloud/issue/CA-411) (the first application to adopt it), under `CA-10` |

---

## 1. Why

Boris, 2026-10-03, about competence: "Choosing a language on login is actually a nice feature — I think we can do it."
Design's sign-in card for that application has an EN/BG switch in its footer. Nothing in the framework could back it.
A visitor's language was settled before they arrived, and the framework had no notion of a visitor choosing one.

What happens today, read from the code:

- **A session's language is fixed at sign-in** (`resolveSessionLanguage`): `user.language`, else the service
  configuration's `language`, else the deployment's (`TI_LOCALIZATION_LANGUAGE`). **No sign-in sets
  `user.language`.** The local `User` is built with an ID, username, e-mail and name, and the OpenID identity is
  resolved from the same four, so every session gets the configured language.
- **Before sign-in there is no session language.** `/app/config` and `/app/labels/:hash` fall back to the deployment's
  catalogue, so the sign-in screen is always in the deployment's language.
- **A served fragment is bound to one file when it is registered,** and `transformHtml`, the one seam around it,
  receives no session and no language. An application that serves screens in two languages has no way to choose
  between them per request. competence binds its User Guide and `<html lang>` to the deployment language at startup
  for exactly this reason, and says so in its code.
- **Immutable fragments share one content address** (`fragment-fingerprint`, CA-183). A screen that differs by
  language cannot be immutable under it. The address would not change with the language, so a browser that switched
  language would serve the other language's copy from its own cache, for good.

## 2. Decisions

1. **The languages a deployment offers are configured,** as `languages` in the server configuration, overridable
   with `TI_WEB_LANGUAGES` (comma-separated). Each code is checked against core's `localizationLanguage` at start. A
   code core does not know is left out, with a warning at start: a choice is a convenience, and a deployment that
   could not start over a typo in its switch would cost far more than the missing entry. **Absent, only the
   deployment's language is offered.** The switch is not drawn and the cookie is ignored, so a deployment that
   configures nothing behaves exactly as before.
2. **The visitor's choice is a cookie, `ti-language`, set by `GET /language/:code`,** a plain link, before or after
   sign-in.
   - **Why a link:** it needs no script, so it is CSP-clean and keyboard reachable with nothing to wire.
   - **Why this is safe:** it is idempotent. A forged one can only change somebody's language, which is the whole
     effect of the real one.
   - **The cookie:** `Path=/`, a year, `SameSite=Lax`, `HttpOnly`, and `Secure` on a secure request. An unoffered
     code is refused with a redirect that changes nothing.

   Rejected:
   - **A POST with a CSRF token.** The token would have to be minted for the sign-in screen, and minting creates a
     session and two cookies for every anonymous visit, which the framework avoids on purpose (see `transformHtml`).
   - **A cookie written by script.** The page has to be rendered again by the server anyway, so the language reaches
     the `<html lang>` and the label catalogue's address, and a script-written cookie cannot be `HttpOnly`.
   - **A query parameter carried through the OpenID round trip.** It would be forgotten on the next visit.
3. **One function decides the request's language** (`resolveRequestLanguage`): a signed-in session's language, else
   the cookie's when offered, else the configured, else the deployment's. Everything that used `session.language` for
   a request that may be anonymous asks it instead: the configuration's label catalogue, the catalogue fallback, the
   rendered views.
4. **Sign-in takes the choice first:** the cookie (when offered), then `user.language`, then the configured language,
   then the deployment's. The person at the keyboard chose it a moment ago. A claim or a configured default is older
   and less specific.
5. **A signed-in session that follows the link switches at once:** the cookie and `session.language` both change, and
   the redirect reloads the application in the new language. The two can never disagree. A cookie that changed while
   the session kept its language would surprise the next sign-in, not this one. The framework draws no switch inside
   the application. The route supports one, and an application may link to it.
6. **The request's language reaches what is rendered:**
   - `transformHtml` receives it as `options.language`;
   - the framework fills `{ti-language-placeholder}`, so `index.html` writes `<html lang>` per request;
   - a fragment's `path` may contain `{language}`, filled per request. A language whose file is missing falls back to
     the deployment language's file, then to English, core's own default, with one warning per fragment and language,
     because a half-translated deployment should lose the translation, not the screen. The English step is for a
     deployment whose own language has labels and no translated screens yet.
7. **Immutable fragments get one content address per language.** The version is computed over the markup each
   language renders, so the address changes with the language and a browser keeps one copy per language. Rejected:
   one version over every language's markup. It would move whenever any language changed, and it would still give
   both languages the same URL.
8. **The switch is on the sign-in card,** in a footer row under the methods, drawn by the server into
   `frame-login.html` only when more than one language is offered.
   - Each language is a link carrying `lang` and `hreflang`.
   - Its visible text is the code, uppercased ("EN", "BG"), as Design draws it.
   - Its accessible name is the language's own name, read from `interface.language-name` in that language (core's
     enum carries English names only).
   - The current one carries `aria-current="true"`.

   The framework gives it a neutral look; an application styles it.
9. **Not done:**
   - No profile field for a language. The choice lives in the browser, which is where it was made.
   - No language switch inside the application's shell. Decision 5 is what one would link to. The first adopter's
     is [`CA-412`](https://belleal.youtrack.cloud/issue/CA-412).
   - **The offer is not checked against the application's labels**, only against core's codes. A code core knows
     and the catalogue lacks is offered, and every label then reads core's not-found placeholder (measured through
     the first adopter with `de`). Checking it needs core to say which languages a catalogue carries without
     comparing against that placeholder: [`CA-413`](https://belleal.youtrack.cloud/issue/CA-413).

## 3. Interfaces

| Seam | Before | After |
| --- | --- | --- |
| Server configuration | `language` | `language`, and `languages` (array of codes) / `TI_WEB_LANGUAGES` |
| Routes | — | `GET /language/:code`, unprotected |
| `TiWebAppManager#transformHtml( html, options )` | no language | `options.language` |
| `TiWebAppManager#processDataRequest( session, view, options )` | `options` without language | `options.language`; `config` takes its catalogue from it |
| `TiWebAppManager#assembleHtmlView( session, paths, route, options )` | — | `options.language` |
| Fragment `path` | a file | a file, `{language}` filled per request |
| Markup tokens | `{ti-nonce-placeholder}`, `{ti-csrf-placeholder}`, `{ti-title-placeholder}` | and `{ti-language-placeholder}`, `{ti-language-switch-placeholder}` |
| Labels | — | `interface.language-name`, `interface.default.login.language-switch` |

## 4. Verification plan

- **Unit tests:**
  - the request language's order;
  - sign-in's order;
  - the route: an offered code, an unoffered one, the cookie attributes, the signed-in switch;
  - the catalogue an anonymous visitor gets;
  - `{language}` paths and their fallback;
  - one address per language, and a stale address served revalidating;
  - the switch's markup, absent with one language;
  - configuration validation.
- **Chromium**, through an application that adopts it:
  - pick BG on the sign-in screen, see the screen in Bulgarian;
  - sign in, and the application is in Bulgarian, the guide included;
  - sign out, and the choice is remembered;
  - pick EN, sign in again, all English, with no Bulgarian copy served from the cache.

## 5. Order of work

1. web-framework 1.48.0, this record. It is stacked on 1.47.0, so the releases publish in order.
2. The adopting application, once 1.48.0 is on npm. It configures its languages, gives its guide fragments
   `{language}` paths, writes its `<html lang>` from the token, and styles the switch.

## 6. Implementation log

- 2026-10-03 — record written; CA-410 and CA-411 opened.
- 2026-10-03 — implemented in web-framework 1.48.0. Two decisions changed in implementation:
  - **A typo no longer fails the start (decision 1).** A deployment that cannot start over its switch was judged
    worse than one missing entry.
  - **`{language}` falls back to English last (decision 6).** The first adopter's guide tests covered a deployment
    whose language has labels but no chapters, and the deployment-language fallback alone left its Help screens
    with no file.

  Tests:
  - `test/language-choice.test.js` (27) and the sign-in cases in `test/web-handlers.session-language.test.js`;
  - 22 mutations tried, all caught;
  - the sign-in screen's label sweep now exempts a lone `{ti-…-placeholder}` token, and its self-check proves a token
    beside words is still caught.

  Verified end to end in Chromium through the first adopter:
  - a first visit is in English;
  - EN → BG re-renders the sign-in screen in Bulgarian, with an `HttpOnly`, `SameSite=Lax` cookie for 365 days;
  - signing in gives Bulgarian, the guide included;
  - a visit without a session remembers the choice;
  - EN and a sign-in give English, with the guide at another address (`3fedcb4574d1` against `08145ea01c13`);
  - `/language/bg` while signed in switches at once.
- 2026-10-03 — the first adopter's documentation pass measured that a code core knows and the application's labels
  lack (`de`) is offered, and renders every label on the sign-in card as core's not-found placeholder. Recorded under
  decision 9 and in the README; the check is [`CA-413`](https://belleal.youtrack.cloud/issue/CA-413). The README's
  `{language}` fallback said the deployment's language only, and now says English last, as decision 6 does.
