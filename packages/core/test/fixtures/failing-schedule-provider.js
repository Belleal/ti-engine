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

const schedule = require( "node-schedule" );
const EchoProvider = require( "./echo-provider.js" );

// The health report is the only thing core schedules, and it is scheduled after the roster join has landed, so this
// makes a start fail at exactly the point where the instance is already recorded.
schedule.scheduleJob = () => {
    throw new Error( "scheduling failed" );
};

/**
 * An {@link EchoProvider} whose start fails after it has joined its domain's roster, because node-schedule refuses the
 * health report's job. `bin/start-instance.js` exits on a failed start without stopping the instance, so whatever the
 * start recorded has to be taken back by the start itself.
 *
 * @class FailingScheduleProvider
 * @extends EchoProvider
 * @public
 */
class FailingScheduleProvider extends EchoProvider {}

module.exports = FailingScheduleProvider;
