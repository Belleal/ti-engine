/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const exceptions = require( "@ti-engine/core/exceptions" );
const organizationManager = require( "#organization-manager" );
const packageVersion = require( "../package.json" ).version;

// Grade-letter → numeric weight (mirrors competence-framework.js:17-22). Empty "" → null (ungraded, excluded from means).
const GRADE_WEIGHTS = Object.freeze( { S: 1.3, R: 1.0, U: 0.6, N: 0.0 } );

// Synthetic roster-minus-evaluations label — NOT the NOT_STARTED enum value.
const NOT_STARTED_LABEL = "Not started";

/**
 * Cross-evaluation cohort analytics. Pure compute + (later) snapshot projection. Mirrors the frozen-singleton
 * pattern of the other application modules (cf. data-manager.js:1062-1063). The aggregation primitives are pure:
 * they take injected data (evaluations / roster / cycle) so they unit-test with hand-built fixtures (no Redis),
 * following the task-resolver.js precedent.
 *
 * @class ResultsAnalytics
 * @singleton
 * @public
 */
class ResultsAnalytics {

    static #instance = null;

    /**
     * @constructor
     * @returns {ResultsAnalytics}
     */
    constructor() {
        if ( !ResultsAnalytics.#instance ) {
            ResultsAnalytics.#instance = this;
        }
        return ResultsAnalytics.#instance;
    }

    /**
     * Builds the normalized, privacy-reduced CohortRow[] frame for a cycle from already-fetched evaluations.
     * Pure: org-unit resolution is injected via `filter.resolveOrgUnit` so the function unit-tests without the
     * organization graph. DELETED rows are assumed already excluded by the caller (fetchEvaluations strips them);
     * the raw-read recompute branch re-applies the exclusion explicitly (see _resolveWith, Task B5).
     *
     * @method
     * @param {Array<Object>} evaluations - Already-fetched evaluations (DELETED already excluded).
     * @param {string} cycleID
     * @param {Object} filter - CohortFilter; `filter.resolveOrgUnit(employeeID)` injected by the caller.
     * @returns {Array<Object>} CohortRow[]
     * @public
     */
    buildCohortFrame( evaluations, cycleID, filter ) {
        if ( !Array.isArray( evaluations ) || !cycleID ) {
            return [];
        }
        const resolveOrgUnit = ( filter && typeof filter.resolveOrgUnit === "function" ) ? filter.resolveOrgUnit : () => "";
        const rows = [];

        for ( const evaluation of evaluations ) {
            if ( !evaluation || evaluation.cycleID !== cycleID ) {
                continue;
            }

            const stageLevel = evaluation.stageLevel || "";
            const snapshotByCode = new Map();
            const snapshot = Array.isArray( evaluation.snapshot ) ? evaluation.snapshot : [];
            for ( const entry of snapshot ) {
                if ( entry && entry.code ) {
                    snapshotByCode.set( entry.code, entry );
                }
            }

            const competencies = {};
            const grades = ( evaluation.grades && typeof evaluation.grades === "object" ) ? evaluation.grades : {};
            for ( const [ code, gradeEntry ] of Object.entries( grades ) ) {
                if ( !gradeEntry ) {
                    continue;
                }
                const snapEntry = snapshotByCode.get( code );
                const relevancy = ( snapEntry && snapEntry.relevancy && typeof snapEntry.relevancy[ stageLevel ] === "number" ) ? snapEntry.relevancy[ stageLevel ] : 0;
                const self = this.#letterOrEmpty( gradeEntry.employee );      // grades[code].employee → self
                const manager = this.#letterOrEmpty( gradeEntry.manager );
                const team = this.#teamCumulative( gradeEntry.team );          // cumulative ONLY
                competencies[ code ] = {
                    self: self,
                    manager: manager,
                    team: team,
                    selfWeight: this.#gradeWeight( self ),
                    managerWeight: this.#gradeWeight( manager ),
                    teamWeight: this.#gradeWeight( team ),
                    subcategory: snapEntry ? snapEntry.subcategory : null,
                    category: snapEntry ? snapEntry.category : null,
                    relevancy: relevancy
                };
            }

            const finalScore = ( evaluation.finalScore && typeof evaluation.finalScore.score === "number" ) ? evaluation.finalScore : null;

            rows.push( {
                evaluationID: evaluation.evaluationID,
                employeeID: evaluation.employeeID,
                managerID: evaluation.managerID || "",
                status: evaluation.status,                                  // enum VALUE string
                roleFamily: evaluation.roleFamily || "",
                specialization: ( evaluation.specialization !== undefined ) ? evaluation.specialization : null,
                stageLevel: stageLevel,
                level: stageLevel ? stageLevel.charAt( 0 ) : "",            // stage-family letter (N/J/R/S/X/T)
                organizationUnitID: resolveOrgUnit( evaluation.employeeID ) || "",
                interviewDate: ( evaluation.interviewDate !== undefined ) ? evaluation.interviewDate : null,
                isScored: finalScore !== null,
                finalScore: finalScore,
                finalInterpretation: finalScore ? ( finalScore.interpretation || null ) : null,
                competencies: competencies
            } );
        }

        return rows;
    }

