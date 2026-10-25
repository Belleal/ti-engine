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

// Answers with a copy of its parameters, never the object itself. Returned as it is, the response would hold the same
// object twice (its `serviceParams` and its `payload`), which the sender's integrity hash reads through `decycle` as a
// `$ref` and the receiver, after JSON has made two objects of it, does not: the caller logs the response as tampered
// with and waits out its executionTimeout.
module.exports.service = function ( serviceDefinition, serviceParams ) {
    return Promise.resolve( Object.assign( {}, serviceParams ) );
};
