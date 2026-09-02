# Competency Relevancy Model — Archetypes & Assignments

Defines the per-stage-level relevancy weights for every competency, via a small set of **curve archetypes**. This is the reviewable specification; `bin/build/build-competency-relevancy.js` expands it mechanically into the generated config (see *Materialization* at the end).

## Conceptual model

The framework already separates two concerns, and this model keeps them separate:

1. **Is a competency relevant to a family at all?** → handled by **selection** into the family's active competency set (HR's per-cycle decision via `config.active-competency-sets.json`). A competency a family never uses simply isn't in its set.
2. **How does a competency's importance scale with seniority?** → handled by the **relevancy curve** (this document) — a weight per stage-level on the 2–10 scale.

Because selection handles family relevance, **relevancy curves are assigned once per competency and applied uniformly across every family that uses the competency.** This is defensible (the *shape* of how, say, "time management" grows with seniority is not discipline-specific) and tractable. Fine-grained per-family weight differences (e.g., whether estimation is weighted slightly higher for PM than SE) are a **calibration task deferred to after cycle 1**, consistent with the master index's deferral note. The per-family file the generator emits (`config.role-family-competencies.json`) holds **pools only** — which competencies a family may draw on — so diverging one family's curve from another's is not a matter of editing it; it would need a per-family weight file reintroduced. Within the global model, a competency's curve is recalibrated by assigning it a different archetype, or by adding one.

## Scale and stage-levels

- **Scale:** integer 2–10 (matches existing data; 2 = minimally relevant/assumed, 10 = critical/defining at that level).
- **Stage-levels (13 sub-levels), in order:** `N1, J1, J2, J3, R1, R2, R3, S1, S2, S3, X1, T1, T2`.
- `X1` = Expert (IC track); `T1` = Team Lead; `T2` = Head of Department. **T2 added** so that team leads and department heads are distinguished by weighting while sharing the same T scope anchors — see the note below.

## The archetypes

| ID | Name | N1 | J1 | J2 | J3 | R1 | R2 | R3 | S1 | S2 | S3 | X1 | T1 | **T2** | Used for |
|----|------|----|----|----|----|----|----|----|----|----|----|----|----|----|----------|
| **A** | Foundational-plateau | 6 | 7 | 7 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 9 | **8** | Fundamentals important from day one that stay important |
| **B** | Rising-with-seniority | 2 | 3 | 4 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 10 | 10 | **10** | Capabilities expected to grow markedly with level |
| **C** | Steady-high | 7 | 7 | 8 | 8 | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | **9** | Consistently important at all levels (ethics, deadlines, core communication) |
| **D** | Early-emphasis-then-assumed | 7 | 8 | 8 | 9 | 8 | 8 | 7 | 7 | 6 | 6 | 6 | 6 | **4** | Hands-on mechanics evaluated heavily early, assumed later |
| **E** | Mid-weighted | 4 | 5 | 6 | 7 | 8 | 9 | 9 | 9 | 9 | 8 | 8 | 8 | **6** | Applied skills peaking at regular/senior |
| **F** | Rising, expert-leaning | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 9 | 10 | 7 | **5** | Deep technical capabilities where the IC expert is the authority |
| **G** | Rising, manager-leaning | 2 | 3 | 3 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 7 | 10 | **10** | People/team capabilities peaking on the management track |
| **H** | **Management-track** *(new)* | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 4 | 8 | **10** | Management-of-managers capabilities: negligible for ICs, substantial at T1, peaking at T2 |

### Why T2 rather than a new stage-letter

Scope text is defined per **letter** (N/J/R/S/X/T); relevancy is defined per **sub-level**. A separate `M` letter would have required a seventh anchor for every competency — roughly 186 new strings in English and the same in Bulgarian — one per competency in the dictionary — and for most competencies (time management, ethics, communication, deadlines) the M anchor would have been the T anchor with "team" replaced by "department." Near-duplicate anchors that fail the specific-example test teach raters that parts of the instrument do not discriminate.

Instead, the genuine differences are carried by **five dedicated management competencies** (C3-8, C3-9, I2-12, I2-13, C2-7) on archetype H, and T1 versus T2 is distinguished by weighting.

### The T1 → T2 pattern

Note the shape across archetypes: hands-on and technical curves (**D**, **E**, **F**, **A**) *decline* from T1 to T2, while people, conceptual, and management curves (**B**, **C**, **G**, **H**) hold or rise. This is consistent with Katz's skill-mix argument — technical skill matters less and conceptual skill more as responsibility ascends — and it means a head of department is not simply scored higher than a team lead across the board, but scored on a different balance of capabilities.

