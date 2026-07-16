# Deadline Governance & Manual Stall Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the competence evaluation process run to completion instead of stalling — populate the self/manager deadlines, renormalize scoring to participating sources, add manual reason-justified stall recovery (advance-self, manager proxy, withdraw), overdue dashboard tasks, and a Supervisor Evaluations Oversight screen.

**Architecture:** All workflow mutations live in the frozen singleton `application/competence-framework.js`; the web layer (`bin/competence-web-application.js`) gates + delegates; dashboard tasks are derived (pure) in `application/task-resolver.js`; the UI is an HTMX fragment + a CSP-mode Alpine component. Reasons are recorded as evaluation-scoped audit entries (`appendAuditEntry`) — no evaluation-schema change. The scoring change is forward-only.

**Tech Stack:** Node.js ≥ 20.12, CommonJS, `#alias` internal imports, Redis-JSON via `@ti-engine/core/cache`, HTMX + Alpine.js (CSP build), `node --test` + `node:assert/strict`, ESLint 10.

Design doc: `packages/competence/design/deadline-governance.md`. Tracking: **CA-59**.

## Global Constraints

- **CommonJS + `#alias` imports** — `require()`/`module.exports`; import framework via `#competence-framework`, `#configuration-loader`, `#data-manager`, `#task-resolver`, etc.
- **Alpine CSP mode** — in HTML/Alpine expressions: **no inline `style="…"`** (bind through a store helper), **no optional chaining `?.`**, no `Array`/`Object` globals; use `x-text-label="key"` for static labels and `x-text="getLabel(cond ? 'a' : 'b')"` for conditional ones; role gates use `x-show` (never `x-if`) so HTMX wires `hx-*` before the role store resolves.
- **Role access in JS** — reference role codes as `configurationLoader.roleCode.SUPERVISOR` / `.MANAGER` / `.EMPLOYEE` / `.TEAM_MEMBER` (there is no top-level `EMPLOYEE` const; only `MANAGER`/`SUPERVISOR` locals exist, and only for `addFragment`).
- **Reasons via audit** — every out-of-band advance/withdrawal/proxy records `dataManager.instance.appendAuditEntry({ subjectType: "evaluation", subjectID, changedBy, field, oldValue, newValue, reason })`. No new persistent evaluation fields; no `evaluation.schema.json` change.
- **Deadlines reuse cycle dates** — `managerEvaluationDeadline = cycle.cycleDate`; `selfEvaluationDeadline = cycle.teamFeedbackDeadline || cycle.cycleDate`.
- **Scoring is forward-only** — do not recompute stored scores or per-cycle snapshots.
- **Manager deadline is not a hard block** — remove the manager late-submit guards; only the self round hard-blocks.
- **Testing** — `node --test` (`describe`/`it`/`beforeEach` from `node:test`, `assert` from `node:assert/strict`); framework/data tests stub the cache via `installInMemoryCache()` from `test/helpers/in-memory-cache.js`; `task-resolver` tests are pure/sync. After each theme run `npm test`, `npm run test:json`, and `npx eslint .` — all must be green.
- **Delivery** — competence `3.11.1 → 3.12.0`; commits bundled thematically (NOT per task — repo convention), each referencing **CA-59**; never commit `.run/*.run.xml`.
- **BG labels** — every new label leaf is `{ "en": "…", "bg": "…" }`; BG drafted alongside EN (native review is a standing follow-up).

---

## Commit themes (bundle thematically — repo convention overrides per-task commits)

- **Commit 1 — deadlines + scoring:** Tasks 1–2
- **Commit 2 — framework escapes + services + manager proxy:** Tasks 3–6
- **Commit 3 — overdue tasks + oversight loader:** Tasks 7–8
- **Commit 4 — oversight screen + client tasks:** Tasks 9–10
- **Commit 5 — labels:** Task 11
- **Commit 6 — docs + version:** Task 12

Each commit message: `feat(competence): <summary> (CA-59)` (or `docs`/`test` scope as fitting).

---

### Task 1: Populate self & manager deadlines at evaluation creation

**Files:**
- Modify: `packages/competence/application/competence-framework.js:540,542` (inside `createNewEvaluation`)
- Test: `packages/competence/test/competence-framework.deadlines.test.js` (create)

**Interfaces:**
- Consumes: `createNewEvaluation( employee, cycle, snapshot )` — `cycle` carries `cycleID`, `cycleDate`, optional `teamFeedbackDeadline`.
- Produces: created evaluations now carry `workflow.selfEvaluationDeadline` and `workflow.managerEvaluationDeadline` (non-empty when the cycle has dates). Tasks 6/7/8 read these.

- [ ] **Step 1: Write the failing test**

```js
// packages/competence/test/competence-framework.deadlines.test.js
const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let competenceFramework;
let configurationLoader;

beforeEach( async () => {
    installInMemoryCache();
    configurationLoader = require( "#configuration-loader" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    const dataManager = require( "#data-manager" );
    await dataManager.instance.initialize();
} );

function employee() {
    return { employeeID: "emp-1", career: { roleFamily: "SE", specialization: null, level: "R", stage: "1" } };
}
function snapshot() {
    return [ { code: "E1-1", category: "E", relevancy: { R1: 10 } } ];
}

describe( "createNewEvaluation — deadline population", () => {
    it( "sets managerEvaluationDeadline to the cycle date and selfEvaluationDeadline to the team-feedback deadline", () => {
        const cycle = { cycleID: "2026-H2", cycleDate: "2026-11-30", teamFeedbackDeadline: "2026-10-31" };
        const evaluation = competenceFramework.instance.createNewEvaluation( employee(), cycle, snapshot() );
        assert.equal( evaluation.workflow.managerEvaluationDeadline, "2026-11-30" );
        assert.equal( evaluation.workflow.selfEvaluationDeadline, "2026-10-31" );
    } );

    it( "falls back selfEvaluationDeadline to the cycle date when the cycle has no team-feedback deadline", () => {
        const cycle = { cycleID: "2026-H2", cycleDate: "2026-11-30" };
        const evaluation = competenceFramework.instance.createNewEvaluation( employee(), cycle, snapshot() );
        assert.equal( evaluation.workflow.selfEvaluationDeadline, "2026-11-30" );
        assert.equal( evaluation.workflow.managerEvaluationDeadline, "2026-11-30" );
    } );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/competence && node --test test/competence-framework.deadlines.test.js`
Expected: FAIL — both `selfEvaluationDeadline` and `managerEvaluationDeadline` come back `""`.

- [ ] **Step 3: Implement**

In `packages/competence/application/competence-framework.js`, replace the two hard-coded lines inside the `workflow` object of `createNewEvaluation`:

```js
                selfEvaluationCompleted: false,
                selfEvaluationDeadline: cycle.teamFeedbackDeadline || cycle.cycleDate || "",
                managerEvaluationCompleted: false,
                managerEvaluationDeadline: cycle.cycleDate || "",
```

