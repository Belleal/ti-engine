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
 *
 * @method
 * @param {string} username
 * @returns {Promise<LocalUserRecord|null>}
 * @public
 */
declare function findByUsername(username: string): Promise<LocalUserRecord | null>;
