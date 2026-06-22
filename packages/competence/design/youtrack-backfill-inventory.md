# Design — YouTrack backfill: project history as epics & feature cards

## Meta

- **Status:** ✅ Complete (2026-06-18) — Phases A–D done: 9 epics, 44 feature cards, 7 forward cards, 12 KB articles in YouTrack `CA`
- **Date:** 2026-06-18
- **Package:** `competence` (project-management artefact; **no code changes**)
- **Scope:** Reconstruct the Competence App's delivered history into YouTrack project `CA` as a tidy **Epic → Feature** hierarchy, plus a **seeded forward pipeline** and **mirrored design docs** (Knowledge Base). Intended as a showcase of AI-native engineering traceability.
- **Owner:** Boris Kostadinov
- **Sources mined:** `packages/competence/CHANGELOG.md` (20 releases), the dated competence git history (161 commits, 2025-11-19 → 2026-06-18), and `packages/competence/design/**`.
- **Target:** YouTrack `CA` (`https://belleal.youtrack.cloud`), linked to GitHub `Belleal/ti-engine`.

---

## 1. Goal & approach

Represent the **current state of the app** and **how it got here** in YouTrack, reconstructed from repo artefacts rather than authored by hand. Decisions locked with the user:

- **Structure:** capability **Epics** + **version tags** (product-shaped, still sliceable by release).
- **Granularity:** ~**9 epics / ~44 feature cards** (one card per coherent feature; sub-points summarised in the card body).
- **Extras (all opted in):** real **ship dates**, **design-docs → Knowledge Base**, a **seeded forward pipeline**, and **effort signals**.

### 1.1 Hard constraints (shape everything below)

1. **No delete via MCP.** Cards can be created/updated but not deleted by me — so this doc is reviewed *before* anything is created, then built incrementally with checkpoints. Mistakes = manual UI cleanup.
2. **No backdating of `created`.** YouTrack stamps `created` = today. The true timeline is preserved via the custom **`Shipped`** date field (per feature) + version tags.
3. **No project-config edits via MCP.** I work within the fields you configured (`Type`, `State`, `Stage`, `Priority`, `Shipped`, `Estimation`, `Spent time`).

---

## 2. Field & encoding conventions

| Field                       | Delivered feature                               | Epic                                | Forward-pipeline item               |
|-----------------------------|-------------------------------------------------|-------------------------------------|-------------------------------------|
| **Type**                    | `Feature` (or `Bug`/`Task` where apt)           | `Epic`                              | `Feature`/`Task`/`Bug`              |
| **State**                   | `Verified`                                      | `Verified` (when all children done) | `Open` (or `In Progress` if active) |
| **Stage**                   | `Done`                                          | `Done`                              | `Backlog` (or `Develop` if active)  |
| **Priority**                | `Normal`; `Major` for the two landmark releases | `Normal`                            | `Normal`                            |
| **Shipped**                 | version release date (`yyyy-MM-dd`)             | latest child ship date              | empty                               |
| **Estimation / Spent time** | left empty — *no fabricated effort*             | empty                               | optional real estimate              |

- **Effort signal** (opted in) goes in the **card body**, not the time fields: `Commits: N · Phases: M` derived from git, plus 1–2 representative **GitHub commit links** (`…/Belleal/ti-engine/commit/<sha>`).
- **Links:** **every feature/task is a `subtask of` its Epic** when one fits — delivered *and* forward/backlog; nest under an epic unless truly standalone. Supersession/relationships use **`relates to`** (e.g. the 164-entry catalog → the 108-competency rebuild).
- **Tags:** version (`v1.0.0` … `v3.3.1`), area (`area:framework`, `area:cycles`, …), and `changelog-gap` where a feature is evidenced only by commits.

> **Open question A (Checkpoint 1):** confirm the `State`=`Verified` / `Stage`=`Done` pairing for completed work (alternative: `State`=`Fixed`). And confirm `Major` priority only on the two landmark releases.

---

## 3. Tag taxonomy

