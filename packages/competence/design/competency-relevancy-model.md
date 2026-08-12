# Competency Relevancy Model — Archetypes & Assignments

Defines the per-stage-level relevancy weights for every competency, via a small set of **curve archetypes**. This is the reviewable specification; `bin/build/build-competency-relevancy.js` expands it mechanically into the generated config (see *Materialization* at the end).

## Conceptual model

The framework already separates two concerns, and this model keeps them separate:

1. **Is a competency relevant to a family at all?** → handled by **selection** into the family's active competency set (HR's per-cycle decision via `config.active-competency-sets.json`). A competency a family never uses simply isn't in its set.
2. **How does a competency's importance scale with seniority?** → handled by the **relevancy curve** (this document) — a weight per stage-level on the 2–10 scale.

Because selection handles family relevance, **relevancy curves are assigned once per competency and applied uniformly across every family that uses the competency.** This is defensible (the *shape* of how, say, "time management" grows with seniority is not discipline-specific) and tractable. Fine-grained per-family weight differences (e.g., whether estimation is weighted slightly higher for PM than SE) are a **calibration task deferred to after cycle 1**, consistent with the master index's deferral note. The rebuild emits a per-family file, so a later calibration pass can diverge any individual family's curve without structural change.

## Scale and stage-levels

- **Scale:** integer 2–10 (matches existing data; 2 = minimally relevant/assumed, 10 = critical/defining at that level).
- **Stage-levels (12 sub-levels), in order:** `N1, J1, J2, J3, R1, R2, R3, S1, S2, S3, X1, T1`.
- `X1` = Expert (IC track); `T1` = Team Lead (management track). Where a competency leans toward one track, the archetype reflects it in those two values.

## The archetypes

| ID | Name | N1 | J1 | J2 | J3 | R1 | R2 | R3 | S1 | S2 | S3 | X1 | T1 | Used for |
|----|------|----|----|----|----|----|----|----|----|----|----|----|----|----------|
| **A** | Foundational-plateau | 6 | 7 | 7 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 9 | Fundamentals important from day one that stay important (core knowledge, everyday tools) |
| **B** | Rising-with-seniority | 2 | 3 | 4 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 10 | 10 | Capabilities expected to grow markedly with level (advanced knowledge, strategy, experience, most interpersonal growth) |
| **C** | Steady-high | 7 | 7 | 8 | 8 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | Consistently important at all levels (ethics, deadlines, core communication, process adherence) |
| **D** | Early-emphasis-then-assumed | 7 | 8 | 8 | 9 | 8 | 8 | 7 | 7 | 6 | 6 | 6 | 6 | Hands-on mechanics evaluated heavily early, mastered/assumed later (basic coding mechanics, conventions) |
| **E** | Mid-weighted | 4 | 5 | 6 | 7 | 8 | 9 | 9 | 9 | 9 | 8 | 8 | 8 | Applied skills peaking at regular/senior (core "doing" competencies of each discipline) |
| **F** | Rising, expert-leaning | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 9 | 10 | 7 | Deep technical capabilities where the IC expert is the authority (architecture, R&D, technical debt) |
| **G** | Rising, manager-leaning | 2 | 3 | 3 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 7 | 10 | People/team capabilities where the manager track is the peak (delegation, leadership, developing & motivating others) |

*Archetypes A–E have `X1 ≈ T1` (the two senior tracks weight the competency similarly). F and G are the only track-divergent shapes.*

---

## Assignments — Shared competencies

| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-10 | Business & IT domain knowledge | B | deeper command at senior; canonical since the QE increment |
| E3-22 | Facilitation | B | interpersonal, rises with level |
| E3-23 | Leadership and influencing | G | manager track is the peak |
| E3-25 | Negotiation and conflict resolution | B | |
| I2-1 | Time management | C | steady at all levels |
| I2-2 | Planning & prioritization of own tasks | C | |
| I2-3 | Task delegation | G | delegation is a leadership skill; low early |
| I2-4 | Meeting agreed deadlines | C | |
| I2-5 | Coordination & synchronization | B | grows with scope of responsibility |
| I2-6 | Identifying & reporting risks in own workflow | C | every level should surface risks |
| I3-1 | Determining task complexity | E | core estimation skill, peaks R/S |
| I3-2 | Estimating time and effort | E | |
| I3-3 | Identifying resources & dependencies | E | |
| C1-1 | Desire for self-improvement | A | matters from day one, stays high |
| C1-2 | Willingness for certification & training | A | |
| C1-3 | Engagement in improving processes | B | more impact at senior levels |
| C1-4 | Adherence to work ethics | C | non-negotiable at every level |
| C1-5 | Applying best practices | C | |
| C1-6 | Handling criticism & failures | C | |
| C1-7 | Independent execution of tasks | B | autonomy expected to grow |
| C1-8 | Appropriate escalation & help-seeking | C | judgment differs by level, relevance steady |
| C2-1 | Professional communication at team level | C | |
| C2-2 | Inter-team communication & coordination | B | grows with cross-team scope |
| C2-3 | Proactive, timely & accurate communication | C | |
| C2-4 | Communication with external stakeholders | B | |
| C2-5 | Presentation skills | B | |
| C3-1 | Knowledge sharing | B | |
| C3-2 | Onboarding new colleagues | B | |
| C3-3 | Supporting colleagues' development | G | mentoring peaks on the management track |
| C3-4 | Providing feedback to managers & colleagues | B | |
| C3-5 | Support and motivation | G | team-morale peak on management track |

