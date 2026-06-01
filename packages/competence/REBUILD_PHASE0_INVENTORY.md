# Competency Content Rebuild — Phase 0 Inventory

**Date:** 2026-06-01 · **Branch:** `current` · **Scope:** reconnaissance only, no content/config/schema changes.

This is the checkpoint deliverable for Phase 0 of `.claude/competency-content-rebuild-prompt.md`. It records the current→target delta, the SE content that must survive the destructive rebuild, reference-integrity expectations, the ratified decisions, and all flagged ambiguities/conflicts (flagged, **not** fixed here).

---

## 1. Count reconciliation — current 164 → target 108

| | Source | Count |
|---|---|---|
| Current dictionary | `bin/config/config.competencies.json` | **164** |
| Target (master index) | SE 31 · BA 22 · PM 25 · shared 30 | **108** |

**Delta (computed):** `164 − 64 removed + 8 added = 108` ✓ (no duplicate codes in target).

- **Added (8):** `C1-8`, `E1-42`, `E1-43`, `E1-44`, `E1-45`, `E1-46`, `E1-47`, `E2-41`.
- **Removed (64):** the retired codes (full list below in §6d).
- **Retained codes (100):** numbers present in both — **but a retained *code* does not imply retained *content*.** Only the SE entries in §3 keep their text; **all BA / PM / shared content is taken fresh from the MD**, overwriting any current text at those codes.

**Current dictionary by subcategory:** E1 41 · E2 40 · E3 27 · I1 18 · I2 11 · I3 7 · C1 7 · C2 6 · C3 7 = 164.

## 2. Parsed target counts per family (= 108)

| Family | E1 | E2 | E3 | I1 | I2 | I3 | C1 | C2 | C3 | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| SE | 9 | 14 | 5 | 3 | — | — | — | — | — | **31** |
| BA | 8 | 9 | 3 | 2 | — | — | — | — | — | **22** |
| PM | 12 | 8 | 3 | 2 | — | — | — | — | — | **25** |
| Shared | — | — | 3 | — | 6 | 3 | 8 | 5 | 5 | **30** |
| | | | | | | | | | | **108** |

**MD parse cross-check:** definitions doc = 85 `###` entries, BG doc = 87. The BG doc's 87 (30 shared + 22 BA + 25 PM + 8 changed/new SE + `E1-1`/`E1-2`) **+ 21 fully-preserved SE entries (sourced from existing config, not the docs) = 108.** The EN doc has 85 because `E1-1`/`E1-2` are handled there as prose name-trim notes (lines 921–924), not `###` entries.

## 3. SE-preservation manifest

Verbatim existing `en`+`bg` name/description/scope for all 31 SE codes captured to **`.rebuild-phase0/se-preserve.scratch.json`** (untracked, not committed). **Sanity check: zero empty `en`/`bg` in any preserved field** — the "SE is high quality bilingual" premise holds.

| Codes | Name | Description | Scope |
|---|---|---|---|
| E1-3, E1-4, E1-5, E1-6, E1-7, E1-8, E1-9 | preserve | preserve | preserve |
| E1-1, E1-2 | **trim** (drop parenthetical) | **EN existing + typo-fix · BG from doc** | preserve |
| E2-1, E2-4, E2-5, E2-7, E2-9, E2-10, E2-11, E2-12, E2-13, E2-14, E2-15 | preserve | preserve | preserve |
| E2-3, E2-8, E2-16 | preserve | **new (from MD)** | preserve |
| E3-5, E3-6, E3-7 | preserve | preserve | preserve |
| E3-1 | preserve | **new (from MD)** | **new (from MD)** |
| E3-2 | **new** (consolidates E3-2/3/4) | **new** | **new** |
| I1-1, I1-2, I1-3 | **new (from MD)** | **new** | **new** |

`PostgresSQL` typo: **4 occurrences**, all in `E1-1` — name (en+bg, removed by the trim) and description (en+bg, corrected to `PostgreSQL`). Expected count after rebuild: **0**.

## 4. Reference integrity

- The 108 target codes form the dictionary. Phases 4–5 regenerate `config.competency-relevancy.json` and `config.active-competency-sets.json` **from that dictionary**, so every referenced code resolves **by construction**.
- The **current** active-sets/relevancy reference many now-retired codes (e.g. `E2-6`, `I1-8`, `E1-20`, `C2-6`, `E2-32`, `I3-7`, …) — expected, and precisely why those two files are rebuilt rather than patched.
- `config.role-families.json` already defines all 9 families + specializations with localization keys and `eCFMapping: []`; Phase 3 is verification. Specialization keys used by active-sets (`BACKEND`, `REQUIREMENTS`, `AGILE`, …) all exist there.

## 5. Confirmed environment facts (for later phases)

