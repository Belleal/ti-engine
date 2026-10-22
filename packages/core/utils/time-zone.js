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

const config = require( "#config" );
const exceptions = require( "#exceptions" );

/**
 * The zone when the deployment names none: the one the server's day has always been read in.
 *
 * @type {string}
 * @public
 */
const DEFAULT_ZONE = "UTC";

/**
 * A day's length, for stepping a wall-clock date by one; never for adding a day to an instant, which a daylight-saving
 * change makes 23 or 25 hours long.
 *
 * @type {number}
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One wall-clock formatter per zone. Building an `Intl.DateTimeFormat` costs far more than formatting with one, and a
 * handler that reads today for every row of a list asks for the same zone each time.
 *
 * @type {Map<string, Intl.DateTimeFormat>}
 */
const formatters = new Map();

/**
 * The deployment's zone once resolved: `null` until the first read.
 *
 * @type {string|null}
 */
let resolvedZone = null;

/**
 * The name the deployment set, trimmed; empty when it set none.
 *
 * @method
 * @returns {string}
 * @private
 */
function configuredName() {
    const value = config.getSetting( config.setting.LOCALIZATION_TIME_ZONE, "" );
    return ( typeof value === "string" ) ? value.trim() : "";
}

/**
 * The wall-clock formatter for a zone.
 *
 * @method
 * @param {string} zone
 * @returns {Intl.DateTimeFormat}
 * @private
 */
function formatterFor( zone ) {
    let formatter = formatters.get( zone );
    if ( formatter === undefined ) {
        formatter = new Intl.DateTimeFormat( "en-US", {
            timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
        } );
        formatters.set( zone, formatter );
    }
    return formatter;
}

/**
 * The wall-clock parts a zone shows at an instant.
 *
 * @method
 * @param {number} instant Milliseconds since the epoch.
 * @param {string} zone
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number}}
 * @private
 */
