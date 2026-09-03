# Competency Master Index — Current State

Authoritative code → name → applicability reference. Full descriptions and stage-level anchors live in `competency-definitions-final.md`; Bulgarian in `competency-bg-translations.md`; archetypes in `competency-relevancy-model.md`; deltas in `competency-change-log.md`.

**Reflects Increments 1–8** (QE · architecture · management set · T2 · XD · SE specializations · DA · MC · PD · TC). Regenerated from the definitions file, not reconstructed from memory.

---

## Code scheme

- **Flat, globally-unique codes** within each subcategory (`E1-n`, `E2-n`, `E3-n`, `I1-n`, `I2-n`, `I3-n`, `C1-n`, `C2-n`, `C3-n`). No namespacing by family.
- **No collisions.** Families occupy distinct numeric ranges; shared sets are single sequences.
- **Gaps are intentional.** Dropped or merged competencies leave their numbers vacant. New codes continue above all previously-used numbers, including retired ones.
- **Applicability is not encoded in the code.** It lives in `config.role-family-competencies.json` (per-family pool), `config.relevancy-archetypes.json` together with each competency's `relevancyArchetype` pointer (weights), and `config.active-competency-sets.json` (per-cycle selection).

**Next free codes:** `E1-103` · `E2-116` · `E3-46` · `I1-26` · `I2-14` · `I3-4` · `C1-9` · `C2-8` · `C3-10`

## Stage-levels (13 sub-levels)

`N1 · J1 J2 J3 · R1 R2 R3 · S1 S2 S3 · X1 · T1 T2`

Scope anchors are defined per **letter** (N/J/R/S/X/T — six sets). Relevancy weights are defined per **sub-level** (thirteen values). `X1` = Expert (IC track); `T1` = Team Lead; `T2` = Head of Department, sharing T anchors and distinguished by weighting.

> **Organizational rule:** distinct job positions requiring distinct competency expectations must map to distinct stage-**letters**, since positions sharing a letter read identical anchors. This yields five distinguishable grades per track.

## Canonicalization principle

A competency is **shared** when its meaning is identical across families, even where the context of application differs; **family-specific** when the underlying content genuinely differs by discipline.

---

## Totals

| Group | E1 | E2 | E3 | I1 | I2 | I3 | C1 | C2 | C3 | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| Shared canonical | 1 | 3 | 3 | — | 8 | 3 | 8 | 6 | 7 | **39** |
| SE family-specific | 9 | 14 | 5 | 3 | — | — | — | — | — | **31** |
| BA family-specific | 7 | 9 | 3 | 2 | — | — | — | — | — | **21** |
| PM family-specific | 12 | 8 | 3 | 2 | — | — | — | — | — | **25** |
| QE family-specific | 10 | 10 | 3 | 3 | — | — | — | — | — | **26** |
| XD family-specific | 9 | 9 | 3 | 3 | — | — | — | — | — | **24** |
| SE.ARCHITECTURE spec. | — | 4 | — | — | — | — | — | — | — | **4** |
| BA.SOLUTION_ARCHITECTURE spec. | — | 5 | — | — | — | — | — | — | — | **5** |
| SE.DATABASE_ARCHITECTURE spec. | — | 5 | — | — | — | — | — | — | — | **5** |
| SE.AI_ENGINEERING spec. | — | 6 | — | — | — | — | — | — | — | **6** |
| DA family-specific | 9 | 8 | 3 | 3 | — | — | — | — | — | **23** |
| MC family-specific | 9 | 8 | 3 | 3 | — | — | — | — | — | **23** |
| PD family-specific | 9 | 8 | 3 | 3 | — | — | — | — | — | **23** |
| TC family-specific | 9 | 8 | 3 | 3 | — | — | — | — | — | **23** |
| **Distinct total** | | | | | | | | | | **278** |

*Shared totals include the three cross-cutting architecture competencies (E2-52/53/54) and the five management competencies (C2-7, C3-8, C3-9, I2-12, I2-13).*

**Families defined but not yet populated:** IO only (deferred — infrastructure department).

**Taxonomy note:** TC is a **tenth family**, created in Increment 8 — the only family this project adds to the taxonomy rather than populating an existing definition. `BA.DOC_PROC` is retired and its population moves to TC.

---

## Shared canonical (available to all families, except where noted)

