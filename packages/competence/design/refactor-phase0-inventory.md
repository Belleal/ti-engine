# Phase 0 Inventory — Competence Framework Refactor

This document captures the reconnaissance carried out before any code is written. It records the state of the codebase **as of the start of the refactor**, lists every site the refactor must touch, and flags every drift between the brief in `.claude/commands/competence-framework-refactor.md` and what actually exists on disk. No code changes are made here.

Sections:

1. Design-token & component inventory
2. CareerPath API call-site inventory
3. Reference inventory for the old enum and codes (`CareerPathCode`, `careerPath`, `SE01/PM01/BA01`)
4. Drift between the brief and the codebase (flagged, not fixed)

---

## 1. Design-Token & Component Inventory

### 1.1 Where the design system lives

| File                                                                 | Role                                                                                                               |
|----------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `packages/web-framework/bin/static/scripts/ti-framework.css`         | Shared framework CSS — tokens (Design System v2), shell, components                                                |
| `packages/web-framework/bin/static/scripts/ti-theme-daylight.css`    | Daylight theme — sets `--bg-*`, `--fg-*`, `--accent`, etc. via `[data-theme="daylight"]`                           |
| `packages/web-framework/bin/static/scripts/ti-theme-black-glass.css` | Glass theme — same token set under `[data-theme="glass"]`, plus glass-specific `--ti-glass-*`                      |
| `packages/competence/bin/static/scripts/competence-main.css`         | Competence-specific styles only (icons, dashboard, employees list, evaluation, calendar, schedule, new-evaluation) |

### 1.2 Token vocabulary (Design System v2)

Defined under `:root` in `ti-framework.css`, theme-keyed in the two theme files.