    /**
     * Returns the grade letter unchanged, or "" for a missing/empty value.
     * @method
     * @param {string} [letter]
     * @returns {string}
     * @private
     */
    #letterOrEmpty( letter ) {
        return ( typeof letter === "string" && letter !== "" ) ? letter : "";
    }

    /**
     * Extracts ONLY the team cumulative letter; never copies individual[] (structural peer anonymity).
     * @method
     * @param {Object|string} [team]
     * @returns {string}
     * @private
     */
    #teamCumulative( team ) {
        if ( typeof team === "string" ) {
            return this.#letterOrEmpty( team );
        }
        if ( team && typeof team === "object" ) {
            return this.#letterOrEmpty( team.cumulative );
        }
        return "";
    }

    /**
     * Maps a grade letter to its numeric weight; "" → null (ungraded, excluded from means — never 0).
     * @method
     * @param {string} letter
     * @returns {number|null}
     * @private
     */
    #gradeWeight( letter ) {
        if ( letter === "" || letter === undefined || letter === null ) {
            return null;
        }
        return Object.prototype.hasOwnProperty.call( GRADE_WEIGHTS, letter ) ? GRADE_WEIGHTS[ letter ] : null;
    }

    /**
     * Computes the Coverage report payload from a frame + the in-scope roster. "Completed" = Ready + Closed
     * (resolved decision §7.1); "Not started" = roster employees with no evaluation row (synthetic label, not the
     * NOT_STARTED enum). Groups by roleFamily or orgUnit per filter.groupBy.
     *
     * @method
     * @param {Array<Object>} frame - CohortRow[] (only status/employeeID/roleFamily/organizationUnitID/evaluationID read).
     * @param {Array<Object>} roster - [{employeeID, name, roleFamily, organizationUnitID}].
     * @param {Object} filter - CohortFilter; filter.groupBy ∈ {"roleFamily","orgUnit"}.
     * @returns {Object} coverage payload
     * @public
     */
    computeCoverage( frame, roster, filter ) {
        const rows = Array.isArray( frame ) ? frame : [];
        const members = Array.isArray( roster ) ? roster : [];
        const groupBy = ( filter && filter.groupBy === "orgUnit" ) ? "orgUnit" : "roleFamily";

        const rowByEmployee = new Map();
        for ( const row of rows ) {
            if ( row && row.employeeID ) {
                rowByEmployee.set( row.employeeID, row );
            }
        }

        const overall = this.#emptyCoverageBucket();
        const groups = new Map();   // groupKey → { groupType, groupKey, groupLabel, bucket }
        const pending = [];

        for ( const member of members ) {
            const row = rowByEmployee.get( member.employeeID ) || null;
            const groupKey = ( groupBy === "orgUnit" ) ? ( member.organizationUnitID || "" ) : ( member.roleFamily || "" );
            if ( !groups.has( groupKey ) ) {
                groups.set( groupKey, { groupType: groupBy, groupKey: groupKey, groupLabel: groupKey, bucket: this.#emptyCoverageBucket() } );
            }
            const group = groups.get( groupKey );

            this.#tallyCoverage( overall, row );
            this.#tallyCoverage( group.bucket, row );

            const status = row ? row.status : NOT_STARTED_LABEL;
            if ( status !== configurationLoader.evaluationStatus.READY && status !== configurationLoader.evaluationStatus.CLOSED ) {
                pending.push( {
                    evaluationID: row ? row.evaluationID : null,
                    employeeID: member.employeeID,
                    name: ( member.name !== undefined ) ? member.name : null,
                    groupLabel: groupKey,
                    status: status   // one of Open / In Review / "Not started"
                } );
            }
        }

        return {
            overall: this.#finalizeCoverageBucket( overall ),
            byGroup: Array.from( groups.values() ).map( ( g ) => Object.assign(
                { groupType: g.groupType, groupKey: g.groupKey, groupLabel: g.groupLabel },
                this.#finalizeCoverageBucket( g.bucket )
            ) ),
            pending: pending
        };
    }

    /**
     * @method
     * @returns {Object} A fresh coverage accumulator.
     * @private
     */
    #emptyCoverageBucket() {
        return { N: 0, n: 0, notStarted: 0, byStatus: { "Open": 0, "In Review": 0, "Ready": 0, "Closed": 0 } };
    }

    /**
     * Tallies one roster member (with its evaluation row or null) into a coverage accumulator.
     * @method
     * @param {Object} bucket
     * @param {Object|null} row
     * @private
     */
    #tallyCoverage( bucket, row ) {
        bucket.N += 1;
        if ( !row ) {
            bucket.notStarted += 1;
            return;
        }
        if ( Object.prototype.hasOwnProperty.call( bucket.byStatus, row.status ) ) {
            bucket.byStatus[ row.status ] += 1;
        }
        if ( row.status === configurationLoader.evaluationStatus.READY || row.status === configurationLoader.evaluationStatus.CLOSED ) {
            bucket.n += 1;
        }
    }

    /**
     * Finalizes an accumulator: appends the rounded completion pct.
     * @method
     * @param {Object} bucket
     * @returns {Object}
     * @private
     */
    #finalizeCoverageBucket( bucket ) {
        const pct = ( bucket.N > 0 ) ? Math.round( ( bucket.n / bucket.N ) * 100 ) : 0;
        return { N: bucket.N, n: bucket.n, pct: pct, byStatus: bucket.byStatus, notStarted: bucket.notStarted };
    }

    /**
     * Recursively flattens an org subtree node into a de-duplicated roster. The subtree's `.employees` are direct
     * members only; descendants live under `.children` (organization-manager.js:459-470), so the roster walks
     * `.children` recursively concatenating each node's `.employees`.
     *
     * @method
     * @param {Object|null} subtree - Output of organizationManager.getOrganizationUnitSubtree(rootUnitID).
     * @returns {Array<Object>} [{employeeID, name, roleFamily, organizationUnitID}]
     * @public
     */
    buildRoster( subtree ) {
        const seen = new Set();
        const roster = [];
        const walk = ( node ) => {
            if ( !node || typeof node !== "object" ) {
                return;
            }
            const employees = Array.isArray( node.employees ) ? node.employees : [];
            for ( const employee of employees ) {
                if ( !employee || !employee.employeeID || seen.has( employee.employeeID ) ) {
                    continue;
                }
                seen.add( employee.employeeID );
                roster.push( {
                    employeeID: employee.employeeID,
                    name: ( employee.name !== undefined ) ? employee.name : null,
                    roleFamily: employee.roleFamily || "",
                    organizationUnitID: employee.organizationUnitID || ""
                } );
            }
            const children = Array.isArray( node.children ) ? node.children : [];
            for ( const child of children ) {
                walk( child );
            }
        };
        walk( subtree );
        return roster;
    }

    /**
     * Resolves the cohort scope from an injected authority descriptor. Supervisor → whole org (allowedEmployeeIDs
     * null, rooted at the resolved org root — the web layer computes orgRootUnitID via
     * organizationManager.getOrganizationRootUnitID(), Task B0). Manager → own subtree (rooted at the manager's
     * unit, allow-listed by the pre-computed subtree member IDs). The web layer computes
     * managerUnitID/subtreeEmployeeIDs via organizationManager + isSuperiorManagerOfEmployee (resolved decision
     * §7.7: full multi-level subtree).
     *
     * @method
     * @param {Object} authority - { isSupervisor, employeeID, orgRootUnitID?, managerUnitID?, subtreeEmployeeIDs? }
     * @returns {Object} { rootUnitID, allowedEmployeeIDs }
     * @public
     */
    resolveScopeFilter( authority ) {
        if ( authority && authority.isSupervisor === true ) {
            return { rootUnitID: authority.orgRootUnitID || "", allowedEmployeeIDs: null };
        }
        return {
            rootUnitID: ( authority && authority.managerUnitID ) || "",
            allowedEmployeeIDs: ( authority && Array.isArray( authority.subtreeEmployeeIDs ) ) ? authority.subtreeEmployeeIDs.slice() : []
        };
    }

    /**
     * Pure live/snapshot resolution core. Deps are injected so the branch logic unit-tests without Redis. The public
     * `resolve` wires the real singletons. A falsy cycle (the real getCycle rejection is swallowed to null by the
     * public wrapper) is treated as a CLOSED whole-org read, which projects an empty snapshot. CLOSED + whole-org →
     * snapshot projection (no recompute); CLOSED + narrow filter → recompute from the still-present closed evals
     * (re-applying the DELETED exclusion, since the raw path bypasses fetchEvaluations' default filter). ACTIVE →
     * live compute with meta.partial / pctReporting. (Coverage is the only reportKey for Phase 0.)
     *
     * @method
     * @param {Object} deps - { getCycle, fetchEvaluations, getResultsSnapshot, buildSubtree, resolveOrgUnit }
     * @param {string} cycleID
     * @param {Object} filter - CohortFilter (allowedEmployeeIDs decides whole-org vs narrow; rootUnitID roots the roster).
     * @param {string} reportKey - "coverage" for Phase 0.
     * @returns {Promise<Object>} report payload merged with { meta }.
     * @public
     */
    _resolveWith( deps, cycleID, filter, reportKey ) {
        return deps.getCycle( cycleID ).then( ( cycle ) => {
            const status = cycle ? cycle.status : configurationLoader.cycleStatus.CLOSED;   // falsy cycle (not-found) → treated as closed/empty
            const wholeOrg = !filter || filter.allowedEmployeeIDs === null;

            if ( status === configurationLoader.cycleStatus.CLOSED && wholeOrg ) {
                return deps.getResultsSnapshot( cycleID ).then( ( snapshot ) => {
                    // Project the requested report from the snapshot keyed by its OWN reportKey (CA-67: was hardcoded
                    // "coverage" in Phase 0 when only Coverage existed — that would mis-key R2–R6 read from a snapshot).
                    const payload = ( snapshot && snapshot.reports && snapshot.reports[ reportKey ] ) ? { [ reportKey ]: snapshot.reports[ reportKey ] } : this.#emptyReport( reportKey );
                    return this.#withMeta( payload, cycleID, status, null, false );
                } );
            }

            // ACTIVE (live), or CLOSED + narrow filter (recompute) — both read evals and re-apply DELETED exclusion.
            return deps.fetchEvaluations( null, false ).then( ( evaluations ) => {
                const allowed = ( filter && Array.isArray( filter.allowedEmployeeIDs ) ) ? new Set( filter.allowedEmployeeIDs ) : null;
                const liveEvals = evaluations.filter( ( evaluation ) => {
                    if ( !evaluation || evaluation.status === configurationLoader.evaluationStatus.DELETED ) {   // defensive: fetchEvaluations already strips DELETED; guard against a future change
                        return false;
                    }
                    return allowed === null || allowed.has( evaluation.employeeID );
                } );
                const frameFilter = Object.assign( {}, filter, { resolveOrgUnit: deps.resolveOrgUnit } );
                const frame = this.buildCohortFrame( liveEvals, cycleID, frameFilter );

                let roster = this.buildRoster( deps.buildSubtree( filter ) );
                if ( allowed !== null ) {
                    roster = roster.filter( ( member ) => allowed.has( member.employeeID ) );
                }

                const payload = this.#computeReport( reportKey, frame, roster, frameFilter );
                return this.#withMeta( payload, cycleID, status, frame, status === configurationLoader.cycleStatus.ACTIVE );
            } );
        } );
    }

    /**
     * Public entrypoint: wires the real singletons into the pure resolve core. The web layer first computes the
     * scope (resolveScopeFilter) and injects rootUnitID + allowedEmployeeIDs into `filter`. The real getCycle
     * REJECTS with E_APP_RESOURCE_NOT_FOUND for an unknown cycle (data-manager.js:529-530), so it is wrapped to
     * resolve null on that one exception — letting the pure core's falsy-cycle branch handle it instead of throwing.
     *
     * @method
     * @param {string} cycleID
     * @param {Object} filter - CohortFilter with rootUnitID + allowedEmployeeIDs already resolved by the web layer.
     * @param {string} reportKey
     * @returns {Promise<Object>}
     * @public
     */
    resolve( cycleID, filter, reportKey ) {
        const deps = {
            getCycle: ( id ) => dataManager.instance.getCycle( id ).catch( ( error ) => {
                if ( error && error.code === exceptions.exceptionCode.E_APP_RESOURCE_NOT_FOUND ) {
                    return null;
                }
                throw error;
            } ),
            fetchEvaluations: ( employeeID, filterClosed ) => dataManager.instance.fetchEvaluations( employeeID, filterClosed ),
            getResultsSnapshot: ( id ) => dataManager.instance.getResultsSnapshot( id ),
            buildSubtree: ( f ) => organizationManager.instance.getOrganizationUnitSubtree( f ? f.rootUnitID : "" ),
            resolveOrgUnit: ( employeeID ) => organizationManager.instance.resolveOrganizationUnitIDForEmployee( employeeID )
        };
        return this._resolveWith( deps, cycleID, filter, reportKey );
    }

    /**
     * Dispatches a frame to the requested report computation. The six leadership report keys are all listed here so a
     * new report swaps exactly one branch from its empty stub to its real compute (avoids the shared-dispatcher merge
     * hot-spot). Inputs beyond (frame, roster, filter) — archetype weights (R4/R5), calendar slots + today (R2),
     * quadrant midpoint (R3) — are injected on `filter` by the caller (the `filter.resolveOrgUnit` precedent), so this
     * signature stays stable. Reports not yet implemented return their locked empty shape via #emptyReport.
     * @method
     * @param {string} reportKey
     * @param {Array<Object>} frame
     * @param {Array<Object>} roster
     * @param {Object} filter
     * @returns {Object}
     * @private
     */
    #computeReport( reportKey, frame, roster, filter ) {
        switch ( reportKey ) {
            case "coverage":
                return { coverage: this.computeCoverage( frame, roster, filter ) };
            case "timeDistribution":   // CA-67 Task 4
            case "alignment":          // CA-67 Task 5
            case "heatmap":            // CA-67 Task 2
            case "levelDistribution":  // CA-67 Task 1
            case "predictiveDrivers":  // CA-67 Task 3
            default:
                return this.#emptyReport( reportKey );
        }
    }

    /**
     * Returns the locked empty payload for a report key (used before a report is implemented, and for the no-data /
     * not-found cycle case). Each shape matches its chart contract so the front-end renders a graceful empty state.
     * @method
     * @param {string} reportKey
     * @returns {Object}
     * @private
     */
    #emptyReport( reportKey ) {
        switch ( reportKey ) {
            case "coverage":
                return { coverage: { overall: this.#finalizeCoverageBucket( this.#emptyCoverageBucket() ), byGroup: [], pending: [] } };
            case "timeDistribution":
                return { timeDistribution: { rows: [], perManager: [] } };
            case "alignment":
                return { alignment: { points: [], quadrantCounts: {}, diagonal: true } };
            case "heatmap":
                return { heatmap: { rows: [], cols: [], cells: [] } };
            case "levelDistribution":
                return { levelDistribution: { groups: [], reference: [] } };
            case "predictiveDrivers":
                return { predictiveDrivers: { rows: [], insufficientData: true } };
            default:
                return {};
        }
    }

    /**
     * Wraps a report payload with the shared ResultMeta envelope. `reporting` = Ready+Closed rows in the frame;
     * `partial` is true only for ACTIVE cycles where not everyone is reporting. CLOSED / snapshot is always
     * partial:false (no frame is passed, so total/reporting are 0).
     * @method
     * @param {Object} payload
     * @param {string} cycleID
     * @param {string} cycleStatus
     * @param {Array<Object>|null} frame - frame (live/recompute) used for reporting counts; null for projection.
     * @param {boolean} isActive
     * @returns {Object}
     * @private
     */
    #withMeta( payload, cycleID, cycleStatus, frame, isActive ) {
        const mode = ( cycleStatus === configurationLoader.cycleStatus.ACTIVE ) ? "live" : "snapshot";
        let total = 0;
        let reporting = 0;
        if ( Array.isArray( frame ) ) {
            total = frame.length;
            reporting = frame.filter( ( row ) => row && ( row.status === configurationLoader.evaluationStatus.READY || row.status === configurationLoader.evaluationStatus.CLOSED ) ).length;
        }
        const pctReporting = ( total > 0 ) ? Math.round( ( reporting / total ) * 100 ) : 0;
        const meta = {
            cycleID: cycleID,
            mode: mode,
            cycleStatus: cycleStatus,
            computedAt: new Date().toISOString(),
            total: total,
            reporting: reporting,
            pctReporting: pctReporting,
            partial: ( isActive === true ) && ( reporting < total )
        };
        return Object.assign( {}, payload, { meta: meta } );
    }

    /**
     * Builds and persists the immutable results snapshot for a just-closed cycle. RE-READS the cycle via getCycle so
     * `actualCloseDate` (written by updateCycleStatus on ACTIVE→CLOSED, data-manager.js:602) is captured — the cycle
     * object that entered closeCycle predates that write. CONTRACT: only ever called post-close on an existing cycle;
     * getCycle rejects (E_APP_RESOURCE_NOT_FOUND) for an unknown cycleID rather than resolving null, and that rejection
     * is logged by the caller's catch, not swallowed here. Whole-org scope uses the resolved org-root unit id (never
     * the empty string, which getOrganizationUnitSubtree rejects → empty roster). Idempotent: re-running merge-writes
     * the cycle's snapshot, and since the shape is fixed every populated leaf is replaced.
     *
     * @method
     * @param {string} cycleID
     * @returns {Promise<Object>} The persisted ResultsSnapshot.
     * @public
     */
    persistResultsSnapshot( cycleID ) {
        return dataManager.instance.getCycle( cycleID ).then( ( cycle ) => {
            const rootUnitID = organizationManager.instance.getOrganizationRootUnitID();
            if ( !rootUnitID ) {
                return Promise.reject( new Error( "Cannot persist results snapshot for cycle '" + cycleID + "': organization chart not initialised" ) );
            }
            const filter = { groupBy: "orgUnit", allowedEmployeeIDs: null, rootUnitID: rootUnitID };
            const resolveOrgUnit = ( employeeID ) => organizationManager.instance.resolveOrganizationUnitIDForEmployee( employeeID );
            const frameFilter = Object.assign( {}, filter, { resolveOrgUnit: resolveOrgUnit } );
            return dataManager.instance.fetchEvaluations( null, false ).then( ( evaluations ) => {
                const cycleEvals = evaluations.filter( ( ev ) => ev && ev.cycleID === cycleID && ev.status !== configurationLoader.evaluationStatus.DELETED );
                const frame = this.buildCohortFrame( cycleEvals, cycleID, frameFilter );
                const subtree = organizationManager.instance.getOrganizationUnitSubtree( rootUnitID );
                const roster = this.buildRoster( subtree );
                const coverageReport = this.computeCoverage( frame, roster, frameFilter );
                const metaPayload = this.#withMeta( {}, cycleID, cycle.status, frame, false );
                const meta = metaPayload.meta;
                const snapshot = this.buildResultsSnapshot( cycleID, {
                    frame: frame,
                    coverageReport: coverageReport,
                    cycle: cycle,
                    dictionaryVersion: packageVersion,
                    meta: meta
                } );
                return dataManager.instance.saveResultsSnapshot( snapshot );
            } );
        } );
    }

    /**
     * Builds the immutable ResultsSnapshot for a closed cycle. PURE — takes the already-built cohort `frame`, the
     * already-computed Coverage report, and the re-read `cycle` (so `actualCloseDate` is populated). For Phase 0 only
     * `reports.coverage` is populated; the cross-cycle stable-axis aggregates are present with their locked shape but
     * empty (back-fill is impossible, so the envelope is locked now — §4 / §6).
     *
     * @method
     * @param {string} cycleID
     * @param {Object} input
     * @param {Array<Object>} input.frame - The CohortRow[] (Component B); used for cohort counts.
     * @param {Object|null} input.coverageReport - The Coverage payload (Component B computeCoverage output).
     * @param {Object} input.cycle - The re-read cycle (carries `actualCloseDate`).
     * @param {string} input.dictionaryVersion - The competence package version (code-drift guard).
     * @param {Object} input.meta - The ResultMeta envelope.
     * @returns {Object} The locked ResultsSnapshot.
     * @public
     */
    buildResultsSnapshot( cycleID, input ) {
        const frame = Array.isArray( input.frame ) ? input.frame : [];
        const coverageReport = input.coverageReport || null;
        const cycle = input.cycle || {};
        const overall = ( coverageReport && coverageReport.overall ) ? coverageReport.overall : {};

        const parts = String( cycleID ).split( "-" );
        const year = Number( parts[ 0 ] ) || 0;
        const half = parts[ 1 ];
        const chronoKey = ( year * 2 ) + ( half === "H2" ? 1 : 0 );

        const computedAt = ( input.meta && input.meta.computedAt ) ? input.meta.computedAt : new Date().toISOString();
        return {
            cycleID: cycleID,
            schemaVersion: 1,
            dictionaryVersion: input.dictionaryVersion || null,
            competencyCodeEra: "v3.0.0",
            computedAt: computedAt,
            cycleClosedAt: cycle.actualCloseDate || null,
            provisional: false,
            chronoKey: chronoKey,
            meta: input.meta || {},
            cohort: {
                nEligible: ( overall.N != null ) ? overall.N : 0,
                nClosed: frame.filter( ( r ) => r.status === configurationLoader.evaluationStatus.CLOSED ).length,
                nScored: frame.filter( ( r ) => r.isScored ).length,
                reportingPct: ( overall.pct != null ) ? overall.pct : 0
            },

            // Phase 0: only coverage is populated; the rest of the locked report envelope is present but null.
            reports: {
                coverage: coverageReport,
                timeDistribution: null,
                alignment: null,
                heatmap: null,
                levelDistribution: null,
                predictiveDrivers: null
            },

            // Cross-cycle stable-axis substrate — locked SHAPE now, populated in later phases (never back-fillable).
            overall: { finalScore: {}, tBandMix: {} },
            byCategory: {},
            bySubcategory: {},
            byStageLevel: {},
            ladderOrdinalHistogram: {},
            byRoleFamily: {},
            byOrgUnit: {}
        };
    }

}