(Only lines `540` and `542` change — from `""` to the cycle-derived values. Leave the `teamEvaluationDeadline` line at `546` as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/competence && node --test test/competence-framework.deadlines.test.js`
Expected: PASS (2 tests).

---

### Task 2: Renormalize the final score to participating sources

**Files:**
- Modify: `packages/competence/application/competence-framework.js:603-674` (replace the body of `calculateFinalEvaluationScores`)
- Test: `packages/competence/test/competence-framework.scoring.test.js` (create)

**Interfaces:**
- Consumes: `calculateFinalEvaluationScores( evaluation )` — reads `evaluation.snapshot`, `evaluation.grades`, `evaluation.stageLevel`, and now `evaluation.workflow.{self,team,manager}EvaluationCompleted`. Mutates `evaluation.scores` and `evaluation.finalScore` in place.
- Produces: a source contributes only when its completion flag is set; the weighted sum is divided by the participating-weight total.

- [ ] **Step 1: Write the failing test**

```js
// packages/competence/test/competence-framework.scoring.test.js
const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let competenceFramework;

beforeEach( async () => {
    installInMemoryCache();
    require( "#configuration-loader" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    await require( "#data-manager" ).instance.initialize();
} );

// Three single-competency categories (E/I/C), relevancy 10 at R1. `over.grades` overrides the grade map;
// `over.self/team/manager` (default true) drive the participation completion flags.
function scoringEval( over = {} ) {
    const relevancy = { R1: 10 };
    return {
        stageLevel: "R1",
        snapshot: [
            { code: "E1-1", category: "E", relevancy },
            { code: "I1-1", category: "I", relevancy },
            { code: "C1-1", category: "C", relevancy }
        ],
        grades: over.grades || {
            "E1-1": { employee: "R", manager: "R", team: { cumulative: "R" } },
            "I1-1": { employee: "R", manager: "R", team: { cumulative: "R" } },
            "C1-1": { employee: "R", manager: "R", team: { cumulative: "R" } }
        },
        scores: {},
        finalScore: {},
        workflow: {
            selfEvaluationCompleted: over.self !== false,
            teamEvaluationCompleted: over.team !== false,
            managerEvaluationCompleted: over.manager !== false
        }
    };
}

describe( "calculateFinalEvaluationScores — participating-source renormalization", () => {
    it( "scores all-R at ~100 when all three sources participate", () => {
        const e = scoringEval();
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 );
    } );

    it( "scores a no-team all-R evaluation at 100 (not depressed by the unused 0.30 team weight)", () => {
        const e = scoringEval( { team: false } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 ); // pre-change this was ceil(0.7*100) = 70
    } );

    it( "excludes a waived self round entirely, even with leftover draft self-grades", () => {
        const grades = {
            "E1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "I1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "C1-1": { employee: "S", manager: "R", team: { cumulative: "R" } }
        };
        const e = scoringEval( { self: false, grades } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 100 ); // self "S" ignored because selfEvaluationCompleted is false
    } );

    it( "still differentiates when all participate (self S, team R, manager R => 106)", () => {
        const grades = {
            "E1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "I1-1": { employee: "S", manager: "R", team: { cumulative: "R" } },
            "C1-1": { employee: "S", manager: "R", team: { cumulative: "R" } }
        };
        const e = scoringEval( { grades } );
        competenceFramework.instance.calculateFinalEvaluationScores( e );
        assert.equal( e.finalScore.score, 106 );
    } );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/competence && node --test test/competence-framework.scoring.test.js`
Expected: FAIL — the no-team case returns `70` and the waived-self case is depressed, because the current code applies fixed weights without renormalizing.

- [ ] **Step 3: Implement**

Replace the entire `calculateFinalEvaluationScores( evaluation ) { … }` method with:

```js
    calculateFinalEvaluationScores( evaluation ) {
        if ( !evaluation || !Array.isArray( evaluation.snapshot ) || !evaluation.grades ) {
            return;
        }

        const snapshotByCode = new Map();
        for ( const entry of evaluation.snapshot ) {
            snapshotByCode.set( entry.code, entry );
        }

        const selfScore = {};
        const teamScore = {};
        const managerScore = {};
        const maxScoreByCategory = {};

        Object.entries( evaluation.grades ).forEach( ( [ competencyCode, gradeEntry ] ) => {
            const entry = snapshotByCode.get( competencyCode );
            if ( !entry || !gradeEntry ) {
                return;
            }
            const relevancy = entry.relevancy?.[ evaluation.stageLevel ] || 0;
            const category = entry.category;

            selfScore[ category ] = ( selfScore[ category ] || 0 ) + ( gradeWeights[ gradeEntry.employee ] || 0 ) * relevancy;
            teamScore[ category ] = ( teamScore[ category ] || 0 ) + ( gradeWeights[ gradeEntry.team?.cumulative ] || 0 ) * relevancy;
            managerScore[ category ] = ( managerScore[ category ] || 0 ) + ( gradeWeights[ gradeEntry.manager ] || 0 ) * relevancy;
            maxScoreByCategory[ category ] = ( maxScoreByCategory[ category ] || 0 ) + relevancy;
        } );

        // Renormalize to the sources that actually participated (matches the client decomposition). A source
        // participates iff its round completed: self/manager are set on submit, team when all peers submit or the
        // round is finalized. A waived self (finalizeSelfEvaluation leaves selfEvaluationCompleted false) and a
        // no-team evaluation are thereby excluded. Dividing by the participating-weight sum keeps an all-R
        // evaluation ~100 regardless of which sources took part, instead of depressing it by the absent weight.
        const workflow = evaluation.workflow || {};
        const selfParticipates = workflow.selfEvaluationCompleted === true;
        const teamParticipates = workflow.teamEvaluationCompleted === true;
        const managerParticipates = workflow.managerEvaluationCompleted === true;
        const participatingWeight =
            ( selfParticipates ? evaluationWeights.SELF : 0 ) +
            ( teamParticipates ? evaluationWeights.TEAM : 0 ) +
            ( managerParticipates ? evaluationWeights.MANAGER : 0 );

        evaluation.scores = {};
        evaluation.finalScore = { score: 0 };

        Object.entries( maxScoreByCategory ).forEach( ( [ categoryCode, maxCategoryScore ] ) => {
            if ( !maxCategoryScore || participatingWeight <= 0 ) {
                return;
            }
            const weighted =
                ( selfParticipates ? ( ( selfScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.SELF : 0 ) +
                ( teamParticipates ? ( ( teamScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.TEAM : 0 ) +
                ( managerParticipates ? ( ( managerScore[ categoryCode ] || 0 ) / maxCategoryScore ) * evaluationWeights.MANAGER : 0 );
            const categoryScore = Math.ceil( ( weighted / participatingWeight ) * 100 );

            let interpretation = null;
            Object.keys( performanceThresholds ).forEach( ( thresholdCode ) => {
                if ( !interpretation && categoryScore <= performanceThresholds[ thresholdCode ] ) {
                    interpretation = thresholdCode;
                }
            } );
            if ( !interpretation ) {
                interpretation = configurationLoader.performanceThreshold.T5;
            }

            evaluation.scores[ categoryCode ] = { score: categoryScore, interpretation };
            evaluation.finalScore.score += categoryScore;
        } );

        const scoredCategoriesCount = Object.keys( evaluation.scores ).length;
        if ( scoredCategoriesCount === 0 ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.unable-to-final-score" }, exceptions.httpCode.C_422 );
        }
        evaluation.finalScore.score = Math.ceil( evaluation.finalScore.score / scoredCategoriesCount );

        let finalInterpretation = null;
        Object.keys( performanceThresholds ).forEach( ( thresholdCode ) => {
            if ( !finalInterpretation && evaluation.finalScore.score <= performanceThresholds[ thresholdCode ] ) {
                finalInterpretation = thresholdCode;
            }
        } );
        evaluation.finalScore.interpretation = finalInterpretation || configurationLoader.performanceThreshold.T5;

        logger.log( "Final evaluation scores:", logger.logSeverity.DEBUG, { categories: evaluation.scores, final: evaluation.finalScore } );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/competence && node --test test/competence-framework.scoring.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify no regression + reconcile analytics, then commit Theme 1**

Run: `cd packages/competence && npm test && npm run test:json && npx eslint .`
Expected: all green (the existing `results-analytics.*` suites still pass — the analytics `#sourceWeight` blend is independent; confirm its `"blended"` path already reweights to participating sources and, if it diverges, note it — no snapshot `schemaVersion` bump).

```bash
git add packages/competence/application/competence-framework.js packages/competence/test/competence-framework.deadlines.test.js packages/competence/test/competence-framework.scoring.test.js
git commit -m "feat(competence): populate self/manager deadlines + renormalize scoring to participating sources (CA-59)"
```

---

### Task 3: `finalizeSelfEvaluation` framework method

**Files:**
- Modify: `packages/competence/application/competence-framework.js` (add method next to `finalizeTeamFeedback`, ~line 380)
- Test: `packages/competence/test/competence-framework.finalize.test.js` (extend)

**Interfaces:**
- Produces: `finalizeSelfEvaluation( evaluationID, actorID, reason ) → Promise<Evaluation>` — waives the self round (leaves `selfEvaluationCompleted` false), advances `OPEN → IN_REVIEW` when the team round is done else holds `OPEN`, writes one audit entry. Consumed by `#advanceSelfEvaluation` (Task 5).

- [ ] **Step 1: Write the failing tests** (append to `competence-framework.finalize.test.js`, reusing its `saveEvaluation` builder + `PAST`/`FUTURE` constants)

```js
describe( "finalizeSelfEvaluation — supervisor waive of a stalled self round", () => {
    it( "rejects when the evaluation is not OPEN", async () => {
        await saveEvaluation( { status: "In Review" } );
        await assert.rejects(
            () => competenceFramework.instance.finalizeSelfEvaluation( "eval-1", "sup-1", "left the company" ),
            ( err ) => /self-finalize-not-open/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "rejects when the self deadline has not passed", async () => {
        await saveEvaluation( { selfDeadline: FUTURE } );
        await assert.rejects(
            () => competenceFramework.instance.finalizeSelfEvaluation( "eval-1", "sup-1", "left the company" ),
            ( err ) => /self-finalize-deadline-not-reached/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "rejects when a reason is missing", async () => {
        await saveEvaluation( { selfDeadline: PAST } );
        await assert.rejects(
            () => competenceFramework.instance.finalizeSelfEvaluation( "eval-1", "sup-1", "   " ),
            ( err ) => /reason-required/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "advances to IN_REVIEW when team is done, leaves self incomplete, and writes an audit entry with the reason", async () => {
        await saveEvaluation( { selfDeadline: PAST, teamEvaluationCompleted: true, team: [] } );
        const updated = await competenceFramework.instance.finalizeSelfEvaluation( "eval-1", "sup-1", "on extended leave" );
        assert.equal( updated.status, configurationLoader.evaluationStatus.IN_REVIEW );
        assert.equal( updated.workflow.selfEvaluationCompleted, false );

        const entries = await dataManager.instance.getAuditEntriesForEvaluation( "eval-1" );
        assert.equal( entries.length, 1 );
        assert.equal( entries[ 0 ].field, "workflow.selfEvaluation" );
        assert.match( entries[ 0 ].reason, /on extended leave/ );
    } );

    it( "holds OPEN when the team round is still pending", async () => {
        await saveEvaluation( { selfDeadline: PAST, teamEvaluationCompleted: false, team: [ "u2" ] } );
        const updated = await competenceFramework.instance.finalizeSelfEvaluation( "eval-1", "sup-1", "unreachable" );
        assert.equal( updated.status, configurationLoader.evaluationStatus.OPEN );
    } );
} );
```

> Extend the existing `saveEvaluation` builder in this file so `over.selfDeadline` maps to `workflow.selfEvaluationDeadline` and `over.teamEvaluationCompleted` maps to `workflow.teamEvaluationCompleted` (both currently hard-coded). One-line additions inside the `workflow` literal:
> ```js
>             selfEvaluationDeadline: ( over.selfDeadline !== undefined ) ? over.selfDeadline : "",
>             teamEvaluationCompleted: over.teamEvaluationCompleted === true,
> ```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/competence && node --test test/competence-framework.finalize.test.js`
Expected: FAIL — `finalizeSelfEvaluation is not a function`.

- [ ] **Step 3: Implement** (add immediately after `finalizeTeamFeedback`)

```js
    /**
     * Supervisor waive of a stalled self round: advances a past-deadline OPEN evaluation without a self-assessment.
     * Leaves selfEvaluationCompleted false (so the self source is excluded from scoring), advancing to IN_REVIEW only
     * when the team round is also done. Records the mandatory reason on the evaluation audit trail.
     *
     * <br/>NOTE: This method mutates and persists the evaluation.
     *
     * @method
     * @param {string} evaluationID
     * @param {string} actorID
     * @param {string} reason
     * @returns {Promise<Evaluation>}
     * @public
     */
    finalizeSelfEvaluation( evaluationID, actorID, reason ) {
        return dataManager.instance.fetchEvaluation( evaluationID ).then( ( evaluation ) => {
            const today = new Date().toISOString().split( "T" )[ 0 ];
            const workflow = evaluation.workflow || {};

            if ( evaluation.status !== configurationLoader.evaluationStatus.OPEN ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.self-finalize-not-open" }, exceptions.httpCode.C_422 );
            }
            const deadline = workflow.selfEvaluationDeadline || "";
            if ( !deadline || today <= deadline ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.self-finalize-deadline-not-reached" }, exceptions.httpCode.C_422 );
            }
            if ( workflow.selfEvaluationCompleted ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.self-finalize-already-complete" }, exceptions.httpCode.C_422 );
            }
            const trimmedReason = String( reason || "" ).trim();
            if ( !trimmedReason ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.reason-required" }, exceptions.httpCode.C_422 );
            }

            // Advance only when the team round is done (mirrors the #submitEvaluation OPEN->IN_REVIEW predicate); the
            // self round stays incomplete and is therefore excluded from scoring at manager submit.
            const teamDone = workflow.teamEvaluationCompleted || ( !workflow.team || workflow.team.length === 0 );
            let newValueLabel;
            if ( teamDone ) {
                evaluation.status = configurationLoader.evaluationStatus.IN_REVIEW;
                newValueLabel = configurationLoader.evaluationStatus.IN_REVIEW;
            } else {
                newValueLabel = "Open (awaiting team)";
            }

            return dataManager.instance.saveEvaluation( evaluation ).then( ( saved ) => {
                return dataManager.instance.appendAuditEntry( {
                    subjectType: "evaluation",
                    subjectID: evaluationID,
                    changedBy: actorID,
                    field: "workflow.selfEvaluation",
                    oldValue: "pending",
                    newValue: "waived → " + newValueLabel,
                    reason: `Self-evaluation waived after the deadline: ${ trimmedReason }`
                } ).then( () => saved );
            } );
        } );
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/competence && node --test test/competence-framework.finalize.test.js`
Expected: PASS (existing + 5 new).

---

### Task 4: `withdrawEvaluation` framework method

**Files:**
- Modify: `packages/competence/application/competence-framework.js` (add after `finalizeSelfEvaluation`)
- Test: `packages/competence/test/competence-framework.finalize.test.js` (extend)

**Interfaces:**
- Produces: `withdrawEvaluation( evaluationID, actorID, reason ) → Promise<{ evaluationID, status }>` — sets status `DELETED`, releases any booked interview slot, clears `interviewDate`, writes one audit entry. Consumed by `#withdrawEvaluation` (Task 5).

- [ ] **Step 1: Write the failing tests** (append to `competence-framework.finalize.test.js`)

```js
describe( "withdrawEvaluation — supervisor cancel/withdraw to DELETED", () => {
    it( "rejects a CLOSED evaluation", async () => {
        await saveEvaluation( { status: "Closed" } );
        await assert.rejects(
            () => competenceFramework.instance.withdrawEvaluation( "eval-1", "sup-1", "duplicate" ),
            ( err ) => /withdraw-not-active/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "rejects a missing reason", async () => {
        await saveEvaluation( { status: "Open" } );
        await assert.rejects(
            () => competenceFramework.instance.withdrawEvaluation( "eval-1", "sup-1", "" ),
            ( err ) => /reason-required/.test( err?.data?.details || err?.message || "" )
        );
    } );

    it( "sets DELETED, clears the interview date, and writes an audit entry", async () => {
        await saveEvaluation( { status: "Ready" } );
        const result = await competenceFramework.instance.withdrawEvaluation( "eval-1", "sup-1", "created by mistake" );
        assert.equal( result.status, configurationLoader.evaluationStatus.DELETED );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.status, configurationLoader.evaluationStatus.DELETED );
        assert.equal( fetched.interviewDate, null );

        const entries = await dataManager.instance.getAuditEntriesForEvaluation( "eval-1" );
        assert.equal( entries[ entries.length - 1 ].field, "status" );
        assert.match( entries[ entries.length - 1 ].reason, /created by mistake/ );
    } );

    it( "releases a booked interview slot for the withdrawn evaluation", async () => {
        await saveEvaluation( { status: "Ready" } );
        const slot = {
            slotID: "2026-H2|mgr-1|2026-11-20|09:00", cycleID: "2026-H2", managerID: "mgr-1",
            date: "2026-11-20", startTime: "09:00",
            status: configurationLoader.slotStatus.BOOKED,
            booking: { evaluationID: "eval-1", employeeID: "emp-1", employeeName: "E", bookedAt: "2026-11-01" }
        };
        await dataManager.instance.saveCalendarSlot( slot );

        await competenceFramework.instance.withdrawEvaluation( "eval-1", "sup-1", "wrong employee" );

        const slots = await dataManager.instance.fetchAllCalendarSlots( "2026-H2" );
        const released = slots.find( ( s ) => s.slotID === slot.slotID );
        assert.equal( released.status, configurationLoader.slotStatus.AVAILABLE );
        assert.equal( released.booking, null );
    } );
} );
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/competence && node --test test/competence-framework.finalize.test.js`
Expected: FAIL — `withdrawEvaluation is not a function`.

- [ ] **Step 3: Implement**

```js
    /**
     * Supervisor cancel/withdraw of an active evaluation. Releases any booked interview slot, clears the interview
     * date, sets status DELETED (read-side filters remove it, unblocking a fresh start-evaluation), and records the
     * mandatory reason on the audit trail. Irreversible.
     *
     * @method
     * @param {string} evaluationID
     * @param {string} actorID
     * @param {string} reason
     * @returns {Promise<{ evaluationID: string, status: string }>}
     * @public
     */
    withdrawEvaluation( evaluationID, actorID, reason ) {
        return dataManager.instance.fetchEvaluation( evaluationID ).then( ( evaluation ) => {
            const activeStatuses = [
                configurationLoader.evaluationStatus.OPEN,
                configurationLoader.evaluationStatus.IN_REVIEW,
                configurationLoader.evaluationStatus.READY
            ];
            if ( !activeStatuses.includes( evaluation.status ) ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.withdraw-not-active" }, exceptions.httpCode.C_422 );
            }
            const trimmedReason = String( reason || "" ).trim();
            if ( !trimmedReason ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.reason-required" }, exceptions.httpCode.C_422 );
            }

            const previousStatus = evaluation.status;

            return dataManager.instance.fetchAllCalendarSlots( evaluation.cycleID ).then( ( slots ) => {
                const bookedSlot = ( Array.isArray( slots ) ? slots : [] ).find(
                    ( slot ) => slot.status === configurationLoader.slotStatus.BOOKED && slot.booking?.evaluationID === evaluationID
                );
                const releaseSlot = bookedSlot
                    ? ( () => {
                        bookedSlot.status = configurationLoader.slotStatus.AVAILABLE;
                        bookedSlot.booking = null;
                        return dataManager.instance.saveCalendarSlot( bookedSlot );
                    } )()
                    : Promise.resolve();

                return releaseSlot.then( () => {
                    evaluation.status = configurationLoader.evaluationStatus.DELETED;
                    evaluation.interviewDate = null;
                    return dataManager.instance.saveEvaluation( evaluation );
                } );
            } ).then( () => {
                return dataManager.instance.appendAuditEntry( {
                    subjectType: "evaluation",
                    subjectID: evaluationID,
                    changedBy: actorID,
                    field: "status",
                    oldValue: previousStatus,
                    newValue: configurationLoader.evaluationStatus.DELETED,
                    reason: `Evaluation withdrawn: ${ trimmedReason }`
                } ).then( () => ( { evaluationID: evaluationID, status: configurationLoader.evaluationStatus.DELETED } ) );
            } );
        } );
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/competence && node --test test/competence-framework.finalize.test.js`
Expected: PASS.

---

### Task 5: Web services — `advance-self-evaluation` + `withdraw-evaluation`

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` — add two service branches in `processServiceRequest` (before the final `else`, ~line 363) and two private handlers.

**Interfaces:**
- Consumes: `competenceFramework.instance.finalizeSelfEvaluation` / `withdrawEvaluation` (Tasks 3–4), `#requireRole` (`{ userID }`), `exceptions`.
- Produces: POST `/app/advance-self-evaluation` and `/app/withdraw-evaluation`, both Supervisor-gated, returning `{ evaluationID, status }`. Consumed by the oversight component (Task 9).

- [ ] **Step 1: Add the router branches** (insert before `} else {` at ~line 363)

```js
        } else if ( service === "advance-self-evaluation" ) {
            return this.#advanceSelfEvaluation( session, params );
        } else if ( service === "withdraw-evaluation" ) {
            return this.#withdrawEvaluation( session, params );
```

- [ ] **Step 2: Add the two handlers** (near `#finalizeTeamFeedback`, ~line 1252)

```js
    #advanceSelfEvaluation( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            const evaluationID = String( params?.evaluationID || "" ).trim();
            const reason = String( params?.reason || "" ).trim();
            if ( !evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { evaluationID } ) );
            }
            competenceFramework.instance.finalizeSelfEvaluation( evaluationID, userID, reason ).then( ( updated ) => {
                resolve( { evaluationID: updated.evaluationID, status: updated.status } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    #withdrawEvaluation( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            const evaluationID = String( params?.evaluationID || "" ).trim();
            const reason = String( params?.reason || "" ).trim();
            if ( !evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { evaluationID } ) );
            }
            competenceFramework.instance.withdrawEvaluation( evaluationID, userID, reason ).then( ( result ) => {
                resolve( result );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
```

- [ ] **Step 3: Verify** — no HTTP test harness exists; correctness is covered by the Task 3/4 framework units. Run `cd packages/competence && npx eslint .` (expected: 0 errors). Full behavior is verified in the browser during Task 9.

---

### Task 6: Manager proxy — Supervisor may complete manager grades; drop the manager deadline block

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` — `processServiceRequest` (pass `params` to submit), `#saveEvaluationDraft` (remove manager deadline guard), `#submitEvaluation` (`:617-745`: role head, manager branch, remove deadline guard, reason + audit).

**Interfaces:**
- Consumes: `#requireSessionUser` (`{ userID, userRoles }`), `#canManagerPerformEvaluation`, `appendAuditEntry`.
- Produces: a Supervisor who is not an org-line superior may submit/draft manager grades with a mandatory reason (audited); the manager late-submit guards are gone so any manager can complete after the deadline.

- [ ] **Step 1: Route the reason into submit** — in `processServiceRequest`, change the `submit-evaluation` branch to forward `params`:

```js
        } else if ( service === "submit-evaluation" ) {
            return this.#submitEvaluation( session, params.evaluation, params.reason );
```

- [ ] **Step 2: `#submitEvaluation` — signature + role head** — change the method signature and the session read:

```js
    #submitEvaluation( session, evaluation, reason ) {
```
```js
            const { userID, userRoles } = this.#requireSessionUser( session );
            const isSupervisor = userRoles.includes( configurationLoader.roleCode.SUPERVISOR );
```

- [ ] **Step 3: `#submitEvaluation` — manager branch** — change `} else if ( isManager ) {` (`:704`) to admit a supervisor proxy, remove the deadline guard, and require+carry a reason for an out-of-line supervisor:

```js
                } else if ( isManager || isSupervisor ) {
                    const isProxyBySupervisor = isSupervisor && !isManager;
                    const managerProxyReason = String( reason || "" ).trim();
                    if ( isProxyBySupervisor && !managerProxyReason ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.reason-required" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.status !== configurationLoader.evaluationStatus.IN_REVIEW ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-submit-status-in-review" }, exceptions.httpCode.C_422 );
                    }
                    if ( existingEvaluation.workflow.managerEvaluationCompleted ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.already-completed-manager-evaluation" }, exceptions.httpCode.C_422 );
                    }
                    // NOTE: the manager deadline is a nudge/target, not a hard block (CA-59) — a late manager submit is
                    // never rejected; the overdue-manager task + supervisor proxy provide oversight instead.

                    if ( evaluation.feedback && evaluation.feedback.managerComment !== undefined ) {
                        existingEvaluation.feedback = existingEvaluation.feedback || {};
                        existingEvaluation.feedback.managerComment = evaluation.feedback.managerComment;
                    }

                    competenceFramework.instance.updateManagerEvaluationGrades( existingEvaluation, evaluation.grades );

                    if ( Object.keys( existingEvaluation.grades || {} ).some( ( code ) => !configurationLoader.evaluationGrade.contains( evaluation.grades?.[ code ]?.manager ) ) ) {
                        throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.incomplete-grades" }, exceptions.httpCode.C_422 );
                    }

                    existingEvaluation.workflow.managerEvaluationCompleted = true;
                    existingEvaluation.status = configurationLoader.evaluationStatus.READY;
                    existingEvaluation.workflow.managerProxyReason = isProxyBySupervisor ? managerProxyReason : null;

                    // At this point calculate the performance scores:
                    competenceFramework.instance.calculateFinalEvaluationScores( existingEvaluation );
                } else {
```

> `managerProxyReason` is a transient local carried onto `existingEvaluation.workflow` only to reach the post-save audit step below; it is NOT persisted intentionally (it is overwritten to `null` for the normal path and consumed immediately). If you prefer to avoid touching the workflow object, hoist a `let proxyAuditReason` in the outer Promise scope instead and set it here.

- [ ] **Step 4: `#submitEvaluation` — audit the proxy after save** — replace the save line (`:745` `return dataManager.instance.saveEvaluation( existingEvaluation );`) with a save-then-conditional-audit:

```js
                return dataManager.instance.saveEvaluation( existingEvaluation ).then( ( saved ) => {
                    if ( saved.workflow && saved.workflow.managerProxyReason ) {
                        return dataManager.instance.appendAuditEntry( {
                            subjectType: "evaluation",
                            subjectID: saved.evaluationID,
                            changedBy: userID,
                            field: "grades.managerProxy",
                            oldValue: null,
                            newValue: { by: "supervisor" },
                            reason: `Manager grades entered by a Supervisor on the manager's behalf: ${ saved.workflow.managerProxyReason }`
                        } ).then( () => saved );
                    }
                    return saved;
                } );
```

- [ ] **Step 5: `#saveEvaluationDraft` — remove the manager deadline guard** — delete the manager-deadline block at ~`:819` (`if ( … managerEvaluationDeadline && today > … ) { throw … deadline-over-manager-evaluation … }`). Leave the self-draft deadline guard (`:804`) intact. (The self deadline stays hard-enforced; only the manager deadline stops blocking.)

- [ ] **Step 6: Verify + commit Theme 2**

Run: `cd packages/competence && npm test && npm run test:json && npx eslint .`
Expected: green (existing self/manager submit tests still pass — the self guard is unchanged; no manager-deadline test existed because the field was empty).

```bash
git add packages/competence/application/competence-framework.js packages/competence/bin/competence-web-application.js packages/competence/test/competence-framework.finalize.test.js
git commit -m "feat(competence): self-waive + withdraw framework methods, their services, and supervisor manager-proxy (CA-59)"
```

---

### Task 7: Overdue dashboard tasks (`overdue-self`, `overdue-manager`)

**Files:**
- Modify: `packages/competence/application/task-resolver.js` (add two aggregate counters + emits, mirroring `interview-schedule`/`interview-close`)
- Test: `packages/competence/test/task-resolver.test.js` (extend the `evaluation()` builder + two describes)

**Interfaces:**
- Consumes: `resolveTasks( userID, ctx, evaluations )` — `ctx.isSupervisor`, `ctx.today`; reads `evaluation.status`, `evaluation.workflow.{self,manager}EvaluationDeadline`, `.{self,manager}EvaluationCompleted`.
- Produces: `{ type: "overdue-self", count }` and `{ type: "overdue-manager", count }` aggregate tasks. Consumed by the client (Task 10).

- [ ] **Step 1: Extend the test builder + write failing tests**

In `task-resolver.test.js`, add the new workflow fields to the `evaluation()` builder:
```js
        workflow: {
            team: over.team || [],
            teamEvaluationDeadline: ( over.deadline !== undefined ) ? over.deadline : "2026-07-15",
            teamEvaluationsSubmitted: over.submitted || 0,
            selfEvaluationDeadline: ( over.selfDeadline !== undefined ) ? over.selfDeadline : "",
            selfEvaluationCompleted: over.selfDone === true,
            managerEvaluationDeadline: ( over.managerDeadline !== undefined ) ? over.managerDeadline : "",
            managerEvaluationCompleted: over.managerDone === true
        }
```

Then append:
```js
describe( "TaskResolver — overdue-self / overdue-manager (supervisor aggregates)", () => {
    it( "counts OPEN evaluations past the self deadline with self incomplete", () => {
        const evaluations = [
            evaluation( { evaluationID: "e1", status: "Open", selfDeadline: "2026-07-01", selfDone: false } ),
            evaluation( { evaluationID: "e2", status: "Open", selfDeadline: "2026-07-01", selfDone: true } ), // done — excluded
            evaluation( { evaluationID: "e3", status: "Open", selfDeadline: "2026-08-01", selfDone: false } ) // future — excluded
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        assert.deepEqual( tasks.find( ( t ) => t.type === "overdue-self" ), { type: "overdue-self", count: 1 } );
    } );

    it( "counts IN_REVIEW evaluations past the manager deadline with manager incomplete", () => {
        const evaluations = [
            evaluation( { evaluationID: "e1", status: "In Review", managerDeadline: "2026-07-01", managerDone: false } )
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        assert.deepEqual( tasks.find( ( t ) => t.type === "overdue-manager" ), { type: "overdue-manager", count: 1 } );
    } );

    it( "emits neither aggregate for a non-supervisor", () => {
        const evaluations = [ evaluation( { status: "Open", selfDeadline: "2026-07-01", selfDone: false } ) ];
        const tasks = taskResolver.instance.resolveTasks( "u1", ctx( { isSupervisor: false, today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "overdue-self" || t.type === "overdue-manager" ), false );
    } );
} );
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/competence && node --test test/task-resolver.test.js`
Expected: FAIL — no `overdue-self`/`overdue-manager` tasks emitted.

- [ ] **Step 3: Implement** — in `resolveTasks`, declare counters next to the existing aggregates (near line 131):
```js
    let overdueSelf = 0;
    let overdueManager = 0;
```
Inside the per-evaluation loop, add (using the same `today !== "" && today > deadline` idiom as `deadlinePassed`):
```js
        if ( isSupervisor && evaluation.status === "Open"
            && !workflow.selfEvaluationCompleted
            && workflow.selfEvaluationDeadline && today !== "" && today > workflow.selfEvaluationDeadline ) {
            overdueSelf++;
        }
        if ( isSupervisor && evaluation.status === "In Review"
            && !workflow.managerEvaluationCompleted
            && workflow.managerEvaluationDeadline && today !== "" && today > workflow.managerEvaluationDeadline ) {
            overdueManager++;
        }
```
> Use the enum *values* `"Open"` / `"In Review"` (title-case) for the status comparison — `task-resolver.js` already compares against these string values, matching the enum-value gotcha.

After the loop, next to the other emits (~line 250):
```js
    if ( isSupervisor && overdueSelf > 0 ) {
        tasks.push( { type: "overdue-self", count: overdueSelf } );
    }
    if ( isSupervisor && overdueManager > 0 ) {
        tasks.push( { type: "overdue-manager", count: overdueManager } );
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/competence && node --test test/task-resolver.test.js`
Expected: PASS.

---

### Task 8: `load-evaluations-oversight` loader

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` — add a `view === "load-evaluations-oversight"` branch in `processDataRequest` (mirroring the other `load-*` loaders) and the `#loadEvaluationsOversight( session )` handler (modeled on `#loadInterviewSchedule`).

**Interfaces:**
- Produces: GET `/app/load-evaluations-oversight` → `{ cycleID, evaluations: [ { evaluationID, employeeID, employeeName, roleFamilyName, stageLevel, status, selfDeadline, managerDeadline, selfOverdue, managerOverdue, hasBookedInterview, canAdvanceSelf, canCompleteManager, canWithdraw } ] }`. Consumed by the oversight component (Task 9).

- [ ] **Step 1: Add the data-request branch** — in `processDataRequest`, add alongside the other `load-*` views:
```js
        } else if ( view === "load-evaluations-oversight" ) {
            return this.#loadEvaluationsOversight( session );
```

- [ ] **Step 2: Add the handler** (near `#loadInterviewSchedule`)

```js
    #loadEvaluationsOversight( session ) {
        return new Promise( ( resolve, reject ) => {
            this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            const today = new Date().toISOString().split( "T" )[ 0 ];

            this.#resolveCurrentCycle().then( ( cycle ) => {
                if ( !cycle ) {
                    return resolve( { cycleID: null, evaluations: [] } );
                }
                return Promise.all( [
                    dataManager.instance.fetchEvaluations( null, false ),
                    dataManager.instance.fetchAllCalendarSlots( cycle.cycleID )
                ] ).then( ( [ allEvaluations, allSlots ] ) => {
                    const bookedByEvaluationID = new Set();
                    ( Array.isArray( allSlots ) ? allSlots : [] ).forEach( ( slot ) => {
                        if ( slot.status === configurationLoader.slotStatus.BOOKED && slot.booking?.evaluationID ) {
                            bookedByEvaluationID.add( slot.booking.evaluationID );
                        }
                    } );

                    const active = [
                        configurationLoader.evaluationStatus.OPEN,
                        configurationLoader.evaluationStatus.IN_REVIEW,
                        configurationLoader.evaluationStatus.READY
                    ];

                    const evaluations = allEvaluations
                        .filter( ( evaluation ) => evaluation.cycleID === cycle.cycleID && active.includes( evaluation.status ) )
                        .map( ( evaluation ) => {
                            const workflow = evaluation.workflow || {};
                            const selfDeadline = workflow.selfEvaluationDeadline || "";
                            const managerDeadline = workflow.managerEvaluationDeadline || "";
                            const selfOverdue = evaluation.status === configurationLoader.evaluationStatus.OPEN
                                && !workflow.selfEvaluationCompleted && !!selfDeadline && today > selfDeadline;
                            const managerOverdue = evaluation.status === configurationLoader.evaluationStatus.IN_REVIEW
                                && !workflow.managerEvaluationCompleted && !!managerDeadline && today > managerDeadline;
                            return {
                                evaluationID: evaluation.evaluationID,
                                shortID: evaluation.shortID,
                                employeeID: evaluation.employeeID,
                                employeeName: organizationManager.instance.resolveEmployeeName( evaluation.employeeID ) || evaluation.employeeID,
                                roleFamilyName: this.#formatRoleFamilyLabel( evaluation.roleFamily, evaluation.specialization, session?.language ),
                                stageLevel: evaluation.stageLevel || "",
                                status: evaluation.status,
                                selfDeadline: selfDeadline,
                                managerDeadline: managerDeadline,
                                selfOverdue: selfOverdue,
                                managerOverdue: managerOverdue,
                                hasBookedInterview: bookedByEvaluationID.has( evaluation.evaluationID ),
                                canAdvanceSelf: selfOverdue,
                                canCompleteManager: evaluation.status === configurationLoader.evaluationStatus.IN_REVIEW && !workflow.managerEvaluationCompleted,
                                canWithdraw: true
                            };
                        } );

                    resolve( { cycleID: cycle.cycleID, evaluations: evaluations } );
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
```

- [ ] **Step 3: Verify + commit Theme 3**

Run: `cd packages/competence && npm test && npm run test:json && npx eslint .`
Expected: green (loader has no unit harness; behavior verified in Task 9).

```bash
git add packages/competence/application/task-resolver.js packages/competence/bin/competence-web-application.js packages/competence/test/task-resolver.test.js
git commit -m "feat(competence): overdue-self/manager dashboard tasks + evaluations-oversight loader (CA-59)"
```

---

### Task 9: Evaluations Oversight screen (fragment + Alpine component + reason modal + registration)

**Files:**
- Create: `packages/competence/bin/static/fragments/frame-evaluations-oversight.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` (add `configureEvaluationsOversight` + register it near line 5778)
- Modify: `packages/competence/bin/competence-web-application.js` (`addFragment("evaluations-oversight", …)` + `sidebarNavMapping` entry)
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html` (Supervisor-only nav button)

**Interfaces:**
- Consumes: GET `/app/load-evaluations-oversight` (Task 8); POST `/app/advance-self-evaluation`, `/app/withdraw-evaluation` (Task 5); POST `/app/submit-evaluation` reuse for manager proxy is via the existing evaluation form (out of scope here — the oversight row's *Complete manager review* action navigates to the evaluation form).
- Produces: the `evaluations-oversight` route + sidebar entry (Supervisor-only).

- [ ] **Step 1: Register the fragment** — in `competence-web-application.js`, alongside the other SUPERVISOR-only `addFragment` calls (~line 82):
```js
        this.addFragment( "evaluations-oversight", {
            title: "Evaluations Oversight",
            path: "fragments/frame-evaluations-oversight.html",
            roles: [ SUPERVISOR ]
        } );
```
And add to `sidebarNavMapping` (~line 210): `"evaluations-oversight": "evaluations-oversight",`.

- [ ] **Step 2: Add the sidebar button** — in `component-sidebar.html`, inside the `hasRole(2) || hasRole(3)` "Manage" section, after the `cycles` button:
```html
            <button hx-get="/app/evaluations-oversight" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'evaluations-oversight'"
                    x-show="$store.tiApplication.hasRole(3)"
                    x-bind:class="{ active: active === 'evaluations-oversight' }" class="ti-sidebar-item" data-tip="Oversight" aria-label="Evaluations Oversight" type="button">
                <span class="ti-sidebar-item-icon">
                    <span class="ti-icon list-check md" aria-hidden="true"></span>
                </span>
                <span class="ti-sidebar-item-label" x-text-label="interface.oversight.nav">Oversight</span>
            </button>
```
> Use an existing `.ti-icon` variant (verify one such as `list-check` exists in `ti-framework.css`; otherwise pick any present icon, e.g. `cycles-loop`). Use `x-show` (not `x-if`) so HTMX wires `hx-*` before the role store resolves.

- [ ] **Step 3: Create the fragment** `frame-evaluations-oversight.html`

```html
<div class="ti-page" x-data="competenceEvaluationsOversight">

    <div class="ti-page-head">
        <div class="ti-page-eyebrow" x-text-label="interface.oversight.page-eyebrow"></div>
        <h1 class="ti-page-title" x-text-label="interface.oversight.page-title"></h1>
        <p class="ti-page-subtitle" x-text-label="interface.oversight.page-desc"></p>
    </div>

    <template x-if="evaluations.length === 0">
        <div class="ti-panel-body-intro" x-text-label="interface.oversight.empty"></div>
    </template>

    <template x-if="evaluations.length > 0">
        <div class="ti-data-grid">
            <template x-for="row in evaluations" x-bind:key="row.evaluationID">
                <div class="ti-data-row">
                    <div class="ti-avatar sm" x-bind:style="$store.tiToolbox.generateAvatarStyle( row.employeeID, row.employeeName )">
                        <span x-text="(row.employeeName || '?').charAt(0).toUpperCase()"></span>
                    </div>
                    <div>
                        <div class="ti-kv-value" x-text="row.employeeName"></div>
                        <div class="ti-kv-label" x-text="row.roleFamilyName + ' · ' + row.stageLevel"></div>
                    </div>
                    <div>
                        <div class="ti-kv-label" x-text-label="interface.oversight.status-label"></div>
                        <div class="ti-kv-value" x-text="row.status"></div>
                    </div>
                    <div>
                        <div class="ti-kv-label" x-text-label="interface.oversight.deadlines-label"></div>
                        <div class="ti-kv-value">
                            <span x-text="getLabel('interface.oversight.self-short') + ' ' + (row.selfDeadline || '—')"
                                  x-bind:class="{ 'ti-text-warn': row.selfOverdue }"></span>
                            <span> · </span>
                            <span x-text="getLabel('interface.oversight.manager-short') + ' ' + (row.managerDeadline || '—')"
                                  x-bind:class="{ 'ti-text-warn': row.managerOverdue }"></span>
                        </div>
                    </div>
                    <div class="ti-data-row-actions">
                        <button type="button" class="ti-btn sm ghost" x-show="row.canAdvanceSelf"
                                @click="openReasonModal('advance-self', row)"
                                x-text-label="interface.oversight.actions.advance-self"></button>
                        <button type="button" class="ti-btn sm ghost" x-show="row.canCompleteManager"
                                @click="openManagerReview(row)"
                                x-text-label="interface.oversight.actions.complete-manager"></button>
                        <button type="button" class="ti-btn sm ghost" x-show="row.canWithdraw"
                                @click="openReasonModal('withdraw', row)"
                                x-text-label="interface.oversight.actions.withdraw"></button>
                    </div>
                </div>
            </template>
        </div>
    </template>

    <!-- Reason-required confirmation modal (shared by advance-self and withdraw) -->
    <template x-if="reasonModal.open">
        <div class="ti-modal-backdrop" @click.self="dismissReasonModal()" @keydown.escape.window="dismissReasonModal()">
            <div class="ti-modal danger" role="dialog" aria-modal="true">
                <div class="ti-modal-head">
                    <div class="ti-modal-title" x-text="getLabel(reasonModal.action === 'withdraw' ? 'interface.oversight.reason.withdraw-title' : 'interface.oversight.reason.advance-title')"></div>
                    <button type="button" class="ti-modal-close" @click="dismissReasonModal()" aria-label="Close">
                        <span class="ti-icon close md" aria-hidden="true"></span>
                    </button>
                </div>
                <div class="ti-modal-body">
                    <p x-text="getLabel(reasonModal.action === 'withdraw' ? 'interface.oversight.reason.withdraw-body' : 'interface.oversight.reason.advance-body')"></p>
                    <p class="competence-outcome-close-emp" x-text="reasonModal.employeeName"></p>
                    <label class="ti-form-label" x-text-label="interface.oversight.reason.label"></label>
                    <textarea class="ti-form-input" rows="3" x-model="reasonModal.reason"
                              x-bind:placeholder="getLabel('interface.oversight.reason.placeholder')"></textarea>
                </div>
                <div class="ti-modal-foot">
                    <button type="button" class="ti-btn ghost" @click="dismissReasonModal()" x-bind:disabled="reasonModal.busy"
                            x-text-label="interface.oversight.reason.cancel"></button>
                    <button type="button" class="ti-btn primary" @click="confirmReason()"
                            x-bind:disabled="reasonModal.busy || reasonModal.reason.trim() === ''"
                            x-text-label="interface.oversight.reason.confirm"></button>
                </div>
            </div>
        </div>
    </template>
</div>
```

- [ ] **Step 4: Add the component** — in `competence-user-interface.js`, add the factory (near the other `configure*` components) and register it beside line 5778 (`Alpine.data( "competenceEvaluationsOversight", configureEvaluationsOversight );`):

```js
const configureEvaluationsOversight = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {
        cycleID: "",
        evaluations: [],
        reasonModal: { open: false, action: null, evaluationID: null, employeeName: "", reason: "", busy: false },

        init() {
            const onInitialized = () => { this.loadOversight(); };
            if ( tiApplication.isInitialized ) {
                onInitialized();
            } else {
                this.$watch( () => tiApplication.isInitialized, ( isInitialized ) => {
                    if ( isInitialized ) { onInitialized(); }
                } );
            }
        },

        loadOversight() {
            tiApplication.sendRequest( "/app/load-evaluations-oversight" ).then( ( result ) => {
                const data = ( result?.data && typeof result.data === "object" ) ? result.data : {};
                this.cycleID = data.cycleID || "";
                this.evaluations = Array.isArray( data.evaluations ) ? tiToolbox.structuredClone( data.evaluations ) : [];
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) { return; }
                tiApplication.notify( tiApplication.formatException( error ) );
                if ( error.exception?.httpCode === 401 ) { tiApplication.openScreen( "dashboard" ); }
            } );
        },

        openManagerReview( row ) {
            const params = new URLSearchParams();
            params.set( "employeeID", row.employeeID );
            params.set( "evaluationID", row.evaluationID );
            tiApplication.openScreen( "competence-evaluation?" + params.toString() );
        },

        openReasonModal( action, row ) {
            this.reasonModal = { open: true, action: action, evaluationID: row.evaluationID, employeeName: row.employeeName || "", reason: "", busy: false };
        },

        dismissReasonModal() {
            this.reasonModal = { open: false, action: null, evaluationID: null, employeeName: "", reason: "", busy: false };
        },

        confirmReason() {
            const reason = this.reasonModal.reason.trim();
            if ( !this.reasonModal.evaluationID || reason === "" ) { return; }
            const url = this.reasonModal.action === "withdraw" ? "/app/withdraw-evaluation" : "/app/advance-self-evaluation";
            const toast = this.reasonModal.action === "withdraw" ? "interface.oversight.withdrawn-toast" : "interface.oversight.advanced-toast";
            this.reasonModal.busy = true;
            tiApplication.sendRequest( url, "POST", { evaluationID: this.reasonModal.evaluationID, reason: reason } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( toast ) );
                this.dismissReasonModal();
                this.loadOversight();
            } ).catch( ( error ) => {
                this.dismissReasonModal();
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        getLabel( label ) {
            return tiApplication.getLabel( label );
        }
    };
};
```

- [ ] **Step 5: Verify in the browser** (per the project's preview/verify workflow)

Start the dev server, log in as a Supervisor, open **Evaluations Oversight** from the sidebar. Confirm: the active-cycle evaluations list renders; an overdue self row shows *Advance without self* → reason modal → confirm advances it (row refreshes); *Withdraw* → reason modal → confirm removes the row; *Complete manager review* navigates to the evaluation form. Check `read_console_messages` for errors and confirm no CSP violations (no inline-style/`?.` warnings).

---

### Task 10: Client dashboard tasks — `overdue-self` / `overdue-manager` cases + route

**Files:**
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` — add two `else if` cases in the `_buildTasks()` server-task loop (~line 2851) and an `"oversight"` route in `handleTaskClick` (~line 2866).

- [ ] **Step 1: Add the two task cases** (in `_buildTasks()`, after the `evaluation-closed` case)

```js
    } else if ( serverTask.type === "overdue-self" ) {
        tasks.push( {
            id: "overdue-self",
            tone: "warn",
            title: tiApplication.getLabel( "interface.dashboard.task-overdue-self", "Self-evaluations overdue" ) + " (" + serverTask.count + ")",
            sub: tiApplication.getLabel( "interface.dashboard.task-overdue-self-sub", "Past the self-evaluation deadline — review in Oversight." ),
            action: "oversight"
        } );
    } else if ( serverTask.type === "overdue-manager" ) {
        tasks.push( {
            id: "overdue-manager",
            tone: "warn",
            title: tiApplication.getLabel( "interface.dashboard.task-overdue-manager", "Manager reviews overdue" ) + " (" + serverTask.count + ")",
            sub: tiApplication.getLabel( "interface.dashboard.task-overdue-manager-sub", "Past the manager-review deadline — review in Oversight." ),
            action: "oversight"
        } );
    }
```

- [ ] **Step 2: Add the `oversight` route** — extend the `handleTaskClick` ternary so `action: "oversight"` routes to the new screen:

```js
        tiApplication.openScreen( task.action === "evaluation" ? "competence-evaluation" :
            task.action === "schedule" ? "interview-schedule" :
            task.action === "results" ? "my-results" :
            task.action === "oversight" ? "evaluations-oversight" : "employees-list" );
```

- [ ] **Step 3: Verify + commit Theme 4**

Run: `cd packages/competence && npx eslint .` (expected 0 errors), then browser-verify a Supervisor dashboard shows the overdue task chips (when overdue evals exist) and clicking one opens Evaluations Oversight.

```bash
git add packages/competence/bin/static/fragments/frame-evaluations-oversight.html packages/competence/bin/static/fragments/components/component-sidebar.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/competence-web-application.js
git commit -m "feat(competence): Evaluations Oversight screen + overdue dashboard tasks (CA-59)"
```

---

### Task 11: Localization (en + bg)

**Files:**
- Modify: `packages/competence/bin/localization/competence-labels.json`

- [ ] **Step 1: Add the `interface.oversight` section** (sibling of `interface.schedule`), every leaf `{ en, bg }`:

Keys: `nav`, `page-eyebrow`, `page-title`, `page-desc`, `empty`, `status-label`, `deadlines-label`, `self-short`, `manager-short`, `advanced-toast`, `withdrawn-toast`; nested `actions.{advance-self, complete-manager, withdraw}`; nested `reason.{advance-title, advance-body, withdraw-title, withdraw-body, label, placeholder, confirm, cancel}`. Example:
```json
    "oversight": {
      "nav": { "en": "Oversight", "bg": "Надзор" },
      "page-eyebrow": { "en": "EVALUATIONS OVERSIGHT", "bg": "НАДЗОР НА ОЦЕНКИТЕ" },
      "page-title": { "en": "Active Evaluations", "bg": "Активни оценки" },
      "page-desc": { "en": "Every in-progress evaluation for the active cycle. Advance a stalled self-evaluation, complete a manager review, or withdraw an evaluation.", "bg": "Всички текущи оценки за активния цикъл. Придвижете блокирала самооценка, попълнете мениджърска оценка или оттеглете оценка." },
      "empty": { "en": "No active evaluations in the current cycle.", "bg": "Няма активни оценки в текущия цикъл." },
      "status-label": { "en": "Status", "bg": "Статус" },
      "deadlines-label": { "en": "Deadlines", "bg": "Крайни срокове" },
      "self-short": { "en": "Self:", "bg": "Само:" },
      "manager-short": { "en": "Mgr:", "bg": "Мен:" },
      "advanced-toast": { "en": "Self-evaluation waived; the evaluation advanced.", "bg": "Самооценката е отменена; оценката е придвижена." },
      "withdrawn-toast": { "en": "Evaluation withdrawn.", "bg": "Оценката е оттеглена." },
      "actions": {
        "advance-self": { "en": "Advance without self", "bg": "Придвижи без самооценка" },
        "complete-manager": { "en": "Complete manager review", "bg": "Попълни мениджърска оценка" },
        "withdraw": { "en": "Withdraw", "bg": "Оттегли" }
      },
      "reason": {
        "advance-title": { "en": "Advance without self-evaluation", "bg": "Придвижване без самооценка" },
        "advance-body": { "en": "This waives the employee's self-assessment and advances the evaluation. A reason is required and recorded on the audit trail.", "bg": "Това отменя самооценката на служителя и придвижва оценката. Изисква се причина, която се записва в одитната следа." },
        "withdraw-title": { "en": "Withdraw evaluation", "bg": "Оттегляне на оценка" },
        "withdraw-body": { "en": "This permanently withdraws the evaluation and releases any booked interview. It cannot be undone. A reason is required.", "bg": "Това оттегля оценката за постоянно и освобождава резервирано интервю. Действието е необратимо. Изисква се причина." },
        "label": { "en": "Reason", "bg": "Причина" },
        "placeholder": { "en": "Why is this action being taken?", "bg": "Защо се предприема това действие?" },
        "confirm": { "en": "Confirm", "bg": "Потвърди" },
        "cancel": { "en": "Cancel", "bg": "Отказ" }
      }
    },
```

- [ ] **Step 2: Add the dashboard task labels** (flat under `interface.dashboard`): `task-overdue-self`, `task-overdue-self-sub`, `task-overdue-manager`, `task-overdue-manager-sub` — each `{ en, bg }`.

- [ ] **Step 3: Add the error keys** (flat under `error.evaluation`): `self-finalize-not-open`, `self-finalize-deadline-not-reached`, `self-finalize-already-complete`, `withdraw-not-active`, `reason-required` — each `{ en, bg }`. Example:
```json
      "reason-required": { "en": "A reason is required for this action.", "bg": "За това действие е необходима причина." },
      "withdraw-not-active": { "en": "Only an active evaluation (Open, In Review, or Ready) can be withdrawn.", "bg": "Само активна оценка (Отворена, В преглед или Готова) може да бъде оттеглена." },
```

- [ ] **Step 4: Verify + commit Theme 5**

Run: `cd packages/competence && npm run test:json && node --test test/json-config-validation.test.js` (expected: labels JSON stays valid), then `npx eslint .`.

```bash
git add packages/competence/bin/localization/competence-labels.json
git commit -m "feat(competence): oversight + overdue-task + stall-recovery error labels, en/bg (CA-59)"
```

---

### Task 12: Docs + version bump

**Files:**
- Modify: `packages/competence/README.md`, `packages/competence/CHANGELOG.md`, `packages/competence/package.json`, `packages/competence/design/deadline-governance.md` (implementation log)

- [ ] **Step 1: README** — apply the §11 updates from the design doc:
  - Status-lifecycle note (`README.md:171`): change *"Automatic deadline-based transitions are planned for a future release."* to describe the shipped behavior — self/manager deadlines are populated; the self round is deadline-enforced with a Supervisor waive; the manager deadline is a nudge/target with a Supervisor proxy; overdue stages surface as dashboard tasks; no time-based auto-advance.
  - Add an **Evaluations Oversight** screen entry under *Implemented Screens*.
  - Current Status list: add deadline governance + manual stall recovery (advance-self, manager proxy, withdraw) bullets.
  - Scoring Algorithm: add a note that category/final scores renormalize to the participating sources (so a missing source no longer depresses the score); update the "Reference Score Points" note to say the reference holds for whichever sources participated.

- [ ] **Step 2: CHANGELOG** — add `## Version 3.12.0` with `feat(competence)` bullets summarizing the deadline population, scoring renormalization, self-waive + manager-proxy + withdraw recovery, overdue tasks, and the Oversight screen; cite `design/deadline-governance.md` (CA-59).

- [ ] **Step 3: package.json** — bump `"version"` `3.11.1` → `3.12.0`.

- [ ] **Step 4: Design doc implementation log** — append a dated entry to `design/deadline-governance.md` (commits, verification: `npm test` / `npm run test:json` / `npx eslint .` counts).

- [ ] **Step 5: Final verification + commit Theme 6**

Run: `cd packages/competence && npm test && npm run test:json && npx eslint .`
Expected: all green.

```bash
git add packages/competence/README.md packages/competence/CHANGELOG.md packages/competence/package.json packages/competence/design/deadline-governance.md
git commit -m "docs(competence): document deadline governance + stall recovery; bump to 3.12.0 (CA-59)"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:** deadlines populated (T1), scoring renormalization incl. no-team + waived-self (T2), self-waive escape (T3), withdraw→DELETED + slot release (T4), Supervisor services (T5), manager proxy + reason + no-block (T6), overdue tasks (T7), oversight loader (T8), oversight screen + reason modal (T9), client task cases + route (T10), labels/errors (T11), docs/version (T12). Every design-doc section maps to a task.

**Type/name consistency:** `finalizeSelfEvaluation` / `withdrawEvaluation` (framework) ↔ `#advanceSelfEvaluation` / `#withdrawEvaluation` (handlers) ↔ services `advance-self-evaluation` / `withdraw-evaluation` ↔ component `openReasonModal('advance-self'|'withdraw')`. Task types `overdue-self` / `overdue-manager` consistent across resolver (T7) and client (T10). Loader field names (`canAdvanceSelf`, `canCompleteManager`, `canWithdraw`, `selfOverdue`, `managerOverdue`) consistent between T8 and T9. Route `evaluations-oversight` consistent across `addFragment`, `sidebarNavMapping`, sidebar button, and `handleTaskClick`.

**Verification honesty:** Tasks 5, 6, 8, 9, 10 have no unit harness (no HTTP/DOM test infra in the repo — matches the [[interview-closure]] precedent); they are verified via `npm test` (no regression), `npx eslint .`, and browser preview. The correctness-critical logic (framework methods, scoring, task derivation) is fully unit-tested in Tasks 1–4 and 7.

**Open follow-ups (out of scope, per design §12):** scheduler/auto-advance, notification channel, reopen/undo, audit-trail UI (CA-56), dedicated deadline config.
