declare const _exports: {
    ADMIN_ROLE: string;
    isAdminIdentity: typeof isAdminIdentity;
    applyAdminRole: typeof applyAdminRole;
    hasAnyRole: typeof hasAnyRole;
    isAccessAllowed: typeof isAccessAllowed;
    requireRole: typeof requireRole;
    requireAdmin: (request: Object, response: Object, next: Function) => void;
};
export = _exports;
/**
 * Returns `true` if the user matches any entry in the admin allowlist. An entry may match the user's `userID`,
 * `username`, or `email` (case-insensitive).
 *
 * @param {Object} user A session user (`{ userID, username, email, roles, ... }`).
 * @param {string[]} admins The configured allowlist of admin identifiers.
 * @returns {boolean}
 */
declare function isAdminIdentity(user: Object, admins: string[]): boolean;
/**
 * Adds the `admin` role to the session user (additively, no duplicates) when the user is in the allowlist.
 * Safe to call with an empty/missing allowlist or session — it is then a no-op. Returns the session for chaining.
 *
 * @param {Object} session
 * @param {string[]} [admins]
 * @returns {Object} The (possibly modified) session.
 */
declare function applyAdminRole(session: Object, admins?: string[]): Object;
/**
 * @param {Object} session
 * @param {Array<string|number>} roles
 * @returns {boolean} `true` if the session user holds any of the given roles.
 */
declare function hasAnyRole(session: Object, roles: Array<string | number>): boolean;
/**
 * Pure access decision for a resource (e.g. an HTML fragment) that declares a set of required roles. A resource with
 * no required roles (`null` / `undefined` / empty) is public — any (authenticated) user may access it; otherwise the
 * user must hold at least one of the required roles. Roles are treated opaquely, so this works equally for numeric
 * application role codes and the string `admin` role — there is no implicit hierarchy (an `admin`-gated resource is
 * reachable only by holders of the `admin` role, never by a high numeric role). Backs {@link TiWebAppManager#verifyAccess}.
 *
 * @param {Array<string|number>} [requiredRoles] The roles permitted to access the resource; empty/absent = public.
 * @param {Array<string|number>} [userRoles] The roles held by the current session user.
 * @returns {boolean}
 */
declare function isAccessAllowed(requiredRoles?: Array<string | number>, userRoles?: Array<string | number>): boolean;
/**
 * Express middleware factory that admits a request only if its session user holds at least one of the given roles.
 * Responds `401` when unauthenticated (no session user) and `403` when authenticated but lacking the role.
 *
 * @param {...(string|number)} roles
 * @returns {(request: Object, response: Object, next: Function) => void}
 */
declare function requireRole(...roles: (string | number)[]): (request: Object, response: Object, next: Function) => void;