**Theme-keyed (set per-theme):**
- Background: `--bg-app`, `--bg-surface`, `--bg-sunken`, `--bg-tint`, `--bg-overlay`
- Foreground: `--fg-primary`, `--fg-secondary`, `--fg-tertiary`, `--fg-on-accent`, `--fg-inverse`
- Border: `--border`, `--border-strong`, `--border-soft`
- Accent: `--accent`, `--accent-hover`, `--accent-soft`, `--accent-ring`
- Semantic: `--success`/`--success-soft`, `--warn`/`--warn-soft`, `--danger`/`--danger-soft`, `--info`/`--info-soft`, `--muted`/`--muted-soft`
- Shadow: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-focus`
- Sidebar: `--sidebar-bg`, `--sidebar-fg`, `--sidebar-fg-active`, `--sidebar-active-bg`, `--sidebar-hover-bg`, `--sidebar-divider`, `--sidebar-accent`
- Grid line: `--grid-line`
- Grade colours: `--grade-S`, `--grade-R`, `--grade-U`, `--grade-N` (+ `-soft` variants)

**Theme-agnostic (shared, in `ti-framework.css`):**
- Type scale: `--fs-xs (11)`, `--fs-sm (12)`, `--fs-base (13.5)`, `--fs-md (15)`, `--fs-lg (18)`, `--fs-xl (22)`, `--fs-2xl (28)`, `--fs-3xl (36)`, `--fs-display (48)`
- Spacing: `--s-1 (4)`, `--s-2 (8)`, `--s-3 (12)`, `--s-4 (16)`, `--s-5 (20)`, `--s-6 (24)`, `--s-7 (32)`, `--s-8 (40)`, `--s-9 (56)`, `--s-10 (72)`
- Radius: `--r-xs (4)`, `--r-sm (6)`, `--r-md (10)`, `--r-lg (14)`, `--r-xl (20)`, `--r-pill (999)`
- Layout: `--sidebar-w (220)`, `--sidebar-w-collapsed (64)`, `--header-h (64)`, `--content-max (1180)`
- Animation: `--ease-out`, `--ease-in-out`, `--dur-fast (140ms)`, `--dur-base (220ms)`, `--dur-slow (380ms)`

**Legacy `--ti-*` tokens** still defined for backward compatibility at the top of `ti-framework.css` (e.g. `--ti-font-family`, `--ti-icon-size`, `--ti-button-*`, `--ti-data-field-*`). These are vestigial — the new code paths use the v2 tokens above. Glass theme retains additional `--ti-glass-*` and `--ti-tooltip-*` tokens for its overlay materials.

### 1.3 Component vocabulary (framework, `ti-` prefix)

| Class                                                                                                                                                                                                                                    | Purpose                                                                  | Modifiers                                                                                                                                                                                                                                                                             |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `.ti-application`                                                                                                                                                                                                                        | App shell — CSS grid with sidebar + content                              | `.collapsed`                                                                                                                                                                                                                                                                          |
| `.ti-sidebar`, `.ti-sidebar-nav`, `.ti-sidebar-item`, `.ti-sidebar-brand`, `.ti-sidebar-foot`, `.ti-sidebar-user`, `.ti-sidebar-collapse-btn`, `.ti-sidebar-section-label`, `.ti-sidebar-flyout(-container/-item)`, `.ti-sidebar-button` | Sidebar                                                                  | `.active`, `.is-active` (where applicable)                                                                                                                                                                                                                                            |
| `.ti-topbar`, `.ti-topbar-title`, `.ti-topbar-sub`, `.ti-topbar-spacer`, `.ti-topbar-actions`                                                                                                                                            | Top bar                                                                  | —                                                                                                                                                                                                                                                                                     |
| `.ti-content`, `.ti-content.pane`, `.ti-page`, `.ti-page-scrollable`                                                                                                                                                                     | Content/page containers                                                  | `.pane`                                                                                                                                                                                                                                                                               |
| `.ti-page-head`, `.ti-page-eyebrow`, `.ti-page-title`, `.ti-page-subtitle`                                                                                                                                                               | Page header pattern                                                      | —                                                                                                                                                                                                                                                                                     |
| `.ti-panel`, `.ti-card`, `.ti-panel-head`, `.ti-panel-title`, `.ti-panel-head-actions`                                                                                                                                                   | Panel/card                                                               | —                                                                                                                                                                                                                                                                                     |
| `.ti-btn`                                                                                                                                                                                                                                | Button (formerly `.ti-button`)                                           | `.primary`, `.ghost`, `.danger`, `.lg`, `.sm`, `.icon`, `.full` (combinations allowed, e.g. `.ti-btn.sm.primary`)                                                                                                                                                                     |
| `.ti-input`, `.ti-select`, `.ti-textarea`, `.ti-field-label`                                                                                                                                                                             | Form controls                                                            | —                                                                                                                                                                                                                                                                                     |
| `.ti-status-pill` (`+ .dot` child)                                                                                                                                                                                                       | Status indicator                                                         | `.success`, `.info`, `.warn`, `.danger`, `.muted`                                                                                                                                                                                                                                     |
| `.ti-grade-chip`                                                                                                                                                                                                                         | Grade pill (S/R/U/N)                                                     | `data-grade="S\|R\|U\|N"`, `.empty`, `.selectable`, `.selected`, `.locked`                                                                                                                                                                                                            |
| `.ti-avatar`                                                                                                                                                                                                                             | Round avatar                                                             | `.xs`, `.sm`, `.lg`, `.xl`; CSS var `--avatar-bg`                                                                                                                                                                                                                                     |
| `.ti-toast-stack`, `.ti-toast`, `.ti-toast-bar`, `.ti-toast-icon`, `.ti-toast-body`, `.ti-toast-title`, `.ti-toast-desc`/`.ti-toast-msg`, `.ti-toast-close`                                                                              | Toast stack (replaces old `.ti-notification(s)`)                         | `.success`, `.warn`, `.danger`, `.info`, `.leaving`                                                                                                                                                                                                                                   |
| `.ti-kv-grid`, `.ti-kv-label`, `.ti-kv-value`                                                                                                                                                                                            | Key/value pair grid                                                      | —                                                                                                                                                                                                                                                                                     |
| `.ti-tag`                                                                                                                                                                                                                                | Small pill/label                                                         | `.mono`                                                                                                                                                                                                                                                                               |
| `.ti-empty-state`, `.ti-empty-state-icon`, `.ti-empty-state-title`, `.ti-empty-state-desc`                                                                                                                                               | Empty-state pattern                                                      | —                                                                                                                                                                                                                                                                                     |
| `.ti-icon`                                                                                                                                                                                                                               | Mask-image icon (Heroicons-based)                                        | Many variants — `.app-menu`, `.dashboard`, `.settings`, `.user-profile`, `.login`, `.logout`, `.internet`, `.calendar`, `.schedule`, `.error`, `.empty`, `.dark-style` (in framework); `.employee-list`, `.lock`, `.warning`, plus competence-specific masks in `competence-main.css` |
| `.ti-tooltip`, `.ti-tooltip-bubble`                                                                                                                                                                                                      | Tooltip                                                                  | —                                                                                                                                                                                                                                                                                     |
| `.ti-notifications`, `.ti-notification`                                                                                                                                                                                                  | Legacy notification region (still present alongside the new toast stack) | —                                                                                                                                                                                                                                                                                     |
| `.ti-login-*` (`-container`, `-brand`, `-brand-mark`, `-brand-text`, `-brand-title`, `-brand-sub`, `-card`, `-error`, `-form`, `-submit`, `-divider(-line/-label)`, `-social`, `-test-panel*`, `-test-pill*`)                            | Login screen primitives                                                  | —                                                                                                                                                                                                                                                                                     |
| `.ti-main`, `.ti-data-field` (vestigial — class no longer styled, only the `--ti-data-field-*` tokens remain)                                                                                                                            | Legacy structural classes                                                | —                                                                                                                                                                                                                                                                                     |

> The brief refers to `.ti-button`, `.ti-button.inline`, `.ti-data-field`, and `.ti-glass-btn-black` (with `.large`, `.on-screen`, `.primary`, `.is-active`). **None of these classes are styled in the current codebase.** They were superseded by the v2 system in the recent UI/UX overhaul. See §4 below for the full drift list.

### 1.4 Component vocabulary (competence, `competence-` prefix)

Defined entirely in `packages/competence/bin/static/scripts/competence-main.css`. All app-specific structural classes carry the `competence-` namespace, with shared modifier names (`active`, `selected`, `collapsed`, `success`, `warn`, `info`, `danger`, `empty`, `full`, etc.) left unprefixed.

Inventory (representative; not exhaustive):

| Group                     | Classes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|---------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Dashboard                 | `.competence-dash-hero(-card/-date/-greeting/-title/-msg/-actions/-mark/-frame)`, `.competence-dash-cycle-card`, `.competence-cycle-meta`, `.competence-cycle-id`, `.competence-cycle-progress(-meta)`, `.competence-cycle-deadline-grid`, `.competence-cycle-deadline-item`, `.competence-cycle-deadline-label`, `.competence-cycle-deadline-date`, `.competence-dash-stats`, `.competence-stat-card(-head/-value/-value-suffix/-sub/-viz)` (`.competence-accent`, `.success`, `.warn`, `.info`), `.competence-dash-cols`, `.competence-task-list`, `.competence-task-item(-icon/-title/-sub)` (`.info`, `.success`, `.warn`), `.competence-activity-list`, `.competence-activity-item(-text/-time)`, `.competence-panel-head-count`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Employees list / org tree | `.competence-page-info(-eyebrow/-title/-desc)`, `.competence-org-summary(-stats)`, `.competence-org-mark`, `.competence-org-meta`, `.competence-org-name`, `.competence-org-sub(-sep)`, `.competence-manager-name`, `.competence-org-stat-num`, `.competence-org-stat-label`, `.competence-team-block(-head/-title/-sub/-meta)`, `.competence-team-mark`, `.competence-team-incycle`, `.competence-org-tree-head`, `.competence-col-center`, `.competence-col-right`, `.competence-org-tree-rows`, `.competence-org-tree-row` (`.competence-current`), `.competence-org-tree-connector`, `.competence-org-employee-cell`, `.competence-org-employee-name`, `.competence-org-employee-id`, `.competence-org-employee-email`, `.competence-you-tag`, `.competence-manager-tag`, `.competence-org-career-cell`, `.competence-level-pip` (`.N`/`.J`/`.R`/`.S`/`.X`/`.T`), `.competence-org-eval-cell`, `.competence-org-eval-date`, `.competence-org-locked`, `.competence-org-action-cell`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Evaluation                | `.competence-eval-page-header`, `.competence-eval-page-eyebrow`, `.competence-eval-page-title`, `.competence-eval-page-desc`, `.competence-eval-role-info(-title/-desc)`, `.competence-eval-top-grid`, `.competence-eval-employee-card`, `.competence-eval-emp-top-row`, `.competence-eval-emp-avatar-block`, `.competence-eval-emp-info`, `.competence-eval-emp-name`, `.competence-eval-emp-career`, `.competence-eval-emp-meta`, `.competence-eval-emp-status-pill`, `.competence-eval-emp-warn`, `.competence-eval-sub-sep`, `.state-track`, `.state-step` (`.active`, `.done`), `.state-step-line`, `.competence-eval-top-right-col`, `.competence-deadline-card(-icon/-label/-value/-sub)` (`.team`, `.info`), `.competence-team-reviewers-card`, `.competence-eval-grade-guide(-intro/-grid)`, `.competence-eval-grade-card(-info/-name/-short)`, `.competence-eval-grade-scale-tag`, `.competence-cat-card` (`.E`/`.I`/`.C`), `.competence-cat-card-head`, `.competence-cat-letter`, `.competence-cat-card-name`, `.competence-cat-card-desc`, `.competence-cat-progress-mini(-text/-bar)`, `.competence-fill`, `.competence-comp-table-head`, `.competence-h-self`/`.competence-h-mgr`/`.competence-h-team` (`.active`), `.competence-subcat-block`, `.competence-subcat-head`, `.competence-subcat-id`, `.competence-subcat-name-block`, `.competence-subcat-name`, `.competence-subcat-desc`, `.competence-comp-row`, `.competence-comp-info`, `.competence-comp-id-name`, `.competence-comp-id`, `.competence-comp-name`, `.competence-comp-desc`, `.competence-comp-cell`, `.competence-grade-pill-group`, `.competence-eval-feedback-grid`, `.competence-eval-feedback-col(-label/-value)`, `.competence-eval-feedback-body`, `.competence-eval-feedback-intro`, `.competence-eval-team-comments`, `.competence-eval-team-comment-item`, `.competence-eval-empty-comment`, `.competence-eval-sticky-bar`, `.competence-eval-sticky-label`, `.competence-eval-sticky-track`, `.competence-eval-sticky-pct`, `.competence-eval-sticky-actions`, `.competence-panel-mt` |
| Calendar / schedule       | `.competence-cal-*` (slot, grid, header rows), `.competence-cal-slot` (`.competence-available`/`.competence-busy`/`.competence-booked`/`.competence-today`), interview slot picker classes — see file for exhaustive list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| New evaluation            | `.competence-team-chip*`, related selectors — see file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

> Memory note (verified): namespace convention is `ti-` for framework, `competence-` for app, and unprefixed for modifier/state words (`active`, `collapsed`, `selected`, `primary`, `ghost`, `danger`, `success`, `warn`, `info`, `empty`, `full`, etc.). Status modifiers that need prefixing because they could clash live under `competence-` (`competence-available`, `competence-busy`, `competence-booked`, `competence-current`, `competence-today`, `competence-accent`).

### 1.5 JS conventions (frontend)

- **Alpine.js (CSP variant).** Components defined via `Alpine.data("<name>", ...)` and consumed via `x-data="<name>"`. Used factories include `competenceEmployeesList`, `competenceEvaluation`, plus dashboards/new-evaluation/calendar/schedule components in `competence-user-interface.js`.
- **Alpine stores.** `tiToolbox`, `tiApplication`, `tiComponentsConfig` are registered in `packages/web-framework/bin/static/scripts/ti-framework.js`. `tiToolbox` exposes utilities such as `formatDate(value, placeholder)`, `getCookie(name)`, `getVisibleBox(fixed)`, `clampToBox(...)`, `deepMerge(a, b)`, and `generateAvatarStyle(employeeID, name)`. These are accessed in templates via `$store.tiToolbox.<method>(...)` and inside scripts via `Alpine.store("tiToolbox")`.
- **Localization.** All user-visible strings use the `x-text-label="..."` directive (custom Alpine directive registered in the framework). Keys come from `packages/competence/bin/localization/competence-labels.json` (and framework labels). Both `en` and `bg` locales are populated.
- **HTMX.** Server fragments are returned to swap targets configured by `hx-target`, `hx-swap`, etc. Frontend dispatches via `htmx.ajax(...)` calls within Alpine factories (see `competence-user-interface.js`); requests carry the `x-xsrf-token` header (injected via the global `htmx:configRequest` listener in `ti-framework.js:1129`).
- **Fragment structure.** Each screen is a single `<div class="ti-page" x-data="<factory>">` containing one or more `<template x-if="...">` branches that toggle visibility based on the factory's reactive state. Example: `frame-employees-list.html` toggles between an empty-state `ti-empty-state` and the org-tree view; `frame-competence-evaluation.html` toggles among `noEvaluationState === 'none'` and `showEvaluationForm`.

### 1.6 Example usage from the existing screens

**Employees List (`frame-employees-list.html`)**

- Page container: `<div class="ti-page" x-data="competenceEmployeesList">`
- Empty state: `<div class="ti-empty-state">` with `<div class="ti-empty-state-title" x-text-label="interface.employees.empty-state">`
- Page info header: competence-specific `.competence-page-info` + `.competence-page-info-eyebrow/-title/-desc`
- Org summary card: `.competence-org-summary` with `.competence-org-summary-stats` (four stat columns)
- Per-team block: `.competence-team-block` with header (`.competence-team-block-head` + `.competence-team-block-meta`), tree rows
- Each employee row: `.competence-org-tree-row` containing a `.ti-avatar.sm` with style bound to `$store.tiToolbox.generateAvatarStyle(employee.id, employee.name)`, an employee cell with name/tags/ID, career-path text, a `.competence-level-pip`, a `.ti-status-pill` (tone-bound) for evaluation status, and action buttons using `.ti-btn.sm` / `.ti-btn.sm.primary`.
- "Start Evaluation" action: `<button class="ti-btn sm primary" @click="startNewEvaluation(employee.id)">` shown only when `isManagerView` and the employee has no in-flight evaluation.

**Competence Evaluation (`frame-competence-evaluation.html`)**

- Two top-level branches via `<template x-if>`: empty state vs `showEvaluationForm`.
- Page header: competence-specific `.competence-eval-page-header` + `.competence-eval-page-eyebrow/-title/-desc`.
- Role banner: `.competence-eval-role-info` bound to a role-specific class via `x-bind:class="getUserRoleAsText()"`.
- Employee card: `.competence-eval-employee-card` containing a `.ti-avatar.xl`, career text, a `.competence-level-pip`, manager info, a `.ti-status-pill` and the milestone track (`.state-track` / `.state-step`).
- Deadline card: `.competence-deadline-card` (variant `.info` for `Ready` status) showing label, date, and "days left".
- Grade guide: `.competence-eval-grade-guide` listing the four grades using `.ti-grade-chip[data-grade=...]`.
- Per category: `.competence-cat-card` bound to category letter, with `.competence-cat-card-head` (letter badge + name/desc + mini progress), `.competence-comp-table-head` (column headers), and per-subcategory blocks containing `.competence-comp-row`s. Each row contains three grade cells; per cell the renderer chooses between editable pills (`.competence-grade-pill-group` of `.ti-grade-chip[data-grade=...]` with `@click` toggle), read-only chips, or `.ti-grade-chip.locked` chips.
- Feedback section: `.ti-panel.competence-panel-mt` with `.ti-textarea` controls, role-gated.
- Sticky action bar: `.competence-eval-sticky-bar` with `.ti-btn.ghost.sm` (Reset), `.ti-btn.sm` (Save Draft), `.ti-btn.primary.sm` (Submit).

**Server side (representative)**

- `packages/competence/bin/competence-web-application.js` exposes service handlers `load-dashboard`, `load-employee-list`, `load-evaluation`, `load-new-evaluation-data`, `save-evaluation-draft`, `submit-evaluation`, `start-evaluation`, `load-manager-calendar`, `toggle-calendar-slot`, `load-interview-schedule`, `book-interview-slot`, `cancel-interview-booking`.
- Authorization is enforced server-side via `request.session.user.roles` checks before any business logic runs (e.g. `RoleCode.MANAGER`/`SUPERVISOR` gates on calendar/schedule handlers).

---

## 2. CareerPath API Call-Site Inventory

The principal API method targeted for replacement is `competenceFramework.instance.getAllowedCompetencyCodes(careerPath, cycleID)`. Every call site is listed below with file path and line number (as observed at the time of this inventory). Every site is rewritten in Phase 2 to use `getActiveCompetencySet(roleFamily, specialization, cycleID)`.

### 2.1 Direct calls

| File                                                      | Line | Context                                                                                                 |
|-----------------------------------------------------------|------|---------------------------------------------------------------------------------------------------------|
| `packages/competence/application/competence-framework.js` | 325  | Inside `anonymizeEvaluationGrades` (or adjacent grade-flow method) — filters grade map to allowed codes |
| `packages/competence/application/competence-framework.js` | 357  | Same pattern, separate grade-flow path                                                                  |
| `packages/competence/application/competence-framework.js` | 394  | Same pattern, separate grade-flow path                                                                  |
| `packages/competence/application/competence-framework.js` | 512  | **Definition** of `getAllowedCompetencyCodes(careerPath, cycleID)`                                      |
| `packages/competence/application/competence-framework.js` | 609  | Inside `#calculateEvaluationScoreMatrices` (private), invoked from the constructor                      |
| `packages/competence/bin/competence-web-application.js`   | 761  | `load-evaluation` handler — supplies `allowedCompetencyCodes` to `buildCompetenciesTree`                |
| `packages/competence/bin/competence-web-application.js`   | 841  | `start-evaluation` handler — populates the `grades` map with empty entries keyed by competency codes    |
| `packages/competence/bin/competence-web-application.js`   | 889  | `load-new-evaluation-data` (or equivalent setup) handler — exposes the allowed codes to the UI          |
| `packages/competence/bin/competence-web-application.js`   | 1253 | `load-dashboard` handler — total self-grades counter for the dashboard employee view                    |

