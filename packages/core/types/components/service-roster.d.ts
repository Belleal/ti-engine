declare const _exports: {
    join: typeof join;
    confirm: typeof confirm;
    leave: typeof leave;
    isLive: typeof isLive;
};
export = _exports;
/**
 * Used to record an instance in its domain's roster as it starts receiving requests, after dropping the records of
 * instances that died since the last one started.
 * <br/>
 * NOTE: `isWatched` is true only when the instance's built-in heartbeat has just been written: a record must never say
 * there is a heartbeat to watch before there is one, or {@link prune} could drop a live instance. The marker is written
 * after the record, so that a caller never finds a kept roster with nobody in it while the first instance is joining.
 *
 * @method
 * @param {string} domain
 * @param {string} instanceID
 * @param {string} startedOn ISO timestamp of the instance's start.
 * @param {boolean} isWatched Whether the instance writes the built-in heartbeat a caller can watch.
 * @returns {Promise}
 * @public
 */
declare function join(domain: string, instanceID: string, startedOn: string, isWatched: boolean): Promise<any>;
/**
 * Used to mark an instance's record as watched by its heartbeat, after a heartbeat write has succeeded.
 * <br/>
 * NOTE: Called on every beat, not once. The record is rewritten whole, so one that {@link prune} dropped while the
 * heartbeat had lapsed comes back within a beat of the heartbeat itself.
 *
 * @method
 * @param {string} domain
 * @param {string} instanceID
 * @param {string} startedOn ISO timestamp of the instance's start.
 * @returns {Promise}
 * @public
 */
declare function confirm(domain: string, instanceID: string, startedOn: string): Promise<any>;
/**
 * Used to remove an instance from its domain's roster on a clean stop.
 * <br/>
 * NOTE: The marker is written first. A roster whose last record is removed would otherwise stop existing, and a
 * domain without a roster is called as if its providers predated rosters - which is exactly the hang this prevents.
 *
 * @method
 * @param {string} domain
 * @param {string} instanceID
 * @returns {Promise}
 * @public
 */
declare function leave(domain: string, instanceID: string): Promise<any>;
/**
 * Used to decide whether a domain has a running instance to answer a call.
 * <br/>
 * NOTE: It has one when its providers keep no roster (they predate 1.21.0, and the catalog is all there is to go on),
 * when any record cannot be watched, or when any watched record's heartbeat has not expired. A kept roster with no
 * record, or with only records whose heartbeat has expired, has none. A cache backend without
 * {@link CacheProvider#hashGetAll} cannot read the roster, and every domain counts as having one, as before 1.21.0.
 *
 * @method
 * @param {string} domain
 * @returns {Promise<boolean>}
 * @public
 */
declare function isLive(domain: string): Promise<boolean>;