- **Version:** `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.1.0`, `v1.2.0`, `v1.3.0`, `v1.3.1`, `v1.4.0`, `v1.5.0`, `v2.0.0`, `v2.1.0`, `v3.0.0`, `v3.1.0`, `v3.2.0`–`v3.2.4`, `v3.3.0`, `v3.3.1`.
- **Area (one per epic):** `area:framework`, `area:cycles`, `area:org`, `area:evaluation`, `area:scheduling`, `area:dashboard`, `area:config-admin`, `area:design-system`, `area:platform`.
- **Special:** `changelog-gap` (commit-only evidence), `landmark` (the two major releases), `forward` (pipeline).

---

## 4. Release → date map (for `Shipped`)

| Ver           | Shipped         | Ver                | Shipped       | Ver         | Shipped    |
|---------------|-----------------|--------------------|---------------|-------------|------------|
| 1.0.0         | 2025-11-19      | 1.4.0              | 2026-04-03    | 3.0.0       | 2026-06-01 |
| 1.0.1         | 2026-01-30      | 1.5.0              | 2026-04-15    | 3.1.0       | 2026-06-16 |
| 1.0.2         | 2026-02-11      | *(UI/UX overhaul)* | 2026-05-14→20 | 3.2.0       | 2026-06-16 |
| 1.1.0         | 2026-03-17      | 2.0.0              | 2026-05-22    | 3.2.1–3.2.4 | 2026-06-17 |
| 1.2.0         | 2026-03-23      | 2.1.0              | 2026-05-28    | 3.3.0       | 2026-06-18 |
| 1.3.0 / 1.3.1 | 2026-03-25 / 26 |                    |               | 3.3.1       | 2026-06-18 |

---

## 5. Epics & feature cards

Nine epics (`Type: Epic`). Each feature below becomes one card, `subtask of` its epic.

### E1 — Competency Framework & Content `area:framework`
| # | Feature                                                                                    | Ver   | Shipped    | Summary                                                                             |
|---|--------------------------------------------------------------------------------------------|-------|------------|-------------------------------------------------------------------------------------|
| 1 | Three-dimensional competency model (Role Family × Specialization × Stage-Level) `landmark` | 2.0.0 | 2026-05-22 | Replaces the 2-D Career-Path model; cycles become first-class. Breaking.            |
| 2 | Competency dictionary rebuild — 108 competencies `landmark`                                | 3.0.0 | 2026-06-01 | 164→108 finalized (SE 31 / BA 22 / PM 25 + 30 shared); 64 retired, `I1` renumbered. |
| 3 | Bilingual localization (EN/BG) for all 108                                                 | 3.0.0 | 2026-06-01 | Complete name/description + 6 scope anchors per language.                           |
| 4 | Relevancy via archetype curves                                                             | 3.0.0 | 2026-06-01 | 168 rows expanded from 7 archetype curves.                                          |
| 5 | Role-family competency pool (applicability universe)                                       | 3.1.0 | 2026-06-16 | `config.role-family-competencies.json`; `pool-membership` lock rule.                |
| 6 | Per-role relevancy split + 164-entry catalog *(precursor)*                                 | 2.1.0 | 2026-05-28 | Split relevancy out of competencies; grew catalog 64→164. `relates to` #2/#4.       |

### E2 — Cycle Management `area:cycles`
| # | Feature                                                | Ver   | Shipped    | Summary                                                                          |
|---|--------------------------------------------------------|-------|------------|----------------------------------------------------------------------------------|
| 1 | Cycle lifecycle state machine (PLANNING→ACTIVE→CLOSED) | 2.0.0 | 2026-05-22 | `lockCycle`/`closeCycle`; single-active-cycle invariant.                         |
| 2 | Cycle Management screen                                | 2.0.0 | 2026-05-22 | List, create, lock, close, validation-errors modals.                             |
| 3 | Cycle Setup screen (baseline/specialization editor)    | 2.0.0 | 2026-05-22 | Two-pane tree editor; reshaped in 2.1.0.                                         |
| 4 | Lock-validation engine                                 | 2.0.0 | 2026-05-22 | Floor/cap/integrity/no-empty + later `pool-membership`, `family-not-configured`. |
| 5 | Family exclusion from a cycle                          | 3.2.0 | 2026-06-16 | Lock cycles with only completable families.                                      |
| 6 | Editable team-feedback deadline (cycle-level)          | 3.3.0 | 2026-06-18 | `cycle.teamFeedbackDeadline`, editable in Cycle Setup.                           |