**E1 (cross-cutting)** — E1-10 Business and IT domain knowledge

**E2 (cross-cutting — architecture)** — E2-52 Architecture documentation and decision records · E2-53 Quality attribute and trade-off analysis · E2-54 Technology evaluation and selection. *Shared in the dictionary but applicable to the SE and BA pools only — a PM or XD active set must not be able to draw them.*

**E3 (cross-cutting)** — E3-22 Facilitation · E3-23 Leadership and influencing · E3-25 Negotiation and conflict resolution

**I2 — Planning** — I2-1 Time management · I2-2 Planning and prioritization of own tasks · I2-3 Task delegation · I2-4 Meeting agreed deadlines · I2-5 Coordination and synchronization of teams and activities · I2-6 Identifying and reporting risks in own workflow · **I2-12 Departmental capacity and resource planning** · **I2-13 Strategic alignment and objective cascade**

**I3 — Estimation** — I3-1 Determining task complexity · I3-2 Estimating time and effort to complete a task · I3-3 Identifying necessary resources and dependencies

**C1 — Responsibility** — C1-1 Desire for self-improvement · C1-2 Willingness for certification and training · C1-3 Engagement in developing and improving processes · C1-4 Adherence to work ethics · C1-5 Applying best practices at work · C1-6 Handling criticism and failures · C1-7 Independent execution of tasks · C1-8 Appropriate escalation and help-seeking

**C2 — Communication** — C2-1 Professional communication at team level · C2-2 Inter-team communication and coordination · C2-3 Proactive, timely, and accurate communication · C2-4 Communication with external stakeholders · C2-5 Presentation skills · **C2-7 Cross-functional collaboration and organizational influence**

**C3 — Mentorship** — C3-1 Knowledge sharing · C3-2 Onboarding new colleagues · C3-3 Supporting colleagues' professional development · C3-4 Providing feedback to managers and colleagues · C3-5 Support and motivation · **C3-8 Developing and leading managers** · **C3-9 Talent management and succession planning**

*Bold = management set, archetype H (negligible for ICs, substantial at T1, peaking at T2).*

---

## SE — Software Engineering (31)

**E1** — E1-1 Knowledge of relational databases · E1-2 Knowledge of non-relational databases · E1-3 Understanding of fundamental programming concepts · E1-4 Knowledge of fundamental data structures · E1-5 Knowledge of fundamental algorithms · E1-6 Knowledge of the team's primary programming language · E1-7 Knowledge of object-oriented programming principles · E1-8 Understanding of architectural models and design patterns · E1-9 Understanding of security concepts in programming

**E2** — E2-1 Using professional style and creating well-structured, modular, readable code · E2-3 Effective use of data structures and algorithms · E2-4 Using a debugger to identify and resolve issues · E2-5 Effective use of unit tests for code validation · E2-7 Refactoring and optimizing code and resources · E2-8 Designing and developing non-trivial functionalities · E2-9 Conducting R&D and analyzing results · E2-10 Designing and developing libraries / SDKs · E2-11 Justifying chosen / proposed technical solution · E2-12 Documenting completed work including code · E2-13 Working with containers and stateless systems · E2-14 Integration and working with external APIs and systems · E2-15 Applying DevOps practices (CI/CD, automation, pipelines) · E2-16 Designing and developing complex multi-component architectures

**E3** — E3-1 Applying accumulated professional experience · E3-2 Knowledge and use of development tools and systems · E3-5 Quality maintenance of production systems / modules · E3-6 Minimizing errors during task implementation · E3-7 Managing technical debt

**I1** — I1-1 Adhering to the internal SDLC process · I1-2 Performing code review · I1-3 Adhering to coding and commit conventions

### Specializations
- `BACKEND` · `FRONTEND` · `MOBILE` · `FULLSTACK` · `EMBEDDED` — defined, no content
- **`ARCHITECTURE`** — E2-55 System decomposition and boundary design · E2-56 Architectural governance and design review · E2-57 Scalability and resilience design · E2-58 Architecture evolution and migration planning *(plus shared E2-52/53/54)*. **Software Architect = SE × ARCHITECTURE × X1**
- **`DATABASE_ARCHITECTURE`** — E2-73 Data modelling and schema design · E2-74 Database performance tuning and query optimisation · E2-75 Database reliability, backup and recovery design · E2-76 Database migration and change management · E2-77 Database security and access control *(plus shared E2-52/53/54)*
- **`AI_ENGINEERING`** — E2-78 Model integration and prompt engineering · E2-79 Retrieval and context engineering · E2-80 Agent and tool orchestration · E2-81 Evaluating non-deterministic systems · E2-82 AI safety, guardrails and responsible deployment · E2-83 Model selection and cost-performance optimisation *(plus shared E2-52/53/54)*. *Builds on existing models; model training belongs to DA.*