## Assignments — SE family-specific

| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-1 | Knowledge of relational databases | A | fundamental |
| E1-2 | Knowledge of non-relational databases | A | |
| E1-3 | Fundamental programming concepts | A | |
| E1-4 | Fundamental data structures | A | |
| E1-5 | Fundamental algorithms | A | |
| E1-6 | Team's primary programming language | A | |
| E1-7 | OOP principles | A | |
| E1-8 | Architectural models & design patterns | F | deep technical, expert-leaning |
| E1-9 | Security concepts in programming | B | more central at senior levels |
| E2-1 | Professional style & well-structured code | D | core mechanic, assumed at senior |
| E2-3 | Effective use of data structures & algorithms | E | |
| E2-4 | Using a debugger | D | |
| E2-5 | Effective use of unit tests | D | |
| E2-7 | Refactoring & optimizing | E | |
| E2-8 | Designing non-trivial functionalities | E | |
| E2-9 | Conducting R&D | F | expert-leaning |
| E2-10 | Designing libraries / SDKs | F | expert-leaning |
| E2-11 | Justifying technical solution | B | |
| E2-12 | Documenting completed work / code | C | |
| E2-13 | Containers & stateless systems | E | |
| E2-14 | Integration & external APIs | E | |
| E2-15 | Applying DevOps practices | E | |
| E2-16 | Complex multi-component architectures | F | deep technical, expert-leaning |
| E3-1 | Accumulated professional experience | B | experiential, rises by definition |
| E3-2 | Development tools & systems | A | used daily at all levels |
| E3-5 | Quality maintenance of production systems | E | |
| E3-6 | Minimizing errors during implementation | C | |
| E3-7 | Managing technical debt | F | senior/architect concern |
| I1-1 | Adhering to internal SDLC process | C | |
| I1-2 | Performing code review | B | reviewing responsibility grows |
| I1-3 | Adhering to coding & commit conventions | D | baseline discipline, checked early |

## Assignments — BA family-specific

| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-15 | Elicitation techniques | E | |
| E1-13 | Analysis & modelling techniques | E | |
| E1-11 | Requirements specification & expression | E | |
| E1-22 | Root cause & problem analysis | B | |
| E1-21 | Requirements & solution risk analysis | B | |
| E1-46 | Public administration legislation (BA) | B | |
| E1-47 | Cross-institutional processes (BA) | B | |
| E2-17 | Planning & monitoring the BA approach | B | planning leans senior |
| E2-22 | Elicitation | E | |
| E2-27 | Requirements analysis & design definition | E | |
| E2-25 | Requirements life cycle management | E | |
| E2-26 | Strategy analysis | B | strategic, senior |
| E2-24 | Managing stakeholder collaboration | B | |
| E2-23 | Communicating BA information | E | |
| E2-21 | Documenting & tracking BA work | C | |
| E2-28 | Solution evaluation & requirements definition | B | |
| E3-8 | Accumulated BA experience | B | |
| E3-9 | BA tools | A | |
| E3-11 | Documenting completed analysis in system | C | |
| I1-4 | Adhering to the BA process | C | |
| I1-5 | Change management (BA context) | B | |

## Assignments — PM family-specific

| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-26 | PM frameworks & methodologies | B | command grows with level |
| E1-36 | Scope management | E | |
| E1-34 | Work breakdown & decomposition (WBS) | E | |
| E1-42 | Schedule & dependency management | E | |
| E1-43 | Cost & budget management | B | budget responsibility grows |
| E1-28 | Resource & team planning | B | |
| E1-35 | Quality management | E | |
| E1-37 | Risk & opportunity management | B | |
| E1-30 | Project performance measurement | E | |
| E1-32 | Project knowledge & information management | C | |
| E1-44 | Public administration legislation (PM) | B | |
| E1-45 | Cross-institutional processes (PM) | B | |
| E2-29 | Selecting & tailoring the delivery approach | B | |
| E2-33 | Project planning & integration | E | |
| E2-30 | Stakeholder analysis & engagement | E | |
| E2-31 | Project governance & controls | B | |
| E2-34 | Maintaining project logs & registers | E | |
| E2-35 | Project reporting & communication | E | |
| E2-41 | Managing project execution & delivery | E | |
| E2-40 | Project closure & lessons learned | E | |
| E3-18 | Accumulated PM experience | B | |
| E3-19 | PM tools | A | |
| E3-21 | Documenting project artifacts | C | |
| I1-6 | Adhering to project-delivery process | C | |
| I1-7 | Change management within projects | B | |

