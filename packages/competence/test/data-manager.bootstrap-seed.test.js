/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Guards the separation between the bootstrap content shipped with a release and the demo data behind
 * `COMPETENCE_PRELOAD_DATA`.
 *
 * These arrived together until now, which meant a real install could have the curated baselines only by also taking
 * the eleven seeded employees — permanently, since an employee is never deleted, only terminated. With the flag off
 * the runtime collections came up empty, `getActiveCompetencySet` threw 422 for every family, and cycle lock failed
 * `no-empty-baseline` across the board, while the repository shipped a complete set the whole time.
 */

const { describe, it, beforeEach, afterEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );

const CYCLE = "2026-H2";

describe( "DataManager.initialize — bootstrap content vs demo data", () => {

    let previousFlag;

    beforeEach( () => {
        previousFlag = process.env.COMPETENCE_PRELOAD_DATA;
        installInMemoryCache();
    } );

    afterEach( () => {
        if ( previousFlag === undefined ) {
            delete process.env.COMPETENCE_PRELOAD_DATA;
        } else {
            process.env.COMPETENCE_PRELOAD_DATA = previousFlag;
        }
    } );

    it( "seeds the shipped baselines with the demo flag off", async () => {
        process.env.COMPETENCE_PRELOAD_DATA = "false";
        await dataManager.instance.initialize();

        const shipped = configurationLoader.configActiveCompetencySets || {};
        // IO is a defined but unpopulated family and ships no baseline, so the expectation is "every family the
        // release actually configured", not "every family that exists".
        const configured = Object.keys( shipped ).filter( ( family ) => {
            const baseline = shipped[ family ] && shipped[ family ].baseline;
            return Array.isArray( baseline && baseline[ CYCLE ] ) && baseline[ CYCLE ].length > 0;
        } );
        assert.ok( configured.length >= 9, `the release ships baselines for ${ configured.length } families` );

        for ( const family of configured ) {
            const baseline = await dataManager.instance.getBaselineSet( family, CYCLE );
            assert.deepEqual( baseline, shipped[ family ].baseline[ CYCLE ], `${ family } arrives complete on a fresh install` );
        }
    } );

    it( "seeds the role families with the demo flag off", async () => {
        process.env.COMPETENCE_PRELOAD_DATA = "false";
        await dataManager.instance.initialize();

        const stored = await dataManager.instance.getRoleFamilies();
        assert.deepEqual(
            Object.keys( stored ).sort(),
            Object.keys( configurationLoader.configRoleFamilies ).sort()
        );
    } );

    it( "seeds no employees, evaluations or cycles with the demo flag off", async () => {
        process.env.COMPETENCE_PRELOAD_DATA = "false";
        await dataManager.instance.initialize();

        assert.deepEqual( await dataManager.instance.fetchEmployees(), [], "a real install starts with no people" );
        assert.deepEqual( await dataManager.instance.getAllCycles(), [], "and with no cycle" );
    } );

    it( "still seeds the demo employees when the flag is on", async () => {
        process.env.COMPETENCE_PRELOAD_DATA = "true";
        await dataManager.instance.initialize();

        const employees = await dataManager.instance.fetchEmployees();
        assert.ok( employees.length > 0, "the demo path is unchanged" );
    } );

    it( "leaves an edited baseline alone on the next boot", async () => {
        // The bootstrap content is the collection's INITIAL value, not a merge repeated every start: an operator who
        // trims a baseline must not find it restored tomorrow. This is the property that separates it from the demo
        // seed, which is deliberately re-applied while the flag is set.
        process.env.COMPETENCE_PRELOAD_DATA = "false";
        await dataManager.instance.initialize();

        await dataManager.instance.setActiveCompetencySet( "SE", "baseline", CYCLE, [ "E1-3" ] );
        await dataManager.instance.initialize();

        assert.deepEqual( await dataManager.instance.getBaselineSet( "SE", CYCLE ), [ "E1-3" ] );
    } );

} );
