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
 * The Worker in front of the application's container, from `@ti-engine/cloudflare`'s template (CA-371). It is the
 * application's only public address: the container has none of its own.
 *
 * A request is decided in the package's order. A scanner's probe is answered 404 here, without waking the container.
 * Everything else goes to the container, told the visitor's address and scheme as Cloudflare saw them. The container's
 * own requests to the state address never leave the sandbox: they are answered here, by core's state service, from
 * the D1 database bound as `DB`. The schedule sweeps expired state.
 *
 * This is an ES module, as a module Worker must be, and wrangler bundles it. Node cannot load it as it is, because
 * `@cloudflare/containers` resolves only through a bundler, so `test/cloudflare.test.mjs` loads it with that one import
 * replaced. The names to change are in the template's README.
 */

import { Container, getContainer } from "@cloudflare/containers";
// The engine's own end of the state protocol. Take it from the same core release as the container's client, so both
// ends of the protocol come from one version.
import { createD1StateService, sweepExpired } from "@ti-engine/core/state-service";
import { containerSetup, outboundByHost } from "@ti-engine/cloudflare/container";
import { createWorker } from "@ti-engine/cloudflare/worker";

// The runtime finds this by name on the Worker's exports and routes the container's outbound requests through it.
// Without it the state service is never reached, and the container never starts.
export { ContainerProxy } from "@cloudflare/containers";

/**
 * What the container is, checked when this module loads, so a malformed option fails the deploy.
 *
 * - `egress`: what the container may reach besides the state address. `intercepted` reaches the identity providers of
 *   the sign-in methods its environment enables, and nothing else; with none enabled, nothing else at all.
 * - `environment`: every `TI_*` string binding the Worker holds reaches the container, and every `APP_*` one, the
 *   application's own prefix. The platform's settings go over them.
 * - `sleepAfter`: how long the container stays awake without a request. It is billed for every 10 ms it is awake, so
 *   this decides the bill more than traffic does.
 */
const setup = containerSetup( {
    egress: "intercepted",
    environment: { prefixes: [ "APP" ] },
    sleepAfter: "2m"
} );

/**
 * The application's container: the image the Dockerfile builds. The class is the application's own, named as
 * `wrangler.jsonc` names it, because `@cloudflare/containers` keeps a class's outbound handlers under the class's name.
 */
export class ApplicationContainer extends Container {

    /**
     * The fields are set per start rather than as class fields, because the secrets come from the Worker's bindings,
     * and a class field has no `env` in scope.
     *
     * @param {Object} ctx
     * @param {Object} env
     * @param {Object} [options]
     */
    constructor( ctx, env, options ) {
        super( ctx, env, options );
        Object.assign( this, setup( env ) );
    }

}

// The container's requests to the state address, answered from the database bound as `DB`. Set on the class itself,
// when this module loads: the library looks the handlers up by the name of the class a container runs as.
ApplicationContainer.outboundByHost = outboundByHost( { state: ( database ) => createD1StateService( database ) } );

/**
 * The Worker: a probe answered first, then the container. The schedule is housekeeping: reads already hide an expired
 * row, but a table nobody prunes grows without bound, and D1 bills by rows read.
 */
export default createWorker( { getContainer: getContainer, sweep: sweepExpired } );
