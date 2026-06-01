# Competency Definitions — Final State (Working Document)

This document accumulates the agreed final-state competency definitions for the **SE**, **BA**, and **PM** role families, plus the shared Insight/Commitment core. It is built batch by batch; each batch is ratified before the next. When complete, it becomes the source for the Claude Code prompt that rebuilds `config.competencies.json`, `config.competency-relevancy.json`, `config.active-competency-sets.json`, and `competence-labels.json` from scratch.

## Conventions

Each competency has three parts:

- **Name** — a precise noun phrase for the capability.
- **Description** — 2–3 sentences: the core capability, what it concretely includes, and why it matters in the role.
- **Scope** — six behavioral anchors (one per stage-level) describing what the person *does*, their degree of *autonomy*, and their *scope of impact*.

**The quality test for every anchor:** an employee rated at that level must be able to answer *"give me a specific example of something you did within the context of this competency at this level."* If an anchor can't survive that question, it is too vague.

**Stage-levels:**

- **N** — Novice: learning fundamentals; performs simple cases under guidance.
- **J** — Junior: applies basics independently on low-to-medium complexity; needs occasional correction.
- **R** — Regular: fully independent and accurate; handles complexity; can review/optimize peers.
- **S** — Senior: advanced/deep command; optimizes; mentors; handles high-stakes cases.
- **X** — Expert: recognized authority; innovates; defines standards; advises org-wide *(expert track)*.
- **T** — Team Lead: leads the team in the competency; ensures team capability; trains/supports; aligns to goals *(management track)*.

## Canonicalization policy

- **Family-specific:** E1, E2, and *discipline-specific* E3 (accumulated domain experience, domain-specific tools, domain documentation), plus I1 (Processes), since these genuinely differ by family.
- **Shared (canonical, written once, referenced by all families that use them):** the *cross-cutting* E3 interpersonal capabilities — facilitation, leadership & influencing, negotiation & conflict resolution — plus I2 (Planning), I3 (Estimation), C1 (Responsibility), C2 (Communication), C3 (Mentorship).

## Status

| Family / section | E1 | E2 | E3 | I1 | shared I/C |
|---|---|---|---|---|---|
| PM Expertise | ✅ drafted | ✅ drafted | ✅ drafted | ✅ drafted | — |
| BA Expertise | ✅ drafted | ✅ drafted | ✅ drafted | ✅ drafted | — |
| SE Expertise (review) | ✅ refined | ✅ refined | ✅ refined | ✅ rebuilt | — |
| Shared core | — | — | ✅ E3 cross-cutting | — | ✅ I2/I3/C1/C2/C3 (+C1-8 escalation) |

*Codes: kept competencies retain their existing code for traceability; merged competencies take the lowest contributing code; new competencies get the next free code in the subcategory. Final renumbering (if any) is decided at assembly time.*

---

# PM — Project & Delivery Management

## E1 — Theoretical knowledge

### E1-26 · Project management frameworks and methodologies

**Description:** Encompasses understanding of established project management frameworks and methodologies — predictive/waterfall, iterative and agile approaches (such as Scrum and Kanban), and hybrid models — including their principles, artifacts, and ceremonies. This includes knowing the comparative strengths, constraints, and typical use cases of each, so that delivery approaches can be selected and tailored to a project's context, scale, and risk profile.

- **N:** Begins to learn the existence and basic characteristics of common frameworks. Can describe them at a high level and follows a prescribed methodology using established templates under regular guidance.
- **J:** Has a working understanding of mainstream frameworks and applies a given methodology on straightforward projects with some supervision. Begins to recognize why a particular approach suits a particular situation, though tailoring still requires support.
- **R:** Independently applies the appropriate framework across typical projects, adapting ceremonies and artifacts to the project's context without guidance, and understands the practical trade-offs between approaches.
- **S:** Has deep command of multiple frameworks, including hybrid combinations, and tailors or blends them for complex or multi-team initiatives. Mentors other practitioners on methodology selection and fit.
- **X:** Recognized as an authority on delivery methodology. Evaluates and introduces frameworks and standards across the organization, and advises leadership on methodology fit for strategic initiatives.
- **T:** Leads the team in adopting and applying appropriate frameworks, ensures consistent and effective methodology use across the team's projects, and aligns the team's delivery approach with organizational standards and goals.

### E1-36 · Scope management

**Description:** Encompasses knowledge of how to define, document, validate, and control project scope, including gathering and structuring requirements into a scope baseline and managing scope changes through a controlled process. This includes distinguishing in-scope from out-of-scope work and understanding how uncontrolled change ("scope creep") threatens delivery.

- **N:** Understands the basic concept of project scope and can identify obviously in-scope versus out-of-scope items under guidance. Relies on others to define and document scope.
- **J:** Helps define and document scope for straightforward projects, producing simple scope statements with supervision. Recognizes when a request may fall outside agreed scope but defers the decision.
- **R:** Independently defines, documents, and baselines scope for typical projects, and manages routine scope changes through an agreed change-control process without guidance.
- **S:** Manages scope on complex projects with shifting requirements, anticipates scope risks, balances stakeholder demands against scope discipline, and mentors others in scope definition and change control.
- **X:** Sets scope-management standards and practices across the organization, advises on scope strategy for high-stakes initiatives, and resolves the most contentious scope disputes.
- **T:** Ensures the team applies consistent scope-definition and change-control practices and aligns scope decisions across the team's projects with organizational priorities.

### E1-34 · Work breakdown and decomposition (WBS)

**Description:** Encompasses knowledge of decomposing project scope and deliverables into a structured, hierarchical work breakdown of manageable work packages. This includes understanding how a well-formed WBS supports estimation, scheduling, assignment, and progress tracking, and how to avoid gaps or overlaps in the decomposition.

- **N:** Understands what a work breakdown structure is and can break a simple deliverable into obvious sub-tasks under guidance.
- **J:** Produces a basic WBS for straightforward deliverables with supervision, decomposing work to a usable level but sometimes leaving gaps or uneven granularity.
- **R:** Independently decomposes typical projects into a complete, well-structured WBS with appropriately sized work packages, suitable for estimation and tracking.
- **S:** Builds and reviews work breakdowns for complex, multi-stream projects, ensures consistency and completeness, and mentors others in decomposition technique.
- **X:** Defines decomposition standards and reusable WBS templates for the organization and advises on structuring the most complex programs.
- **T:** Ensures the team produces consistent, high-quality work breakdowns across projects and aligns decomposition practice with organizational planning standards.

### E1-42 · Schedule and dependency management *(new)*

**Description:** Encompasses knowledge of building and maintaining a project schedule, including sequencing activities, identifying and managing dependencies, estimating durations, determining the critical path, and maintaining a schedule baseline. This includes understanding how dependencies and constraints affect timelines and how to respond when the schedule is threatened.

- **N:** Understands basic scheduling concepts such as tasks, durations, and dependencies, and can read a simple project schedule under guidance.
- **J:** Builds simple schedules and identifies obvious dependencies with supervision, but may miss less visible dependencies or underestimate durations.
- **R:** Independently constructs and maintains realistic schedules for typical projects, identifies the critical path, manages dependencies, and adjusts the schedule as work progresses.
- **S:** Manages schedules for complex, multi-team projects with intricate dependencies, anticipates and mitigates schedule risks, and mentors others in scheduling technique.
- **X:** Sets scheduling standards and tooling practices across the organization and advises on schedule strategy and recovery for high-stakes programs.
- **T:** Ensures consistent scheduling and dependency-management practice across the team's projects and aligns schedule commitments with organizational delivery goals.

### E1-43 · Cost and budget management *(new)*

**Description:** Encompasses knowledge of estimating project costs, building and managing a budget, and controlling expenditure against a cost baseline. This includes understanding cost-estimation techniques, tracking actuals against plan, and forecasting and responding to budget variances.

- **N:** Understands basic cost concepts such as estimates, budgets, and actuals, and can record simple cost information under guidance.
- **J:** Assists in preparing simple cost estimates and budgets with supervision and tracks straightforward expenditures, though forecasting is limited.
- **R:** Independently estimates costs, builds and manages a budget for typical projects, tracks actuals against plan, and explains routine variances.
- **S:** Manages budgets for complex projects, forecasts cost performance, identifies and addresses variances early, and mentors others in cost-management practice.
- **X:** Sets cost-management and estimation standards across the organization and advises leadership on budget strategy and financial risk for major initiatives.
- **T:** Ensures consistent cost-management practice across the team's projects and aligns budget decisions with organizational financial objectives.

### E1-28 · Resource and team planning *(repurposed from "Team composition & structure")*

**Description:** Encompasses knowledge of identifying, estimating, and planning the human and other resources a project requires — including defining team roles and structure, forecasting capacity and allocation over time, and planning resource acquisition. This includes matching skills to needs and understanding how resource constraints and contention affect delivery.

- **N:** Understands basic resourcing concepts such as roles, skills, and availability, and can identify obvious resource needs for a simple task under guidance.
- **J:** Helps plan team roles and resource needs for straightforward projects with supervision, but may not anticipate capacity conflicts or longer-term allocation.
- **R:** Independently plans resource and team needs for typical projects, defines roles and structure, forecasts capacity and allocation, and manages routine resource contention.
- **S:** Plans resources for complex, multi-team projects, anticipates and resolves capacity and skills gaps, and mentors others in resource and team planning.
- **X:** Sets resource-planning standards across the organization and advises on resourcing strategy and capacity management for major programs.
- **T:** Ensures consistent resource and team planning across the team's projects and aligns resourcing decisions with organizational capacity and priorities.

### E1-35 · Quality management

**Description:** Encompasses knowledge of planning and assuring project quality, including defining quality requirements and acceptance criteria, selecting quality-assurance and quality-control practices, and understanding how to prevent defects rather than only detect them. This includes knowing how quality standards relate to stakeholder expectations and delivery outcomes.

- **N:** Understands the basic idea of project quality and acceptance criteria, and can check work against a given checklist under guidance.
- **J:** Helps define simple quality criteria and performs basic quality checks with supervision, but relies on others to plan the quality approach.
- **R:** Independently defines quality requirements and acceptance criteria for typical projects, applies appropriate assurance and control practices, and manages routine quality issues.
- **S:** Plans quality for complex projects, embeds preventive quality practices, anticipates quality risks, and mentors others in quality management.
- **X:** Sets quality-management standards across the organization and advises on quality strategy for high-stakes initiatives.
- **T:** Ensures consistent quality-management practice across the team's projects and aligns quality standards with organizational expectations.

### E1-37 · Risk and opportunity management

**Description:** Encompasses knowledge of identifying, analyzing, and responding to project uncertainty — both **threats** (negative risks) and **opportunities** (positive risks). This includes qualitative and quantitative analysis, response strategies (avoid/mitigate/transfer/accept for threats; exploit/enhance/share/accept for opportunities), and maintaining a risk register with ongoing monitoring through the project.

