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

    /**
     * Clamps a 0..1 value and maps it onto an arc beginning at `startAngle` (degrees, SVG screen
     * convention: 0°=east, +y=down/clockwise) spanning `sweep` degrees clockwise.
     * @param {number} value 0..1
     * @param {number} startAngle degrees
     * @param {number} sweep degrees (positive = clockwise)
     * @returns {number}
     */
    function gaugeValueToAngle( value, startAngle, sweep ) {
        let v = value;
        if ( v < 0 || Number.isNaN( v ) ) { v = 0; }
        if ( v > 1 ) { v = 1; }
        return startAngle + ( v * sweep );
    }

    function _polar( cx, cy, r, angleDeg ) {
        const a = ( angleDeg * Math.PI ) / 180;
        return { x: cx + ( r * Math.cos( a ) ), y: cy + ( r * Math.sin( a ) ) };
    }

    function _round( n ) {
        return Math.round( n * 100 ) / 100;
    }

    /**
     * Builds an SVG path "d" for a gauge value arc on a circle radius r centred at (cx,cy),
     * running clockwise from `startAngle` for value·sweep degrees.
     * @param {number} value 0..1
     * @param {{cx:number,cy:number,r:number,startAngle:number,sweep:number}} opts
     * @returns {string}
     */
    function gaugeArcPath( value, opts ) {
        const cx = opts.cx, cy = opts.cy, r = opts.r;
        const startAngle = opts.startAngle, sweep = opts.sweep;
        const endAngle = gaugeValueToAngle( value, startAngle, sweep );
        const start = _polar( cx, cy, r, startAngle );
        const end = _polar( cx, cy, r, endAngle );
        const spanned = endAngle - startAngle;
        const largeArc = ( spanned > 180 ) ? 1 : 0;
        const sweepFlag = 1; // clockwise
        return "M" + _round( start.x ) + " " + _round( start.y ) +
               " A" + r + " " + r + " 0 " + largeArc + " " + sweepFlag + " " +
               _round( end.x ) + " " + _round( end.y );
    }

    /**
     * Lays out horizontal/stacked bar segments along a track. Segment widths are proportional to
     * each segment's `v`; offsets accumulate left-to-right. With `opts.total` the denominator is
     * fixed (e.g. a roster size) so partial rows do not stretch to fill; otherwise the segments
     * normalize to their own sum.
     * @param {Array<{key:string,v:number,tone?:string}>} segments
     * @param {{width:number,total?:number}} opts
     * @returns {Array<{key:string,tone:string,x:number,width:number}>}
     */
    function barSegments( segments, opts ) {
        const width = opts.width;
        let denom = opts.total;
        if ( denom === undefined || denom === null ) {
            denom = 0;
            for ( let i = 0; i < segments.length; i++ ) {
                denom += ( segments[ i ].v || 0 );
            }
        }
        const out = [];
        let cursor = 0;
        for ( let i = 0; i < segments.length; i++ ) {
            const v = segments[ i ].v || 0;
            const w = ( denom > 0 ) ? _round( ( v / denom ) * width ) : 0;
            out.push( {
                key: segments[ i ].key,
                tone: segments[ i ].tone || "",
                x: _round( cursor ),
                width: w
            } );
            cursor += w;
        }
        return out;
    }

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

    /**
     * Creates an SVG-namespaced element and applies every attribute via setAttribute (CSP-legal).
     * Never touches element.style. Pass `doc` to inject a document in tests.
     * @param {string} tag
     * @param {Object<string,string|number>} attrs
     * @param {Document} [doc]
     * @returns {Element}
     */
    function svgEl( tag, attrs, doc ) {
        const d = doc || ( typeof document !== "undefined" ? document : null );
        const el = d.createElementNS( SVG_NS, tag );
        if ( attrs ) {
            const keys = Object.keys( attrs );
            for ( let i = 0; i < keys.length; i++ ) {
                el.setAttribute( keys[ i ], String( attrs[ keys[ i ] ] ) );
            }
        }
        return el;
    }

    /**
     * Builds the visually-hidden HTML <table class="ti-chart-sr"> a11y mirror placed beside the <svg>.
     * @param {string[]} headers
     * @param {Array<Array<string|number>>} rows
     * @param {Document} [doc]
     * @returns {HTMLTableElement}
     */
    function buildSrTable( headers, rows, doc ) {
        const d = doc || ( typeof document !== "undefined" ? document : null );
        const table = d.createElement( "table" );
        table.setAttribute( "class", "ti-chart-sr" );
        const thead = d.createElement( "thead" );
        const htr = d.createElement( "tr" );
        for ( let i = 0; i < headers.length; i++ ) {
            const th = d.createElement( "th" );
            th.textContent = String( headers[ i ] );
            htr.appendChild( th );
        }
        thead.appendChild( htr );
        table.appendChild( thead );
        const tbody = d.createElement( "tbody" );
        for ( let r = 0; r < rows.length; r++ ) {
            const tr = d.createElement( "tr" );
            for ( let c = 0; c < rows[ r ].length; c++ ) {
                const td = d.createElement( "td" );
                td.textContent = String( rows[ r ][ c ] );
                tr.appendChild( td );
            }
            tbody.appendChild( tr );
        }
        table.appendChild( tbody );
        return table;
    }

    /**
     * Lays out Coverage gauge sub-rows: each row's coverage ratio (explicit `value`, else n/total)
     * and its bar width along the track. Guards total=0.
     * @param {Array<{id:string,name:string,value?:number,n?:number,total?:number,tone?:string}>} rows
     * @param {{width:number}} opts
     * @returns {Array<{id:string,label:string,ratio:number,width:number,tone:string}>}
     */
    function gaugeRowsLayout( rows, opts ) {
        const width = opts.width;
        const out = [];
        for ( let i = 0; i < rows.length; i++ ) {
            const row = rows[ i ];
            let ratio;
            if ( typeof row.value === "number" ) {
                ratio = row.value;
            } else if ( row.total ) {
                ratio = ( row.n || 0 ) / row.total;
            } else {
                ratio = 0;
            }
            if ( ratio < 0 ) { ratio = 0; }
            if ( ratio > 1 ) { ratio = 1; }
            out.push( {
                id: row.id,
                label: row.name || row.id,
                ratio: ratio,
                width: _round( ratio * width ),
                tone: row.tone || ""
            } );
        }
        return out;
    }

    const SUPPORTED_TYPES = [ "gauge", "bars", "stat" ]; // Phase 0 subset

    /**
     * @typedef {Object} TiChartSpec
     * @property {"gauge"|"bars"|"stat"} type   Phase 0 supports these three only.
     * @property {Object}  data                 per-primitive payload (the aggregation output)
     * @property {Object}  [options]            domains, sizing, labels, formatting
     * @property {string}  a11yLabel            role=img label (also injected as <title>)
     * @property {string}  [a11yDesc]           injected as <desc>
     * @property {boolean} [provisional]        draws the "as of now / % reporting" hatch for ACTIVE cycles
     */

    /**
     * Validates + fills defaults on a chart spec. Unknown/unsupported types collapse to
     * { type:"unsupported", data:{} } so the renderer can show a graceful empty state.
     * @param {*} spec
     * @returns {TiChartSpec}
     */
    function normalizeSpec( spec ) {
        if ( !spec || typeof spec !== "object" ) {
            return { type: "unsupported", data: {}, options: {}, a11yLabel: "", a11yDesc: "", provisional: false };
        }
        const supported = ( SUPPORTED_TYPES.indexOf( spec.type ) >= 0 );
        return {
            type: supported ? spec.type : "unsupported",
            data: ( supported && spec.data && typeof spec.data === "object" ) ? spec.data : {},
            options: ( spec.options && typeof spec.options === "object" ) ? spec.options : {},
            a11yLabel: ( typeof spec.a11yLabel === "string" ) ? spec.a11yLabel : "",
            a11yDesc: ( typeof spec.a11yDesc === "string" ) ? spec.a11yDesc : "",
            provisional: Boolean( spec.provisional )
        };
    }

    return {
        SVG_NS,
        gaugeValueToAngle,
        gaugeArcPath,
        barSegments,
        normalizeSpec,
        gaugeRowsLayout,
        svgEl,
        buildSrTable,
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
