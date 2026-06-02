/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const TiWebAppManager = require( "#web-app-manager" );
const configRegistry = require( "#config-registry" );
const configService = require( "#config-service" );

class TestApp extends TiWebAppManager {
    constructor() {
        super( "test-app-config-registration" );
    }
}

describe( "TiWebAppManager — config registration API", () => {

    it( "registers config documents, ref schemas, and composite editors with the framework singletons", () => {
        const app = new TestApp();
        const schema = { $id: "https://ti-engine.test/b2a-doc.json", type: "object", properties: { x: { type: "integer" } }, required: [ "x" ], additionalProperties: false };

        const returned = app.registerConfigDocument( "b2a-doc", { schema: schema, validators: [], defaultValue: { x: 0 }, metadata: { path: "bin/config/b2a.json" } } );
        assert.equal( returned, app, "registerConfigDocument is chainable" );
        app.registerConfigEditor( "b2a-editor", { documents: [ "b2a-doc" ], compose: ( docs ) => docs, decompose: ( edited ) => ( { "b2a-doc": edited } ) } );

        assert.equal( configRegistry.instance.has( "b2a-doc" ), true );
        assert.deepEqual( configRegistry.instance.getDefault( "b2a-doc" ), { x: 0 } );
        assert.equal( configService.instance.hasEditor( "b2a-editor" ), true );
        assert.ok( configService.instance.listEditors().includes( "b2a-editor" ) );
    } );

} );