- **N:** Understands that projects carry uncertainty and can identify obvious threats and opportunities under guidance.
- **J:** Helps identify and record risks and opportunities for straightforward projects with supervision, though analysis and response planning remain basic.
- **R:** Independently identifies, analyzes, and plans responses to both threats and opportunities for typical projects, maintains the risk register, and monitors risks as work progresses.
- **S:** Manages risk and opportunity on complex projects, applies structured analysis, anticipates emergent risks, and mentors others in risk practice.
- **X:** Sets risk-management standards and methodologies across the organization and advises on risk strategy for high-stakes programs.
- **T:** Ensures consistent risk-and-opportunity practice across the team's projects and aligns risk responses with organizational risk appetite and goals.

### E1-30 · Project performance measurement *(merged from former E1-30/33/38/40)*

**Description:** Encompasses knowledge of measuring and reporting project performance against baselines, including selecting appropriate metrics, tracking progress on scope, schedule, and cost, and interpreting performance data (such as earned-value or velocity measures) to understand project health. This includes knowing how measurement informs forecasting and corrective action.

- **N:** Understands basic performance concepts such as planned versus actual progress and can record simple status information under guidance.
- **J:** Tracks basic progress metrics for straightforward projects with supervision but interprets them only at a surface level.
- **R:** Independently selects and tracks appropriate performance metrics for typical projects, interprets variances against baselines, and uses the data to inform corrective action.
- **S:** Establishes performance measurement for complex projects, applies advanced techniques, forecasts outcomes from trends, and mentors others in measurement and interpretation.
- **X:** Sets performance-measurement standards and metrics frameworks across the organization and advises on measurement strategy for major initiatives.
- **T:** Ensures consistent performance-measurement practice across the team's projects and aligns reporting with organizational governance needs.

### E1-32 · Project knowledge and information management

**Description:** Encompasses knowledge of capturing, organizing, and making available the information a project generates — documentation, decisions, and lessons learned — so that it supports current delivery and future projects. This is distinct from personal mentorship (C3): it concerns the systematic management of project information assets, not interpersonal knowledge sharing.

- **N:** Understands that projects produce information that must be recorded and can file or update simple project documents under guidance.
- **J:** Maintains basic project documentation and records decisions for straightforward projects with supervision.
- **R:** Independently organizes and maintains project information for typical projects, captures lessons learned, and ensures information is accessible to the team.
- **S:** Designs information-management practices for complex projects, ensures knowledge is captured and reused, and mentors others in project knowledge practice.
- **X:** Sets knowledge- and information-management standards across the organization and advises on practices that improve organizational learning from projects.
- **T:** Ensures consistent information- and knowledge-management practice across the team's projects and aligns it with organizational knowledge assets.

### E1-44 · Public administration legislation and regulatory awareness *(new; PM baseline — all PMs work on public-sector projects)*

**Description:** Encompasses knowledge of the national legislation, regulations, and compliance requirements that govern public-sector projects, including staying current as the legal framework evolves and anticipating how legislative changes affect project scope, timelines, and obligations. This is awareness and interpretation of the legal context the project operates within, distinct from the governance process that enforces compliance (E2-31).

- **N:** Aware that public-sector projects are bound by legislation and can locate the relevant rules under guidance. Relies on others to interpret legal requirements.
- **J:** Knows the main legislation and regulatory requirements applying to straightforward projects and applies them with supervision, but may miss less obvious obligations or recent changes.
- **R:** Independently identifies and interprets the legislation and regulations relevant to typical projects, keeps current with changes, and reflects legal requirements in planning and delivery.
- **S:** Commands the legal and regulatory landscape for complex public-sector projects, anticipates the project impact of pending or changing legislation, and mentors others on regulatory requirements.
- **X:** Recognized authority on the legislative and regulatory context for public-sector delivery; advises the organization and clients on regulatory strategy and engages with the implications of forthcoming legislation.
- **T:** Ensures the team maintains accurate, current awareness of applicable legislation across its projects and aligns delivery with the organization's compliance obligations.

### E1-45 · Cross-institutional public-sector processes and documentation *(new; PM baseline)*

**Description:** Encompasses knowledge of how public administration institutions operate and interoperate — their inter-agency workflows, governance and approval procedures, procurement and tender processes, and the documentation standards and formal artifacts these require. This includes understanding the formal channels, roles, and document formats needed to move a project through the public-sector ecosystem.

- **N:** Aware that public-sector projects involve formal inter-institutional processes and documentation, and can follow a given procedure or complete a provided template under guidance.
- **J:** Knows the common cross-institutional processes and documents for straightforward projects and prepares standard documentation with supervision.
- **R:** Independently navigates the relevant institutional processes for typical projects, prepares and routes the required documentation correctly, and understands the roles and channels involved.
- **S:** Manages complex, multi-institution processes and documentation, anticipates procedural bottlenecks, and mentors others in navigating the public-sector ecosystem.
- **X:** Recognized authority on public-sector institutional processes; advises the organization on navigating complex inter-agency arrangements and shapes documentation standards and practices.
- **T:** Ensures the team applies correct institutional processes and documentation consistently across projects and aligns practice with public-sector requirements and organizational standards.

---

## E2 — Applied skills

### E2-29 · Selecting and tailoring the delivery approach *(absorbs former E2-32 "development approach & lifecycle")*

**Description:** Encompasses the applied skill of choosing and tailoring the delivery approach for a specific project — selecting among predictive, agile, and hybrid methods and adapting their practices, cadence, and artifacts to the project's scale, uncertainty, team, and constraints — including defining the development approach and lifecycle phases the project will follow.

- **N:** Follows the delivery approach chosen by others and applies its prescribed practices on a simple project under guidance.
- **J:** Helps set up a delivery approach for a straightforward project using a standard template, with supervision making the key tailoring choices.
- **R:** Independently selects and tailors an appropriate delivery approach and lifecycle for typical projects, justifying the choice against the project's characteristics.
- **S:** Designs and tailors delivery approaches for complex or multi-team projects, blending methods where needed, and mentors others on approach selection and lifecycle design.
- **X:** Defines approach-selection and tailoring guidance for the organization and advises on delivery approach for its most demanding initiatives.
- **T:** Ensures the team selects and tailors delivery approaches consistently and effectively, and aligns lifecycle choices with organizational delivery standards.

### E2-33 · Project planning and integration *(refined from "Planning performance")*

**Description:** Encompasses the applied skill of producing and baselining an integrated project plan that brings together scope, schedule, cost, resources, quality, risk, and communications into a coherent whole. This includes reconciling competing constraints into a realistic, agreed plan and re-planning as conditions change.

- **N:** Contributes parts of a project plan (such as a task list) under guidance and follows the integrated plan produced by others.
- **J:** Assembles a basic project plan for a straightforward project with supervision, but may not fully reconcile schedule, cost, and resource constraints.
- **R:** Independently produces and baselines a realistic, integrated plan for typical projects, reconciling the major constraints, and re-plans competently when conditions change.
- **S:** Develops integrated plans for complex, multi-constraint projects, balances competing priorities, anticipates planning risks, and mentors others in planning and integration.
- **X:** Sets project-planning standards and templates across the organization and advises on planning strategy for major, high-stakes initiatives.
- **T:** Ensures the team produces consistent, realistic, integrated plans across projects and aligns planning practice with organizational delivery goals.

### E2-30 · Stakeholder analysis and engagement *(merged from former E2-30 + E2-36)*

**Description:** Encompasses the applied skill of identifying project stakeholders and analyzing them — typically through a stakeholder matrix that ranks influence/power and assesses project impact and interest — then planning and conducting engagement to manage their expectations and support throughout the project. This includes building and maintaining the stakeholder matrix and tailoring engagement and communication to each stakeholder group.

- **N:** Helps identify obvious stakeholders and records them in a provided template under guidance.
- **J:** Builds a basic stakeholder list and a simple influence/impact mapping for a straightforward project with supervision, and engages stakeholders as directed.
- **R:** Independently identifies and analyzes stakeholders, builds and maintains the stakeholder matrix with influence and impact ranking, and conducts appropriate engagement for typical projects.
- **S:** Manages stakeholder analysis and engagement on complex projects with conflicting interests, anticipates and addresses engagement risks, and mentors others in stakeholder practice.
- **X:** Sets stakeholder-management standards across the organization and advises on engagement strategy for politically complex or high-stakes initiatives.
- **T:** Ensures consistent stakeholder analysis and engagement across the team's projects and aligns engagement approaches with organizational relationships and goals.

### E2-31 · Project governance and controls *(now includes integrated change control)*

**Description:** Encompasses the applied skill of establishing and operating a project's governance — decision and approval structures, control gates, and reporting lines — and running integrated change control so that changes to scope, schedule, and cost are assessed and authorized through a defined process. This includes ensuring the project complies with applicable organizational and regulatory controls.

- **N:** Follows established governance and change-control steps on a simple project under guidance.
- **J:** Operates a standard governance and change-control process for a straightforward project with supervision, routing changes for approval as instructed.
- **R:** Independently sets up and operates appropriate governance and integrated change control for typical projects, ensuring changes are assessed and authorized correctly.
- **S:** Designs governance and control arrangements for complex projects, handles difficult change and escalation situations, and mentors others in governance practice.
- **X:** Sets governance and change-control standards across the organization and advises on governance design for major or regulated initiatives.
- **T:** Ensures consistent governance and change-control practice across the team's projects and aligns controls with organizational and compliance requirements.

### E2-34 · Maintaining project logs and registers

**Description:** Encompasses the applied skill of maintaining the project's working records — risk, issue, decision, change, and action registers — keeping them current, accurate, and actionable throughout the project. This includes ensuring entries are properly logged, owned, tracked to closure, and used to inform decisions.

- **N:** Records entries into provided logs and registers under guidance, following a given format.
- **J:** Maintains basic logs and registers for a straightforward project with supervision, though entries may be incomplete or not consistently followed up.
- **R:** Independently maintains complete, current registers for typical projects, ensures items are owned and tracked to closure, and uses them to support decisions.
- **S:** Manages comprehensive registers on complex projects, ensures rigor and traceability, and mentors others in disciplined log and register practice.
- **X:** Sets standards and templates for project records across the organization and advises on traceability practices for major initiatives.
- **T:** Ensures consistent, disciplined register-keeping across the team's projects and aligns record practices with organizational governance needs.

### E2-35 · Project reporting and communication *(merged from former E2-35 + E2-39)*

**Description:** Encompasses the applied skill of producing and delivering project reporting and communications — status reports, dashboards, and updates tailored to different audiences such as the team, sponsors, and steering bodies — presenting accurate, timely, and appropriately summarized information that supports decision-making. *(General interpersonal communication is covered by the shared C2 competency; this concerns project reporting artifacts and their delivery.)*

- **N:** Prepares simple status updates using a provided template under guidance.
- **J:** Produces routine status reports for a straightforward project with supervision, though tailoring to different audiences is limited.
- **R:** Independently produces clear, accurate project reports and dashboards for typical projects and tailors updates to the relevant audience.
- **S:** Designs reporting for complex projects and multiple audiences, communicates difficult messages (such as slippage) effectively, and mentors others in reporting practice.
- **X:** Sets reporting standards and formats across the organization and advises on communication strategy for high-visibility initiatives.
- **T:** Ensures consistent, audience-appropriate reporting across the team's projects and aligns reporting with organizational governance and stakeholder needs.

