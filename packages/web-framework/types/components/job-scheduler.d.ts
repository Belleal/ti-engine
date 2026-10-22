export = JobScheduler;
import type { TiJobDefinition, TiJobSchedule, TiJobTimeOfDay, TiJobsReport } from "#definitions";
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
declare class JobScheduler {
    #private;
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
    registerJob(name: string, definition: TiJobDefinition): JobScheduler;
    /**
     * Whether any job is registered.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get hasJobs(): boolean;
    /**
     * Runs each job that is due, one after another, and records each that finished. A job that fails is logged, is
     * not recorded, and stops none of the others: the next tick tries it again.
     *
     * @method
     * @param {Date} [now] The tick's moment; the current time unless stated.
     * @returns {Promise<TiJobsReport>}
     * @public
     */
    runDueJobs(now?: Date): Promise<TiJobsReport>;
    /**
     * Whether a job is due at a moment: its current period began after it last ran, or it never has. An hourly job's
     * period begins on the hour, a daily job's at its time of day, both on the deployment's clock (core's
     * `time-zone`, UTC unless one is set). A job first seen after its time of day runs on that first tick rather than
     * waiting a day.
     *
     * @method
     * @param {TiJobSchedule} job
     * @param {number} lastRun Milliseconds, or `NaN` when it never ran.
     * @param {Date} now
     * @returns {boolean}
     * @public
     */
    static isDue(job: TiJobSchedule, lastRun: number, now: Date): boolean;
    /**
     * The moment the period holding `now` began, in milliseconds, on a zone's clock (CA-550).
     * <br/>
     * A daily job's `at` is a time on the deployment's clock: `"06:00"` is 06:00 where the organization is, across both
     * daylight-saving changes, where it used to be 06:00 UTC, 08:00 or 09:00 in Sofia. A time the clock shows twice is
     * its first showing, so the job runs once in the repeated hour; a time it skips begins the period when the clock
     * jumps past it.
     * <br/>
     * An hourly job's period begins on the zone's hour, taken as `now` less what the zone's clock shows past the hour.
     * That is the UTC hour in every whole-hour zone and the half past in a half-hour one, and it runs every real hour,
     * the repeated one included.
     *
     * @method
     * @param {TiJobSchedule} job
     * @param {Date} now
     * @param {string} [zone] The deployment's unless stated.
     * @returns {number}
     * @public
     */
    static periodStart(job: TiJobSchedule, now: Date, zone?: string): number;
    /**
     * Reads a time of day written `HH:MM`, 24-hour.
     *
     * @method
     * @param {*} value
     * @returns {TiJobTimeOfDay|null}
     * @public
     */
    static parseTimeOfDay(value: any): TiJobTimeOfDay | null;
}
declare namespace JobScheduler {
    var _a: Readonly<JobScheduler>;
    export { _a as instance };
}
