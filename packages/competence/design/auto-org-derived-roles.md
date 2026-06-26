# Design — Auto org-derived roles & Supervisor grant management

## Meta

- **Status:** Implemented (2026-06-26)
- **Date:** 2026-06-26 (brainstormed & approved)
- **Package:** `competence` (primary) + `web-framework` (minor: test-user panel + `augmentSession` contract note)
- **Scope:** Replace manual role injection with **org-chart-derived roles** (`EMPLOYEE` / `MANAGER` / `SUPERVISOR`) computed at login, plus a **manual Supervisor grant** capability (assign/remove) on the Employee Management screen, restricted to *auto* (structural) supervisors.
- **Owner:** Boris Kostadinov
- **Tracking:** [CA-72](https://belleal.youtrack.cloud/issue/CA-72) (`subtask of` [CA-6 — Employee & Organization Management](https://belleal.youtrack.cloud/issue/CA-6))
- **Related:** [[framework-test-user-cookie]] (the temporary identity-injection cookie this builds on), [[project-tasks-system]]

---

## 1. Context & current state

Today the competence app's roles are injected manually:

- The login screen's **test-user panel** (`configureLoginTestUserPanel` in `web-framework/bin/static/scripts/ti-framework.js` + `frame-login.html`) writes a temporary `ti-test-user` cookie carrying `{ employeeID, roles }` (an array of numeric role codes).
- `competence-web-server.js#augmentSession( session, request )` reads that cookie and sets `session.user.employeeID` + `session.user.roles`, falling back to hardcoded defaults. This hook is **synchronous** and runs **once per login** (invoked from `web-framework/components/web-handlers.js` inside `regenerateAndSaveSession`, before the framework's additive `admin` role is applied).

Downstream:

- `roleCode` (`configuration-loader.js`) is `tools.enum()` — values are the **first seed element**, i.e. numeric: `EMPLOYEE === 1`, `MANAGER === 2`, `SUPERVISOR === 3`, `TEAM_MEMBER === 4`. `session.user.roles` is therefore a `number[]`.
- **SUPERVISOR** gating relies entirely on this `roles` array (`#requireRole( session, SUPERVISOR )`, `userRoles.includes( SUPERVISOR )`).
- **MANAGER** *capability* is already mostly **org-chart-derived** — `#canManagerPerformEvaluation` delegates to `organizationManager.isSuperiorManagerOfEmployee`. The `roles` array's MANAGER bit is used only for a few UI affordances (e.g. `#loadEmployeeList`'s `isManagerOfCurrentUnit`).
- `TEAM_MEMBER` is contextual (per-evaluation membership), **not** org-derived — out of scope here.

The org chart (`organization-manager.js`) is an in-memory `graphology` `DirectedGraph` of org-unit and employee nodes, built once at `onStart`. Units carry `managerID` + `parent`; the root unit has `parent: null` (verified id `"1"`, manager `"22"`).

**Goal:** derive `EMPLOYEE` / `MANAGER` / `SUPERVISOR` from org position at login, and let structural supervisors grant/revoke the Supervisor role to others.

---

## 2. Locked decisions

1. **Role-derivation rules** (§3). `EMPLOYEE` = everyone; `MANAGER` = manages ≥1 unit; `SUPERVISOR` = top manager **or** a direct report of the top manager with **≥2 management levels beneath them** **or** a manual grant.
2. **"≥2 management levels beneath"** counts *manager-of-managers* depth (§3.2), chosen over the broader "≥2 managers at any depth" / "≥2 direct child-unit managers" readings. In the current sample org this reproduces the existing hand-assigned roles exactly (§3.3).
3. **Auto vs. manual Supervisor.** Auto (structural) status is **always recomputed** from the chart, never persisted. Effective Supervisor = auto **OR** manual grant.
4. **Grant management authority.** Only **auto** supervisors may assign/remove grants (assign requires a warning). Manually-granted supervisors hold supervisor privileges but **cannot** manage roles. An **auto** supervisor's role is **immutable** — it cannot be removed by others.
5. **Persistence** = a **dedicated, audited store** (new `data-manager` key `ti:competence:data:role-grants`) with an **in-memory mirror** for synchronous login derivation. Grant/revoke emit audit-log entries. New grants take effect on the grantee's **next login**.
6. **Test-user panel** becomes **identity + optional role override**: identity selection is primary; roles default to auto-derived; an optional, clearly-marked override remains a dev escape hatch.
7. **Code quality / abstraction** is preferred over inlining: role composition is a small pure, unit-tested helper; org-graph rules live on `OrganizationManager`; persistence + mirror live on `DataManager`.

---

## 3. Role-derivation rules

Computed for the logged-in employee `X` at login.

### 3.1 EMPLOYEE & MANAGER

- **EMPLOYEE (1)** — always present.
- **MANAGER (2)** — `X` is the `managerID` of **at least one** org unit (`OrganizationManager.isUnitManager( X )`).

### 3.2 SUPERVISOR (3)

`X` is a Supervisor iff **any** of:

- **Top manager** — `X === OrganizationManager.getTopManagerID()` (the `managerID` of the root unit, the unit whose `parent` is null/empty); **or**
- **Qualifying direct report** — `X`'s resolved manager is the top manager **and** `X` has **≥2 management levels beneath them**; **or**
- **Manual grant** — `DataManager.hasSupervisorGrant( X )` (§4).

**"≥2 management levels beneath" — precise definition.** Let `U_X` be the unit `X` manages. Define the *sub-manager depth* of a unit `U` as the length of the longest chain of nested descendant units `U → V1 → V2 → … → Vk` where **each** `Vi` (`i ≥ 1`) has a non-empty `managerID` (`Vi+1` is a descendant of `Vi`). `X` qualifies iff `subManagerDepth( U_X ) ≥ 2` — i.e. there exists `U_X → child-unit-with-a-manager → grandchild-unit-with-a-manager`. If `X` heads more than one unit, use the **maximum** `subManagerDepth` across those units. A direct report who is not a manager has depth 0 and never qualifies, so the rule naturally reduces to "managers of root's child units whose own subtree is ≥2 management levels deep".

This is encapsulated as `OrganizationManager.isAutoSupervisor( X )` (top-manager test ∪ qualifying-direct-report test); the manual-grant term is OR-ed in at composition time (§5) so `isAutoSupervisor` stays a pure graph read.

### 3.3 Worked example (current sample org)

`config.organization-structure.json`: root unit `1` mgr **22** → `1-1` Engineering mgr **20** → { `1-1-1` Platform mgr **8**, `1-1-2` Product mgr **11** }.

| Employee | Manages unit | Auto-Supervisor? | Roles |
|----------|--------------|------------------|-------|
| 22 | root `1` | yes — top manager | `[E, M, S]` |
| 20 | `1-1` | no — direct report of 22, but `subManagerDepth(1-1) = 1` (8/11 lead leaf units) | `[E, M]` |
| 8, 11 | `1-1-1` / `1-1-2` | no — not direct reports of the top manager | `[E, M]` |
| 1, 3, 4, 9 | — (ICs) | no — depth 0 | `[E]` |

This reproduces the existing hand-assigned test profiles (`22 → [1,2,3]`, `20 → [1,2]`, `8 → [1,2]`, ICs `→ [1]`) — a strong validation of the chosen rule. A positive case requires a deeper subtree: e.g. if Platform (`1-1-1`) itself had a manager-led sub-unit, then `subManagerDepth(1-1) = 2` and 20 would become an auto-Supervisor.

---

## 4. Data model & persistence

New `DataManager` Redis (RedisJSON) cache key — the 9th:

```
ti:competence:data:role-grants    // { [employeeID]: { role: 3, grantedBy: <employeeID>, grantedAt: <ISO date-time> } }
```

Because `augmentSession` is **synchronous**, `DataManager` keeps an **in-memory mirror** of the grant set:

- Loaded into memory at `onStart` (after the org chart is built) from the store.
- Updated on every grant/revoke (write-through: Redis + mirror together).
- Exposed via a **synchronous** getter `hasSupervisorGrant( employeeID )` (and `getSupervisorGrantIDs()`), so login-time derivation needs no `await`.

Grant/revoke also append an **audit-log entry** via the existing audit store (`ti:competence:data:audit-log`), recording actor, target, action (`supervisor-grant` / `supervisor-revoke`), and timestamp. New grants propagate on the grantee's **next login** (consistent with how AD-driven roles would arrive).

> When the cache is non-operational (dev mode), the mirror degrades to an empty set / file-seed, matching the existing `DataManager` dev-fallback pattern.

---

## 5. Module responsibilities

- **`OrganizationManager`** (pure org-graph reads, unit-testable):
  - `getTopManagerID()` — `managerID` of the root unit (parent null); `""` if unbuilt.
  - `isUnitManager( employeeID )` — true if the employee is any unit's `managerID`.
  - `isAutoSupervisor( employeeID )` — top-manager ∪ qualifying-direct-report (§3.2), via a private `#subManagerDepth( unitNodeID )` helper.
- **`DataManager`** (persistence + mirror + audit): `fetchRoleGrants()`, `grantSupervisorRole( employeeID, grantedBy )`, `revokeSupervisorRole( employeeID )`, sync `hasSupervisorGrant( id )` / `getSupervisorGrantIDs()`, mirror load on init.
- **Role composition** — a small **pure** helper `resolveEffectiveRoles({ isManager, isAutoSupervisor, hasGrant })` → `number[]` (always includes `EMPLOYEE`; adds `MANAGER` / `SUPERVISOR` per flags). Unit-tested in isolation, mirroring the `task-resolver` pure-singleton pattern. Home: a new `application/role-resolver.js` (keeps `augmentSession` thin and the rule testable without a session).
- **`competence-web-server.js#augmentSession`** — replaces the hardcoded array: resolves `userID` (from cookie/AD), then `roles = roleResolver.resolveEffectiveRoles({ isManager: organizationManager.isUnitManager(userID), isAutoSupervisor: organizationManager.isAutoSupervisor(userID), hasGrant: dataManager.hasSupervisorGrant(userID) })`. The **optional dev override** (§8) short-circuits derivation when present.

---

## 6. Backend endpoints

Two new POST views/routes in `competence-web-application.js`, each guarded by `#requireRole( session, SUPERVISOR )` **and** an explicit `organizationManager.isAutoSupervisor( userID )` check (so a *granted* supervisor is rejected):

- **`grant-supervisor`** `{ employeeID }` — reject if the target is already an auto-supervisor (structural) or already granted; otherwise `DataManager.grantSupervisorRole( employeeID, userID )` + audit. Reject self-grant defensively.
- **`revoke-supervisor`** `{ employeeID }` — reject if the target is an **auto** supervisor (immutable); otherwise `DataManager.revokeSupervisorRole( employeeID )` + audit.

Both raise the standard exception families (`E_SEC_UNAUTHORIZED_ACCESS` → 403, `E_APP_SERVICE_ERROR` → 422) so `resolveHttpCode` maps them correctly.

The Employee Management **detail payload** (the per-employee detail loader behind `frame-employee-management.html`) gains:

- `isSupervisor: boolean`, `supervisorSource: "auto" | "granted" | null`;
- viewer capabilities `canAssignSupervisor` / `canRevokeSupervisor` (true only when the viewer is an auto-supervisor **and** the target is eligible — not-yet-supervisor for assign, granted for revoke).

---

## 7. UI — Employee Management detail pane

In `frame-employee-management.html` (component `competenceEmployeeManagement` in `competence-user-interface.js`):

- **Supervisor badge** in the detail-head aside, shown when `detail.isSupervisor`. Distinguish source: `"auto"` renders with a lock affordance + "structural" wording; `"granted"` renders as "assigned".
- Gated on the viewer being an auto-supervisor:
  - **Assign Supervisor** button when `detail.permissions.canAssignSupervisor` → opens a **warning confirmation modal** (`modal.kind === 'supervisor-grant'`, mirroring the existing `role-family-change` modal markup/flow), confirm calls `assignSupervisor()`.
  - **Remove** button when `detail.permissions.canRevokeSupervisor` (granted targets only) → `revokeSupervisor()` (a lighter confirm is sufficient).
- New Alpine methods `assignSupervisor()` / `revokeSupervisor()` POST to the new views and re-load the detail. Respect Alpine CSP rules (no inline styles, no `?.`, use `tiApplication` helpers).
- **Localization** (`competence-labels.json`, en + bg): badge (auto / assigned), assign/remove buttons, warning-modal title/body/confirm/cancel, and an audit field label for the grant/revoke action. (BG may be marked pending native review, per existing convention.)

---

## 8. web-framework changes

The temporary test-user panel becomes **identity + optional role override**:

- `frame-login.html` + `configureLoginTestUserPanel` (`ti-framework.js`): identity selection (employeeID) is primary; the per-profile `roles` become an **optional** override, surfaced behind a clearly-marked "override roles (dev)" affordance. When no override is set, the cookie carries only the identity.
- `augmentSession` (both the framework virtual in `web-server.js` and the competence override): contract note clarifying that `roles` are **derived** unless an explicit override is supplied. The competence `#readTestUserSelection` keeps reading the optional `roles` for the override path.

This stays a temporary dev aid (removable once real AD identity propagation lands); the change is the default flip from "roles always injected" to "roles derived unless overridden".

---

## 9. Edge cases

- **Granted user later becomes auto-supervisor** (org change): the grant becomes dormant; revoke stays blocked (auto lock). Not auto-cleaned.
- **Multiple auto-supervisors** (top manager + any qualifying reports) can each manage grants independently.
- **Unknown employee / chart not built** → derivation degrades to `[EMPLOYEE]`.
- **Self-targeting**: assign/revoke on oneself is rejected (an auto-supervisor is already structural; nothing to grant/revoke).
- **Already-granted assign / non-granted revoke** → rejected as no-ops with a clear message.

---

## 10. Testing (`node --test`)

- **`OrganizationManager`**: `getTopManagerID`, `isUnitManager`, `isAutoSupervisor` — the sample-org cases of §3.3 (22 yes; 20 no; 8/11 no; IC no) **plus** a constructed 2-level-deep tree where a direct report qualifies, and a degenerate/unbuilt-chart case.
- **`role-resolver`**: every flag combination → expected role array (E only; E+M; E+M+S via auto; E+S via grant without management; etc.).
- **`DataManager`**: grant/revoke round-trip, in-memory mirror stays in sync, audit entry emitted, auto-supervisor revoke rejected, double-grant rejected.

---

## 11. Versioning & tracking

- **competence**: minor bump (`feat(competence)`), `CHANGELOG.md` entry.
- **web-framework**: minor/patch (`feat(web-framework)` / `fix`) for the test-panel + `augmentSession` contract note, `CHANGELOG.md` entry.
- Commits reference **CA-72**; thematic bundling (not per-step). Log time spent on CA-72.

---

## Implementation log

- **Task 1 — pure `role-resolver`** (`application/role-resolver.js`, `0a9b976`): `subManagerDepth`, `isAutoSupervisor`, `resolveRoles`; unit-tested.
- **Task 2 — `OrganizationManager` role helpers** (`00e188b`): `getTopManagerID`, `isUnitManager`, `isAutoSupervisor` (delegates the depth rule to role-resolver); tested against the seeded org.
- **Task 3 — `DataManager` role-grants store** (`0312cde`): `ti:competence:data:role-grants` + synchronous in-memory mirror; `grant/revoke/load/fetch/has/getIDs` + employee-scoped audit; non-destructive NX init.
- **Task 4 — login derivation** (`53d6b8f`): `competence-web-server.js#augmentSession` composes roles via role-resolver; grant mirror loaded in `onStart`; test-user cookie roles are an optional override.
- **Task 5 — endpoints** (`1303ab8`): auto-supervisor-gated `grant-supervisor` / `revoke-supervisor` services + `supervisor` status & viewer capability flags on the employee-detail payload.
- **Task 6 — UI** (`4e3ebae`): Employee Management detail-pane Supervisor badge (structural vs assigned), assign (warning modal) / remove actions, en/bg labels.
- **Task 7 — web-framework test panel** (`01e382a`): identity-only injection by default + opt-in "override roles (dev)" toggle; `augmentSession` contract note.
- **Review fixes — CodeRabbit on PR #85**: hard-gated the test-user cookie behind the off-by-default `COMPETENCE_TEST_USER_ENABLED` flag so it is ignored in production (was a client-controlled identity/role backdoor); scoped the interview-schedule available-slots projection to the calling manager's own slots (was leaking every manager's availability/names); added a confirmation modal before revoking a Supervisor grant; guarded grant/revoke detail reloads against mid-flight selection changes; made the grant/revoke audit append best-effort so an audit-write failure no longer rejects an already-committed authz change; cleared stale override roles from the test-user cookie when the override is turned off. **Deferred**: cross-instance grant-mirror invalidation (single-instance assumption now documented in code, tracked as **CA-73**). **Skipped**: localizing the temporary test-user panel copy (throwaway dev scaffolding marked for removal).
- **Versioning**: competence 3.6.2, web-framework 1.11.1.
