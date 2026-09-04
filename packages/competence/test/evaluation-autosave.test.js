/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * Grades and written feedback used to live only in the browser until somebody pressed Save Draft. Nothing else
 * persisted them, and filling in the form issues no requests at all — so an expired session, a closed tab or a
 * stray refresh discarded however long the person had spent on it, and they found out at the moment they tried to
 * save. The eight-hour idle session added in web-framework 1.27.0 widened that window; it did not close it.
 *
 * These drive the real component, loaded through a VM sandbox, on a clock the test owns: `flushTimers()` is the
 * passage of time, so the debounce is exercised rather than waited on.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadComponent } = require( "./helpers/load-ui-component" );

const DRAFT_URL = "/app/save-evaluation-draft";

let harness;

/**
 * A component in the state the screen reaches after loading an editable self-evaluation.
 *
 * @param {Object} [overrides] Applied over the editable defaults — `userRole: 4` for a peer reviewer, `canEdit: false` for a reader.
 * @param {Object} [stores] Passed through to the harness, to control what `sendRequest` returns.
 * @returns {Object} the component
 */
function editableEvaluation( overrides = {}, stores = undefined ) {
    harness = loadComponent( "competenceEvaluation", stores );
    const component = harness.component;
    component.canEdit = true;
    component.userRole = 1;
    component.evaluation = { evaluationID: "E-1", grades: {}, comment: "" };
    Object.assign( component, overrides );
    return component;
}

const draftWrites = () => harness.requests.filter( ( request ) => request.url === DRAFT_URL );

describe( "Evaluation autosave", () => {

    it( "writes nothing until the form is touched", () => {
        editableEvaluation();
        assert.equal( harness.pendingTimers(), 0, "loading an evaluation must not schedule a write" );
        assert.equal( draftWrites().length, 0 );
    } );

    it( "saves a grade shortly after it is entered", () => {
        const component = editableEvaluation();
        component.setItemGrade( "E1-1", "employee", "S" );
        assert.equal( component.autosaveState, "pending" );
        assert.equal( draftWrites().length, 0, "not immediately — a keystroke is not a request" );

        harness.flushTimers();
        assert.equal( draftWrites().length, 1 );
        assert.equal( draftWrites()[ 0 ].method, "POST" );
        assert.equal( draftWrites()[ 0 ].body.evaluation.grades[ "E1-1" ].employee, "S" );
    } );

    it( "collapses a burst of edits into one write", () => {
        // The property that makes this safe to hook to every keystroke: each edit replaces the pending timer rather
        // than adding one, so typing a sentence is a single request and not one per character.
        const component = editableEvaluation();
        component.setFeedbackComment( "employee", "T" );
        component.setFeedbackComment( "employee", "Th" );
        component.setFeedbackComment( "employee", "Thi" );
        component.setFeedbackComment( "employee", "This one" );
        assert.equal( harness.pendingTimers(), 1, "four edits, one pending write" );

        harness.flushTimers();
        assert.equal( draftWrites().length, 1 );
        assert.equal( draftWrites()[ 0 ].body.evaluation.comment, "This one", "and it carries the latest text" );
    } );

    it( "saves a reset, since clearing is an edit too", () => {
        const component = editableEvaluation();
        component.evaluation.grades = { "E1-1": { employee: "S" } };
        component.resetGrades();
        harness.flushTimers();
        assert.equal( draftWrites().length, 1 );
        assert.equal( draftWrites()[ 0 ].body.evaluation.grades[ "E1-1" ].employee, "" );
    } );

    it( "never puts two writes in flight at once", async () => {
        // A slow network plus fast typing must not leave two POSTs racing, with arrival order deciding what is
        // stored. The edit that lands mid-flight waits for the first to settle and then writes once.
        const calls = [];
        let releaseFirst;
        const component = editableEvaluation( {}, {
            tiApplication: {
                sendRequest: ( url, method, body ) => {
                    const record = { url, method, body };
                    calls.push( record );
                    record.promise = ( calls.length === 1 )
                        ? new Promise( ( resolve ) => { releaseFirst = () => resolve( { isSuccessful: true, data: {} } ); } )
                        : Promise.resolve( { isSuccessful: true, data: {} } );
                    return record.promise;
                }
            }
        } );

        component.setItemGrade( "E1-1", "employee", "S" );
        harness.flushTimers();
        assert.equal( calls.length, 1 );

        component.setItemGrade( "E1-2", "employee", "R" );
        harness.flushTimers();
        assert.equal( calls.length, 1, "the second edit must wait, not race" );

        releaseFirst();
        await calls[ 0 ].promise;
        await Promise.resolve();
        await Promise.resolve();
        assert.equal( calls.length, 2, "and is written once the first settles" );
        assert.equal( calls[ 1 ].body.evaluation.grades[ "E1-2" ].employee, "R" );
    } );

    it( "reports its state so the user can see the work is safe", () => {
        const component = editableEvaluation();
        assert.equal( component.autosaveLabel(), "", "an untouched form carries no chrome" );

        component.setItemGrade( "E1-1", "employee", "S" );
        assert.equal( component.autosaveState, "pending" );
        assert.ok( component.autosaveLabel().length > 0 );
    } );

} );

