/* Builds a self-contained preview of the Insights screens (real CSS + real ti-charts.js + the actual
 * card-grid markup + representative report specs), so the layout/chart rendering can be eyeballed without
 * the backend. Output: docs/superpowers/preview/index.html. Run: node docs/superpowers/preview/build-preview.js */
"use strict";
const fs = require( "fs" );
const path = require( "path" );

const ROOT = path.resolve( __dirname, "..", "..", ".." );
const WF = path.join( ROOT, "packages/web-framework/bin/static/scripts" );
const CO = path.join( ROOT, "packages/competence/bin/static/scripts" );
const read = ( p ) => fs.readFileSync( p, "utf8" );

const css = [
    read( path.join( WF, "ti-framework.css" ) ),
    read( path.join( WF, "ti-theme-daylight.css" ) ),
    read( path.join( WF, "ti-theme-black-glass.css" ) ),
    read( path.join( CO, "competence-main.css" ) )
].join( "\n\n" );
const tiCharts = read( path.join( WF, "ti-charts.js" ) );

// ---- representative report specs (shape = what the Phase 1B/2 spec-builders emit) ----
const SUBCATS = [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ];
const LEVELS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];

const coverageGauge = { type: "gauge", data: { value: 0.62, label: "Coverage", sublabel: "26 / 42 · 62% reporting" }, a11yLabel: "Coverage 62%", provisional: true };
const coverageBars = { type: "bars", options: { mode: "stacked" }, a11yLabel: "Coverage by group", data: { rows: [
    { id: "SE", label: "SE", total: 18, segments: [ { key: "Closed", v: 6, tone: "grade-s" }, { key: "Ready", v: 4, tone: "grade-r" }, { key: "In Review", v: 3, tone: "grade-u" }, { key: "Open", v: 2, tone: "grade-n" }, { key: "Not started", v: 3, tone: "ink" } ] },
    { id: "BA", label: "BA", total: 14, segments: [ { key: "Closed", v: 3, tone: "grade-s" }, { key: "Ready", v: 3, tone: "grade-r" }, { key: "In Review", v: 4, tone: "grade-u" }, { key: "Open", v: 1, tone: "grade-n" }, { key: "Not started", v: 3, tone: "ink" } ] },
    { id: "PM", label: "PM", total: 10, segments: [ { key: "Closed", v: 4, tone: "grade-s" }, { key: "Ready", v: 2, tone: "grade-r" }, { key: "In Review", v: 1, tone: "grade-u" }, { key: "Open", v: 1, tone: "grade-n" }, { key: "Not started", v: 2, tone: "ink" } ] }
] } };
const levelBox = { type: "box", options: { domain: { min: 0, max: 150 } }, a11yLabel: "Score distribution by level", data: {
    reference: [ { v: 105, label: "T3" } ],
    groups: LEVELS.map( ( lvl, i ) => ( i < 2 || i > 9 )
        ? { id: lvl, label: lvl, n: 1, suppressed: true }
        : { id: lvl, label: lvl, n: 5, min: 70 + i * 3, q1: 84 + i * 3, median: 96 + i * 3, q3: 108 + i * 3, max: 124 + i * 3, mean: 97 + i * 3, expected: 92 + i * 4 } )
} };
const heatmap = { type: "heatmap", options: { scale: "sequential" }, a11yLabel: "Competence heatmap", data: {
    rows: SUBCATS.map( ( s ) => ( { id: s, label: s } ) ),
    cols: [ { id: "SE", label: "SE" }, { id: "BA", label: "BA" }, { id: "PM", label: "PM" } ],
    cells: [].concat.apply( [], SUBCATS.map( ( s, r ) => [ 0, 1, 2 ].map( ( c ) => ( { r: r, c: c, n: 5, v: 0.6 + ( ( ( r * 3 + c ) % 7 ) / 10 ), expected: 1.0, delta: ( ( ( r * 3 + c ) % 5 ) - 2 ) / 10 } ) ) ) )
} };
const alignment = { type: "scatter", options: { bubble: "z", domain: { xMin: 0, xMax: 1.3, yMin: 0, yMax: 1.3 }, midX: 1.0, midY: 1.0 }, a11yLabel: "Alignment", data: {
    diagonal: true,
    points: [
        { id: "1", x: 1.1, y: 1.2, z: 1.0, tone: "grade-s" }, { id: "2", x: 0.9, y: 0.7, z: 0.8, tone: "grade-n" },
        { id: "3", x: 1.0, y: 1.0, z: 1.0, tone: "info" }, { id: "4", x: 0.6, y: 1.1, z: 0.9, tone: "grade-s" },
        { id: "5", x: 1.2, y: 0.8, z: 1.1, tone: "grade-n" }, { id: "6", x: 0.8, y: 0.85, z: 0.7, tone: "info" }
    ]
} };
const timeBars = { type: "bars", options: { mode: "grouped" }, a11yLabel: "Interview timing", data: { rows: [
    { id: "2026-01", label: "2026-01", values: [ { key: "planned", v: 8, tone: "grade-r" }, { key: "held", v: 6, tone: "grade-s" } ] },
    { id: "2026-02", label: "2026-02", values: [ { key: "planned", v: 12, tone: "grade-r" }, { key: "held", v: 9, tone: "grade-s" } ] },
    { id: "2026-03", label: "2026-03", values: [ { key: "planned", v: 5, tone: "grade-r" }, { key: "held", v: 2, tone: "grade-s" } ] }
] } };
const driversBars = { type: "bars", options: { mode: "diverging" }, a11yLabel: "Performance drivers", data: { rows: SUBCATS.map( ( s, i ) => ( { id: s, label: s, values: [ { key: "divergence", v: ( ( i % 5 ) - 2 ) / 10, tone: ( i % 3 === 0 ) ? "grade-u" : "info" } ] } ) ) } };
const calibrationBars = { type: "bars", options: { mode: "diverging" }, a11yLabel: "Grader calibration", data: { rows: SUBCATS.map( ( s, i ) => ( { id: s, label: s, values: [ { key: "vsSelf", v: ( ( i % 4 ) - 1 ) / 10, tone: "info" }, { key: "vsTeam", v: ( ( i % 3 ) - 1 ) / 10, tone: "grade-r" } ] } ) ) } };
const calibrationKpi = { type: "stat", data: { value: 0.18, label: "Overall vs self", sub: "+0.18 (more lenient) · n=14" }, a11yLabel: "Overall calibration gap" };
const radar = { type: "radar", a11yLabel: "Subcategory profile", data: {
    axes: SUBCATS.map( ( s ) => ( { id: s, label: s, max: 1.3 } ) ),
    series: [
        { key: "self", tone: "grade-s", values: { E1: 1.3, E2: 1.0, E3: 1.0, I1: 0.6, I2: 1.0, I3: 1.3, C1: 1.0, C2: 0.6, C3: 1.0 } },
        { key: "manager", tone: "grade-r", values: { E1: 1.0, E2: 1.0, E3: 0.6, I1: 0.6, I2: 1.0, I3: 1.0, C1: 1.0, C2: 1.0, C3: 0.6 } },
        { key: "team", tone: "info", values: { E1: 1.0, E2: 0.6, E3: 1.0, I1: 1.0, I2: 0.6, I3: 1.0, C1: 0.6, C2: 1.0, C3: 1.0 } },
        { key: "expected", style: "dashed", values: { E1: 1.0, E2: 1.0, E3: 1.0, I1: 1.0, I2: 1.0, I3: 1.0, C1: 1.0, C2: 1.0, C3: 1.0 } }
    ]
} };

