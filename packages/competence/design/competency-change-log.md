# Competency Content — Change Log

Tracks every change to the competency model **after** the v1.0 baseline, so implementation can be executed as precise deltas rather than repeated full rebuilds. Each increment records what changed, what was added, and the exact config-file impact.

**Companion documents:** `competency-definitions-final.md` (EN content) · `competency-bg-translations.md` (BG) · `competency-master-index.md` (codes) · `competency-relevancy-model.md` (archetypes) · `completed/` (the v1.0 rebuild inventories)

---

## Baseline v1.0 — SE / BA / PM + shared core

**Scope:** 108 distinct competencies — SE 31, BA 22, PM 25 family-specific, plus 30 shared canonical.
**Implementation:** via the v1.0 rebuild (full destructive rebuild).
**Status:** ✅ **Implemented** — shipped in competence **v3.0.0**. The dictionary has carried all 108 codes since; subsequent 3.x releases changed framework behaviour around the content, not the content itself.

Everything below is a delta on this baseline.

---

## Increment 1 — QE family (baseline complete) + E1-10 canonicalization

**Date:** 26 July 2026
**Implemented:** competence **v3.17.0**
**Status:** ✅ **QE baseline complete and implemented** — 26 family-specific competencies. Specializations (MANUAL / AUTOMATION / PERFORMANCE / SECURITY) still to build, but are **not** required for QE to go live: an employee without a specialization is evaluated on baseline alone.

### 1a. Changed — existing competencies

| Code | Change | Detail |
|---|---|---|
| **E1-10** Business and IT domain knowledge | **Relocated + reworded** | Moved from **BA family-specific** → **Shared canonical** (new "E1 cross-cutting" group). Description reworded to remove BA-specific framing. Anchors **R** and **T** reworded ("analysis" → "work"). N, J, S, X anchors unchanged. BA continues to reference it; QE now also references it. |

*No other existing competency changed.*

### 1b. Added — new competencies

**QE — 26 family-specific competencies (all new):**

| Subcategory | Codes | Names |
|---|---|---|
| **E1** (10) | E1-48 … E1-57 | Software testing principles and levels · Test design techniques · Software quality models and characteristics · Risk-based testing · Defect management and root cause analysis · Analysing requirements for testability · Test data management · Test automation concepts and architecture · Non-functional testing concepts · Quality assurance across the software lifecycle |
| **E2** (10) | E2-42 … E2-51 | Test planning and strategy · Designing and writing test cases · Executing tests and reporting results · Exploratory testing · Defect reporting and triage · Regression testing and suite maintenance · API and integration testing · Database and data validation testing · Test environment setup and troubleshooting · Quality metrics and status reporting |
| **E3** (3) | E3-28 … E3-30 | Applying accumulated quality engineering experience · Knowledge and use of quality engineering tools · Investigating and diagnosing complex defects |
| **I1** (3) | I1-8 … I1-10 | Adhering to the internal QA and testing process · Participating in requirement and design reviews · Adhering to test documentation and artifact standards |

**Still to draft for QE:** specializations MANUAL / AUTOMATION / PERFORMANCE / SECURITY (~12 competencies). Optional for go-live.

**Next code positions after Increment 1:** E1-58 · E2-52 · E3-31 · I1-11

### 1c. Structural / policy

- **Canonicalization policy restated.** Replaced the category-based rule ("all E is family-specific") with the meaning-identity principle: *a competency is shared when its meaning is identical across families, even where the context of application differs.* The category rule had been bent twice — first for cross-cutting E3, now for E1-10.
- **New shared group:** "E1 (cross-cutting) — Theoretical knowledge", currently containing only E1-10.
- **Automation scoping decision:** automation *concepts* are QE baseline (E1-55); automation *implementation* belongs to the AUTOMATION specialization. Same pattern for non-functional testing (E1-56 baseline concepts; PERFORMANCE and SECURITY specializations for execution).

### 1d. Config impact

> **Note — this table was corrected at implementation time.** The increment was drafted against `config.competency-relevancy.json`, which **no longer exists**: competence 3.1.0 replaced the materialized per-family weight file with the archetype model (`config.relevancy-archetypes.json` + a per-competency `relevancyArchetype` pointer) plus a separate per-family pool (`config.role-family-competencies.json`). Relevancy is now **global per competency**; applicability is the pool. The rows below name the files as they actually are.

