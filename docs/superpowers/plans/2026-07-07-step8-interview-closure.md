# Step 8 — Interview Meeting and Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the final appraisal step — recording the interview meeting outcome (feedback, next-period goals, optional PIP) on a `Ready` evaluation and the Supervisor's formal, irreversible closure (`Ready → Closed`) — plus its dashboard tasks, post-closure Scores view, and the cycle-close warning.

**Architecture:** A new nested `closure` object on the `Evaluation` record holds the Step-8 data. Two new framework methods (`recordInterviewOutcome`, `closeEvaluation`) carry the pure validation/mutation and the audited close transition. Two new web services expose them with a per-evaluation write authorization (conducting manager ∪ org superior ∪ Supervisor for the outcome; Supervisor-only for closure). The Interview Schedule screen becomes the interviews hub; the Scores screen renders the closure artifacts once closed; the pure `task-resolver` gains the close-pending and evaluation-closed tasks.

**Tech Stack:** Node.js ≥ 20 (CommonJS), RedisJSON via `@ti-engine/core` cache, Express + HTMX + Alpine.js (CSP build) from `@ti-engine/web-framework`, `node --test`, ajv for JSON-schema validation.

## Global Constraints

- CommonJS only (`require`/`module.exports`); internal imports use the `#alias` map (e.g. `#configuration-loader`, `#competence-framework`, `#data-manager`, `#task-resolver`), cross-package via `@ti-engine/*` exports.
- Enum values are the **first element of the seed array, not the key**: `EvaluationStatus.READY === "Ready"`, `CLOSED === "Closed"`, `SlotStatus.BOOKED === "booked"`. Backend routes through `configurationLoader.evaluationStatus.*`; **any hand-written string comparison (front-end especially) must use the value `"Closed"`, never the key `"CLOSED"`.**
- Alpine runs in **CSP mode**: no inline `style="…"` attributes (use CSS classes / `x-bind:style` with the shared helpers or a `--var` object), and **no optional chaining (`?.`) inside in-DOM Alpine expressions** (use `&&`/`||` and component helper methods). `?.` is fine in the component `.js`.
- `config`/settings are deep-frozen after load — never mutate them in place. Read settings via `configurationLoader.getSetting( "path", default )`.
- `saveEvaluation` persists via RedisJSON `JSON.MERGE` (RFC 7396): arrays replace wholesale, object keys deep-merge, a `null` value **deletes** that key. Always pass the full mutated evaluation object.
- Every source file starts with the GPL header block (copy it verbatim from any sibling file).
- Conventional Commits scoped to the package; put `(CA-78)` in every commit message. End each commit message body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never commit `.run/*.run.xml`.
- Test runner is `node --test` from `packages/competence` (`npm test`); JSON schemas validated by `npm run test:json`. Both must stay green.
- All user-visible strings live in `bin/localization/competence-labels.json` as `{ "en": "...", "bg": "..." }` leaves; the server ships error i18n **keys** in the exception `details`, translated client-side.

---

### Task 1: Data model — `closure` on the Evaluation record

**Files:**
- Modify: `packages/competence/application/data-objects.types.js` (add typedefs near line 181; extend `Evaluation` typedef at line 207)
- Modify: `packages/competence/bin/data/schemas/evaluation.schema.json` (add `closure` property after the `feedback` block ending at line 144)
- Modify: `packages/competence/application/competence-framework.js` (`createNewEvaluation`, add `closure` init after the `feedback` block at line 423)
- Test: `packages/competence/test/competence-framework.closure.test.js` (new — created here, extended in Task 2)

**Interfaces:**
- Produces: the `evaluation.closure` shape `{ feedback: string, goals: Array<{ text: string, targetDate: string|null }>, pip: { required: boolean, plan: string }, closedAt: string|null, closedBy: string|null }`, initialized on every new evaluation by `createNewEvaluation`.

- [ ] **Step 1: Write the failing test**

Create `packages/competence/test/competence-framework.closure.test.js` (copy the GPL header from `test/competence-framework.finalize.test.js`):

```javascript
/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const competenceFramework = require( "#competence-framework" );

const employee = {
    employeeID: "emp-1",
    career: { roleFamily: "SE", specialization: null, level: "S", stage: "2" }
};
const cycle = { cycleID: "2026-H2", cycleDate: "2026-11-30", teamFeedbackDeadline: "2026-11-16" };
const snapshot = [ { code: "E1-1" }, { code: "I2-1" } ];

describe( "CompetenceFramework — createNewEvaluation closure defaults", () => {

    it( "initializes an empty closure block on a new evaluation", () => {
        const evaluation = competenceFramework.instance.createNewEvaluation( employee, cycle, snapshot );
        assert.deepEqual( evaluation.closure, {
            feedback: "",
            goals: [],
            pip: { required: false, plan: "" },
            closedAt: null,
            closedBy: null
        } );
    } );

} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/competence && node --test test/competence-framework.closure.test.js`
Expected: FAIL — `evaluation.closure` is `undefined`, deepEqual mismatch.

- [ ] **Step 3: Add the `closure` initializer to `createNewEvaluation`**

In `packages/competence/application/competence-framework.js`, inside the object returned by `createNewEvaluation`, add the `closure` block immediately after the `feedback: { … }` block (after line 423, before `workflow: {`):

```javascript
            feedback: {
                managerComment: "",
                teamComments: []
            },
            closure: {
                feedback: "",
                goals: [],
                pip: { required: false, plan: "" },
                closedAt: null,
                closedBy: null
            },
            workflow: {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/competence && node --test test/competence-framework.closure.test.js`
Expected: PASS.

- [ ] **Step 5: Add the JSON schema property**

In `packages/competence/bin/data/schemas/evaluation.schema.json`, add a `closure` property object immediately after the `feedback` property block (the block that closes at line 144, before the `workflow` property at line 145). `closure` stays **optional** (do not add it to the top-level `required` array):

```json
    "closure": {
      "type": "object",
      "description": "Step 8 interview meeting outcome and formal-closure metadata. Absent on evaluations created before the feature; initialized on first write.",
      "additionalProperties": false,
      "properties": {
        "feedback": {
          "type": "string",
          "description": "Written interview feedback recorded at the meeting."
        },
        "goals": {
          "type": "array",
          "description": "Next-period goals set at the interview (capped by performanceAppraisals.numberOfNextPeriodGoals).",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [ "text" ],
            "properties": {
              "text": { "type": "string", "minLength": 1 },
              "targetDate": { "type": [ "string", "null" ], "format": "date" }
            }
          }
        },
        "pip": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "required": { "type": "boolean" },
            "plan": { "type": "string" }
          }
        },
        "closedAt": {
          "type": [ "string", "null" ],
          "description": "ISO-8601 timestamp of formal closure; null until closed."
        },
        "closedBy": {
          "type": [ "string", "null" ],
          "description": "Employee ID of the Supervisor who closed the evaluation; null until closed."
        }
      }
    },
```

- [ ] **Step 6: Add the JSDoc typedefs**

In `packages/competence/application/data-objects.types.js`, add these two typedefs immediately after the `EvaluationFeedback` typedef (after line 181):

```javascript
/**
 * @typedef {Object} EvaluationGoal
 * @property {string} text - The goal statement.
 * @property {string|null} [targetDate] - Optional target date (YYYY-MM-DD).
 */

/**
 * @typedef {Object} EvaluationClosure
 * @property {string} [feedback] - Written interview feedback recorded at the Step-8 meeting.
 * @property {EvaluationGoal[]} [goals] - Next-period goals set at the interview.
 * @property {{ required: boolean, plan: string }} [pip] - Optional Performance Improvement Plan.
 * @property {string|null} [closedAt] - ISO-8601 timestamp of formal closure; null until closed.
 * @property {string|null} [closedBy] - Employee ID of the Supervisor who closed the evaluation.
 */
```

Then add the `closure` property line to the `Evaluation` typedef, immediately after the `feedback` property (line 207):

```javascript
 * @property {EvaluationFeedback} [feedback] - Feedback attached to the evaluation.
 * @property {EvaluationClosure} [closure] - Step 8 interview outcome and closure metadata.
 * @property {EvaluationWorkflow} [workflow] - System workflow state for the evaluation.
```

- [ ] **Step 7: Verify schemas still validate**

Run: `cd packages/competence && npm run test:json`
Expected: PASS (all schema self-validation and seed validation green; `closure` is optional so empty seeds are unaffected).

- [ ] **Step 8: Commit**

```bash
git add packages/competence/application/data-objects.types.js packages/competence/bin/data/schemas/evaluation.schema.json packages/competence/application/competence-framework.js packages/competence/test/competence-framework.closure.test.js
git commit -m "feat(competence): add evaluation closure data model for Step 8 (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Framework — `recordInterviewOutcome` + `closeEvaluation`

**Files:**
- Modify: `packages/competence/application/competence-framework.js` (add two methods after `finalizeTeamFeedback`, which ends at line 379)
- Test: `packages/competence/test/competence-framework.closure.test.js` (extend)

**Interfaces:**
- Consumes: `evaluation.closure` shape (Task 1); `dataManager.instance.{fetchEvaluation, saveEvaluation, appendAuditEntry}`; `configurationLoader.{evaluationStatus, getSetting}`; `exceptions`.
- Produces:
  - `recordInterviewOutcome( evaluation, outcome )` → mutates and returns the evaluation; `outcome` is `{ feedback?: string, goals?: Array<{text, targetDate?}>, pip?: { required?, plan? } }`. Never touches `status`/`closedAt`/`closedBy`. Throws `E_APP_SERVICE_ERROR` (422) on a non-Ready status, too-many-goals, or an empty-text goal.
  - `closeEvaluation( evaluationID, actorID )` → `Promise<Evaluation>`; validates preconditions, sets `status = "Closed"` + `closure.closedAt`/`closedBy`, saves, writes an evaluation-scoped audit entry.

- [ ] **Step 1: Write the failing tests**

Append to `packages/competence/test/competence-framework.closure.test.js`. First extend the imports at the top of the file to add the in-memory cache + dataManager (change the header import section to match `competence-framework.finalize.test.js`):

```javascript
const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let competenceFramework;
let dataManager;
let configurationLoader;

