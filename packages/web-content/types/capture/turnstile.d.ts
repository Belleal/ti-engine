declare const _exports: {
    publicTurnstile: typeof publicTurnstile;
    resolveTurnstile: typeof resolveTurnstile;
    verifyTurnstileToken: typeof verifyTurnstileToken;
    TURNSTILE_SCRIPT_URL: string;
    TURNSTILE_ACTION: string;
    TURNSTILE_RESPONSE_FIELD: string;
};
export = _exports;
/**
 * The widget's public configuration: the site key, and the theme it draws in.
 * <br/>
 * It copies nothing else. The natural way to configure both halves is one object carrying the key and the secret, and a
 * renderer handed that object could print the secret into a page.
 *
 * @method
 * @param {{ siteKey?: string, theme?: string }} [config]
 * @returns {{ siteKey: string, theme: string }|null} Frozen, or null when no site key is configured.
 * @public
 */
declare function publicTurnstile(config?: {
    siteKey?: string;
    theme?: string;
}): {
    siteKey: string;
    theme: string;
} | null;
/**
 * What the capture endpoint does with a submission's challenge, decided once at mount:
 * - `off`: no site key and no secret. Nothing is drawn and nothing is checked, as before.
 * - `on`: both. Every submission's token is verified before it is stored.
 * - `misconfigured`: one without the other. A key without its secret draws a widget whose token nothing checks, and a
 *   secret without a key checks a token no form can carry. Either way every submission is refused, and `problem` says
 *   why. Refusing is visible; accepting unchecked is not.
 *
 * @method
 * @param {{ siteKey?: string, secret?: string }} [config]
 * @returns {{ mode: string, secret?: string, problem?: string }}
 * @public
 */
declare function resolveTurnstile(config?: {
    siteKey?: string;
    secret?: string;
}): {
    mode: string;
    secret?: string;
    problem?: string;
};
/**
 * Asks Cloudflare whether a submission's token is genuine.
 * <br/>
 * Fails closed. Each of these is refused:
 * - a missing or overlong token;
 * - an unreachable or slow `siteverify`;
 * - an answer that is not a success;
 * - a token issued for another action.
 *
 * A token that names no action is accepted: the action narrows where a token may be used, and is not what proves it
 * genuine. The visitor's address is deliberately not sent. It is optional, and the capture store's rule is that no IP is
 * ever read, let alone passed on.
 *
 * @method
 * @param {string} token The submitted `cf-turnstile-response`.
 * @param {{ secret: string, fetch?: Function, timeoutMs?: number }} options `fetch` is the global one unless a test
 *        supplies its own.
 * @returns {Promise<{ ok: boolean, codes: string[] }>} `codes` are Cloudflare's `error-codes`, or this module's own
 *          reason when Cloudflare gave none or was never asked.
 * @public
 */
declare function verifyTurnstileToken(token: string, options: {
    secret: string;
    fetch?: Function;
    timeoutMs?: number;
}): Promise<{
    ok: boolean;
    codes: string[];
}>;
