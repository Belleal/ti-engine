# Design — Competence End-User Guide + In-App Process Guide & Help

| | |
|---|---|
| **Date** | 2026-07-24 |
| **Packages** | `packages/competence` (only) |
| **Status** | Approved (brainstorming) — pending spec review |
| **Version targets** | competence `3.13.3` → `3.14.0` (minor) |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-92`](https://belleal.youtrack.cloud/issue/CA-92) (under `CA-11` Platform & Quality) |

---

## 1. Background & motivation

The competence app is functionally complete through interview closure (3.11.0) and deadline governance (3.12.0), and deployable as a container (3.13.x). Its documentation today serves two audiences: `README.md` (developers/product — what the system does and how it is built) and `INSTALL.md` (system administrators — how to deploy and operate it). **There is no documentation for the people who actually use the app** — employees, team members, managers, supervisors, and admin users — and the sidebar has carried disabled "Process Guide" and "Help" placeholder buttons since the sidebar landed.

This feature adds the third documentation pillar: a comprehensive, role-based **end-user guide**, living as markdown in the repo and served inside the app through the two Quick Links.

Decisions taken during brainstorming (2026-07-24):

1. **Single-sourcing:** markdown in `docs/user-guide/` is the canonical source; a build script converts it to committed HTML fragments (no drift, no runtime dependency).
2. **Process Guide:** a hand-authored interactive walkthrough screen, not a generated doc page.
3. **Language:** English first; the layout leaves room for a `bg/` pass later (matching the "BG pending native review" labels convention).

## 2. Goals & non-goals

**Goals**

- A canonical, GitHub-readable end-user guide at `packages/competence/docs/user-guide/en/` covering **every role and capacity** (Employee, Team Member, Manager, Supervisor, Administrator).
- The same guide served **in-app** as first-class screens — one per chapter — generated at build time from the markdown (single source of truth).
- A hand-authored **Process Guide** screen: a visual walkthrough of the 8-step appraisal process and the evaluation status lifecycle, deep-linking into guide chapters.
- Both sidebar **Quick Links enabled** and navigating.
- A **README refresh** closing the 3.13.x gaps (prerequisite, since the README is the guide's primary source).

**Non-goals**

- No Bulgarian guide content in v1 (structure accommodates `bg/` later; the two sidebar labels are already localized).
- No screenshots in v1 — they rot with every UI change, and the in-app guide sits next to the real screens.
- No runtime markdown rendering and no new runtime dependencies; the only new dependency is a build-time devDependency.
- No web-framework changes — everything lands in `packages/competence`.
- No in-guide search, no YouTrack Knowledge Base mirror (both listed as follow-ups).

## 3. Verified facts (the contract we build against)

Established by reading the code during brainstorming:

1. The Quick Links are **disabled placeholder buttons** in `bin/static/fragments/components/component-sidebar.html` (lines ~163–180); the labels `interface.navigation.process-guide` and `interface.navigation.help` already exist in `competence-labels.json`.
2. Screens register in `bin/competence-web-application.js` via `addFragment(name, { title, path, components?, roles? })`. A fragment with **no `roles` is public** to any authenticated session (web-framework `verifyAccess` gate, ≥1.13.0). Fragments are served at `/app/<name>`; sidebar items load them with `hx-get` into `#ti-content` with `hx-push-url="true"`.
3. Alpine runs in **CSP mode**: no inline `style="…"`, no `?.` in expressions. Static content fragments need no Alpine component at all.
4. There is precedent for **generated, committed artifacts** built from repo sources: `bin/build/build-competency-relevancy.js`.
5. Labels are served **per-session language** (`localization.getAllLabels(session?.language)`), so the client label store is single-language; a bilingual guide would be delivered by per-language generation, not by client-side switching.
6. `packages/competence` currently has **no devDependencies**; tests run via `node --test test/*.test.js` with no bundler.
7. The README is current through 3.13.0. The gaps versus 3.13.1–3.13.3 (verified against `CHANGELOG.md` and the commits after `cf0b5f2`) are exactly the four items in §4.

## 4. Deliverable 1 — README refresh

Close the four gaps so the README is a trustworthy source for the guide:

