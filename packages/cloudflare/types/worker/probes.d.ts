declare const _exports: {
    createProbeFilter: typeof createProbeFilter;
    probeResponse: typeof probeResponse;
    PROBE_RULES: string[];
};
export = _exports;
/**
 * Builds the filter a Worker asks about every request, before anything else, so a probe is answered without waking
 * the container.
 * <br/>
 * The options are read once, here. An option or a rule that does not exist is refused rather than ignored: the filter
 * is built when the Worker's module loads, so the refusal fails the deploy, where ignoring it would leave the
 * application's own URLs answering 404 at the edge with nothing in any log to say why.
 *
 * @method
 * @param {Object} [options]
 * @param {Object<string, string[]>} [options.except] Rule name → the path prefixes it is not applied under, compared
 * with the decoded path, ignoring case: `{ wordpress: [ "/wp-content/uploads/" ] }`. Every other rule still applies
 * under them.
 * @param {string[]} [options.disable] The names of rules not applied at all.
 * @returns {(pathname: string, search?: string) => boolean} `isProbe`: the path as `URL` gives it,
 * percent-encoded, and its query with the `?`. A path that does not decode is always a probe: no application
 * published it, and no server behind the Worker could route it.
 * @throws {TypeError} If an option, a rule's name or an exception is malformed.
 * @public
 */
declare function createProbeFilter(options?: {
    except?: Record<string, string[]>;
    disable?: string[];
}): (pathname: string, search?: string) => boolean;
/**
 * The answer to a probe: a plain 404, which says nothing about what does exist. A new one each time, since a body can
 * be read once.
 *
 * @method
 * @returns {Response}
 * @public
 */
declare function probeResponse(): Response;