const SPECS = { coverageGauge, coverageBars, levelBox, heatmap, alignment, timeBars, driversBars, calibrationBars, calibrationKpi, radar };

// ---- the screen markup (mirrors frame-insights-cycle.html + the team calibration card; Alpine attrs resolved static) ----
const card = ( title, intro, figId, wide, note ) => `
            <section class="ti-card${ wide ? " ti-card-wide" : "" }">
                <h2 class="ti-card-title">${ title }</h2>
                <p class="ti-panel-body-intro">${ intro }</p>
                <figure class="ti-chart" id="${ figId }" role="img"></figure>
                <details class="ti-card-note"><summary>How it's calculated</summary><p>${ note }</p></details>
            </section>`;

const body = `
    <div class="ti-page" data-screen="insights-team">
        <div class="ti-page-head">
            <div>
                <h1 class="ti-page-title">Team analytics</h1>
                <p class="ti-page-sub">2026-H2 · as of now (your subtree)</p>
            </div>
            <div class="ti-page-head-actions">
                <label class="ti-field-inline"><span>Cycle</span>
                    <select class="ti-select"><option>2026-H2</option></select>
                </label>
            </div>
        </div>
        <div class="ti-card-grid">
            <div class="ti-card-wide"><span class="ti-status-pill warn"><span class="dot"></span><span>as of now · 62% reporting</span></span></div>

            <section class="ti-card">
                <h2 class="ti-card-title">Overall coverage</h2>
                <p class="ti-panel-body-intro">Completion across your team.</p>
                <figure class="ti-chart" id="fig-coverage" role="img"></figure>
                <details class="ti-card-note"><summary>How it's calculated</summary><p>Complete = Ready or Closed over the in-scope roster.</p></details>
            </section>
            <section class="ti-card">
                <h2 class="ti-card-title">By group</h2>
                <figure class="ti-chart" id="fig-coverage-bars" role="img"></figure>
            </section>
            <section class="ti-card ti-card-wide">
                <h2 class="ti-card-title">Pending</h2>
                <div class="ti-data-grid">
                    <div class="ti-data-grid-row"><span class="ti-data-grid-cell">Ann Smith</span><span class="ti-data-grid-cell">SE</span><span class="ti-status-pill info"><span class="dot"></span><span>Open</span></span></div>
                    <div class="ti-data-grid-row"><span class="ti-data-grid-cell">Bo Lee</span><span class="ti-data-grid-cell">BA</span><span class="ti-status-pill warn"><span class="dot"></span><span>In Review</span></span></div>
                    <div class="ti-data-grid-row"><span class="ti-data-grid-cell">Cy Park</span><span class="ti-data-grid-cell">PM</span><span class="ti-status-pill"><span class="dot"></span><span>Not started</span></span></div>
                </div>
            </section>
            ${ card( "Score distribution by level", "Final-score spread per level with the expected marker.", "fig-level", true, "Box per level; dashed marker is the level's expected score; dotted line is T3 (105)." ) }
            <section class="ti-card ti-card-wide">
                <div class="ti-panel-head">
                    <h2 class="ti-card-title">Competence heatmap</h2>
                    <label class="ti-field-inline"><select class="ti-select"><option>Value</option><option>Gap vs expected</option></select></label>
                </div>
                <p class="ti-panel-body-intro">Average grade per subcategory across groups.</p>
                <figure class="ti-chart" id="fig-heatmap" role="img"></figure>
                <details class="ti-card-note"><summary>How it's calculated</summary><p>Relevancy-weighted mean grade per subcategory × group.</p></details>
            </section>
            ${ card( "Subcategory profile (radar)", "Self / manager / team across the nine subcategories vs expected.", "fig-radar", false, "Each spoke is a subcategory; the dashed ring is the level-expected grade." ) }
            ${ card( "Self vs manager alignment", "Manager grade (x) vs self grade (y); bubble = team.", "fig-alignment", false, "Above the diagonal = self rates higher; below = blind spot." ) }
            ${ card( "Interview timing", "Planned vs finalised interviews per month.", "fig-time", false, "Planned = booked slots; finalised = a proxy for held." ) }
            ${ card( "Performance drivers", "Influence vs configured relevancy share per subcategory.", "fig-drivers", true, "Pearson influence minus configured share; flagged = possibly mis-weighted." ) }
            <section class="ti-card ti-card-wide">
                <h2 class="ti-card-title">Grader calibration</h2>
                <p class="ti-panel-body-intro">Your grading vs self and team, per subcategory.</p>
                <figure class="ti-chart" id="fig-calibration-kpi" role="img"></figure>
                <figure class="ti-chart" id="fig-calibration" role="img"></figure>
                <details class="ti-card-note"><summary>How it's calculated</summary><p>Signed mgr−self / mgr−team gaps in weight space; + = more lenient.</p></details>
            </section>
        </div>
    </div>`;