describe( "Evaluation autosave — who may write", () => {

    it( "stays silent for a peer reviewer, whose draft the server refuses", () => {
        // `#saveEvaluationDraft` accepts the evaluatee's self round and a manager's or supervisor's review round,
        // and throws 422 for everything else. Role 4 has no draft to save, which is why the Save Draft button is
        // hidden for them — autosaving would be a rejected request every couple of seconds.
        const component = editableEvaluation( { userRole: 4 } );
        component.setFeedbackComment( "team", "peer note" );
        harness.flushTimers();
        assert.equal( draftWrites().length, 0 );
        assert.equal( component.autosaveState, "idle" );
    } );

    it( "stays silent for a read-only viewer", () => {
        const component = editableEvaluation( { canEdit: false } );
        component.setItemGrade( "E1-1", "employee", "S" );
        harness.flushTimers();
        assert.equal( draftWrites().length, 0 );
    } );

    it( "refuses inside runAutosave too, not only at the scheduler", () => {
        // Belt to the gate in scheduleAutosave: the queue drain calls runAutosave directly.
        const component = editableEvaluation( { userRole: 4 } );
        component.runAutosave();
        assert.equal( draftWrites().length, 0 );
    } );

} );

describe( "Evaluation autosave — one writer at a time", () => {

    /**
     * A component whose draft writes are held open until the test releases each one.
     *
     * @returns {{component: Object, calls: Array, release: function(number): void}}
     */
    function withHeldWrites() {
        const calls = [];
        const component = editableEvaluation( {}, {
            tiApplication: {
                sendRequest: ( url, method, body ) => {
                    const record = { url, method, body };
                    record.promise = new Promise( ( resolve, reject ) => {
                        record.settle = ( error ) => ( error ? reject( error ) : resolve( { isSuccessful: true, data: {} } ) );
                    } );
                    calls.push( record );
                    return record.promise;
                }
            }
        } );
        return { component: component, calls: calls };
    }

    it( "does not let Save Draft overtake an autosave already on the wire", async () => {
        // Found by CodeRabbit on #143. cancelPendingAutosave clears the timer and the queue, but cannot recall a
        // request already sent. So: autosave posts draft A, the user types B, then presses Save Draft — and B was
        // sent alongside A. If A landed second the server kept the older grades, silently, with the screen saying
        // the draft was saved. Both writers now queue behind one in-flight flag.
        const { component, calls } = withHeldWrites();

        component.setItemGrade( "E1-1", "employee", "S" );
        harness.flushTimers();
        assert.equal( calls.length, 1, "the autosave is on the wire" );

        component.setItemGrade( "E1-1", "employee", "R" );
        component.saveDraft();
        assert.equal( calls.length, 1, "the explicit save must wait, not race the autosave" );

        calls[ 0 ].settle();
        await calls[ 0 ].promise;
        await Promise.resolve();
        await Promise.resolve();

        assert.equal( calls.length, 2, "and is sent once the first settles" );
        assert.equal( calls[ 1 ].body.evaluation.grades[ "E1-1" ].employee, "R", "carrying the newer grade" );
    } );

    it( "answers a queued explicit save with its toast once it actually runs", async () => {
        const { component, calls } = withHeldWrites();
        component.setItemGrade( "E1-1", "employee", "S" );
        harness.flushTimers();
        component.saveDraft();

        calls[ 0 ].settle();
        await calls[ 0 ].promise;
        await Promise.resolve();
        await Promise.resolve();
        calls[ 1 ].settle();
        await calls[ 1 ].promise;
        await Promise.resolve();

        assert.equal( harness.notices.length, 1, "the press is still answered, late but answered" );
    } );

} );

