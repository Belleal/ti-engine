# Design — Role-based screen access (sidebar parity + server-side fragment gate)

## Meta

- **Status:** Implemented (2026-06-30); the gate was **promoted into web-framework** the same day (see the Update note in the implementation log).
- **Date:** 2026-06-30
- **Package:** `web-framework` (the reusable gate) + `competence` (declares each screen's `roles`, the sidebar fix, the user-menu tidy).
- **Scope:** Make users *see* and *reach* only the screens their role permits. Two layers: (1) fix the sidebar so the **Availability** and **Interviews** entries are no longer shown to plain employees; (2) make the framework's per-fragment `verifyAccess` enforce each fragment's declared `roles` so a screen's HTML can no longer be fetched by direct URL by a user whose role can't use it. Plus a minor user-menu tidy.
- **Owner:** Boris Kostadinov
- **Related:** [[auto-org-derived-roles]] (the `EMPLOYEE`/`MANAGER`/`SUPERVISOR` derivation this gates on), [[framework-test-user-cookie]]

---

## 1. Context & problem

Access control in the app had three layers, but only two were doing work:

1. **Sidebar visibility** — `component-sidebar.html` shows/hides nav entries via Alpine `x-show="$store.tiApplication.hasRole(n)"`.
2. **Fragment serving** — every screen's HTML is served through the framework's `TiWebAppManager#getHtmlFragment`, which calls `verifyAccess(session, fragment)` as its designed per-screen gate.
3. **Data/service handlers** — each `load-*` data view and each POST service enforces `#requireRole(...)`.

Two gaps:

- **Sidebar (layer 1):** the **Workspace** section had no role gate, so **Availability** (`manager-calendar`) and **Interviews** (`interview-schedule`) showed to *every* user — including plain employees, who then opened them and hit a 403 from the data load. Every other sidebar entry's `x-show` already matched its backend.
- **Fragment serving (layer 2):** competence overrode `verifyAccess` to `return Promise.resolve()` — a blanket allow. So any authenticated user could fetch the HTML of any screen by direct URL (`/app/cycles`, `/app/admin-config`, …). The data behind each screen stayed protected by layer 3, so this was never a data leak, but the screen chrome was reachable, contradicting "have access to only screens they are allowed to work with."

## 2. Locked decisions

1. **Sidebar parity with the backend.** Gate **Availability** with `hasRole(2)` (MANAGER) and **Interviews** with `hasRole(2) || hasRole(3)` (MANAGER or SUPERVISOR), mirroring `#loadManagerCalendar` (`#requireRole(MANAGER)`) and `#loadInterviewSchedule` (`#requireRole(SUPERVISOR, MANAGER)`). Use `x-show` (not `x-if`) — consistent with the Manage/Insights sections — so htmx can still wire the `hx-*` buttons at page load.
2. **Server-side fragment gate.** Implement `verifyAccess` to enforce a declarative per-fragment `roles` requirement. A fragment with no `roles` is public; otherwise the session must hold ≥1 listed role.
3. **Declarative role requirements.** Each gated `addFragment(...)` registration carries a `roles: [...]` array, valued to mirror that screen's data-load `#requireRole(...)`. The framework already stores the whole fragment object and passes it to `verifyAccess`, so no framework change is required.
4. **No implicit role hierarchy.** An `admin`-gated fragment is reachable only by the `admin` role (the `auth.admins` allowlist), never by high numeric roles — least privilege, and consistent with the sidebar's separate Administration section.
5. **Pure, unit-tested decision.** The allow/deny rule lives in a pure singleton `application/fragment-access.js` (mirrors `role-resolver` / `task-resolver`); `verifyAccess` is a thin wrapper that reads `fragment.roles` + `session.user.roles` and rejects with `E_SEC_UNAUTHORIZED_ACCESS` (403) on denial.
6. **User-menu tidy.** Remove the profile flyout's "Settings" entry, which pointed at the generic framework `/app/administration` placeholder and implied an admin destination for every user. The real, admin-gated configuration UI is the Administration sidebar section (`/app/admin-config`). "Profile" (a non-privileged per-user concept) stays.

## 3. The per-screen role map

| Fragment | `roles` | Audience | Mirrors |
|----------|---------|----------|---------|
| `competence-evaluation`, `my-results`, `employees-list` | — (public) | every authenticated user | self / org-chart browse |
| `manager-calendar` | `[MANAGER]` | managers | `#loadManagerCalendar` |
| `interview-schedule` | `[MANAGER, SUPERVISOR]` | managers + supervisors | `#loadInterviewSchedule` |
| `new-evaluation` | `[MANAGER, SUPERVISOR]` | managers + supervisors | `#loadNewEvaluationData` |
| `cycles`, `cycle-setup` | `[SUPERVISOR]` | supervisors | `#loadCycleList` / `#loadCycleSetup` |
| `employee-management` | `[MANAGER, SUPERVISOR]` | managers + supervisors | `#loadEmployeeManagementList` |
| `insights-cycle`, `insights-trends` | `[SUPERVISOR]` | supervisors | `#loadInsightsCycle` / `#loadResultsTrend` |
| `insights-team` | `[MANAGER, SUPERVISOR]` | managers + supervisors | `#loadInsightsTeam` |
| `admin-config`, `competency-text-editor`, `archetype-assignment`, `archetype-editor`, `role-families` | `["admin"]` | admins | admin config API (`hasRole('admin')`) |

The `dashboard`, `home`, `application-main`, `profile`, `login`, `not-found` fragments are framework-registered with no `roles` → public, so login and the app shell load for everyone.

## 4. Module responsibilities

- **`application/fragment-access.js`** (new, pure singleton): `isAccessAllowed(requiredRoles, userRoles)` → boolean. Empty/absent `requiredRoles` = public; otherwise ≥1 overlap. Role-value agnostic (numbers or `"admin"`).
- **`competence-web-application.js`**: `roles` annotations on the gated `addFragment(...)` registrations; `verifyAccess(session, resource)` → resolves when `fragment-access` allows, else rejects `E_SEC_UNAUTHORIZED_ACCESS` (403); removed the user-menu "Settings" button.
- **`component-sidebar.html`**: `x-show` on the Availability and Interviews buttons.

## 5. Behaviour notes

- A full-page load of a gated URL by an unauthorized user rejects the whole `assembleHtmlView` (the user gets a 403/error page) — acceptable, they cannot use the screen anyway. htmx partial loads of gated views also 403, but the corresponding sidebar buttons are `x-show`-hidden so an authorized-to-see user never triggers them.
- Layer 3 (`#requireRole` in each data-load/service) is unchanged and remains the source of truth for the *data* behind every screen; this work hardens the *screen* layer to match.

## 6. Testing (`node --test`)

- **`fragment-access.test.js`**: the pure resolver (public/gated/guards, numeric + `"admin"`), and `verifyAccess` itself (built via `Object.create` to skip the constructor) — resolves public + authorized, rejects (403) unauthorized, admin-gated-for-non-admin, and no-session.

## 7. Versioning & tracking

- **competence**: minor bump `3.7.0` → `3.8.0` (`feat(competence)`), `CHANGELOG.md` entry.
- **web-framework**: minor bump `1.12.0` → `1.13.0` — the gate was promoted into the framework (see the Update note below).

---

## Implementation log

- **Pure resolver + alias** — `application/fragment-access.js` (`#fragment-access`); TDD: red (missing module) → green (12 resolver cases).
- **verifyAccess** — replaced the no-op with the fragment-`roles` gate; TDD: red (no-op resolved unauthorized) → green (3 rejection + 2 resolve cases). 290/290 suite green.
- **Fragment role annotations** — `roles` added to the 14 gated `addFragment(...)` registrations (§3).
- **Sidebar** — `x-show` on Availability (`hasRole(2)`) and Interviews (`hasRole(2) || hasRole(3)`); Workspace comment updated.
- **User-menu** — removed the "Settings" → `/app/administration` entry.

### Update (2026-06-30) — gate promoted into web-framework

The gate was a generally useful framework capability, so it was relocated out of competence (per review feedback):

- The pure decision became **`authorization.isAccessAllowed( requiredRoles, userRoles )`** in `web-framework/components/authorization.js` (beside `hasAnyRole`), and the framework's **default** `TiWebAppManager.verifyAccess` now enforces `fragment.roles` (empty = public; else ≥1 role; reject `E_SEC_UNAUTHORIZED_ACCESS` 403). `addFragment` documents the optional `roles` field.
- Competence therefore **deleted** `application/fragment-access.js`, the `#fragment-access` alias, its `verifyAccess` override, and `test/fragment-access.test.js` — it now just declares `roles` on its `addFragment` calls and inherits the framework gate. Tests moved to `web-framework/test/authorization.test.js` (`isAccessAllowed`) and `web-framework/test/web-app-manager.verify-access.test.js`.
- Backward compatible: every existing role-less fragment stays public; the only other `verifyAccess` methods in the repo (core/tester `ServiceProvider`) are an unrelated service-layer method. competence requires web-framework ≥ 1.13.0.
