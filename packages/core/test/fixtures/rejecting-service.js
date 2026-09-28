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

const ServiceConsumer = require( "#service-consumer" );
const exceptions = require( "#exceptions" );

/**
 * A service whose start leaves a {@link TiException} rejection unhandled — the shape of a background write that fails
 * with nobody listening — so a test can read what `start-instance` logs about it before the process exits.
 *
 * @class RejectingService
 * @extends ServiceConsumer
 * @public
 */
class RejectingService extends ServiceConsumer {

    onStart() {
        return super.onStart().then( () => {
            Promise.reject( exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "the cause that used to be lost" } ) );
        } );
    }

}

module.exports = RejectingService;
