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

## Increment 2 — Architecture (SE.ARCHITECTURE + BA.SOLUTION_ARCHITECTURE)

**Date:** 26 July 2026
**Implemented:** competence **v3.25.0** (CA-110)
**Status:** ✅ **complete and implemented** — 12 competencies and the two specializations that carry them.

### 2a. Added — new competencies (12)

| Group | Codes | Placement |
|---|---|---|
| **Cross-cutting E2** (3) | E2-52 Architecture documentation and decision records · E2-53 Quality attribute and trade-off analysis · E2-54 Technology evaluation and selection | **Shared** — new "E2 (cross-cutting)" group; referenced by both architecture specializations |
| **SE.ARCHITECTURE** (4) | E2-55 System decomposition and boundary design · E2-56 Architectural governance and design review · E2-57 Scalability and resilience design · E2-58 Architecture evolution and migration planning | SE specialization |
| **BA.SOLUTION_ARCHITECTURE** (5) | E2-59 Cross-system and cross-institutional solution design · E2-60 Interoperability and standards compliance · E2-61 Solution feasibility, sizing and costing · E2-62 Vendor and product evaluation · E2-63 Client-facing solution justification | BA specialization |

### 2b. Structural / policy

- **New shared group:** "E2 (cross-cutting) — Applied skills". Third application of the meaning-identity principle, after cross-cutting E1 and E3.
- **New specializations:** `SE.ARCHITECTURE` and `BA.SOLUTION_ARCHITECTURE`. Neither existed previously — SE had Backend/Frontend/Mobile/Full-stack/Embedded; BA had Requirements/Process/Product Ownership/Data BA/Doc Proc.
- **Architect roles resolved** as Role Family × Specialization × Stage-Level, not as seniority alone:
  - Software Architect = **SE × ARCHITECTURE × X1**
  - Solutions Architect = **BA × SOLUTION_ARCHITECTURE × (R | S | X)**
- **Shared in the dictionary is not shared in the pool.** The three cross-cutting codes are written once, but they are listed under the **SE and BA** assignment tables in `competency-relevancy-model.md` rather than under *Shared*. That document's *Shared* section means "in every family's pool", and putting them there would let a PM or QE active set legitimately include architecture documentation. See the note in that file.

### 2c. Stage-letter mapping — organizational rule

| Position | Stage-letter |
|---|---|
| Проектант, информационни системи | **R** |
| Старши проектант, информационни системи | **S** |
| Главен проектант, информационни системи | **X** |

**General rule established:** distinct job positions requiring distinct competency expectations must map to distinct stage-**letters**, because scope text is defined per letter (N/J/R/S/X/T) while relevancy weights are defined per sub-level (N1…T1). Two positions on S1 and S3 would read identical behavioural anchors. This yields **five distinguishable grades per track** (N, J, R, S, plus X or T) — verify the organization's full position catalogue against this limit before the cycle.

*Corollary benefit:* sub-levels provide within-grade progression (R1 → R2 → R3) without changing competency expectations.

### 2d. Config impact — as implemented

| File | Action |
|---|---|
| `config.competencies.json` | **+12** entries (E2-52 … E2-63); dictionary 134 → **146** |
| `competence-labels.json` | **+12 × 8 strings × 2 languages**, plus the two specializations' name/description pairs |
| `config.role-families.json` | **Added** `SE.ARCHITECTURE` and `BA.SOLUTION_ARCHITECTURE` with localization keys and empty eCF mappings |
| `competency-relevancy-model.md` | Assignments added under SE and BA: **B** for the three cross-cutting, **F** for the nine specialization-specific. Distribution check re-derived mechanically |
| `config.role-family-competencies.json` · `relevancyArchetype` fields | **Generated**, not hand-edited — `npm run build:relevancy` from the model doc (working rule 6). SE pool 62 → **69**, BA 52 → **60**; PM/QE/others unchanged |
| `config.active-competency-sets.json` | Added `SE.ARCHITECTURE` (7 codes) and `BA.SOLUTION_ARCHITECTURE` (8) for 2026-H2. Verified against the cap of 30: SE 22 + 7 = 29, BA 21 + 8 = 29 |