const instance = new ResultsAnalytics();
module.exports.instance = Object.freeze( instance );

/**
 * Pure cycle selector: returns the cycle whose cycleID matches `requestedCycleID` from `cycles`,
 * or `fallbackCycle` when the request is blank/unknown. No I/O.
 *
 * @param {Array<Object>} cycles - All known cycles (each carries `cycleID`).
 * @param {string} requestedCycleID - The `?cycleID` query value (may be empty).
 * @param {Object|null} fallbackCycle - The active-or-latest cycle.
 * @returns {Object|null}
 */
function pickCycleForRequest( cycles, requestedCycleID, fallbackCycle ) {
    const wanted = String( requestedCycleID || "" ).trim();
    if ( wanted && Array.isArray( cycles ) ) {
        const match = cycles.find( ( cycle ) => cycle && cycle.cycleID === wanted );
        if ( match ) return match;
    }
    return fallbackCycle || null;
}

module.exports.pickCycleForRequest = pickCycleForRequest;

/**
 * Maturity-step expected GRADE for a competency at a stage level, from its relevancy-archetype weight curve (CA-67,
 * owner-approved Candidate 1). With `peak = max(weights)`, `intro = 0.5·peak`, `mature = 0.9·peak`: a competency is
 * expected `U` while still emerging (`w < intro`), `R` once it is core (`intro ≤ w < mature`), and `S` once it has
 * matured (`w ≥ mature`). Strict `<` on both thresholds (do not flip the boundary grade). A degenerate all-zero curve
 * (the competency is never relevant, so its grade never affects the score) returns `U`. Pure.
 *
 * @param {Object<string,number>} weights - Archetype weights keyed by stage-level (N1..T1).
 * @param {string} stageLevel
 * @returns {"U"|"R"|"S"}
 */
