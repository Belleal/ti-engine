/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

/**
 * Builds the Coverage gauge TiChartSpec from a coverage report payload.
 *
 * @param {Object} coverage - `report.coverage` (carries `overall.{n,N,pct}`).
 * @param {Object} meta - `report.meta` (carries `mode`, `partial`, `pctReporting`).
 * @returns {Object} TiChartSpec of type "gauge".
 */
function buildCoverageGaugeSpec( coverage, meta ) {
    const overall = ( coverage && coverage.overall ) ? coverage.overall : { n: 0, N: 0, pct: 0 };
    const value = ( overall.N > 0 ) ? ( overall.n / overall.N ) : 0;
    const partial = !!( meta && meta.partial );
    let sublabel = String( overall.n ) + " / " + String( overall.N );
    if ( partial && meta && typeof meta.pctReporting === "number" ) {
        sublabel = sublabel + " · " + String( meta.pctReporting ) + "% reporting";
    }
    return {
        type: "gauge",
        data: { value: value, label: "Coverage", sublabel: sublabel },
        a11yLabel: "Coverage gauge: " + String( overall.n ) + " of " + String( overall.N ) + " complete",
        provisional: partial
    };
}

/**
 * Builds the per-group stacked-bars TiChartSpec from a coverage report payload.
 *
 * @param {Object} coverage - `report.coverage` (carries `byGroup[]`).
 * @param {Object} meta - `report.meta`.
 * @returns {Object} TiChartSpec of type "bars".
 */
function buildCoverageBarsSpec( coverage, meta ) {
    const groups = ( coverage && Array.isArray( coverage.byGroup ) ) ? coverage.byGroup : [];
    const rows = groups.map( function ( group ) {
        const byStatus = group.byStatus || {};
        const segments = [
            { key: "Closed", v: byStatus[ "Closed" ] || 0, tone: "success" },
            { key: "Ready", v: byStatus[ "Ready" ] || 0, tone: "success" },
            { key: "In Review", v: byStatus[ "In Review" ] || 0, tone: "warn" },
            { key: "Open", v: byStatus[ "Open" ] || 0, tone: "info" },
            { key: "Not started", v: group.notStarted || 0, tone: "" }
        ];
        return { id: String( group.groupKey || group.groupLabel || "" ), label: group.groupLabel || "", segments: segments };
    } );
    return {
        type: "bars",
        data: { rows: rows },
        options: { mode: "stacked" },
        a11yLabel: "Coverage by group: " + String( rows.length ) + " groups",
        provisional: !!( meta && meta.partial )
    };
}

if ( typeof module !== "undefined" && module.exports ) {
    module.exports = { buildCoverageGaugeSpec: buildCoverageGaugeSpec, buildCoverageBarsSpec: buildCoverageBarsSpec };
}