*Note: earlier drafts of this table named `config.competency-relevancy.json`. That file no longer exists — relevancy is `config.relevancy-archetypes.json` (curves) plus a per-competency `relevancyArchetype`, and the pools are `config.role-family-competencies.json`.*

### 2e. Verification after implementation

- Content-integrity test passes: complete, non-empty en+bg name, description and six anchors for all 146.
- The three cross-cutting codes appear in the SE and BA pools and in **no** other family's.
- Both new specialization sets sit under the active-set cap with the family baseline.
- Bulgarian was written in the same increment as the English (working rule 4), and is pending the owner's native review through the Archetype/Competency Text screens.

**Next code positions after Increment 2:** E1-58 · **E2-64** · E3-31 · I1-11

---

## Increment 3 — Management set + T2 stage-level + XD family

**Date:** 26 July 2026
**Status:** ✅ **implemented** in competence **v3.26.0** (CA-111). Dictionary 146 → **175**.

### 3a. Framework — the T stage-letter gains a second sub-level ✅ implemented

`T` becomes `T1` (Team Lead) and `T2` (Head of Department). **Scope text is unchanged** — both read the same `T`
anchors, because scope is defined per letter while relevancy is defined per sub-level. Only relevancy gains a
column.

| File | Action |
|---|---|
| `config.stage-levels.json` | `T.stages` 1 → 2. The ladder is data, so `getArchetypeStageLevels()` now emits 13 keys with no code change |
| `relevancy-archetypes.schema.json` | `T2` added to `required` and `properties` — the weights object is `additionalProperties: false`, so without this every curve fails validation |
| `config.relevancy-archetypes.json` · `relevancyArchetype` fields | **Generated** from the model doc, never hand-edited (working rule 6) |
| Scope text / labels | **No change.** No new anchors, no Bulgarian retranslation |

*Rationale for T2 over a seventh `M` letter is in `competency-relevancy-model.md`: a new letter would have needed
~146 new anchors in each language, most of them the T anchor with "team" swapped for "department" — near-duplicates
that fail the specific-example test and teach raters the instrument does not discriminate.*

**Two things the change forced, neither of them anticipated by this document:**

- **The performance bands were renamed `T1`–`T5` → `P1`–`P5`.** They and the stage sub-levels both used `T1`, and
  both meanings already sat a few lines apart in `results-analytics.js`. Adding `T2` would have made one token mean
  "Head of Department" and "performance band 2" in the same file. Done before any real cycle closes, because the
  band code is persisted as each score's `interpretation` and as the `tBandMix` key inside the immutable,
  non-back-fillable `ResultsSnapshot`. A guard test now pins the two vocabularies apart.
- **Stage validation is now ladder-driven.** It was a hard-coded `1..3` bound plus a list of single-stage rungs,
  which silently accepted `T3` the moment `T` gained a second sub-level. It now reads each rung's declared stage
  count, so a rung gaining or losing one cannot leave the validator behind.

### 3b. New relevancy archetype ✅ implemented

**H — Management-track:** `N1 2 · J1 2 · J2 2 · J3 2 · R1 2 · R2 3 · R3 3 · S1 4 · S2 4 · S3 5 · X1 4 · T1 8 · T2 10`

All seven existing archetypes also gained a T2 value. The shape is deliberate: hands-on curves (**A**, **D**, **E**,
**F**) decline from T1 to T2 while people and conceptual curves (**B**, **C**, **G**, **H**) hold or rise, so a head
of department is scored on a different balance rather than uniformly higher than a team lead.

H is defined and carries a curve but is not yet assigned — it belongs to the five management competencies below.

### 3c. Ten previously-assigned archetypes revised ✅ implemented

The model update changed ten assignments that had already shipped: seven QE (E1-49 E→A, E1-52 B→A, E1-53 E→B,
E1-55 F→B, E2-46 C→E, E2-51 E→B, I1-10 C→D) and the three cross-cutting architecture codes (E2-52/53/54 B→F).

The architecture change reverses the split chosen while implementing Increment 2. The document's reasoning: all
twelve are deep capabilities where the individual-contributor expert is the authority, and F is right precisely
because it declines on the management track — a head of department is not the architecture authority.

### 3d. Added — management competencies (5, shared) ✅ implemented

