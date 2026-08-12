export = CaptureStore;
export { PERSISTED_FIELDS };
declare const PERSISTED_FIELDS: string[];
declare class CaptureStore {
    #private;
    /**
     * @param {{ cache?: Object, key?: string }} [options]  `cache` defaults to the core RedisJSON singleton; inject
     *        a substitute to exercise the store without a live Redis.
     */
    constructor(options?: {
        cache?: Object;
        key?: string;
    });
    /**
     * Records a capture.
     *
     * @param {Object} submission  The submitted fields, plus a truthy `consent`.
     * @param {{ now?: string }} [context]  `now` overrides the timestamp, for deterministic tests only.
     * @returns {Promise<{ status: string, record?: Object, errors?: string[] }>}
     *          status is "success" | "duplicate" | "error".
     */
    submit(submission: Object, context?: {
        now?: string;
    }): Promise<{
        status: string;
        record?: Object;
        errors?: string[];
    }>;
    /**
     * Every stored record, newest first.
     *
     * @returns {Promise<Object[]>}
     */
    list(): Promise<Object[]>;
    /**
     * Deletes one record by its id.
     *
     * @param {string} id
     * @returns {Promise<boolean>}  Whether a record was removed.
     */
    delete(id: string): Promise<boolean>;
    /**
     * Erases every record for an email address, across all purposes.
     *
     * One action rather than one per list: a person asking to be forgotten is asking about themselves, not about
     * whichever lists they happen to remember joining.
     *
     * @param {string} email
     * @returns {Promise<number>}  How many records were removed.
     */
    eraseByEmail(email: string): Promise<number>;
    /**
     * Lower-cases and trims an address, so dedupe and erasure both treat `A@B.com ` and `a@b.com` as one person.
     *
     * @method
     * @static
     * @param {string} email
     * @returns {string}
     */
    static normalizeEmail(email: string): string;
    /**
     * A deliberately loose shape check. Address validity is ultimately proven by delivery, not by a regex, and an
     * over-strict pattern rejects real addresses.
     *
     * @method
     * @static
     * @param {string} email
     * @returns {boolean}
     */
    static isPlausibleEmail(email: string): boolean;
    /**
     * Whether a submitted consent value counts as ticked. An unchecked HTML checkbox sends nothing at all, so only
     * an explicit affirmative passes.
     *
     * @method
     * @static
     * @param {*} value
     * @returns {boolean}
     */
    static isConsentGiven(value: any): boolean;
    /**
     * The deterministic record id for an (email, purpose) pair -- which is also the dedupe rule, expressed once.
     * Hashed so the address never appears in a Redis key or a JSON path.
     *
     * @method
     * @static
     * @param {string} email
     * @param {string} purpose
     * @returns {string}
     */
    static recordId(email: string, purpose: string): string;
}
