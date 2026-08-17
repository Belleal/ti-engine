/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
