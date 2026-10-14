/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

"use strict";

const cache = require( "@ti-engine/core/cache" );
const tools = require( "@ti-engine/core/tools" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );

/** @import { TiJobDefinition, TiJobsReport } from "#definitions" */

// + job name → `{ at }`, the moment the job last finished. A value, so it can be read and replaced on either store.
const KEY_LAST_RUN = "ti:jobs:last:";

// The one key every tick holds, so a tick from the route and one from the timer never run the same job twice.
const LOCK_KEY = "ti:jobs";

const PERIOD_HOUR = "hour";
const PERIOD_DAY = "day";

/**
 * Application code run on a schedule: something that becomes due with the passing of time, such as a deadline coming
 * close, and that nobody's request would otherwise notice.
 * <br/>
 * The scheduler does not keep time itself. A **tick** calls {@link JobScheduler#runDueJobs}, which runs every job whose
 * period has begun since it last ran. The web server provides the tick, from the Worker's cron through a route or from
 * a timer of its own (`TI_WEB_JOBS_TRIGGER`), so a deployment whose process sleeps between requests still runs its jobs.
 * <br/>
 * A job that runs twice must be harmless: a tick that fails half-way is repeated, and a job is recorded as run only
 * once it has finished. The lock is in-process, as every lock here is: this assumes one instance serves a store.
 *
 * @class JobScheduler
 * @public
 */
class JobScheduler {

    #jobs = new Map();
    #lock = new tools.KeyedLock();

    /* Public interface */

    /**
     * Registers a job. Registered at start-up; a name registered again replaces the earlier job.
     *
     * @method
     * @param {string} name Letters, digits and `.`, `_`, `:` or `-`.
     * @param {TiJobDefinition} definition
     * @returns {JobScheduler} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a bad name, period, time of day or `run`.
     * @public
     */
    registerJob( name, definition ) {
        const { every, at, run } = definition || {};
        const time = ( every === PERIOD_DAY ) ? JobScheduler.parseTimeOfDay( at === undefined ? "00:00" : at ) : null;
        if ( typeof name !== "string" || !/^[A-Za-z0-9._:-]+$/.test( name ) || ( every !== PERIOD_HOUR && every !== PERIOD_DAY )
            || ( every === PERIOD_DAY && time === null ) || typeof run !== "function" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-job-registration", name: name } );
        }
        this.#jobs.set( name, Object.freeze( { name: name, every: every, at: time, run: run } ) );
        return this;
    }

    /**
     * Whether any job is registered.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get hasJobs() {
        return this.#jobs.size > 0;
    }

    /**
     * Runs each job that is due, one after another, and records each that finished. A job that fails is logged, is
     * not recorded, and stops none of the others: the next tick tries it again.
     *
     * @method
     * @param {Date} [now] The tick's moment; the current time unless stated.
     * @returns {Promise<TiJobsReport>}
     * @public
     */
    runDueJobs( now = new Date() ) {
        const moment = new Date( now.getTime() );
        return this.#lock.exclusively( LOCK_KEY, () => {
            const report = { ran: [], failed: [] };
            return [ ...this.#jobs.values() ].reduce( ( chain, job ) => chain.then( () => {
                return cache.instance.getValue( KEY_LAST_RUN + job.name ).then( ( last ) => {
                    const lastRun = ( last && typeof last.at === "string" ) ? Date.parse( last.at ) : NaN;
                    if ( !JobScheduler.isDue( job, lastRun, moment ) ) {
                        return undefined;
                    }
                    return Promise.resolve().then( () => job.run( { now: moment } ) ).then( () => {
                        return cache.instance.setValue( KEY_LAST_RUN + job.name, { at: moment.toISOString() } ).then( () => {
                            report.ran.push( job.name );
                            logger.log( `Job '${ job.name }' ran.`, logger.logSeverity.INFO );
                        } );
                    }, ( error ) => {
                        report.failed.push( job.name );
                        logger.log( `Job '${ job.name }' failed; the next tick runs it again.`, logger.logSeverity.ERROR, error );
                    } );
                } ).catch( ( error ) => {
                    // The store failed around the job's record. It is not marked as run, so the next tick tries it again.
                    report.failed.push( job.name );
                    logger.log( `Job '${ job.name }' could not be checked or recorded.`, logger.logSeverity.ERROR, error );
                } );
            } ), Promise.resolve() ).then( () => report );
        } );
    }

    /* Static interface */

    /**
     * Whether a job is due at a moment: its current period began after it last ran, or it never has. An hourly job's
     * period begins on the hour, a daily job's at its time of day, both in UTC. A job first seen after its time of
     * day runs on that first tick rather than waiting a day.
     *
     * @method
     * @param {{every: string, at: ?{hours: number, minutes: number}}} job
     * @param {number} lastRun Milliseconds, or `NaN` when it never ran.
     * @param {Date} now
     * @returns {boolean}
     * @public
     */
    static isDue( job, lastRun, now ) {
        return !Number.isFinite( lastRun ) || lastRun < JobScheduler.periodStart( job, now );
    }

    /**
     * The moment the period holding `now` began, in milliseconds.
     *
     * @method
     * @param {{every: string, at: ?{hours: number, minutes: number}}} job
     * @param {Date} now
     * @returns {number}
     * @public
     */
    static periodStart( job, now ) {
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        const day = now.getUTCDate();
        if ( job.every === PERIOD_HOUR ) {
            return Date.UTC( year, month, day, now.getUTCHours() );
        }
        const today = Date.UTC( year, month, day, job.at.hours, job.at.minutes );
        return ( now.getTime() >= today ) ? today : Date.UTC( year, month, day - 1, job.at.hours, job.at.minutes );
    }

    /**
     * Reads a time of day written `HH:MM`, 24-hour.
     *
     * @method
     * @param {*} value
     * @returns {{hours: number, minutes: number}|null}
     * @public
     */
    static parseTimeOfDay( value ) {
        const match = ( typeof value === "string" ) ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec( value ) : null;
        return match ? Object.freeze( { hours: Number( match[ 1 ] ), minutes: Number( match[ 2 ] ) } ) : null;
    }

}

const instance = new JobScheduler();
module.exports = JobScheduler;
JobScheduler.instance = Object.freeze( instance );
