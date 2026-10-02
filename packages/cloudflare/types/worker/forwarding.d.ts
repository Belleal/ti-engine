declare const _exports: {
    forContainer: typeof forContainer;
    FORWARDING_CLAIMS: string[];
};
export = _exports;
/**
 * The request the container receives: the same request, with every forwarding claim ({@link FORWARDING_CLAIMS})
 * dropped, then `X-Forwarded-For` set to the address Cloudflare connected to, which a client cannot set, and
 * `X-Forwarded-Proto` to the scheme of the URL actually requested. With no connecting address, as in a local run, no
 * address is claimed at all. `Host` is left alone: Cloudflare routed the request by it, so it is a hostname bound to
 * this Worker.
 * <br/>
 * The request it is given is left as it is. A Worker may still need it, as the key it stores the response under, and
 * the runtime's own request has immutable headers.
 *
 * @method
 * @param {Request} request The request as the Worker received it.
 * @returns {Request}
 * @public
 */
declare function forContainer(request: Request): Request;