### 2.2 Configuration dependencies

Both methods above flow through `configurationLoader.configCareerPathCompetencies` and `configurationLoader.configCareerPathLevels`. Their reads:

| File                                                      | Line    | What it reads                                                                                                             |
|-----------------------------------------------------------|---------|---------------------------------------------------------------------------------------------------------------------------|
| `packages/competence/application/configuration-loader.js` | 12      | `module.exports.configCareerPathCompetencies = tools.deepFreeze( require( "#config-career-path-competencies" ) );`        |
| `packages/competence/application/configuration-loader.js` | 13      | `module.exports.configCareerPathLevels = tools.deepFreeze( require( "#config-career-path-levels" ) );`                    |
| `packages/competence/application/competence-framework.js` | 515     | `const positionCompetencies = configurationLoader.configCareerPathCompetencies                                            || {};` (inside `getAllowedCompetencyCodes`) |
| `packages/competence/application/competence-framework.js` | 608     | `Object.keys( configurationLoader.configCareerPathCompetencies ).forEach( ... )` (in `#calculateEvaluationScoreMatrices`) |
| `packages/competence/application/competence-framework.js` | 616–621 | Iteration over `configurationLoader.configCareerPathLevels` to compose stage-level IDs                                    |
| `packages/competence/package.json`                        | 10, 11  | `#config-career-path-competencies` and `#config-career-path-levels` aliases in the `imports` map                          |