### Implementation note

Every existing competency needs a **T2 value added** to its relevancy entry, materialized into `config.relevancy-archetypes.json`. This is mechanically derivable from each competency's assigned archetype — no scope text changes, no new anchors. `config.stage-levels.json` needs `T2` added under the T letter.

*Archetypes A–E have `X1 ≈ T1` (the two senior tracks weight the competency similarly). F, G and H are the track-divergent shapes — F leans to the IC track, G and H to the management track.*

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
| E2-52 | Architecture documentation & decision records | F | cross-cutting architecture; listed under SE and BA because only those two draw on it |
| E2-53 | Quality attribute & trade-off analysis | F | cross-cutting architecture; listed under SE and BA because only those two draw on it |
| E2-54 | Technology evaluation & selection | F | cross-cutting architecture; listed under SE and BA because only those two draw on it |
| E2-55 | System decomposition & boundary design | F | SE.ARCHITECTURE; architecture judgment, expert-leaning |
| E2-56 | Architectural governance & design review | F | SE.ARCHITECTURE; architecture judgment, expert-leaning |
| E2-57 | Scalability & resilience design | F | SE.ARCHITECTURE; architecture judgment, expert-leaning |
| E2-58 | Architecture evolution & migration planning | F | SE.ARCHITECTURE; architecture judgment, expert-leaning |

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
| E2-52 | Architecture documentation & decision records | F | cross-cutting architecture; listed under SE and BA because only those two draw on it |
| E2-53 | Quality attribute & trade-off analysis | F | cross-cutting architecture; listed under SE and BA because only those two draw on it |
| E2-54 | Technology evaluation & selection | F | cross-cutting architecture; listed under SE and BA because only those two draw on it |
| E2-59 | Cross-system & cross-institutional solution design | F | BA.SOLUTION_ARCHITECTURE; architecture judgment, expert-leaning |
| E2-60 | Interoperability & standards compliance | F | BA.SOLUTION_ARCHITECTURE; architecture judgment, expert-leaning |
| E2-61 | Solution feasibility, sizing & costing | F | BA.SOLUTION_ARCHITECTURE; architecture judgment, expert-leaning |
| E2-62 | Vendor & product evaluation | F | BA.SOLUTION_ARCHITECTURE; architecture judgment, expert-leaning |
| E2-63 | Client-facing solution justification | F | BA.SOLUTION_ARCHITECTURE; architecture judgment, expert-leaning |

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
| E1-49 | Test design techniques | A | core discipline technique, peaks R/S |
| E1-50 | Software quality models & characteristics | B | deeper command at senior |
| E1-51 | Risk-based testing | B | risk judgment grows with level |
| E1-52 | Defect management & root cause analysis | A | RCA depth leans senior |
| E1-53 | Analysing requirements for testability | B | analytical core, peaks R/S |
| E1-54 | Test data management | E | |
| E1-55 | Test automation concepts & architecture | B | architecture judgment, expert-leaning |
| E1-56 | Non-functional testing concepts | B | breadth grows with level |
| E1-57 | Quality assurance across the lifecycle | B | lifecycle/strategic view, senior |
| E2-42 | Test planning & strategy | B | planning leans senior |
| E2-43 | Designing & writing test cases | E | core "doing" competency |
| E2-44 | Executing tests & reporting results | D | everyday mechanic, assumed later |
| E2-45 | Exploratory testing | E | |
| E2-46 | Defect reporting & triage | E | reporting discipline, steady at all levels |
| E2-47 | Regression testing & suite maintenance | E | |
| E2-48 | API & integration testing | E | |
| E2-49 | Database & data validation testing | E | |
| E2-50 | Test environment setup & troubleshooting | E | |
| E2-51 | Quality metrics & status reporting | B | measurement & reporting, peaks R/S |
| E3-28 | Accumulated quality engineering experience | B | experiential, rises by definition |
| E3-29 | Quality engineering tools | A | used daily at all levels |
| E3-30 | Investigating & diagnosing complex defects | F | deep diagnostic, expert-leaning |
| I1-8 | Adhering to the internal QA & testing process | C | |
| I1-9 | Participating in requirement & design reviews | B | review responsibility grows |
| I1-10 | Adhering to test documentation & artifact standards | D | auditability stays live at senior |

---

## A note on the cross-cutting architecture codes

`E2-52`, `E2-53` and `E2-54` appear under **both** the SE and BA assignment tables rather than under *Assignments —
Shared competencies*. That is deliberate, and the two things it balances are worth keeping straight:

