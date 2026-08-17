/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Exercises `consentTextVersionBumped` through the REAL @ti-engine/web-framework config-management stack — the real
 * (singleton) ConfigService/ConfigRegistry/ConfigStore — instead of a hand-rolled ValidatorContext stub. The unit
 * tests in research-consent.config.test.js call the validator directly with a stub context and cannot reproduce
 * ConfigService#applyEdits' actual "pending wins for a document inside its own edit batch" semantics; this suite
 * proves the validator is genuinely wired to reject an unbumped text edit once it flows through that real path.
 *
 * Documents are registered into the framework's real ConfigRegistry singleton via TiWebAppManager's prototype
 * methods attached to a minimal stub object — those methods (`registerConfigDocument` / `registerConfigEditor`) only
 * close over module-level singletons and never touch `this` beyond returning it, so this reaches the same
 * production registration path without constructing a full CompetenceWebApplication/Express app.
 *
 * NOTE: this suite registers competence's config documents into web-framework's process-wide singleton
 * ConfigRegistry, so — like config-live.test.js — it lives in its own file (node --test isolates each file in a
 * separate process).
 */

const { describe, it, before, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { installInMemoryCache } = require( "./helpers/in-memory-cache" );

let cacheStub;
let service;

before( () => {
    cacheStub = installInMemoryCache();

    const ConfigService = require( "@ti-engine/web-framework/config-management" );
    const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );
    const { registerCompetenceConfig } = require( "../application/config-registration" );

    service = ConfigService.instance;
    registerCompetenceConfig( {
        registerConfigDocument: TiWebAppManager.prototype.registerConfigDocument,
        registerConfigEditor: TiWebAppManager.prototype.registerConfigEditor
    } );
} );

beforeEach( () => {
    cacheStub.storage = {};
} );

const STORED = {
    enabled: true,
    version: "1.0",
    text: { en: { body: "Statement A" }, bg: { body: "Изявление А" } }
};

describe( "research-consent — consentTextVersionBumped through the real ConfigService", () => {

    it( "rejects a body change that leaves the version unchanged", async () => {
        await service.seedDefault( "research-consent", STORED );
        const changed = { enabled: true, version: "1.0", text: { en: { body: "Statement B" }, bg: { body: "Изявление А" } } };

        const result = await service.applyEdits( [ { configKey: "research-consent", value: changed, expectedVersion: 1 } ], { adminID: "admin:1" } );

        assert.equal( result.ok, false );
        assert.ok( result.errors[ "research-consent" ].some( ( issue ) => issue.code === "consent-version" ), "the consent-version guard must fire" );
        assert.deepEqual( ( await service.getCurrent( "research-consent" ) ).value, STORED, "no write on validation failure" );
    } );

    it( "accepts the same body change when the version is bumped", async () => {
        await service.seedDefault( "research-consent", STORED );
        const changed = { enabled: true, version: "1.1", text: { en: { body: "Statement B" }, bg: { body: "Изявление А" } } };

        const result = await service.applyEdits( [ { configKey: "research-consent", value: changed, expectedVersion: 1 } ], { adminID: "admin:1" } );

        assert.equal( result.ok, true );
        assert.deepEqual( ( await service.getCurrent( "research-consent" ) ).value, changed );
    } );

} );