---

## BA — Business Analysis (21)

**E1** — E1-11 Requirements specification and expression · E1-13 Analysis and modelling techniques · E1-15 Elicitation techniques · E1-21 Requirements and solution risk analysis · E1-22 Root cause and problem analysis · E1-46 Public administration legislation and regulatory awareness · E1-47 Cross-institutional public-sector processes and documentation

**E2** — E2-17 Planning and monitoring the business analysis approach · E2-21 Documenting and tracking business analysis work · E2-22 Elicitation · E2-23 Communicating business analysis information · E2-24 Managing stakeholder collaboration · E2-25 Requirements life cycle management · E2-26 Strategy analysis · E2-27 Requirements analysis and design definition · E2-28 Solution evaluation and requirements definition

**E3** — E3-8 Applying accumulated business analysis experience · E3-9 Knowledge and use of business analysis tools · E3-11 Documenting completed analysis in the chosen system

**I1** — I1-4 Adhering to the business-analysis process · I1-5 Change management in the business-analysis context

*Note: E1-10 Business and IT domain knowledge was promoted to shared in Increment 1; BA continues to reference it.*

### Specializations
- `REQUIREMENTS` · `PROCESS` · `PRODUCT_OWNERSHIP` · `DATA_BA` — defined, no content. *(`DOC_PROC` retired in Increment 8 — its population moved to the TC family.)*
- **`SOLUTION_ARCHITECTURE`** — E2-59 Cross-system and cross-institutional solution design · E2-60 Interoperability and standards compliance · E2-61 Solution feasibility, sizing and costing · E2-62 Vendor and product evaluation · E2-63 Client-facing solution justification *(plus shared E2-52/53/54)*

  **Solutions Architect = BA × SOLUTION_ARCHITECTURE × (R | S | X)**

  | Position | Stage-letter |
  |---|---|
  | Проектант, информационни системи | **R** |
  | Старши проектант, информационни системи | **S** |
  | Главен проектант, информационни системи | **X** |

---

## PM — Project & Delivery Management (25)

**E1** — E1-26 Project management frameworks and methodologies · E1-28 Resource and team planning · E1-30 Project performance measurement · E1-32 Project knowledge and information management · E1-34 Work breakdown and decomposition (WBS) · E1-35 Quality management · E1-36 Scope management · E1-37 Risk and opportunity management · E1-42 Schedule and dependency management · E1-43 Cost and budget management · E1-44 Public administration legislation and regulatory awareness · E1-45 Cross-institutional public-sector processes and documentation

**E2** — E2-29 Selecting and tailoring the delivery approach · E2-30 Stakeholder analysis and engagement · E2-31 Project governance and controls · E2-33 Project planning and integration · E2-34 Maintaining project logs and registers · E2-35 Project reporting and communication · E2-40 Project closure and lessons learned · E2-41 Managing project execution and delivery

**E3** — E3-18 Applying accumulated project management experience · E3-19 Knowledge and use of project management tools · E3-21 Documenting project artifacts

**I1** — I1-6 Adhering to the internal project-delivery process · I1-7 Change management within projects

### Specializations
`AGILE` · `TRADITIONAL` · `PROGRAM` — defined, no content

---

## QE — Quality Engineering (26)

**E1** — E1-48 Software testing principles and levels · E1-49 Test design techniques · E1-50 Software quality models and characteristics · E1-51 Risk-based testing · E1-52 Defect management and root cause analysis · E1-53 Analysing requirements for testability · E1-54 Test data management · E1-55 Test automation concepts and architecture · E1-56 Non-functional testing concepts · E1-57 Quality assurance across the software lifecycle

**E2** — E2-42 Test planning and strategy · E2-43 Designing and writing test cases · E2-44 Executing tests and reporting results · E2-45 Exploratory testing · E2-46 Defect reporting and triage · E2-47 Regression testing and suite maintenance · E2-48 API and integration testing · E2-49 Database and data validation testing · E2-50 Test environment setup and troubleshooting · E2-51 Quality metrics and status reporting