function expectedGradeForArchetype( weights, stageLevel ) {
    if ( !weights || typeof weights !== "object" ) {
        return "R";
    }
    let peak = 0;
    for ( const lvl of Object.keys( weights ) ) {
        const value = Number( weights[ lvl ] ) || 0;
        if ( value > peak ) { peak = value; }
    }
    if ( peak <= 0 ) {
        return "U";
    }
    const w = Number( weights[ stageLevel ] ) || 0;
    if ( w < ( 0.5 * peak ) ) { return "U"; }
    if ( w < ( 0.9 * peak ) ) { return "R"; }
    return "S";
}

/**
 * Pearson correlation coefficient of two equal-length numeric vectors. Returns null when undefined: mismatched/short
 * (n<2) inputs, or a zero-variance vector (a constant series has no linear correlation). Hand-rolled — no dependency.
 * Pure.
 *
 * @param {Array<number>} x
 * @param {Array<number>} y
 * @returns {number|null}
 */
function pearson( x, y ) {
    if ( !Array.isArray( x ) || !Array.isArray( y ) || x.length !== y.length || x.length < 2 ) {
        return null;
    }
    const n = x.length;
    let sx = 0, sy = 0;
    for ( let i = 0; i < n; i++ ) { sx += x[ i ]; sy += y[ i ]; }
    const mx = sx / n, my = sy / n;
    let cov = 0, vx = 0, vy = 0;
    for ( let i = 0; i < n; i++ ) {
        const dx = x[ i ] - mx, dy = y[ i ] - my;
        cov += dx * dy; vx += dx * dx; vy += dy * dy;
    }
    if ( vx <= 0 || vy <= 0 ) {
        return null;
    }
    return cov / Math.sqrt( vx * vy );
}

/**
 * Nearest-rank percentile of an ascending-sorted numeric array (the method named in §3 R5 for the box five-number
 * summary — no interpolation). `p` in [0,1]; p=0 → first element, p=1 → last. Returns null for an empty array. Pure.
 *
 * @param {Array<number>} sortedAsc - Values sorted ascending.
 * @param {number} p - Percentile in [0,1].
 * @returns {number|null}
 */
function nearestRankPercentile( sortedAsc, p ) {
    if ( !Array.isArray( sortedAsc ) || sortedAsc.length === 0 ) {
        return null;
    }
    const n = sortedAsc.length;
    let rank = Math.ceil( p * n );
    if ( rank < 1 ) { rank = 1; }
    if ( rank > n ) { rank = n; }
    return sortedAsc[ rank - 1 ];
}

module.exports.expectedGradeForArchetype = expectedGradeForArchetype;
module.exports.pearson = pearson;
module.exports.nearestRankPercentile = nearestRankPercentile;