### E2-41 · Managing project execution and delivery *(new)*

**Description:** Encompasses the applied skill of directing and coordinating the day-to-day execution of the project — driving the work against the plan, removing impediments, managing delivery flow, and applying corrective action to keep the project on track toward its objectives. This is the hands-on running of the project, distinct from the governance framework that authorizes decisions and from interpersonal leadership (E3).

- **N:** Carries out assigned coordination tasks during execution under guidance and escalates issues as instructed.
- **J:** Helps run day-to-day delivery on a straightforward project with supervision, tracking progress and flagging impediments.
- **R:** Independently directs execution for typical projects, drives work against the plan, removes routine impediments, and applies corrective action to stay on track.
- **S:** Manages execution of complex, multi-stream projects, handles significant impediments and recovery situations, and mentors others in delivery management.
- **X:** Sets execution and delivery-management practices across the organization and advises on recovery strategy for troubled or high-stakes projects.
- **T:** Ensures consistent, effective delivery management across the team's projects and aligns execution practices with organizational delivery goals.

### E2-40 · Project closure and lessons learned

**Description:** Encompasses the applied skill of formally closing a project — confirming deliverables are accepted, releasing resources, completing administrative and contractual closure, and capturing and sharing lessons learned. This includes ensuring the project is properly concluded rather than allowed to fade out, and that learning is fed back for future projects.

- **N:** Completes assigned closure tasks (such as filing final documents) under guidance.
- **J:** Helps close a straightforward project with supervision, completing basic closure steps and contributing to a lessons-learned record.
- **R:** Independently runs closure for typical projects, confirms acceptance, completes closure activities, and captures usable lessons learned.
- **S:** Manages closure for complex projects, ensures thorough acceptance and handover, and mentors others in disciplined closure and retrospection.
- **X:** Sets closure and lessons-learned standards across the organization and advises on capturing learning from major initiatives.
- **T:** Ensures consistent, disciplined closure across the team's projects and aligns lessons-learned practice with organizational improvement goals.

---

## E3 — Practical experience

### E3-18 · Applying accumulated project management experience

**Description:** Encompasses the practical judgment that accumulates from managing real projects over time — recognizing patterns, anticipating problems before they materialize, and drawing on past situations to make sound decisions under uncertainty. This is the experiential judgment that complements theoretical knowledge and applied skill, developed through hands-on delivery.

- **N:** Has limited project experience and applies lessons from training or a single project under guidance. Recognizes few recurring patterns.
- **J:** Draws on experience from a handful of projects to handle familiar situations, but relies on guidance when conditions are unfamiliar.
- **R:** Applies experience from a range of projects to make sound decisions independently on typical projects, recognizing common patterns and avoiding known pitfalls.
- **S:** Draws on deep, varied experience to navigate complex and ambiguous situations, anticipates problems early, and mentors others using concrete lessons from past delivery.
- **X:** Recognized for exceptional delivery judgment; advises across the organization on difficult situations and codifies experience into reusable guidance and patterns.
- **T:** Applies and shares accumulated experience to guide the team through delivery challenges and aligns the team's decisions with hard-won organizational lessons.

### E3-19 · Knowledge and use of project management tools *(folds in former E3-20 "Aha!")*

**Description:** Encompasses the practical ability to use the project management tools and systems the organization relies on — planning, tracking, collaboration, and roadmap tools (for example, the Aha! roadmap and project management system) — to plan, document, track, and communicate project work effectively. This includes choosing the right tool features for the task and using them efficiently.

- **N:** Uses basic features of the project management tools for simple tasks under guidance.
- **J:** Uses the main features of the standard tools on straightforward projects with supervision, though not always efficiently.
- **R:** Independently uses the project management tools effectively for typical projects, applying the right features for planning, tracking, and reporting.
- **S:** Exploits advanced tool capabilities on complex projects, configures and optimizes tool usage, and mentors others in effective tooling.
- **X:** Recognized authority on project tooling; evaluates and introduces tools and defines tool standards and practices across the organization.
- **T:** Ensures consistent, effective use of project management tools across the team and aligns tooling practice with organizational standards.

### E3-21 · Documenting project artifacts

**Description:** Encompasses the practical ability to produce clear, accurate, and well-structured project documentation — charters, plans, status artifacts, decision records, and handover materials — that serves its audience and stands as a reliable record. This includes knowing what to document, to what level of detail, and in what format for the context.

- **N:** Produces simple project documents from templates under guidance, with limited attention to clarity or completeness.
- **J:** Creates standard project documents for straightforward projects with supervision, though structure and clarity may need correction.
- **R:** Independently produces clear, accurate, well-structured documentation for typical projects, appropriate to its audience and purpose.
- **S:** Produces and reviews documentation for complex projects, sets a high standard for clarity and completeness, and mentors others in effective documentation.
- **X:** Defines documentation standards and templates across the organization and advises on documentation practice for major initiatives.
- **T:** Ensures consistent, high-quality project documentation across the team and aligns documentation practice with organizational standards.

---

**PM Expertise is now complete** (E1: 12 · E2: 8 · E3: 3 discipline-specific = 23, plus 3 shared cross-cutting E3 referenced — facilitation, leadership, negotiation). Remaining for PM: the family-specific **I1 (Processes)** competency, plus the shared **I2/I3/C1/C2/C3 core** drawn by all families.

*Next batch options: (a) the shared I/C core (used by all three families — unblocks the most), or (b) BA Expertise — which must include BA-perspective parallels of the two public-sector competencies (legislation/regulatory awareness; cross-institutional processes & documentation), plus Strategy Analysis migrating in from PM.*

---

# Shared Competencies

*Canonical competencies referenced by all families that need them — written once, family-agnostic. Codes shown are the working canonical codes; retired duplicates are noted for traceability. At assembly, each family's active set remaps to these codes (e.g., PM's former I2-6 → I2-1, I3-4 → I3-1, C2-6 → C2-1; BA's former E3-12/13/15 → the shared E3 below).*

## E3 (cross-cutting) — Practical experience

*Interpersonal experiential capabilities that are not discipline-bound. They remain in the E3 subcategory but are canonical and shared rather than family-specific. Previously duplicated as PM E3-22/23/25 and BA E3-12/13/15.*

### E3-22 · Facilitation *(canonical; merges PM E3-22 / BA E3-12)*

**Description:** Encompasses the practical ability to facilitate group interactions — workshops, planning sessions, retrospectives, and decision-making meetings — guiding participants toward productive outcomes, ensuring balanced participation, and helping groups reach clarity and agreement. This includes structuring sessions and managing group dynamics.

- **N:** Assists in running simple meetings or sessions under guidance, handling logistics rather than facilitation.
- **J:** Facilitates routine meetings on straightforward matters with supervision, keeping to an agenda but managing group dynamics only at a basic level.
- **R:** Independently facilitates typical workshops and sessions, guides groups to clear outcomes, and manages participation and basic conflict in the room.
- **S:** Facilitates complex or high-stakes sessions with difficult dynamics or divergent views, designs effective session formats, and mentors others in facilitation.
- **X:** Recognized expert facilitator; designs facilitation approaches used across the organization and handles the most challenging group situations.
- **T:** Ensures effective facilitation practice within the team, develops facilitation skills in others, and uses facilitation to align the team on goals and decisions.

### E3-23 · Leadership and influencing *(canonical; merges PM E3-23 / BA E3-13)*

**Description:** Encompasses the practical ability to lead and influence others without necessarily relying on formal authority — setting direction, motivating contributors, building commitment, and steering people and stakeholders toward shared goals. This includes earning trust and influencing decisions across organizational boundaries.

- **N:** Begins to take initiative within a small remit and influences peers informally under guidance.
- **J:** Leads small pieces of work and influences immediate colleagues on straightforward matters, though impact beyond the team is limited.
- **R:** Independently leads small teams or work streams and influences stakeholders effectively in typical situations, building commitment toward shared goals.
- **S:** Leads complex efforts and influences senior or resistant stakeholders, navigating competing interests, and mentors others in leadership and influence.
- **X:** Recognized as a leadership figure across the organization; influences strategic decisions and shapes how leadership is practiced.
- **T:** Leads the team by example, develops leadership capability in others, and aligns the team's direction and motivation with organizational goals.

### E3-25 · Negotiation and conflict resolution *(canonical; merges PM E3-25 / BA E3-15)*

**Description:** Encompasses the practical ability to negotiate agreements and resolve conflicts among parties — reconciling competing interests, mediating disputes, and reaching workable outcomes that preserve relationships and keep work moving. This includes handling difficult conversations and finding common ground under pressure.

- **N:** Aware of basic negotiation and conflict situations and participates under guidance, deferring to others to reach resolution.
- **J:** Handles minor negotiations and disagreements on straightforward matters with supervision, but escalates anything contentious.
- **R:** Independently negotiates routine agreements and resolves typical conflicts, reaching workable outcomes while maintaining relationships.
- **S:** Negotiates complex or high-stakes agreements and mediates significant conflicts, manages strong opposing interests, and mentors others in negotiation and conflict resolution.
- **X:** Recognized authority in negotiation and conflict resolution; handles the most difficult disputes and advises across the organization on negotiation strategy.
- **T:** Resolves conflicts within and around the team, models constructive negotiation, and aligns negotiated outcomes with organizational interests.

## I2 — Planning

### I2-1 · Time management *(canonical; merges former I2-1 / I2-6)*

**Description:** Encompasses the ability to manage one's own time effectively — allocating time across tasks, maintaining focus, avoiding unnecessary delays, and balancing competing demands to deliver work as planned. This includes structuring the working day and protecting time for priority work.

- **N:** Begins to manage own time with regular guidance; often needs help allocating time and may struggle to meet planned timings.
- **J:** Manages own time on routine work with occasional guidance and keeps to planned timings for straightforward tasks, but can be derailed by competing demands.
- **R:** Independently manages own time effectively across typical workloads, balances competing demands, and consistently delivers within planned timings.
- **S:** Manages time effectively under heavy or shifting demands, optimizes own and others' time use, and mentors colleagues in time-management practice.
- **X:** Recognized for exemplary time management; develops and shares practices that improve productivity across the organization.
- **T:** Models effective time management, helps team members manage their time, and coordinates team schedules to meet commitments.

### I2-2 · Planning and prioritization of own tasks *(canonical; merges former I2-2 / I2-8, absorbs I2-7 "Workload prioritization")*

**Description:** Encompasses the ability to plan and prioritize one's own tasks and responsibilities — distinguishing high- from low-priority work, sequencing tasks sensibly, and adjusting plans as priorities shift — so that effort aligns with what matters most.

