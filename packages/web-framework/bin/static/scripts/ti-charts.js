/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";

/**
 * ti-charts — hand-rolled, themeable, CSP-safe SVG chart primitives for the ti-engine web apps.
 * Phase 0 ships three primitives: gauge, bars, stat. All scale/path/format math lives in the pure
 * helpers below (unit-tested via node:test); the renderers build SVG via createElementNS +
 * setAttribute only. Dynamic visuals are presentation attributes or CSS classes — never
 * element.style.* (the single sanctioned exception is element.style.setProperty( "--var", … )).
 */
const TiCharts = ( function () {

    const SVG_NS = "http://www.w3.org/2000/svg";

    function gaugeArcPath() { throw new Error( "not implemented" ); }
    function barSegments() { throw new Error( "not implemented" ); }

    /**
     * Formats a 0..1 ratio as a percent string. Clamps to [0,1]; null/undefined/NaN → em dash.
     * @param {number} ratio
     * @param {number} [digits=0]
     * @returns {string}
     */
    function formatPercent( ratio, digits ) {
        if ( ratio === null || ratio === undefined || Number.isNaN( ratio ) ) {
            return "—";
        }
        const d = ( typeof digits === "number" ) ? digits : 0;
        let r = ratio;
        if ( r < 0 ) { r = 0; }
        if ( r > 1 ) { r = 1; }
        return ( r * 100 ).toFixed( d ) + "%";
    }

    /**
     * Formats a number to fixed digits (default 0). null/undefined/NaN → em dash.
     * @param {number} value
     * @param {number} [digits=0]
     * @returns {string}
     */
    function formatNumber( value, digits ) {
        if ( value === null || value === undefined || Number.isNaN( value ) ) {
            return "—";
        }
        const d = ( typeof digits === "number" ) ? digits : 0;
        return Number( value ).toFixed( d );
    }

    return {
        SVG_NS,
        gaugeArcPath,
        barSegments,
        formatPercent,
        formatNumber
    };
} )();

if ( typeof module !== "undefined" && module.exports ) {
    module.exports = TiCharts;
}
if ( typeof window !== "undefined" ) {
    window.TiCharts = TiCharts;
}
