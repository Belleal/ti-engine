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

const localization = require( "@ti-engine/core/localization" );

/*
 * Lays web-framework's label catalogue under the application's, once, when the first module that reads labels loads
 * (CA-555). Every such module requires this one, so whichever an application reaches first, the catalogue is in place
 * before a label is read: the sign-in card, the shell, the notices and the client bundle all resolve the framework's
 * keys in every language it carries, and an application's own entry for a key still wins.
 *
 * Before this, an application had to copy each framework key into its own catalogue, the only one it configures. A
 * key it lacked showed its English fallback in every language, and an application with no catalogue of its own lost
 * all of them - including the sign-in link's notice texts, without which the `email-link` method is dropped at start.
 */
localization.addCatalogue( require( "#web-server-labels" ) );
