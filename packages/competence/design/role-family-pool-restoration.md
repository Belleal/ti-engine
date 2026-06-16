# Role-Family Competency Pool — Restoration Design

| Field | Value |
|---|---|
| **Status** | Phases 1–4 implemented (uncommitted, pending review) |
| **Created** | 2026-06-16 |
| **Last updated** | 2026-06-16 |
| **Owner** | Boris Kostadinov |
| **Scope** | `@ti-engine/competence` — config + build script + configuration-loader + config-registration/validators + cycle-setup (server + UI) + tests |
| **Relates to** | restores the per-family applicability **pool** dropped by `1b38ffe` (admin-config B1, see `packages/web-framework/design/admin-config-management.md` §5); source of truth = `design/competency-relevancy-model.md` + `design/competency-master-index.md` |

## Problem

The framework's design defines a per-family **applicability pool**: each family draws on its family-specific competencies **plus** the 30 shared canonical ones — **SE 61 / BA 52 / PM 55** (rebuild inventory §7; master index §"Code scheme"; relevancy model §"Materialization"). HR then selects a per-cycle Active Competency Set from *within that pool* (≤ cap).

The pool used to live as the **keys** of `config.competency-relevancy.json` (`[family][code] → weights`). Commit `1b38ffe` ("relevancy via editable archetypes") replaced that file with a global, family-independent archetype model (`config.relevancy-archetypes.json` + one `relevancyArchetype` per competency). The relevancy **values** were preserved faithfully — the model is global *by design* (relevancy model §"Conceptual model": curves are "assigned once per competency and applied uniformly across every family"; verified: 0/30 shared curves diverged across families in the old file). But the pool **keys had no replacement and were lost.**

Consequences: the cycle-setup picker offers all 108 competencies for every family; `validateCycleForLock` cannot enforce family membership (a PM competency can be dropped into an SE baseline); the "~55–60 available per family" universe is not represented at runtime.

## Decision (ratified 2026-06-16)

Restore the pool as a **standalone config document**; keep relevancy **global** (no per-family calibration, not even pre-shaped — explicitly out of scope per owner); wire the pool into cycle setup as the competency universe.

- **Representation:** `bin/config/config.role-family-competencies.json`, keyed `family → [codes]`, each family carrying its **complete** pool (family-specific + shared). Mirrors the retired relevancy-file keys exactly. **Every** role family in `config.role-families.json` gets a pool: the three populated families carry family-specific + shared (SE 61 / BA 52 / PM 55); the six not-yet-populated families (QE/XD/DA/IO/MC/PD) carry the **30 shared canonical** competencies only — so they share the core even before their family-specific content is authored. (They still can't be locked: floor coverage needs E1/E2/I1, which the shared set lacks.)
- **Picker behaviour:** the cycle-setup picker shows **exactly** `pool[family]` — no "show all" fallback. A family with no pool entry at all yields an empty picker ("nothing to add yet"), the correct state.
- **Source of truth:** the per-family assignment tables in `design/competency-relevancy-model.md` (already parsed by `build-competency-relevancy.js` for archetype assignment); the build script is extended to emit the pool from the same parse, so the generator stays single-source.
- **Lifecycle:** registered as a store-backed, exportable, restorable config document (like the others), `editable: false` for now — a dedicated pool **editor screen** is deferred (owner: export-to-JSON is the priority; editing UI is convenience and can follow).

## Out of scope

- Per-family relevancy weights / calibration (deferred indefinitely per owner; global archetypes stay; not even pre-shaped).
- A dedicated admin **editor screen** for the pool (registered + exportable now; editor later if wanted).
- Family-specific competencies for the six unpopulated families (QE/XD/DA/IO/MC/PD) — none authored yet; their pool is the shared canonical competencies only.

## Enforcement points (how the pool is "properly used")

| Point | Layer | Rule |
|---|---|---|
| Cycle-setup picker | client | lists only `pool[selectedFamily]` |
| `#setActiveCompetencySet` | server (cycle-setup save) | rejects codes outside `pool[family]` |
| `validateCycleForLock` | framework (lock gate) | every resolved-set code ∈ `pool[family]` |
| `activeSetsWithinPool` | config validator (admin restore/import path) | every active-set code ∈ `pool[family]` |
| `poolReferenceIntegrity` | config validator (pool edits/restore) | pool families ∈ role-families; pool codes ∈ dictionary |

The seed is already pool-clean (verified: 0 codes outside their family pool), so enforcement does not invalidate existing data.

## Implementation log

| Phase / step | Status | Commit | Date |
|---|---|---|---|
| Design ratified (separate file; global relevancy stays; editor deferred) | ✅ ratified | — | 2026-06-16 |
| Phase 1 — emit pool from build script + config file + loader export/helper + store-backing | ✅ implemented | — | 2026-06-16 |
| Phase 2 — schema + register doc + `poolReferenceIntegrity` + `activeSetsWithinPool` | ✅ implemented | — | 2026-06-16 |
| Phase 3 — cycle-setup wiring (picker filter, save assert, lock validation) | ✅ implemented | — | 2026-06-16 |
| Phase 4 — schema/pool integrity tests + validator unit tests + changelog/version (3.1.0) | ✅ implemented | — | 2026-06-16 |
| Side-fix — load relocated `config.application.schema.json` from `bin/data/schemas/` | ✅ implemented | — | 2026-06-16 |
| Refinement — all families get a pool (unpopulated = shared only); picker shows exactly the pool (empty if none) | ✅ implemented | — | 2026-06-16 |