describe( "Evaluation autosave — failure reporting", () => {

    /**
     * A component whose draft writes all reject.
     *
     * @returns {Object} the component
     */
    function alwaysFailing() {
        return editableEvaluation( {}, {
            tiApplication: {
                sendRequest: () => Promise.reject( new Error( "network down" ) )
            }
        } );
    }

    it( "announces a run of failures once, not once per attempt", async () => {
        // Found by CodeRabbit on #143. The suppression read `autosaveState`, which every attempt sets to "saving"
        // before sending — so the check could never see "failed", and every retry toasted. Exactly the spam the
        // code claimed in a comment to be preventing. The flag now lives in closure state.
        const component = alwaysFailing();

        for ( let attempt = 0; attempt < 3; attempt += 1 ) {
            component.setItemGrade( "E1-1", "employee", "S" );
            harness.flushTimers();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        }

        assert.equal( component.autosaveState, "failed" );
        assert.equal( harness.notices.length, 1, "three failures, one notice" );
    } );

    it( "speaks up again after a failure run ends in a success", async () => {
        let succeed = false;
        const component = editableEvaluation( {}, {
            tiApplication: {
                sendRequest: () => ( succeed ? Promise.resolve( { isSuccessful: true, data: {} } ) : Promise.reject( new Error( "network down" ) ) )
            }
        } );

        const settle = async () => {
            harness.flushTimers();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        };

        component.setItemGrade( "E1-1", "employee", "S" );
        await settle();
        assert.equal( harness.notices.length, 1 );

        succeed = true;
        component.setItemGrade( "E1-1", "employee", "R" );
        await settle();
        assert.equal( component.autosaveState, "saved" );

        succeed = false;
        component.setItemGrade( "E1-1", "employee", "U" );
        await settle();
        assert.equal( harness.notices.length, 2, "a new run of failures is a new thing to say" );
    } );

} );

describe( "Evaluation autosave — the explicit button still wins", () => {

    it( "Save Draft supersedes a pending autosave rather than racing it", () => {
        const component = editableEvaluation();
        component.setItemGrade( "E1-1", "employee", "S" );
        assert.equal( harness.pendingTimers(), 1 );

        component.saveDraft();
        assert.equal( harness.pendingTimers(), 0, "the queued autosave is cancelled, not left to fire again" );
        assert.equal( draftWrites().length, 1 );
    } );

    it( "keeps its confirmation toast, because the user asked", async () => {
        const component = editableEvaluation();
        component.saveDraft();
        await draftWrites()[ 0 ].promise;
        await Promise.resolve();
        assert.equal( harness.notices.length, 1, "an explicit action gets an explicit answer" );
    } );

    it( "an autosave says nothing when it succeeds", async () => {
        const component = editableEvaluation();
        component.setItemGrade( "E1-1", "employee", "S" );
        harness.flushTimers();
        await draftWrites()[ 0 ].promise;
        await Promise.resolve();
        assert.equal( harness.notices.length, 0, "a toast every two seconds would bury the one that matters" );
    } );

} );