1. **Link `INSTALL.md`** — add a pointer from the Deployment section (and trim that section to a quickstart, deferring ops detail to INSTALL.md instead of duplicating it).
2. **Container auth posture (3.13.3)** — the image defaults to Azure SSO (`TI_WEB_AUTH_METHODS=openid-azure`); local auth is a dev stand-in, off by default.
3. **`GET /health`** — the health endpoint backing the Docker `HEALTHCHECK`.
4. **`COMPETENCE_PRELOAD_DATA` wording** — align the env-var table with the non-destructive-seed / destructive-reseed semantics documented during late CA-90.

No structural rewrite; the process/screens/scoring sections are current and stay as they are.

## 5. Deliverable 2 — the user guide content

**Location:** `packages/competence/docs/user-guide/en/` — nine chapters, numeric filename prefixes fix the order:

| File | Covers |
|---|---|
| `01-overview.md` | What the appraisal process is; roles and who does what; cycles; competencies (categories → subcategories); grades S/R/U/N; scores and thresholds T1–T5; the evaluation status lifecycle |
| `02-getting-started.md` | Signing in; the dashboard (hero, cycle card, stat cards, tasks, activity); navigation; theme toggle; profile |
| `03-employee.md` | The self-evaluation (drafting, submitting, the deadline and what happens if it passes); reading My Scores; the interview; what becomes visible at Ready vs Closed (closure feedback, goals, PIP) |
| `04-team-member.md` | Being selected as a peer reviewer; collective vs individual grading mode; the team-feedback deadline; anonymity guarantees (what the employee and manager can and cannot see) |
| `05-manager.md` | Starting evaluations (New Evaluation, team-selection rules); reviewing and grading; written feedback; finalizing team feedback; the availability calendar; conducting interviews and recording outcomes; People; Team analytics |
| `06-supervisor.md` | Cycle lifecycle (create → setup → validate → lock → close); Cycle Setup (pools, cap, floor coverage, exclusions); Oversight and stall recovery (waive self, proxy manager review, withdraw); interview scheduling and formal closure; Supervisor role grants; Cycle analytics and Trends |
| `07-administrator.md` | The admin config screens; versioning, validated restore, export-to-git; competency texts; archetypes; role families; what takes effect live vs after redeploy |
| `08-appraisal-process.md` | The end-to-end 8-step process — narrative form of the Process Guide screen |
| `09-faq-glossary.md` | Frequently asked questions ("why can't I see my manager's grades yet?", "what does Not Utilized mean?", …) and a glossary of terms |

**Authoring rules**

- Second person, task-oriented ("To submit your self-evaluation…"), written for end users — no code references, no internal jargon.
- Every behavioral claim **verified against the code or README** before it is written; anything uncertain is checked, not guessed. The guide gets a **human review pass** before real users are pointed at it (org policy for content people rely on).
- `# H1` = chapter title (the build uses it for navigation); `##`/`###` structure within.
- **No raw HTML in the markdown** — the build rejects it (keeps generated output uniform and CSP-clean). Callouts use blockquote conventions (`> **Note:** …`, `> **Warning:** …`) styled by CSS.
- Sources: README (process/screens/scoring), the fragments and labels (exact UI wording), the `design/` records for behavioral nuance.

## 6. Deliverable 3 — the md → fragment build pipeline

**`bin/build/build-user-guide.js`** (Node, CommonJS), run via a new package script `build:guide`:

- **Dependency:** `marked` (MIT), pinned, as the package's first **devDependency** — build-time only; generated output is committed, so `npm ci --omit=dev` installs and the container image are unaffected.
- **Input:** `docs/user-guide/en/*.md` in filename order. **Output:** `bin/static/fragments/guide/frame-help-<slug>.html` (committed), where `<slug>` is the filename minus its numeric prefix — fragment names stay stable if chapters are reordered.
- Each generated file is a **complete screen**: guide header, a chapter nav listing all chapters (the current one statically marked active), the converted content wrapped in `.ti-doc`, and prev/next footer links. Chapter-nav and prev/next links are plain `hx-get="/app/help-<slug>"` buttons targeting `#ti-content` with `hx-push-url` — pure HTMX, **no Alpine state**, matching how the rest of the app navigates.
- Generation details: tables are wrapped in a scroll container (`overflow-x`); `h2`/`h3` get stable slugified `id`s (future deep-link anchors; unused in v1); each file starts with a `<!-- GENERATED from docs/user-guide — edit the markdown and run npm run build:guide -->` banner; the build stamps the guide footer with the package version from `package.json`.
- **CSP discipline enforced at build:** the converter must emit no inline `style=`, no `<script>`, no event-handler attributes; raw HTML in the source is a build error.

