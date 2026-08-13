declare const _exports: {
    ALGORITHM: string;
    CACHE_KEY: string;
    HASH_DEFAULTS: Readonly<{
        N: 16384;
        r: 8;
        p: 1;
        saltBytes: 16;
        keyBytes: 64;
    }>;
    hashPassword: typeof hashPassword;
    verifyPassword: typeof verifyPassword;
    parseRecords: typeof parseRecords;
    reconcile: typeof reconcile;
    findByUsername: typeof findByUsername;
};
export = _exports;
export type LocalUserRecord = {
    userID: string;
    username: string;
    email: string;
    name: string;
    passwordHash: string;
    disabled: boolean;
};
/**
 * Hashes a password for storage in a local-users file. Synchronous because its only caller is the one-shot CLI,
 * where blocking is free — never call it on a request path.
 *
 * @method
 * @param {string} password
 * @returns {string} The encoded hash: `scrypt$N$r$p$salt$hash`, base64 salt and key.
 * @throws {TypeError} If `password` is empty or not a string — `verifyPassword` refuses empty passwords, so
 *         hashing one here would only mint a hash that can never be logged into.
 * @public
 */
declare function hashPassword(password: string): string;
/**
 * Verifies a password against an encoded hash. The cost parameters come from the stored string rather than the
 * current defaults, so raising the defaults never invalidates an existing hash.
 *
 * @method
 * @param {string} password
 * @param {string} encoded
 * @returns {Promise<boolean>} `false` for a malformed encoding or an absent password — never a throw, because a
 *          bad stored value must read as "does not match", not as a server error on the login path.
 * @public
 */
declare function verifyPassword(password: string, encoded: string): Promise<boolean>;
/**
 * Validates raw file content into records, reporting why any entry was excluded. Never throws: a malformed row is
 * data, not a crash, so one bad entry cannot take an instance down.
 *
 * @method
 * @param {*} raw
 * @returns {{records: LocalUserRecord[], problems: string[]}}
 * @public
 */
declare function parseRecords(raw: any): {
    records: LocalUserRecord[];
    problems: string[];
};
/**
 * Writes the records as the complete directory, keyed by username, and reports what changed.
 * <br/>
 * The whole set is written rather than patched because the file is the source of truth: a username absent from
 * `records` must disappear, which is what makes revocation-by-file-edit work. `@ti-engine/core/cache` exposes no
 * delete, so a whole-object write is also the only way to remove a key.
 * <br/>
 * Usernames are attacker-influenceable (Task 5's login path resolves them from request input), so both the write
 * and every read below are guarded against `Object.prototype`'s reserved names rather than trusting plain bracket
 * access:
 * <br/>
 * - `incoming` is built with a null prototype (`Object.create( null )`) so it inherits nothing. On an ordinary
 *   `{}`, `incoming[ "__proto__" ] = record` would not create an own key at all — it would invoke the inherited
 *   `__proto__` setter and silently repoint the object's own prototype to `record`, so the record never shows up
 *   in `Object.keys`/`JSON.stringify` and is never persisted, without error. On a null-prototype object that
 *   setter does not exist anywhere on the (empty) prototype chain, so the assignment falls back to creating a
 *   perfectly ordinary own data property instead — confirmed empirically (see the test file) that this still
 *   `JSON.stringify`s and round-trips normally.
 * - Every classification read below checks ownership with `Object.prototype.hasOwnProperty.call(...)` rather than
 *   relying on truthiness, because `stored` comes back from `readStored()` — ultimately a `JSON.parse` result —
 *   with the ordinary `Object.prototype` chain. An unguarded `stored[ "constructor" ]` would resolve to the
 *   inherited `Object` constructor function (always truthy) rather than "not present", misclassifying a
 *   first-time `constructor`-named user as `updated` instead of `added`, and hiding its removal from `removed`.
 *
 * @method
 * @param {LocalUserRecord[]} records
 * @returns {Promise<{added: string[], updated: string[], removed: string[]}>}
 * @public
 */
declare function reconcile(records: LocalUserRecord[]): Promise<{
    added: string[];
    updated: string[];
    removed: string[];
}>;
/**
 * Looks a user up by exact username.
 * <br/>
 * `username` here is attacker-influenceable — this is the function Task 5's login path calls with the value a
 * client typed into the username field. Checked with `Object.prototype.hasOwnProperty.call(...)` rather than
 * `stored[ username ] || null`, because `stored` carries the ordinary `Object.prototype` chain and an unguarded
 * bracket read would resolve `findByUsername( "constructor" )` to the inherited `Object` constructor function
 * instead of `null`, violating the declared return type for nearly every real query.
 *
 * @method
 * @param {string} username
 * @returns {Promise<LocalUserRecord|null>}
 * @public
 */
declare function findByUsername(username: string): Promise<LocalUserRecord | null>;