## Assignments — QE family-specific

| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-48 | Software testing principles & levels | A | fundamental from day one, stays important |
| E1-49 | Test design techniques | E | core discipline technique, peaks R/S |
| E1-50 | Software quality models & characteristics | B | deeper command at senior |
| E1-51 | Risk-based testing | B | risk judgment grows with level |
| E1-52 | Defect management & root cause analysis | B | RCA depth leans senior |
| E1-53 | Analysing requirements for testability | E | analytical core, peaks R/S |
| E1-54 | Test data management | E | |
| E1-55 | Test automation concepts & architecture | F | architecture judgment, expert-leaning |
| E1-56 | Non-functional testing concepts | B | breadth grows with level |
| E1-57 | Quality assurance across the lifecycle | B | lifecycle/strategic view, senior |
| E2-42 | Test planning & strategy | B | planning leans senior |
| E2-43 | Designing & writing test cases | E | core "doing" competency |
| E2-44 | Executing tests & reporting results | D | everyday mechanic, assumed later |
| E2-45 | Exploratory testing | E | |
| E2-46 | Defect reporting & triage | C | reporting discipline, steady at all levels |
| E2-47 | Regression testing & suite maintenance | E | |
| E2-48 | API & integration testing | E | |
| E2-49 | Database & data validation testing | E | |
| E2-50 | Test environment setup & troubleshooting | E | |
| E2-51 | Quality metrics & status reporting | E | measurement & reporting, peaks R/S |
| E3-28 | Accumulated quality engineering experience | B | experiential, rises by definition |
| E3-29 | Quality engineering tools | A | used daily at all levels |
| E3-30 | Investigating & diagnosing complex defects | F | deep diagnostic, expert-leaning |
| I1-8 | Adhering to the internal QA & testing process | C | |
| I1-9 | Participating in requirement & design reviews | B | review responsibility grows |
| I1-10 | Adhering to test documentation & artifact standards | C | auditability stays live at senior |

---

## Distribution check

| Archetype | Count |
|---|---|
| A — Foundational-plateau | 14 |
| B — Rising-with-seniority | 44 |
| C — Steady-high | 22 |
| D — Early-emphasis-then-assumed | 5 |
| E — Mid-weighted | 38 |
| F — Rising, expert-leaning | 7 |
| G — Rising, manager-leaning | 4 |
| **Total** | **134** |

*134 = 31 shared + 31 SE + 21 BA + 25 PM + 26 QE — each competency listed exactly once, which is what the table counts. The distribution is dominated by B (rising) and E (mid-weighted), which is expected for a professional competency model: most capabilities either grow with seniority or peak in the productive middle.*

*Correction note (QE increment): the previous version of this table read A 14 · B 40 · C 21 · D 5 · E 22 · F 6 · G 5 = 113, which did not match the assignment tables above it on any row and reconciled against a family split that no longer held. The counts here are derived mechanically from the assignment tables and should be re-derived, not hand-adjusted, whenever an increment lands.*

## Materialization

This document is the **source**; `bin/build/build-competency-relevancy.js` is the generator. Run it after editing the curves or any assignment table:

```bash
node bin/build/build-competency-relevancy.js
```

It writes three things, and none of them should be hand-edited:

| Output | Content |
|---|---|
| `config.relevancy-archetypes.json` | The curve table above, as `{ <id>: { weights: { N1…T1 } } }` |
| `config.competencies.json` | A `relevancyArchetype` pointer stamped on every dictionary entry |
| `config.role-family-competencies.json` | The per-family competency **pool** — each family's `## Assignments — <family> family-specific` section plus every row in `## Assignments — Shared competencies` |

The effective per-stage-level weight is resolved at evaluation-snapshot time from a competency's archetype, so relevancy is **global per competency** — the same curve wherever the competency is used. There is no per-family weight file; an earlier `config.competency-relevancy.json` was materialized that way and was retired when the archetype model landed.

Because the pool is derived from section membership, **moving a competency between a family section and the shared section is how it is promoted or demoted** — that single move is what put E1-10 into all nine family pools in the QE increment.

**Deferred (post-cycle-1 calibration):** any individual competency's curve may later be tuned away from its archetype default based on real evaluation data — by assigning it a new archetype, or by adding an archetype — without structural change. The archetype defaults are the sensible starting point, not a permanent constraint. Per-*family* divergence of the same competency's curve would require reintroducing a per-family weight file and is deliberately not supported today.
