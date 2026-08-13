# Design — User Profile & application About screens

| | |
|---|---|
| **Date** | 2026-08-13 |
| **Packages** | `packages/web-framework` (the reusable screens), `packages/competence` (the content) |
| **Status** | Implemented |
| **Version targets** | web-framework `1.20.1` → `1.21.0` (minor); competence `3.17.0` → `3.18.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-99`](https://belleal.youtrack.cloud/issue/CA-99) (subtask of `CA-10` Design System & UX) |

---

## 1. Background & motivation

The sidebar user flyout menu offers exactly one destination today — **Your profile** (`/app/profile`) — and it lands on a fragment that has been a two-line placeholder since the shell was written:

```html
<div>
    <span>Profile</span>
</div>
```

There is no **About** screen at all, so nothing in a running instance tells you which version of the application you are looking at. For a containerized app that ships as `:edge`, `:latest` and `:X.Y.Z` tags and deploys to a scale-to-zero Cloud Run environment, "which build is this?" is a question an operator, a tester and a support conversation all need answered without shell access.

Both screens are the same *kind* of screen: read-only facts, grouped into labelled sections. That is the reuse opportunity — build the screen once in the framework, and let each application supply only what the facts are.

## 2. Goals & non-goals

**Goals**

- A **Profile** screen showing the signed-in user their own information, read-only.
  - web-framework baseline: the account facts the framework actually knows (name, username, email, language, roles).
  - competence: the same information the Employee Management detail panel shows — personal, career, organization, employment — non-editable.
- An **About** screen showing the running application's identity: name, version, release date, description, license, homepage, and the ti-engine component versions.
  - web-framework baseline: resolved from the consuming app's `package.json` plus env overrides.
  - competence: the baseline plus app-specific entries.
- Both reachable from the **same user flyout menu**.
- The screens themselves — fragment, Alpine component, CSS — live in **web-framework** and are inherited by every consumer, including `tester` and any future app.

**Non-goals**

- **No editing.** Neither screen writes anything. Profile is a read-only mirror; changing employee data stays in Employee Management, where it is scoped and audited.
- **No new identity fields.** Profile renders what already exists; it does not add avatars, phone numbers, or preferences.
- **No settings screen.** The flyout's "Settings" entry was deliberately removed earlier (it pointed at a generic admin placeholder); this design does not bring it back.
- **No client-side localization of the content.** Section titles and item labels are resolved server-side, where the session language and the label catalogue already are.

## 3. Verified facts (the contract we build against)

1. **Fragments are registered by identifier, resolved by `Accept`.** `webAppHandler` routes `GET /app/:view` to `assembleHtmlView` for `Accept: text/html` and to `processDataRequest` for `Accept: application/json` (`components/web-handlers.js`). The same view name can therefore serve both the screen and its data, which is what `profile` and `about` do.
2. **`/app/profile` and `/app/about` are protected.** The unprotected list covers `/`, `/static/…`, `/.well-known/…`, `/not-found`, `/app`, `/app/enter`, `/app/config`, `/logout` and `/login/:method` — no other `/app/:view`. Neither new data view is public.
3. **`/app/config` *is* public.** That is why the application descriptor is **not** carried in the config payload: version and build facts would then be readable before sign-in.
4. **A consuming app loads exactly one label catalogue.** `TI_LOCALIZATION_LABELS_PATH` is a single (comma-separated) path, and competence sets it to its own `competence-labels.json` — the framework's `web-server-labels.json` is *not* also loaded. A framework fragment therefore cannot assume any framework label key resolves in a consuming app.
5. **`x-text-label` falls back to the element's initial content.** `configureDirectiveTextLabel` captures `element.textContent` (or the target attribute's current value) before the first effect and passes it to `getLabel` as the fallback. Inline English in the fragment is thus the correct safety net for fact 4.
6. **Alpine runs in CSP mode.** No inline `style="…"`, no optional chaining, and no `Array`/`Object` inside template expressions. The existing screens obey this; the new ones must too.
7. **`session.user` is a plain object by the time a handler sees it.** `userInformationHandler` deep-clones `request.session.user`, and competence's `augmentSession` writes `employeeID` and derived `roles` onto it.
8. **Employee data is reachable without a role gate.** `dataManager.instance.fetchEmployee( employeeID )` is unguarded; the MANAGER/SUPERVISOR check lives in `#loadEmployeeDetail`, not in the store. A self-profile read therefore does not have to borrow a management-scoped loader.

## 4. Decisions

### 4.1 The screen lives in the framework; the app supplies a descriptor