**E3** — E3-28 Applying accumulated quality engineering experience · E3-29 Knowledge and use of quality engineering tools · E3-30 Investigating and diagnosing complex defects

**I1** — I1-8 Adhering to the internal QA and testing process · I1-9 Participating in requirement and design reviews · I1-10 Adhering to test documentation and artifact standards

### Specializations
`MANUAL` · `AUTOMATION` · `PERFORMANCE` · `SECURITY` — defined, no content. Automation *concepts* are baseline (E1-55); *implementation* belongs to `AUTOMATION`. Same pattern for E1-56 versus `PERFORMANCE` / `SECURITY`.

---

## XD — Experience Design (24)

**E1** — E1-58 User-centred design principles and process · E1-59 Human perception and cognition in design · E1-60 Interaction design patterns and conventions · E1-61 Visual design fundamentals · E1-62 Information architecture · E1-63 Accessibility standards and inclusive design · E1-64 User research methods · E1-65 Design systems and component libraries · E1-66 Usability principles and heuristics

**E2** — E2-64 Planning and conducting user research · E2-65 Synthesising research into insights · E2-66 Wireframing and prototyping · E2-67 Interaction and interface design · E2-68 Visual design execution · E2-69 Usability testing and evaluation · E2-70 Design specification and developer handoff · E2-71 Contributing to and maintaining design systems · E2-72 Accessibility implementation and validation

**E3** — E3-31 Applying accumulated design experience · E3-32 Knowledge and use of design tools · E3-33 Designing within technical and business constraints

**I1** — I1-11 Adhering to the internal design process · I1-12 Participating in design critique and review · I1-13 Adhering to design documentation and handoff standards

### Specializations
`RESEARCH` · `INTERACTION` · `VISUAL` · `SERVICE` — defined, no content

---

## DA — Data & Analytics (23)

**E1** — E1-67 Data modelling for analytics · E1-68 Data pipeline and integration concepts · E1-69 Data storage and warehouse architecture · E1-70 Data quality and governance · E1-71 Statistical foundations for analysis · E1-72 Machine learning concepts and model types · E1-73 Data visualisation and communication principles · E1-74 Data privacy, protection and regulatory compliance · E1-75 Business metrics and measurement design

**E2** — E2-84 Writing and optimising analytical queries · E2-85 Data acquisition and source system integration · E2-86 Data cleaning, transformation and preparation · E2-87 Exploratory data analysis · E2-88 Building and maintaining data pipelines · E2-89 Data validation and quality assurance · E2-90 Creating reports, dashboards and visualisations · E2-91 Communicating analytical findings

**E3** — E3-34 Applying accumulated data and analytics experience · E3-35 Knowledge and use of data and analytics tools · E3-36 Judging data reliability and fitness for purpose

**I1** — I1-14 Adhering to the internal data and analytics process · I1-15 Participating in data and analysis review · I1-16 Adhering to data documentation and lineage standards

*Baseline is the common core across four dissimilar specializations; depth specific to one — advanced orchestration (ENGINEERING), inferential statistics and experimental design (RESEARCH), model development (ML) — is held for the specialization sets.*

**Boundaries:** DA owns model *development*; `SE.AI_ENGINEERING` owns building on *existing* models. E1-67 is dimensional/analytical modelling; `SE.DATABASE_ARCHITECTURE` E2-73 is transactional schema design.

### Specializations

`ENGINEERING` · `ANALYTICS` · `ML` · `RESEARCH` — defined, no content

---

## MC — Marketing & Communications (23)

*First non-ICT family. The shared canonical core transferred **without modification** — planning, estimation, responsibility, communication and mentorship describe a marketer's work as accurately as an engineer's, and E1-10 applies directly. Evidence that the canonicalization principle generalizes beyond the discipline it was derived from.*

**E1** — E1-76 Audience analysis and segmentation · E1-77 Communication and messaging principles · E1-78 Brand identity and positioning · E1-79 Marketing and communication channels · E1-80 Content strategy and planning · E1-81 Digital marketing concepts · E1-82 Communications measurement and analytics · E1-83 Public-sector communication rules and obligations · E1-84 Crisis and reputation management principles

