"use strict";

const test = require( "node:test" );
const assert = require( "node:assert/strict" );
const { buildCoverageGaugeSpec, buildCoverageBarsSpec } = require( "../bin/static/scripts/insights-cycle-specs.js" );

const COVERAGE = {
    overall: { n: 40, N: 50, pct: 80 },
    byGroup: [
        { groupKey: "U1", groupLabel: "Engineering", N: 30, notStarted: 5,
          byStatus: { "Open": 4, "In Review": 6, "Ready": 5, "Closed": 10 } }
    ]
};

test( "gauge spec maps n/N to a 0..1 value and a fraction sublabel", () => {
    const spec = buildCoverageGaugeSpec( COVERAGE, { mode: "snapshot", partial: false } );
    assert.equal( spec.type, "gauge" );
    assert.equal( spec.data.value, 0.8 );
    assert.equal( spec.data.sublabel, "40 / 50" );
    assert.equal( spec.provisional, false );
} );

test( "gauge spec appends % reporting and flags provisional when partial", () => {
    const spec = buildCoverageGaugeSpec( COVERAGE, { mode: "live", partial: true, pctReporting: 72 } );
    assert.equal( spec.provisional, true );
    assert.match( spec.data.sublabel, /72% reporting/ );
} );

test( "gauge spec is safe on an empty payload", () => {
    const spec = buildCoverageGaugeSpec( {}, {} );
    assert.equal( spec.data.value, 0 );
    assert.equal( spec.data.sublabel, "0 / 0" );
} );

test( "bars spec emits one stacked row per group with five status segments incl. Not started", () => {
    const spec = buildCoverageBarsSpec( COVERAGE, { partial: false } );
    assert.equal( spec.type, "bars" );
    assert.equal( spec.options.mode, "stacked" );
    assert.equal( spec.data.rows.length, 1 );
    const segs = spec.data.rows[ 0 ].segments;
    assert.equal( segs.length, 5 );
    const notStarted = segs.find( ( s ) => s.key === "Not started" );
    assert.equal( notStarted.v, 5 );
    const inReview = segs.find( ( s ) => s.key === "In Review" );
    assert.equal( inReview.v, 6 );
} );

test( "bars spec maps every segment's tone to the real ti-chart tone vocabulary", () => {
    const VALID_TONES = [ "grade-s", "grade-r", "grade-u", "grade-n", "ink" ];
    const spec = buildCoverageBarsSpec( COVERAGE, { partial: false } );
    const segs = spec.data.rows[ 0 ].segments;
    segs.forEach( ( seg ) => {
        assert.ok( VALID_TONES.includes( seg.tone ), "unexpected tone: " + seg.tone );
    } );
    assert.equal( segs.find( ( s ) => s.key === "Closed" ).tone, "grade-s" );
    assert.equal( segs.find( ( s ) => s.key === "Ready" ).tone, "grade-r" );
    assert.equal( segs.find( ( s ) => s.key === "In Review" ).tone, "grade-u" );
    assert.equal( segs.find( ( s ) => s.key === "Open" ).tone, "grade-n" );
    assert.equal( segs.find( ( s ) => s.key === "Not started" ).tone, "ink" );
} );