beforeEach( async () => {
    installInMemoryCache();
    configurationLoader = require( "#configuration-loader" );
    dataManager = require( "#data-manager" );
    competenceFramework = require( "#competence-framework" );
    process.env.COMPETENCE_PRELOAD_DATA = "true";
    await dataManager.instance.initialize();
} );

// Persists a READY evaluation with a booked interview date, overridable per field.
async function saveReadyEvaluation( over = {} ) {
    const evaluation = {
        evaluationID: over.evaluationID || "eval-1",
        employeeID: over.employeeID || "emp-1",
        cycleID: "2026-H2",
        cycleDate: "2026-11-30",
        status: over.status || configurationLoader.evaluationStatus.READY,
        roleFamily: "SE",
        stageLevel: "S2",
        snapshot: [ { code: "E1-1" } ],
        grades: { "E1-1": { employee: "R", manager: "R", team: { cumulative: "R", individual: [ "R" ] } } },
        interviewDate: ( over.interviewDate !== undefined ) ? over.interviewDate : "2000-01-01",
        closure: ( over.closure !== undefined ) ? over.closure : { feedback: "", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null }
    };
    await dataManager.instance.saveEvaluation( evaluation );
    return evaluation;
}
```

> Note: the existing `describe("CompetenceFramework — createNewEvaluation closure defaults")` block from Task 1 continues to work — `createNewEvaluation` needs no cache, and `beforeEach` initializing the cache is harmless for it.

Then append these describes to the end of the file:

```javascript
describe( "CompetenceFramework — recordInterviewOutcome", () => {

    it( "records feedback, goals, and pip on a READY evaluation", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, closure: { feedback: "", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } };
        const result = competenceFramework.instance.recordInterviewOutcome( evaluation, {
            feedback: "Strong half.",
            goals: [ { text: "Lead a project", targetDate: "2027-06-30" }, { text: "Mentor a junior" } ],
            pip: { required: false, plan: "" }
        } );
        assert.equal( result.closure.feedback, "Strong half." );
        assert.equal( result.closure.goals.length, 2 );
        assert.deepEqual( result.closure.goals[ 1 ], { text: "Mentor a junior", targetDate: null } );
        assert.deepEqual( result.closure.pip, { required: false, plan: "" } );
        assert.equal( result.status, configurationLoader.evaluationStatus.READY, "status is untouched" );
    } );

    it( "rejects when the evaluation is not READY", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.IN_REVIEW, closure: {} };
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { feedback: "x" } ),
            ( err ) => ( err?.data?.details === "error.evaluation.outcome-not-ready" ) );
    } );

    it( "rejects more goals than the configured maximum", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, closure: {} };
        const goals = Array.from( { length: 6 }, ( _v, i ) => ( { text: "g" + i } ) );
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { goals } ),
            ( err ) => ( err?.data?.details === "error.evaluation.too-many-goals" ) );
    } );

    it( "rejects a goal with empty text", () => {
        const evaluation = { status: configurationLoader.evaluationStatus.READY, closure: {} };
        assert.throws( () => competenceFramework.instance.recordInterviewOutcome( evaluation, { goals: [ { text: "  " } ] } ),
            ( err ) => ( err?.data?.details === "error.evaluation.invalid-goal" ) );
    } );

} );