### 2.3 Allowed-code consumers downstream of the API

These sites do not call the API directly, but consume its result through `buildCompetenciesTree(competenceConfig, language, allowedCompetencyCodes)`:

| File                                                      | Line                              | Context                                                                                            |
|-----------------------------------------------------------|-----------------------------------|----------------------------------------------------------------------------------------------------|
| `packages/competence/application/competence-framework.js` | 542                               | Definition of `buildCompetenciesTree`. Filters the dictionary by the `allowedCompetencyCodes` set. |
| `packages/competence/bin/competence-web-application.js`   | 761 (same line as the call above) | Invocation supplying allowed codes to the tree builder                                             |

---

## 3. Reference Inventory — `CareerPathCode` / `careerPath` / `SE01` / `PM01` / `BA01`

Every reference to the obsolete enum, field name, or string codes is listed. Each one is removed or migrated by Phase 6 cleanup.

### 3.1 Code (JavaScript)

| File                                                                         | Line          | Reference                                                                                                                                                                                                 |
|------------------------------------------------------------------------------|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `packages/competence/application/configuration-loader.js`                    | 12            | `module.exports.configCareerPathCompetencies = tools.deepFreeze( require( "#config-career-path-competencies" ) );`                                                                                        |
| `packages/competence/application/configuration-loader.js`                    | 13            | `module.exports.configCareerPathLevels = tools.deepFreeze( require( "#config-career-path-levels" ) );`                                                                                                    |
| `packages/competence/application/configuration-loader.js`                    | 37            | JSDoc `@enum {CareerPathCode}`                                                                                                                                                                            |
| `packages/competence/application/configuration-loader.js`                    | 38            | JSDoc `@typedef {CareerPathCodeValue} CareerPathCode`                                                                                                                                                     |
| `packages/competence/application/configuration-loader.js`                    | 40–45         | `careerPathCodeEnum = tools.enum( { SE01:[…], PM01:[…], BA01:[…] } );` + `module.exports.careerPathCode = careerPathCodeEnum;`                                                                            |
| `packages/competence/application/competence-framework.js`                    | 171           | `careerPath: employee.career.careerPath,` (in `createNewEvaluation`, persisted onto the evaluation record)                                                                                                |
| `packages/competence/application/competence-framework.js`                    | 268           | `const scoreMatrixByCategory = this.#evaluationScoreMatrices[ evaluation.careerPath ]                                                                                                                     || {};` |
| `packages/competence/application/competence-framework.js`                    | 325, 357, 394 | `this.getAllowedCompetencyCodes( evaluation.careerPath, evaluation.cycleID )` calls                                                                                                                       |
| `packages/competence/application/competence-framework.js`                    | 507           | JSDoc `@param {string} careerPath`                                                                                                                                                                        |
| `packages/competence/application/competence-framework.js`                    | 512, 514–525  | `getAllowedCompetencyCodes(careerPath, cycleID)` implementation                                                                                                                                           |
| `packages/competence/application/competence-framework.js`                    | 608–622       | `#calculateEvaluationScoreMatrices` iterating career-path competencies/levels                                                                                                                             |
| `packages/competence/application/organization-manager.js`                    | 132           | `careerPath: employee.career?.careerPath,` (when ingesting an employee node into the graph)                                                                                                               |
| `packages/competence/application/organization-manager.js`                    | 313, 317      | JSDoc for `resolveEmployeeAttributes` referencing `careerPath`, `careerPathName`                                                                                                                          |
| `packages/competence/application/organization-manager.js`                    | 327–330       | Inside `resolveEmployeeAttributes`: `getNodeAttribute( nodeID, "careerPath" )`, `careerPathCode.name( careerPath )`, return `{ level, careerPath, careerPathName }`                                       |
| `packages/competence/application/organization-manager.js`                    | 428           | `careerPath: employeeAttributes.careerPath,` (in another graph node assembly path)                                                                                                                        |
| `packages/competence/application/data-objects.types.js`                      | 92            | `@property {CareerPathCodeValue} careerPath` on the Evaluation typedef                                                                                                                                    |
| `packages/competence/application/data-objects.types.js`                      | 114           | `@property {CareerPathCodeValue} careerPath` on the EmployeeCareer typedef                                                                                                                                |
| `packages/competence/application/data-objects.types.js`                      | 174           | `@typedef {"SE01"\|"PM01"\|"BA01"} CareerPathCodeValue`                                                                                                                                                   |
| `packages/competence/bin/competence-web-application.js`                      | 320–321       | `careerPath: employeeNode.careerPath`, `careerPathName: configurationLoader.careerPathCode.name( employeeNode.careerPath ) \|\| employeeNode.careerPath` (in the org-tree mapping for the Employees List) |
| `packages/competence/bin/competence-web-application.js`                      | 739           | `positionName: configurationLoader.careerPathCode.name( employee.career?.careerPath )` (load-new-evaluation-data response)                                                                                |
| `packages/competence/bin/competence-web-application.js`                      | 749           | `careerPathName: configurationLoader.careerPathCode.name( currentEvaluation.careerPath )` (load-evaluation response)                                                                                      |
| `packages/competence/bin/competence-web-application.js`                      | 761           | `getAllowedCompetencyCodes( employee.career.careerPath, currentEvaluation.cycleID )`                                                                                                                      |
| `packages/competence/bin/competence-web-application.js`                      | 841           | `getAllowedCompetencyCodes( employee.career.careerPath, newEvaluation.cycleID )`                                                                                                                          |
| `packages/competence/bin/competence-web-application.js`                      | 884           | `careerPathName: configurationLoader.careerPathCode.name( currentEmployee.career.careerPath )`                                                                                                            |
| `packages/competence/bin/competence-web-application.js`                      | 889           | `getAllowedCompetencyCodes( employee.career.careerPath, competenceFramework.instance.evaluationCycleID )`                                                                                                 |
| `packages/competence/bin/competence-web-application.js`                      | 917           | `careerPathName: configurationLoader.careerPathCode.name( employee.career.careerPath )`                                                                                                                   |
| `packages/competence/bin/competence-web-application.js`                      | 999           | `careerPathName: configurationLoader.careerPathCode.name( evaluation.careerPath ) \|\| evaluation.careerPath \|\| ""`                                                                                     |
| `packages/competence/bin/competence-web-application.js`                      | 1253–1256     | Dashboard self-grades total computation using `myLatestEvaluation.careerPath`                                                                                                                             |
| `packages/competence/bin/static/scripts/competence-user-interface.js`        | 1174          | Frontend display string uses `evaluation.careerPathName`                                                                                                                                                  |
| `packages/competence/bin/static/fragments/frame-competence-evaluation.html`  | 47            | `<span x-text="evaluation.careerPathName"></span>`                                                                                                                                                        |
| `packages/competence/bin/static/fragments/frame-employees-list.html`         | 168           | `<span x-text="employee.career.careerPathName"></span>`                                                                                                                                                   |
| `packages/competence/bin/static/fragments/frame-new-evaluation.html`         | 26            | `<span x-text="evaluation.careerPathName"></span>`                                                                                                                                                        |
| `packages/competence/bin/static/fragments/frame-new-evaluation.html`         | 61            | `<span x-text="evaluation.careerPathName"></span>`                                                                                                                                                        |
| `packages/competence/bin/static/fragments/frame-new-evaluation.html`         | 86            | `<option … x-text="member.name + ' — ' + member.careerPathName"></option>`                                                                                                                                |
| `packages/competence/bin/static/fragments/components/component-sidebar.html` | 156           | Sidebar shows `$store.tiApplication.configuration.employeeLevel.careerPathName` in the user block                                                                                                         |