| Code | Name | Archetype |
|---|---|---|
| C3-8 | Developing and leading managers | H |
| C3-9 | Talent management and succession planning | H |
| I2-12 | Departmental capacity and resource planning | H |
| I2-13 | Strategic alignment and objective cascade | H |
| C2-7 | Cross-functional collaboration and organizational influence | H |

*Codes deliberately continue above all previously-used numbers to avoid collision with retired codes (C2-6, C3-6,
C3-7, I2-7…I2-11 are retired).*

### 3e. Added — XD family baseline (24) ✅ implemented

E1-58…E1-66 (9) · E2-64…E2-72 (9) · E3-31…E3-33 (3) · I1-11…I1-13 (3). A 22-code baseline for 2026-H2
covers all nine subcategories and sits inside the cap of 30, mirroring the SE and QE baselines so a designer and an
engineer are measured on the same shared core.

**Configuring XD includes it in the cycle.** Exclusion is derived — a family is excluded exactly when it has no
active set — so three tests that used XD as their stock "unconfigured family" stopped working. They now derive one
instead of naming it, which is what keeps them working when DA, IO, MC or PD is built.

Accessibility appears twice by design — E1-63 (standards knowledge) and E2-72 (implementation and validation) —
reflecting the public-sector obligation, and both are weighted **C** rather than B: a junior producing inaccessible
work is a compliance failure, not an understandable gap, and the weighting should say so.

### 3f. Approved but content pending — do not implement yet

| Specialization | Placement | Status |
|---|---|---|
| `SE.DATABASE_ARCHITECTURE` | SE family | Placement approved; ~4 competencies **not yet written** |
| `SE.AI_ENGINEERING` | SE family | Placement approved; ~6 competencies **not yet written** |

**Next code positions after Increment 3:** E1-67 · E2-73 · E3-34 · I1-14 · C2-8 · C3-10 · I2-14

---

## Increment 4 — SE specializations: Database Architecture & AI Engineering

**Date:** 28 August 2026
**Implemented:** competence **v3.27.0** (CA-112)
**Status:** ✅ **implemented.** Closes the two items left pending from Increment 3.

### 4a. Added — new competencies (11)

| Specialization | Codes | Names |
|---|---|---|
| **SE.DATABASE_ARCHITECTURE** (5) | E2-73 … E2-77 | Data modelling and schema design · Database performance tuning and query optimisation · Database reliability, backup and recovery design · Database migration and change management · Database security and access control |
| **SE.AI_ENGINEERING** (6) | E2-78 … E2-83 | Model integration and prompt engineering · Retrieval and context engineering · Agent and tool orchestration · Evaluating non-deterministic systems · AI safety, guardrails and responsible deployment · Model selection and cost-performance optimisation |

### 4b. Archetypes

All → **F** (rising, expert-leaning), except **E2-82 AI safety → C** (steady-high), on the same principle as
accessibility: a safety obligation applies at every level rather than rising with seniority. A junior shipping an
unguarded system is a governance failure, not a developmental gap, and the weighting says so.

### 4c. Scoping notes

- **DATABASE_ARCHITECTURE** draws the three shared cross-cutting architecture competencies (E2-52/53/54) in
  addition to its five, giving 8 on top of the SE baseline.
- **AI_ENGINEERING** covers building on existing models. **Model training and development belong to DA**, not here.
- Neither specialization introduces new shared competencies.

### 4d. Config impact — as implemented

| File | Action |
|---|---|
| `config.competencies.json` | **+11** entries (E2-73 … E2-83); dictionary 175 → **186** |
| `competence-labels.json` | **+11 × 8 strings × 2 languages**, plus the two specializations' name/description pairs |
| `config.role-families.json` | **Added** `SE.DATABASE_ARCHITECTURE` and `SE.AI_ENGINEERING` |
| `competency-relevancy-model.md` | Assignments added **as rows**, not prose. The database five were specified as "all → F" in prose, which the generator cannot see — the same shape that silently dropped assignments in Increment 3 |
| `config.role-family-competencies.json` · `relevancyArchetype` fields | **Generated** from the model doc (working rule 6). SE pool 74 → **85** |
| `config.active-competency-sets.json` | Specialization sets for 2026-H2: DATABASE_ARCHITECTURE 8 (its 5 + the 3 shared), AI_ENGINEERING 9 (its 6 + the 3 shared). Resolved against the SE baseline of 22: 30 and 31 |
| `config.application.json` | `performanceAppraisals.activeCompetencySetCap` raised **30 → 32** — see the note below |