### E3 — Employee & Organization Management `area:org`
| # | Feature                                            | Ver   | Shipped    | Summary                                                      |
|---|----------------------------------------------------|-------|------------|--------------------------------------------------------------|
| 1 | Organization chart engine (graphology)             | 1.2.0 | 2026-03-23 | `OrganizationManager` singleton; manager/context resolution. |
| 2 | Employees list / org-tree screen                   | 1.3.0 | 2026-03-25 | Role-aware visibility, evaluation access.                    |
| 3 | Hierarchy-aware manager authorization              | 1.3.1 | 2026-03-26 | Superior-manager checks through the unit hierarchy.          |
| 4 | Employee Management screen (master/detail + audit) | 2.0.0 | 2026-05-22 | Tabbed editor, per-field audit, create/update gating.        |
| 5 | Audit timeline primitive                           | 2.1.0 | 2026-05-24 | Shared `.competence-audit-timeline` (People + Cycles).       |

### E4 — Evaluation Workflow `area:evaluation`
| # | Feature                                               | Ver   | Shipped    | Summary                                                                                  |
|---|-------------------------------------------------------|-------|------------|------------------------------------------------------------------------------------------|
| 1 | Competence evaluation form (foundation)               | 1.0.1 | 2026-01-30 | Nested competency tree; self/manager/team grade inputs.                                  |
| 2 | Evaluation persistence + draft/submit + anonymization | 1.0.2 | 2026-02-11 | Redis-backed; role-based grade anonymization.                                            |
| 3 | Start-evaluation flow + HTTP error semantics          | 1.1.0 | 2026-03-17 | Active-evaluation guard; 401/404/422 discipline.                                         |
| 4 | New Evaluation screen (team selection)                | 1.4.0 | 2026-04-03 | Team-member picker at creation.                                                          |
| 5 | Snapshot-driven evaluation (frozen Active Set)        | 2.0.0 | 2026-05-22 | `buildEvaluationSnapshot`; snapshots frozen at creation.                                 |
| 6 | Evaluation context strip + origin/e-CF badges         | 2.0.0 | 2026-05-22 | Role-family/spec/stage strip; design-system aligned in 3.2.2.                            |
| 7 | Team-feedback finalize + read-only facilitator        | 3.3.0 | 2026-06-18 | `finalizeTeamFeedback`; supervisor facilitator view. `[[dashboard-team-feedback-tasks]]` |
| 8 | Reveal-at-Ready for employee                          | 3.3.1 | 2026-06-18 | Manager grade + team cumulative revealed at `Ready`; peers stay anonymous.               |

### E5 — Interview Scheduling `area:scheduling`
| # | Feature                                     | Ver   | Shipped    | Summary                                         |
|---|---------------------------------------------|-------|------------|-------------------------------------------------|
| 1 | Manager availability calendar               | 1.5.0 | 2026-04-15 | Weekly grid; available/busy/booked slot states. |
| 2 | Interview scheduling & booking (supervisor) | 1.5.0 | 2026-04-15 | Book/cancel slots for READY evaluations.        |

### E6 — Dashboard & Tasks `area:dashboard` — **proposed pilot epic**
| # | Feature                                                         | Ver   | Shipped    | Summary                                                                                             |
|---|-----------------------------------------------------------------|-------|------------|-----------------------------------------------------------------------------------------------------|
| 1 | Dashboard tasks engine (self-eval / interview / manager-review) | 3.2.4 | 2026-06-17 | Status-casing fix; real tasks + "All caught up!" empty state.                                       |
| 2 | Team-feedback & team-finalize task cards (TaskResolver)         | 3.3.0 | 2026-06-18 | Pure `task-resolver.js`; cards open the colleague's evaluation. `[[dashboard-team-feedback-tasks]]` |

