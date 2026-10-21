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

/*
 * The smallest application with Feedback turned on, for a test that runs a real `TiWebServer` and needs a request to
 * reach Send Feedback's handler. The server loads it from `application.classPath`, relative to the working directory.
 */

const TiWebAppManager = require( "#web-app-manager" );

class FeedbackApplication extends TiWebAppManager {
    constructor() {
        super( "feedback-test-application" );
        this.enableFeedback();
    }
}

module.exports = FeedbackApplication;