**On the cap.** `AI_ENGINEERING` draws all three shared architecture competencies, the same as the three
architecture specializations, which takes its resolved set to 31. Rather than trim the set to fit, the cap was
raised — the set definition states which competencies apply to a specialization, and the cap is an application-level
tunable that should not shape that definition.

The trim option was not merely unattractive, it was misdirected: `validateCycleForLock` checks **every**
specialization of an included family, and `cycle.excludedFamilies` excludes only whole families. A single
oversized specialization therefore blocks every SE employee from a cycle, including those carrying no
specialization at all. The competency to remove would have had to come out of the SE **baseline**, hitting
everyone, to make room in one specialization.

Raised to 32 rather than 31 so that the next shared competency does not immediately re-block SE. The cost is real:
the cap bounds how long an appraisal form can get, and 30 competencies × 6 anchors is already substantial to rate.
`ARCHITECTURE` and `SOLUTION_ARCHITECTURE` sit at 29 and `DATABASE_ARCHITECTURE` at 30, so headroom stays thin.

**Next code positions after Increment 4:** E1-67 · **E2-84** · E3-34 · I1-14 · C2-8 · C3-10 · I2-14

---

## Increment 5 — DA family (Data & Analytics)

**Date:** 28 August 2026
**Implemented:** competence **v3.28.0**
**Status:** ✅ **DA baseline complete and implemented** — 23 family-specific competencies. Specializations (ENGINEERING / ANALYTICS / ML / RESEARCH) still to build, and not required for DA to go live.
**Baseline note:** Increments 1–4 were already implemented when this landed (dictionary at 186).

### 5a. Added — DA baseline (23)

| Subcategory | Codes | Count |
|---|---|---|
| E1 | E1-67 … E1-75 | 9 |
| E2 | E2-84 … E2-91 | 8 |
| E3 | E3-34 … E3-36 | 3 |
| I1 | I1-14 … I1-16 | 3 |

Dictionary 186 → **209**.

### 5b. Scoping decisions

- **Baseline is the common core across four dissimilar specializations.** Advanced pipeline orchestration (ENGINEERING), inferential statistics and experimental design (RESEARCH), and model development and deployment (ML) are deliberately held back for the specialization sets. E1 carries the concepts everyone should hold; the doing lives in specializations. Same pattern as QE's automation split.
- **Boundary with `SE.AI_ENGINEERING` resolved:** DA owns model *development* (training, evaluation, deployment); SE.AI_ENGINEERING owns building on *existing* models. E1-72 provides DA's conceptual grounding; hands-on model work belongs to the ML specialization.
- **Boundary with `SE.DATABASE_ARCHITECTURE`:** E1-67 is dimensional/analytical modelling; E2-73 is transactional OLTP schema design. Different disciplines despite shared vocabulary.

### 5c. Archetypes

Assigned in `competency-relevancy-model.md` under *Assignments — Increment 5 (DA family)*: A ×4 · B ×8 · C ×3 · D ×1 · E ×7. Two on **C** by the established obligation principle — **E1-74** (data privacy and regulatory compliance) and **E1-70** (data quality and governance) — consistent with accessibility (E1-63, E2-72) and AI safety (E2-82).

### 5d. Config impact

| File | Action | Hand-edited? |
|---|---|---|
| `config.competencies.json` | **+23** entries (E1-67…E1-75, E2-84…E2-91, E3-34…E3-36, I1-14…I1-16) → 209 total | Yes (entries); `relevancyArchetype` stamped by the generator |
| `competence-labels.json` | **+23 × 8 strings × 2 languages** (368) | Yes |
| `config.role-family-competencies.json` | DA pool 36 → **59** (23 family-specific + 36 shared). No other family's pool changes — DA adds nothing shared. | **No — generated** |
| `config.relevancy-archetypes.json` | Curves unchanged; regenerated in place | **No — generated** |
| `config.active-competency-sets.json` | **Added `DA` baseline** for `2026-H2` (23 codes), satisfying nine-subcategory floor coverage within the cap of 32. The four DA specializations are left **absent** rather than empty. | Yes |
| `config.role-families.json` | **No change** — DA and its four specializations were already defined | — |
| `competency-master-index.md` | Added the DA section; totals 186 → 209; next free codes advanced; DA removed from the unpopulated list | Yes |
| `competency-relevancy-model.md` | Added *Assignments — Increment 5 (DA family)* — the section that performs the pool attribution | Yes — the generator's **source** |