- **N:** Begins to plan and prioritize own tasks under significant guidance; struggles to distinguish high- from low-priority work.
- **J:** Creates simple work plans and prioritizes routine tasks with some supervision, managing workload to meet deadlines on straightforward work.
- **R:** Independently plans and prioritizes own work effectively, balances workload, and adjusts priorities as needed to align with objectives.
- **S:** Demonstrates advanced planning and prioritization, optimizes own approach, handles shifting priorities under pressure, and mentors others.
- **X:** Recognized for exceptional planning; innovates prioritization approaches and guides their adoption across the organization.
- **T:** Models effective planning and prioritization, helps team members prioritize, and aligns task planning with team and project objectives.

### I2-3 · Task delegation *(canonical; merges former I2-3 / I2-9)*

**Description:** Encompasses the ability to delegate tasks effectively — assigning work to the right people with clear expectations, tracking execution, and following up for results and feedback — while retaining accountability for the outcome. *(Relevancy is naturally low at junior levels and rises with seniority.)*

- **N:** Rarely delegates; may pass on simple tasks under guidance without clear expectations or follow-up.
- **J:** Delegates straightforward tasks with supervision and sets basic expectations, but follow-up and tracking are inconsistent.
- **R:** Independently delegates appropriate tasks with clear expectations, tracks execution, and obtains results and feedback for typical work.
- **S:** Delegates effectively across complex work, matches tasks to capabilities, develops others through delegation, and mentors colleagues in delegation practice.
- **X:** Recognized for exemplary delegation; shapes delegation and empowerment practices across the organization.
- **T:** Delegates across the team to balance workload and develop people, tracks outcomes, and aligns delegated work with team goals.

### I2-4 · Meeting agreed deadlines *(canonical; merges former I2-4 / I2-10)*

**Description:** Encompasses the ability to consistently meet agreed deadlines and commitments — to colleagues, managers, and clients, and within projects and workflows — including raising risks to deadlines early when they arise.

- **N:** Meets deadlines on simple tasks with guidance and reminders; may miss timings without support.
- **J:** Meets deadlines on routine work with occasional supervision and begins to flag at-risk timings.
- **R:** Reliably meets agreed deadlines for typical work, manages own commitments, and raises deadline risks in good time.
- **S:** Reliably meets deadlines under demanding or complex conditions, helps protect team commitments, and mentors others in dependable delivery.
- **X:** Recognized for exceptional reliability; influences practices that improve on-time delivery across the organization.
- **T:** Models dependable delivery, supports the team in meeting commitments, and aligns deadline management with project and organizational goals.

### I2-5 · Coordination and synchronization of teams and activities *(canonical; was I2-11)*

**Description:** Encompasses the ability to coordinate and synchronize work across people, teams, and activities — aligning schedules, dependencies, and hand-offs so that interdependent work proceeds smoothly toward shared goals. This is coordination beyond one's own tasks, ensuring the parts fit together.

- **N:** Participates in coordinated activities under guidance and keeps others informed of own progress.
- **J:** Coordinates simple hand-offs and dependencies within the immediate team with supervision.
- **R:** Independently coordinates activities and dependencies across the team for typical work, keeping interdependent work in sync.
- **S:** Coordinates complex, multi-party or cross-team activities, anticipates synchronization risks, and mentors others in coordination practice.
- **X:** Recognized for exceptional coordination; designs coordination approaches used across the organization for complex initiatives.
- **T:** Coordinates and synchronizes the team's work with other teams and activities, and aligns the team's efforts with broader organizational goals.

### I2-6 · Identifying and reporting risks in own workflow *(reframed from former I2-5 "Managing risks within the workflow")*

**Description:** Encompasses the ability to recognize risks, blockers, and emerging issues within one's own work and to report and escalate them promptly and clearly to the right people, so they can be addressed before they cause delay or harm. This is the individual's responsibility to surface problems early — distinct from formal project risk management (PM E1-37).

- **N:** Begins to notice obvious problems in own work and reports them when prompted, though sometimes late or to the wrong person.
- **J:** Identifies common risks and blockers in own straightforward work and reports them with some supervision, though timing and clarity vary.
- **R:** Independently spots risks and blockers in own work for typical tasks and reports them promptly and clearly to the right people.
- **S:** Anticipates less-obvious risks in own and related work, reports them with suggested mitigations, and encourages others to surface issues early.
- **X:** Recognized for strong risk awareness; improves how individuals across the organization surface and escalate risks from their work.
- **T:** Fosters early, open risk reporting in the team, ensures issues surface promptly, and aligns escalation with team and project needs.

## I3 — Estimation

### I3-1 · Determining task complexity *(canonical; merges former I3-1 / I3-4)*

**Description:** Encompasses the ability to accurately assess the complexity of a task — accounting for scope, unknowns, dependencies, and potential challenges — so that effort, risk, and approach can be judged realistically.

- **N:** Begins to assess task complexity under significant guidance and often under- or over-estimates difficulty.
- **J:** Assesses straightforward tasks with some accuracy under supervision but struggles with more complex work; begins to recognize complexity factors.
- **R:** Independently and accurately determines the complexity of typical tasks, considering relevant factors to inform planning and execution.
- **S:** Accurately assesses complex and high-stakes tasks, mentors others in assessment technique, and contributes complexity insight to planning.
- **X:** Recognized expert in complexity assessment; innovates assessment methods and guides their use across the organization.
- **T:** Ensures the team assesses task complexity accurately, supports members in doing so, and aligns assessments with planning and resourcing.

### I3-2 · Estimating time and effort to complete a task *(canonical; merges former I3-2 / I3-5)*

**Description:** Encompasses the ability to estimate the time and effort a task requires accurately — selecting appropriate estimation techniques, accounting for complexity and uncertainty, and refining estimates as information improves.

- **N:** Produces rough effort estimates under guidance and is frequently inaccurate.
- **J:** Estimates time and effort for straightforward tasks with some accuracy under supervision; struggles with uncertainty.
- **R:** Independently produces realistic time and effort estimates for typical tasks and refines them as work progresses.
- **S:** Estimates complex or uncertain work accurately, applies structured techniques, and mentors others in estimation.
- **X:** Recognized expert in estimation; develops estimation approaches adopted across the organization and improves estimation accuracy.
- **T:** Ensures the team estimates time and effort reliably, supports members in estimation, and aligns estimates with planning and commitments.

### I3-3 · Identifying necessary resources and dependencies *(canonical; merges former I3-3 / I3-6)*

**Description:** Encompasses the ability to identify, describe, and request the resources and dependencies a task requires — people, tools, information, and inputs from others — so that work can proceed without avoidable blockers.

- **N:** Identifies obvious resource needs under guidance but often overlooks dependencies.
- **J:** Identifies basic resources and dependencies for straightforward tasks with supervision.
- **R:** Independently identifies and secures the resources and dependencies typical tasks require, anticipating routine blockers.
- **S:** Identifies resources and dependencies for complex work, anticipates non-obvious dependencies, and mentors others in this practice.
- **X:** Recognized expert; improves how the organization identifies and manages resource needs and dependencies.
- **T:** Ensures the team identifies resources and dependencies reliably and aligns resource needs with planning and resourcing decisions.

*Former `I3-7 "Estimating project budget and effort"` is dropped: its effort dimension is covered by I3-2, and its budget dimension by PM's E1-43 (Cost & budget management).*

## C1 — Responsibility

### C1-1 · Desire for self-improvement

**Description:** Encompasses the commitment and drive to continuously improve professionally — actively seeking to acquire new skills, knowledge, and techniques and to strengthen existing ones, beyond what is strictly required.

- **N:** Shows willingness to learn when directed; pursues improvement mainly through assigned tasks and prompting.
- **J:** Takes some initiative to build skills for the current role, seeking guidance and learning opportunities with encouragement.
- **R:** Proactively and consistently seeks to improve, identifies own development needs, and acts on them independently.
- **S:** Drives own development deliberately, pursues advanced growth, and inspires and supports improvement in others.
- **X:** Recognized as a continuous-learning role model; shapes a culture of professional growth across the organization.
- **T:** Actively fosters self-improvement in the team, creates development opportunities, and aligns growth with team and organizational needs.

### C1-2 · Willingness for certification and training

**Description:** Encompasses the commitment to pursue formal certification and structured training relevant to the role, maintaining and raising qualifications in line with professional standards and organizational needs. *(Distinct from C1-1: this concerns formal, recognized credentialing and structured learning specifically.)*

- **N:** Completes assigned training when required; shows little initiative toward formal certification.
- **J:** Participates willingly in relevant training and begins to pursue entry-level certification with encouragement.
- **R:** Proactively pursues role-relevant certification and training and keeps qualifications current.
- **S:** Pursues advanced certifications, guides others toward valuable credentials, and aligns training with career and role demands.
- **X:** Recognized for deep, certified expertise; influences which certifications and training the organization values and adopts.
- **T:** Encourages and enables team certification and training, plans team capability development, and aligns it with organizational needs.

### C1-3 · Engagement in developing and improving processes

**Description:** Encompasses the commitment to actively contribute to developing, refining, and improving the organization's work processes — proposing and supporting improvements rather than passively following existing practice.

- **N:** Follows existing processes and raises obvious problems when prompted, under guidance.
- **J:** Suggests minor process improvements within own work and supports changes introduced by others.
- **R:** Proactively identifies and proposes process improvements for own area and contributes to implementing them.
- **S:** Drives meaningful process improvements across the team or function, evaluates their impact, and mentors others in continuous improvement.
- **X:** Recognized as a process-improvement leader; shapes process standards and improvement practices across the organization.
- **T:** Cultivates a continuous-improvement mindset in the team, prioritizes and supports process initiatives, and aligns them with organizational goals.

### C1-4 · Adherence to work ethics

**Description:** Encompasses the commitment to uphold professional and ethical standards in all work — integrity, honesty, accountability, confidentiality, and respect — even when under pressure or unobserved.

- **N:** Understands and follows basic ethical and conduct standards with guidance.
- **J:** Consistently follows ethical standards in routine situations and seeks guidance when unsure.
- **R:** Reliably upholds ethical standards independently, including in ambiguous or pressured situations.
- **S:** Models high ethical standards, helps others navigate ethical dilemmas, and reinforces ethical conduct in the team.
- **X:** Recognized as an ethical exemplar; influences ethical standards and conduct expectations across the organization.
- **T:** Sets and upholds the ethical tone for the team, addresses ethical issues fairly, and aligns conduct with organizational values.

### C1-5 · Applying best practices at work

**Description:** Encompasses the commitment to apply established best practices, standards, and proven methods in day-to-day work, and to keep practice aligned with evolving professional standards rather than relying on habit or shortcuts.

- **N:** Follows prescribed best practices with guidance and reminders.
- **J:** Applies common best practices to routine work with occasional correction.
- **R:** Independently and consistently applies relevant best practices to typical work.
- **S:** Applies and adapts best practices to complex situations, promotes their adoption, and mentors others in their use.
- **X:** Recognized authority on best practice; defines and updates best-practice standards across the organization.
- **T:** Ensures the team consistently applies best practices and aligns practice standards with organizational expectations.

### C1-6 · Handling criticism and failures

**Description:** Encompasses the maturity and resilience to receive criticism constructively and to respond to failures and setbacks productively — learning from them, adjusting, and persevering rather than becoming defensive or discouraged.

