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

    // Converts polar (cx, cy, r, angleDeg, degrees) to a Cartesian { x, y } point.
    function _polar( cx, cy, r, angleDeg ) {
        const a = ( angleDeg * Math.PI ) / 180;
        return { x: cx + ( r * Math.cos( a ) ), y: cy + ( r * Math.sin( a ) ) };
    }

    // Rounds to 2 decimals to keep SVG path strings compact.
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
            if ( Number.isNaN( ratio ) ) { ratio = 0; }
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

    // Clamps n into [lo,hi].
    function _clamp( n, lo, hi ) {
        if ( Number.isNaN( n ) ) { return lo; }
        if ( n < lo ) { return lo; }
        if ( n > hi ) { return hi; }
        return n;
    }

    /**
     * Maps scatter points + reference geometry from a data domain into the SVG plot box. Pure: no DOM.
     * x grows left→right; y is INVERTED (data max at the top). Out-of-domain points are clamped into the box.
     * Default domain is grade-weight space 0..1.3. Bubble radius scales by z when `options.bubble === "z"`.
     *
     * @param {Array<{id,x,y,z?,r?,tone?,label?}>} points
     * @param {Object} [opts] {width=100,height=100,pad=10,domain:{xMin,xMax,yMin,yMax},midX?,midY?,bubble?,zMax?,rDefault?,rMin?,rMax?,anonymize?}
     * @returns {{points:Array,diagonal:Object|null,midX:Object|null,midY:Object|null,bounds:Object}}
     */
    function scatterLayout( points, opts ) {
        const o = opts || {};
        const width = ( typeof o.width === "number" ) ? o.width : 100;
        const height = ( typeof o.height === "number" ) ? o.height : 100;
        const pad = ( typeof o.pad === "number" ) ? o.pad : 10;
        const dom = o.domain || {};
        const xMin = ( typeof dom.xMin === "number" ) ? dom.xMin : 0;
        const xMax = ( typeof dom.xMax === "number" ) ? dom.xMax : 1.3;
        const yMin = ( typeof dom.yMin === "number" ) ? dom.yMin : 0;
        const yMax = ( typeof dom.yMax === "number" ) ? dom.yMax : 1.3;
        const plotW = width - ( 2 * pad );
        const plotH = height - ( 2 * pad );
        const xSpan = ( xMax - xMin ) || 1;
        const ySpan = ( yMax - yMin ) || 1;
        const rDefault = ( typeof o.rDefault === "number" ) ? o.rDefault : 2.2;
        const rMin = ( typeof o.rMin === "number" ) ? o.rMin : 1.4;
        const rMax = ( typeof o.rMax === "number" ) ? o.rMax : 4;
        const zMax = ( typeof o.zMax === "number" && o.zMax > 0 ) ? o.zMax : 1;
        const anonymize = !!o.anonymize;

        const xScale = ( x ) => _round( pad + ( ( _clamp( x, xMin, xMax ) - xMin ) / xSpan ) * plotW );
        const yScale = ( y ) => _round( pad + plotH - ( ( _clamp( y, yMin, yMax ) - yMin ) / ySpan ) * plotH );

        const laid = [];
        const list = Array.isArray( points ) ? points : [];
        for ( let i = 0; i < list.length; i++ ) {
            const p = list[ i ];
            const x = ( typeof p.x === "number" ) ? p.x : 0;
            const y = ( typeof p.y === "number" ) ? p.y : 0;
            const z = ( typeof p.z === "number" ) ? p.z : null;
            let r = ( typeof p.r === "number" ) ? p.r : rDefault;
            if ( o.bubble === "z" && z !== null ) {
                r = _round( rMin + ( _clamp( z, 0, zMax ) / zMax ) * ( rMax - rMin ) );
            }
            laid.push( {
                id: p.id,
                label: anonymize ? "" : ( ( p.label !== undefined ) ? p.label : null ),
                tone: p.tone || "",
                x: x, y: y, z: z,
                cx: xScale( x ), cy: yScale( y ), r: r
            } );
        }

        // The diagonal (y=x reference) is opt-in via opts.diagonal; the renderer forwards data.diagonal.
        let diagonal = null;
        if ( o.diagonal ) {
            diagonal = { x1: xScale( xMin ), y1: yScale( yMin ), x2: xScale( xMax ), y2: yScale( yMax ) };
        }
        const midX = ( typeof o.midX === "number" ) ? { x: xScale( o.midX ), y1: _round( pad ), y2: _round( pad + plotH ) } : null;
        const midY = ( typeof o.midY === "number" ) ? { x1: _round( pad ), x2: _round( pad + plotW ), y: yScale( o.midY ) } : null;

        return { points: laid, diagonal: diagonal, midX: midX, midY: midY, bounds: { pad: pad, plotW: plotW, plotH: plotH, width: width, height: height } };
    }

    /**
     * Nearest-rank quantile bucket (1..buckets) for value `v` among `values`. All-equal (or empty) inputs collapse to
     * the middle bucket so a flat heatmap row does not render as all-max. Pure.
     * @param {Array<number>} values
     * @param {number} v
     * @param {number} [buckets=5]
     * @returns {number}
     */
    function quantileBucket( values, v, buckets ) {
        const b = ( typeof buckets === "number" && buckets > 0 ) ? buckets : 5;
        const arr = Array.isArray( values ) ? values.filter( ( n ) => typeof n === "number" && !Number.isNaN( n ) ) : [];
        const n = arr.length;
        if ( n === 0 ) { return Math.ceil( b / 2 ); }
        let min = arr[ 0 ], max = arr[ 0 ];
        for ( let i = 1; i < n; i++ ) { if ( arr[ i ] < min ) { min = arr[ i ]; } if ( arr[ i ] > max ) { max = arr[ i ]; } }
        if ( min === max ) { return Math.ceil( b / 2 ); }
        let le = 0;
        for ( let i = 0; i < n; i++ ) { if ( arr[ i ] <= v ) { le += 1; } }
        return _clamp( Math.ceil( ( le / n ) * b ), 1, b );
    }

    /**
     * Lays out a heatmap grid. Sequential mode buckets each cell's `v` into 1..buckets (quantileBucket); diverging
     * mode classifies each cell's `delta` as pos/neg/zero with a 0..1 magnitude vs the cohort max |delta|. Pure.
     * @param {Array<{id,label}>} rows
     * @param {Array<{id,label}>} cols
     * @param {Array<{r,c,v?,n?,expected?,delta?,suppressed?}>} cells
     * @param {Object} [opts] {width=100,rowLabelW=18,colLabelH=8,cellH=10,scale,buckets}
     * @returns {{cells:Array,rowLabels:Array,colLabels:Array,gridW:number,gridH:number,width:number,height:number}}
     */
    function heatmapLayout( rows, cols, cells, opts ) {
        const o = opts || {};
        const width = ( typeof o.width === "number" ) ? o.width : 100;
        const rowLabelW = ( typeof o.rowLabelW === "number" ) ? o.rowLabelW : 18;
        const colLabelH = ( typeof o.colLabelH === "number" ) ? o.colLabelH : 8;
        const cellH = ( typeof o.cellH === "number" ) ? o.cellH : 10;
        const scale = ( o.scale === "diverging" ) ? "diverging" : "sequential";
        const buckets = ( typeof o.buckets === "number" ) ? o.buckets : 5;
        const R = Array.isArray( rows ) ? rows : [];
        const C = Array.isArray( cols ) ? cols : [];
        const cellList = Array.isArray( cells ) ? cells : [];
        const M = C.length;
        const gridW = width - rowLabelW;
        const cellW = ( M > 0 ) ? _round( gridW / M ) : 0;
        const gridH = R.length * cellH;

        const seqValues = cellList.filter( ( cell ) => !cell.suppressed && typeof cell.v === "number" ).map( ( cell ) => cell.v );
        let maxAbs = 0;
        for ( let i = 0; i < cellList.length; i++ ) {
            const d = cellList[ i ].delta;
            if ( typeof d === "number" && Math.abs( d ) > maxAbs ) { maxAbs = Math.abs( d ); }
        }

        const laidCells = cellList.map( ( cell ) => {
            const out = {
                r: cell.r, c: cell.c,
                x: _round( rowLabelW + ( cell.c * cellW ) ),
                y: _round( colLabelH + ( cell.r * cellH ) ),
                w: cellW, h: cellH,
                v: ( typeof cell.v === "number" ) ? cell.v : null,
                n: ( typeof cell.n === "number" ) ? cell.n : null,
                expected: ( typeof cell.expected === "number" ) ? cell.expected : null,
                delta: ( typeof cell.delta === "number" ) ? cell.delta : null,
                suppressed: !!cell.suppressed
            };
            if ( !out.suppressed ) {
                if ( scale === "sequential" ) {
                    out.bucket = quantileBucket( seqValues, out.v, buckets );
                } else {
                    const d = out.delta || 0;
                    out.sign = ( d > 0 ) ? "pos" : ( d < 0 ? "neg" : "zero" );
                    out.mag = ( maxAbs > 0 ) ? _round( Math.min( 1, Math.abs( d ) / maxAbs ) ) : 0;
                }
            }
            return out;
        } );

        const rowLabels = R.map( ( row, i ) => ( { id: row.id, label: row.label || row.id, x: _round( rowLabelW - 1 ), y: _round( colLabelH + ( i * cellH ) + ( cellH / 2 ) ) } ) );
        const colLabels = C.map( ( col, i ) => ( { id: col.id, label: col.label || col.id, x: _round( rowLabelW + ( i * cellW ) + ( cellW / 2 ) ), y: _round( colLabelH - 2 ) } ) );

        return { cells: laidCells, rowLabels: rowLabels, colLabels: colLabels, gridW: gridW, gridH: gridH, width: width, height: colLabelH + gridH };
    }

    /**
     * Lays out box-plots (one box per group) over a score domain (default 0..150). Score→y is INVERTED (domain.max at
     * the top). Each group maps its five-number summary + optional expected/mean markers; global `reference` lines map
     * too. Suppressed groups carry through without box geometry. Pure.
     * @param {Array<{id,label,min,q1,median,q3,max,n?,mean?,expected?,suppressed?}>} groups
     * @param {Object} [opts] {width=100,height=70,pad=8,padLeft=12,padBottom=10,domain:{min,max},reference:[{v,label}]}
     * @returns {{boxes:Array,refs:Array,axis:Object,width:number,height:number}}
     */
    function boxLayout( groups, opts ) {
        const o = opts || {};
        const width = ( typeof o.width === "number" ) ? o.width : 100;
        const height = ( typeof o.height === "number" ) ? o.height : 70;
        const pad = ( typeof o.pad === "number" ) ? o.pad : 8;
        const padLeft = ( typeof o.padLeft === "number" ) ? o.padLeft : 12;
        const padBottom = ( typeof o.padBottom === "number" ) ? o.padBottom : 10;
        const dom = o.domain || {};
        const dMin = ( typeof dom.min === "number" ) ? dom.min : 0;
        const dMax = ( typeof dom.max === "number" ) ? dom.max : 150;
        const span = ( dMax - dMin ) || 1;
        const plotTop = pad;
        const plotBottom = height - padBottom;
        const plotH = plotBottom - plotTop;
        const plotLeft = padLeft;
        const plotRight = width - pad;
        const plotW = plotRight - plotLeft;
        const G = Array.isArray( groups ) ? groups : [];
        const slot = ( G.length > 0 ) ? ( plotW / G.length ) : 0;
        const boxW = _round( slot * 0.5 );

        const yFor = ( score ) => _round( plotBottom - ( ( _clamp( score, dMin, dMax ) - dMin ) / span ) * plotH );

        const boxes = G.map( ( g, i ) => {
            const cx = _round( plotLeft + ( slot * i ) + ( slot / 2 ) );
            if ( g.suppressed ) {
                return { id: g.id, label: g.label || g.id, cx: cx, w: boxW, x: _round( cx - ( boxW / 2 ) ), suppressed: true, n: ( typeof g.n === "number" ) ? g.n : 0 };
            }
            return {
                id: g.id, label: g.label || g.id, cx: cx, w: boxW, x: _round( cx - ( boxW / 2 ) ), suppressed: false,
                n: ( typeof g.n === "number" ) ? g.n : 0,
                min: g.min, q1: g.q1, median: g.median, q3: g.q3, max: g.max,
                yMin: yFor( g.min ), yQ1: yFor( g.q1 ), yMed: yFor( g.median ), yQ3: yFor( g.q3 ), yMax: yFor( g.max ),
                yExpected: ( typeof g.expected === "number" ) ? yFor( g.expected ) : null,
                yMean: ( typeof g.mean === "number" ) ? yFor( g.mean ) : null
            };
        } );

        const refList = Array.isArray( o.reference ) ? o.reference : [];
        const refs = refList.map( ( ref ) => ( { v: ref.v, label: ref.label || "", y: yFor( ref.v ), x1: _round( plotLeft ), x2: _round( plotRight ) } ) );

        return { boxes: boxes, refs: refs, axis: { plotLeft: plotLeft, plotRight: plotRight, plotTop: plotTop, plotBottom: plotBottom, plotW: plotW, plotH: plotH, yFor: yFor }, width: width, height: height };
    }

    /**
     * Lays out grouped horizontal bars: every row's values share one global max (so widths are comparable across rows);
     * each value becomes a sub-bar stacked vertically inside the row band. Pure.
     * @param {Array<{id,label,values:Array<{key,v,tone?}>}>} rows
     * @param {Object} [opts] {trackW=100,max?,barH=4,gap=2}
     * @returns {{rows:Array,trackW:number,max:number}}
     */
    function barsGroupedLayout( rows, opts ) {
        const o = opts || {};
        const trackW = ( typeof o.trackW === "number" ) ? o.trackW : 100;
        const barH = ( typeof o.barH === "number" ) ? o.barH : 4;
        const gap = ( typeof o.gap === "number" ) ? o.gap : 2;
        const list = Array.isArray( rows ) ? rows : [];
        let max = ( typeof o.max === "number" ) ? o.max : 0;
        if ( !( typeof o.max === "number" ) ) {
            for ( let i = 0; i < list.length; i++ ) {
                const vals = Array.isArray( list[ i ].values ) ? list[ i ].values : [];
                for ( let j = 0; j < vals.length; j++ ) { const v = vals[ j ].v || 0; if ( v > max ) { max = v; } }
            }
        }
        const outRows = list.map( ( row ) => {
            const vals = Array.isArray( row.values ) ? row.values : [];
            const bars = vals.map( ( val, i ) => ( {
                key: val.key, v: val.v || 0, tone: val.tone || "",
                width: ( max > 0 ) ? _round( ( ( val.v || 0 ) / max ) * trackW ) : 0,
                subY: _round( i * ( barH + gap ) ), height: barH
            } ) );
            return { id: row.id, label: row.label || row.id, bars: bars, rowHeight: _round( vals.length * ( barH + gap ) ) };
        } );
        return { rows: outRows, trackW: trackW, max: max };
    }

    /**
     * Lays out diverging horizontal bars centered on zero: every value shares one global max-abs; positive values
     * extend right of centre, negative left. Pure.
     * @param {Array<{id,label,values:Array<{key,v,tone?}>}>} rows
     * @param {Object} [opts] {trackW=100,maxAbs?}
     * @returns {{rows:Array,center:number,maxAbs:number}}
     */
    function barsDivergingLayout( rows, opts ) {
        const o = opts || {};
        const trackW = ( typeof o.trackW === "number" ) ? o.trackW : 100;
        const list = Array.isArray( rows ) ? rows : [];
        let maxAbs = ( typeof o.maxAbs === "number" ) ? o.maxAbs : 0;
        if ( !( typeof o.maxAbs === "number" ) ) {
            for ( let i = 0; i < list.length; i++ ) {
                const vals = Array.isArray( list[ i ].values ) ? list[ i ].values : [];
                for ( let j = 0; j < vals.length; j++ ) { const a = Math.abs( vals[ j ].v || 0 ); if ( a > maxAbs ) { maxAbs = a; } }
            }
        }
        const center = _round( trackW / 2 );
        const half = trackW / 2;
        const outRows = list.map( ( row ) => {
            const vals = Array.isArray( row.values ) ? row.values : [];
            const bars = vals.map( ( val ) => {
                const v = val.v || 0;
                const w = ( maxAbs > 0 ) ? _round( ( Math.abs( v ) / maxAbs ) * half ) : 0;
                const dir = ( v >= 0 ) ? "pos" : "neg";
                const x = ( v >= 0 ) ? center : _round( center - w );
                return { key: val.key, v: v, tone: val.tone || "", x: x, width: w, dir: dir };
            } );
            return { id: row.id, label: row.label || row.id, bars: bars };
        } );
        return { rows: outRows, center: center, maxAbs: maxAbs };
    }

    /**
     * Lays out a radar/spider chart: N axes evenly spaced (clockwise from the top), concentric polygon rings, and one
     * polygon per series with each vertex at radius rMax·(value/axisMax) on its axis. Pure (angle math in JS).
     * @param {Array<{id,label,max}>} axes
     * @param {Array<{key,values:Object,tone?,style?}>} series
     * @param {Object} [opts] {cx=50,cy=50,rMax=36,startAngle=-90,rings=[.25,.5,.75,1],labelPad=7}
     * @returns {{cx,cy,rMax,axes:Array,rings:Array,series:Array}}
     */
    function radarLayout( axes, series, opts ) {
        const o = opts || {};
        const cx = ( typeof o.cx === "number" ) ? o.cx : 50;
        const cy = ( typeof o.cy === "number" ) ? o.cy : 50;
        const rMax = ( typeof o.rMax === "number" ) ? o.rMax : 36;
        const startAngle = ( typeof o.startAngle === "number" ) ? o.startAngle : -90;
        const labelPad = ( typeof o.labelPad === "number" ) ? o.labelPad : 7;
        const ringFractions = Array.isArray( o.rings ) ? o.rings : [ 0.25, 0.5, 0.75, 1 ];
        const axisList = Array.isArray( axes ) ? axes : [];
        const n = axisList.length;
        const step = ( n > 0 ) ? ( 360 / n ) : 0;

        const axisGeom = axisList.map( ( ax, i ) => {
            const angle = startAngle + ( i * step );
            const outer = _polar( cx, cy, rMax, angle );
            const label = _polar( cx, cy, rMax + labelPad, angle );
            return {
                id: ax.id, label: ( ax.label !== undefined ) ? ax.label : ax.id,
                max: ( typeof ax.max === "number" && ax.max > 0 ) ? ax.max : 1,
                angle: angle, outerX: _round( outer.x ), outerY: _round( outer.y ),
                labelX: _round( label.x ), labelY: _round( label.y )
            };
        } );

        const rings = ringFractions.map( ( frac ) => ( {
            frac: frac,
            points: axisGeom.map( ( ag ) => { const p = _polar( cx, cy, rMax * frac, ag.angle ); return _round( p.x ) + "," + _round( p.y ); } ).join( " " )
        } ) );

        const seriesList = Array.isArray( series ) ? series : [];
        const laidSeries = seriesList.map( ( s ) => {
            const dots = [];
            const points = axisGeom.map( ( ag ) => {
                const raw = ( s.values && typeof s.values[ ag.id ] === "number" ) ? s.values[ ag.id ] : 0;
                const ratio = _clamp( raw / ag.max, 0, 1 );
                const p = _polar( cx, cy, rMax * ratio, ag.angle );
                dots.push( { x: _round( p.x ), y: _round( p.y ), axisId: ag.id, value: raw } );
                return _round( p.x ) + "," + _round( p.y );
            } );
            return { key: s.key, tone: s.tone || "", style: s.style || "", points: points.join( " " ), dots: dots };
        } );

        return { cx: cx, cy: cy, rMax: rMax, axes: axisGeom, rings: rings, series: laidSeries };
    }

    /**
     * Pure layout for the cross-cycle line/trend primitive (CA-X1). Maps a categorical x-axis (cycles, evenly spaced)
     * and N series onto a viewBox. Each series may carry a {p25,p75}-style `band` (drawn as a filled area) and null
     * gaps (the polyline breaks into separate segments — a null is NOT bridged or plotted as 0). The y-domain spans the
     * min/max over all numeric values and band edges, unless `yMax`/`zeroBaseline` pin it.
     *
     * @param {Array<{key,values:Array<number|null>,band?:Array<[number,number]|null>,tone?,style?}>} series
     * @param {Object} [opts] {width=100,height=60|28,xCount,yMax,zeroBaseline=false,sparkline=false}
     * @returns {{W,H,padL,padR,padT,padB,innerW,innerH,n,yMin,yMax,sparkline,series:Array}}
     */
    function lineLayout( series, opts ) {
        const o = opts || {};
        const sparkline = Boolean( o.sparkline );
        const W = ( typeof o.width === "number" ) ? o.width : 100;
        const H = ( typeof o.height === "number" ) ? o.height : ( sparkline ? 28 : 60 );
        const padL = sparkline ? 1 : 12;
        const padR = sparkline ? 1 : 4;
        const padT = sparkline ? 2 : 4;
        const padB = sparkline ? 2 : 10;
        const seriesList = Array.isArray( series ) ? series : [];
        const n = ( typeof o.xCount === "number" ) ? o.xCount
            : ( seriesList.length && Array.isArray( seriesList[ 0 ].values ) ? seriesList[ 0 ].values.length : 0 );
        const innerW = W - padL - padR;
        const innerH = H - padT - padB;

        let yMax = ( typeof o.yMax === "number" ) ? o.yMax : Number.NEGATIVE_INFINITY;
        let yMin = o.zeroBaseline ? 0 : Number.POSITIVE_INFINITY;
        for ( const s of seriesList ) {
            const vals = Array.isArray( s.values ) ? s.values : [];
            for ( const v of vals ) { if ( typeof v === "number" ) { if ( v > yMax ) { yMax = v; } if ( !o.zeroBaseline && v < yMin ) { yMin = v; } } }
            const band = Array.isArray( s.band ) ? s.band : [];
            for ( const b of band ) {
                if ( b && typeof b[ 1 ] === "number" && b[ 1 ] > yMax ) { yMax = b[ 1 ]; }
                if ( b && !o.zeroBaseline && typeof b[ 0 ] === "number" && b[ 0 ] < yMin ) { yMin = b[ 0 ]; }
            }
        }
        if ( !isFinite( yMax ) ) { yMax = o.zeroBaseline ? 1 : 0; }
        if ( !isFinite( yMin ) ) { yMin = 0; }
        if ( yMax <= yMin ) { yMax = yMin + 1; }

        const xAt = ( i ) => ( n <= 1 ) ? ( padL + ( innerW / 2 ) ) : ( padL + ( ( innerW * i ) / ( n - 1 ) ) );
        const yAt = ( v ) => padT + ( innerH * ( 1 - ( ( v - yMin ) / ( yMax - yMin ) ) ) );

        const laidSeries = seriesList.map( ( s ) => {
            const vals = Array.isArray( s.values ) ? s.values : [];
            const dots = [];
            const segments = [];
            let current = [];
            for ( let i = 0; i < n; i++ ) {
                const v = vals[ i ];
                if ( typeof v === "number" ) {
                    const x = _round( xAt( i ) ), y = _round( yAt( v ) );
                    current.push( x + "," + y );
                    dots.push( { x: x, y: y, xIndex: i, value: v } );
                } else if ( current.length ) {
                    segments.push( current.join( " " ) );
                    current = [];
                }
            }
            if ( current.length ) { segments.push( current.join( " " ) ); }

            let band = null;
            const bandPairs = Array.isArray( s.band ) ? s.band : [];
            if ( bandPairs.length ) {
                const ups = [], los = [];
                for ( let i = 0; i < n; i++ ) {
                    const b = bandPairs[ i ];
                    if ( b && typeof b[ 0 ] === "number" && typeof b[ 1 ] === "number" ) {
                        ups.push( _round( xAt( i ) ) + "," + _round( yAt( b[ 1 ] ) ) );
                        los.unshift( _round( xAt( i ) ) + "," + _round( yAt( b[ 0 ] ) ) );
                    }
                }
                if ( ups.length ) { band = ups.concat( los ).join( " " ); }
            }
            return { key: s.key, tone: s.tone || "", style: s.style || "", segments: segments, dots: dots, band: band };
        } );

        return { W: W, H: H, padL: padL, padR: padR, padT: padT, padB: padB, innerW: innerW, innerH: innerH, n: n, yMin: yMin, yMax: yMax, sparkline: sparkline, series: laidSeries };
    }

    /**
     * Attaches CSP-safe drill interactivity to an element: tabindex/role + click & Enter/Space listeners dispatching a
     * bubbling `ti-chart:select` CustomEvent. In non-DOM environments (unit tests) it sets the a11y attributes and
     * returns without wiring listeners.
     * @param {Element} el
     * @param {Object} detail
     */
    function _attachSelect( el, detail, label ) {
        el.setAttribute( "tabindex", "0" );
        el.setAttribute( "role", "button" );
        if ( label ) { el.setAttribute( "aria-label", label ); }
        if ( typeof el.addEventListener !== "function" || typeof CustomEvent === "undefined" ) { return; }
        const fire = () => { el.dispatchEvent( new CustomEvent( "ti-chart:select", { detail: detail, bubbles: true } ) ); };
        el.addEventListener( "click", fire );
        el.addEventListener( "keydown", ( e ) => { if ( e.key === "Enter" || e.key === " " ) { e.preventDefault(); fire(); } } );
    }

    const SUPPORTED_TYPES = [ "gauge", "bars", "stat", "scatter", "heatmap", "box", "radar", "line" ]; // P0 gauge/bars/stat; 1A scatter/heatmap/box; P3 radar; P4 line

    /**
     * @typedef {Object} TiChartSpec
     * @property {"gauge"|"bars"|"stat"|"scatter"|"heatmap"|"box"|"radar"} type   P0: gauge/bars/stat; 1A: scatter/heatmap/box; P3: radar.
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

    function _clearChildren( node ) {
        while ( node.firstChild ) { node.removeChild( node.firstChild ); }
    }

    /**
     * Renders a Coverage-style gauge: a 270° track, a value arc (dashed cap when provisional),
     * a centre value, a label, an optional sublabel ("% reporting" caveat), and optional sub-rows.
     * All geometry from gaugeArcPath/gaugeRowsLayout.
     * @param {Element} figure host <figure class="ti-chart">
     * @param {TiChartSpec} spec
     */
    function renderGauge( figure, spec ) {
        const data = spec.data;
        const value = ( typeof data.value === "number" ) ? data.value : 0;
        const geom = { cx: 50, cy: 50, r: 42, startAngle: -225, sweep: 270 };

        const svg = svgEl( "svg", { viewBox: "0 0 100 100", preserveAspectRatio: "xMidYMid meet", role: "img" } );
        const title = svgEl( "title", {} ); title.textContent = spec.a11yLabel; svg.appendChild( title );
        if ( spec.a11yDesc ) { const desc = svgEl( "desc", {} ); desc.textContent = spec.a11yDesc; svg.appendChild( desc ); }

        const track = svgEl( "path", { d: gaugeArcPath( 1, geom ), class: "ti-chart-gauge-track", fill: "none" } );
        svg.appendChild( track );

        const arc = svgEl( "path", { d: gaugeArcPath( value, geom ), class: "ti-chart-gauge-arc", fill: "none" } );
        if ( spec.provisional ) { arc.setAttribute( "stroke-dasharray", "4 3" ); }
        svg.appendChild( arc );

        const valueText = svgEl( "text", { x: 50, y: 48, class: "ti-chart-gauge-value", "text-anchor": "middle", "dominant-baseline": "central" } );
        valueText.textContent = formatPercent( value );
        svg.appendChild( valueText );

        if ( data.label ) {
            const labelText = svgEl( "text", { x: 50, y: 62, class: "ti-chart-gauge-label", "text-anchor": "middle" } );
            labelText.textContent = data.label;
            svg.appendChild( labelText );
        }
        if ( data.sublabel ) {
            const subText = svgEl( "text", { x: 50, y: 71, class: "ti-chart-gauge-sublabel", "text-anchor": "middle" } );
            subText.textContent = data.sublabel;
            svg.appendChild( subText );
        }

        figure.appendChild( svg );

        // a11y mirror: overall (+ the reporting caveat) + each sub-row
        const headers = [ "Group", "Coverage" ];
        const srRows = [ [ data.label || spec.a11yLabel, formatPercent( value ) ] ];
        if ( data.sublabel ) { srRows.push( [ "Reporting", data.sublabel ] ); }
        if ( Array.isArray( data.rows ) ) {
            const laid = gaugeRowsLayout( data.rows, { width: 100 } );
            for ( let i = 0; i < laid.length; i++ ) { srRows.push( [ laid[ i ].label, formatPercent( laid[ i ].ratio ) ] ); }
        }
        figure.appendChild( buildSrTable( headers, srRows ) );
    }

    // Appends a <title>/<desc> pair to an svg from the spec's a11y fields.
    function _appendA11yTitle( svg, spec ) {
        const title = svgEl( "title", {} ); title.textContent = spec.a11yLabel; svg.appendChild( title );
        if ( spec.a11yDesc ) { const desc = svgEl( "desc", {} ); desc.textContent = spec.a11yDesc; svg.appendChild( desc ); }
    }

    /**
     * Renders bars. Dispatches on options.mode: "stacked" (default, the Phase-0 horizontal stacked segments),
     * "grouped" (sub-bars per row sharing one global max — R2 time), "diverging" (centered on zero — R6 drivers).
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderBars( figure, spec ) {
        const mode = ( spec.options && spec.options.mode ) || "stacked";
        if ( mode === "grouped" ) { return _renderBarsGrouped( figure, spec ); }
        if ( mode === "diverging" ) { return _renderBarsDiverging( figure, spec ); }
        return _renderBarsStacked( figure, spec );
    }

    /**
     * Horizontal stacked bars (Phase 0 behavior). Each row is a track of segments laid out by barSegments; a
     * provisional "Not started" tail is dashed/dimmed via the .ti-chart-provisional class.
     */
    function _renderBarsStacked( figure, spec ) {
        const data = spec.data;
        const rows = Array.isArray( data.rows ) ? data.rows : [];
        if ( rows.length === 0 ) {
            figure.setAttribute( "data-ti-chart-empty", "1" );
            return;
        }
        // viewBox units — not CSS pixels
        const trackW = 100, rowH = 14, gap = 8, padTop = 4;
        const height = padTop + ( rows.length * ( rowH + gap ) );

        const svg = svgEl( "svg", { viewBox: "0 0 100 " + height, preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        const srRows = [];
        for ( let r = 0; r < rows.length; r++ ) {
            const y = padTop + ( r * ( rowH + gap ) );
            const segSource = rows[ r ].segments || rows[ r ].values || [];
            const segs = barSegments( segSource, { width: trackW, total: rows[ r ].total } );
            for ( let s = 0; s < segs.length; s++ ) {
                let cls = "ti-chart-bar-seg";
                if ( segs[ s ].tone ) { cls = cls + " tone-" + segs[ s ].tone; }
                if ( spec.provisional && segs[ s ].key === "Not started" ) { cls = cls + " ti-chart-provisional"; }
                const rect = svgEl( "rect", { x: segs[ s ].x, y: y, width: segs[ s ].width, height: rowH, rx: 2, class: cls } );
                svg.appendChild( rect );
                srRows.push( [ rows[ r ].label || rows[ r ].id, segs[ s ].key, String( segSource[ s ].v || 0 ) ] );
            }
        }
        figure.appendChild( svg );
        figure.appendChild( buildSrTable( [ "Row", "Segment", "Count" ], srRows ) );
    }

    /**
     * Grouped horizontal bars: per row, one sub-bar per value, all widths on one shared global max so rows compare.
     */
    function _renderBarsGrouped( figure, spec ) {
        const data = spec.data;
        const rows = Array.isArray( data.rows ) ? data.rows : [];
        if ( rows.length === 0 ) { figure.setAttribute( "data-ti-chart-empty", "1" ); return; }
        const trackW = 100, rowGap = 6, labelH = 5, padTop = 4;
        const layout = barsGroupedLayout( rows, { trackW: trackW } );
        let height = padTop;
        for ( let i = 0; i < layout.rows.length; i++ ) { height += labelH + layout.rows[ i ].rowHeight + rowGap; }

        const svg = svgEl( "svg", { viewBox: "0 0 100 " + _round( height ), preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        const srRows = [];
        let cursorY = padTop;
        for ( let r = 0; r < layout.rows.length; r++ ) {
            const row = layout.rows[ r ];
            const lbl = svgEl( "text", { x: 0, y: _round( cursorY + 3.5 ), class: "ti-chart-bar-label" } ); lbl.textContent = row.label; svg.appendChild( lbl );
            const barsTop = cursorY + labelH;
            for ( let b = 0; b < row.bars.length; b++ ) {
                const bar = row.bars[ b ];
                let cls = "ti-chart-bar-seg"; if ( bar.tone ) { cls = cls + " tone-" + bar.tone; }
                const rect = svgEl( "rect", { x: 0, y: _round( barsTop + bar.subY ), width: bar.width, height: bar.height, rx: 1, class: cls } );
                if ( spec.provisional ) { rect.setAttribute( "opacity", "0.7" ); }
                svg.appendChild( rect );
                srRows.push( [ row.label, bar.key, String( bar.v ) ] );
            }
            cursorY = barsTop + row.rowHeight + rowGap;
        }
        figure.appendChild( svg );
        figure.appendChild( buildSrTable( [ "Row", "Series", "Value" ], srRows ) );
    }

    /**
     * Diverging horizontal bars centered on zero: per row, one bar per signed value; positive extends right, negative
     * left, on one shared max-abs. A center axis line marks zero.
     */
    function _renderBarsDiverging( figure, spec ) {
        const data = spec.data;
        const rows = Array.isArray( data.rows ) ? data.rows : [];
        if ( rows.length === 0 ) { figure.setAttribute( "data-ti-chart-empty", "1" ); return; }
        // Landscape viewBox (width 200) so a 9-row diverging chart reads wide, not portrait; the bar math scales to trackW.
        const trackW = 200, rowH = 8, gap = 3, labelH = 5, padTop = 4;
        const layout = barsDivergingLayout( rows, { trackW: trackW } );
        const bandH = labelH + rowH + gap;
        const height = padTop + ( layout.rows.length * bandH );

        const svg = svgEl( "svg", { viewBox: "0 0 200 " + _round( height ), preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );
        svg.appendChild( svgEl( "line", { x1: layout.center, y1: padTop, x2: layout.center, y2: _round( height ), class: "ti-chart-bar-axis" } ) );

        const srRows = [];
        for ( let r = 0; r < layout.rows.length; r++ ) {
            const row = layout.rows[ r ];
            const bandTop = padTop + ( r * bandH );
            const lbl = svgEl( "text", { x: 0, y: _round( bandTop + 3.5 ), class: "ti-chart-bar-label" } ); lbl.textContent = row.label; svg.appendChild( lbl );
            const barsTop = bandTop + labelH;
            const sub = Math.max( 1, row.bars.length );
            const subH = rowH / sub;
            for ( let b = 0; b < row.bars.length; b++ ) {
                const bar = row.bars[ b ];
                let cls = "ti-chart-bar-seg"; if ( bar.tone ) { cls = cls + " tone-" + bar.tone; }
                const rect = svgEl( "rect", { x: bar.x, y: _round( barsTop + ( b * subH ) ), width: bar.width, height: _round( subH * 0.9 ), rx: 0.5, class: cls } );
                if ( spec.provisional ) { rect.setAttribute( "opacity", "0.7" ); }
                svg.appendChild( rect );
                srRows.push( [ row.label, bar.key, String( bar.v ) ] );
            }
        }
        figure.appendChild( svg );
        figure.appendChild( buildSrTable( [ "Row", "Series", "Gap" ], srRows ) );
    }

    /**
     * Renders a KPI stat tile (HTML+SVG-free). value/label/sub plus an optional pct mini-bar whose
     * fill width rides as a CSS var via setProperty (the sanctioned style exception).
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderStat( figure, spec ) {
        const data = spec.data;
        const doc = ( typeof document !== "undefined" ) ? document : null;
        const wrap = doc.createElement( "div" ); wrap.setAttribute( "class", "ti-chart-stat" );
        const valueEl = doc.createElement( "div" ); valueEl.setAttribute( "class", "ti-chart-stat-value tabular-nums" );
        const hasValue = ( typeof data.value === "number" && Number.isFinite( data.value ) );
        valueEl.textContent = hasValue ? formatNumber( data.value ) : "—";
        wrap.appendChild( valueEl );
        if ( data.label ) { const l = doc.createElement( "div" ); l.setAttribute( "class", "ti-chart-stat-label" ); l.textContent = data.label; wrap.appendChild( l ); }
        if ( data.sub ) { const sub = doc.createElement( "div" ); sub.setAttribute( "class", "ti-chart-stat-sub" ); sub.textContent = data.sub; wrap.appendChild( sub ); }
        if ( typeof data.pct === "number" ) {
            const bar = doc.createElement( "div" ); bar.setAttribute( "class", "ti-chart-stat-bar" );
            const fill = doc.createElement( "div" ); fill.setAttribute( "class", "ti-chart-stat-fill" );
            fill.style.setProperty( "--pct", formatPercent( data.pct ) ); // sanctioned --var exception
            bar.appendChild( fill ); wrap.appendChild( bar );
        }
        figure.appendChild( wrap );
        figure.appendChild( buildSrTable( [ "Metric", "Value" ], [ [ data.label || spec.a11yLabel, ( hasValue ? formatNumber( data.value ) : "—" ) ] ] ) );
    }

    /**
     * Renders a scatter plot (R3 alignment quadrant): optional quadrant midlines + y=x diagonal, then one circle per
     * point (radius from z when options.bubble==="z"). Points are drill-interactive unless options.anonymize.
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderScatter( figure, spec ) {
        const data = spec.data;
        const points = Array.isArray( data.points ) ? data.points : [];
        const opts = Object.assign( {}, spec.options, { diagonal: !!data.diagonal } );
        const anonymize = !!( spec.options && spec.options.anonymize );
        const layout = scatterLayout( points, opts );

        const svg = svgEl( "svg", { viewBox: "0 0 100 100", preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        if ( layout.midX ) { svg.appendChild( svgEl( "line", { x1: layout.midX.x, y1: layout.midX.y1, x2: layout.midX.x, y2: layout.midX.y2, class: "ti-chart-scatter-mid" } ) ); }
        if ( layout.midY ) { svg.appendChild( svgEl( "line", { x1: layout.midY.x1, y1: layout.midY.y, x2: layout.midY.x2, y2: layout.midY.y, class: "ti-chart-scatter-mid" } ) ); }
        if ( layout.diagonal ) { svg.appendChild( svgEl( "line", { x1: layout.diagonal.x1, y1: layout.diagonal.y1, x2: layout.diagonal.x2, y2: layout.diagonal.y2, class: "ti-chart-scatter-diag" } ) ); }

        const srRows = [];
        for ( let i = 0; i < layout.points.length; i++ ) {
            const p = layout.points[ i ];
            let cls = "ti-chart-scatter-pt"; if ( p.tone ) { cls = cls + " tone-" + p.tone; }
            if ( spec.provisional ) { cls = cls + " ti-chart-provisional"; }
            const circle = svgEl( "circle", { cx: p.cx, cy: p.cy, r: p.r, class: cls } );
            if ( !anonymize ) {
                _attachSelect( circle, { id: p.id, label: p.label } );
                if ( p.label ) { const t = svgEl( "title", {} ); t.textContent = String( p.label ); circle.appendChild( t ); }
            }
            svg.appendChild( circle );
            srRows.push( [ anonymize ? "" : ( ( p.label !== null && p.label !== undefined ) ? String( p.label ) : String( p.id || "" ) ), formatNumber( p.x, 2 ), formatNumber( p.y, 2 ), ( p.z !== null ) ? formatNumber( p.z, 2 ) : "—" ] );
        }
        figure.appendChild( svg );
        figure.appendChild( buildSrTable( [ "Point", "Manager", "Self", "Team" ], srRows ) );
    }

    /**
     * Renders a heatmap (R4): a grid of cells colored by a sequential quantile ramp (cell-q1..5) or a diverging
     * grade scale (cell-pos/neg with magnitude as the opacity presentation attribute), plus row/column labels.
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderHeatmap( figure, spec ) {
        const data = spec.data;
        const rows = Array.isArray( data.rows ) ? data.rows : [];
        const cols = Array.isArray( data.cols ) ? data.cols : [];
        const cells = Array.isArray( data.cells ) ? data.cells : [];
        if ( rows.length === 0 || cols.length === 0 ) { figure.setAttribute( "data-ti-chart-empty", "1" ); return; }
        const scale = ( spec.options && spec.options.scale === "diverging" ) ? "diverging" : "sequential";
        const layout = heatmapLayout( rows, cols, cells, Object.assign( {}, spec.options, { scale: scale } ) );

        const svg = svgEl( "svg", { viewBox: "0 0 100 " + _round( layout.height ), preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        const _heatRowLabels = rows.map( ( r ) => r.label || r.id );
        const _heatColLabels = cols.map( ( c ) => c.label || c.id );
        for ( let i = 0; i < layout.cells.length; i++ ) {
            const cell = layout.cells[ i ];
            let cls = "ti-chart-heat-cell";
            if ( cell.suppressed ) { cls = cls + " suppressed"; }
            else if ( scale === "sequential" ) { cls = cls + " cell-q" + cell.bucket; }
            else { cls = cls + " cell-" + cell.sign; }
            const rect = svgEl( "rect", { x: cell.x, y: cell.y, width: cell.w, height: cell.h, class: cls } );
            if ( scale === "diverging" && !cell.suppressed && cell.sign !== "zero" ) { rect.setAttribute( "opacity", String( _round( 0.25 + ( 0.75 * cell.mag ) ) ) ); }
            if ( !cell.suppressed ) {
                const cellV = ( scale === "diverging" ) ? formatNumber( cell.delta, 2 ) : formatNumber( cell.v, 2 );
                const cellLabel = String( _heatRowLabels[ cell.r ] || cell.r ) + " / " + String( _heatColLabels[ cell.c ] || cell.c ) + ": " + cellV;
                _attachSelect( rect, { r: cell.r, c: cell.c }, cellLabel );
            }
            svg.appendChild( rect );
        }
        for ( let i = 0; i < layout.rowLabels.length; i++ ) {
            const rl = layout.rowLabels[ i ];
            const t = svgEl( "text", { x: rl.x, y: rl.y, class: "ti-chart-heat-label", "text-anchor": "end", "dominant-baseline": "central" } ); t.textContent = String( rl.label ); svg.appendChild( t );
        }
        for ( let i = 0; i < layout.colLabels.length; i++ ) {
            const cl = layout.colLabels[ i ];
            const t = svgEl( "text", { x: cl.x, y: cl.y, class: "ti-chart-heat-label", "text-anchor": "middle" } ); t.textContent = String( cl.label ); svg.appendChild( t );
        }
        figure.appendChild( svg );

        const srRows = [];
        const colByIndex = cols.map( ( c ) => c.label || c.id );
        const rowByIndex = rows.map( ( r ) => r.label || r.id );
        for ( let i = 0; i < layout.cells.length; i++ ) {
            const cell = layout.cells[ i ];
            const v = cell.suppressed ? "n<min" : ( ( scale === "diverging" ) ? formatNumber( cell.delta, 2 ) : formatNumber( cell.v, 2 ) );
            srRows.push( [ String( rowByIndex[ cell.r ] || cell.r ), String( colByIndex[ cell.c ] || cell.c ), v ] );
        }
        figure.appendChild( buildSrTable( [ "Row", "Column", ( scale === "diverging" ) ? "Gap" : "Value" ], srRows ) );
    }

    /**
     * Renders box-plots (R5 level correlation): one box per group (q1..q3 with median line + min/max whiskers), an
     * optional dashed expected marker and mean dot, plus global reference line(s).
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderBox( figure, spec ) {
        const data = spec.data;
        const groups = Array.isArray( data.groups ) ? data.groups : [];
        if ( groups.length === 0 ) { figure.setAttribute( "data-ti-chart-empty", "1" ); return; }
        const layout = boxLayout( groups, Object.assign( { reference: data.reference }, spec.options ) );

        const svg = svgEl( "svg", { viewBox: "0 0 " + _round( layout.width ) + " " + _round( layout.height ), preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        // global reference lines (e.g. T3)
        for ( let i = 0; i < layout.refs.length; i++ ) {
            const ref = layout.refs[ i ];
            svg.appendChild( svgEl( "line", { x1: ref.x1, y1: ref.y, x2: ref.x2, y2: ref.y, class: "ti-chart-box-ref" } ) );
            if ( ref.label ) { const t = svgEl( "text", { x: ref.x2, y: _round( ref.y - 0.5 ), class: "ti-chart-box-ref-label", "text-anchor": "end" } ); t.textContent = String( ref.label ); svg.appendChild( t ); }
        }

        const srRows = [];
        for ( let i = 0; i < layout.boxes.length; i++ ) {
            const box = layout.boxes[ i ];
            const lbl = svgEl( "text", { x: box.cx, y: _round( layout.axis.plotBottom + 6 ), class: "ti-chart-box-label", "text-anchor": "middle" } ); lbl.textContent = String( box.label ); svg.appendChild( lbl );
            if ( box.suppressed ) { srRows.push( [ String( box.label ), "n<min", "", "", "", "", String( box.n ) ] ); continue; }
            // whisker (min..max) + caps
            svg.appendChild( svgEl( "line", { x1: box.cx, y1: box.yMax, x2: box.cx, y2: box.yMin, class: "ti-chart-box-whisker" } ) );
            svg.appendChild( svgEl( "line", { x1: _round( box.cx - ( box.w / 3 ) ), y1: box.yMax, x2: _round( box.cx + ( box.w / 3 ) ), y2: box.yMax, class: "ti-chart-box-cap" } ) );
            svg.appendChild( svgEl( "line", { x1: _round( box.cx - ( box.w / 3 ) ), y1: box.yMin, x2: _round( box.cx + ( box.w / 3 ) ), y2: box.yMin, class: "ti-chart-box-cap" } ) );
            // box (q1..q3) — note yQ3 (higher score) is the smaller pixel, so it is the top
            const boxRect = svgEl( "rect", { x: box.x, y: box.yQ3, width: box.w, height: _round( box.yQ1 - box.yQ3 ), class: "ti-chart-box-box" } );
            const boxLabel = String( box.label ) + ": " + formatNumber( box.q1 ) + "–" + formatNumber( box.q3 ) + " med " + formatNumber( box.median );
            _attachSelect( boxRect, { id: box.id }, boxLabel );
            svg.appendChild( boxRect );
            svg.appendChild( svgEl( "line", { x1: box.x, y1: box.yMed, x2: _round( box.x + box.w ), y2: box.yMed, class: "ti-chart-box-median" } ) );
            if ( box.yExpected !== null ) { svg.appendChild( svgEl( "line", { x1: _round( box.cx - ( box.w / 2 ) ), y1: box.yExpected, x2: _round( box.cx + ( box.w / 2 ) ), y2: box.yExpected, class: "ti-chart-box-expected" } ) ); }
            if ( box.yMean !== null ) { svg.appendChild( svgEl( "circle", { cx: box.cx, cy: box.yMean, r: 0.9, class: "ti-chart-box-mean" } ) ); }
            srRows.push( [ String( box.label ), formatNumber( box.min ), formatNumber( box.q1 ), formatNumber( box.median ), formatNumber( box.q3 ), formatNumber( box.max ), String( box.n ) ] );
        }
        figure.appendChild( svg );
        figure.appendChild( buildSrTable( [ "Level", "Min", "Q1", "Median", "Q3", "Max", "N" ], srRows ) );
    }

    /**
     * Renders a radar/spider chart (the individual 9-subcategory profile): concentric polygon rings, axis spokes +
     * labels, one filled polygon per series (self/manager/team), and an optional dashed "expected" series. All geometry
     * via radarLayout + setAttribute; an "expected"/provisional series draws unfilled with stroke-dasharray.
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderRadar( figure, spec ) {
        const data = spec.data;
        const axes = Array.isArray( data.axes ) ? data.axes : [];
        const series = Array.isArray( data.series ) ? data.series : [];
        if ( axes.length === 0 ) { figure.setAttribute( "data-ti-chart-empty", "1" ); return; }
        const layout = radarLayout( axes, series, spec.options || {} );

        const svg = svgEl( "svg", { viewBox: "0 0 100 100", preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        for ( let i = 0; i < layout.rings.length; i++ ) {
            svg.appendChild( svgEl( "polygon", { points: layout.rings[ i ].points, class: "ti-chart-radar-ring", fill: "none" } ) );
        }
        for ( let i = 0; i < layout.axes.length; i++ ) {
            const ax = layout.axes[ i ];
            svg.appendChild( svgEl( "line", { x1: layout.cx, y1: layout.cy, x2: ax.outerX, y2: ax.outerY, class: "ti-chart-radar-spoke" } ) );
            const t = svgEl( "text", { x: ax.labelX, y: ax.labelY, class: "ti-chart-radar-axis-label", "text-anchor": "middle", "dominant-baseline": "central" } );
            t.textContent = String( ax.label ); svg.appendChild( t );
        }
        for ( let i = 0; i < layout.series.length; i++ ) {
            const s = layout.series[ i ];
            let cls = "ti-chart-radar-poly"; if ( s.tone ) { cls = cls + " tone-" + s.tone; }
            const poly = svgEl( "polygon", { points: s.points, class: cls } );
            if ( s.style === "dashed" || spec.provisional ) { poly.setAttribute( "fill", "none" ); poly.setAttribute( "stroke-dasharray", "3 2" ); }
            svg.appendChild( poly );
            for ( let d = 0; d < s.dots.length; d++ ) {
                let dotCls = "ti-chart-radar-dot"; if ( s.tone ) { dotCls = dotCls + " tone-" + s.tone; }
                svg.appendChild( svgEl( "circle", { cx: s.dots[ d ].x, cy: s.dots[ d ].y, r: 0.9, class: dotCls } ) );
            }
        }
        figure.appendChild( svg );

        const headers = [ "Axis" ].concat( layout.series.map( ( s ) => s.key ) );
        const srRows = layout.axes.map( ( ax ) => {
            const row = [ String( ax.label ) ];
            for ( let i = 0; i < layout.series.length; i++ ) {
                const dot = layout.series[ i ].dots.find( ( d ) => d.axisId === ax.id );
                row.push( dot ? formatNumber( dot.value, 2 ) : "—" );
            }
            return row;
        } );
        figure.appendChild( buildSrTable( headers, srRows ) );
    }

    /**
     * Renders the cross-cycle line/trend primitive (CA-X1): an optional baseline axis, one filled band area per series
     * (p25–p75), a polyline per contiguous segment (null gaps break the line), vertex dots, x-axis cycle labels, and an
     * sr-table. A `style:"dashed"` series (or spec.provisional) draws dashed; `options.provisionalLastPoint` dashes just
     * the final connector of the primary series (the live ACTIVE cycle still in flight) and marks its last dot. Sparkline
     * mode drops the axis/labels. All geometry via lineLayout + setAttribute (no element.style).
     * @param {Element} figure
     * @param {TiChartSpec} spec
     */
    function renderLine( figure, spec ) {
        const data = spec.data;
        const x = Array.isArray( data.x ) ? data.x : [];
        const series = Array.isArray( data.series ) ? data.series : [];
        if ( x.length === 0 || series.length === 0 ) { figure.setAttribute( "data-ti-chart-empty", "1" ); return; }
        const options = spec.options || {};
        const layout = lineLayout( series, Object.assign( {}, options, { xCount: x.length } ) );

        const svg = svgEl( "svg", { viewBox: "0 0 " + _round( layout.W ) + " " + _round( layout.H ), preserveAspectRatio: "xMidYMid meet", role: "img" } );
        _appendA11yTitle( svg, spec );

        if ( !layout.sparkline ) {
            const axisY = _round( layout.padT + layout.innerH );
            svg.appendChild( svgEl( "line", { x1: layout.padL, y1: axisY, x2: _round( layout.W - layout.padR ), y2: axisY, class: "ti-chart-line-axis" } ) );
        }

        const provisionalLast = Boolean( options.provisionalLastPoint );

        for ( let i = 0; i < layout.series.length; i++ ) {
            const s = layout.series[ i ];
            const tone = s.tone ? ( " tone-" + s.tone ) : "";
            const dashed = ( s.style === "dashed" || spec.provisional );
            if ( s.band ) {
                svg.appendChild( svgEl( "polygon", { points: s.band, class: "ti-chart-line-band" + tone } ) );
            }
            for ( let g = 0; g < s.segments.length; g++ ) {
                const pts = s.segments[ g ].split( " " );
                if ( provisionalLast && i === 0 && g === s.segments.length - 1 && pts.length >= 2 ) {
                    // split the final connector as a dashed "provisional" segment (active cycle still in flight)
                    const solid = pts.slice( 0, pts.length - 1 );
                    if ( solid.length >= 2 ) {
                        svg.appendChild( svgEl( "polyline", { points: solid.join( " " ), class: "ti-chart-line-series" + tone, fill: "none" } ) );
                    }
                    const tail = svgEl( "polyline", { points: pts.slice( pts.length - 2 ).join( " " ), class: "ti-chart-line-series" + tone, fill: "none" } );
                    tail.setAttribute( "stroke-dasharray", "3 2" );
                    svg.appendChild( tail );
                } else {
                    const pl = svgEl( "polyline", { points: s.segments[ g ], class: "ti-chart-line-series" + tone, fill: "none" } );
                    if ( dashed ) { pl.setAttribute( "stroke-dasharray", "3 2" ); }
                    svg.appendChild( pl );
                }
            }
            for ( let d = 0; d < s.dots.length; d++ ) {
                const dot = s.dots[ d ];
                let dotCls = "ti-chart-line-dot" + tone;
                if ( provisionalLast && i === 0 && dot.xIndex === layout.n - 1 ) { dotCls += " provisional"; }
                svg.appendChild( svgEl( "circle", { cx: dot.x, cy: dot.y, r: layout.sparkline ? 0.8 : 1.1, class: dotCls } ) );
            }
        }

        if ( !layout.sparkline ) {
            for ( let i = 0; i < x.length; i++ ) {
                const lx = ( layout.n <= 1 ) ? _round( layout.padL + ( layout.innerW / 2 ) ) : _round( layout.padL + ( ( layout.innerW * i ) / ( layout.n - 1 ) ) );
                const t = svgEl( "text", { x: lx, y: _round( layout.H - 2 ), class: "ti-chart-line-xlabel", "text-anchor": "middle" } );
                t.textContent = String( ( x[ i ].label !== undefined ) ? x[ i ].label : x[ i ].id );
                svg.appendChild( t );
            }
        }

        figure.appendChild( svg );

        const headers = [ "Cycle" ].concat( series.map( ( s ) => s.key ) );
        const srRows = x.map( ( xi, i ) => {
            const row = [ String( ( xi.label !== undefined ) ? xi.label : xi.id ) ];
            for ( let j = 0; j < series.length; j++ ) {
                const v = Array.isArray( series[ j ].values ) ? series[ j ].values[ i ] : null;
                row.push( ( typeof v === "number" ) ? formatNumber( v, 2 ) : "—" );
            }
            return row;
        } );
        figure.appendChild( buildSrTable( headers, srRows ) );
    }

    /**
     * Top-level dispatcher: clears the host figure, normalizes the spec, routes to a renderer.
     * @param {Element} figure  host <figure class="ti-chart">
     * @param {*} rawSpec
     */
    function renderChart( figure, rawSpec ) {
        if ( !figure ) { return; }
        const spec = normalizeSpec( rawSpec );
        _clearChildren( figure );
        figure.removeAttribute( "data-ti-chart-empty" );
        figure.removeAttribute( "aria-label" );
        figure.setAttribute( "role", "img" );
        figure.setAttribute( "data-ti-chart-type", spec.type );   // per-type sizing hook for CSS (cap + centering)
        if ( spec.a11yLabel ) { figure.setAttribute( "aria-label", spec.a11yLabel ); }
        if ( spec.type === "gauge" ) { renderGauge( figure, spec ); }
        else if ( spec.type === "bars" ) { renderBars( figure, spec ); }
        else if ( spec.type === "stat" ) { renderStat( figure, spec ); }
        else if ( spec.type === "scatter" ) { renderScatter( figure, spec ); }
        else if ( spec.type === "heatmap" ) { renderHeatmap( figure, spec ); }
        else if ( spec.type === "box" ) { renderBox( figure, spec ); }
        else if ( spec.type === "radar" ) { renderRadar( figure, spec ); }
        else if ( spec.type === "line" ) { renderLine( figure, spec ); }
        else { figure.setAttribute( "data-ti-chart-empty", "1" ); }
    }

    return {
        SVG_NS,
        gaugeValueToAngle,
        gaugeArcPath,
        barSegments,
        normalizeSpec,
        gaugeRowsLayout,
        scatterLayout,
        quantileBucket,
        heatmapLayout,
        boxLayout,
        barsGroupedLayout,
        barsDivergingLayout,
        radarLayout,
        lineLayout,
        svgEl,
        buildSrTable,
        renderChart,
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
