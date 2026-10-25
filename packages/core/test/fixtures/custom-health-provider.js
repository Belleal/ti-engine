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

const EchoProvider = require( "./echo-provider.js" );

/**
 * An {@link EchoProvider} that reports its health somewhere of its own, as `reportHealthy` invites a subclass to, and
 * so never writes the built-in heartbeat key. A caller cannot watch it through the roster, which must therefore count
 * it as running for as long as it is recorded, as every instance was counted before rosters.
 *
 * @class CustomHealthProvider
 * @extends EchoProvider
 * @public
 */
class CustomHealthProvider extends EchoProvider {

    reportHealthy() {
        // Reported elsewhere - an HTTP endpoint, say - and deliberately not through super.reportHealthy().
    }

}

module.exports = CustomHealthProvider;