### 5e. Verification after implementation

- ✅ Generator reports `209 / 209` assigned; DA pool = 59.
- ✅ DA baseline satisfies floor coverage across all nine subcategories, 23 of the cap of 32.
- ✅ Content-integrity test passes: every competency carries non-empty `en` and `bg` name, description and all six anchors.
- ✅ Purely additive — no code dropped or renumbered, so **no evaluation data migration**.
- ✅ The seeded cycle derives `excludedFamilies` from which families carry competencies, so DA is now automatically included in `2026-H2` and participates in lock validation.

### 5f. Documentation correction

The master index's *Outstanding* row claimed 78 competencies were untranslated. That was stale — Bulgarian had in fact been kept current through Increment 4. The row now records translation as complete and names the test that enforces it.

---

## Increment 6 — MC family (Marketing & Communications)

**Date:** 28 August 2026
**Implemented:** competence **v3.29.0**
**Status:** ✅ **MC baseline complete and implemented** — 23 family-specific competencies. Specializations (DIGITAL / BRAND_PR / CONTENT / INTERNAL_COMMS) still to build, and not required for MC to go live.
**Baseline note:** Increments 1–5 were already implemented when this landed (dictionary at 209).

### 6a. Added — MC baseline (23)

| Subcategory | Codes | Count |
|---|---|---|
| E1 | E1-76 … E1-84 | 9 |
| E2 | E2-92 … E2-99 | 8 |
| E3 | E3-37 … E3-39 | 3 |
| I1 | I1-17 … I1-19 | 3 |

Dictionary 209 → **232**.

### 6b. Notable — first non-ICT family

The shared canonical core transferred **without modification**. Planning, estimation, responsibility, communication and mentorship describe a marketer's work as accurately as an engineer's; `E1-10` (business and IT domain knowledge) applies directly, and matters as much for someone communicating about the organization's systems as for someone building them. **No shared competency needed adjustment or a marketing-specific variant, and MC contributed nothing new to the shared set** — so no other family's pool changed.

*Worth recording for the dissertation: this is evidence that the canonicalization principle generalizes beyond the discipline it was derived from, supporting the framework's claim of applicability to any organization rather than ICT alone.*

### 6c. Scoping decisions

- **Public-sector constraints are explicit**, not inferred: `E1-83` covers procurement rules on communications spend, political neutrality, transparency duties, accessibility of public communication, and data protection on contact data.
- **`E2-99` (translating technical subject matter)** is family-specific and distinct from the shared C2 set: it concerns extracting substance from specialists and rendering it accurately for non-specialists, a defining demand on communications staff in a technology organization.
- **The content writer role folds into MC**, most naturally under the `CONTENT` specialization.

### 6d. Archetypes

Assigned in `competency-relevancy-model.md` under *Assignments — Increment 6 (MC family)*: A ×5 · B ×9 · C ×4 · E ×5. Three on **C** by the established obligation principle — **E1-83** (public-sector rules) and **I1-19** (brand/legal/compliance) are regulatory and legal obligations, and **E2-96** (brand consistency) is a standard every piece of output must meet. Consistent with accessibility (E1-63, E2-72), AI safety (E2-82) and data protection (E1-74).

### 6e. Config impact

| File | Action | Hand-edited? |
|---|---|---|
| `config.competencies.json` | **+23** entries (E1-76…E1-84, E2-92…E2-99, E3-37…E3-39, I1-17…I1-19) → 232 total | Yes (entries); `relevancyArchetype` stamped by the generator |
| `competence-labels.json` | **+23 × 8 strings × 2 languages** (368) | Yes |
| `config.role-family-competencies.json` | MC pool 36 → **59** (23 family-specific + 36 shared). No other family's pool changes — MC adds nothing shared. | **No — generated** |
| `config.relevancy-archetypes.json` | Curves unchanged; regenerated in place | **No — generated** |
| `config.active-competency-sets.json` | **Added `MC` baseline** for `2026-H2` (23 codes), nine-subcategory floor coverage within the cap of 32. The four MC specializations are left **absent** rather than empty. | Yes |
| `config.role-families.json` | **No change** — MC and its four specializations were already defined | — |
| `competency-master-index.md` | Added the MC section; totals 209 → 232; next free codes advanced; MC removed from the unpopulated list | Yes |
| `competency-relevancy-model.md` | Added *Assignments — Increment 6 (MC family)*; re-derived the distribution table (235 rows → 232 distinct) | Yes — the generator's **source** |

