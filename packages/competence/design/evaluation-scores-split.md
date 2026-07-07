# Design — Evaluation (grading) vs. Scores (results) screen separation

## Meta

- **Status:** Implemented (2026-06-30)
- **Date:** 2026-06-30
- **Packages:** `competence` (primary) + `web-framework` (minor: a topbar `setScreenTitle` override)
- **Scope:** Two screens shared one fragment (`frame-competence-evaluation.html` / `competenceEvaluation`) and, once an evaluation reached **Ready**, showed nearly the same thing. Split their concerns: the **Competence Evaluation** (grading) screen keeps only a compact final-score panel + a "results are ready" hand-off; the **My Results** screen — renamed **Scores** — becomes the dedicated read-only results view and is also reachable by an authorized manager/supervisor for a specific employee.
- **Owner:** Boris Kostadinov
- **Related:** [[screen-access-control]] (the per-fragment role gate, now in web-framework), the 3.4.0 Statistics & Results reporting, the 3.7.0 role-aware results header.

---

## 1. Problem

`competence-evaluation` and `my-results` are the **same** Alpine component + fragment; mode is derived from the URL (`isMyResults` = path contains `my-results`). On a Ready evaluation, the grading screen rendered the full "Your Results" statistics block (hero, radar, source bars, strengths/gaps, history) — duplicating the My Results screen. The My Results screen, conversely, carried grading-screen chrome it did not need (the right-column deadline/peer panels and the workflow status track).

## 2. Locked decisions

1. **Grading screen = grade + hand-off, not stats.** Hide the entire "Your Results" section on `competence-evaluation` (gate it `hasResults() && isMyResults`). Replace it with:
   - a **compact final-score panel** in the right column (results-bearing roles only — `userRole === 1 || 2`), always present, stating *"Not yet available"* until Ready, then showing the score + band; and
   - a **"results are ready" info bar** with a button (shown once `hasResults()`), linking to the Scores screen.
2. **Scores screen = the results view *only*.** Rename **Results → Scores** everywhere user-visible (sidebar, topbar, page H1, section header), role-aware: **"My Scores"** for the evaluee viewing their own; **"{name}'s Scores" / "Performance Scores"** for a manager/supervisor. Remove the right column (employee card spans full width) and strip the status pill + workflow track + warnings to the **lightweight card** shape (same as the New Evaluation screen) by gating them `!isMyResults`. **Also hidden** (they belong to the grading screen, where they remain): the per-competency grading tables (self/manager/team grades), the grade guide, the feedback section, and the sticky action bars. The Scores screen shows only the results summary — final score, category scores, radar, source comparison, strengths/gaps, history.
3. **Managers reach an employee's Scores via the same screen.** The info-bar button opens `my-results` for the evaluee, and `my-results?employeeID=X` for a manager/supervisor. One screen, role-aware labels (matches "the My Results screen … accessible to both").
4. **Backend: one authorized results loader.** Generalize `#loadMyResults` → `#loadResults(session, employeeID)`: self always allowed; another employee requires `isSuperiorManagerOfEmployee(caller, target)` **or** supervisor, else 403. **EMPLOYEE-level anonymization for every viewer** (a manager viewing results never needs peer-individual grades — consistent with the 3.4.0 privacy invariant). Returns `isOwnResults`. Includes READY **and** CLOSED (what `load-evaluation` cannot serve). The payload **drops `feedback`** (unused once the feedback section is hidden); `competencies` (the tree) and `evaluation.grades` stay — `buildResults` needs them for the radar/source/strengths/gaps charts (category & subcategory names + per-source grade weights).
5. **Topbar correctness.** A manager's Scores view must not read "My". Added a small, reusable `tiApplication.setScreenTitle(title)` override in the framework topbar (cleared on navigation); the component sets it to *Performance Scores* only when viewing another's results.

## 3. Self vs. other distinction

`isMyResults` = on the results screen (route). `isOwnResults` = viewing one's **own** scores: computed client-side (`!employeeID || employeeID === tiApplication.user.employeeID`) and confirmed by the backend payload. All self/other labels (page H1/desc, section header, info-bar copy, topbar override) branch on `isOwnResults` / `userRole`, never on `isMyResults` alone.

## 4. Files

- **`competence-web-application.js`** — `#loadMyResults` → `#loadResults(session, employeeID)` with the authorization branch + `isOwnResults`; dispatcher forwards `options.query.employeeID`.
- **`competence-user-interface.js`** — `isOwnResults` state; `loadEmployeeEvaluation` computes it + sets the topbar override + forwards `employeeID` to `load-my-results`; `applyData` refines `isOwnResults`; `loadHistory` forwards `employeeID` whenever present; `getPageTitle/getPageDesc/getResultsTitle/getResultsDesc` branch on `isOwnResults`; new `getFinalScoreBandName`, `getResultsReadyTitle`, `getResultsReadyAction`, `openResults`.
- **`frame-competence-evaluation.html`** — results section gated to the Scores view; right column + status pill + track + warnings gated `!isMyResults`; new final-score panel + "results ready" info bar.
- **`competence-main.css`** — right column `align-self: stretch` + equal-flex children; new `.competence-results-ready-bar`.
- **`competence-labels.json`** — Results→Scores renames (`page.my-results-*`, `results.title/title-other`, `navigation.my-results`, `topbar.my-results`); new `page.results-other-*`, `topbar.results-other`, `results.final-score-pending`, `results-ready.*` (en + bg, BG pending native review).
- **`web-framework/.../ti-framework.js`** — `screenTitleOverride` + `setScreenTitle`, cleared on navigation; topbar prefers the override.

## 5. Privacy & access notes

The Scores screen fragment (`my-results`) stays public at the fragment-gate level (any authenticated user has their own scores); the **data** is gated by `#loadResults` — a random employee requesting `my-results?employeeID=X` is rejected 403, exactly as the rest of the app gates data. Manager scope is the same org-superior predicate used by `load-evaluation` and Team analytics.

## 6. Versioning

- **competence**: minor (`feat(competence)`), CHANGELOG entry; requires web-framework ≥ the gate/`setScreenTitle` release.
- **web-framework**: minor (`feat(web-framework)`) for `setScreenTitle` + (see [[screen-access-control]]) the reusable fragment-access gate.

---

## Implementation log

- Backend `#loadResults` generalization + authorization + `isOwnResults`; dispatcher employeeID forwarding.
- Component: `isOwnResults`, role-aware titles, final-score + results-ready helpers, `openResults`, topbar override, history employeeID forwarding.
- Fragment: results-section gate, right-column/card stripping on Scores, final-score panel, info bar; grading tables + grade guide + feedback section + sticky bars gated `!isMyResults` (Scores = results summary only); `#loadResults` strips the now-unused `feedback`.
- CSS: right-column even distribution + `.competence-results-ready-bar`.
- Labels: Results→Scores renames + new keys (en/bg).
- web-framework: `setScreenTitle` topbar override.
- Verification: web-framework 124/124, competence 273/273 + JSON 19/19; ESLint clean; adversarial multi-agent review.