### E7 — Configuration Admin (live editing) `area:config-admin` `changelog-gap`
| # | Feature                                            | Ver   | Shipped    | Summary                                                                  |
|---|----------------------------------------------------|-------|------------|--------------------------------------------------------------------------|
| 1 | Store-backed configuration loader + admin registry | 3.1.0 | 2026-06-02 | Live config edits; configs registered with the framework admin registry. |
| 2 | Admin Configuration landing + admin-gated nav      | 3.1.0 | 2026-06-03 | Admin home (commit `C2`).                                                |
| 3 | Competency text editor (bilingual BG-review)       | 3.1.0 | 2026-06-03 | Compose/decompose editor (commits `b196a6d`, `C3`).                      |
| 4 | Relevancy archetype editors (assignment + curve)   | 3.1.0 | 2026-06-03 | Editable archetypes + per-competency assignment (commits `D1`–`D3`).     |
| 5 | Role-families editor                               | 3.1.0 | 2026-06-03 | Composite editor + integrity guard (commits `E1a`, `E1b`).               |

### E8 — Design System & UX `area:design-system`
| # | Feature                                                                | Ver       | Shipped       | Summary                                                                          |
|---|------------------------------------------------------------------------|-----------|---------------|----------------------------------------------------------------------------------|
| 1 | New UI/UX design system rollout                                        | (pre-2.0) | 2026-05-14→20 | Full visual redesign (~40 commits; terse messages — represented as one feature). |
| 2 | Shared `.ti-*` primitive consolidation                                 | 2.0.0+    | 2026-05-22    | page-header/panel/data-grid/icon/modal/spacer primitives.                        |
| 3 | Alpine CSP-safe hardening                                              | 2.1.0     | 2026-05-22    | `hasRole`, object-form `capBarStyle`, no inline styles/`?.`.                     |
| 4 | Screen reshapes to refreshed handoff (Cycle Setup, People, Evaluation) | 2.1.0     | 2026-05-24    | Master/detail chrome, audit timeline, evaluation panels.                         |
| 5 | Responsive master/detail viewport layouts                              | 3.2.3     | 2026-06-17    | Internal pane scrolling; pinned heads; narrow-viewport collapse.                 |

### E9 — Platform & Quality `area:platform`
| # | Feature                                                               | Ver    | Shipped    | Summary                                                                |
|---|-----------------------------------------------------------------------|--------|------------|------------------------------------------------------------------------|
| 1 | Redis-backed DataManager                                              | 1.0.2  | 2026-02-11 | Replaces `data-loader`; cache-backed storage/retrieval.                |
| 2 | JSON-schema + integrity test suites                                   | 1.0.1+ | 2026-01-30 | Schema validity + reference/coverage integrity across configs & seeds. |
| 3 | Content-integrity guard                                               | 3.0.0  | 2026-06-01 | Fails on any empty competency name/description/scope.                  |
| 4 | Relevancy/label build generators                                      | 3.0.0  | 2026-06-01 | `build-competency-relevancy.js` single source of truth.                |
| 5 | Code-quality pass (Promise-chain validators, JSDoc, error/HTTP codes) | 3.1.0  | 2026-06-15 | Resolve code-review findings; conventions alignment.                   |

**Total: 9 epics + 44 feature cards.**

---

## 6. Forward pipeline (seeded; `forward`)

Evidence-based "not yet" items pulled from changelog notes & the design log — `State: Open`, `Stage: Backlog` unless noted. **For your confirmation/pruning.**

| # | Item                                                                                                                                 | Evidence                                           | Epic |
|---|--------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------|------|
| 1 | Inline editor for the role-family-competency **pool**                                                                                | 3.1.0: "read-only — no inline editor yet"          | E7   |
| 2 | Populate the 6 unpopulated families (QE/XD/DA/IO/MC/PD)                                                                              | 3.1.0: carry shared canonical only                 | E1   |
| 3 | Surface the evaluation **finalize audit entry** in the UI                                                                            | 3.3.0: "recorded but not yet surfaced"             | E4   |
| 4 | BG archetype-label native-speaker review                                                                                             | 3.0.0: "BG pending native-speaker review"          | E1   |
| 5 | Populate **e-CF mappings** (currently placeholder arrays)                                                                            | 2.0.0: `eCFMapping` defaults empty                 | E1   |
| 6 | Enforce self/manager evaluation **deadlines**                                                                                        | 3.3.0 design: initialized `""`, unenforced         | E4   |
| 7 | **Adopt** the `@ti-engine/web-framework` **tasks module** (upgrade) — building the module itself is a separate web-framework project | `[[dashboard-team-feedback-tasks]]` two-stage plan | E6   |

