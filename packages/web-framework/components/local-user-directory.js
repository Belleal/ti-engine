/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const crypto = require( "node:crypto" );
const tools = require( "@ti-engine/core/tools" );
const cache = require( "@ti-engine/core/cache" );

/**
 * @typedef {Object} LocalUserRecord
 * @property {string} userID
 * @property {string} username
 * @property {string} email
 * @property {string} name
 * @property {string} passwordHash
 * @property {boolean} disabled
 */

const ALGORITHM = "scrypt";

const CACHE_KEY = "ti:web:auth:local-users";

// scrypt at N=16384, r=8 needs 128 * N * r = 16 MiB, comfortably inside node's 32 MiB default `maxmem`.
const HASH_DEFAULTS = Object.freeze( { N: 16384, r: 8, p: 1, saltBytes: 16, keyBytes: 64 } );

// Minimums enforced by decodeHash so a truncated or hand-edited record is rejected at load time — where
// parseRecords can report it — rather than silently authenticating with far less entropy than the encoding
// implies (e.g. a copy-pasted base64 key cut short: Buffer.from() shortens it instead of throwing).
const MIN_SALT_BYTES = 8;
const MIN_KEY_BYTES = 32;

// p multiplies scrypt's CPU cost linearly and sits outside node's `maxmem` guard, so a mistyped value would
// hog a threadpool slot proportionally with no upper bound otherwise. The default is 1; 16 is ample headroom.
const MAX_P = 16;

/**
 * Derives a key with scrypt. Asynchronous on purpose: `scryptSync` blocks the event loop for roughly 100 ms at
 * these parameters, which on a login endpoint is a self-inflicted denial of service.
 *
 * @param {string} password
 * @param {Buffer} salt
 * @param {{N: number, r: number, p: number}} parameters
 * @param {number} keyBytes
 * @returns {Promise<Buffer>}
 */
function deriveKey( password, salt, parameters, keyBytes ) {
    return new Promise( ( resolve, reject ) => {
        crypto.scrypt( password, salt, keyBytes, parameters, ( error, key ) => {
            if ( error ) {
                reject( error );
            } else {
                resolve( key );
            }
        } );
    } );
}

/**
 * Splits an encoded hash into its parameters and material, or returns `null` when it is not a recognized
 * encoding — including a structurally valid one whose cost parameters or material fall outside the minimums
 * this module enforces (a non-power-of-two `N`, an excessive `p`, or salt/key material too short to trust).
 *
 * @param {string} encoded
 * @returns {{parameters: {N: number, r: number, p: number}, salt: Buffer, key: Buffer}|null}
 */
function decodeHash( encoded ) {
    if ( typeof encoded !== "string" ) {
        return null;
    }
    const parts = encoded.split( "$" );
    if ( parts.length !== 6 || parts[ 0 ] !== ALGORITHM ) {
        return null;
    }
    const [ , rawN, rawR, rawP, rawSalt, rawKey ] = parts;
    const N = Number( rawN );
    const r = Number( rawR );
    const p = Number( rawP );
    if ( !Number.isInteger( N ) || !Number.isInteger( r ) || !Number.isInteger( p ) || N < 2 || r < 1 || p < 1 || p > MAX_P ) {
        return null;
    }
    // crypto.scrypt requires N to be a power of two; anything else throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS at
    // derive time. verifyPassword's `.catch(() => false)` swallows that into an ordinary "wrong password", so
    // without this check an operator would see permanent, silent failed logins with nothing reported anywhere.
    if ( ( N & ( N - 1 ) ) !== 0 ) {
        return null;
    }
    try {
        const salt = Buffer.from( rawSalt, "base64" );
        const key = Buffer.from( rawKey, "base64" );
        // Minimum lengths, not just non-empty: the security level of a record must come from policy, not from
        // whatever happened to survive into the stored string. A truncated key still decodes without error
        // (Buffer.from() shortens rather than throwing on invalid/incomplete base64), so length is the only
        // signal left to catch it.
        if ( salt.length < MIN_SALT_BYTES || key.length < MIN_KEY_BYTES ) {
            return null;
        }
        return { parameters: { N: N, r: r, p: p }, salt: salt, key: key };
    } catch {
        return null;
    }
}

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
function hashPassword( password ) {
    if ( typeof password !== "string" || password.length === 0 ) {
        throw new TypeError( "hashPassword requires a non-empty string password" );
    }
    const salt = crypto.randomBytes( HASH_DEFAULTS.saltBytes );
    const parameters = { N: HASH_DEFAULTS.N, r: HASH_DEFAULTS.r, p: HASH_DEFAULTS.p };
    const key = crypto.scryptSync( password, salt, HASH_DEFAULTS.keyBytes, parameters );
    return [ ALGORITHM, parameters.N, parameters.r, parameters.p, salt.toString( "base64" ), key.toString( "base64" ) ].join( "$" );
}

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
function verifyPassword( password, encoded ) {
    const decoded = decodeHash( encoded );
    if ( !decoded || typeof password !== "string" || password.length === 0 ) {
        return Promise.resolve( false );
    }
    return deriveKey( password, decoded.salt, decoded.parameters, decoded.key.length )
        // Compared as base64 strings, not raw Buffers: constantTimeEquals coerces each argument with
        // `String(x || "")`, which would utf8-decode a key Buffer lossily (through U+FFFD replacement for any
        // byte sequence that is not valid UTF-8) instead of comparing its bytes — silently breaking the
        // comparison. Base64 text round-trips through String() exactly, so it stays safe to pass here.
        .then( ( key ) => tools.constantTimeEquals( key.toString( "base64" ), decoded.key.toString( "base64" ) ) )
        .catch( () => false );
}