describe( "CompetenceFramework — closeEvaluation", () => {

    it( "closes a READY evaluation with a past interview and a recorded outcome", async () => {
        await saveReadyEvaluation( { interviewDate: "2000-01-01", closure: { feedback: "Good.", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        const closed = await competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" );
        assert.equal( closed.status, configurationLoader.evaluationStatus.CLOSED );
        assert.ok( closed.closure.closedAt, "closedAt must be set" );
        assert.equal( closed.closure.closedBy, "sup-1" );

        const fetched = await dataManager.instance.fetchEvaluation( "eval-1" );
        assert.equal( fetched.status, configurationLoader.evaluationStatus.CLOSED );

        const audit = await dataManager.instance.getAuditEntriesForEvaluation( "eval-1" );
        assert.ok( audit.some( ( e ) => e.field === "status" && e.newValue === configurationLoader.evaluationStatus.CLOSED ), "an audit entry records the close" );
    } );

    it( "rejects closing when status is not READY", async () => {
        await saveReadyEvaluation( { status: configurationLoader.evaluationStatus.IN_REVIEW } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-not-ready" ) );
    } );

    it( "rejects closing when no interview is booked", async () => {
        await saveReadyEvaluation( { interviewDate: null, closure: { feedback: "Good.", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-no-interview" ) );
    } );

    it( "rejects closing when the interview date is still in the future", async () => {
        await saveReadyEvaluation( { interviewDate: "2999-12-31", closure: { feedback: "Good.", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-interview-not-held" ) );
    } );

    it( "rejects closing when no outcome has been recorded", async () => {
        await saveReadyEvaluation( { interviewDate: "2000-01-01", closure: { feedback: "  ", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null } } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-no-outcome" ) );
    } );

    it( "rejects re-closing an already Closed evaluation", async () => {
        await saveReadyEvaluation( { status: configurationLoader.evaluationStatus.CLOSED, interviewDate: "2000-01-01" } );
        await assert.rejects( () => competenceFramework.instance.closeEvaluation( "eval-1", "sup-1" ),
            ( err ) => ( err?.data?.details === "error.evaluation.close-not-ready" ) );
    } );

} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/competence && node --test test/competence-framework.closure.test.js`
Expected: FAIL — `recordInterviewOutcome`/`closeEvaluation` are not functions.

- [ ] **Step 3: Implement the two methods**

In `packages/competence/application/competence-framework.js`, add both methods immediately after the closing brace of `finalizeTeamFeedback` (line 379), before `createNewEvaluation`:

```javascript
    /**
     * Records the Step-8 interview meeting outcome (written feedback, next-period goals, optional PIP) onto a READY
     * evaluation. Pure mutator — does NOT change status or set closedAt/closedBy (that is `closeEvaluation`). Authorization
     * is enforced by the caller.
     * <br/>NOTE: This method mutates the passed Evaluation object!
     *
     * @method
     * @param {Evaluation} evaluation
     * @param {{ feedback?: string, goals?: Array<{ text: string, targetDate?: string|null }>, pip?: { required?: boolean, plan?: string } }} outcome
     * @returns {Evaluation}
     * @public
     */
    recordInterviewOutcome( evaluation, outcome ) {
        if ( !evaluation || evaluation.status !== configurationLoader.evaluationStatus.READY ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.outcome-not-ready" }, exceptions.httpCode.C_422 );
        }
        const maxGoals = configurationLoader.getSetting( "performanceAppraisals.numberOfNextPeriodGoals", 5 );
        const src = outcome || {};
        const goalsInput = Array.isArray( src.goals ) ? src.goals : [];
        if ( goalsInput.length > maxGoals ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.too-many-goals" }, exceptions.httpCode.C_422 );
        }
        const goals = goalsInput.map( ( goal ) => {
            const text = ( goal && typeof goal.text === "string" ) ? goal.text.trim() : "";
            if ( text === "" ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.invalid-goal" }, exceptions.httpCode.C_422 );
            }
            const targetDate = ( goal && typeof goal.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test( goal.targetDate ) ) ? goal.targetDate : null;
            return { text: text, targetDate: targetDate };
        } );
        const pipInput = ( src.pip && typeof src.pip === "object" ) ? src.pip : {};
        const existing = ( evaluation.closure && typeof evaluation.closure === "object" ) ? evaluation.closure : {};
        evaluation.closure = {
            feedback: ( typeof src.feedback === "string" ) ? src.feedback : "",
            goals: goals,
            pip: { required: pipInput.required === true, plan: ( typeof pipInput.plan === "string" ) ? pipInput.plan : "" },
            closedAt: existing.closedAt || null,
            closedBy: existing.closedBy || null
        };
        return evaluation;
    }

    /**
     * Formally closes a READY evaluation (READY → CLOSED), irreversibly. Preconditions: the interview must be booked and
     * its date in the past, and an outcome (feedback or at least one goal) must be recorded. Stamps closedAt/closedBy and
     * writes one evaluation-scoped audit entry. Authorization (Supervisor-only) is enforced by the caller.
     *
     * @method
     * @param {string} evaluationID
     * @param {string} actorID - Employee ID of the Supervisor performing the close (audit `changedBy`).
     * @returns {Promise<Evaluation>}
     * @public
     */
    closeEvaluation( evaluationID, actorID ) {
        return dataManager.instance.fetchEvaluation( evaluationID ).then( ( evaluation ) => {
            const today = new Date().toISOString().split( "T" )[ 0 ];

            if ( evaluation.status !== configurationLoader.evaluationStatus.READY ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.close-not-ready" }, exceptions.httpCode.C_422 );
            }
            const interviewDate = evaluation.interviewDate || "";
            if ( interviewDate === "" ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.close-no-interview" }, exceptions.httpCode.C_422 );
            }
            if ( interviewDate > today ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.close-interview-not-held" }, exceptions.httpCode.C_422 );
            }
            const closure = ( evaluation.closure && typeof evaluation.closure === "object" ) ? evaluation.closure : {};
            const hasFeedback = ( typeof closure.feedback === "string" && closure.feedback.trim() !== "" );
            const hasGoals = ( Array.isArray( closure.goals ) && closure.goals.length > 0 );
            if ( !hasFeedback && !hasGoals ) {
                throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.evaluation.close-no-outcome" }, exceptions.httpCode.C_422 );
            }

            evaluation.status = configurationLoader.evaluationStatus.CLOSED;
            evaluation.closure = {
                feedback: ( typeof closure.feedback === "string" ) ? closure.feedback : "",
                goals: Array.isArray( closure.goals ) ? closure.goals : [],
                pip: ( closure.pip && typeof closure.pip === "object" )
                    ? { required: closure.pip.required === true, plan: ( typeof closure.pip.plan === "string" ) ? closure.pip.plan : "" }
                    : { required: false, plan: "" },
                closedAt: new Date().toISOString(),
                closedBy: actorID
            };

            return dataManager.instance.saveEvaluation( evaluation ).then( ( saved ) => {
                return dataManager.instance.appendAuditEntry( {
                    subjectType: "evaluation",
                    subjectID: evaluationID,
                    changedBy: actorID,
                    field: "status",
                    oldValue: configurationLoader.evaluationStatus.READY,
                    newValue: configurationLoader.evaluationStatus.CLOSED,
                    reason: "Evaluation formally closed after the interview meeting."
                } ).then( () => saved );
            } );
        } );
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/competence && node --test test/competence-framework.closure.test.js`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add packages/competence/application/competence-framework.js packages/competence/test/competence-framework.closure.test.js
git commit -m "feat(competence): add recordInterviewOutcome and closeEvaluation framework methods (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Task resolver — close-pending + evaluation-closed tasks

**Files:**
- Modify: `packages/competence/application/task-resolver.js`
- Test: `packages/competence/test/task-resolver.test.js` (extend; add a `closure` override to the `evaluation()` builder)

**Interfaces:**
- Consumes: `evaluation.status` (`"Ready"`, `"Closed"`), `evaluation.interviewDate`, `evaluation.closure.closedAt`, `ctx.{isSupervisor, today}`.
- Produces (new task objects returned by `resolveTasks`):
  - `{ type: "interview-close", count: number }` — Supervisor aggregate of READY evaluations whose interview date has passed.
  - `{ type: "evaluation-closed", evaluationID: string, closedAt: string }` — evaluee-only, for closures within the last 14 days.
  - Behavior change: `interview-scheduled` (self + manager) now only emitted while `interviewDate >= today`.

- [ ] **Step 1: Write the failing tests**

In `packages/competence/test/task-resolver.test.js`, first extend the `evaluation()` builder (lines 19-31) so tests can set `status`/`closure`:

```javascript
function evaluation( over = {} ) {
    return {
        evaluationID: over.evaluationID || "e1",
        employeeID: over.employeeID || "emp1",
        status: over.status || "Open",
        interviewDate: ( over.interviewDate !== undefined ) ? over.interviewDate : null,
        closure: ( over.closure !== undefined ) ? over.closure : null,
        workflow: {
            team: over.team || [],
            teamEvaluationDeadline: ( over.deadline !== undefined ) ? over.deadline : "2026-07-15",
            teamEvaluationsSubmitted: over.submitted || 0
        }
    };
}
```

Then append these describes to the end of the file:

```javascript
describe( "TaskResolver — interview-close (supervisor aggregate)", () => {

    it( "emits an interview-close aggregate for READY evals whose interview date has passed", () => {
        const evaluations = [
            evaluation( { evaluationID: "a", status: "Ready", interviewDate: "2026-07-05" } ),
            evaluation( { evaluationID: "b", status: "Ready", interviewDate: "2026-07-08" } ),
            evaluation( { evaluationID: "c", status: "Ready", interviewDate: "2026-07-20" } )   // still future — not counted
        ];
        const tasks = taskResolver.instance.resolveTasks( "sup1", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        const close = tasks.find( ( t ) => t.type === "interview-close" );
        assert.deepEqual( close, { type: "interview-close", count: 2 } );
    } );

    it( "does NOT emit interview-close for a non-supervisor", () => {
        const evaluations = [ evaluation( { status: "Ready", interviewDate: "2026-07-05" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "mgr1", ctx( { isSupervisor: false, today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-close" ), false );
    } );

    it( "suppresses the interview-scheduled self notice once the interview date has passed", () => {
        const evaluations = [ evaluation( { status: "Ready", employeeID: "emp1", interviewDate: "2026-07-05" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "interview-scheduled" ), false );
    } );

    it( "still emits the interview-scheduled self notice while the interview is upcoming", () => {
        const evaluations = [ evaluation( { status: "Ready", employeeID: "emp1", interviewDate: "2026-07-20" } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.ok( tasks.find( ( t ) => t.type === "interview-scheduled" && t.audience === "self" ) );
    } );

} );

describe( "TaskResolver — evaluation-closed (evaluee notice)", () => {

    it( "emits an evaluation-closed notice to the evaluee within the 14-day window", () => {
        const evaluations = [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-07-06T09:00:00.000Z" } } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.deepEqual( tasks.find( ( t ) => t.type === "evaluation-closed" ), { type: "evaluation-closed", evaluationID: "e1", closedAt: "2026-07-06T09:00:00.000Z" } );
    } );

    it( "does NOT emit the notice after the 14-day window", () => {
        const evaluations = [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-06-01T09:00:00.000Z" } } ) ];
        const tasks = taskResolver.instance.resolveTasks( "emp1", ctx( { today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "evaluation-closed" ), false );
    } );

    it( "does NOT emit the notice to anyone other than the evaluee", () => {
        const evaluations = [ evaluation( { status: "Closed", employeeID: "emp1", closure: { closedAt: "2026-07-06T09:00:00.000Z" } } ) ];
        const tasks = taskResolver.instance.resolveTasks( "sup1", ctx( { isSupervisor: true, today: "2026-07-10" } ), evaluations );
        assert.equal( tasks.some( ( t ) => t.type === "evaluation-closed" ), false );
    } );

} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/competence && node --test test/task-resolver.test.js`
Expected: FAIL — no `interview-close`/`evaluation-closed` tasks produced; the suppression test fails (self notice still emitted for a past date).

- [ ] **Step 3: Implement the resolver changes**

In `packages/competence/application/task-resolver.js`:

(a) Add typedefs after the `InterviewScheduledTask` typedef (line 61):

```javascript
/**
 * @typedef {Object} InterviewCloseTask
 * @property {"interview-close"} type
 * @property {number} count - READY evaluations whose interview date has passed and that still await formal closure.
 *           Emitted once, for Supervisors only (the sole role that can close), as a single aggregate.
 */

/**
 * @typedef {Object} EvaluationClosedTask
 * @property {"evaluation-closed"} type
 * @property {string} evaluationID
 * @property {string} closedAt - ISO-8601 timestamp of closure (the evaluee is notified for a short window afterwards).
 */
```

(b) Extend the `@returns` union on `resolveTasks` (line 99):

```javascript
     * @returns {Array<TeamFeedbackTask|TeamFinalizeTask|InterviewScheduleTask|InterviewScheduledTask|InterviewCloseTask|EvaluationClosedTask>}
```

(c) Add the window constant and the second accumulator. Immediately after `let interviewsAwaitingScheduling = 0;` (line 117) add:

```javascript
        // A Supervisor also gets a single aggregate "awaiting closure" task for interviews already held (date passed).
        let interviewsHeldAwaitingClosure = 0;
        // The evaluatee is notified their evaluation closed for a short window after closure, then it drops off.
        const CLOSED_NOTICE_WINDOW_DAYS = 14;
```

(d) Replace the scheduled-notice `else` block (lines 171-193) so the notices only fire while the interview is upcoming, and the held interviews feed the closure aggregate:

```javascript
                } else {
                    // Scheduled and still upcoming: inform the evaluatee and the conducting manager (slot owner). Once the
                    // interview date has passed these notices are stale, so they stop and the Supervisor's close-pending
                    // aggregate below takes over.
                    if ( interviewDate >= today ) {
                        if ( evaluation.employeeID === userID ) {
                            tasks.push( {
                                type: "interview-scheduled",
                                audience: "self",
                                evaluationID: evaluation.evaluationID,
                                interviewDate: interviewDate
                            } );
                        }
                        if ( evaluation.employeeID !== userID && isInterviewManager( evaluation.evaluationID ) ) {
                            tasks.push( {
                                type: "interview-scheduled",
                                audience: "manager",
                                evaluationID: evaluation.evaluationID,
                                employeeID: evaluation.employeeID,
                                employeeName: resolveName( evaluation.employeeID ),
                                interviewDate: interviewDate
                            } );
                        }
                    }
                    // Held (date reached/passed): a Supervisor is prompted to close it.
                    if ( isSupervisor && today !== "" && interviewDate <= today ) {
                        interviewsHeldAwaitingClosure++;
                    }
                }
```

(e) Add the `Closed` branch. Immediately after the `if ( evaluation.status === configurationLoader.evaluationStatus.READY ) { … }` block closes (after line 194, before the loop's closing brace at 195) add:

```javascript
            // A freshly closed evaluation notifies its evaluatee that results/feedback/goals are available — for a short
            // window only, after which the passive Scores screen carries it.
            if ( evaluation.status === configurationLoader.evaluationStatus.CLOSED ) {
                const closure = evaluation.closure || {};
                const closedAtDate = ( typeof closure.closedAt === "string" ) ? closure.closedAt.slice( 0, 10 ) : "";
                if ( evaluation.employeeID === userID && closedAtDate !== "" && today !== "" ) {
                    const daysSince = Math.round( ( new Date( today + "T00:00:00Z" ) - new Date( closedAtDate + "T00:00:00Z" ) ) / 86400000 );
                    if ( daysSince >= 0 && daysSince <= CLOSED_NOTICE_WINDOW_DAYS ) {
                        tasks.push( {
                            type: "evaluation-closed",
                            evaluationID: evaluation.evaluationID,
                            closedAt: closure.closedAt
                        } );
                    }
                }
            }
```

(f) Emit the close aggregate after the loop. Immediately after the existing `if ( isSupervisor && interviewsAwaitingScheduling > 0 ) { … }` block (lines 197-202) add:

```javascript
        if ( isSupervisor && interviewsHeldAwaitingClosure > 0 ) {
            tasks.push( {
                type: "interview-close",
                count: interviewsHeldAwaitingClosure
            } );
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/competence && node --test test/task-resolver.test.js`
Expected: PASS (all describes, including the pre-existing ones, green).

- [ ] **Step 5: Commit**

```bash
git add packages/competence/application/task-resolver.js packages/competence/test/task-resolver.test.js
git commit -m "feat(competence): resolve interview-close and evaluation-closed dashboard tasks (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Web services — save-interview-outcome + close-evaluation

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` (dispatch table lines 333-334; add three private methods near `#bookInterviewSlot`/`#cancelInterviewBooking`, ~line 1624; the authorization helper near `#canManagerPerformEvaluation`, line 3595)

**Interfaces:**
- Consumes: `competenceFramework.instance.{recordInterviewOutcome, closeEvaluation}` (Task 2); `dataManager.instance.{fetchEvaluation, saveEvaluation, appendAuditEntry, fetchAllCalendarSlots}`; `organizationManager.instance.isSuperiorManagerOfEmployee`; `#requireRole`; `configurationLoader.{roleCode, slotStatus}`.
- Produces: services `save-interview-outcome` → `{ evaluationID, closure }`; `close-evaluation` → `{ evaluationID, status, closedAt }`; private helper `#canAuthorInterviewOutcome( userID, userRoles, evaluation ) → Promise<boolean>`.

> This task has no unit-test harness (the handler layer is exercised through the framework/resolver units already written). Verification is manual smoke + `node --check`; the deliverable is the wired, authorized endpoints.

- [ ] **Step 1: Add the dispatch entries**

In `processServiceRequest` (line 319), add two branches immediately after the `cancel-interview-booking` branch (line 333):

```javascript
        } else if ( service === "cancel-interview-booking" ) {
            return this.#cancelInterviewBooking( session, params );
        } else if ( service === "save-interview-outcome" ) {
            return this.#saveInterviewOutcome( session, params );
        } else if ( service === "close-evaluation" ) {
            return this.#closeEvaluation( session, params );
        } else if ( service === "create-cycle" ) {
```

- [ ] **Step 2: Add the authorization helper**

Immediately after `#canManagerPerformEvaluation` (line 3595), add:

```javascript
    /**
     * Determines whether the user may author the Step-8 interview outcome for an evaluation: a Supervisor, an org-line
     * superior manager, or the conducting manager (owner of the evaluation's booked interview slot — which may be a
     * stand-in, not the reporting-line manager, mirroring the dashboard's conducting-manager rule).
     *
     * @method
     * @param {string} userID
     * @param {string[]} userRoles
     * @param {Evaluation} evaluation
     * @returns {Promise<boolean>}
     * @private
     */
    #canAuthorInterviewOutcome( userID, userRoles, evaluation ) {
        if ( userRoles.includes( configurationLoader.roleCode.SUPERVISOR ) ) {
            return Promise.resolve( true );
        }
        if ( organizationManager.instance.isSuperiorManagerOfEmployee( userID, evaluation.employeeID ) ) {
            return Promise.resolve( true );
        }
        return dataManager.instance.fetchAllCalendarSlots( evaluation.cycleID ).then( ( slots ) => {
            return slots.some( ( slot ) =>
                slot.status === configurationLoader.slotStatus.BOOKED &&
                slot.booking &&
                slot.booking.evaluationID === evaluation.evaluationID &&
                slot.managerID === userID
            );
        } );
    }
```

- [ ] **Step 3: Add the two service handlers**

Immediately after `#cancelInterviewBooking` (line 1677), add:

```javascript
    /**
     * Records the Step-8 interview outcome (feedback, goals, pip) on a READY evaluation. Authorized to the conducting
     * manager, an org-line superior, or a Supervisor. Writes a compact evaluation-scoped audit summary.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.evaluationID
     * @param {string} [params.feedback]
     * @param {Array<{ text: string, targetDate?: string|null }>} [params.goals]
     * @param {{ required?: boolean, plan?: string }} [params.pip]
     * @returns {Promise<Object>}
     * @private
     */
    #saveInterviewOutcome( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID, userRoles } = this.#requireRole( session, configurationLoader.roleCode.MANAGER, configurationLoader.roleCode.SUPERVISOR );
            const evaluationID = String( params?.evaluationID || "" ).trim();
            if ( !evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { params } ) );
            }

            let targetEvaluation;
            dataManager.instance.fetchEvaluation( evaluationID ).then( ( evaluation ) => {
                targetEvaluation = evaluation;
                return this.#canAuthorInterviewOutcome( userID, userRoles, evaluation );
            } ).then( ( authorized ) => {
                if ( !authorized ) {
                    throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "error.evaluation.outcome-not-authorized" }, exceptions.httpCode.C_403 );
                }
                competenceFramework.instance.recordInterviewOutcome( targetEvaluation, {
                    feedback: params?.feedback,
                    goals: params?.goals,
                    pip: params?.pip
                } );
                return dataManager.instance.saveEvaluation( targetEvaluation );
            } ).then( ( saved ) => {
                return dataManager.instance.appendAuditEntry( {
                    subjectType: "evaluation",
                    subjectID: evaluationID,
                    changedBy: userID,
                    field: "closure.outcome",
                    oldValue: null,
                    newValue: {
                        goalsCount: ( saved.closure && Array.isArray( saved.closure.goals ) ) ? saved.closure.goals.length : 0,
                        pipRequired: !!( saved.closure && saved.closure.pip && saved.closure.pip.required ),
                        feedbackLength: ( saved.closure && typeof saved.closure.feedback === "string" ) ? saved.closure.feedback.length : 0
                    }
                } ).then( () => resolve( { evaluationID: evaluationID, closure: saved.closure } ) );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Formally closes a READY evaluation (Supervisor-only). Delegates the preconditions + transition + audit to the
     * framework.
     *
     * @method
     * @param {TiSession} session
     * @param {Object} params
     * @param {string} params.evaluationID
     * @returns {Promise<Object>}
     * @private
     */
    #closeEvaluation( session, params ) {
        return new Promise( ( resolve, reject ) => {
            const { userID } = this.#requireRole( session, configurationLoader.roleCode.SUPERVISOR );
            const evaluationID = String( params?.evaluationID || "" ).trim();
            if ( !evaluationID ) {
                return reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { params } ) );
            }
            competenceFramework.instance.closeEvaluation( evaluationID, userID ).then( ( saved ) => {
                resolve( {
                    evaluationID: evaluationID,
                    status: saved.status,
                    closedAt: ( saved.closure && saved.closure.closedAt ) ? saved.closure.closedAt : null
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
```

- [ ] **Step 4: Syntax-check**

Run: `cd packages/competence && node --check bin/competence-web-application.js`
Expected: no output (exit 0).

- [ ] **Step 5: Run the whole suite + lint**

Run: `cd packages/competence && npm test && npx eslint bin/competence-web-application.js`
Expected: tests PASS, ESLint clean.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/bin/competence-web-application.js
git commit -m "feat(competence): add save-interview-outcome and close-evaluation services (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Load-view extensions — schedule rows, results closure, cycle counts

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` (`#loadInterviewSchedule` ~1444-1483; `#loadResults` line 1066; `#loadCycleList` lines 1923-1955)

**Interfaces:**
- Consumes: existing `#loadInterviewSchedule` scoping (`bookedSlotByEvaluationID`, `isSupervisor`, `userID`), `evaluation.closure`, `evaluation.interviewDate`.
- Produces: interview-schedule rows gain `closure`, `interviewHeld`, `canRecordOutcome`, `canClose`; the payload gains top-level `maxGoals`. `#loadResults` includes `closure` only for `Closed`. `#loadCycleList` `counts` gains `open`/`inReview`/`ready`.

- [ ] **Step 1: Extend `#loadInterviewSchedule` rows**

In `#loadInterviewSchedule`, the `today` constant is currently declared at line 1469 (after the `evaluations` map). Move it up: delete the `const today = new Date().toISOString().split( "T" )[ 0 ];` line at 1469, and add it immediately after `const readyStatus = configurationLoader.evaluationStatus.READY;` (line 1408):

```javascript
                    const readyStatus = configurationLoader.evaluationStatus.READY;
                    const today = new Date().toISOString().split( "T" )[ 0 ];
```

Then, inside the `readyEvaluations.map(...)` callback, replace the returned row object (lines 1449-1462) with one that adds the four Step-8 fields:

```javascript
                    const evaluations = readyEvaluations.map( ( evaluation ) => {
                        const bookedSlot = bookedSlotByEvaluationID.get( evaluation.evaluationID ) || null;
                        const managerID = organizationManager.instance.resolveClosestManagerIDForEmployee( evaluation.employeeID ) || evaluation.managerID || "";
                        const closure = ( evaluation.closure && typeof evaluation.closure === "object" )
                            ? evaluation.closure
                            : { feedback: "", goals: [], pip: { required: false, plan: "" }, closedAt: null, closedBy: null };
                        const interviewHeld = !!evaluation.interviewDate && evaluation.interviewDate <= today;
                        const outcomeRecorded = ( typeof closure.feedback === "string" && closure.feedback.trim() !== "" ) || ( Array.isArray( closure.goals ) && closure.goals.length > 0 );
                        const isConductingManager = !!bookedSlot && bookedSlot.managerID === userID;
                        const canRecordOutcome = isSupervisor || isConductingManager || organizationManager.instance.isSuperiorManagerOfEmployee( userID, evaluation.employeeID );
                        return {
                            evaluationID: evaluation.evaluationID,
                            shortID: evaluation.shortID,
                            employeeID: evaluation.employeeID,
                            employeeName: organizationManager.instance.resolveEmployeeName( evaluation.employeeID ) || evaluation.employeeID,
                            managerID: managerID,
                            managerName: organizationManager.instance.resolveEmployeeName( managerID ) || managerID,
                            roleFamilyName: this.#formatRoleFamilyLabel( evaluation.roleFamily, evaluation.specialization, session?.language ),
                            stageLevel: evaluation.stageLevel || "",
                            finalScore: evaluation.finalScore?.score ?? null,
                            finalScoreGrade: configurationLoader.performanceThreshold.name( evaluation.finalScore?.interpretation ) || "",
                            interviewDate: evaluation.interviewDate || null,
                            bookedSlotID: bookedSlot ? bookedSlot.slotID : null,
                            closure: { feedback: closure.feedback || "", goals: Array.isArray( closure.goals ) ? closure.goals : [], pip: ( closure.pip && typeof closure.pip === "object" ) ? closure.pip : { required: false, plan: "" } },
                            interviewHeld: interviewHeld,
                            canRecordOutcome: canRecordOutcome,
                            canClose: isSupervisor && interviewHeld && outcomeRecorded
                        };
                    } );
```

Finally, add `maxGoals` to the resolved payload. Change the two `resolve( { … } )` payloads in this method to include `maxGoals`:

For the no-cycle early return (line 1402):

```javascript
                    return resolve( { cycleID: null, evaluations: [], slots: [], config: calendarConfig, canSchedule: isSupervisor, maxGoals: configurationLoader.getSetting( "performanceAppraisals.numberOfNextPeriodGoals", 5 ) } );
```

For the main resolve (lines 1477-1483):

```javascript
                    resolve( {
                        cycleID: cycle.cycleID,
                        evaluations: evaluations,
                        slots: slots,
                        config: calendarConfig,
                        canSchedule: isSupervisor,
                        maxGoals: configurationLoader.getSetting( "performanceAppraisals.numberOfNextPeriodGoals", 5 )
                    } );
```

- [ ] **Step 2: Extend `#loadResults` to expose closure only when Closed**

In `#loadResults`, immediately after `delete current.feedback;` (line 1066) add:

```javascript
                // Step-8 artifacts (interview feedback, goals, PIP) are the employee's to see only once the evaluation is
                // formally CLOSED; during READY they are authored on the interviews hub, not shown here.
                if ( current.status !== configurationLoader.evaluationStatus.CLOSED ) {
                    delete current.closure;
                }
```

- [ ] **Step 3: Extend `#loadCycleList` per-status counts**

In `#loadCycleList`, replace the counts accumulation block (lines 1923-1934) with one that also breaks out the active sub-statuses:

```javascript
                const countsByCycle = new Map();
                evaluations.forEach( ( evaluation ) => {
                    const cycleID = evaluation?.cycleID;
                    if ( !cycleID ) return;
                    const bucket = countsByCycle.get( cycleID ) || { inProgress: 0, completed: 0, open: 0, inReview: 0, ready: 0 };
                    if ( evaluation.status === configurationLoader.evaluationStatus.OPEN ) {
                        bucket.open++;
                    } else if ( evaluation.status === configurationLoader.evaluationStatus.IN_REVIEW ) {
                        bucket.inReview++;
                    } else if ( evaluation.status === configurationLoader.evaluationStatus.READY ) {
                        bucket.ready++;
                    }
                    if ( activeStatuses.includes( evaluation.status ) ) {
                        bucket.inProgress++;
                    } else if ( evaluation.status === configurationLoader.evaluationStatus.CLOSED ) {
                        bucket.completed++;
                    }
                    countsByCycle.set( cycleID, bucket );
                } );
```

And update the default bucket in the projection (line 1937):

```javascript
                    const counts = countsByCycle.get( cycle.cycleID ) || { inProgress: 0, completed: 0, open: 0, inReview: 0, ready: 0 };
```

- [ ] **Step 4: Syntax-check and run suite**

Run: `cd packages/competence && node --check bin/competence-web-application.js && npm test`
Expected: exit 0; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/bin/competence-web-application.js
git commit -m "feat(competence): surface closure state in schedule, results, and cycle-list payloads (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Localization — Step-8 labels and error keys

**Files:**
- Modify: `packages/competence/bin/localization/competence-labels.json`

**Interfaces:**
- Produces: label keys under `interface.schedule.outcome`, `interface.evaluation.results.closure`, `interface.dashboard.task-interview-close*` / `task-evaluation-closed*`, `interface.cycles.close-modal-pending`, and error keys under `error.evaluation`. All consumed by Tasks 7-8 (UI) and by the server exception `details` (Tasks 2, 4).

- [ ] **Step 1: Add the error keys**

Into the `error.evaluation` section object (starts at line ~3827), add these leaves (place alongside the existing `error.evaluation.*` keys):

```json
      "outcome-not-ready": { "en": "The interview outcome can only be recorded while the evaluation is Ready.", "bg": "Резултатът от интервюто може да се записва само докато оценката е в статус „Готова“." },
      "outcome-not-authorized": { "en": "You are not authorized to record the interview outcome for this evaluation.", "bg": "Нямате права да записвате резултата от интервюто за тази оценка." },
      "too-many-goals": { "en": "Too many goals were provided for the next period.", "bg": "Зададени са твърде много цели за следващия период." },
      "invalid-goal": { "en": "Each goal must have a non-empty description.", "bg": "Всяка цел трябва да има непразно описание." },
      "close-not-ready": { "en": "Only a Ready evaluation can be closed.", "bg": "Само оценка в статус „Готова“ може да бъде затворена." },
      "close-no-interview": { "en": "The evaluation cannot be closed before an interview has been scheduled.", "bg": "Оценката не може да бъде затворена преди да е насрочено интервю." },
      "close-interview-not-held": { "en": "The evaluation cannot be closed before the interview date.", "bg": "Оценката не може да бъде затворена преди датата на интервюто." },
      "close-no-outcome": { "en": "Record interview feedback or at least one goal before closing the evaluation.", "bg": "Запишете обратна връзка от интервюто или поне една цел, преди да затворите оценката." }
```

- [ ] **Step 2: Add the schedule/outcome + cycle labels**

Into the `interface.schedule` section object (starts at line ~6743), add an `outcome` sub-object and the close labels:

```json
      "outcome": {
        "panel-title": { "en": "Interview outcome", "bg": "Резултат от интервюто" },
        "status-awaiting": { "en": "Awaiting interview", "bg": "Очаква интервю" },
        "status-pending": { "en": "Interview held — outcome pending", "bg": "Интервюто е проведено — очаква резултат" },
        "status-ready-to-close": { "en": "Ready to close", "bg": "Готова за затваряне" },
        "record-btn": { "en": "Record outcome", "bg": "Запиши резултат" },
        "feedback-label": { "en": "Interview feedback", "bg": "Обратна връзка от интервюто" },
        "goals-label": { "en": "Next-period goals", "bg": "Цели за следващия период" },
        "goal-text-placeholder": { "en": "Goal description", "bg": "Описание на целта" },
        "goal-date-label": { "en": "Target date", "bg": "Целева дата" },
        "goal-add": { "en": "Add goal", "bg": "Добави цел" },
        "goal-remove": { "en": "Remove", "bg": "Премахни" },
        "goal-cap": { "en": "{n} / {max} goals", "bg": "{n} / {max} цели" },
        "pip-label": { "en": "Performance Improvement Plan", "bg": "План за подобряване на представянето" },
        "pip-hint": { "en": "This score suggests a formal improvement plan is warranted.", "bg": "Този резултат предполага нужда от официален план за подобрение." },
        "pip-plan-placeholder": { "en": "Improvement plan details", "bg": "Детайли по плана за подобрение" },
        "save-btn": { "en": "Save outcome", "bg": "Запази резултата" },
        "saved-toast": { "en": "Interview outcome saved.", "bg": "Резултатът от интервюто е записан." },
        "close-btn": { "en": "Close evaluation", "bg": "Затвори оценката" },
        "close-modal-title": { "en": "Close evaluation", "bg": "Затваряне на оценката" },
        "close-modal-body": { "en": "This permanently closes the evaluation and reveals the outcome to the employee. It cannot be undone.", "bg": "Това затваря оценката за постоянно и разкрива резултата на служителя. Действието е необратимо." },
        "close-modal-confirm": { "en": "Close evaluation", "bg": "Затвори оценката" },
        "close-modal-cancel": { "en": "Cancel", "bg": "Отказ" },
        "closed-toast": { "en": "Evaluation closed.", "bg": "Оценката е затворена." }
      }
```

Into the `interface.cycles` section object (starts at line ~6845), add:

```json
      "close-modal-pending": { "en": "{n} evaluation(s) are not yet closed ({open} open, {inReview} in review, {ready} ready).", "bg": "{n} оценка(и) все още не са затворени ({open} отворени, {inReview} в преглед, {ready} готови)." }
```

- [ ] **Step 3: Add the dashboard task labels and Scores closure labels**

Into `interface.dashboard` (starts at line ~5629), add:

```json
      "task-interview-close": { "en": "Interviews awaiting closure", "bg": "Интервюта, очакващи затваряне" },
      "task-interview-close-sub": { "en": "Held interviews are ready to be closed.", "bg": "Проведените интервюта са готови за затваряне." },
      "task-evaluation-closed": { "en": "Your evaluation is closed", "bg": "Вашата оценка е затворена" },
      "task-evaluation-closed-sub": { "en": "View your results, feedback, and goals.", "bg": "Вижте резултатите, обратната връзка и целите си." }
```

Into `interface.evaluation.results` (the results sub-section of `interface.evaluation`, starts at line ~5059 area), add a `closure` sub-object:

```json
        "closure": {
          "section-title": { "en": "Interview outcome", "bg": "Резултат от интервюто" },
          "feedback-title": { "en": "Interview feedback", "bg": "Обратна връзка от интервюто" },
          "feedback-empty": { "en": "No written feedback was recorded.", "bg": "Няма записана писмена обратна връзка." },
          "goals-title": { "en": "Goals for the next period", "bg": "Цели за следващия период" },
          "goals-empty": { "en": "No goals were set.", "bg": "Няма зададени цели." },
          "goal-target": { "en": "Target", "bg": "Срок" },
          "pip-title": { "en": "Performance Improvement Plan", "bg": "План за подобряване на представянето" },
          "closed-on": { "en": "Closed on {date}", "bg": "Затворена на {date}" }
        }
```

- [ ] **Step 4: Validate the JSON**

Run: `cd packages/competence && node --check bin/localization/competence-labels.json 2>/dev/null || node -e "JSON.parse(require('fs').readFileSync('bin/localization/competence-labels.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON` (no parse error). Then `npm run test:json` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/bin/localization/competence-labels.json
git commit -m "feat(competence): add Step 8 interview-closure labels and error keys (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: UI — Interview Schedule hub (outcome panel + close)

**Files:**
- Modify: `packages/competence/bin/static/fragments/frame-interview-schedule.html`
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` (`configureInterviewSchedule`, lines 1591-1787)

**Interfaces:**
- Consumes: the `#loadInterviewSchedule` payload fields from Task 5 (`closure`, `interviewHeld`, `canRecordOutcome`, `canClose`, `maxGoals`), services `save-interview-outcome` / `close-evaluation` (Task 4), labels (Task 6).
- Produces: the interviews-hub UI (per-row outcome panel + Supervisor close action).

- [ ] **Step 1: Extend the component state and load**

In `configureInterviewSchedule`, add state fields (after `canSchedule: false,` at line 1604):

```javascript
        canSchedule: false,
        maxGoals: 5,
        outcomeForID: null,
        outcomeDraft: { feedback: "", goals: [], pip: { required: false, plan: "" } },
        closeModal: { open: false, evaluationID: null, employeeName: "", busy: false },
```

In `loadSchedule()`, capture `maxGoals` and reset the panel. After `this.canSchedule = ( data.canSchedule === true );` (line 1629) add:

```javascript
                this.maxGoals = ( typeof data.maxGoals === "number" ) ? data.maxGoals : 5;
                this.outcomeForID = null;
```

- [ ] **Step 2: Add the outcome + close methods**

Add these methods to the returned object (place before `pendingCount()` at line 1761):

```javascript
        toggleOutcome( evaluation ) {
            if ( this.outcomeForID === evaluation.evaluationID ) {
                this.outcomeForID = null;
                return;
            }
            const closure = evaluation.closure || { feedback: "", goals: [], pip: { required: false, plan: "" } };
            this.outcomeDraft = {
                feedback: closure.feedback || "",
                goals: Array.isArray( closure.goals ) ? closure.goals.map( ( g ) => ( { text: g.text || "", targetDate: g.targetDate || "" } ) ) : [],
                pip: { required: !!( closure.pip && closure.pip.required ), plan: ( closure.pip && closure.pip.plan ) ? closure.pip.plan : "" }
            };
            this.outcomeForID = evaluation.evaluationID;
        },

        setOutcomeFeedback( value ) {
            this.outcomeDraft.feedback = value;
        },

        addGoal() {
            if ( this.outcomeDraft.goals.length >= this.maxGoals ) {
                return;
            }
            this.outcomeDraft.goals.push( { text: "", targetDate: "" } );
        },

        removeGoal( index ) {
            this.outcomeDraft.goals.splice( index, 1 );
        },

        setGoalText( index, value ) {
            if ( this.outcomeDraft.goals[ index ] ) {
                this.outcomeDraft.goals[ index ].text = value;
            }
        },

        setGoalDate( index, value ) {
            if ( this.outcomeDraft.goals[ index ] ) {
                this.outcomeDraft.goals[ index ].targetDate = value;
            }
        },

        togglePipRequired() {
            this.outcomeDraft.pip.required = !this.outcomeDraft.pip.required;
        },

        setPipPlan( value ) {
            this.outcomeDraft.pip.plan = value;
        },

        goalCapLabel() {
            return this.getLabel( "interface.schedule.outcome.goal-cap" )
                .replace( "{n}", String( this.outcomeDraft.goals.length ) )
                .replace( "{max}", String( this.maxGoals ) );
        },

        canAddGoal() {
            return this.outcomeDraft.goals.length < this.maxGoals;
        },

        saveOutcome( evaluationID ) {
            const goals = this.outcomeDraft.goals
                .map( ( g ) => ( { text: ( g.text || "" ).trim(), targetDate: ( g.targetDate || "" ).trim() || null } ) )
                .filter( ( g ) => g.text !== "" );
            tiApplication.sendRequest( "/app/save-interview-outcome", "POST", {
                evaluationID: evaluationID,
                feedback: this.outcomeDraft.feedback,
                goals: goals,
                pip: { required: this.outcomeDraft.pip.required, plan: this.outcomeDraft.pip.plan }
            } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.schedule.outcome.saved-toast" ) );
                this.loadSchedule();
            } ).catch( ( error ) => {
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        openCloseModal( evaluation ) {
            this.closeModal = { open: true, evaluationID: evaluation.evaluationID, employeeName: evaluation.employeeName || "", busy: false };
        },

        dismissCloseModal() {
            this.closeModal = { open: false, evaluationID: null, employeeName: "", busy: false };
        },

        confirmClose() {
            if ( !this.closeModal.evaluationID ) {
                return;
            }
            this.closeModal.busy = true;
            tiApplication.sendRequest( "/app/close-evaluation", "POST", { evaluationID: this.closeModal.evaluationID } ).then( () => {
                tiApplication.notify( tiApplication.getLabel( "interface.schedule.outcome.closed-toast" ) );
                this.dismissCloseModal();
                this.loadSchedule();
            } ).catch( ( error ) => {
                this.dismissCloseModal();
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        rowStatusLabel( evaluation ) {
            if ( !evaluation.interviewHeld ) {
                return this.getLabel( "interface.schedule.outcome.status-awaiting" );
            }
            const closure = evaluation.closure || { feedback: "", goals: [] };
            const recorded = ( closure.feedback && closure.feedback.trim() !== "" ) || ( Array.isArray( closure.goals ) && closure.goals.length > 0 );
            return recorded
                ? this.getLabel( "interface.schedule.outcome.status-ready-to-close" )
                : this.getLabel( "interface.schedule.outcome.status-pending" );
        },
```

- [ ] **Step 3: Add the outcome panel + close button to the row markup**

In `frame-interview-schedule.html`, inside `.competence-interview-actions` (lines 55-68), add a "Record outcome" toggle and a "Close" button after the existing cancel-booking button (before the closing `</div>` at line 68):

```html
                            <button type="button" class="ti-btn sm ghost" x-show="canRecordOutcome( evaluation )"
                                    @click="toggleOutcome( evaluation )">
                                <span x-text-label="interface.schedule.outcome.record-btn"></span>
                            </button>
                            <button type="button" class="ti-btn sm primary" x-show="evaluation.canClose"
                                    @click="openCloseModal( evaluation )">
                                <span x-text-label="interface.schedule.outcome.close-btn"></span>
                            </button>
```

Add a helper `canRecordOutcome( evaluation )` to the component (it just reads the server flag; kept as a method so the template avoids `?.`):

```javascript
        canRecordOutcome( evaluation ) {
            return evaluation.canRecordOutcome === true;
        },
```

Then add the expandable outcome panel immediately after the interview `<div class="competence-interview-row" …>…</div>` closes (after line 69, still inside the `x-for`):

```html
                    <template x-if="outcomeForID === evaluation.evaluationID">
                        <div class="competence-outcome-panel">
                            <div class="competence-outcome-status" x-text="rowStatusLabel( evaluation )"></div>

                            <label class="ti-form-label" x-text-label="interface.schedule.outcome.feedback-label"></label>
                            <textarea class="ti-form-input" rows="3"
                                      x-bind:value="outcomeDraft.feedback"
                                      @ti-input="setOutcomeFeedback( $event.detail.value )"></textarea>

                            <div class="competence-outcome-goals-head">
                                <label class="ti-form-label" x-text-label="interface.schedule.outcome.goals-label"></label>
                                <span class="competence-outcome-goal-cap" x-text="goalCapLabel()"></span>
                            </div>
                            <template x-for="(goal, index) in outcomeDraft.goals" x-bind:key="index">
                                <div class="competence-outcome-goal-row">
                                    <input type="text" class="ti-form-input" x-bind:value="goal.text"
                                           x-bind:placeholder="getLabel( 'interface.schedule.outcome.goal-text-placeholder' )"
                                           @ti-input="setGoalText( index, $event.detail.value )">
                                    <input type="date" class="ti-form-input competence-outcome-goal-date" x-bind:value="goal.targetDate"
                                           x-bind:aria-label="getLabel( 'interface.schedule.outcome.goal-date-label' )"
                                           @ti-input="setGoalDate( index, $event.detail.value )">
                                    <button type="button" class="ti-btn sm ghost" @click="removeGoal( index )"
                                            x-text-label="interface.schedule.outcome.goal-remove"></button>
                                </div>
                            </template>
                            <button type="button" class="ti-btn sm ghost" x-show="canAddGoal()" @click="addGoal()"
                                    x-text-label="interface.schedule.outcome.goal-add"></button>

                            <label class="competence-outcome-pip-toggle">
                                <input type="checkbox" x-bind:checked="outcomeDraft.pip.required" @change="togglePipRequired()">
                                <span x-text-label="interface.schedule.outcome.pip-label"></span>
                            </label>
                            <div class="competence-outcome-pip-hint" x-show="evaluation.finalScoreGrade === 'framework.performance.name.t1'"
                                 x-text-label="interface.schedule.outcome.pip-hint"></div>
                            <template x-if="outcomeDraft.pip.required">
                                <textarea class="ti-form-input" rows="3"
                                          x-bind:value="outcomeDraft.pip.plan"
                                          x-bind:placeholder="getLabel( 'interface.schedule.outcome.pip-plan-placeholder' )"
                                          @ti-input="setPipPlan( $event.detail.value )"></textarea>
                            </template>

                            <div class="competence-outcome-actions">
                                <button type="button" class="ti-btn sm primary" @click="saveOutcome( evaluation.evaluationID )"
                                        x-text-label="interface.schedule.outcome.save-btn"></button>
                            </div>
                        </div>
                    </template>
```

> The PIP hint's `x-show` compares against the row's `finalScoreGrade`, which the server sets to the threshold label key (`configurationLoader.performanceThreshold.name(...)`); T1 (Weak) is the "improvement plan required" band. If the exact T1 label key differs from `framework.performance.name.t1`, confirm it in `competence-labels.json` and match it here.

- [ ] **Step 4: Add the close-confirm modal markup**

Add a modal block at the end of the fragment, immediately before the final `</div>` (the one closing `<div class="ti-page" …>` at line 124):

```html
    <template x-if="closeModal.open">
        <div class="ti-modal-overlay" @click.self="dismissCloseModal()">
            <div class="ti-modal" role="dialog" aria-modal="true">
                <div class="ti-modal-head">
                    <div class="ti-modal-title" x-text-label="interface.schedule.outcome.close-modal-title"></div>
                </div>
                <div class="ti-modal-body">
                    <p x-text-label="interface.schedule.outcome.close-modal-body"></p>
                    <p class="competence-outcome-close-emp" x-text="closeModal.employeeName"></p>
                </div>
                <div class="ti-modal-actions">
                    <button type="button" class="ti-btn ghost" @click="dismissCloseModal()" x-bind:disabled="closeModal.busy"
                            x-text-label="interface.schedule.outcome.close-modal-cancel"></button>
                    <button type="button" class="ti-btn primary" @click="confirmClose()" x-bind:disabled="closeModal.busy"
                            x-text-label="interface.schedule.outcome.close-modal-confirm"></button>
                </div>
            </div>
        </div>
    </template>
```

> Confirm the exact modal CSS class names against an existing modal (the Cycles screen `frame-cycles.html` close-confirm modal) and match them — reuse the framework `.ti-modal*` primitives rather than inventing classes.

- [ ] **Step 5: Add minimal styles**

In `packages/competence/bin/static/scripts/competence-main.css`, add layout-only rules for the new classes (no colors beyond existing tokens):

```css
.competence-outcome-panel { padding: 12px 16px 16px; border-top: 1px solid var(--ti-border, #e2e2e2); display: flex; flex-direction: column; gap: 8px; }
.competence-outcome-goals-head { display: flex; align-items: baseline; justify-content: space-between; }
.competence-outcome-goal-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }
.competence-outcome-goal-date { max-width: 170px; }
.competence-outcome-pip-toggle { display: flex; align-items: center; gap: 8px; }
.competence-outcome-actions { display: flex; justify-content: flex-end; }
.competence-outcome-status { font-weight: 600; }
```

> Match `var(--ti-border …)` to the actual border token used elsewhere in `competence-main.css`; if a different token name is in use, use that. Do not introduce new color values.

- [ ] **Step 6: Verify in the browser**

Ensure a dev server is running (via `preview_start` using `.claude/launch.json`; create it if absent per the competence app's start command). With a Supervisor identity and at least one READY evaluation whose interview date is in the past:
- `preview_start` → `preview_console_logs` (level error) to confirm no Alpine CSP violations or JS errors.
- `preview_snapshot` on the Interview Schedule screen to confirm the "Record outcome" button and, after saving feedback, the "Close evaluation" button appear.
- `preview_screenshot` for the record-outcome panel open.

If the dev server is not previewable in this environment, run `node --check` on the JS and rely on the CSP-convention review instead, and note that manual verification is pending.

- [ ] **Step 7: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-interview-schedule.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/static/scripts/competence-main.css
git commit -m "feat(competence): interview-schedule hub — record outcome + close evaluation (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: UI — Scores closure section, status tone, dashboard tasks, cycle warning

**Files:**
- Modify: `packages/competence/bin/static/fragments/frame-competence-evaluation.html` (results-only block, after the strengths/gaps band ~line 291)
- Modify: `packages/competence/bin/static/scripts/competence-user-interface.js` (evaluation component helpers near `getStatusPillTone` line 505; `computedTasks` lines 2631-2662; `handleTaskClick` line 2675; the cycles component close modal usage)
- Modify: `packages/competence/bin/static/fragments/frame-cycles.html` (close-confirm modal body)

**Interfaces:**
- Consumes: `#loadResults` payload `evaluation.closure` (Task 5, present only for Closed); resolver task types `interview-close` / `evaluation-closed` (Task 3); `#loadCycleList` `counts.{open,inReview,ready}` (Task 5); labels (Task 6).

- [ ] **Step 1: Add Scores closure helpers to the evaluation component**

In `competence-user-interface.js`, add helper methods immediately after `getStatusPillTone()` (line 511):

```javascript
        hasClosure() {
            const c = this.evaluation && this.evaluation.closure;
            if ( !c ) return false;
            const hasFeedback = ( typeof c.feedback === "string" && c.feedback.trim() !== "" );
            const hasGoals = ( Array.isArray( c.goals ) && c.goals.length > 0 );
            const hasPip = ( c.pip && c.pip.required );
            return hasFeedback || hasGoals || hasPip;
        },

        closureFeedback() {
            const c = this.evaluation && this.evaluation.closure;
            return ( c && typeof c.feedback === "string" ) ? c.feedback : "";
        },

        closureGoals() {
            const c = this.evaluation && this.evaluation.closure;
            return ( c && Array.isArray( c.goals ) ) ? c.goals : [];
        },

        closurePipVisible() {
            const c = this.evaluation && this.evaluation.closure;
            return !!( c && c.pip && c.pip.required );
        },

        closurePipPlan() {
            const c = this.evaluation && this.evaluation.closure;
            return ( c && c.pip && typeof c.pip.plan === "string" ) ? c.pip.plan : "";
        },
```

Also extend `getStatusPillTone()` to cover Closed (line 509-510):

```javascript
            if ( status === "Ready" ) return "success";
            if ( status === "Closed" ) return "muted";
            return "";
```

- [ ] **Step 2: Add the Scores closure section to the fragment**

In `frame-competence-evaluation.html`, inside the results-only block (`x-show="hasResults() && isMyResults"`, lines 193-307), add the closure card immediately after the strengths/gaps band (band 3 closes ~line 291), before the score-history band:

```html
                <template x-if="hasClosure()">
                    <div class="ti-card competence-results-closure">
                        <div class="ti-panel-title" x-text-label="interface.evaluation.results.closure.section-title"></div>

                        <div class="competence-closure-block">
                            <div class="ti-kv-label" x-text-label="interface.evaluation.results.closure.feedback-title"></div>
                            <p class="ti-kv-value" x-show="closureFeedback() !== ''" x-text="closureFeedback()"></p>
                            <p class="ti-kv-value muted" x-show="closureFeedback() === ''" x-text-label="interface.evaluation.results.closure.feedback-empty"></p>
                        </div>

                        <div class="competence-closure-block">
                            <div class="ti-kv-label" x-text-label="interface.evaluation.results.closure.goals-title"></div>
                            <p class="ti-kv-value muted" x-show="closureGoals().length === 0" x-text-label="interface.evaluation.results.closure.goals-empty"></p>
                            <ul class="competence-closure-goals" x-show="closureGoals().length > 0">
                                <template x-for="(goal, index) in closureGoals()" x-bind:key="index">
                                    <li>
                                        <span x-text="goal.text"></span>
                                        <span class="competence-closure-goal-date" x-show="!!goal.targetDate"
                                              x-text="getLabel( 'interface.evaluation.results.closure.goal-target' ) + ': ' + formatDate( goal.targetDate )"></span>
                                    </li>
                                </template>
                            </ul>
                        </div>

                        <div class="competence-closure-block" x-show="closurePipVisible()">
                            <div class="ti-kv-label" x-text-label="interface.evaluation.results.closure.pip-title"></div>
                            <p class="ti-kv-value" x-text="closurePipPlan()"></p>
                        </div>
                    </div>
                </template>
```

> Confirm `formatDate` exists on the evaluation component (it is used elsewhere in the fragment). If the component's date helper has a different name, use that.

- [ ] **Step 3: Render the two new dashboard tasks**

In `computedTasks` (the `for ( const serverTask of this.serverTasks )` loop), add two branches after the `interview-scheduled` branch (after line 2662, before the loop's closing `}`):

```javascript
                } else if ( serverTask.type === "interview-close" ) {
                    tasks.push( {
                        id: "interview-close",
                        tone: "warn",
                        title: tiApplication.getLabel( "interface.dashboard.task-interview-close", "Interviews awaiting closure" ) + " (" + serverTask.count + ")",
                        sub: tiApplication.getLabel( "interface.dashboard.task-interview-close-sub", "Held interviews are ready to be closed." ),
                        action: "schedule"
                    } );
                } else if ( serverTask.type === "evaluation-closed" ) {
                    tasks.push( {
                        id: "evaluation-closed",
                        tone: "success",
                        title: tiApplication.getLabel( "interface.dashboard.task-evaluation-closed", "Your evaluation is closed" ),
                        sub: tiApplication.getLabel( "interface.dashboard.task-evaluation-closed-sub", "View your results, feedback, and goals." ),
                        action: "results"
                    } );
                }
```

- [ ] **Step 4: Route the "results" action**

In `handleTaskClick` (line 2675), extend the action mapping to route `"results"` to the Scores screen:

```javascript
            if ( task.action ) {
                tiApplication.openScreen( task.action === "evaluation" ? "competence-evaluation" :
                    task.action === "schedule" ? "interview-schedule" :
                    task.action === "results" ? "my-results" : "employees-list" );
            }
```

- [ ] **Step 5: Add the cycle-close pending warning**

In the Cycles component, the close modal is opened with a cycle payload and confirmed by `submitClose()` (line 2944). Add a helper to compute the pending warning from the selected cycle's `counts`, near `submitClose()`:

```javascript
        closePendingWarning() {
            const cycle = ( this.modal && this.modal.payload && this.modal.payload.cycle ) ? this.modal.payload.cycle : null;
            const counts = cycle && cycle.counts ? cycle.counts : null;
            if ( !counts ) return "";
            const notClosed = ( counts.open || 0 ) + ( counts.inReview || 0 ) + ( counts.ready || 0 );
            if ( notClosed === 0 ) return "";
            return tiApplication.getLabel( "interface.cycles.close-modal-pending" )
                .replace( "{n}", String( notClosed ) )
                .replace( "{open}", String( counts.open || 0 ) )
                .replace( "{inReview}", String( counts.inReview || 0 ) )
                .replace( "{ready}", String( counts.ready || 0 ) );
        },
```

> Verify how the close modal payload is populated (find where `this.modal = { kind: "close", payload: { … } }` is set in the cycles component) and ensure the selected cycle object — which already carries `counts` from `#loadCycleList` — is on `modal.payload.cycle`. If the payload only holds `cycleID`, also store the cycle row there when opening the modal.

In `frame-cycles.html`, inside the close-confirm modal body, add a warning line bound to the helper:

```html
                    <p class="competence-cycle-close-warning" x-show="closePendingWarning() !== ''" x-text="closePendingWarning()"></p>
```

- [ ] **Step 6: Add Scores/cycle-warning styles**

In `competence-main.css`, add:

```css
.competence-results-closure { display: flex; flex-direction: column; gap: 16px; }
.competence-closure-block { display: flex; flex-direction: column; gap: 4px; }
.competence-closure-goals { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.competence-closure-goal-date { margin-left: 8px; font-size: 0.85em; opacity: 0.75; }
.competence-cycle-close-warning { font-weight: 600; }
```

- [ ] **Step 7: Verify in the browser**

With the dev server running:
- Employee identity viewing a Closed evaluation via the Scores screen (`my-results`): `preview_snapshot` confirms the "Interview outcome" section with feedback + goals; `preview_console_logs` (error) clean.
- Employee dashboard within 14 days of closure: the "Your evaluation is closed" task appears and navigates to `my-results` (`preview_click` the task, then `preview_snapshot`).
- Supervisor Cycles screen close modal: the pending-count warning line renders (`preview_screenshot`).

If not previewable, `node --check` the JS, verify JSON labels parse, and note manual verification pending.

- [ ] **Step 8: Run suite + lint + commit**

Run: `cd packages/competence && npm test && npx eslint bin/static/scripts/competence-user-interface.js`
Expected: tests PASS, ESLint clean.

```bash
git add packages/competence/bin/static/fragments/frame-competence-evaluation.html packages/competence/bin/static/fragments/frame-cycles.html packages/competence/bin/static/scripts/competence-user-interface.js packages/competence/bin/static/scripts/competence-main.css
git commit -m "feat(competence): Scores closure section, closed-status tone, Step 8 dashboard tasks, cycle-close warning (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, version bump, and design log

**Files:**
- Modify: `packages/competence/package.json` (version)
- Modify: `packages/competence/CHANGELOG.md`
- Modify: `packages/competence/README.md`
- Modify: `packages/competence/design/interview-closure.md` (implementation log)

**Interfaces:**
- Consumes: everything delivered in Tasks 1-8.

- [ ] **Step 1: Bump the version**

In `packages/competence/package.json`, change `"version": "3.10.0"` to `"version": "3.11.0"`.

- [ ] **Step 2: Add the CHANGELOG entry**

At the top of the version list in `packages/competence/CHANGELOG.md`, add:

```markdown
## Version 3.11.0
* feat(competence): Step 8 — interview meeting outcome & formal evaluation closure (Ready → Closed). Records written feedback, up to `numberOfNextPeriodGoals` next-period goals, and an optional Performance Improvement Plan on the interviews hub; the Supervisor formally closes once the interview has been held and an outcome recorded. Closure artifacts become visible to the employee on the Scores screen; grades/scores stay revealed at Ready. New dashboard tasks: Supervisor "interviews awaiting closure" and the evaluee "evaluation closed" notice; the cycle-close modal warns about not-yet-closed evaluations. See `design/interview-closure.md` (CA-78).
```

- [ ] **Step 3: Update the README**

In `packages/competence/README.md`:
- Rewrite the "#### Step 8 — Interview Meeting and Closure *(planned)*" section (lines 246-250): remove *(planned)*; describe the writers union (conducting manager ∪ org superior ∪ Supervisor), the close preconditions (interview held + outcome recorded), Supervisor-only irreversible closure, and split visibility (grades at Ready, closure artifacts at Closed).
- Remove the planned-feature note at line 41.
- Fix the status-lifecycle footnote at line 172 ("currently the maximum implemented status is `READY`") — CLOSED is now implemented; remove the `*` caveat at line 167-172.
- Correct the data-visibility table row (line 406): manager grades are revealed at Ready; the closure artifacts (feedback/goals/PIP) reveal at Closed. Drop the "*(planned)*" marker.
- Update the sequence diagram's Step 8 block (lines 324-330) from the greyed "Planned" rect to the implemented flow.
- Add Current Status bullets for the interview outcome + closure and the two new dashboard tasks (near lines 20-22, 28-32).
- Remove the *(planned feature)* marker from `numberOfNextPeriodGoals` in the settings table (line 984).
- Extend the Interview Schedule screen description (lines 478-484) to mention the record-outcome panel and Supervisor close action.

- [ ] **Step 4: Append the design implementation log**

In `packages/competence/design/interview-closure.md`, under the `## Implementation log` heading, add a dated entry summarizing the delivery (data model → framework → resolver → services → loads → labels → UI → docs), the commit SHAs, and the verification evidence (competence suite count, `test:json` count, ESLint clean, `node --check`), and flip the meta `**Status:**` to `Implemented (<date>)`.

- [ ] **Step 5: Full verification**

Run: `cd packages/competence && npm test && npm run test:json && npx eslint .`
Expected: all tests PASS (report the exact counts), schema validation PASS, ESLint clean. Record the numbers in the design log.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/package.json packages/competence/CHANGELOG.md packages/competence/README.md packages/competence/design/interview-closure.md
git commit -m "docs(competence): document Step 8 interview closure; bump to 3.11.0 (CA-78)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Update YouTrack CA-78**

Move CA-78 to `State: Verified` / `Stage: Done` (or the project's in-review convention), set `Version` to `v3.11.0` if the enum has it, and log the time spent. Mirror the design doc to the KB per convention.

---

## Self-Review

**Spec coverage** (against `design/interview-closure.md`):
- §3 Data model → Task 1. §4 framework methods → Task 2. §5 services + authorization → Task 4; load extensions → Task 5. §6 tasks → Task 3 (resolver) + Task 8 (client rendering). §7 UI: hub → Task 7, Scores + status tone → Task 8, cycle warning → Task 8. §8 analytics untouched → no task (correct — verified no analytics change needed). §9 localization → Task 6. §10 testing → Tasks 1-3 (framework + resolver units). §11 versioning/docs → Task 9. §2 decisions all mapped (split visibility → Task 5 `#loadResults` gate + Task 8 Scores; writers union → Task 4 `#canAuthorInterviewOutcome`; Supervisor-only close → Tasks 2/4; close preconditions → Task 2; cycle-close warn → Tasks 5/8; tasks-are-notifications → Task 3; Scores surface → Task 8; `currentStep` untouched → confirmed, no task).

**Placeholder scan:** no TBD/TODO; every code step carries complete code. Three "confirm exact name" notes (T1 label key, modal CSS classes, cycles modal payload shape, `formatDate`/`--ti-border` tokens) are verification instructions with a concrete default provided, not placeholders — the implementer has working code and a one-line check.

**Type consistency:** `closure` shape identical across Tasks 1/2/5/7/8; `recordInterviewOutcome(evaluation, outcome)` and `closeEvaluation(evaluationID, actorID)` signatures match between Task 2 (definition), Task 4 (callers), and the tests; task types `interview-close`/`evaluation-closed` identical between Task 3 (resolver) and Task 8 (client); error keys identical between Task 2/4 (thrown) and Task 6 (defined); payload fields `canRecordOutcome`/`canClose`/`interviewHeld`/`maxGoals`/`closure` identical between Task 5 (producer) and Task 7 (consumer).