## 7. Deliverable 4 — screens & navigation

**Registrations** (`bin/competence-web-application.js`), all public (no `roles`):

- `help-overview`, `help-getting-started`, `help-employee`, `help-team-member`, `help-manager`, `help-supervisor`, `help-administrator`, `help-appraisal-process`, `help-faq-glossary` → the nine generated fragments under `fragments/guide/` (names follow the slug rule in §6).
- `process-guide` → the hand-authored `fragments/frame-process-guide.html`.

**Sidebar** (`component-sidebar.html`): remove `disabled` from both Quick Links; **Help** → `hx-get="/app/help-overview"`, **Process Guide** → `hx-get="/app/process-guide"`, each with the usual `hx-target`/`hx-push-url`/active-state handling. Active-state behavior for in-content chapter navigation follows the app's existing deep-link behavior (dashboard task links have the same characteristics).

**The Process Guide screen** (hand-authored, static — no data loader, no Alpine component unless a collapse interaction proves necessary):

- A short hero: what the appraisal process is and how to read the page.
- A **status lifecycle strip**: `NOT_STARTED → OPEN → IN_REVIEW → READY → CLOSED` (+ the `DELETED` branch), styled with existing status-chip classes.
- **Eight step cards** — number, title, role badges (who acts), a two-to-four-sentence summary, the screen where it happens, and a "Learn more" button `hx-get`-ing the relevant help chapter.
- A **roles legend**: the four process roles plus admin, one line each.
- Built from existing CSS primitives (`.ti-panel*`, `.ti-kv-*`, icons); new CSS kept minimal and app-specific.

**Styling:** a `.ti-doc` typography block plus `.ti-guide-nav` / Process-Guide card styles in `competence-main.css` — headings, paragraph rhythm, lists, tables (scroll wrapper), blockquote callouts, inline code — themed via the existing CSS variables so both `daylight` and `black-glass` work. No inline styles anywhere (CSP).

**Localization note:** generated chapter content is English-only in v1 while the surrounding chrome stays label-driven — accepted, since the BG follow-up regenerates per language using the same pipeline (`bg/` input directory → per-language fragments, resolved by session language). The two sidebar labels are already bilingual; fragment `title`s ship in English like other screens.

## 8. Testing & verification

- **New `test/user-guide-build.test.js`:**
  1. *Freshness guard* — regenerate the guide in-memory and diff against the committed fragments; fails when the markdown was edited without rebuilding, or a generated file was hand-edited (mirrors the content-integrity guard pattern).
  2. *Registration sanity* — every registered `help-*` fragment path exists on disk.
  3. *CSP guard* — generated output contains no `style=`, `<script`, or `on*=` attributes.
- Existing suites stay green: `npm test`, `npm run test:json`, ESLint.
- **Browser verification** (docker compose + test users): both Quick Links navigate; every chapter renders in both themes; Process Guide deep-links land on the right chapters; role-specific claims in the guide spot-checked against the real UI per role.

## 9. Delivery & tracking

- One YouTrack card under **`CA-11` Platform & Quality**; every commit references it; time logged.
- Suggested commit bundling (fewer-is-better convention):
  1. `docs(competence):` README refresh (§4)
  2. `docs(competence):` add the end-user guide markdown (§5)
  3. `feat(competence):` guide build pipeline + generated Help screens + sidebar enable (§6, §7)
  4. `feat(competence):` Process Guide screen (§7)
  5. `build(release):` bump `3.13.3` → `3.14.0` + CHANGELOG
- PR from `current` to `master` per the repo flow.
- **Follow-ups (out of scope):** BG content pass with native review; per-language fragment resolution; YouTrack KB mirror of the guide; in-guide search; deep-link anchors into chapter sections.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Guide drifts from app behavior as features ship | The freshness guard catches md ↔ generated drift; code ↔ docs drift is procedural — future feature checklists include a guide-update line item (the README already has this culture), and the build stamps the guide with the package version so staleness is visible |
| `marked` output changes across versions | Pin the exact version; regeneration diffs are reviewed like any code change |
| Content inaccuracies reaching end users | Authored only from verified behavior; human review gate before rollout; FAQ answers cross-checked against the anonymization/visibility tables |
| Generated-fragment count (10 new screens) | Negligible — the registry is a map and the screens are static files |