/**
 * Validates raw file content into records, reporting why any entry was excluded. Never throws: a malformed row is
 * data, not a crash, so one bad entry cannot take an instance down.
 *
 * @method
 * @param {*} raw
 * @returns {{records: LocalUserRecord[], problems: string[]}}
 * @public
 */
function parseRecords( raw ) {
    const problems = [];
    if ( !Array.isArray( raw ) ) {
        return { records: [], problems: [ "the local users file must contain a JSON array of user records" ] };
    }

    const records = [];
    const seen = new Set();
    raw.forEach( ( entry, index ) => {
        if ( !entry || typeof entry !== "object" || Array.isArray( entry ) ) {
            problems.push( `entry ${ index } is not an object` );
            return;
        }
        const username = typeof entry.username === "string" ? entry.username.trim() : "";
        const email = typeof entry.email === "string" ? entry.email.trim() : "";
        const passwordHash = typeof entry.passwordHash === "string" ? entry.passwordHash.trim() : "";

        if ( !username ) {
            problems.push( `entry ${ index } has no username` );
            return;
        }
        if ( !email ) {
            problems.push( `user '${ username }' has no email, which is the field an application resolves identity by` );
            return;
        }
        if ( !passwordHash || !decodeHash( passwordHash ) ) {
            problems.push( `user '${ username }' has no usable passwordHash — generate one with \`npm run hash-password -w @ti-engine/web-framework\`` );
            return;
        }
        // Usernames are matched exactly, so a repeat is a genuine duplicate. Keyed storage would silently keep the
        // last one and leave the operator unable to tell which password is live, so it is reported instead.
        //
        // A duplicate *email* is deliberately not checked here, unlike a duplicate username: two credentials
        // sharing an email still resolve deterministically to the same person, so there is no "which password
        // is live" ambiguity the way there is for a repeated username. This asymmetry is intentional, not an
        // oversight.
        if ( seen.has( username ) ) {
            problems.push( `duplicate username '${ username }' at entry ${ index } — ignored, the first occurrence is kept` );
            return;
        }
        seen.add( username );

        records.push( {
            userID: ( typeof entry.userID === "string" && entry.userID.trim() ) || `local:${ username }`,
            username: username,
            email: email,
            name: ( typeof entry.name === "string" && entry.name.trim() ) || username,
            passwordHash: passwordHash,
            disabled: entry.disabled === true
        } );
    } );

    return { records: records, problems: problems };
}

/**
 * Reads the whole stored directory, or an empty object when it has never been written.
 * <br/>
 * `cache.instance.getJSON` queries the `$` root, and RedisJSON's JSONPath contract wraps that result in a
 * single-element array on a hit — mirrored deliberately by the in-memory test double (see its own doc comment)
 * and already unwrapped once in this package by `ConfigStore#readJSON`. The same unwrap happens here, otherwise
 * every read after the first write would misread a populated directory as empty.
 * <br/>
 * A genuine Redis failure is deliberately left to propagate rather than caught here: swallowing it into `{}`
 * would make an outage indistinguishable from "no users configured", silently failing every local login as
 * "no such user" instead of surfacing the outage to the caller.
 *
 * @returns {Promise<Object>}
 */
function readStored() {
    return cache.instance.getJSON( CACHE_KEY ).then( ( result ) => {
        const stored = Array.isArray( result ) ? ( result[ 0 ] ?? null ) : ( result ?? null );
        return ( stored && typeof stored === "object" && !Array.isArray( stored ) ) ? stored : {};
    } );
}

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
function reconcile( records ) {
    const incoming = {};
    ( Array.isArray( records ) ? records : [] ).forEach( ( record ) => {
        incoming[ record.username ] = record;
    } );

    return readStored().then( ( stored ) => {
        const added = [];
        const updated = [];
        Object.keys( incoming ).forEach( ( username ) => {
            if ( !stored[ username ] ) {
                added.push( username );
            } else if ( JSON.stringify( stored[ username ] ) !== JSON.stringify( incoming[ username ] ) ) {
                updated.push( username );
            }
        } );
        const removed = Object.keys( stored ).filter( ( username ) => !incoming[ username ] );

        return cache.instance.setJSON( CACHE_KEY, incoming ).then( () => {
            return { added: added, updated: updated, removed: removed };
        } );
    } );
}

/**
 * Looks a user up by exact username.
 *
 * @method
 * @param {string} username
 * @returns {Promise<LocalUserRecord|null>}
 * @public
 */
function findByUsername( username ) {
    if ( typeof username !== "string" || username.length === 0 ) {
        return Promise.resolve( null );
    }
    return readStored().then( ( stored ) => stored[ username ] || null );
}

module.exports = { ALGORITHM, CACHE_KEY, HASH_DEFAULTS, hashPassword, verifyPassword, parseRecords, reconcile, findByUsername };