- **Localization key scheme:** `competency.name.<CODE>`, `competency.description.<CODE>`, `competency.scope.<CODE>.<N|J|R|S|X|T>`; labels nested `competency.{name|description|scope}` → `<CODE>` → `{en,bg}` (scope: → level → `{en,bg}`). Category labels under `category.*`. **JSON style:** 2-space indent, UTF-8.
- **Validation (`competence-framework.validateCycleForLock`)** enforces exactly what Phase 5 needs: baseline floor coverage over all 9 subcategories `[E1,E2,E3,I1,I2,I3,C1,C2,C3]`, cap (default **30**, `performanceAppraisals.activeCompetencySetCap`), reference integrity, and no-empty-baseline-with-spec-data.
- **Seeder** = `data-manager.initialize()` (gated by `COMPETENCE_PRELOAD_DATA`). Seed fixtures carry **no** competency codes: `seeders/evaluations.json` = `{"evaluations":[]}`; `seeders/employees.json` references only roleFamily/specialization/level/stage. ⇒ Phase 6 = boot-check + new content-integrity test only; **no fixture rewrites**.
- **Schemas** already fit the new content: competency code pattern `^[EIC][1-3]-\d+$`, relevancy score `1–10` (archetype range 2–10 fits), no entry-count constraints. **Likely no structural schema change needed** beyond verification.

## 6. Flagged ambiguities & conflicts (flagged, not fixed)

**Resolved with owner (2026-06-01):**

- **(a) SE `I1-1/2/3` absent from §5's table.** Resolution: **new from MD** — the definitions doc supplies them (lines 1004–1035, with "*folds in former …*" notes).
- **(b) `E1-1`/`E1-2` description sourcing.** §5 says "new (from MD)" but the EN doc only trims the name + fixes the typo ("descriptions otherwise unchanged"). Resolution (owner): **EN = existing description + typo-fix; BG = the BG doc's updated text.** The resulting minor EN/BG length asymmetry for these two is accepted for now (no new EN prose authored).
- **(c) Master-index "Deferred" note (lines 240–244) is obsolete.** It predates the BG-translations and relevancy-archetype docs. Resolution (owner): **use the newer files** — BG from `competency-bg-translations.md` (native-speaker review corrections still deferred per brief §7); relevancy fully regenerated from the 7 archetypes (existing SE weights discarded).

**New findings (need a nod, but each has an evident resolution):**

- **(d) Retired-codes list miscounts by 1 — `I1-7` is reused, not retired.** `competency-master-index.md` lists I1 retired as `7,8,…,18`, but `I1-7` is reassigned to **PM "Change management within projects"** in the target. So the true removed set is **`I1-8…I1-18` (11)**, making **64 removed**, which is what the 164→108 arithmetic requires (164−64+8=108; treating I1-7 as removed would give 107). The I1 range was "renumbered clean (1–7)", so I1-1…I1-7 are all reassigned content under retained numbers. **Treating removed = 64.**
  - Full removed (64): `C2-6, C3-6, C3-7, E1-12, E1-14, E1-16, E1-17, E1-18, E1-19, E1-20, E1-23, E1-24, E1-25, E1-27, E1-29, E1-31, E1-33, E1-38, E1-39, E1-40, E1-41, E2-2, E2-6, E2-18, E2-19, E2-20, E2-32, E2-36, E2-37, E2-38, E2-39, E3-3, E3-4, E3-10, E3-12, E3-13, E3-14, E3-15, E3-16, E3-17, E3-20, E3-24, E3-26, E3-27, I1-8, I1-9, I1-10, I1-11, I1-12, I1-13, I1-14, I1-15, I1-16, I1-17, I1-18, I2-7, I2-8, I2-9, I2-10, I2-11, I3-4, I3-5, I3-6, I3-7`.
- **(e) Relevancy "distribution check" totals 113, not 108.** Cosmetic miscount in that summary table; the per-competency archetype assignments are authoritative and assign exactly one archetype to each of the 108. No impact on materialization.
- **(f) MD header annotations** (`*(new)*`, `*(consolidates …)*`, `*(repurposed …)*`) must be stripped from parsed competency names.
- **(g) `competencies.schema.json` `category` enum description** text says "E (Execution)/I (Innovation)/C (Communication)" vs the real Expertise/Insight/Commitment. Pre-existing, cosmetic; optional fix in Phase 6/7.

## 7. Ratified approach

- **Hand-author** `config.competencies.json` (108) and `competence-labels.json` (EN+BG), applying the §3 preservation map per field.
- **Script** the per-family `config.competency-relevancy.json` from the 7 archetypes (≈168 rows: SE 61 / BA 52 / PM 55; shared curves repeated per family). Re-runnable script kept in the repo.
- **Delete** the dead `bin/build/compile-*.js` in Phase 7 (no CSV inputs exist; they target old paths and the pre-split relevancy model).

## 8. Out of scope (per brief §7)

Bulgarian review corrections (owner supplies later), per-family relevancy calibration beyond archetype defaults, e-CF mapping values (placeholders only), content for the six unpopulated families (QE/XD/DA/IO/MC/PD), and per-cycle active-set selection beyond the seeded defaults.