- **N:** Accepts direct feedback with guidance but may react defensively; needs support to learn from setbacks.
- **J:** Receives routine criticism reasonably and begins to treat failures as learning opportunities.
- **R:** Consistently accepts criticism constructively, learns from failures independently, and adjusts accordingly.
- **S:** Handles significant criticism and setbacks with composure, models a learning response, and helps others build resilience.
- **X:** Recognized for exceptional resilience and growth mindset; influences how the organization learns from failure.
- **T:** Fosters a psychologically safe, learning-oriented team, handles team setbacks constructively, and turns failures into improvement.

### C1-7 · Independent execution of tasks

**Description:** Encompasses the commitment and ability to take ownership of tasks and carry them through independently — proceeding without unnecessary supervision, making reasonable decisions within remit, and seeing work through to completion.

- **N:** Executes simple tasks with close supervision and frequent check-ins.
- **J:** Completes routine tasks with limited supervision but seeks direction when uncertain.
- **R:** Independently owns and completes typical tasks, making reasonable decisions within remit and seeing them through.
- **S:** Independently drives complex and ambiguous work to completion and helps others build autonomy.
- **X:** Recognized for exceptional ownership; trusted with the most ambiguous, high-stakes work and shapes a culture of accountability.
- **T:** Builds ownership and autonomy in the team, delegates with trust, and aligns independent execution with team accountability.

### C1-8 · Appropriate escalation and help-seeking *(new shared; replaces SE's former E2-2 "Seeking help when executing tasks")*

**Description:** Encompasses the judgment to recognize the limits of one's own remit, knowledge, or capacity and to seek help or escalate appropriately — knowing when to proceed independently, when to ask for support, and when and how to raise issues, blockers, or decisions to the right person at the right time. This is the complement to independent execution (C1-7): knowing when *not* to go it alone. *(Distinct from I2-6, which concerns reporting risks in one's own workflow specifically.)*

- **N:** Often unsure when to ask for help — may struggle too long or escalate trivial matters; escalates mainly when prompted.
- **J:** Seeks help on straightforward blockers with some guidance, though the timing and framing of escalation are inconsistent.
- **R:** Independently judges when to proceed, when to seek help, and when to escalate for typical work, raising issues to the right person with adequate context.
- **S:** Escalates complex or sensitive issues with sound judgment, clear framing, and proposed options, and helps others calibrate when and how to escalate.
- **X:** Recognized for excellent escalation judgment; shapes how the organization handles escalation and help-seeking.
- **T:** Fosters a team culture of early, appropriate escalation, models good escalation practice, and ensures issues reach the right level in good time.

## C2 — Communication

### C2-1 · Professional communication at team level *(canonical; merges former C2-1 / C2-6)*

**Description:** Encompasses the ability to communicate clearly, respectfully, and effectively within one's own team — sharing information, listening actively, and coordinating day-to-day work so the team operates smoothly and misunderstandings are minimized.

- **N:** Communicates basic information within the team with guidance; may struggle with clarity or active listening.
- **J:** Communicates routinely and appropriately within the team on day-to-day matters with occasional guidance.
- **R:** Communicates clearly and effectively within the team independently, listens well, and coordinates day-to-day work without friction.
- **S:** Communicates effectively in difficult or complex team situations, improves team communication practices, and mentors others.
- **X:** Recognized for exemplary team communication; shapes communication norms and practices across the organization.
- **T:** Sets the standard for open, effective team communication, ensures information flows well, and aligns team communication with goals.

### C2-2 · Inter-team communication and coordination

**Description:** Encompasses the ability to communicate and coordinate professionally across team boundaries — with other teams and functions — aligning on dependencies, hand-offs, and shared goals so that cross-team work proceeds smoothly.

- **N:** Participates in cross-team communication under guidance and relays information when asked.
- **J:** Communicates with other teams on straightforward matters with some supervision.
- **R:** Independently communicates and coordinates with other teams for typical work, managing dependencies and hand-offs.
- **S:** Navigates complex cross-team communication and competing priorities, resolves friction, and mentors others in cross-team coordination.
- **X:** Recognized for exceptional cross-organizational communication; improves how teams coordinate across the organization.
- **T:** Builds strong inter-team relationships for the team, ensures effective cross-team coordination, and aligns it with organizational goals.

### C2-3 · Proactive, timely, and accurate communication

**Description:** Encompasses the commitment to communicate proactively, in good time, and accurately — sharing relevant information before being asked, flagging issues early, and ensuring messages are correct and complete rather than reactive, late, or vague. *(This concerns the manner and discipline of communication, complementing the audience-specific competencies.)*

- **N:** Communicates mostly reactively and when prompted; timeliness and completeness are inconsistent.
- **J:** Begins to communicate proactively on routine matters, though sometimes late or incomplete.
- **R:** Consistently communicates proactively, in good time, and accurately for typical work, flagging relevant information early.
- **S:** Communicates proactively and accurately even in complex or high-pressure situations, and models disciplined communication for others.
- **X:** Recognized for exemplary communication discipline; shapes proactive-communication norms across the organization.
- **T:** Instills proactive, timely, and accurate communication in the team and aligns information-sharing with team and organizational needs.

### C2-4 · Communication with external stakeholders

**Description:** Encompasses the ability to communicate professionally and effectively with parties outside the immediate organization — clients, partners, vendors, and (in public-sector contexts) external institutions — representing the organization appropriately and managing these relationships with care.

- **N:** Participates in external communication under close supervision, following provided guidance and templates.
- **J:** Handles routine external communication on straightforward matters with supervision.
- **R:** Independently communicates professionally with external stakeholders for typical interactions, representing the organization appropriately.
- **S:** Manages complex or sensitive external communication, handles difficult external situations, and mentors others in external engagement.
- **X:** Recognized as a trusted external representative; shapes how the organization communicates with external parties.
- **T:** Ensures the team communicates effectively and appropriately with external stakeholders and aligns external messaging with organizational interests.

### C2-5 · Presentation skills

**Description:** Encompasses the ability to present information effectively to an audience — structuring content clearly, delivering it confidently, and adapting to the audience and setting — whether in meetings, reviews, or formal presentations.

- **N:** Delivers simple, prepared content to a small, familiar audience with guidance.
- **J:** Presents routine material to the team with some supervision, though structure and delivery need refinement.
- **R:** Independently prepares and delivers clear, well-structured presentations to typical audiences.
- **S:** Delivers compelling presentations to senior or larger audiences, handles questions and challenge well, and coaches others.
- **X:** Recognized as an exceptional presenter; sets presentation standards and represents the organization in high-stakes settings.
- **T:** Develops presentation capability in the team, ensures effective communication to audiences, and represents the team in key forums.

## C3 — Mentorship

### C3-1 · Knowledge sharing *(description strengthened from the thin original)*

**Description:** Encompasses the commitment to actively share knowledge, expertise, and useful information with colleagues — through discussion, documentation, and collaborative learning — so that the team's collective capability grows rather than knowledge remaining siloed in individuals.

- **N:** Shows basic willingness to share knowledge but participates mainly under encouragement, focusing more on learning than sharing.
- **J:** Shares useful information and participates in team discussions and collaborative learning.
- **R:** Actively shares knowledge and expertise with the team, contributes to learning, and helps build a sharing culture.
- **S:** Leads knowledge-sharing initiatives, contributes substantially to the organization's knowledge base, and mentors others.
- **X:** Recognized as a thought leader; develops knowledge-sharing strategies and shapes the organization's learning culture.
- **T:** Embeds knowledge sharing in team practice, encourages members to share, and integrates it into team processes.

### C3-2 · Onboarding new colleagues *(canonical; merges former C3-2 / C3-6)*

**Description:** Encompasses the commitment and ability to help new colleagues integrate — into the team's workflow, tools, and practices, and into the company culture — so that they become productive and comfortable more quickly.

- **N:** Helps with basic onboarding tasks (such as showing tools or answering simple questions) under guidance.
- **J:** Supports onboarding of new colleagues on routine matters with some supervision.
- **R:** Independently guides new colleagues through workflow, tools, and culture for typical onboarding.
- **S:** Designs effective onboarding for the team, handles complex onboarding situations, and mentors others in onboarding practice.
- **X:** Recognized for excellence in onboarding; shapes onboarding practices across the organization.
- **T:** Ensures effective, consistent onboarding in the team and aligns it with organizational integration and culture.

### C3-3 · Supporting colleagues' professional development

**Description:** Encompasses the commitment to actively support the growth of colleagues — mentoring, coaching, sharing opportunities, and giving developmental guidance — investing in others' professional development, not only one's own.

- **N:** Offers occasional help to colleagues when asked, under guidance.
- **J:** Supports peers' learning on routine matters and begins to offer developmental guidance.
- **R:** Actively supports colleagues' development, mentors less-experienced members, and shares growth opportunities.
- **S:** Mentors and coaches across the team, deliberately develops others, and builds development into team practice.
- **X:** Recognized as an outstanding mentor; shapes talent-development practices across the organization.
- **T:** Prioritizes team members' development, creates growth opportunities, and aligns development with team and organizational needs.

### C3-4 · Providing feedback to managers and colleagues

**Description:** Encompasses the commitment and ability to give constructive, candid feedback — to peers and upward to managers — respectfully and usefully, including raising concerns and offering honest input rather than withholding it.

- **N:** Offers simple feedback when prompted, under guidance; tends to withhold concerns.
- **J:** Provides routine feedback to peers and begins to offer upward feedback with encouragement.
- **R:** Independently gives constructive, candid feedback to peers and managers in typical situations.
- **S:** Delivers difficult or sensitive feedback effectively, encourages a feedback culture, and mentors others in giving feedback.
- **X:** Recognized for exceptional feedback skill; shapes feedback culture and practices across the organization.
- **T:** Cultivates open, two-way feedback in the team, models giving and receiving feedback, and aligns it with team improvement.

### C3-5 · Support and motivation *(canonical; merges former C3-5 / C3-7)*

**Description:** Encompasses the commitment to support and motivate colleagues — offering encouragement, recognizing contributions, helping during difficulties, and contributing to a positive, motivated team environment.

- **N:** Offers basic encouragement to immediate colleagues when prompted, under guidance.
- **J:** Supports and encourages peers on routine matters and contributes to a positive team atmosphere.
- **R:** Actively supports and motivates colleagues, recognizes contributions, and helps others through difficulties.
- **S:** Sustains team morale in challenging periods, motivates others effectively, and mentors others in supportive practice.
- **X:** Recognized for exceptional ability to motivate and support; shapes a positive, motivating culture across the organization.
- **T:** Builds and sustains a motivated, supportive team, recognizes and encourages members, and aligns morale with team performance.

---

**Shared core complete** — cross-cutting E3 (3) · I2 (6) · I3 (3) · C1 (8) · C2 (5) · C3 (5) = 30 canonical competencies, all duplicate clusters collapsed.

*Next batch: BA Expertise (E1/E2/E3) — including BA-perspective parallels of the two public-sector competencies (legislation/regulatory awareness; cross-institutional processes & documentation) and Strategy Analysis migrating in from PM. Then the SE Expertise review pass, the per-family I1 competencies (SE/BA/PM), and finally assembly + the Claude Code prompt.*