---

## 7. Knowledge Base plan (design-docs → articles)

Mirror the design docs as KB articles, cross-linked from their epics:

- **Competency Content** ← `competency-master-index`, `competency-definitions-final`, `competency-relevancy-model`, `competency-bg-translations` → linked from **E1**.
- **Design Records** ← `completed/refactor-phase0-inventory`, `completed/rebuild-phase0-inventory`, `completed/role-family-pool-restoration`, `completed/dashboard-team-feedback-tasks` → linked from E1/E2/E4/E6.
- **Package Overview** ← `packages/competence/README.md` → linked from the project root.
- **This document** → KB article "Project backfill log".

---

## 8. Execution plan & checkpoints

- **Checkpoint 1 — this doc.** Approve structure, conventions (Open question A), forward list, KB list.
- **Phase A — Epics.** Create the 9 `Epic` cards + the area/version tags.
- **Checkpoint 2 — Pilot.** Build **E6 (Dashboard & Tasks)** fully — 2 features with links, all fields, tags, `Shipped`, body (effort signal + GitHub commit links) — and one KB cross-link. You eyeball it in the UI.
- **Phase B — Backfill.** Remaining epics' features, **one epic per step**, checkpoint between each.
- **Phase C — Forward pipeline.** Create the seeded `forward` cards.
- **Phase D — Knowledge Base.** Create articles + cross-links.
- **Going forward:** new work starts as a `CA-###` card; referencing it in commit messages auto-links via the GitHub integration — closing the loop the backfill can't (historical commits predate the IDs).

---

## 9. Implementation log

_(appended as phases complete)_

- 2026-06-18 — Doc drafted from CHANGELOG + dated git history + `design/`. Awaiting Checkpoint 1 approval.
- 2026-06-18 — **Checkpoint 1 approved.** `State: Verified`/`Stage: Done` for completed work; `Major` only on the two landmarks (epics → `Normal`); forward list accepted as-is. Clarification: forward items link to their epic via `relates to` (not `subtask of`), so epics reflect **delivered** scope (`Verified`/`Done`) even when forward work remains. Building the E6 pilot (epic + 2 features) before scaling.
- 2026-06-18 — **Pilot built (E6):** `CA-1` (Epic) + `CA-2`, `CA-3` (Features, nested). All fields verified in YouTrack. **Mechanics learned (apply to all backfill):**
  - **`Shipped` stores −1 day** (date parsed at local midnight, displayed in UTC; time component ignored). **Rule: send intended date + 1 day** in `yyyy-MM-dd`. E.g. v3.3.0 `2026-06-18` → send `2026-06-19`. *(The release→date map in §4 lists intended dates; add 1 day when sending.)*
  - **Tags must pre-exist** — `manage_issue_tags` only applies existing tags; no create-tag tool. Version/tag scheme pending decision (pre-create tags, add a `Version` field, or rely on `Shipped`). `area:*` tags dropped (redundant with the epic hierarchy).
  - `create_issue.parentIssue` auto-creates the `subtask of` link — no separate `link_issues` call for nesting.
  - Cards auto-assign to the creator (Belleal) — acceptable (sole owner).