Two virtual methods on `TiWebAppManager`, both returning a Promise:

```js
getProfileInfo( session )       // → { identity, sections }
getApplicationInfo( session )   // → { name, version, releaseDate, …, sections }
```

`processDataRequest` dispatches `view === "profile"` and `view === "about"` to them. A subclass overrides one or both; everything else — the fragment, the Alpine component, the CSS, the loading and error handling — is inherited untouched.

**Why a descriptor rather than an overridable fragment.** A consuming app *can* already shadow any fragment by dropping a same-named file in its own static path (`#locateStaticFile` searches consumer paths first). Doing that for these screens would mean every app re-implementing the same layout, the same empty state, the same error handling — and drifting. A descriptor keeps one renderer and makes the app's job a pure data question.

### 4.2 The descriptor is display-ready

Every string in the descriptor is already localized and already formatted. The server has the session language and the label catalogue; the client has neither in a form that would let it resolve an arbitrary key reliably (fact 4). This also mirrors what competence already does for the Employee Management projections, which resolve role-family and specialization names server-side.

```js
{
    identity: {
        name: "Geatrks Frkats",
        subtitle: "Software Engineering · Backend · Platform Engineering",
        caption: "geatrks.frkats@example.com",
        avatarSeed: "42",                                  // → tiToolbox.generateAvatarStyle
        badge: { text: "R2", tone: "R" },                  // optional level pip
        tags: [ { text: "Active", tone: "success", dot: true },
                { text: "42", mono: true } ]
    },
    sections: [
        { title: "Personal",
          items: [ { label: "First name", value: "Geatrks" },
                   { label: "Corporate email", value: "…", wide: true } ] }
    ]
}
```

Item flags are deliberately few and presentational-only: `wide` (span the grid), `mono` (monospaced value), `muted` (render as a hint). An absent/empty `value` renders the em-dash placeholder, so a section never has to be conditionally assembled to avoid blanks.

### 4.3 Application info comes from the manifest, with env overrides

`components/application-info.js` is a pure module in the same spirit as `web-config-env.js`:

- `buildApplicationInfo( { manifest, env, components, runtime } )` — pure and unit-tested. Normalizes a `package.json`-shaped manifest into the descriptor, applies `TI_WEB_APP_NAME`, `TI_WEB_APP_VERSION` and `TI_WEB_APP_RELEASE_DATE`, derives a display name from the package name when none is given, and normalizes the author/license into a copyright line.
- `readApplicationManifest( directory )` — the one impure function; reads `package.json` from the process working directory and returns `{}` rather than throwing when it is absent or malformed. An About screen must never be the reason a request 500s.

**Why a `releaseDate` at all.** `package.json` has no such field, and deriving one from the changelog is fragile. The manifest may carry an explicit `releaseDate`, and `TI_WEB_APP_RELEASE_DATE` lets an image stamp its own build date at build time — which is the case that actually matters for a container.

### 4.4 Runtime facts are admin-only

Node version, platform, instance name and instance ID are useful for support and meaningless to everyone else. They are added to the descriptor only when the session holds the `admin` role, so an ordinary signed-in user is not handed the runtime's version numbers. This is a small hardening choice, not a security boundary — the screen is behind authentication either way.

### 4.5 Profile is self-scoped, always

`getProfileInfo` reads the session's own identity and nothing else. There is no `?employeeID=` parameter and no manager view: looking at someone else's record is what Employee Management and the Scores screen are for, both of which already carry their own scoping rules. Keeping the parameter out means there is no scope check to get wrong.

In competence the read is therefore ungated (fact 8) — an employee who cannot open Employee Management can still open their own profile. When the session carries no employee identity, or the record has been removed, the screen degrades to the framework's account-level sections rather than erroring.

## 5. Implementation

### 5.1 web-framework

