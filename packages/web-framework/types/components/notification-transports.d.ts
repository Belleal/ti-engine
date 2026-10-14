declare const _exports: {
    TRANSIENT_CODES: readonly string[];
    DAILY_LIMIT_CODE: string;
    transportError: typeof transportError;
    createLogTransport: typeof createLogTransport;
    createRelayTransport: typeof createRelayTransport;
};
export = _exports;
import type { TiMailTransport } from "#definitions";
/**
 * Builds a transport failure in the shape the dispatcher reads.
 *
 * @method
 * @param {string} code
 * @param {boolean} [transient] When absent, decided from {@link TRANSIENT_CODES}.
 * @param {string} [detail]
 * @returns {Error & {code: string, transient: boolean}}
 * @public
 */
declare function transportError(code: string, transient?: boolean, detail?: string): Error & {
    code: string;
    transient: boolean;
};
/**
 * A transport that sends nothing and records that it would have. For development, tests and any environment that must
 * not mail people. The line names the subject's length rather than the subject, and never the address: a rendered
 * notice can carry a date or a task, and an address is personal data the logs must not hold.
 *
 * @method
 * @returns {TiMailTransport}
 * @public
 */
declare function createLogTransport(): TiMailTransport;
/**
 * A transport that posts each message to a relay, which sends it. On Cloudflare the relay is the Worker in front of
 * the container, reached on the address the state service already answers on, and it sends through its `send_email`
 * binding: the container holds no credential, because the binding is the authentication.
 * <br/>
 * The relay answers `200` with `{ messageId }`, or a non-2xx status with `{ code, transient }`. Anything else, a
 * timeout or a network failure included, is reported as a transient `E_RELAY_UNAVAILABLE`: the message stays queued.
 *
 * @method
 * @param {string} url The relay's address, such as `http://11.0.0.1/v1/mail/send`.
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetch] Injectable for tests.
 * @param {number} [options.timeout] Milliseconds; {@link RELAY_TIMEOUT} unless stated.
 * @returns {TiMailTransport}
 * @throws {TypeError} If the URL is not an http(s) URL.
 * @public
 */
declare function createRelayTransport(url: string, options?: {
    fetch?: typeof fetch;
    timeout?: number;
}): TiMailTransport;