- 2026-06-18 — **Phase A done — 9 epics created.** Map: `CA-1` Dashboard & Tasks · `CA-4` Competency Framework & Content · `CA-5` Cycle Management · `CA-6` Employee & Organization Management · `CA-7` Evaluation Workflow · `CA-8` Interview Scheduling · `CA-9` Configuration Admin (live editing) · `CA-10` Design System & UX · `CA-11` Platform & Quality. (Fixed 4 summaries where `&` was over-escaped to `&amp;` — send plain `&` in `summary`.) E6 features: `CA-2`, `CA-3`. Decision: version handled via a new **`Version`** custom field (not tags). **Next:** user adds `Version` field + confirms card style → Phase B feature backfill (parent each feature to its epic ID above).
- 2026-06-18 — `Version` (enum) field + `landmark` / `changelog-gap` / `forward` tags created by user. Work paused to **resume on another machine** — see §10.
- 2026-06-18 — **Phase B — E1 (Competency Framework & Content) built.** 6 features under `CA-4`: `CA-12` 3-D model *(landmark)* · `CA-13` 108-dictionary rebuild *(landmark)* · `CA-14` bilingual EN/BG · `CA-15` relevancy archetype curves · `CA-16` role-family pool · `CA-17` 164-catalog precursor (`relates to` `CA-13` + `CA-15`). All carry `Version` + `Shipped` (the **+1-day rule re-confirmed** — every card displays its intended release date); `landmark` tag on `CA-12`/`CA-13`. Body follows the pilot format exactly: lead + detail paragraphs, then a `---` footer with `Shipped` · `Effort` · `Commit(s)` (1–2 GitHub links) · `Design` (where a `completed/` doc exists). Awaiting card-style confirmation before scaling to E2–E9.
- 2026-06-18 — **Card style confirmed** (eyeballed in the YouTrack UI). Backfilled `Version` on the E6 pilot cards (`CA-2` = v3.2.4, `CA-3` = v3.3.0).
- 2026-06-18 — **Phase B — E2 (Cycle Management) built.** 6 features under `CA-5`: `CA-18` lifecycle state machine · `CA-19` Cycle Management screen · `CA-20` Cycle Setup screen (baseline/spec editor) · `CA-21` lock-validation engine · `CA-22` family exclusion (v3.2.0) · `CA-23` editable team-feedback deadline (v3.3.0). No tags/links (no landmarks in E2).
- 2026-06-18 — **Phase B complete — E3–E9 built (powered through).** E3 Employee & Org `CA-24`–`CA-28` · E4 Evaluation `CA-29`–`CA-36` · E5 Scheduling `CA-37`–`CA-38` · E7 Config Admin `CA-39`–`CA-43` (all `changelog-gap`) · E8 Design System `CA-44`–`CA-48` (`CA-44` UI/UX rollout has **no `Version`**) · E9 Platform `CA-49`–`CA-53`. Cross-link: `CA-35` (finalize) **`relates to`** `CA-3` (dashboard task cards). **All 44 feature cards now exist** (`CA-2`/`CA-3` pilot + `CA-12`–`CA-53`); all fields/dates re-verified.
  - **New mechanic:** v1.x features (Jan–Apr 2026) predate conventional commits — their history is coarse "submit/augment competence vX.Y.Z" batches mixing packages. Those cards anchor the **release ("submit") commit** for the version + point to the CHANGELOG, rather than fabricating per-feature SHAs/counts. May–June features keep precise per-feature commit links.