---

# BA — Business Analysis

*E1 consolidated from individual BABOK techniques into capability areas, to match the altitude of SE and PM competencies. Each capability names its constituent techniques in the description, so nothing is lost for the example test.*

## E1 — Theoretical knowledge

### E1-10 · Business and IT domain knowledge

**Description:** Encompasses understanding of the business domains the organization serves and the IT landscape that supports them — industry context, business models, organizational processes, and how technology enables them — sufficient to frame problems correctly and propose solutions that fit the business reality.

- **N:** Has basic awareness of the organization's business and IT context and applies it to simple tasks under guidance.
- **J:** Understands the main business and IT concepts relevant to straightforward work and applies them with some supervision.
- **R:** Has solid working knowledge of the relevant business domains and IT landscape and applies it independently to typical analysis.
- **S:** Commands deep domain and IT knowledge across complex areas, connects business and technology insightfully, and mentors others.
- **X:** Recognized domain authority; advises the organization on business-technology fit for strategic initiatives.
- **T:** Ensures the team builds and applies strong domain and IT knowledge and aligns analysis with business context and goals.

### E1-15 · Elicitation techniques *(consolidates former E1-15 Document Analysis, E1-25 Workshops)*

**Description:** Encompasses knowledge of techniques for drawing out information and requirements from stakeholders and sources — including interviews, facilitated workshops, document analysis, observation, and surveys — and knowing which technique suits a given situation, stakeholder, and type of information.

- **N:** Knows a few basic elicitation techniques and applies a prescribed one under guidance.
- **J:** Understands common elicitation techniques and selects among them for straightforward situations with some supervision.
- **R:** Independently selects and applies appropriate elicitation techniques for typical situations and stakeholders.
- **S:** Commands the full range of elicitation techniques, applies them in complex or difficult situations, and mentors others in technique selection.
- **X:** Recognized authority on elicitation; defines elicitation practice and standards across the organization.
- **T:** Ensures the team applies effective elicitation techniques and aligns elicitation practice with analysis needs.

### E1-13 · Analysis and modelling techniques *(consolidates former E1-13 Data, E1-14 Decision, E1-16 Functional Decomposition, E1-17 Interface, E1-18 Organizational, E1-19 Process, E1-23 State)*

**Description:** Encompasses knowledge of techniques for analyzing and modelling business and system aspects — process and workflow modelling, data modelling, decision modelling, functional decomposition, interface analysis, organizational modelling, and state modelling — to understand current state, design future state, and represent both clearly.

- **N:** Knows a few basic modelling techniques and produces simple models from templates under guidance.
- **J:** Understands the common modelling techniques and applies the appropriate one to straightforward problems with some supervision.
- **R:** Independently selects and applies the right analysis and modelling techniques for typical problems, producing clear, correct models.
- **S:** Applies advanced and combined modelling techniques to complex problems, ensures modelling rigor, and mentors others.
- **X:** Recognized modelling authority; defines modelling standards and notations used across the organization.
- **T:** Ensures the team applies consistent, high-quality modelling and aligns modelling practice with analysis and solution needs.

### E1-11 · Requirements specification and expression *(consolidates former E1-11 Acceptance/Evaluation Criteria, E1-12 Business Rules, E1-20 Prototyping & User Stories, E1-24 Use Cases & Scenarios)*

**Description:** Encompasses knowledge of techniques for specifying and expressing requirements precisely and unambiguously — acceptance and evaluation criteria, business rules, user stories and prototypes, use cases and scenarios — and selecting the most effective form for the audience, solution approach, and lifecycle.

- **N:** Knows basic ways to express requirements and uses a prescribed format under guidance.
- **J:** Understands the common specification forms and applies an appropriate one to straightforward requirements with some supervision.
- **R:** Independently specifies and expresses requirements clearly in the right form for typical work, unambiguous and testable.
- **S:** Specifies complex requirements precisely across multiple forms, ensures quality and consistency, and mentors others in specification.
- **X:** Recognized authority on requirements specification; defines specification standards across the organization.
- **T:** Ensures the team specifies requirements clearly and consistently and aligns specification practice with delivery needs.

### E1-22 · Root cause and problem analysis

**Description:** Encompasses knowledge of techniques to investigate problems and identify their underlying causes rather than their symptoms — such as root cause analysis methods — so that solutions address the real source of a problem.

- **N:** Aware of basic problem-analysis ideas and helps investigate simple problems under guidance.
- **J:** Applies basic root cause techniques to straightforward problems with some supervision.
- **R:** Independently investigates typical problems, distinguishes symptoms from causes, and identifies underlying root causes.
- **S:** Analyzes complex or systemic problems, applies structured techniques rigorously, and mentors others in problem analysis.
- **X:** Recognized authority in problem analysis; shapes problem-solving practice across the organization.
- **T:** Ensures the team investigates problems rigorously and aligns problem analysis with solution decisions.

### E1-21 · Requirements and solution risk analysis

**Description:** Encompasses knowledge of identifying and analyzing risks associated with requirements, solutions, and business change — assessing their likelihood and impact and informing mitigation — so that analysis and solution decisions account for uncertainty. *(Distinct from project-level risk management, which is a PM competency.)*

- **N:** Aware that requirements and solutions carry risks and helps note obvious ones under guidance.
- **J:** Identifies basic requirement and solution risks on straightforward work with some supervision.
- **R:** Independently identifies and analyzes risks to requirements and solutions for typical work and informs mitigation.
- **S:** Analyzes complex requirement and solution risks, anticipates non-obvious risks, and mentors others in risk analysis.
- **X:** Recognized authority on requirements and solution risk; shapes risk-analysis practice across the organization.
- **T:** Ensures the team analyzes requirement and solution risks consistently and aligns risk findings with solution decisions.

### E1-46 · Public administration legislation and regulatory awareness *(new; BA-perspective parallel of PM E1-44)*

**Description:** Encompasses knowledge of the national legislation, regulations, and compliance requirements as they shape business needs, requirements, and solution constraints — including staying current as the legal framework evolves and translating legal and regulatory obligations into clear requirements and acceptance criteria. This is the analyst's command of the legal context as a source of requirements, distinct from the PM's delivery-and-compliance angle.

- **N:** Aware that legislation shapes requirements and can locate relevant rules under guidance; relies on others to interpret them.
- **J:** Knows the main legislation affecting straightforward analysis and reflects obvious legal requirements with supervision.
- **R:** Independently identifies and interprets the legislation relevant to typical analysis, keeps current with changes, and translates legal obligations into requirements.
- **S:** Commands the regulatory landscape for complex analysis, anticipates the requirement impact of changing legislation, and mentors others.
- **X:** Recognized authority on the legislative context for analysis; advises the organization and clients on regulatory implications for solutions.
- **T:** Ensures the team maintains accurate, current legislative awareness and aligns requirements with compliance obligations.

### E1-47 · Cross-institutional public-sector processes and documentation *(new; BA-perspective parallel of PM E1-45)*

**Description:** Encompasses knowledge of how public administration institutions operate and interoperate — their inter-agency processes, governance and approval procedures, and documentation standards — as these bear on stakeholder analysis, elicitation, and requirements definition across institutions. This is the analyst's command of the public-sector ecosystem as the context for gathering and defining requirements.

- **N:** Aware that public-sector analysis involves formal inter-institutional processes and documents, and follows a provided procedure under guidance.
- **J:** Knows the common cross-institutional processes and documents relevant to straightforward analysis with some supervision.
- **R:** Independently navigates the relevant institutional processes for typical analysis, identifies the right stakeholders and channels, and works within documentation standards.
- **S:** Manages analysis across complex, multi-institution arrangements, anticipates procedural and stakeholder complexity, and mentors others.
- **X:** Recognized authority on public-sector processes for analysis; advises on navigating complex inter-agency requirements.
- **T:** Ensures the team applies correct institutional processes and documentation in analysis and aligns practice with public-sector requirements.

## E2 — Applied skills

### E2-17 · Planning and monitoring the business analysis approach *(consolidates former E2-17 Approach, E2-18 Stakeholder Engagement, E2-19 Governance, E2-20 Information Management)*

**Description:** Encompasses the applied skill of planning how business analysis will be conducted for an initiative — selecting the analysis approach, planning stakeholder engagement, establishing analysis governance, and planning how analysis information will be managed — and monitoring and adjusting that plan as work proceeds.

- **N:** Contributes parts of an analysis plan from templates under guidance and follows the approach set by others.
- **J:** Helps plan the analysis approach for a straightforward initiative with supervision, covering the main elements.
- **R:** Independently plans and monitors the analysis approach, stakeholder engagement, governance, and information management for typical initiatives.
- **S:** Plans analysis for complex initiatives, tailors the approach to context, anticipates planning risks, and mentors others.
- **X:** Defines business-analysis planning standards across the organization and advises on approach for major initiatives.
- **T:** Ensures the team plans and monitors analysis consistently and aligns the analysis approach with delivery and organizational goals.

### E2-22 · Elicitation

**Description:** Encompasses the applied skill of conducting elicitation — preparing for and running interviews, workshops, document reviews, and observation; drawing out needs, expectations, and constraints; and confirming and recording the results — to gather complete, accurate information for analysis.

- **N:** Assists in elicitation activities (such as note-taking) under guidance.
- **J:** Conducts simple elicitation on straightforward topics with supervision, capturing the main points.
- **R:** Independently prepares and conducts effective elicitation for typical initiatives, drawing out and confirming complete information.
- **S:** Conducts elicitation in complex or contentious situations, draws out difficult or hidden requirements, and mentors others.
- **X:** Recognized expert in elicitation; shapes elicitation practice across the organization.
- **T:** Ensures the team elicits effectively and aligns elicitation activity with analysis needs.

### E2-27 · Requirements analysis and design definition

**Description:** Encompasses the applied skill of analyzing elicited information into well-formed requirements and designs — organizing, structuring, and modelling them; verifying and validating them; and specifying them at the right level — so they are complete, consistent, correct, and ready to guide a solution.

- **N:** Helps organize and document requirements from a provided structure under guidance.
- **J:** Analyzes and structures straightforward requirements with supervision, with some gaps in rigor.
- **R:** Independently analyzes, structures, verifies, and validates requirements for typical initiatives, producing well-formed specifications.
- **S:** Analyzes complex requirements and designs, ensures quality and traceability, resolves conflicts, and mentors others.
- **X:** Recognized authority on requirements analysis; defines analysis-and-design standards across the organization.
- **T:** Ensures the team produces high-quality, well-analyzed requirements and aligns analysis with solution delivery.

### E2-25 · Requirements life cycle management

**Description:** Encompasses the applied skill of managing requirements through their life cycle — tracing them, maintaining them as they change, prioritizing them, and managing their approval — so that requirements remain current, traceable, and authorized from inception through implementation.

