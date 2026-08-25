# Work site, contract position name, and an M/F gender constraint — design record

**Issue:** CA-109 · **Package:** competence · **Version target:** 3.23.0 → 3.24.0
**Status:** Designed, approved 2026-08-25
**Builds on:** CA-107 (employee CSV importer) and CA-108 (Employee Import screen), both merged.

---

## 1. What this adds

Three additions to the employee record and the import pipeline, driven by the shape of the real HR data:

1. **`work_site`** — which company office, or client premises, an employee reports to. A **configurable
   nomenclature**: the owner adds, removes and edits sites without a redeploy.
2. **`position_name`** — the position exactly as written in the employee's contract. Free text.
3. **`gender` constrained to `M` / `F` / empty** — free text on both write paths today.

## 2. Why `work_site` is not `work_location`

`work_location` already exists and records `On-site` / `Hybrid` / `Remote` — the *arrangement*. `work_site` records
the *place*. They are independent: a Hybrid employee still reports to a specific office, and two people at the same
office may hold different arrangements. Folding either into the other would lose one of the two facts.

## 3. Non-goals

- Changing how `work_mode` or `work_location` behave.
- Per-site address, capacity or geo data. A site is a code, a type and a name.
- Reporting or analytics by site. The field exists to be recorded and edited; nothing consumes it yet.
- Making any of the three fields required.

## 4. Current state that constrains the design

| Fact | Consequence |
|---|---|
| `personal` holds `workMode` / `workLocation`; `career` holds `roleFamily` / `level` / `stage` | `workSite` belongs beside the other two "how and where this person works" attributes; `positionName` belongs in `career`, where its placement signals it is *not* an input to grading |
| Role-family names are **localization keys**; an edit needs export → commit → redeploy to appear | Wrong shape for a nomenclature edited live. Site names are stored inline (§5.1) |
| `config.organization-structure.json` ships a demo tree and is registered `driftTracked: false` | The exact precedent for `work-sites`: deployment data, not release content, so it differs from the image default by design |
| The repository `Belleal/ti-engine` is **public** | The real office and client list is not committed (§5.2) |
| `mapRow` normalizes enums mechanically and **never** by synonym table | `Male` is rejected, not mapped to `M`. Guessing what a value meant is how a person is recorded wrong |
| `LEAVE_UNCHANGED_WHEN_OMITTED` exists because Redis `JSON.MERGE` leaves an omitted key untouched | Both new fields join it, so a blank cell cannot clear a stored value (§8) |
| CA-107 settled: validators block on document-intrinsic properties, cross-store references are **reported** | "No employee references a removed site" is not a validator (§5.3) |
| The Configuration screen is a **launcher of dedicated editors**, not a generic form | Registering the document alone would give the owner no way to edit it. A screen is in scope (§6) |
| Alpine runs in **CSP mode** | The new fragment may carry no inline `style="..."`, no optional chaining, and no `Array`/`Object` in template expressions |

## 5. The `work-sites` configuration document

### 5.1 Shape

The tenth registered document, ninth store-backed, keyed by site code:

```json
{
  "HQ": {
    "id": "HQ",
    "type": "office",
    "name": { "en": "Head Office", "bg": "Централно управление" }
  }
}
```

`type` is `office | client`. `name` is an inline `{ en, bg }` pair with both sides required and non-empty.

**Inline rather than localization keys** is the load-bearing choice. Role families store names as label keys, and
`INSTALL.md` already records the consequence: label edits "appear only after an export → commit → redeploy". A
nomenclature the owner is expected to maintain must take effect on save.

### 5.2 What ships in the repository

`config.work-sites.json` carries **generic demo sites** — the same posture as the demo org tree. The repository is
public, and the real list names both the company's office footprint and two client engagements. The real sites are
entered in the deployment through the Work Sites screen; the baked file is only a bootstrap default, and the stored
value wins from the first save onward.

Registered `driftTracked: false`, for the same reason `organization-structure` is: it holds deployment data, so it
differs from the image default by design and reporting that as drift is noise.

### 5.3 Validation

One blocking semantic validator, `workSiteIdMatchesKey`: a site's `id` must equal its map key. This mirrors
`organizationIdMatchesKey` and exists for the same reason — the schema cannot express the constraint, and the key is
what an operator actually edits, so the two can silently disagree.

**Deliberately not a validator: "no employee references a removed site."** That is a cross-store reference. CA-107
settled the principle when the unresolved-manager check became a startup diagnostic rather than a validator:
blocking a configuration document's save on employee data deadlocks a fresh install, because the configuration must
exist before an employee record can reference it. The protection lives in the editor instead (§6), where a live
employee count is available and refusing costs nothing.

## 6. The Work Sites screen

**Administration → Work Sites**, `roles: [ "admin" ]`, modelled on the existing Role Families editor: a registered
composite editor with `compose` / `decompose` over the document, reached through the framework's
`/admin/config/editors/work-sites`. Going through that API rather than a competence service is what makes the screen
inherit versioning, validation, audit and validated restore instead of reimplementing them.

The screen lists code, type and both names, and supports add, rename, retype and remove. **A removal is refused
while employees reference the site**, reporting the count and never the people.