const renderScript = `
const S = ${ JSON.stringify( SPECS ) };
const R = (id, spec) => { const el = document.getElementById(id); if (el && window.TiCharts) window.TiCharts.renderChart(el, spec); };
function renderAll() {
  R("fig-coverage", S.coverageGauge); R("fig-coverage-bars", S.coverageBars); R("fig-level", S.levelBox);
  R("fig-heatmap", S.heatmap); R("fig-alignment", S.alignment); R("fig-time", S.timeBars);
  R("fig-drivers", S.driversBars); R("fig-calibration", S.calibrationBars); R("fig-calibration-kpi", S.calibrationKpi);
  R("fig-radar", S.radar);
}
function setTheme(t){ document.documentElement.setAttribute("data-theme", t); document.body.style.background = getComputedStyle(document.documentElement).getPropertyValue("--bg-app"); }
document.getElementById("theme-toggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "daylight";
  setTheme(cur === "daylight" ? "glass" : "daylight");
});
setTheme("daylight"); renderAll();`;

const html = `<!doctype html>
<html lang="en" data-theme="daylight">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Insights preview</title>
<style>
${ css }
/* preview-only chrome */
body { margin: 0; background: var(--bg-app); color: var(--fg-primary); font-family: "General Sans", system-ui, sans-serif; }
#preview-bar { position: sticky; top: 0; z-index: 50; display: flex; gap: 8px; align-items: center; padding: 8px 16px; background: var(--bg-surface); border-bottom: 1px solid var(--border); }
#preview-bar button { padding: 4px 10px; }
.preview-wrap { padding: 16px 24px 64px; max-width: 1100px; margin: 0 auto; }
</style>
</head>
<body>
<div id="preview-bar"><strong>Insights screen preview</strong> — static harness (real CSS + ti-charts.js) <button id="theme-toggle" type="button">Toggle theme</button></div>
<div class="preview-wrap">
${ body }
</div>
<script>
${ tiCharts }
</script>
<script>
${ renderScript }
</script>
</body>
</html>`;

fs.writeFileSync( path.join( __dirname, "index.html" ), html );
console.log( "wrote", path.join( __dirname, "index.html" ), "(" + html.length + " bytes)" );