| File | Change |
|---|---|
| `components/application-info.js` | **New.** `buildApplicationInfo` (pure) + `readApplicationManifest`. |
| `bin/web-app-manager.js` | Registers the `about` fragment; adds the `getApplicationInfo` / `getProfileInfo` virtuals and the two `processDataRequest` branches, the `buildSessionIdentity` / `buildAccountSections` helpers a subclass can reuse, `buildComponentsConfig` (the default user menu), and `resolveLabel` (§6, the one-labels-path fallback). |
| `bin/static/fragments/frame-profile.html` | **Replaced.** Identity card + generic section renderer. |
| `bin/static/fragments/frame-about.html` | **New.** Application hero + generic section renderer. |
| `bin/static/fragments/components/component-sidebar.html` | Adds the user flyout to the default sidebar footer, so the baseline screens are reachable out of the box. |
| `bin/static/scripts/ti-framework.js` | `tiScreenProfile` / `tiScreenAbout` Alpine components plus the shared descriptor normalizers (placeholder, class flags, href allowlist). |
| `bin/static/scripts/ti-framework.css` | `.ti-identity-*` and `.ti-info-*` primitives (reusable, not screen-specific). |
| `bin/localization/web-server-labels.json` | `interface.profile.*` / `interface.about.*` / `interface.topbar.*` / `interface.user-menu.*` defaults. |
| `test/application-info.test.js` | **New.** Manifest normalization, env overrides, section shape. |
| `test/web-app-manager.profile-about.test.js` | **New.** The baseline descriptors and the `processDataRequest` dispatch. |

### 5.2 competence

| File | Change |
|---|---|
| `bin/competence-web-application.js` | Overrides `getProfileInfo` (employee record → the Employee Management sections, read-only) and `getApplicationInfo` (app-specific entries); adds the **About** entry to the `userProfileMenu` flyout config and both screens to `sidebarNavMapping`. |
| `bin/localization/competence-labels.json` | `interface.profile.*` (incl. per-role display names) / `interface.about.*` / `interface.topbar.profile` / `interface.topbar.about` / `interface.user-menu.about` (en/bg). |
| `package.json` | Adds `releaseDate`; replaces the description, which was a copy of the framework's blurb — both are shown verbatim on the About screen. |
| `INSTALL.md` | Documents `TI_WEB_APP_NAME` / `TI_WEB_APP_VERSION` / `TI_WEB_APP_RELEASE_DATE` in the environment reference. |
| `test/competence-web-application.profile-about.test.js` | **New.** The projection from an employee record to the descriptor, the self-scoping, and the deployment section. |

### 5.3 What the competence Profile shows

Mirrors the Employee Management **Details** tab, minus the controls:

- **Identity** — avatar, full name, `role family · specialization · organization unit`, corporate email, level pip, employment-status pill, employee-ID tag, and the Supervisor badge when it applies.
- **Personal** — first name, last name, corporate email, work mode, work location.
- **Career** — role family, specialization, level · stage, hire date.
- **Organization** — organization unit, reports to.
- **Employment** — employment status.
- **Access** — the roles the session holds, as display names.

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| A consuming app's label catalogue lacks the new keys, so the screens render `!!! label not found !!!`. | Every `x-text-label` in both fragments carries inline English fallback text (fact 5), and competence ships the keys in en/bg. |
| `package.json` is absent in some deployment layout, breaking About. | `readApplicationManifest` swallows the failure and returns `{}`; `buildApplicationInfo` produces a usable descriptor from an empty manifest. |
| The descriptor grows into a general-purpose templating language. | The item flags are fixed at three presentational booleans. Anything needing more layout gets its own screen, not a new flag. |
| Version/build facts leak pre-authentication. | The descriptor is served from a protected data view, never from `/app/config` (facts 2–3). |

## 7. Implementation log

- **2026-08-13** — Design recorded. `CA-99` opened under `CA-10`.
- **2026-08-13** — web-framework: `application-info.js` added with its unit suite; `TiWebAppManager` gained the `about` fragment, the two descriptor virtuals and the `processDataRequest` dispatch.
- **2026-08-13** — web-framework: both fragments, the two Alpine components and the `.ti-identity-*` / `.ti-info-*` CSS primitives landed; framework label defaults added.
- **2026-08-13** — competence: `getProfileInfo` / `getApplicationInfo` overrides, the flyout **About** entry, nav mapping, en/bg labels and the descriptor test suite.
- **2026-08-13** — Verified by rendering both screens headlessly (Chromium, real assets and real fragments, only the
  four data endpoints stubbed) in both themes and in both the baseline and competence shapes: no page errors, no
  unresolved labels, and every Alpine expression survives the CSP evaluator. That is the half no unit test reaches.
- **2026-08-13** — Types regenerated, Help fragments rebuilt for the version stamp, suites green across the
  workspace, versions bumped (web-framework `1.21.0`, competence `3.18.0`).

### Follow-up worth doing separately

The container image cannot know its own build date, so `TI_WEB_APP_RELEASE_DATE` is currently an operator-set
variable and the manifest's `releaseDate` has to be kept current by hand alongside the version bump. Stamping it
in `cd.yml` (a `--build-arg` into a `Dockerfile` `ARG`/`ENV` pair) would make it automatic — deliberately left out
of this change, which touches no CI.
