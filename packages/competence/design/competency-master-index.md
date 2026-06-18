# Competency Master Index — Assembled Final State

Authoritative code → name → applicability reference for the rebuilt competency model. Full descriptions and six-level scope anchors live in `competency-definitions-final.md`; this index is the map. Three families are defined (SE, BA, PM); the remaining six role families (QE, XD, DA, IO, MC, PD) are not yet populated.

## Code scheme (Option A)

- **Flat, globally-unique codes** within each category/subcategory (`E1-n`, `E2-n`, `E3-n`, `I1-n`, `I2-n`, `I3-n`, `C1-n`, `C2-n`, `C3-n`). No namespacing.
- **No collisions.** Families occupy distinct numeric ranges in E1/E2/E3; I1 was renumbered clean (1–7); the shared sets are single sequences.
- **Gaps are intentional and retained.** Dropped/merged competencies leave their old numbers vacant rather than triggering a renumber. This keeps surviving codes stable and traceable to the pilot data held in the separate analysis DB.
- **Applicability** (which family uses a competency) is **not** encoded in the code. It lives in `config.competency-relevancy.json` (the per-family pool + weights) and `config.active-competency-sets.json` (the per-cycle selection). Family-specific competencies belong to exactly one family; shared canonical competencies are available to all.

## Totals

| Group | E1 | E2 | E3 | I1 | I2 | I3 | C1 | C2 | C3 | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| SE family-specific | 9 | 14 | 5 | 3 | — | — | — | — | — | 31 |
| BA family-specific | 8 | 9 | 3 | 2 | — | — | — | — | — | 22 |
| PM family-specific | 12 | 8 | 3 | 2 | — | — | — | — | — | 25 |
| Shared canonical | — | — | 3 | — | 6 | 3 | 8 | 5 | 5 | 30 |
| **Distinct total** | | | | | | | | | | **108** |

Each family, in practice, draws its own Expertise + I1 plus whichever shared canonical competencies HR selects → roughly 55–60 competencies available per family before the per-cycle cap (default 30) is applied.

---

## SE — Software Engineering (family-specific)

**E1 — Theoretical knowledge**
| Code | Name |
|---|---|
| E1-1 | Knowledge of relational databases |
| E1-2 | Knowledge of non-relational databases |
| E1-3 | Understanding of fundamental programming concepts |
| E1-4 | Knowledge of fundamental data structures |
| E1-5 | Knowledge of fundamental algorithms |
| E1-6 | Knowledge of the team's primary programming language |
| E1-7 | Knowledge of object-oriented programming principles |
| E1-8 | Understanding of architectural models and design patterns |
| E1-9 | Understanding of security concepts in programming |

**E2 — Applied skills**
| Code | Name |
|---|---|
| E2-1 | Using professional style and creating well-structured, modular, readable code |
| E2-3 | Effective use of data structures and algorithms |
| E2-4 | Using a debugger to identify and resolve issues |
| E2-5 | Effective use of unit tests for code validation |
| E2-7 | Refactoring and optimizing code and resources |
| E2-8 | Designing and developing non-trivial functionalities |
| E2-9 | Conducting R&D and analyzing results |
| E2-10 | Designing and developing libraries / SDKs |
| E2-11 | Justifying chosen / proposed technical solution |
| E2-12 | Documenting completed work including code |
| E2-13 | Working with containers and stateless systems |
| E2-14 | Integration and working with external APIs and systems |
| E2-15 | Applying DevOps practices (CI/CD, automation, pipelines) |
| E2-16 | Designing and developing complex multi-component architectures |

**E3 — Practical experience** *(discipline-specific)*
| Code | Name |
|---|---|
| E3-1 | Applying accumulated professional experience |
| E3-2 | Knowledge and use of development tools and systems |
| E3-5 | Quality maintenance of production systems / modules |
| E3-6 | Minimizing errors during task implementation |
| E3-7 | Managing technical debt |

**I1 — Processes**
| Code | Name |
|---|---|
| I1-1 | Adhering to the internal SDLC process |
| I1-2 | Performing code review |
| I1-3 | Adhering to coding and commit conventions |

---

## BA — Business Analysis (family-specific)

**E1 — Theoretical knowledge**
| Code | Name |
|---|---|
| E1-10 | Business and IT domain knowledge |
| E1-11 | Requirements specification and expression |
| E1-13 | Analysis and modelling techniques |
| E1-15 | Elicitation techniques |
| E1-21 | Requirements and solution risk analysis |
| E1-22 | Root cause and problem analysis |
| E1-46 | Public administration legislation and regulatory awareness |
| E1-47 | Cross-institutional public-sector processes and documentation |

**E2 — Applied skills**
| Code | Name |
|---|---|
| E2-17 | Planning and monitoring the business analysis approach |
| E2-21 | Documenting and tracking business analysis work |
| E2-22 | Elicitation |
| E2-23 | Communicating business analysis information |
| E2-24 | Managing stakeholder collaboration |
| E2-25 | Requirements life cycle management |
| E2-26 | Strategy analysis |
| E2-27 | Requirements analysis and design definition |
| E2-28 | Solution evaluation and requirements definition |

**E3 — Practical experience** *(discipline-specific)*
| Code | Name |
|---|---|
| E3-8 | Applying accumulated business analysis experience |
| E3-9 | Knowledge and use of business analysis tools |
| E3-11 | Documenting completed analysis in the chosen system |

**I1 — Processes**
| Code | Name |
|---|---|
| I1-4 | Adhering to the business-analysis process |
| I1-5 | Change management in the business-analysis context |

---

## PM — Project & Delivery Management (family-specific)

