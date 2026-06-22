"use strict";

const test = require( "node:test" );
const assert = require( "node:assert/strict" );
const { pickCycleForRequest } = require( "#results-analytics" );

const CYCLES = [
    { cycleID: "2026-H1", status: "Closed" },
    { cycleID: "2026-H2", status: "Active" }
];

test( "pickCycleForRequest returns the requested cycle when present", () => {
    const picked = pickCycleForRequest( CYCLES, "2026-H1", { cycleID: "2026-H2", status: "Active" } );
    assert.equal( picked.cycleID, "2026-H1" );
} );

test( "pickCycleForRequest falls back to the active/current cycle for a blank request", () => {
    const picked = pickCycleForRequest( CYCLES, "", { cycleID: "2026-H2", status: "Active" } );
    assert.equal( picked.cycleID, "2026-H2" );
} );

test( "pickCycleForRequest falls back when the requested cycleID is unknown", () => {
    const picked = pickCycleForRequest( CYCLES, "1999-H9", { cycleID: "2026-H2", status: "Active" } );
    assert.equal( picked.cycleID, "2026-H2" );
} );

test( "pickCycleForRequest returns null when there is no requested and no fallback cycle", () => {
    assert.equal( pickCycleForRequest( [], "", null ), null );
} );
