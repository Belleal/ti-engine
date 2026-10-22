declare const _exports: {
    DEFAULT_ZONE: string;
    resolveTimeZone: typeof resolveTimeZone;
    getTimeZone: typeof getTimeZone;
    isTimeZoneSet: typeof isTimeZoneSet;
    verifyTimeZone: typeof verifyTimeZone;
    dateIn: typeof dateIn;
    wallClockIn: typeof wallClockIn;
    today: typeof today;
    instantOf: typeof instantOf;
};
export = _exports;
/**
 * A zone's name as the runtime writes it: `europe/sofia` is `Europe/Sofia`, and a blank one is UTC.
 * <br/>
 * A name the runtime does not know is refused rather than read as UTC, which would move every deadline by hours without
 * a word.
 *
 * @method
 * @param {string} [name]
 * @returns {string}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the runtime knows no zone of that name.
 * @public
 */
declare function resolveTimeZone(name?: string): string;
/**
 * The deployment's time zone, `localization.timeZone` (`TI_LOCALIZATION_TIME_ZONE`): the zone every calendar day of
 * the application is a date in. UTC when the deployment names none, which is the day the server has always read.
 *
 * @method
 * @returns {string}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the setting names a zone the runtime does not know.
 * @public
 */
declare function getTimeZone(): string;
/**
 * Whether the deployment named a zone. Only then does a screen read the day in it: one that names none keeps the
 * device's clock, as every screen did before the setting existed.
 *
 * @method
 * @returns {boolean}
 * @public
 */
declare function isTimeZoneSet(): boolean;
/**
 * Resolves the deployment's zone now, so a name the runtime does not know fails the start rather than the first
 * request that asks for today. `start-instance` calls it before it builds the service.
 *
 * @method
 * @returns {string} The zone.
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the setting names a zone the runtime does not know.
 * @public
 */
declare function verifyTimeZone(): string;
/**
 * The calendar date, `YYYY-MM-DD`, a zone shows at an instant.
 *
 * @method
 * @param {number} instant Milliseconds since the epoch.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {string}
 * @public
 */
declare function dateIn(instant: number, zone?: string): string;
/**
 * The wall-clock date and time, `YYYY-MM-DDTHH:MM`, a zone shows at an instant. It compares as text with a stored date
 * and time joined by `T`, so "has this begun" needs no conversion of what was stored.
 *
 * @method
 * @param {number} instant Milliseconds since the epoch.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {string}
 * @public
 */
declare function wallClockIn(instant: number, zone?: string): string;
/**
 * Today's date, `YYYY-MM-DD`, in a zone: the date every rule that compares a calendar day with today reads. The UTC
 * date turns over at 02:00 or 03:00 in Sofia, so for those hours a server reading it counted yesterday as today.
 *
 * @method
 * @param {Date|number} [now] A `Date` or milliseconds; the current time unless stated.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {string}
 * @public
 */
declare function today(now?: Date | number, zone?: string): string;
/**
 * The instant a wall-clock date and time name in a zone.
 * <br/>
 * The zone's offset a day either side is tried, which covers both sides of a daylight-saving change. A time the
 * clock shows twice, 03:30 on Sofia's autumn night, is the first of the two: a period that begins there has begun by
 * the time either is shown, so nothing runs twice in the repeated hour. A time the clock skips, 03:30 on Sofia's spring
 * night, is read in the offset before the change, which is the instant the clock shows 04:30.
 *
 * @method
 * @param {string} date `YYYY-MM-DD`.
 * @param {string} time `HH:MM`, 24-hour.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {number} Milliseconds since the epoch, or `NaN` for a date or time that is not one.
 * @public
 */
declare function instantOf(date: string, time: string, zone?: string): number;