### 3.2 Configuration / data / schemas

| File                                                                  | Line(s)                           | Reference                                                                                                              |
|-----------------------------------------------------------------------|-----------------------------------|------------------------------------------------------------------------------------------------------------------------|
| `packages/competence/bin/config/config.career-path-competencies.json` | full file                         | Top-level keys are `"SE01" / "PM01" / "BA01"`, each keyed by cycle `"2026-H1"` with a 9-element array                  |
| `packages/competence/bin/config/config.career-path-levels.json`       | full file                         | Filename only — content is the `N/J/R/S/X/T` ladder; structure stays, the filename moves to `config.stage-levels.json` |
| `packages/competence/bin/data/employee.schema.json`                   | 84, 95–98                         | `"careerPath"` listed under `career.required` and defined as `{ "type": "string", "minLength": 1 }`                    |
| `packages/competence/bin/data/seeders/employees.json`                 | 15, 33, 51, 69, 87, 105, 123, 141 | Eight employees, each carrying `"careerPath": "SE01"`/`"PM01"` (no `BA01` in the seed)                                 |
| `packages/competence/bin/data/seeders/evaluations.json`               | 10, 112, 217, 266                 | Four evaluation records with `"careerPath": "SE01"`/`"PM01"`                                                           |
| `packages/competence/package.json`                                    | 10, 11                            | `imports` map entries `#config-career-path-competencies`, `#config-career-path-levels`                                 |
| `packages/competence/CHANGELOG.md`                                    | 75, 85, 86, 127                   | Historical entries describing the move to `careerPath` in earlier versions                                             |
| `packages/competence/README.md`                                       | 52–60, 846                        | "Career Paths" section and the `getAllowedCompetencyCodes` step inside the Mermaid `Start Evaluation` sequence         |

### 3.3 Tests

No test files exist in `packages/competence/test/` (the directory itself does not exist). `package.json` declares `npm test` and `npm run test:json` scripts that point to `test/*.test.js` and `test/json-config-validation.test.js`, but those files are not present. There is therefore no test-side reference to `CareerPath*` to update — but the test infrastructure itself has to be created in Phase 1 (to satisfy the `npm run test:json` acceptance criterion) and Phase 2 (for the `node --test` suites).

### 3.4 Top-level guide / monorepo orientation

| File                            | Line(s) | Reference                                                          |
|---------------------------------|---------|--------------------------------------------------------------------|
| `.claude/commands/ti-engine.md` | 122     | `CareerPathCode: SE01, PM01, BA01` (in the Competence enums table) |

The brief expects this file to be at the repository root as `ti-engine.md`; it is not. See drift item D-1 below.

---

## 4. Drift Between Brief and Codebase (Flagged Only)

These items are inconsistencies between `.claude/commands/competence-framework-refactor.md` (the brief) and the current state of the codebase, as observed during Phase 0. They are surfaced here for the project owner's review **before** Phase 1 begins. They are not fixed in this phase.

### D-1. Orientation doc path

- **Brief**: §5 step 1 — "Read `ti-engine.md` at the repo root for monorepo orientation."
- **Reality**: There is no `ti-engine.md` at the repo root. The orientation doc exists at `.claude/commands/ti-engine.md` and is used as a Claude Code skill brief. The repo root contains `README.md` (general project description) but it does not enumerate package versions or enum names.
- **Brief**: §11.2 — "Update the root `ti-engine.md`: Replace `CareerPathCode: SE01, PM01, BA01` with `RoleFamilyCode: SE, …`. Add `CycleStatus` enum to the enum list. … Refresh the file list under Package: competence to reflect renamed files. Update the version number reference for the `competence` package."
- **Decision needed**: Either (a) treat `.claude/commands/ti-engine.md` as the file the Phase 6 documentation update should target, or (b) move/copy this file to the repo root.

### D-2. Schema folder path

- **Brief**: §5 step 5 — "Read all files in … `packages/competence/bin/data/schemas/`." §6.2 — "For every config file created or restructured in 6.1, add or update the corresponding schema in `packages/competence/bin/data/schemas/`."
- **Reality**: The folder `packages/competence/bin/data/schemas/` does not exist. Schemas live directly under `packages/competence/bin/data/`:
  - `competencies.schema.json`
  - `employee.schema.json`
  - `employees.schema.json`
  - `evaluation.schema.json`
  - `evaluations.schema.json`
  
  In addition, `packages/competence/bin/config/config.application.schema.json` lives next to the application config (not under `bin/data/`).
- **Decision needed**: Confirm Phase 1's new schemas (`schema.role-families.json`, `schema.active-competency-sets.json`, `schema.stage-levels.json`, updated `schema.competencies.json`) go where the others already live (`bin/data/`), or alternatively migrate everything into a new `bin/data/schemas/` folder. The two choices are visible to the existing path-alias/import infrastructure only if the schemas are referenced by `require()` / `imports` (they currently are not). The `npm run test:json` validator wiring depends on this choice.

### D-3. UI component vocabulary referenced in the brief is obsolete

