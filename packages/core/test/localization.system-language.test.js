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
 * `localization.getSystemLanguage` — the language a deployment resolved to, for a caller that has to store it.
 *
 * `getLabel` already falls back to this language when it is given none, but nothing could ASK for it: the setting
 * lives in the `config` module, which core does not export. So a consumer that needed the code itself had to guess,
 * and web-framework guessed "en" — its own `language` default — which is how a deployment set to Bulgarian with
 * `TI_LOCALIZATION_LANGUAGE` turned English the moment anybody signed in (CA-198), while its login page, which asks
 * core with no language at all, stayed Bulgarian.
 *
 * Core reads the environment once, when its configuration loads, so the variable is set before anything is required.
 */

process.env.TI_LOCALIZATION_LANGUAGE = "bg";

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const localization = require( "../utils/localization.js" );

describe( "localization.getSystemLanguage", () => {

    it( "reports the language the environment set", () => {
        assert.equal( localization.getSystemLanguage(), "bg" );
    } );

    it( "is the language a lookup without one resolves in", () => {
        assert.equal( localization.getLabel( "system.exceptions.2002" ), localization.getLabel( "system.exceptions.2002", localization.getSystemLanguage() ) );
    } );

} );