**E2** — E2-92 Writing for a defined audience and purpose · E2-93 Editing and quality control of content · E2-94 Planning and running communication campaigns · E2-95 Managing communication channels and publishing · E2-96 Applying and maintaining brand consistency · E2-97 Media and external stakeholder relations · E2-98 Measuring and reporting communication performance · E2-99 Translating technical subject matter for non-specialist audiences

**E3** — E3-37 Applying accumulated communications experience · E3-38 Knowledge and use of marketing and communications tools · E3-39 Judging reputational risk and sensitivity

**I1** — I1-17 Adhering to the internal communications process · I1-18 Participating in content review and approval · I1-19 Adhering to brand, legal and compliance standards in communications

**Public-sector constraints are explicit, not inferred:** E1-83 carries procurement rules on communications spend, political neutrality, transparency duties, accessibility of public communication, and data protection on contact data.

**E2-99** is family-specific and deliberately distinct from the shared C2 set: extracting substance from specialists and rendering it accurately for non-specialists is a defining demand on communications staff in a technology organization, not general communication skill.

### Specializations

`DIGITAL` · `BRAND_PR` · `CONTENT` · `INTERNAL_COMMS` — defined, no content. **The content writer role folds in here, under `CONTENT`.**

---

## PD — Product Management (23)

*Eighth populated family and the second non-ICT one. Like MC it drew the shared canonical core without modification and contributed nothing new to it — the second consecutive family to do so, which is now a pattern rather than a single data point.*

**Boundary with BA — the one that matters.** PD owns *what to build and why*: direction, value, prioritisation, and commercial outcome, looking outward to market and customer. BA owns *what precisely and how specified*: elicitation, analysis, requirements, and solution definition, looking inward to delivery. The two overlap at junior level and diverge sharply at senior level, which is why they are separate families rather than one.

**E1** — E1-85 Product strategy and vision · E1-86 Market and competitive analysis · E1-87 Customer and user needs analysis · E1-88 Product lifecycle management · E1-89 Prioritisation frameworks and value assessment · E1-90 Product economics and commercial models · E1-91 Product roadmapping · E1-92 Public-sector product and service context · E1-93 Product metrics and success measurement

**E2** — E2-100 Defining and communicating product direction · E2-101 Conducting market and customer research · E2-102 Building and maintaining product roadmaps · E2-103 Prioritising product work and managing the backlog · E2-104 Building business cases and justifying investment · E2-105 Managing customer and stakeholder relationships · E2-106 Measuring and analysing product performance · E2-107 Planning and executing product launches

**E3** — E3-40 Applying accumulated product management experience · E3-41 Knowledge and use of product management tools · E3-42 Deciding under uncertainty and incomplete information

**I1** — I1-20 Adhering to the internal product management process · I1-21 Participating in product and roadmap review · I1-22 Adhering to product documentation and decision-record standards

**Three adjacencies held apart on purpose.** E1-87 is *market-level* customer value, as against XD's E1-64 (individual user behaviour) and BA's E1-15 (eliciting requirements from named stakeholders). E2-105 is commercial and account relationship ownership, as against BA's E2-24 (analysis collaboration) and PM's E2-30 (project stakeholder engagement). E3-42 is the judgment to commit before the evidence is conclusive — the defining demand of the discipline rather than general decisiveness.

**E1-92 is contextual knowledge, not a compliance obligation** — which is why it carries archetype B while MC's E1-83 carries C. Public value reasoning, policy as a requirement driver and institutional users deepen with seniority; procurement rules and political neutrality do not.

### Specializations

`STRATEGY` · `OWNERSHIP` · `ACCOUNT` · `GROWTH` — defined, no content. *`OWNERSHIP` here is the commercial product-owning role; BA's `PRODUCT_OWNERSHIP` is the tactical, delivery-embedded one. Same job title in the market, different discipline.*

---

## TC — Technical Communication (23)

*Tenth family, created in Increment 8 — the only one added to the taxonomy rather than populated from an existing definition. Serves both the current documentation-review and contract-verification work and the intended development into technical writing.*

**Why a family rather than a BA specialization.** Baseline applies to every member of a family regardless of specialization, so documentation staff sitting in BA would have been evaluated against strategy analysis, requirements lifecycle management and solution evaluation — scoring badly on work that is not theirs. That is precisely the procedural-justice failure the framework exists to prevent, which is why the earlier `DOC_PROC` decision was reversed.