- **Brief**: §3 item 6 — "Existing components include `.ti-icon` (Heroicons-backed), `.ti-button` (and `.ti-button.inline`), `.ti-data-field`, `.ti-content.pane`, `.ti-glass-btn-black` (with `.large`, `.on-screen`, `.primary`, `.is-active` variants), and the `tiToolbox` Alpine store."
- **Reality**:
  - `.ti-button` and `.ti-button.inline` — **not present**. The current button class is `.ti-btn` with modifiers `.primary`, `.ghost`, `.danger`, `.lg`, `.sm`, `.icon`, `.full` (e.g. `.ti-btn.sm.primary`).
  - `.ti-data-field` — **not styled**. Only the legacy CSS variables `--ti-data-field-*` remain at the top of `ti-framework.css`. The currently-styled form controls are `.ti-input`, `.ti-select`, `.ti-textarea` plus the label class `.ti-field-label`. (A read-only data-display pattern is achieved with `.ti-kv-grid` / `.ti-kv-label` / `.ti-kv-value` or with competence-specific `competence-eval-feedback-value` for inline values.)
  - `.ti-glass-btn-black` (with any variant) — **does not appear** in either theme or in any of the fragment templates. The only matches anywhere in the repo are inside the brief and the `web-framework/CHANGELOG.md` history.
  - `.ti-icon` ✓ — confirmed Heroicons-backed via `-webkit-mask-image: url("data:image/svg+xml,…")` data URIs. Used as a base with one variant class per icon (`.app-menu`, `.dashboard`, `.settings`, `.calendar`, `.schedule`, etc.) plus competence-specific `.employee-list`, `.lock`, `.warning`. The brief's reference is accurate but understates the actual count of available icons.
  - `.ti-content.pane` ✓ — present and accurate.
  - `tiToolbox` ✓ — present as an Alpine store with `formatDate`, `getCookie`, `getVisibleBox`, `clampToBox`, `deepMerge`, `generateAvatarStyle`, etc.
- **Decision needed**: The brief's design-consistency rule (§3 item 6) should be re-read against the v2 vocabulary. The Phase 3 UI work (cycle tree, subcategory pills, origin badges) should reuse `.ti-panel` / `.ti-card` / `.ti-status-pill` / `.ti-tag` / `.ti-grade-chip` / `.ti-empty-state`, and introduce new visual primitives only where these don't cover the need. New competence-specific classes should follow the established `competence-` namespace convention.

### D-4. Status-badge styling guidance is unimplementable

- **Brief**: §8.1 — "status (badge with `.ti-glass-btn-black` styling variants — `is-active` for `ACTIVE`, dimmed for `CLOSED`, default for `PLANNING`)."
- **Reality**: Per D-3, `.ti-glass-btn-black` is gone. The current status-badge primitive is `.ti-status-pill` with `.success`/`.info`/`.warn`/`.danger`/`.muted` variants (each pairs with a `.dot` child). The Employees List uses this primitive today (`<span class="ti-status-pill" x-bind:class="employee.evaluation.statusTone">`).
- **Decision needed**: Confirm that Phase 3 should use `.ti-status-pill` (mapping `PLANNING → .muted`, `ACTIVE → .success`, `CLOSED → .info` or similar) rather than the obsolete `.ti-glass-btn-black`.

### D-5. Cycle is hardcoded, not data-driven

- **Brief**: §6.4 — "Cycles: `createCycle`, `getCycle`, `getAllCycles`, `updateCycleStatus`, `getActiveCycle` …"; §7.3 — Cycle lifecycle state machine; §6.5 — destructive seeder loads the `2026-H2` cycle in `PLANNING` state.
- **Reality**: There is no Cycle entity at the data layer. The single active cycle is hardcoded as private fields on the `CompetenceFramework` singleton at `packages/competence/application/competence-framework.js:48–52`:
  ```js
  // TODO: These need to be configurable!
  #evaluationCycleID = "2026-H1";
  #evaluationCycleStart = "2026-01-15";
  #evaluationCycleDate = "2026-06-30";
  #evaluationCycleEnd = "2026-09-15";
  #evaluationCycleName = "Spring '26 cycle";
  ```
  These are exposed via getters (`evaluationCycleID`, `evaluationCycleStart`, `evaluationCycleDate`, `evaluationCycleEnd`, `evaluationCycleName`). All consumers reach for them directly. The configured cycle in `config.career-path-competencies.json` is **`2026-H1`**, not `2026-H2` as the brief assumes for the seed. Phase 1 must (i) move these fields to the new Cycle entity stored via `DataManager`, (ii) keep getter compatibility on the singleton or migrate consumers (the brief's "no backward compat" rule says migrate), (iii) seed `2026-H2` from the new active-competency-sets JSON.
- **Decision needed**: Confirm `2026-H2` is the intended seeded cycle (rather than `2026-H1`, which is what the codebase has today and what the in-flight pilot data references). Confirm what to do about the four extra fields (`Start`, `Date`, `End`, `Name`) — the brief only specifies `cycleID`, `lifecycle status`, `lockedAt`, `lockedBy`, plus an "Actual close date" column and a "Planned close date" column for the table view (§8.1). The Cycle entity should presumably carry: `cycleID`, `name`, `status`, `createdAt`, `plannedCloseDate`, `actualCloseDate`, `lockedAt`, `lockedBy`, plus possibly `start` and `managerReviewDeadline` to keep the dashboard cycle card and evaluation deadlines working.

### D-6. Existing baselines fail floor coverage

- **Brief**: §3 item — "Mandatory floor coverage for a cycle's Active Competency Set: validated against baseline only. Each of the nine subcategories (`E1, E2, E3, I1, I2, I3, C1, C2, C3`) must have at least one competency in the baseline of every active Role Family."
- **Reality**: `config.career-path-competencies.json` currently lists nine competency codes per career path (identical sets for `SE01`/`PM01`/`BA01` — they were the same nine in pilot). The nine codes are `E1-1, E1-2, E1-5, E2-3, E2-4, I2-1, C1-1, C3-2, C3-3`. By subcategory these cover only **E1, E2, I2, C1, C3** — **four subcategories (`E3`, `I1`, `I3`, `C2`) are missing** from every existing baseline. The brief acknowledges this (§6.1: "Extend it to cover all nine, drawing from the existing dictionary") so this is not new information — but the inventory makes it explicit. Phase 1 must select at least four additional competency codes (from the dictionary in `config.competencies.json`) to round out each of `SE/BA/PM` baselines for the seeded cycle.
- **Decision needed**: None — the brief already mandates the extension. The inventory just confirms the scope.

### D-7. Test infrastructure absent

- **Brief**: §6.6 — "Acceptance Criteria for Phase 1: `npm run test:json` passes."; §7.5 — Phase 2 adds four `node --test` files in `packages/competence/test/`.
- **Reality**: `packages/competence/test/` does not exist; neither does `test/json-config-validation.test.js`. The scripts in `package.json` reference them, but `npm test` and `npm run test:json` would both fail today.
- **Decision needed**: Implicitly, Phase 1 must also (a) create `packages/competence/test/`, (b) author `test/json-config-validation.test.js` as part of the JSON-schema work even though the brief doesn't explicitly call out the file. The brief language ("Update `npm run test:json` to validate against the new schema set") presupposes the test already exists, which is incorrect. Treat this as scope clarification.

### D-8. `evaluation.schema.json` lacks `careerPath` field

- **Brief**: §3 item 5 — every employee-record write produces an audit log entry; §7.4 — at evaluation creation, a snapshot is built and stored on the evaluation record.
- **Reality**: The evaluation schema (`packages/competence/bin/data/evaluation.schema.json`) currently has no `careerPath` field at the top level (no `roleFamily`, no `specialization`, no `snapshot` either). However, seeded evaluation records carry `"careerPath": "SE01"` and the application code reads `evaluation.careerPath`. So the schema is **incomplete relative to the existing data**. Phase 1 needs to add the new fields (`roleFamily`, optional `specialization`, `snapshot`, plus eventually `lockedAt`/etc. as relevant), AND must add or migrate the existing `careerPath` field treatment — but since the brief mandates "no backward compatibility," the schema should be rewritten cleanly with `roleFamily` and `specialization` and the `snapshot` array, dropping `careerPath` entirely. Existing seed data must be regenerated.

### D-9. `evaluation.schema.json` grade enum omits `N`

- **Brief**: not addressed.
- **Reality**: `evaluation.schema.json:gradeValue` enumerates `U|R|S|""`. The configuration-loader's `evaluationGrade` enum (`configuration-loader.js:86–91`) defines four grades: `S, R, U, N`. `N` (Not Utilized, weight 0.0) is therefore valid in code but not in the schema. This is a pre-existing schema bug, not caused by the refactor. Mention it here so the schema update in Phase 1 can fix it incidentally.

### D-10. `tester` README still references `seed.js`-style entry point that does not exist

- **Brief**: §6.6 — "The seeder runs cleanly against an empty Redis: `node bin/seed.js` (or whatever the existing entry point is)…"
- **Reality**: There is no `packages/competence/bin/seed.js`. The current seeding mechanism is implicit: setting `COMPETENCE_PRELOAD_DATA=true` in the environment causes `DataManager.initialize()` (in `packages/competence/application/data-manager.js:50–69`) to ingest `bin/data/seeders/employees.json` and `bin/data/seeders/evaluations.json` into Redis on startup. There is no audit-log seeder, no role-families seeder, no cycles seeder. Phase 1's "destructive seeder" must therefore be created from scratch — either as a new `bin/seed.js` executable (matching the brief's hint) or as a separately invokable function inside `DataManager.initialize()` gated by an env flag (matching the existing convention).
- **Decision needed**: Approach for the seeder. Recommended: a new `bin/seed.js` with a `--force` flag and `NODE_ENV !== "development"` guard, since the destructive nature makes it worth a dedicated entry point. The existing `COMPETENCE_PRELOAD_DATA` path can be retained or replaced.