### 6f. Verification after implementation

- ✅ Generator reports `232 / 232` assigned; MC pool = 59; every other pool unchanged.
- ✅ MC baseline satisfies floor coverage across all nine subcategories, 23 of the cap of 32.
- ✅ Content-integrity test passes: every competency carries non-empty `en` and `bg`.
- ✅ Purely additive — no code dropped or renumbered, so **no evaluation data migration**.
- ✅ MC is now automatically included in `2026-H2`, since the seeded cycle derives `excludedFamilies` from which families carry competencies.

---

## Increment 7 — PD family (Product Management)

**Date:** 2 September 2026
**Implemented:** competence **v3.30.0**
**Status:** ✅ **PD baseline complete and implemented** — 23 family-specific competencies. Specializations (STRATEGY / OWNERSHIP / ACCOUNT / GROWTH) still to build, and not required for PD to go live.
**Baseline note:** Increments 1–6 were already implemented when this landed (dictionary at 232). Increment 6 was still on its feature branch rather than on `master`, so this increment was built on top of that branch — the PD code ranges continue directly from MC's and cannot be numbered without it.

### 7a. Added — PD baseline (23)

| Subcategory | Codes | Count |
|---|---|---|
| E1 | E1-85 … E1-93 | 9 |
| E2 | E2-100 … E2-107 | 8 |
| E3 | E3-40 … E3-42 | 3 |
| I1 | I1-20 … I1-22 | 3 |

Dictionary 232 → **255**.

### 7b. Notable — the canonicalization result repeats

PD is the second consecutive family to draw the shared canonical core **without modification and without contributing anything new to it**. MC established that the principle survives leaving ICT; PD shows the same outcome for a discipline that is neither engineering nor communications. Every other family's pool is byte-identical after this increment.

*One data point is an observation; two consecutive ones make it a pattern worth stating in the dissertation.*

### 7c. Scoping decisions

- **The BA boundary is the load-bearing one.** PD owns *what to build and why* — direction, value, prioritisation, commercial outcome — looking outward to market and customer. BA owns *what precisely and how specified* — elicitation, analysis, requirements, solution definition — looking inward to delivery. They overlap at junior level and diverge sharply at senior level, which is the argument for two families rather than one.
- **Product Ownership exists in both families and means different things.** BA's `PRODUCT_OWNERSHIP` is the tactical, delivery-embedded role (backlog, stories, refinement); PD's `OWNERSHIP` is the commercial one (product direction and customer outcomes). Same job title in the market, different discipline — recorded here because it will otherwise be read as a duplication error.
- **Three adjacencies held apart deliberately.** `E1-87` is market-level customer value, against XD's `E1-64` (individual user behaviour) and BA's `E1-15` (eliciting requirements from named stakeholders). `E2-105` is commercial and account relationship ownership, against BA's `E2-24` and PM's `E2-30`. `E3-42` (deciding under uncertainty) is the judgment to commit before the evidence is conclusive, not general decisiveness.

### 7d. Archetypes

Assigned in `competency-relevancy-model.md` under *Assignments — PD family-specific*: A ×4 · B ×13 · C ×1 · D ×1 · E ×4.

- **`E1-92` on B, not C** — and this is the increment where the obligation principle was tested against a near-miss. MC's `E1-83` is on C because procurement rules, political neutrality and transparency duties are hard compliance obligations that bind every level equally. PD's public-sector *product context* is contextual knowledge that deepens with seniority: public value reasoning, policy as a requirement driver, institutional alongside citizen users. Consistent with PM's `E1-44`/`E1-45` and BA's `E1-46`/`E1-47`, all B. **The obligation principle applies where there is an actual obligation; it is not a rule about the words "public sector".**
- **PD is unusually B-heavy — 13 of 23.** In few disciplines does the work change as much between junior and senior: a junior product manager maintains a backlog against a direction someone else set, a senior one sets that direction and defends the investment behind it. This is a genuine feature of the discipline, not imprecise assignment, but it is worth watching after cycle 1 — a family whose curves nearly all rise will spread its scores widely across stage levels by construction.