- They are **shared in the dictionary** — written once, one code, one set of anchors. That is the canonicalization
  principle in `competency-definitions-final.md`, and it holds.
- They are **not shared in the pool**. The *Shared* section of this document means "in every family's applicability
  pool", and these three belong only to the families that actually draw on them. Listing them there would put
  architecture documentation into the PM and QE pools, where an active set could then legitimately include it.

The generator handles the repetition: a code may appear under several families, and only a *conflicting* archetype
between two rows is an error. Keep the archetype identical in both tables.

---

# Assignments — Increment 3 (XD family and the management set)

## Assignments — XD family-specific

*Experience Design, 24 competencies (Increment 3).*

**E1 — Theoretical knowledge**
| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-58 | User-centred design principles and process | A | foundational |
| E1-59 | Human perception and cognition in design | A | foundational |
| E1-60 | Interaction design patterns and conventions | A | foundational |
| E1-61 | Visual design fundamentals | A | foundational |
| E1-62 | Information architecture | B | structuring complexity is a seniority skill |
| E1-63 | Accessibility standards and inclusive design | **C** | compliance obligation at every level — see note |
| E1-64 | User research methods | B | |
| E1-65 | Design systems and component libraries | A | used from day one |
| E1-66 | Usability principles and heuristics | A | foundational |

**E2 — Applied skills**
| Code | Name | Archetype | Note |
|---|---|---|---|
| E2-64 | Planning and conducting user research | B | |
| E2-65 | Synthesising research into insights | B | |
| E2-66 | Wireframing and prototyping | E | |
| E2-67 | Interaction and interface design | E | |
| E2-68 | Visual design execution | **E** | not D — see note |
| E2-69 | Usability testing and evaluation | E | |
| E2-70 | Design specification and developer handoff | E | |
| E2-71 | Contributing to and maintaining design systems | B | contribution and governance rise |
| E2-72 | Accessibility implementation and validation | **C** | compliance obligation at every level |

**E3 & I1**
| Code | Name | Archetype | Note |
|---|---|---|---|
| E3-31 | Applying accumulated design experience | B | |
| E3-32 | Knowledge and use of design tools | A | |
| E3-33 | Designing within technical and business constraints | B | negotiating constraint is a seniority skill |
| I1-11 | Adhering to the internal design process | C | |
| I1-12 | Participating in design critique and review | B | |
| I1-13 | Adhering to design documentation and handoff standards | D | |

## Assignments — Shared competencies (management set)

*The five management competencies, all on **H**. Shared rather than family-specific: every family has a
T-track, and a head of department is evaluated on these whichever discipline they came up through.*

| Code | Name | Archetype | Note |
|---|---|---|---|
| C3-8 | Developing and leading managers | H | management of managers, distinct from C3-3 |
| C3-9 | Talent management and succession planning | H | |
| I2-12 | Departmental capacity and resource planning | H | |
| I2-13 | Strategic alignment and objective cascade | H | |
| C2-7 | Cross-functional collaboration and organizational influence | H | |

These five are what carry the genuine T1/T2 difference. Written as rows rather than prose because the generator
reads assignments from tables — a prose statement is invisible to it, and an unassigned dictionary code aborts the
build rather than defaulting silently.

## Judgment calls worth reviewing

**Accessibility on C, not B.** E1-63 and E2-72 are weighted steady-high across every level rather than rising with seniority. This is deliberate: accessibility is a regulatory obligation on public-sector digital services, not a refinement that senior designers add. A junior producing inaccessible work is a compliance failure, not an understandable gap. Weighting it as C says so in the scoring.

**Visual design execution on E, not D.** D would have execution declining after J3, which is right for debugging or commit conventions but wrong for designers — a senior designer still executes, at higher quality and on harder problems. E peaks at R1–S2 and tapers only modestly.

**QE E2 is heavily E (8 of 10).** Expected, and correct: applied testing skills peak in the productive middle. The two exceptions are planning and metrics, both on B, because those are where seniority genuinely changes what the person does.

---

## Assignments — SE family-specific (Increment 4 specializations)

*The two SE specializations closed out in Increment 4. Listed as rows rather than prose so the generator sees them:
an assignment stated only in prose is invisible to it, and an unassigned dictionary code aborts the build.*

**SE.DATABASE_ARCHITECTURE (5) — all F**

| Code | Name | Archetype | Note |
|---|---|---|---|
| E2-73 | Data modelling and schema design | F | |
| E2-74 | Database performance tuning and query optimisation | F | |
| E2-75 | Database reliability, backup and recovery design | F | |
| E2-76 | Database migration and change management | F | |
| E2-77 | Database security and access control | F | |