### D-11. `data-objects.types.js` typedef language

- **Brief**: §3 item 10 — "Where the old name appears, replace it."
- **Reality**: `data-objects.types.js:174` defines `@typedef {"SE01"|"PM01"|"BA01"} CareerPathCodeValue`, and lines 92 and 114 reference the typedef as a JSDoc property type. The replacement typedef should be `@typedef {"SE"|"QE"|"BA"|"PM"|"XD"|"DA"|"IO"|"MC"|"PD"} RoleFamilyCodeValue` plus a `SpecializationCodeValue` (string, validated at runtime against the role-family configuration since the union of valid specialization codes is family-dependent). This is a Phase 1 task; flagged for visibility.

### D-12. README is full of pilot-era statements

- **Brief**: §11 implicitly assumes the README is updated. §3 item 10 says "no backward compatibility."
- **Reality**: `packages/competence/README.md` includes a "Career Paths" section (lines 52–60), the Mermaid sequence diagram `Start Evaluation` step (line 846 — `Server ->> CF: getAllowedCompetencyCodes(careerPath, cycleID)`), and the Step 1 — Appraisal Cycle Start *(planned)* commentary stating "the cycle ID and date are currently hardcoded." Phase 6 must rewrite the README to reflect Role Family + Specialization + Cycle Lifecycle. The brief's §11.2 mentions only the root `ti-engine.md` for documentation refresh; the README is not explicitly called out but is the more user-facing of the two.
- **Decision needed**: Confirm Phase 6 also rewrites `packages/competence/README.md`, or move it out of scope.

### D-13. Sidebar shows `careerPathName` from the user profile

- **Reality**: `packages/competence/bin/static/fragments/components/component-sidebar.html:156` derives the sub-line of the user block from `$store.tiApplication.configuration.employeeLevel.careerPathName`. That source field is populated server-side. Phase 4 (or Phase 5) needs to migrate this to `roleFamilyName · specializationName` (with `specialization` optional) — flagged because it lives in a framework component, not a competence fragment, and is easily missed when scanning competence-only changes.

### D-14. Several copy strings already say "Career Path"

- **Reality**: `bin/static/fragments/frame-employees-list.html:135` (`x-text-label="interface.employees.col.career-path">CAREER PATH</span>`) and the localization keys it references will need new labels (`role-family`, `specialization`). Any en/bg key under `interface.*` mentioning career path is in scope for Phase 4/5 work. The label JSON does not yet contain `role-family.*` keys; they need to be added.

---

## 5. Resolutions (from project owner)

Decisions taken on the drift items in §4. These supersede any conflicting wording in the brief; Phase 1+ work follows the decisions below.

**Overall framing**: the brief was authored against an older state of the codebase (pre UI/UX overhaul, before the Design System v2 migration). The architectural directions in the brief — three-dimensional competency model, Active Competency Set, snapshot semantics, cycle lifecycle, validation rules — all stand intact. What needs re-mapping is the design vocabulary and a handful of path/seed details.

### D-1 — Orientation doc

- **Decision**: `.claude/commands/ti-engine.md` is the authoritative orientation doc. Phase 6's §11.2 documentation refresh targets this file (not a non-existent root `ti-engine.md`).

### D-2 — Schema folder migration

- **Decision**: Migrate all schemas to a new `packages/competence/bin/data/schemas/` folder during Phase 1.
- **In scope of migration**: the five existing schemas in `bin/data/` — `competencies.schema.json`, `employee.schema.json`, `employees.schema.json`, `evaluation.schema.json`, `evaluations.schema.json` — plus the new schemas added by Phase 1 (`schema.role-families.json`, `schema.active-competency-sets.json`, `schema.stage-levels.json`, plus any new ones for cycles and audit log).
- **Out of scope**: `packages/competence/bin/config/config.application.schema.json` stays next to its config (its `$schema` reference in `config.application.json` is a relative-name link to the sibling file).
- **Naming convention**: keep the existing `<thing>.schema.json` form for renamed files; the brief's `schema.<thing>.json` form is fine for new files. Be consistent within the new folder — recommend standardising on `<thing>.schema.json` for all (since five of the existing ones already use it).

### D-3 / D-4 — Design vocabulary mapping

- **Decision**: use the Design System v2 vocabulary throughout the refactor. The multi-theme abstraction (CSS custom properties keyed by `[data-theme="daylight"]` / `[data-theme="glass"]`) is preserved and respected.
- **Mapping (for Phase 3+ UI work)**:
  - Status badges (cycle list, tree nodes, validation state) → `.ti-status-pill` with semantic variant (`PLANNING → .muted` or `.info` muted, `ACTIVE → .success`, `CLOSED → .info` dimmed, validation `⚠ → .warn`, validation `✓ → .success`, validation `— intentionally empty → .muted`). Use the framework's `.dot` indicator child.
  - Buttons → `.ti-btn` with modifiers (`.primary`, `.ghost`, `.danger`, `.sm`, `.lg`, `.icon`, `.full`).
  - Form controls → `.ti-input`, `.ti-select`, `.ti-textarea`, `.ti-field-label`.
  - Panels and cards → `.ti-panel` (with `.ti-panel-head` / `.ti-panel-title`) and `.ti-card`.
  - Read-only key/value display → `.ti-kv-grid` / `.ti-kv-label` / `.ti-kv-value`.
  - Small inline pill/code labels (e.g. e-CF tag, origin badge, competency code) → `.ti-tag` (`.mono` variant for monospace codes).
  - Empty states → `.ti-empty-state` (+ icon/title/desc children).
  - Avatars → `.ti-avatar` (`.xs`/`.sm`/`.lg`/`.xl`), `$store.tiToolbox.generateAvatarStyle(...)` for the bg colour.
  - Grade chips remain `.ti-grade-chip` for evaluation form (Phase 5).
  - Toasts (for "Cycle locked", "Cycle closed", "Saved", error notifications) → `.ti-toast` stack.