**Boundaries.** BA's `E2-21` documents the analyst's *own* analysis; TC documents systems and deliverables *for others*. XD's `E2-70` specifies designs for engineers; TC produces documentation for users, clients and institutions. MC's `E2-99` renders technical material for public and promotional audiences; TC produces it for operational and reference use. `E1-101` elicits technical *fact* from specialists, where BA's `E1-15` elicits *requirements* from stakeholders.

**E1** — E1-94 Technical writing principles and standards · E1-95 Documentation types and their purposes · E1-96 Information architecture for documentation · E1-97 Terminology management and style standards · E1-98 Document lifecycle and version control · E1-99 Contract and regulatory documentation requirements · E1-100 Accessibility and readability standards for documents · E1-101 Subject matter elicitation techniques · E1-102 Visual communication in documentation

**E2** — E2-108 Writing technical documentation · E2-109 Structuring and organising document sets · E2-110 Reviewing documents for accuracy and completeness · E2-111 Verifying documentation against contract and regulatory requirements · E2-112 Working with subject matter experts to capture information · E2-113 Editing for clarity and terminological consistency · E2-114 Maintaining documentation through change · E2-115 Producing documentation in required formats and channels

**E3** — E3-43 Applying accumulated technical communication experience · E3-44 Knowledge and use of documentation tools · E3-45 Judging documentation completeness and fitness for purpose

**I1** — I1-23 Adhering to the internal documentation process · I1-24 Participating in document review and approval · I1-25 Adhering to documentation standards and templates

**`I1-25` carries archetype C where every other family's equivalent is D.** For SE, QE, XD and PD, "adhering to documentation standards" governs a by-product of the real work and is reasonably assumed once learned. For a technical communicator the document *is* the work, so the standard is the substance rather than the hygiene — and a principal writer is held to it more firmly than a junior, not less, since they set the templates others follow.

**`E1-99` and `E1-100` on C** by the established obligation principle, alongside accessibility (E1-63, E2-72), AI safety (E2-82), data protection (E1-74) and public-sector communication rules (E1-83).

### Specializations

`TECHNICAL_WRITING` · `DOCUMENT_COMPLIANCE` · `KNOWLEDGE_MANAGEMENT` — **created in `config.role-families.json` by this increment**, no content yet.

---

## Retired codes

Intentionally vacant. Content dropped, merged, or moved.

- **E1:** 12, 14, 16–20, 23–25 (BA techniques → consolidated into E1-11/13/15); 27, 29, 31, 33, 38–41 (PM → merged/dropped/recategorized)
- **E2:** 2 (→ C1-8); 6 (→ E2-3); 18–20 (→ E2-17); 32 (→ E2-29); 36 (→ E2-30); 37 (→ I3); 38 (BA owns strategy analysis at E2-26); 39 (→ E2-35)
- **E3:** 3, 4 (SE tools → E3-2); 10 (Aha! artifact, dropped); 12, 13, 15 (BA cross-cutting → shared E3-22/23/25); 14, 16, 17 (→ shared C core); 20 (→ E3-19); 24, 26, 27 (PM cross-cutting/duplicates)
- **I1:** the former 1–18 range was renumbered clean during the I1 rebuild — current I1-1…I1-13 are the authoritative assignments
- **I2:** 7–11 (→ collapsed into canonical I2-1…6)
- **I3:** 4–7 (→ collapsed into I3-1…3; budget → PM E1-43)
- **C2:** 6 (→ C2-1) · **C3:** 6 (→ C3-2), 7 (→ C3-5)

---

## Outstanding

| Item | Status |
|---|---|
| Bulgarian translations | **Complete** — all 278 competencies carry `en` and `bg`, enforced by `competency-content-integrity.test.js` |
| IO family | Not started |
| Technical Communication (TC) | **Resolved** — became the tenth family in Increment 8; `BA.DOC_PROC` retired |
| Specialization content | Built: SE.ARCHITECTURE, SE.DATABASE_ARCHITECTURE, SE.AI_ENGINEERING, BA.SOLUTION_ARCHITECTURE. None for other specializations. |
| e-CF mappings | Placeholders only |
| Relevancy calibration | Archetype defaults; calibrate after cycle 1 |
