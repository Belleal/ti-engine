/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// NOTE: this suite drives configuration-loader.initialize(), which reassigns the module's exported config objects.
// node --test isolates each file in its own process, so it must stay in a file of its own.

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const configurationLoader = require( "#configuration-loader" );
const organizationManager = require( "#organization-manager" );
const configDrift = require( "@ti-engine/web-framework/config-drift" );
const logger = require( "@ti-engine/core/logger" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const { registerCompetenceConfig } = require( "../application/config-registration" );

const clone = ( value ) => JSON.parse( JSON.stringify( value ) );

// Shared plumbing for the reportConfigDrift tests below. `stubServiceWithDrift` covers the seedDefault/getCurrent
// no-ops every initialize() call needs (each document reports its own file default as "current", so applyStoreValue
// has harmless data to assign) and takes just the `listDrift` implementation under test. `captureLogs` mirrors the
// established precedent at core/test/security-hash-key-warning.test.js (lines ~8-24): replace logger.log with a
// collector, run, restore in a `finally` so the stub can never leak into another test in this file.
//
// The optional `captureListener` callback, when supplied, receives the `config:changed` listener that
// configuration-loader registers during initialize() — the org-chart hot-reload branch (CA-107) has no other seam
// to reach it through. Every existing call site passes only `listDrift`, so `captureListener` is `undefined` for
// them and the guard below is a no-op — backward compatible, no behavior change for any current test.
const stubServiceWithDrift = ( listDrift, captureListener ) => ( {
    seedDefault: ( configKey ) => Promise.resolve( { value: configurationLoader.fileDefaults[ configKey ], version: 1 } ),
    getCurrent: ( configKey ) => Promise.resolve( { value: configurationLoader.fileDefaults[ configKey ], version: 1 } ),
    onConfigChanged: ( listener ) => {
        if ( captureListener ) captureListener( listener );
        return () => {};
    },
    listDrift: listDrift
} );

const captureLogs = async ( run ) => {
    const originalLog = logger.log;
    const captured = [];
    logger.log = ( message, severity ) => { captured.push( { message, severity } ); };
    try {
        await run();
    } finally {
        logger.log = originalLog;
    }
    return captured;
};

describe( "configuration-loader — file defaults survive store initialization", () => {

    it( "exposes the nine store-backed file defaults", () => {
        assert.deepEqual( Object.keys( configurationLoader.fileDefaults ).sort(), [
            "active-competency-sets", "competencies", "organization-structure", "relevancy-archetypes",
            "research-consent", "role-families", "role-family-competencies", "stage-levels", "work-sites"
        ] );
    } );

    it( "keeps fileDefaults pointing at the FILE value after initialize() overwrites the exports", async () => {
        const fileCompetencyCount = Object.keys( configurationLoader.fileDefaults.competencies.competencies ).length;
        assert.ok( fileCompetencyCount > 100, "sanity: the file dictionary is populated" );

        // A store holding a deliberately truncated dictionary, standing in for a deployment seeded before a release.
        const stored = { categories: {}, competencies: { "E1-1": { relevancyArchetype: "A" } } };
        const stubService = {
            seedDefault: () => Promise.resolve( { value: stored, version: 1 } ),
            getCurrent: ( configKey ) => Promise.resolve( { value: ( configKey === "competencies" ) ? stored : {}, version: 1 } ),
            onConfigChanged: () => () => {},
            listDrift: () => Promise.resolve( [] )
        };
        await configurationLoader.initialize( stubService );

        // The export is now the store value — that is the documented behaviour.
        assert.equal( Object.keys( configurationLoader.configCompetencies.competencies ).length, 1 );
        // But the file default must be untouched, or drift detection would compare the store against itself.
        assert.equal( Object.keys( configurationLoader.fileDefaults.competencies.competencies ).length, fileCompetencyCount );
    } );

} );

describe( "reportConfigDrift — startup logging", () => {

    it( "logs a drifted document at WARNING with the +added / -removed / ~changed counts interpolated", async () => {
        const stubService = stubServiceWithDrift( () => Promise.resolve( [
            { configKey: "role-family-competencies", status: "drifted", counts: { added: 27, removed: 3, changed: 1 } }
        ] ) );

        const captured = await captureLogs( () => configurationLoader.initialize( stubService ) );

        const entry = captured.find( ( c ) => c.message.includes( "role-family-competencies" ) );
        assert.ok( entry, "the drifted document must be logged" );
        assert.equal( entry.severity, logger.logSeverity.WARNING, "a drifted document is a warning — a release changed something this deployment isn't serving" );
        assert.ok( entry.message.includes( "+27 / -3 / ~1" ), "the added/removed/changed counts must be interpolated into the message" );
    } );

    it( "logs an absent document at INFO, not WARNING", async () => {
        const stubService = stubServiceWithDrift( () => Promise.resolve( [
            { configKey: "competence-labels", status: "absent", counts: { added: 0, removed: 0, changed: 0 } }
        ] ) );

        const captured = await captureLogs( () => configurationLoader.initialize( stubService ) );

        const entry = captured.find( ( c ) => c.message.includes( "competence-labels" ) );
        assert.ok( entry, "the absent document must be logged" );
        assert.equal( entry.severity, logger.logSeverity.INFO, "absent is informational — competence-labels is legitimately unseeded on a clean install, and WARNING would make every fresh deployment look broken" );
    } );

    it( "logs nothing for an in-sync document", async () => {
        const stubService = stubServiceWithDrift( () => Promise.resolve( [
            { configKey: "stage-levels", status: "in-sync", counts: { added: 0, removed: 0, changed: 0 } }
        ] ) );

        const captured = await captureLogs( () => configurationLoader.initialize( stubService ) );

        assert.deepEqual( captured, [], "an in-sync document must not produce any log output" );
    } );

    it( "catches a rejected listDrift() so initialize() still resolves and boot continues", async () => {
        const stubService = stubServiceWithDrift( () => Promise.reject( new Error( "cache unavailable" ) ) );

        const captured = await captureLogs( () => assert.doesNotReject(
            () => configurationLoader.initialize( stubService ),
            "initialize() must resolve even when listDrift() rejects — diagnostics must never gate boot"
        ) );

        assert.ok( captured.some( ( c ) => c.severity === logger.logSeverity.WARNING ), "the failure to compute drift is itself logged, not silently swallowed" );
    } );

} );

describe( "driftRows() (admin panel, competence-user-interface.js) -- excludes driftTracked: false documents", () => {
    // This is the front-end half of the exact same exclusion "reportConfigDrift -- startup logging" above verifies
    // for the backend half: a document registered driftTracked: false (the organization structure -- customer
    // data, not vendor-shipped product content) must never appear in the admin drift panel, even when its status
    // is "drifted" or "absent". Before this guard's fix, driftRows() filtered on status alone, so a customer's real
    // org chart sat in the panel permanently flagged "drifted" -- one tick plus "apply defaults" away from
    // silently replacing an authored org chart with the shipped 4-unit demo tree.
    //
    // The Alpine component lives in a browser-only script (Alpine.data(...), no module.exports, no DOM/Alpine
    // globals in this suite) so there is no seam to execute it as a whole. Mirroring the house style already used
    // for this exact file at test/consent-register-screen.test.js ("static wiring guards" -- regex assertions over
    // the source), this reads the actual filter predicate out of the source and, since it is a small, pure,
    // self-contained expression (it closes over nothing but its own `row` argument), evaluates it directly so the
    // guard proves real boolean behaviour rather than merely that certain tokens are present somewhere nearby.

    const UI_SCRIPT_FILE = path.join( __dirname, "..", "bin", "static", "scripts", "competence-user-interface.js" );

    function extractDriftRowsPredicate() {
        const source = fs.readFileSync( UI_SCRIPT_FILE, "utf8" );
        const match = /driftRows\(\)\s*\{\s*return this\.drift\.filter\(\s*([\s\S]*?)\s*\);\s*\}/.exec( source );
        assert.ok( match, "expected to find a one-line `driftRows() { return this.drift.filter( ... ); }` method in competence-user-interface.js" );
        // Evaluates the extracted arrow-function source text itself (not untrusted input) -- see the block comment
        // above for why that is safe here.
        const predicate = new Function( `return (${ match[ 1 ] });` )();
        assert.equal( typeof predicate, "function", "driftRows() must filter with a function predicate" );
        return predicate;
    }

    it( "still shows a tracked document whose status is drifted or absent", () => {
        const predicate = extractDriftRowsPredicate();
        assert.equal( predicate( { status: "drifted", driftTracked: true } ), true );
        assert.equal( predicate( { status: "absent", driftTracked: true } ), true );
    } );

    it( "excludes a driftTracked: false document even when its status is drifted or absent", () => {
        const predicate = extractDriftRowsPredicate();
        assert.equal( predicate( { status: "drifted", driftTracked: false } ), false,
            "a drifted-but-untracked row (e.g. organization-structure) must be excluded from the panel" );
        assert.equal( predicate( { status: "absent", driftTracked: false } ), false,
            "an absent-but-untracked row must be excluded too" );
    } );

    it( "still excludes an in-sync or no-default document regardless of driftTracked", () => {
        const predicate = extractDriftRowsPredicate();
        assert.equal( predicate( { status: "in-sync", driftTracked: true } ), false );
        assert.equal( predicate( { status: "no-default", driftTracked: true } ), false );
    } );

} );

describe( "config drift — the CA-98 QE case end to end", () => {

    it( "detects the QE pool addition and resolves it once the default is applied, end to end through initialize()", async () => {
        const fileDefault = configurationLoader.fileDefaults[ "role-family-competencies" ];
        assert.ok( fileDefault.QE.length > 50, "sanity: QE carries its own competencies in the file" );

        // Reconstruct a pre-CA-98 store: QE holding only the shared canonical codes it had before the release.
        const storedValue = clone( fileDefault );
        storedValue.QE = storedValue.XD.slice();

        const drift = configDrift.diffDocument( fileDefault, storedValue );
        assert.equal( drift.status, "drifted" );
        const entry = drift.entries.find( ( e ) => e.path === ".QE" );
        assert.ok( entry.addedMembers > 20, "the QE family-specific competencies are reported as added members" );

        // Applying the file default is what closes the gap — the post-apply value is the file default itself.
        assert.equal( configDrift.diffDocument( fileDefault, fileDefault ).status, "in-sync" );

        // The checks above are data-level: they prove the QE reconstruction produces the drift a real release would.
        // Drive that same, real drift result through the actual reporting path so the test lives up to its "end to
        // end" name. listDrift is stubbed to return exactly this computed drift for role-family-competencies (the
        // same shape ConfigService.getDrift would produce, via the same configDrift.diffDocument) plus in-sync for
        // every other store-backed document, so the QE finding is the only thing that should reach the log.
        const otherKeys = Object.keys( configurationLoader.fileDefaults ).filter( ( key ) => key !== "role-family-competencies" );
        const stubService = stubServiceWithDrift( () => Promise.resolve( [
            { configKey: "role-family-competencies", status: drift.status, counts: drift.counts },
            ...otherKeys.map( ( configKey ) => ( { configKey: configKey, status: "in-sync", counts: { added: 0, removed: 0, changed: 0 } } ) )
        ] ) );

        const captured = await captureLogs( () => configurationLoader.initialize( stubService ) );

        const qeEntry = captured.find( ( c ) => c.message.includes( "role-family-competencies" ) );
        assert.ok( qeEntry, "the real QE drift must be logged at startup" );
        assert.equal( qeEntry.severity, logger.logSeverity.WARNING );
        assert.ok(
            qeEntry.message.includes( `+${ drift.counts.added } / -${ drift.counts.removed } / ~${ drift.counts.changed }` ),
            "the real counts from the QE reconstruction reach the log message"
        );
        assert.equal( captured.length, 1, "only the drifted document should log anything — the rest are in-sync" );
    } );

} );

describe( "config drift — the CA-98 QE case end to end, through the real ConfigService", () => {
    // The block above characterizes the bug at the data level (diffDocument on a hand-built pair of values, with
    // listDrift stubbed). That proves the drift computation is right, but nothing there ever constructs a real
    // ConfigService, calls applyDefaults, or exercises competence's actual schemas/semantic validators — so it
    // cannot catch the one failure mode this feature exists to prevent: shipped file defaults that are not mutually
    // applicable (activeSetsWithinPool / poolReferenceIntegrity are exactly the constraints CA-98 tripped). This
    // suite drives the real web-framework config-management stack end to end instead.

    let cacheStub;
    let store;
    let ConfigRegistry;
    let ConfigChangeNotifier;
    let ConfigService;

    before( () => {
        cacheStub = installInMemoryCache();
        // ConfigRegistry / ConfigStore / ConfigChangeNotifier are internal to @ti-engine/web-framework -- not part of
        // its published `exports` map (only config-drift, config-management, web-application, web-server,
        // authorization and definitions are) -- so they are reached by a relative path into the sibling package,
        // exactly mirroring what @ti-engine/web-framework's OWN test/config-service.drift.test.js does via its
        // private `#config-store` / `#config-registry` / `#config-change-notifier` aliases (which are not visible
        // from outside that package). ConfigService (`config-management`) IS published and is required normally.
        store = require( "../../web-framework/components/config-store" ).instance;
        ConfigRegistry = require( "../../web-framework/components/config-registry" );
        ConfigChangeNotifier = require( "../../web-framework/components/config-change-notifier" );
        ConfigService = require( "@ti-engine/web-framework/config-management" );
    } );

    it( "detects the stale QE documents, blocks the partial apply, and closes the gap once applied together", async () => {
        cacheStub.storage = {};

        // A fresh registry + notifier (NOT the process-wide singletons research-consent.live.test.js uses) wired to
        // the real ConfigStore singleton -- isolates this suite's registrations from every other test file's, since
        // node --test isolates each file in its own process anyway, but keeps this file's own tests independent of
        // each other too.
        const registry = new ConfigRegistry();
        const notifier = new ConfigChangeNotifier();
        const service = new ConfigService( { store: store, registry: registry, notifier: notifier } );

        registerCompetenceConfig( {
            registerConfigDocument: ( key, definition ) => registry.register( key, definition ),
            registerConfigEditor: () => {}
        } );

        // Reconstruct the pre-CA-98 store state from the current (post-CA-98) file defaults, undoing exactly what
        // that release added:
        //  - role-family-competencies.QE shrinks to the shared-canonical codes only -- the same set every still-
        //    unpopulated family (e.g. XD) carries, since QE was itself unpopulated before CA-98;
        //  - the QE-specific competencies' dictionary entries are removed, since they did not exist yet;
        //  - active-competency-sets.QE is removed entirely -- QE had no baseline configured pre-release, which is
        //    the literal "QE stayed invisible" bug this feature exists to catch.
        const preCA98 = clone( configurationLoader.fileDefaults );
        const sharedCanonical = preCA98[ "role-family-competencies" ].XD.slice();
        const qeOnlyCodes = preCA98[ "role-family-competencies" ].QE.filter( ( code ) => !sharedCanonical.includes( code ) );
        assert.ok( qeOnlyCodes.length > 20, "sanity: reconstructing pre-CA-98 removes a meaningful number of QE-specific codes" );

        preCA98[ "role-family-competencies" ].QE = sharedCanonical;
        for ( const code of qeOnlyCodes ) {
            delete preCA98.competencies.competencies[ code ];
        }
        delete preCA98[ "active-competency-sets" ].QE;

        // Seed the store with that reconstructed pre-CA-98 state before configurationLoader ever sees it --
        // configurationLoader.initialize()'s own seedDefault() calls are seedIfEmpty, so they become no-ops for
        // these documents and the stale values are what gets loaded, exactly like a deployment seeded before CA-98.
        await Promise.all( Object.keys( preCA98 ).map( ( key ) => service.seedDefault( key, preCA98[ key ] ) ) );

        await configurationLoader.initialize( service );
        assert.ok(
            !configurationLoader.configRoleFamilyCompetencies.QE.includes( "E1-48" ),
            "the running pool must still be missing the release's QE-specific competencies -- this is the bug"
        );

        const drift = await service.listDrift();
        const statusOf = ( key ) => {
            const found = drift.find( ( d ) => d.configKey === key );
            return found ? found.status : undefined;
        };
        assert.equal( statusOf( "role-family-competencies" ), "drifted" );
        assert.equal( statusOf( "competencies" ), "drifted" );
        assert.equal( statusOf( "active-competency-sets" ), "drifted" );

        // The interdependency: applying the new active-competency-sets default alone fails, because its QE baseline
        // references competencies that are not yet in the (still stale) stored pool -- activeSetsWithinPool checks
        // the pending active-competency-sets value against role-family-competencies' STORED value when the latter
        // is not part of the same edit batch.
        const alone = await service.applyDefaults( [ "active-competency-sets" ], { adminID: "admin:qe-fixture" } );
        assert.equal( alone.ok, false );
        assert.ok( alone.errors[ "active-competency-sets" ], "QE's new baseline codes must be rejected against the still-stale stored pool" );

        // Applying the three drifted documents together succeeds, because applyEdits resolves each validator's
        // siblings at their PENDING (already-updated) values rather than the stale stored ones.
        const combined = await service.applyDefaults(
            [ "role-family-competencies", "competencies", "active-competency-sets" ],
            { adminID: "admin:qe-fixture", note: "release 2026-H2: restore the QE pool, dictionary entries, and baseline" }
        );
        assert.equal( combined.ok, true );

        // Let the config:changed hot-reload (subscribed inside configurationLoader.initialize) actually run --
        // ConfigChangeNotifier#publish is synchronous but does not await its listeners, so the listener's own
        // getCurrent()-then-reassign chain settles on a later tick.
        await new Promise( ( resolve ) => setImmediate( resolve ) );

        assert.deepEqual( configurationLoader.configRoleFamilyCompetencies.QE, configurationLoader.fileDefaults[ "role-family-competencies" ].QE );
        assert.deepEqual( configurationLoader.configCompetencies, configurationLoader.fileDefaults.competencies );
    } );

} );

describe( "configuration-loader — the organization-structure hot-reload branch (CA-107)", () => {
    // The onConfigChanged handler registered inside initialize() is the runtime mechanism that rebuilds the
    // organization chart when an admin edits the org-structure document, with no restart required. It has no other
    // test. It matters more than ordinary coverage because web-framework's ConfigChangeNotifier#publish delivers
    // each listener fire-and-forget inside a try/catch that only catches a SYNCHRONOUS throw from `listener(payload)`
    // — this listener returns a promise chain, so a rejection anywhere inside it (a broken require, a rejected
    // buildOrganizationChart()) would become an unhandled rejection that neither fails the admin's save nor appears
    // in the notifier's error log. The wiring is correct today; this test is the regression guard that keeps it so.

    it( "rebuilds the organization chart for its own key, not for an unrelated key, and its returned promise resolves", async () => {
        let capturedListener;
        const stubService = stubServiceWithDrift(
            () => Promise.resolve( [] ),
            ( listener ) => { capturedListener = listener; }
        );
        await configurationLoader.initialize( stubService );
        assert.equal( typeof capturedListener, "function", "initialize() must register a config:changed listener" );

        // buildOrganizationChart is a prototype method (unlike toUnitNodeID/toEmployeeNodeID, which are own arrow
        // class fields), so it stays writable through the prototype even though Object.freeze(instance) at the
        // bottom of organization-manager.js freezes the instance's own properties. Restored in `finally`, mirroring
        // how `captureLogs` above restores `logger.log` — a stub that leaks into a later test here is a defect.
        const OrganizationManagerPrototype = Object.getPrototypeOf( organizationManager.instance );
        const originalBuildOrganizationChart = OrganizationManagerPrototype.buildOrganizationChart;
        let callCount = 0;
        OrganizationManagerPrototype.buildOrganizationChart = () => {
            callCount++;
            return Promise.resolve();
        };

        try {
            // The discriminating half: an unrelated key must not touch the org chart.
            await assert.doesNotReject(
                () => capturedListener( { configKeys: [ "competencies" ] } ),
                "the listener's returned promise must resolve on the no-op path too"
            );
            assert.equal( callCount, 0, "an unrelated key must not rebuild the organization chart" );

            // The branch under test: its own key must rebuild the chart, and the returned promise must settle --
            // this is exactly what would catch a rejection ConfigChangeNotifier's synchronous try/catch cannot.
            await assert.doesNotReject(
                () => capturedListener( { configKeys: [ "organization-structure" ] } ),
                "the listener's returned promise must resolve, not reject silently"
            );
            assert.equal( callCount, 1, "the 'organization-structure' key must rebuild the organization chart exactly once" );
        } finally {
            OrganizationManagerPrototype.buildOrganizationChart = originalBuildOrganizationChart;
        }
    } );

} );

describe( "onStart boot order — the chart must be built from the STORED tree, not the file default (CA-107)", () => {
    // The regression this guards: onStart() (bin/competence-web-server.js) used to call buildOrganizationChart()
    // two steps before configurationLoader.initialize() ever ran. Since buildOrganizationChart() reads
    // configurationLoader.configOrganizationStructure at call time, and initialize() is the only thing that ever
    // replaces that export with the deployment's actual stored tree, every boot silently built the chart from the
    // shipped file-default demo tree instead — real managers lost MANAGER/SUPERVISOR derivation, and whoever holds
    // the demo tree's employee ID "22" became top manager.
    //
    // Driving the real onStart() end to end would need a live cache and message exchange, which this suite has no
    // access to — so this is NOT a test of onStart() itself. What it DOES prove is the causal claim the fix depends
    // on: called in the corrected order (initialize() before buildOrganizationChart()), the chart built afterward
    // reflects the STORED tree rather than the file default. That onStart() actually invokes them in this order is
    // verified separately, by reading bin/competence-web-server.js.

    it( "builds a chart whose top manager comes from the stored organization structure once initialize() has run first", async () => {
        const fileDefaultRoot = Object.values( configurationLoader.fileDefaults[ "organization-structure" ] ).find( ( unit ) => !unit.parent );
        assert.equal( fileDefaultRoot.managerID, "22", "sanity: the shipped demo tree's root manager is employee '22'" );

        // Snapshot the shared, module-level state this test is about to overwrite. configurationLoader.initialize()
        // reassigns the exported config object; buildOrganizationChart() replaces the organizationManager
        // singleton's internal graph, which has no public getter/setter, so there is nothing to snapshot directly.
        // Rebuilding once against whatever configuration is already in force turns "the chart's prior state" into a
        // concrete, reproducible value instead of an assumption -- empirically, at this point in the file no earlier
        // test has ever triggered a REAL buildOrganizationChart() (one block stubs the method out and restores it
        // without calling through), so the chart is still unbuilt and getTopManagerID() alone would read "" -- a
        // value a later rebuild could never reproduce on its own. Building it here first makes "prior state" a
        // value the `finally` block below can actually put back, and the assertions after it can actually prove
        // came back, rather than merely assuming so. This mirrors how `captureLogs` above restores `logger.log` in
        // a `finally` -- a fabricated tree that leaks into a later test in this file would be the same kind of
        // defect as a leaked logger stub.
        const previousOrganizationStructure = configurationLoader.configOrganizationStructure;
        await organizationManager.instance.buildOrganizationChart();
        const previousTopManagerID = organizationManager.instance.getTopManagerID();

        // A deployment's real, stored root unit — deliberately unlike the shipped demo tree, so the two are never
        // mistaken for one another by this assertion.
        const storedOrganizationStructure = {
            "root-unit": {
                id: "root-unit",
                name: "Stored Root",
                displayName: "Stored Root",
                description: "This deployment's real, stored root unit.",
                type: "Organization",
                managerID: "999",
                parent: null,
                children: []
            }
        };

        const stubService = {
            seedDefault: ( configKey ) => Promise.resolve( { value: configurationLoader.fileDefaults[ configKey ], version: 1 } ),
            getCurrent: ( configKey ) => Promise.resolve( {
                value: ( configKey === "organization-structure" ) ? storedOrganizationStructure : configurationLoader.fileDefaults[ configKey ],
                version: 1
            } ),
            onConfigChanged: () => () => {},
            listDrift: () => Promise.resolve( [] )
        };

        try {
            // The fixed order, minus the framework lifecycle around it: initialize() first (loads the stored tree
            // into configOrganizationStructure), THEN buildOrganizationChart() (reads that export at call time) —
            // exactly bin/competence-web-server.js's corrected onStart() sequence.
            await configurationLoader.initialize( stubService );
            assert.deepEqual(
                configurationLoader.configOrganizationStructure, storedOrganizationStructure,
                "initialize() must replace the export with the stored value before the chart is ever built"
            );

            await organizationManager.instance.buildOrganizationChart();

            assert.equal(
                organizationManager.instance.getTopManagerID(), "999",
                "the chart built after initialize() must reflect the STORED root manager, not the demo tree's '22'"
            );
        } finally {
            // Undo both mutations this test made to shared, module-level singleton state: put the config export
            // back first, then rebuild the chart from it so the singleton's OBSERVABLE state — not merely the
            // config export — matches what it was before this test ran, exactly as captured above.
            configurationLoader.configOrganizationStructure = previousOrganizationStructure;
            await organizationManager.instance.buildOrganizationChart();
        }

        // Confirm the isolation actually holds, rather than assuming the `finally` block above did its job.
        assert.equal(
            configurationLoader.configOrganizationStructure, previousOrganizationStructure,
            "configOrganizationStructure must be restored to its pre-test value so a later test in this file never sees the fabricated tree"
        );
        assert.equal(
            organizationManager.instance.getTopManagerID(), previousTopManagerID,
            "the organization chart's top manager must be restored to its pre-test value, not left as the fabricated '999'"
        );
    } );

} );

describe( "configuration-loader — stored documents that no longer satisfy their schema", () => {

    // Distinct from drift. Drift means the deployment serves OLDER content than the build ships, which somebody may
    // have chosen. This means it serves content the build no longer considers well-formed — the state a store
    // written before `role-families` required TC is in, where the first symptom is an unrelated admin edit rejected
    // for a key nobody touched.

    const stubWithViolations = ( listSchemaViolations ) => Object.assign(
        stubServiceWithDrift( () => Promise.resolve( [] ) ),
        { listSchemaViolations: listSchemaViolations }
    );

    it( "logs one ERROR per offending document, naming it and the reason", async () => {
        const captured = await captureLogs( () => configurationLoader.initialize( stubWithViolations( () => Promise.resolve( [
            { configKey: "role-families", errors: [ { path: "(root)", message: "must have required property 'TC'" } ] }
        ] ) ) ) );

        const errors = captured.filter( ( entry ) => entry.severity === logger.logSeverity.ERROR );
        assert.equal( errors.length, 1 );
        assert.match( errors[ 0 ].message, /role-families/ );
        assert.match( errors[ 0 ].message, /required property 'TC'/ );
        assert.match( errors[ 0 ].message, /Administration/, "the message names where to fix it" );
    } );

    it( "says nothing when every stored document validates", async () => {
        const captured = await captureLogs( () => configurationLoader.initialize( stubWithViolations( () => Promise.resolve( [] ) ) ) );
        assert.equal( captured.filter( ( entry ) => entry.severity === logger.logSeverity.ERROR ).length, 0 );
    } );

    it( "caps the detail it prints and says how much it left out", async () => {
        const errors = Array.from( { length: 7 }, ( _, i ) => ( { path: `.k${ i }`, message: "schema violation" } ) );
        const captured = await captureLogs( () => configurationLoader.initialize( stubWithViolations( () => Promise.resolve( [
            { configKey: "competencies", errors: errors }
        ] ) ) ) );

        const line = captured.find( ( entry ) => entry.severity === logger.logSeverity.ERROR ).message;
        assert.match( line, /\(\+4 more\)/ );
    } );

    it( "never gates boot when the check itself fails", async () => {
        const captured = await captureLogs( () => configurationLoader.initialize(
            stubWithViolations( () => Promise.reject( new Error( "registry unavailable" ) ) ) ) );
        assert.ok( captured.some( ( entry ) => entry.severity === logger.logSeverity.WARNING ) );
    } );

    it( "tolerates a framework too old to offer the check", async () => {
        // The competence package declares a floor, but a local link or a partial upgrade can still put an older
        // web-framework underneath it; an absent capability must be silence, not a crash.
        const captured = await captureLogs( () => configurationLoader.initialize( stubServiceWithDrift( () => Promise.resolve( [] ) ) ) );
        assert.equal( captured.filter( ( entry ) => entry.severity === logger.logSeverity.ERROR ).length, 0 );
    } );

} );