Its `sidebarNavMapping` entry maps to its own key — `"work-sites": "work-sites"` — not to `"administration"`. That
map decides which sidebar *item* highlights, and `"administration"` is the Configuration item's own key; CA-108
shipped that bug and `33e9bee` fixed it.

## 7. The employee record

| Field | Location | Type | Notes |
|---|---|---|---|
| `workSite` | `personal` | optional string | A site code. Absent when unassigned |
| `positionName` | `career` | optional string | Free text, as written in the contract |
| `gender` | `personal` | optional `"M" \| "F"` | Schema gains the enum |

All three are optional and absent from existing records, so **no migration is required**.

`employee-rules.validateEmployee` gains two checks — an unknown `workSite` returns
`error.employee.invalid-work-site`, a gender outside `M`/`F` returns `error.employee.invalid-gender` — and
`EmployeeRulesContext` gains a `workSites` property. Because every caller builds that context, adding the property
is what forces every write path to supply the nomenclature: one chokepoint, the house pattern.

## 8. The CSV contract

`work_site` and `position_name` join `OPTIONAL_COLUMNS`, and both join `LEAVE_UNCHANGED_WHEN_OMITTED`.

**The consequence is worth stating plainly: neither field can be cleared by re-importing a blank cell.** They behave
like `birth_date`, `gender` and `starting_date`, not like `specialization`. Clearing one is Employee Management's
job. The alternative — blank clears — was rejected because an HR export that omits the column's values would wipe
every assignment in a single irreversible apply.

`gender` is normalized mechanically: trim and upper-case, so `m` becomes `M`. `Male` is rejected with the permitted
values named.

### 8.1 The confusable-code trap

The supplied site codes mix alphabets. `О5` begins with **Cyrillic О (U+041E)**; `O1`–`O4` and `O6`–`O9` use
**Latin O (U+004F)**. The two render identically in every font and compare unequal.

Left alone, an unknown `work_site` is rejected with the permitted codes listed — so the operator is shown `O5` as a
permitted value, identical on screen to the `О5` they typed, with no way to see the difference.

So: when an unmatched code matches a known code after folding the Cyrillic/Latin confusables
(А В Е К М Н О Р С Т У Х), the rejection names the offending character — *"'О5' uses a Cyrillic О; the permitted
code 'O5' uses a Latin O."*

**Folding phrases a better error and nothing more.** It never causes the value to be accepted. Silently accepting a
Cyrillic О as a Latin O would be exactly the synonym table `mapRow` forbids, and would write a person to the wrong
site rather than telling anyone.

## 9. Employee Management

`workSite` becomes a select grouped by `type` with an empty option; `positionName` a text input; `gender` an
`M` / `F` / — select replacing the free-text field. All three go through the existing `isFieldEditable` gating and
appear in the read-only detail rows.

Constraining gender here as well as in the importer is what keeps the two write paths agreeing about what is valid.
No employee record in the repository stores a gender today, so nothing existing breaks; a deployment holding
free-text gender values in Redis is noted in `INSTALL.md` as needing them corrected before the next write of those
records.

## 10. The XLSX template

The `work_site` column is **free text**, with the Instructions sheet directing the reader to
Administration → Work Sites for the valid codes. A committed dropdown would carry the demo codes and be wrong in
every real deployment — the valid list is deployment configuration, and the template is a repository artifact.

`gender` gains a genuine `M` / `F` dropdown, and `position_name` is free text.

The Employee Import screen gains a **Download CSV template** button emitting the current header row, reusing what
the CLI's `--template` already produces. It costs no dependency and cannot go stale.

The template is currently hand-built with no generator, so it cannot be reproducibly regenerated the next time the
columns change. A small committed generator script accompanies this change, run manually and documented — it is a
documentation artifact, not part of the Node build or CI.

## 11. Testing

- `work-sites` schema and the `workSiteIdMatchesKey` validator.
- `employee-rules`: unknown `workSite` rejected, known accepted, absent accepted; gender `M`/`F`/absent accepted,
  anything else rejected.
- `mapRow`: `work_site` known / unknown / blank / confusable; `position_name` passthrough including whitespace-only;
  `gender` `M` / `m` / `F` / blank / `Male`.
- The confusable message names the character rather than listing lookalike codes, and the value stays **rejected**.
- `LEAVE_UNCHANGED_WHEN_OMITTED`: a blank `work_site` or `position_name` leaves the stored value, and a record
  carrying either re-imports as `unchanged` rather than reclassifying as `update` forever.
- Editor `compose` / `decompose` round-trip; removal refused while in use, with a count and no personal data.
- Static wiring guard for the new screen — fragment registered, sidebar mapped, topbar title present.
- The fragment is CSP-clean.
- Every new label carries both `en` and `bg`.

## 12. Delivery

competence 3.23.0 → 3.24.0, branch `feat/work-site-and-position` off `master`, commits scoped `(CA-109)`.

The owner's real 12 sites are delivered as a ready-to-paste JSON snippet alongside this change and are **not**
committed (§5.2). That snippet uses a Latin `O5`.
