/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// NOTE: this suite mutates the configuration-loader module's exported config objects, so it lives in its own file
// (node --test isolates each file in a separate process).

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const configurationLoader = require( "#configuration-loader" );

const tick = () => new Promise( ( resolve ) => setImmediate( resolve ) );

describe( "configuration-loader — store-backed initialize", () => {

    it( "seeds + loads store values into the exported config and refreshes on config:changed", async () => {
        // A stub config service standing in for @ti-engine/web-framework/config-management.
        const store = { "competencies": { categories: {}, competencies: { "Z9-9": { relevancyArchetype: "A" } } } };
        let listener;
        const stubService = {
            seedDefault: ( configKey, defaultValue ) => {
                if ( store[ configKey ] === undefined ) store[ configKey ] = defaultValue;
                return Promise.resolve( { value: store[ configKey ], version: 1 } );
            },
            getCurrent: ( configKey ) => Promise.resolve( { value: store[ configKey ] !== undefined ? store[ configKey ] : {}, version: 1 } ),
            onConfigChanged: ( fn ) => { listener = fn; return () => {}; }
        };

        await configurationLoader.initialize( stubService );
        assert.deepEqual( configurationLoader.configCompetencies, { categories: {}, competencies: { "Z9-9": { relevancyArchetype: "A" } } }, "store value (not the file default) is loaded" );

        // Simulate an admin edit landing in the store + a config:changed event for it.
        store[ "competencies" ] = { categories: {}, competencies: { "Q1-1": {} } };
        await listener( { configKeys: [ "competencies" ] } );
        await tick();
        assert.deepEqual( configurationLoader.configCompetencies, { categories: {}, competencies: { "Q1-1": {} } }, "exported config refreshes after the change event" );
    } );

} );
