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

"use strict";

/*
 * A `TiException` serializes as what it holds.
 *
 * It keeps everything in private fields, so `JSON.stringify` found no own properties and wrote `{}`. The logger
 * converts an exception passed as the entry's data or as its `exception` key, but one nested anywhere else — the
 * shape `{ reason: error }`, say — reached the JSON log line as `{}` and took its cause with it (R2H8-1).
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const exceptions = require( "../utils/exceptions.js" );

describe( "TiException serialization", () => {

    const exception = exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "the cause" }, exceptions.httpCode.C_422 );

    it( "serializes as asJSON(), not as an empty object", () => {
        assert.deepEqual( JSON.parse( JSON.stringify( exception ) ), JSON.parse( JSON.stringify( exception.asJSON() ) ) );
    } );

    it( "serializes where it is nested", () => {
        const logged = JSON.parse( JSON.stringify( { reason: exception } ) );
        assert.equal( logged.reason.code, exceptions.exceptionCode.E_APP_SERVICE_ERROR );
        assert.equal( logged.reason.data.details, "the cause" );
    } );

} );