- **N:** Maintains simple requirement records and traceability from a provided structure under guidance.
- **J:** Manages straightforward requirement changes and traceability with supervision.
- **R:** Independently manages the requirements life cycle for typical initiatives — tracing, maintaining, prioritizing, and managing approvals.
- **S:** Manages complex requirement sets with intricate dependencies and change, ensures rigor, and mentors others.
- **X:** Defines requirements-life-cycle standards and tooling across the organization.
- **T:** Ensures the team manages requirements life cycles consistently and aligns them with delivery governance.

### E2-26 · Strategy analysis

**Description:** Encompasses the applied skill of analyzing the business need and strategic context — assessing current state, defining future state, evaluating risks, and defining a change strategy — so that analysis and solutions are grounded in a clear understanding of business value and direction. *(PM's former duplicate is retired; BA owns this competency.)*

- **N:** Contributes to current-state description from a provided structure under guidance.
- **J:** Helps analyze current and future state for straightforward initiatives with supervision.
- **R:** Independently performs strategy analysis for typical initiatives — current state, future state, risk, and change strategy.
- **S:** Performs strategy analysis for complex or ambiguous initiatives, links analysis to business value, and mentors others.
- **X:** Recognized authority on strategy analysis; advises the organization on business-need and change strategy for major initiatives.
- **T:** Ensures the team grounds analysis in strategic context and aligns strategy analysis with organizational direction.

### E2-24 · Managing stakeholder collaboration

**Description:** Encompasses the applied skill of building and maintaining productive working relationships with stakeholders throughout an initiative — managing engagement, expectations, and collaboration, and keeping stakeholders involved and aligned. *(General interpersonal communication is covered by the shared C2 core; this concerns sustained collaboration with analysis stakeholders.)*

- **N:** Participates in stakeholder interactions under guidance and maintains basic relationships.
- **J:** Manages collaboration with immediate stakeholders on straightforward matters with supervision.
- **R:** Independently manages stakeholder collaboration for typical initiatives, sustaining engagement and alignment.
- **S:** Manages collaboration with complex or conflicting stakeholders, sustains difficult relationships, and mentors others.
- **X:** Recognized for exceptional stakeholder collaboration; shapes engagement practice across the organization.
- **T:** Ensures effective stakeholder collaboration across the team's work and aligns engagement with organizational relationships.

### E2-23 · Communicating business analysis information

**Description:** Encompasses the applied skill of packaging and conveying analysis information — requirements, models, options, and findings — to different audiences in the right form and level of detail, so that stakeholders understand and can act on the analysis. *(Concerns analysis deliverables and their delivery; general communication skill is the shared C2 core.)*

- **N:** Prepares simple analysis information from templates under guidance.
- **J:** Communicates straightforward analysis information to familiar audiences with supervision.
- **R:** Independently packages and conveys analysis information clearly to typical audiences in the appropriate form.
- **S:** Communicates complex analysis to senior or diverse audiences, tailors effectively, and mentors others.
- **X:** Sets standards for communicating analysis across the organization and conveys analysis in high-stakes settings.
- **T:** Ensures the team communicates analysis clearly and aligns analysis communication with stakeholder needs.

### E2-21 · Documenting and tracking business analysis work

**Description:** Encompasses the applied skill of recording and tracking the progress and outcomes of analysis work — what has been elicited, analyzed, decided, and delivered — so that the state of analysis is transparent, traceable, and reportable throughout an initiative.

- **N:** Records simple analysis-progress information from a provided structure under guidance.
- **J:** Documents and tracks straightforward analysis work with supervision.
- **R:** Independently documents and tracks analysis work for typical initiatives, keeping status transparent and current.
- **S:** Establishes documentation and tracking for complex initiatives, ensures rigor, and mentors others.
- **X:** Defines analysis documentation and tracking standards across the organization.
- **T:** Ensures the team documents and tracks analysis consistently and aligns it with governance and reporting.

### E2-28 · Solution evaluation and requirements definition *(reframed from former "Designing technical solutions")*

**Description:** Encompasses the applied skill of defining the requirements a solution must meet and evaluating proposed or delivered solutions against business needs — assessing solution options, defining solution and transition requirements, and measuring whether a solution delivers the intended value. *(Reframed from "designing technical solutions," which is architecture/engineering work; the analyst defines and evaluates, rather than designs, the technical solution.)*

- **N:** Helps record solution requirements or simple evaluation criteria from a provided structure under guidance.
- **J:** Contributes to defining solution requirements and basic solution evaluation for straightforward initiatives with supervision.
- **R:** Independently defines solution and transition requirements and evaluates solutions against business needs for typical initiatives.
- **S:** Defines requirements for and evaluates complex solutions, assesses value delivery, and mentors others in solution evaluation.
- **X:** Recognized authority on solution evaluation; shapes how the organization defines and assesses solution value.
- **T:** Ensures the team defines and evaluates solutions rigorously and aligns solution requirements with business value.

---

*Next batch: BA Expertise E3 (Practical experience) — but first a design decision flagged below, because facilitation / leadership / negotiation appear identically in both PM E3 and BA E3 and are candidates for canonicalization.*

## E3 — Practical experience *(discipline-specific only; cross-cutting facilitation/leadership/negotiation are the shared E3-22/23/25)*

### E3-8 · Applying accumulated business analysis experience

**Description:** Encompasses the practical judgment that accumulates from performing analysis on real initiatives over time — recognizing patterns in business problems, anticipating requirement gaps and stakeholder issues, and drawing on past work to make sound analysis decisions under ambiguity.

- **N:** Has limited analysis experience and applies lessons from training or a single initiative under guidance.
- **J:** Draws on experience from a few initiatives to handle familiar analysis situations, but relies on guidance when unfamiliar.
- **R:** Applies experience from a range of initiatives to make sound analysis decisions independently for typical work, avoiding known pitfalls.
- **S:** Draws on deep, varied experience to navigate complex and ambiguous analysis, anticipates problems early, and mentors others with concrete lessons.
- **X:** Recognized for exceptional analysis judgment; advises across the organization on difficult analysis situations and codifies experience into reusable guidance.
- **T:** Applies and shares accumulated experience to guide the team through analysis challenges and aligns decisions with organizational lessons.

### E3-9 · Knowledge and use of business analysis tools

**Description:** Encompasses the practical ability to use the business analysis tools and systems the organization relies on — modelling tools, requirements-management tools, and collaboration platforms — to elicit, model, document, and manage requirements effectively, choosing the right tool and features for the task.

- **N:** Uses basic features of the standard analysis tools for simple tasks under guidance.
- **J:** Uses the main features of the standard tools on straightforward work with supervision, though not always efficiently.
- **R:** Independently uses the analysis tools effectively for typical work, applying the right features for modelling, specification, and tracking.
- **S:** Exploits advanced tool capabilities on complex work, configures and optimizes tool usage, and mentors others in effective tooling.
- **X:** Recognized authority on analysis tooling; evaluates and introduces tools and defines tool standards across the organization.
- **T:** Ensures consistent, effective use of analysis tools across the team and aligns tooling practice with organizational standards.

### E3-11 · Documenting completed analysis in the chosen system

**Description:** Encompasses the practical ability to record completed analysis work — requirements, models, decisions, and traceability — accurately and consistently in the organization's chosen system of record, so that the analysis is preserved, findable, and reliable for downstream delivery and future reference.

- **N:** Records simple analysis outputs into the system from a provided structure under guidance.
- **J:** Documents straightforward completed work in the chosen system with supervision, though structure and completeness may vary.
- **R:** Independently records completed analysis accurately and consistently in the system for typical work, maintaining traceability.
- **S:** Establishes documentation practice in the system for complex work, ensures rigor and findability, and mentors others.
- **X:** Defines standards for recording analysis in organizational systems and advises on traceability practice.
- **T:** Ensures the team documents completed analysis consistently in the system and aligns it with organizational records and governance.

---

**BA Expertise is now complete** (E1: 8 · E2: 9 · E3: 3 discipline-specific = 20, plus 3 shared cross-cutting E3 referenced). Dropped from the old set: E3-10 "Aha!" (a PM tool, copy-paste artifact — not applicable to BA), and E3-14 Teamwork / E3-16 Teaching / E3-17 Communication (now part of the shared C core). Remaining for BA: the family-specific **I1 (Processes)** competency, plus the shared **I2/I3/C1/C2/C3 core**.

*Next batch: SE Expertise review pass — SE is already populated and good quality, so this is a refinement pass (fixing the thin descriptions like the original C3-1, the "PostgresSQL" typo, and confirming altitude/consistency with the now-consolidated BA and PM), not a rewrite. Then the three family-specific I1 competencies (SE/BA/PM), then assembly + the Claude Code prompt.*

---

# SE — Software Engineering

*SE was already built at capability altitude and is high quality, so this is a refinement pass, not a rewrite. **Unchanged competencies retain their existing descriptions and scope text** (preserved into the rebuild at assembly; see the assembly note). Only the items below change, and full content is given for changed/merged/new entries.*

## E1 — Theoretical knowledge *(9 competencies; all retained)*

**Name trims** (examples move from the name into the description, matching BA/PM naming style; descriptions and scope otherwise unchanged):

- **E1-1** → **"Knowledge of relational databases"** (was "…(SQL, PostgresSQL, MySQL and others)"). **Typo fix:** "PostgresSQL" → "PostgreSQL" in the description.
- **E1-2** → **"Knowledge of non-relational databases"** (was "…(NoSQL, MongoDB, Redis and others)").

**Retained as-is:** E1-3, E1-4, E1-5, E1-6, E1-7, E1-8, E1-9.

## E2 — Applied skills *(16 → 14)*

**Discarded:** **E2-2** "Seeking help when executing tasks" — reframed and promoted to the shared core as **C1-8** (escalation and help-seeking), so it applies to all families rather than SE only.

**Merged — new description; E2-3's existing scope is retained (it already spans selection, application, and optimization):**

### E2-3 · Effective use of data structures and algorithms *(merges former E2-3 / E2-6)*

**Description:** Encompasses the ability to apply data structures and algorithms effectively in implementation — selecting appropriate structures and algorithms for the task, understanding their performance characteristics and trade-offs, and using them to produce correct, efficient solutions.

**Tightened descriptions — to make the E2-8 / E2-16 boundary explicit; scope unchanged:**

### E2-8 · Designing and developing non-trivial functionalities

**Description:** Encompasses the ability to design and develop non-trivial features and components — analyzing requirements and producing sound designs for individual functionalities or modules of moderate-to-high complexity. *(Concerns feature- and component-level design; system-wide, multi-component architecture is E2-16.)*

### E2-16 · Designing and developing complex multi-component architectures

**Description:** Encompasses the ability to design complex, multi-component system architectures — defining how multiple components and services interact and making architecture-level decisions for scalability, resilience, and maintainability across a whole system. *(Concerns system-wide architecture; individual feature- and component-level design is E2-8.)*

**Retained as-is:** E2-1, E2-4, E2-5, E2-7, E2-9, E2-10, E2-11, E2-12, E2-13, E2-14, E2-15.

## E3 — Practical experience *(7 → 5; cross-cutting facilitation/leadership/negotiation available from the shared E3-22/23/25 if selected)*

**Consolidated — three tool competencies become one; new description and new scope (since three merge):**

### E3-2 · Knowledge and use of development tools and systems *(consolidates former E3-2 / E3-3 / E3-4)*

**Description:** Encompasses the practical ability to use the development tools and systems the team relies on — the integrated toolchain, the source control system (such as Git), and the project management system (such as Aha!) — to write, version, track, and deliver work effectively, applying the right tool and features for the task.

- **N:** Uses basic features of the toolchain, source control, and project system for simple tasks under guidance.
- **J:** Uses the main features of the standard tools on straightforward work with some supervision, though not always efficiently.
- **R:** Independently uses the development tools, source control, and project system effectively for typical work, applying appropriate features and workflows.
- **S:** Exploits advanced capabilities across the toolchain, optimizes and configures usage (such as branching strategies and automation), and mentors others.
- **X:** Recognized authority on development tooling; evaluates and introduces tools and defines toolchain standards across the organization.
- **T:** Ensures consistent, effective use of the development toolchain across the team and aligns tooling practice with organizational standards.

**Aligned wording — description aligned with PM E3-18 / BA E3-8 so the three "accumulated experience" competencies are parallel; full anchors given:**

### E3-1 · Applying accumulated professional experience

**Description:** Encompasses the practical judgment that accumulates from building software on real projects over time — recognizing patterns, anticipating problems before they materialize, and drawing on past work to make sound engineering decisions under uncertainty.

- **N:** Has limited engineering experience and applies lessons from training or a single project under guidance.
- **J:** Draws on experience from a few projects to handle familiar situations, but relies on guidance when unfamiliar.
- **R:** Applies experience from a range of projects to make sound engineering decisions independently for typical work, avoiding known pitfalls.
- **S:** Draws on deep, varied experience to navigate complex and ambiguous engineering problems, anticipates issues early, and mentors others with concrete lessons.
- **X:** Recognized for exceptional engineering judgment; advises across the organization on difficult technical situations and codifies experience into reusable guidance.
- **T:** Applies and shares accumulated experience to guide the team through engineering challenges and aligns decisions with organizational lessons.

**Retained as-is:** E3-5, E3-6, E3-7.

---

**SE Expertise is now complete** (E1: 9 · E2: 14 · E3: 5 discipline-specific = 28, plus 3 shared cross-cutting E3 available). Net change from the original 32: discarded E2-2 (→ shared C1-8), merged E2-6→E2-3, consolidated E3-2/3/4→E3-2. Remaining for SE: the family-specific **I1 (Processes)** competency, plus the shared **I2/I3/C1/C2/C3 core**.

> **Assembly note on retained SE content:** "Retained as-is" competencies keep their current English and Bulgarian descriptions and all six scope levels from the existing config. Because the rebuild discards the old config, the assembly step must either (a) preserve these specific SE entries from the current `config.competencies.json`/`competence-labels.json` before discarding, or (b) have them reproduced verbatim into the final source. This will be handled explicitly in the Claude Code prompt so none of the good existing SE text is lost.

*Next batch: the three family-specific **I1 (Processes)** competencies — SE (internal SDLC process adherence), BA (business-analysis process / change management), PM (project-delivery process). Then assembly + the Claude Code prompt.*

---

# Family-Specific Processes (I1)

*The old I1 subcategory was the most broken part of the dictionary: 18 entries with widely mismatched names and descriptions (shuffled content), heavy redundancy, and overlap with both the Expertise sets and the shared core. It is rebuilt clean here. **At assembly, these fold into their respective family sections** (SE/BA/PM); they are grouped here for clarity. Codes renumbered; old codes noted for traceability.*

**Disposition summary (why entries were dropped):**

- **Dropped — now covered by the new public-sector E1 competencies:** old I1-12/I1-13 (BA regulations/compliance) → E1-46; old I1-16/I1-17 (PM regulatory/corporate compliance) → E1-44 (regulatory awareness) and folded delivery-process below.
- **Dropped — covered by the shared core:** old I1-11 (business-process improvement) → C1-3 (engagement in improving processes); old escalation content → C1-8.
- **Dropped — covered by Expertise:** old I1-4/I1-5 (SE understanding/transforming business processes and requirements) → SE E2-8; old I1-9 (methodologies) → PM E1-26 / BA E1-13; old I1-10 (requirements-management tools) → BA E3-9.
- **Consolidated:** SE code conventions + conventional commits → one; BA SDLC-role + internal-process compliance → one; PM delivery-process + corporate-process → one.
- **Kept distinct per your direction:** change management for BA *and* PM, in their respective contexts.

## SE — Processes

### I1-1 · Adhering to the internal SDLC process *(folds in former I1-7 change participation)*

**Description:** Encompasses the commitment and ability to follow the organization's internal software development lifecycle (SDLC) process — its stages, practices, ceremonies, and quality gates, including how changes are handled within that process — so that work is predictable, traceable, and aligned with how the team delivers software.

- **N:** Follows the main SDLC steps with guidance and reminders.
- **J:** Follows the SDLC process on routine work with occasional correction.
- **R:** Independently adheres to the full SDLC process for typical work, including handling changes through the defined process.
- **S:** Applies the SDLC rigorously on complex work, identifies process gaps, and mentors others in correct process use.
- **X:** Shapes and improves the SDLC process across the organization and advises on process standards.
- **T:** Ensures the team adheres consistently to the SDLC process and aligns process use with organizational standards.

### I1-2 · Performing code review

**Description:** Encompasses the ability to participate effectively in code review — both giving constructive, standards-based feedback on others' code and responding well to feedback on one's own — to maintain code quality, share knowledge, and catch issues early.

- **N:** Participates in code review as a reviewee and makes simple review comments under guidance.
- **J:** Reviews straightforward changes with supervision, giving basic feedback against standards.
- **R:** Independently performs thorough code reviews for typical changes, giving constructive, standards-based feedback.
- **S:** Reviews complex changes, catches subtle issues, raises the team's review quality, and mentors others in effective review.
- **X:** Defines code-review standards and practices across the organization.
- **T:** Ensures consistent, high-quality code-review practice in the team and aligns it with quality standards.

### I1-3 · Adhering to coding and commit conventions *(consolidates former I1-3 + I1-6 conventional commits)*

**Description:** Encompasses the commitment to follow the organization's established coding conventions and change-documentation rules — code style and structure standards, and commit conventions such as conventional commits — so that the codebase and its history remain clean, consistent, and readable.

- **N:** Follows basic coding and commit conventions with guidance and reminders.
- **J:** Follows the conventions on routine work with occasional correction.
- **R:** Independently and consistently follows coding and commit conventions for typical work.
- **S:** Applies and refines conventions on complex work and mentors others in clean, consistent practice.
- **X:** Defines coding and commit conventions across the organization.
- **T:** Ensures the team adheres to coding and commit conventions and aligns them with organizational standards.

## BA — Processes

### I1-4 · Adhering to the business-analysis process *(consolidates former I1-8 + I1-13)*

**Description:** Encompasses the commitment and ability to follow the organization's internal business-analysis process and the analyst's defined role within the wider SDLC — its stages, deliverables, hand-offs, and internal rules — so that analysis work is consistent, traceable, and well-integrated with delivery.

- **N:** Follows the main BA process steps with guidance.
- **J:** Follows the BA process on routine work with occasional correction.
- **R:** Independently adheres to the full BA process and the analyst's role in the SDLC for typical work.
- **S:** Applies the BA process rigorously on complex initiatives, identifies gaps, and mentors others.
- **X:** Shapes and improves the BA process across the organization.
- **T:** Ensures the team adheres consistently to the BA process and aligns it with organizational standards.

### I1-5 · Change management in the business-analysis context *(was I1-14)*

**Description:** Encompasses the discipline of managing changes to requirements, scope, and business needs throughout an initiative — assessing the impact of change, following the defined change process, maintaining traceability, and communicating change to affected stakeholders — so that change is controlled rather than disruptive. *(A frequent failure point: uncontrolled or poorly-communicated requirement change.)*

- **N:** Records change requests and follows the change process under guidance.
- **J:** Handles straightforward requirement changes with supervision, following the process with some gaps.
- **R:** Independently manages requirement and scope changes for typical initiatives — assessing impact, following the process, and maintaining traceability.
- **S:** Manages complex or contentious change across initiatives, anticipates change impact, and mentors others in disciplined change management.
- **X:** Defines change-management practice for analysis across the organization.
- **T:** Ensures the team manages analysis change rigorously and aligns change practice with delivery governance.

## PM — Processes

### I1-6 · Adhering to the internal project-delivery process *(consolidates former I1-15 + I1-17)*

**Description:** Encompasses the commitment and ability to follow the organization's internal project-delivery process and the project manager's defined role within it — its stages, governance, reporting, and internal rules — so that delivery is consistent, predictable, and aligned with how the organization runs projects.

- **N:** Follows the main project-delivery steps with guidance.
- **J:** Follows the delivery process on straightforward projects with occasional correction.
- **R:** Independently adheres to the full project-delivery process and the PM role for typical projects.
- **S:** Applies the delivery process rigorously on complex projects, identifies gaps, and mentors others.
- **X:** Shapes and improves the project-delivery process across the organization.
- **T:** Ensures the team adheres consistently to the delivery process and aligns it with organizational standards.

### I1-7 · Change management within projects *(was I1-18; framed to complement, not duplicate, E2-31)*

**Description:** Encompasses the discipline of managing change across a project holistically — adhering to the organization's change-management process and managing the organizational transition and adoption that change brings for affected stakeholders and institutions. *(Distinct from the integrated change-**control** mechanism in E2-31, which assesses and authorizes changes to scope, schedule, and cost: this competency concerns following the change-management discipline and managing the human and organizational side of change — especially relevant in public-sector transitions.)*

- **N:** Follows change-management steps and supports transition activities under guidance.
- **J:** Handles straightforward project change and basic transition support with supervision.
- **R:** Independently manages project change and stakeholder transition for typical projects, following the change-management process.
- **S:** Manages complex or high-resistance change and organizational transition, anticipates adoption risks, and mentors others.
- **X:** Defines change-management and transition practice across the organization.
- **T:** Ensures the team manages project change and transition well and aligns it with organizational change practice.

---

**All content is now drafted.** Family-specific I1: SE (3) · BA (2) · PM (2) = 7, down from 18 broken entries.

**Grand totals:** SE 31 · BA 22 · PM 25 family-specific competencies + 30 shared canonical = **108 distinct competencies** across the three families (each family resolves to roughly 55–60 available competencies once it adds the shared core).

*Final step: **assembly + the Claude Code prompt.** Assembly reconciles the final code numbering (resolving the historical cross-family code overlaps in E3 and I1), produces a master index of all competencies with their canonical codes and family applicability, and specifies how the rebuild handles the retained-as-is SE content. The Claude Code prompt then rebuilds `config.competencies.json`, `config.competency-relevancy.json`, `config.active-competency-sets.json`, `config.role-families.json`, and `competence-labels.json` from this document, discarding the old config.*
