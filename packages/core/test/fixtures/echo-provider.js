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

const path = require( "node:path" );
const ServiceProvider = require( "#service-provider" );

/**
 * A provider of one service, `echo`, that answers with the parameters it was given. `bin/start-instance.js` runs it
 * as a real process, so a test can stop it cleanly or kill it and watch what a caller in another process is told.
 * <br/>
 * NOTE: The service list is its own rather than a TI_INSTANCE_CONFIG file, because start-instance resolves that path
 * against the working directory. The handler path is resolved the same way, so it is made relative to it here.
 *
 * @class EchoProvider
 * @extends ServiceProvider
 * @public
 */
class EchoProvider extends ServiceProvider {

    constructor( serviceDomainName ) {
        super( serviceDomainName, {
            services: [ {
                serviceAlias: "echo",
                serviceFile: path.relative( process.cwd(), path.join( __dirname, "echo-service.js" ) ),
                serviceVersion: 1
            } ]
        } );
    }

}

module.exports = EchoProvider;
