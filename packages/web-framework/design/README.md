# Design documents — web-framework

Architecture & design specs for `@ti-engine/web-framework` features. Some features span sibling packages (e.g. `@ti-engine/competence`); such a doc lives in the package doing the **bulk** of the work, and its meta header records the split under **Scope**.

## Conventions

- **One kebab-case file per feature/initiative** (e.g. `admin-config-management.md`).
- Each doc opens with a **meta header** table — `Status`, `Created`, `Last updated`, `Owner`, `Scope`, and `Relates to` — followed by an **Implementation log** mapping each phase/step to its git commit and date. This is how we trace, later, *what* was built, *when*, and *where* in history.
- **Keep the meta header + implementation log current** as steps land: tick the step, record the commit hash + date, and bump `Last updated`.
- **Status vocabulary:** `Draft` → `Ratified` → `In implementation — Phase X` → `Implemented` (→ `Superseded` if replaced; note the successor under `Relates to`).
- Decisions that were debated belong in the doc (a "Resolved decisions" section) so the rationale survives.

## Index

| Document | Status | Created | Updated |
|---|---|---|---|
| [admin-config-management.md](admin-config-management.md) | In implementation — Phase A | 2026-06-02 | 2026-06-02 |
