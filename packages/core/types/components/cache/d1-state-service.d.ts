declare const _exports: {
    createD1StateService: typeof createD1StateService;
    sweepExpired: typeof sweepExpired;
    normalizePartitions: typeof normalizePartitions;
    relate: typeof relate;
    decomposeValue: typeof decomposeValue;
    decomposePatch: typeof decomposePatch;
    nestAtPath: typeof nestAtPath;
    toSQLitePath: typeof toSQLitePath;
    globToLike: typeof globToLike;
};
export = _exports;
/**
 * Wraps a value in the path's segments, so a nested merge-patch expresses the path without a path expression.
 * <br/>
 * For segments `[ "rec-1" ]` and value `{ email }`, this is `{ "rec-1": { email } }`. RFC 7386 merge-patch is
 * recursive and creates missing objects, so nesting reaches any depth, and SQLite's JSON path grammar — which has no
 * escape for a double quote inside a quoted label — never enters the picture.
 *
 * @method
 * @param {string[]} segments
 * @param {*} value
 * @returns {*}
 * @public
 */
declare function nestAtPath(segments: string[], value: any): any;
/**
 * Builds a SQLite JSON path expression from literal key segments.
 * <br/>
 * Used only where a replace must reach inside a document — a merge-patch cannot replace, since it reads a null the
 * caller meant to store as "delete this key". A label is quoted, and what a quoted label does with a double quote, a
 * backslash or a control character depends on the SQLite version: on 3.45.1 a quote inside one was a bad path, and on
 * 3.51.2 a backslash starts an escape — `a\b` addressed a different key, so a read missed and `json_set` wrote a new key
 * beside the one it was aimed at, with nothing raised. Such a segment is refused, by name, rather than handed to a
 * grammar whose reading of it cannot be relied on; a merge needs no path expression and reaches any key.
 *
 * @method
 * @param {string[]} segments
 * @returns {string}
 * @throws {StateRequestError} 400 if a segment cannot be represented dependably.
 * @public
 */
declare function toSQLitePath(segments: string[]): string;
/**
 * Translates a Redis-style key glob into a SQL LIKE pattern: `*` and `?` become `%` and `_`, and the LIKE wildcards
 * and the escape character are escaped, so a literal `%` in a key pattern matches a literal `%`. Paired with
 * `ESCAPE '\'`.
 *
 * @method
 * @param {string} pattern
 * @returns {string}
 * @public
 */
declare function globToLike(pattern: string): string;
/**
 * Validates a partition spec and returns it as a map from key to entity patterns.
 * <br/>
 * A pattern is an array of segments — `"*"` for any key, or a literal — naming the depth at which one entity of the
 * document sits. Two patterns of one key must not overlap (they must differ in a literal somewhere), so that any path
 * is claimed by at most one of them.
 *
 * @method
 * @param {Object<string, string[][]>} [partitions]
 * @returns {Map<string, string[][]>}
 * @throws {TypeError} If the spec is malformed.
 * @public
 */
declare function normalizePartitions(partitions?: Record<string, string[][]>): Map<string, string[][]>;
/**
 * Relates a path to a partitioned key's entity patterns.
 * <br/>
 * `above` — the path names a subtree over entities (`patterns` lists every pattern beneath it); `at` — one entity;
 * `below` — inside one entity (`inner` is the rest of the path); `outside` — nothing the spec can store.
 *
 * @method
 * @param {string[][]} patterns
 * @param {string[]} segments
 * @returns {{kind: string, patterns?: string[][], pattern?: string[], entity?: string[], inner?: string[]}}
 * @public
 */
declare function relate(patterns: string[][], segments: string[]): {
    kind: string;
    patterns?: string[][];
    pattern?: string[];
    entity?: string[];
    inner?: string[];
};
/**
 * Splits a value written at a path above the entity level into the entity rows it holds.
 * <br/>
 * An empty object leaves no row — the one way a partitioned document differs from a single one (design record §3.4).
 *
 * @method
 * @param {string[][]} patterns
 * @param {string[]} basePath
 * @param {*} value
 * @returns {Array<{segments: string[], value: *}>}
 * @throws {StateRequestError} 400 where the value does not fit the spec.
 * @public
 */
declare function decomposeValue(patterns: string[][], basePath: string[], value: any): Array<{
    segments: string[];
    value: any;
}>;
/**
 * Splits a merge-patch, already nested at its path from the document's root, into per-entity operations.
 * <br/>
 * At an entity, `null` deletes the row and anything else is merged into it. Above one, an object recurses and `null`
 * deletes the subtree; anything else would replace a level the spec says holds entities, and is refused.
 *
 * @method
 * @param {string[][]} patterns
 * @param {Object} patch
 * @returns {Array<{op: string, segments: string[], value?: *}>} `op` is "patch", "delete" or "delete-subtree".
 * @throws {StateRequestError} 400 where the patch does not fit the spec.
 * @public
 */
declare function decomposePatch(patterns: string[][], patch: Object): Array<{
    op: string;
    segments: string[];
    value?: any;
}>;
/**
 * Builds the request handler.
 *
 * @method
 * @param {Object} database A D1 binding, or anything with the same `prepare()` / `batch()` shape.
 * @param {Object} [options]
 * @param {Function} [options.now] Returns epoch milliseconds; injectable so an expiry test can move time.
 * @param {Object<string, string[][]>} [options.partitions] The partition spec: document key → entity patterns.
 * @returns {(request: Request) => Promise<Response>} The handler: a protocol request in, its answer out.
 * @throws {TypeError} If the partition spec is malformed.
 * @public
 */
declare function createD1StateService(database: Object, options?: {
    now?: Function;
    partitions?: Record<string, string[][]>;
}): (request: Request) => Promise<Response>;
/**
 * Removes rows whose deadline has passed. Reads already hide them, so this is housekeeping rather than correctness —
 * but a session table nobody prunes grows without bound, and D1 bills by rows read. Partitioned rows never expire.
 *
 * @method
 * @param {Object} database
 * @param {Function} [now]
 * @returns {Promise<number>} How many rows were removed.
 * @public
 */
declare function sweepExpired(database: Object, now?: Function): Promise<number>;