function wallClockOf( instant, zone ) {
    const parts = {};
    formatterFor( zone ).formatToParts( new Date( instant ) ).forEach( ( part ) => {
        if ( part.type !== "literal" ) {
            parts[ part.type ] = Number( part.value );
        }
    } );
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

/**
 * How far a zone's clock is ahead of UTC at an instant, in milliseconds.
 *
 * @method
 * @param {number} instant
 * @param {string} zone
 * @returns {number}
 * @private
 */
function offsetAt( instant, zone ) {
    const shown = wallClockOf( instant, zone );
    // The clock shows whole seconds, so the instant is compared at its whole second.
    return Date.UTC( shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second ) - Math.floor( instant / 1000 ) * 1000;
}

/**
 * Pads a number to two digits.
 *
 * @method
 * @param {number} value
 * @returns {string}
 * @private
 */
function pad( value ) {
    return String( value ).padStart( 2, "0" );
}

/**
 * A zone's name as the runtime writes it: `europe/sofia` is `Europe/Sofia`, and a blank one is UTC.
 * <br/>
 * A name the runtime does not know is refused rather than read as UTC, which would move every deadline by hours without
 * a word. So is a fixed offset such as `+02:00`, which Node accepts (measured on 24.22): it is no place's zone, keeps
 * no daylight-saving rule, and a browser whose `Intl` lacks offset zones would read the device's clock instead, so the
 * screens and the server would disagree about the day without a word either.
 *
 * @method
 * @param {string} [name]
 * @returns {string}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the runtime knows no zone of that name.
 * @public
 */
function resolveTimeZone( name ) {
    const wanted = ( typeof name === "string" ) ? name.trim() : "";
    if ( wanted === "" ) {
        return DEFAULT_ZONE;
    }
    let resolved = "";
    try {
        resolved = new Intl.DateTimeFormat( "en-US", { timeZone: wanted } ).resolvedOptions().timeZone;
    } catch {
        // Refused below, with the name.
    }
    // A zone's name begins with a letter (`UTC`, `Europe/Sofia`, `Etc/GMT-2`); an offset begins with its sign.
    if ( !/^[A-Za-z]/.test( resolved ) ) {
        throw exceptions.raise( exceptions.exceptionCode.E_GEN_INVALID_ARGUMENT_TYPE, { reason: "invalid-time-zone", setting: "TI_LOCALIZATION_TIME_ZONE", value: wanted } );
    }
    return resolved;
}

/**
 * The deployment's time zone, `localization.timeZone` (`TI_LOCALIZATION_TIME_ZONE`): the zone every calendar day of
 * the application is a date in. UTC when the deployment names none, which is the day the server has always read.
 *
 * @method
 * @returns {string}
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the setting names a zone the runtime does not know.
 * @public
 */
function getTimeZone() {
    if ( resolvedZone === null ) {
        resolvedZone = resolveTimeZone( configuredName() );
    }
    return resolvedZone;
}

/**
 * Whether the deployment named a zone. Only then does a screen read the day in it: one that names none keeps the
 * device's clock, as every screen did before the setting existed.
 *
 * @method
 * @returns {boolean}
 * @public
 */
function isTimeZoneSet() {
    return configuredName() !== "";
}

/**
 * Resolves the deployment's zone now, so a name the runtime does not know fails the start rather than the first
 * request that asks for today. `start-instance` calls it before it builds the service.
 *
 * @method
 * @returns {string} The zone.
 * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} When the setting names a zone the runtime does not know.
 * @public
 */
function verifyTimeZone() {
    resolvedZone = null;
    return getTimeZone();
}

/**
 * The calendar date, `YYYY-MM-DD`, a zone shows at an instant.
 *
 * @method
 * @param {number} instant Milliseconds since the epoch.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {string}
 * @public
 */
function dateIn( instant, zone = getTimeZone() ) {
    const shown = wallClockOf( instant, zone );
    return `${ shown.year }-${ pad( shown.month ) }-${ pad( shown.day ) }`;
}

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
function wallClockIn( instant, zone = getTimeZone() ) {
    const shown = wallClockOf( instant, zone );
    return `${ shown.year }-${ pad( shown.month ) }-${ pad( shown.day ) }T${ pad( shown.hour ) }:${ pad( shown.minute ) }`;
}

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
function today( now = Date.now(), zone = getTimeZone() ) {
    return dateIn( ( now instanceof Date ) ? now.getTime() : Number( now ), zone );
}

/**
 * Every instant at which a zone's clock shows a wall-clock date and time, earliest first.
 * <br/>
 * The zone's offset a day either side is tried, which covers both sides of a daylight-saving change. A time the clock
 * shows twice, 03:30 on Sofia's autumn night, has two instants, an hour apart. A time the clock skips, 03:30 on Sofia's
 * spring night, has one: read in the offset before the change, it is the instant the clock shows 04:30. A date or a
 * time that is not one has none.
 *
 * @method
 * @param {string} date `YYYY-MM-DD`.
 * @param {string} time `HH:MM`, 24-hour.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {number[]} Milliseconds since the epoch.
 * @public
 */
function instantsOf( date, time, zone = getTimeZone() ) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec( String( date === undefined || date === null ? "" : date ) );
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec( String( time === undefined || time === null ? "" : time ) );
    if ( !dateMatch || !timeMatch ) {
        return [];
    }
    const [ year, month, day ] = [ Number( dateMatch[ 1 ] ), Number( dateMatch[ 2 ] ), Number( dateMatch[ 3 ] ) ];
    const wanted = Date.UTC( year, month - 1, day, Number( timeMatch[ 1 ] ), Number( timeMatch[ 2 ] ) );
    // A date the calendar does not have, the 31st of April, rolls over in Date.UTC; it names no wall-clock time.
    if ( new Date( wanted ).getUTCDate() !== day || new Date( wanted ).getUTCMonth() !== month - 1 ) {
        return [];
    }
    const before = wanted - offsetAt( wanted - DAY_MS, zone );
    const after = wanted - offsetAt( wanted + DAY_MS, zone );
    const shows = ( instant ) => wallClockIn( instant, zone ) === `${ date }T${ time }`;
    const valid = [ ...new Set( [ before, after ] ) ].filter( shows ).sort( ( a, b ) => a - b );
    return ( valid.length > 0 ) ? valid : [ before ];
}

/**
 * The instant a wall-clock date and time name in a zone: the first of {@link instantsOf}. A time the clock shows twice
 * is its first showing, so a period that begins there has begun by the time either is shown and nothing runs twice in
 * the repeated hour. A time the clock skips is the instant it jumps past it.
 *
 * @method
 * @param {string} date `YYYY-MM-DD`.
 * @param {string} time `HH:MM`, 24-hour.
 * @param {string} [zone] The deployment's unless stated.
 * @returns {number} Milliseconds since the epoch, or `NaN` for a date or time that is not one.
 * @public
 */
function instantOf( date, time, zone = getTimeZone() ) {
    const instants = instantsOf( date, time, zone );
    return ( instants.length > 0 ) ? instants[ 0 ] : NaN;
}

module.exports = {
    DEFAULT_ZONE: DEFAULT_ZONE,
    resolveTimeZone: resolveTimeZone,
    getTimeZone: getTimeZone,
    isTimeZoneSet: isTimeZoneSet,
    verifyTimeZone: verifyTimeZone,
    dateIn: dateIn,
    wallClockIn: wallClockIn,
    today: today,
    instantsOf: instantsOf,
    instantOf: instantOf
};