- 2026-06-18 — **Phase C complete — forward pipeline (7 cards `CA-54`–`CA-60`).** `State: Open` / `Stage: Backlog`, `forward` tag, **`relates to`** (not `subtask of`) their epic: `CA-54` pool inline editor → E7 · `CA-55` populate 6 families → E1 · `CA-56` surface finalize audit → E4 · `CA-57` BG archetype-label review → E1 · `CA-58` e-CF mappings → E1 · `CA-59` enforce self/manager deadlines → E4 · `CA-60` adopt web-framework tasks module → E6. **Reframe (user decision):** item 7's original "lift a reusable tasks module into the web-framework" is a web-framework-project task, not competence; the competence card is the downstream **upgrade** to consume the module once it is built.
- 2026-06-18 — **Phase D complete — Knowledge Base (12 articles `CA-A-1`–`CA-A-12`).** Two section parents — **Competency Content** (`CA-A-1` → master index `CA-A-5`, definitions `CA-A-6`, relevancy model `CA-A-7`, BG translations `CA-A-8`) and **Design Records** (`CA-A-2` → refactor `CA-A-9`, rebuild `CA-A-10`, pool `CA-A-11`, dashboard-tasks `CA-A-12`) — plus standalone **Package Overview** (`CA-A-3`, from README) and **Project backfill log** (`CA-A-4`, this doc). Large data docs (definitions ~1090, BG ~1050, README ~978 lines) are mirrored as **overview articles** (purpose, key facts, structure, source path) rather than verbatim dumps; each cites its repo source and mentions its epic (`CA-#`) for a cross-link. **Backfill complete (Phases A–D).**
- 2026-06-18 — **Forward cards re-parented as subtasks (owner preference).** Per the owner: nest any feature/task **within** its Epic (`subtask of`) whenever one fits — delivered *and* forward — leaving only truly standalone items unparented. All 7 forward cards are now `subtask of` their epic (`CA-54`→`CA-9`; `CA-55`/`CA-57`/`CA-58`→`CA-4`; `CA-56`/`CA-59`→`CA-7`; `CA-60`→`CA-1`). **Supersedes the Checkpoint-1 "forward = relates to" rule** — epics now hold delivered (`Verified`/`Done`) and backlog (`Open`/`Backlog`) children together. The original `relates to` links remain (MCP has no unlink) as harmless redundant secondary links; clear in the UI if undesired.

---

## 10. Resume / handoff (fresh session or new machine)

**Prereqs (per machine):** connect the YouTrack MCP, then **restart** Claude Code so the `mcp__youtrack__*` tools load (they only attach at startup):
```
claude mcp add --header "Authorization: Bearer <token>" --transport http youtrack https://belleal.youtrack.cloud/mcp
```

**State so far:** 9 epics created (ID map in §9); E6 pilot features `CA-2` / `CA-3`; **Phase B complete — all 42 feature cards `CA-12`–`CA-53` built & verified** (see §9), plus the E6 pilot `CA-2`/`CA-3` (now carrying `Version`); plus **Phase C forward cards `CA-54`–`CA-60`**; plus **Phase D Knowledge Base `CA-A-1`–`CA-A-12`**; `Version` enum field + the 3 special tags (`landmark`, `changelog-gap`, `forward`) exist. YouTrack data is cloud-side, so it is already current on any machine — re-verify with `find_projects` / `search_issues project: CA`.

**Conventions:** §2 (fields/links/tags) + the mechanics logged above — especially: **`Shipped` = intended date + 1 day**; **tags must pre-exist**; `create_issue.parentIssue` auto-links `subtask of`; there is **no delete** (create/update only, so verify before bulk-creating).

**Remaining work:**
1. **Phase B — features (§5).** ✅ **COMPLETE** — all 42 feature cards `CA-12`–`CA-53` built and verified (counts per epic: E1 6 · E2 6 · E3 5 · E4 8 · E5 2 · E7 5 · E8 5 · E9 5; E6's 2 were the pilot). `landmark` on `CA-12`/`CA-13`; `changelog-gap` on E7 (`CA-39`–`CA-43`); `CA-44` (UI/UX rollout) intentionally has no `Version`; `CA-17`→`CA-13`/`CA-15` and `CA-35`→`CA-3` `relates to` links in place.
2. **Phase C — forward pipeline (§6).** ✅ **COMPLETE** — 7 cards `CA-54`–`CA-60` (`State: Open`, `Stage: Backlog`, `forward` tag, **`subtask of` their epic** — re-parented 2026-06-18 per owner preference; the original `relates to` links remain as redundant secondary links). Item 7 reframed as the competence-side *upgrade* to adopt the future web-framework tasks module.
3. **Phase D — Knowledge Base (§7).** ✅ **COMPLETE** — 12 articles `CA-A-1`–`CA-A-12` (2 section parents + 8 children + Package Overview + Project backfill log). Large data docs mirrored as overview articles + repo source path; each mentions its epic for a cross-link.

**Data sources:** `packages/competence/CHANGELOG.md` and `git log --date=short -- packages/competence` (per-feature commit hashes + dates).