| File | Action | Hand-edited? |
|---|---|---|
| `config.competencies.json` | **+26** entries (E1-48…E1-57, E2-42…E2-51, E3-28…E3-30, I1-8…I1-10) → 134 total. E1-10 entry structurally unchanged — only its label strings change. | Yes (entries); `relevancyArchetype` is stamped by the generator |
| `competence-labels.json` | **+26 × 8 strings × 2 languages** (416) for the new entries. **Revised** `competency.description.E1-10` and `competency.scope.E1-10.R` / `.T` in both EN and BG. | Yes |
| `config.role-family-competencies.json` | QE pool goes 30 → 57 (26 family-specific + 31 shared). E1-10 moving to shared adds it to **every** family pool: SE 61→62, PM 55→56, BA 52 (unchanged — it already had it), and the five unpopulated families 30→31. | **No — generated** |
| `config.relevancy-archetypes.json` | Curves unchanged; regenerated in place. Archetype **assignments** for all 26 QE competencies added to `competency-relevancy-model.md`. | **No — generated** |
| `config.active-competency-sets.json` | **Added `QE` baseline** for `2026-H2` (22 codes), satisfying nine-subcategory floor coverage and the cap of 30. The four QE specializations are left **absent** rather than empty — the `no-empty-baseline` lock rule only engages once specialization data exists. | Yes |
| `config.role-families.json` | **No change** — QE and its four specializations were already defined in the taxonomy. | — |
| `competency-master-index.md` | Moved E1-10 from BA to Shared; added QE section; totals 108 → 134. | Yes |
| `competency-relevancy-model.md` | Moved the E1-10 assignment row from the BA section to Shared (which is what performs the pool promotion); added the QE assignment section. | Yes — this is the generator's **source** |

**Archetype assignments (Increment 1):** A ×2 · B ×8 · C ×3 · D ×1 · E ×10 · F ×2. Derived to match how SE/BA/PM were assigned — foundational knowledge and daily tooling on A, judgment/strategy/experience on B, process-and-documentation discipline on C, the one early-heavy execution mechanic on D, the core "doing" competencies on E, and the two expert-leaning depths (automation architecture, complex defect diagnosis) on F.

### 1e. Verification after implementation

- ✅ E1-10 appears **once** in the dictionary and is referenced by BA, QE, and every other family pool.
- ✅ QE baseline satisfies floor coverage across all nine subcategories, within the cap.
- ✅ Content-integrity test passes: no empty description or scope for any competency in the catalog, in either language.
- ✅ No orphaned references to E1-10 as a BA-only competency.
- ✅ Purely additive — no code dropped or renumbered, so **no evaluation data migration** was required (unlike the v1.0 rebuild). Snapshot isolation covers in-flight evaluations regardless.

### 1f. Deployment note

Competency texts are **labels**, and the affected config documents are **store-backed**. On an instance whose config store has already been seeded, editing the file defaults does not change the running app — the change reaches users only via export → commit → redeploy, or an admin config edit. On a fresh instance the file defaults apply directly.

---

## Increment 2 — `[XD / DA / IO / MC / PD, as built]`

*Reserved.*

---

## Working rules

1. **One increment per completed family**, not per drafting session. Partial families are not implementable.
2. **Record relocations explicitly.** A competency moving between family-specific and shared changes which relevancy pools reference it — the most likely source of a broken build.
3. **Watch for further canonicalization candidates** as remaining families are built. Apply the meaning-identity test. Likely candidates: domain-specific tooling competencies, documentation competencies, and "accumulated experience" — though the last three have so far proven genuinely family-specific.
4. **Bulgarian follows English** within the same increment; do not let BG lag more than one increment behind. This is now enforced, not merely a convention: the content-integrity test fails on any competency missing `bg`.
5. **Archetype assignment** for new competencies happens before implementation, not after.
6. **Never hand-edit generated config.** `config.role-family-competencies.json`, `config.relevancy-archetypes.json` and the `relevancyArchetype` fields come from `competency-relevancy-model.md` via `bin/build/build-competency-relevancy.js`. Edit the model doc and re-run it.