**E1 — Theoretical knowledge**
| Code | Name |
|---|---|
| E1-26 | Project management frameworks and methodologies |
| E1-28 | Resource and team planning |
| E1-30 | Project performance measurement |
| E1-32 | Project knowledge and information management |
| E1-34 | Work breakdown and decomposition (WBS) |
| E1-35 | Quality management |
| E1-36 | Scope management |
| E1-37 | Risk and opportunity management |
| E1-42 | Schedule and dependency management |
| E1-43 | Cost and budget management |
| E1-44 | Public administration legislation and regulatory awareness |
| E1-45 | Cross-institutional public-sector processes and documentation |

**E2 — Applied skills**
| Code | Name |
|---|---|
| E2-29 | Selecting and tailoring the delivery approach |
| E2-30 | Stakeholder analysis and engagement |
| E2-31 | Project governance and controls |
| E2-33 | Project planning and integration |
| E2-34 | Maintaining project logs and registers |
| E2-35 | Project reporting and communication |
| E2-40 | Project closure and lessons learned |
| E2-41 | Managing project execution and delivery |

**E3 — Practical experience** *(discipline-specific)*
| Code | Name |
|---|---|
| E3-18 | Applying accumulated project management experience |
| E3-19 | Knowledge and use of project management tools |
| E3-21 | Documenting project artifacts |

**I1 — Processes**
| Code | Name |
|---|---|
| I1-6 | Adhering to the internal project-delivery process |
| I1-7 | Change management within projects |

---

## Shared Canonical (available to all families)

*Referenced by every family that needs them; selected into a family's active set per cycle by HR. Written once, family-agnostic.*

**E3 (cross-cutting) — Practical experience**
| Code | Name |
|---|---|
| E3-22 | Facilitation |
| E3-23 | Leadership and influencing |
| E3-25 | Negotiation and conflict resolution |

**I2 — Planning**
| Code | Name |
|---|---|
| I2-1 | Time management |
| I2-2 | Planning and prioritization of own tasks |
| I2-3 | Task delegation |
| I2-4 | Meeting agreed deadlines |
| I2-5 | Coordination and synchronization of teams and activities |
| I2-6 | Identifying and reporting risks in own workflow |

**I3 — Estimation**
| Code | Name |
|---|---|
| I3-1 | Determining task complexity |
| I3-2 | Estimating time and effort to complete a task |
| I3-3 | Identifying necessary resources and dependencies |

**C1 — Responsibility**
| Code | Name |
|---|---|
| C1-1 | Desire for self-improvement |
| C1-2 | Willingness for certification and training |
| C1-3 | Engagement in developing and improving processes |
| C1-4 | Adherence to work ethics |
| C1-5 | Applying best practices at work |
| C1-6 | Handling criticism and failures |
| C1-7 | Independent execution of tasks |
| C1-8 | Appropriate escalation and help-seeking |

**C2 — Communication**
| Code | Name |
|---|---|
| C2-1 | Professional communication at team level |
| C2-2 | Inter-team communication and coordination |
| C2-3 | Proactive, timely, and accurate communication |
| C2-4 | Communication with external stakeholders |
| C2-5 | Presentation skills |

**C3 — Mentorship**
| Code | Name |
|---|---|
| C3-1 | Knowledge sharing |
| C3-2 | Onboarding new colleagues |
| C3-3 | Supporting colleagues' professional development |
| C3-4 | Providing feedback to managers and colleagues |
| C3-5 | Support and motivation |

---

## Retired codes (traceability)

These old codes are intentionally vacant in the new scheme; their content was dropped, merged, or moved.

- **E1:** 12, 14, 16, 17, 18, 19, 20, 23, 24, 25 (BA techniques → consolidated into E1-11/13/15); 27, 29, 31, 33, 38, 39, 40, 41 (PM → merged/dropped/recategorized).
- **E2:** 2 (→ C1-8); 6 (→ E2-3); 18, 19, 20 (→ E2-17); 32 (→ E2-29); 36 (→ E2-30); 37 (→ I3); 38 (BA owns Strategy Analysis at E2-26); 39 (→ E2-35).
- **E3:** 3, 4 (SE tools → E3-2); 10 (Aha! artifact, dropped); 12, 13, 15 (BA cross-cutting → shared E3-22/23/25); 14, 16, 17 (→ shared C core); 20 (Aha! → E3-19); 24, 26, 27 (PM cross-cutting/duplicates → shared / C core).
- **I1:** 7 (SE → folded into I1-1); 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 (BA/PM → consolidated into I1-4/5/6/7 or moved to new E1 public-sector competencies / shared C1).
- **I2:** 7, 8, 9, 10, 11 (→ collapsed into canonical I2-1…6).
- **I3:** 4, 5, 6, 7 (→ collapsed into canonical I3-1…3; budget → PM E1-43).
- **C2:** 6 (→ C2-1). **C3:** 6 (→ C3-2), 7 (→ C3-5).

---

## Deferred to follow-up (NOT in the rebuild prompt)

The rebuild establishes the competency **definitions and structure in English**. Three things are explicitly out of scope and flagged as separate tasks:

1. **Bulgarian translations of new/changed content.** English-first was the agreed approach. Retained-as-is SE competencies keep their existing `bg`; all new and changed competencies (all of PM, BA, shared, and the SE changes) will have `en` only until a translation pass is done. The rebuild seeds `bg` placeholders for these so the schema stays valid.
2. **Relevancy weight calibration.** Per-stage-level numeric weights per family are a separate work session (as agreed). The rebuild preserves existing SE weights where the competency is unchanged and seeds a sensible default weight curve for new/changed competencies, flagged for calibration before the next real evaluation cycle.
3. **Per-cycle active-competency-set selection.** Which competencies HR selects (within the cap) for cycle 2026-H2 is done through the cycle-setup UI. The rebuild seeds a reasonable default baseline per family so the app is runnable, but the real selection is an HR action.
