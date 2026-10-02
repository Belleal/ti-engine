declare const _exports: {
    createWorker: typeof createWorker;
};
export = _exports;
export type WorkerContext = {
    /**
     * The Worker's bindings.
     */
    env: Object;
    /**
     * The Worker's execution context.
     */
    ctx: {
        waitUntil: (promise: Promise<any>) => void;
    };
    /**
     * The request's URL, parsed once.
     */
    url: URL;
};
export type Worker = {
    fetch: (request: Request, env: Object, ctx: {
        waitUntil: (promise: Promise<any>) => void;
    }) => Promise<Response>;
    /**
     * Present only with a `sweep`.
     */
    scheduled?: (controller: any, env: Object, ctx: {
        waitUntil: (promise: Promise<any>) => void;
    }) => Promise<void>;
};
/**
 * The Worker in front of an application's container: its `fetch` and, with a `sweep`, its `scheduled`. Built when the
 * Worker's module loads, so a malformed option fails the deploy rather than a request.
 *
 * ```js
 * import { getContainer } from "@cloudflare/containers";
 * import { sweepExpired } from "@ti-engine/core/state-service";
 * import { createWorker } from "@ti-engine/cloudflare/worker";
 *
 * export default createWorker( { getContainer, sweep: sweepExpired } );
 * ```
 *
 * A request is decided in this order:
 * 1. A scanner's probe is answered `404` here, for any method, by {@link module:probes.probeResponse}. Neither the
 *    application's hook nor the container sees it, so it never wakes the container or holds it awake.
 * 2. The application's `edge` hook, when it has one, gets the request as the Worker received it, and `origin`, which
 *    sends it to the container. It may answer without calling `origin`, as an edge cache does on a hit, or call it
 *    once and work on the answer, as timing does.
 * 3. The container gets the request as {@link module:forwarding.forContainer} gives it: told the visitor's address and
 *    scheme as Cloudflare saw them, and nothing a client claimed.
 *
 * Every response then passes through the application's `finish`, a probe's answer included, for the headers that
 * belong on every response. A WebSocket upgrade passes through untouched, since it cannot be rebuilt.
 *
 * @method
 * @param {Object} options
 * @param {(namespace: *) => { fetch: (request: Request) => Promise<Response> }} options.getContainer
 * `@cloudflare/containers`' `getContainer`.
 * @param {string} [options.binding] The container's Durable Object binding: `CONTAINER` unless stated.
 * @param {{ except?: Object<string, string[]>, disable?: string[] }} [options.probes] How the probe rules fit the
 * application: what {@link module:probes.createProbeFilter} takes.
 * @param {(request: Request, origin: () => Promise<Response>, context: WorkerContext) => (Response|Promise<Response>)}
 * [options.edge] The application's own step between the probe check and the container.
 * @param {(response: Response, context: WorkerContext) => (Response|Promise<Response>)} [options.finish] Applied to
 * every response the Worker sends.
 * @param {(database: *) => Promise<*>} [options.sweep] Sweeps expired state on the Worker's schedule, such as core's
 * `sweepExpired`. Without it, the Worker has no `scheduled` handler.
 * @param {string} [options.database] The database binding the sweep is given: `DB` unless stated.
 * @returns {Worker} Frozen.
 * @throws {TypeError} If an option is malformed. A request fails with one when a hook answers with something other than
 * a response, naming the hook.
 * @public
 */
declare function createWorker(options: {
    getContainer: (namespace: any) => {
        fetch: (request: Request) => Promise<Response>;
    };
    binding?: string;
    probes?: {
        except?: Record<string, string[]>;
        disable?: string[];
    };
    edge?: (request: Request, origin: () => Promise<Response>, context: WorkerContext) => (Response | Promise<Response>);
    finish?: (response: Response, context: WorkerContext) => (Response | Promise<Response>);
    sweep?: (database: any) => Promise<any>;
    database?: string;
}): Worker;
