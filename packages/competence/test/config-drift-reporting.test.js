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
const configurationLoader = require( "#configuration-loader" );
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
const stubServiceWithDrift = ( listDrift ) => ( {
    seedDefault: ( configKey ) => Promise.resolve( { value: configurationLoader.fileDefaults[ configKey ], version: 1 } ),
    getCurrent: ( configKey ) => Promise.resolve( { value: configurationLoader.fileDefaults[ configKey ], version: 1 } ),
    onConfigChanged: () => () => {},
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

    it( "exposes the seven store-backed file defaults", () => {
        assert.deepEqual( Object.keys( configurationLoader.fileDefaults ).sort(), [
            "active-competency-sets", "competencies", "relevancy-archetypes", "research-consent",
            "role-families", "role-family-competencies", "stage-levels"
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