- **New visual primitives needed by the brief** (subcategory pill, origin badge, tree node, cap-usage indicator, floor-coverage pill row) get competence-namespaced classes (`competence-subcat-pill`, `competence-origin-badge`, `competence-cycle-tree-*`, etc.), composed from v2 tokens and the framework primitives above. No bespoke colours; everything keyed off `--accent`, `--success`, `--warn`, `--danger`, `--muted`, `--bg-*`, `--fg-*`, `--border*`, `--s-*`, `--fs-*`, `--r-*`, `--dur-*`.
- **Themes**: every new screen/component validated under both `[data-theme="daylight"]` (default) and `[data-theme="glass"]`. Toggle via the existing sidebar toggle / `localStorage["ti-theme"]`.

### D-5 — Cycle entity fields

- **Decision**: the new Cycle entity carries the full set of fields currently used in the app, extended with the lifecycle additions from the brief.

  | Field             | Notes                                                                                                                                                                        |
  |-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
  | `cycleID`         | String, e.g. `"2026-H2"`. Auto-suggested `YYYY-Hx`, editable in create form, uniqueness validated.                                                                           |
  | `name`            | Free-text string, e.g. `"Autumn '26 cycle"`.                                                                                                                                 |
  | `status`          | `PLANNING` / `ACTIVE` / `CLOSED`. One-way transitions per §7.3.                                                                                                              |
  | `cycleStart`      | Start date of the cycle. Carries through from existing `evaluationCycleStart`.                                                                                               |
  | `cycleDate`       | Manager review deadline (used by the dashboard's cycle progress bar and the "days until manager review deadline" stat). Carries through from existing `evaluationCycleDate`. |
  | `cycleEnd`        | Planned close date — what the brief calls "Planned close date" in the cycle list. Carries through from existing `evaluationCycleEnd`.                                        |
  | `actualCloseDate` | Set on the `ACTIVE → CLOSED` transition. Null before close.                                                                                                                  |
  | `lockedAt`        | Set on the `PLANNING → ACTIVE` transition. Null before lock.                                                                                                                 |
  | `lockedBy`        | Employee ID of the actor that locked. Null before lock.                                                                                                                      |
  | `createdAt`       | Set at creation time.                                                                                                                                                        |
  | `createdBy`       | Employee ID of the creator (Supervisor).                                                                                                                                     |

- The five hardcoded fields on `CompetenceFramework` (lines 48–52) are removed; all consumers read from `DataManager.getCycle(cycleID)` or `DataManager.getActiveCycle()`. The cycle getters on the singleton either go away (per "no backward compat") or wrap the active-cycle lookup — recommend removing them outright and migrating consumers.
- **Seeded cycle**: `2026-H2` in `PLANNING` state (per brief §6.5). The current `2026-H1` pilot data is discarded entirely (destructive reseed). The H2 dates should be chosen to make manual testing sensible (e.g. `cycleStart: 2026-07-01`, `cycleDate: 2026-11-30`, `cycleEnd: 2027-01-15`) — exact values up to whoever seeds; document in the seed file.

### D-6 — Baseline coverage

- **Decision**: extend each baseline (`SE`, `BA`, `PM`) for the seeded `2026-H2` cycle to cover all nine subcategories (`E1`, `E2`, `E3`, `I1`, `I2`, `I3`, `C1`, `C2`, `C3`) by drawing additional competency codes from the dictionary in `config.competencies.json`. Floor-coverage validation (§7.2 rule 1) must pass for the seed; the seed is the canonical "well-formed cycle" reference used in tests.

### D-7 — Test infrastructure

- **Decision**: create `packages/competence/test/` in Phase 1. Author `test/json-config-validation.test.js` covering all schemas in the new `bin/data/schemas/` folder. Phase 2 adds the four resolution / validation / lifecycle / snapshot test files into the same directory.

### D-10 — Seeder approach

- **Decision**: extend the existing `COMPETENCE_PRELOAD_DATA` env-var gate inside `DataManager.initialize()`. No separate `bin/seed.js` entry point. The destructive seeder:
  1. Wipes the relevant Redis-JSON collections (role families, specializations, cycles, active competency sets, employees, evaluations, audit log) — competencies dictionary and stage-levels are reloaded too on each run for simplicity (the brief's "not on every run unless explicitly requested" caveat is dropped since we're using the env-var gate not a separate script).
  2. Loads the four config files (`config.role-families.json`, `config.competencies.json`, `config.stage-levels.json`, `config.active-competency-sets.json`).
  3. Creates the `2026-H2` cycle in `PLANNING` state and the seeded active competency sets per family.
  4. Seeds the test employees (≥10, mixed `SE`/`BA`/`PM` families, mixed specializations, mixed stage-levels) from the existing `bin/data/seeders/employees.json` (rewritten to match the new schema).
  5. No evaluations are seeded — the cycle is in `PLANNING` and has no in-flight evaluations.
- Guard the destructive behaviour as the existing path already does: `COMPETENCE_PRELOAD_DATA=true` in `.env` triggers it; production environments don't have this set.

### D-12 — README scope

- **Decision**: Phase 6 rewrites `packages/competence/README.md` in addition to `.claude/commands/ti-engine.md`. The README's "Career Paths" section, the `Start Evaluation` Mermaid step (line 846), the Step 1 — Appraisal Cycle Start *(planned)* commentary, and any references to hardcoded cycle ID/date get replaced with the new Role Family / Specialization / Cycle Lifecycle narrative.

### D-8, D-9, D-11, D-13, D-14 — Picked up incidentally

- **D-8** (`evaluation.schema.json` lacks `careerPath`): Phase 1 rewrites the evaluation schema with `roleFamily`, optional `specialization`, and the `snapshot` array. Old `careerPath` field drops out; existing seed data is regenerated.
- **D-9** (`gradeValue` enum missing `N`): Phase 1 schema rewrite fixes the enum to `S|R|U|N|""`.
- **D-11** (`data-objects.types.js` typedefs): Phase 1 replaces `CareerPathCodeValue` with `RoleFamilyCodeValue` (the nine-code union) and adds `SpecializationCodeValue` (loose string typedef plus runtime validation against the family's spec list).
- **D-13** (sidebar `careerPathName`): Phase 4 or 5 migrates `component-sidebar.html:156` and the server-side `configuration.employeeLevel` source to surface `roleFamilyName · specializationName · stageLevel` (with `specialization` shown only if set).
- **D-14** ("Career Path" copy strings/labels): Phase 1 adds `role-family.*` and `role-family.<family>.specialization.*` localization keys for both `en` and `bg`. Phase 4 migrates the Employees-List column label (and any other fragments still saying "CAREER PATH") to use the new keys.

---

## 6. Acceptance Check Summary

- ✓ Design-token and component inventory captured (§1), with example usages from the two existing screens.
- ✓ Call-site inventory for the old `CareerPath` API captured (§2), with file paths and line numbers.
- ✓ Reference inventory for the old enum and codes captured (§3), covering code, configuration, schemas, data seeds, fragments, package metadata, README, and CHANGELOG.
- ✓ Drift flagged (§4) — fourteen items, no fixes applied.
- ✓ Project-owner resolutions captured (§5) — every drift item has a decision; Phase 1 may proceed.

This concludes Phase 0.