Deep technical capabilities where the IC expert is the organizational authority, peaking at X1 and declining on the
management track — the same reasoning as the architecture specializations.

**SE.AI_ENGINEERING (6)**

| Code | Name | Archetype | Note |
|---|---|---|---|
| E2-78 | Model integration and prompt engineering | F | |
| E2-79 | Retrieval and context engineering | F | |
| E2-80 | Agent and tool orchestration | F | |
| E2-81 | Evaluating non-deterministic systems | F | |
| E2-82 | AI safety, guardrails and responsible deployment | **C** | obligation at every level — see note |
| E2-83 | Model selection and cost-performance optimisation | F | |

**Why E2-82 is C, not F.** Safety weighted as steady-high across all levels rather than rising with seniority, on the same principle applied to accessibility (E1-63, E2-72). A junior shipping an unguarded system is a governance failure, not a developmental gap. Weighting it as C states that in the scoring rather than leaving it to be inferred.

# Assignments — Increment 5 (DA family)

## Assignments — DA family-specific

*Data & Analytics, 23 competencies (Increment 5). Listed as rows rather than prose so the generator sees them:
an assignment stated only in prose is invisible to it, and an unassigned dictionary code aborts the build.*

**E1 — Theoretical knowledge**

| Code | Name | Archetype | Note |
|---|---|---|---|
| E1-67 | Data modelling for analytics | B | design judgment grows with level |
| E1-68 | Data pipeline and integration concepts | A | foundational |
| E1-69 | Data storage and warehouse architecture | B | |
| E1-70 | Data quality and governance | **C** | applies at every level — see note |
| E1-71 | Statistical foundations for analysis | A | foundational to the discipline |
| E1-72 | Machine learning concepts and model types | B | |
| E1-73 | Data visualisation and communication principles | A | foundational |
| E1-74 | Data privacy, protection and regulatory compliance | **C** | regulatory obligation — see note |
| E1-75 | Business metrics and measurement design | B | |

**E2 — Applied skills**

| Code | Name | Archetype | Note |
|---|---|---|---|
| E2-84 | Writing and optimising analytical queries | E | |
| E2-85 | Data acquisition and source system integration | E | |
| E2-86 | Data cleaning, transformation and preparation | E | |
| E2-87 | Exploratory data analysis | E | |
| E2-88 | Building and maintaining data pipelines | E | |
| E2-89 | Data validation and quality assurance | E | |
| E2-90 | Creating reports, dashboards and visualisations | E | |
| E2-91 | Communicating analytical findings | B | influence over decisions grows sharply |

**E3 & I1**

| Code | Name | Archetype | Note |
|---|---|---|---|
| E3-34 | Applying accumulated data and analytics experience | B | experiential, rises by definition |
| E3-35 | Knowledge and use of data and analytics tools | A | daily use at every level |
| E3-36 | Judging data reliability and fitness for purpose | B | judgment competency |
| I1-14 | Adhering to the internal data and analytics process | C | |
| I1-15 | Participating in data and analysis review | B | |
| I1-16 | Adhering to data documentation and lineage standards | D | baseline discipline, checked early |

**E1-74 on C, consistent with prior practice.** Data protection is a legal obligation, not a refinement seniors add
— the same reasoning applied to accessibility (E1-63, E2-72) and AI safety (E2-82). A junior mishandling personal
data is a compliance breach, not a developmental gap.

**E1-70 on C likewise.** Data quality is everyone's responsibility at every level; weighting it as rising would
imply juniors may publish unreliable figures.

## Distribution check

| Archetype | Count |
|---|---|
| A — Foundational-plateau | 27 |
| B — Rising-with-seniority | 62 |
| C — Steady-high | 27 |
| D — Early-emphasis-then-assumed | 8 |
| E — Mid-weighted | 48 |
| F — Rising, expert-leaning | 28 |
| G — Rising, manager-leaning | 4 |
| H — Management-track | 5 |
| **Total** | **209** |

*209 = 36 shared + 49 SE + 29 BA + 25 PM + 26 QE + 24 XD + 23 DA − 3. SE includes its four specializations
(ARCHITECTURE 4, DATABASE_ARCHITECTURE 5, AI_ENGINEERING 6). The subtraction is `E2-52`/`E2-53`/`E2-54`, which
are listed under **both** the SE and BA tables on purpose (see the note above) — 212 assignment rows resolve to
209 distinct competencies, matching the dictionary exactly. Re-derive this table mechanically after every
increment rather than adjusting it by hand, and **de-duplicate by code when you do**: counting rows overstates
F by three.*

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