### 7e. Config impact

| File | Action | Hand-edited? |
|---|---|---|
| `config.competencies.json` | **+23** entries (E1-85…E1-93, E2-100…E2-107, E3-40…E3-42, I1-20…I1-22) → 255 total | Yes (entries); `relevancyArchetype` stamped by the generator |
| `competence-labels.json` | **+23 × 8 strings × 2 languages** (368) | Yes |
| `config.role-family-competencies.json` | PD pool 36 → **59** (23 family-specific + 36 shared). No other family's pool changes — PD adds nothing shared. | **No — generated** |
| `config.relevancy-archetypes.json` | Curves unchanged; regenerated in place, byte-identical | **No — generated** |
| `config.active-competency-sets.json` | **Added `PD` baseline** for `2026-H2` (23 codes), nine-subcategory floor coverage within the cap of 32. The four PD specializations are left **absent** rather than empty. | Yes |
| `config.role-families.json` | **No change** — PD and its four specializations were already defined | — |
| `competency-master-index.md` | Added the PD section; totals 232 → 255; PD removed from the unpopulated list | Yes |
| `competency-relevancy-model.md` | Added *Assignments — PD family-specific*; re-derived the distribution table (258 rows → 255 distinct) | Yes — the generator's **source** |

### 7f. Verification after implementation

- ✅ Generator reports `255 / 255` assigned; PD pool = 59; every other pool unchanged.
- ✅ PD baseline satisfies floor coverage across all nine subcategories, 23 of the cap of 32.
- ✅ **925 competence tests pass**, first run — no fixture depended on PD being unpopulated.
- ✅ `eslint .` reports 0 errors (2 pre-existing warnings, untouched).
- ✅ Content-integrity test passes: every competency carries non-empty `en` and `bg`.
- ✅ Purely additive — no code dropped or renumbered, so **no evaluation data migration**.
- ✅ A **newly seeded** `2026-H2` cycle includes PD automatically, since the seeder derives `excludedFamilies` from which families carry competencies at creation time.

### 7g. Deployment note — PD will not appear in an existing cycle on its own

Two separate things have to happen on an already-running instance, and neither is automatic:

1. **Config documents are store-backed.** Competency texts are labels, and the affected documents are held in the config store, so the new content reaches users through the **Configuration drift** panel (Administration → Configuration). Startup logs a WARNING per drifted document until it is reconciled.
2. **`cycle.excludedFamilies` is derived once, at cycle creation, and is deliberately never re-derived** (`cycle-setup-tools.js`, CA-103) — including a family in a cycle is a governance decision, not a computation. An existing `2026-H2` cycle created before this release therefore still lists PD as excluded. Cycle Setup surfaces this via `deriveStaleExclusions`, which flags a family that has gained competencies since the cycle was created, so a Supervisor can act on it deliberately.

The same applies to MC from Increment 6. Recording it here because §6f stated the automatic-inclusion half without the second condition.

---

## Working rules

1. **One increment per completed family**, not per drafting session. Partial families are not implementable.
2. **Record relocations explicitly.** A competency moving between family-specific and shared changes which relevancy pools reference it — the most likely source of a broken build.
3. **Watch for further canonicalization candidates** as remaining families are built. Apply the meaning-identity test. Likely candidates: domain-specific tooling competencies, documentation competencies, and "accumulated experience" — though the last three have so far proven genuinely family-specific.
4. **Bulgarian follows English** within the same increment; do not let BG lag more than one increment behind. This is now enforced, not merely a convention: the content-integrity test fails on any competency missing `bg`.
5. **Archetype assignment** for new competencies happens before implementation, not after.
6. **Never hand-edit generated config.** `config.role-family-competencies.json`, `config.relevancy-archetypes.json` and the `relevancyArchetype` fields come from `competency-relevancy-model.md` via `bin/build/build-competency-relevancy.js`. Edit the model doc and re-run it.
