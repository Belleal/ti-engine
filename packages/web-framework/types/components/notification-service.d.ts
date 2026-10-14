export = NotificationService;
import type { TiMailTransport, TiNoticeDefinition, TiNotificationDrainReport, TiNotificationEventDefinition, TiNotificationRecipient, TiNotificationSettings, TiNotificationsDocument, TiRenderedNotice } from "#definitions";
/**
 * The key of the configuration document holding the rules (§3.2 of the design record).
 *
 * @type {string}
 */
declare const CONFIG_KEY: string;
/**
 * Notices sent by e-mail on behalf of an application: what they say, when they go, and that each goes once.
 * <br/>
 * An application registers its **notices** (label keys for the subject and the text, and a link) and the **events** it
 * raises. The `notifications` configuration document holds the **rules** joining the two, so which events send mail is
 * an edit, not a release. {@link NotificationService#emit} applies the rules; {@link NotificationService#notify} queues
 * one notice directly.
 * <br/>
 * A queued notice waits in an outbox in the state store until the dispatcher sends it, after the write that queued it
 * and on every job tick. A ledger entry records it once sent or given up, so the same key is never sent twice: two
 * paths raising one notice, a write and a nightly catch-up, send it once. Delivery is at least once: the ledger entry is
 * written after the provider accepts, so a crash between the two repeats one notice.
 * <br/>
 * Nothing here logs an address or a rendered text. A line names the notice's kind, the recipient's ID and the outcome,
 * and an ID holding `@` is refused for that reason.
 * <br/>
 * The lock is in-process, as the configuration store's is: this assumes one instance serves a store.
 *
 * @class NotificationService
 * @public
 */
declare class NotificationService {
    #private;
    /**
     * @constructor
     * @param {Object} [options] For tests; an application uses {@link NotificationService.instance}.
     * @param {function(): number} [options.now] The clock, in milliseconds.
     * @param {boolean} [options.drainOnNotify] Whether a queued notice starts a dispatcher pass. `true` unless stated.
     */
    constructor(options?: Object);
    /**
     * Applies the deployment's settings: the transport, the sender and the base of every link. The web server calls
     * this once, while it is constructed, from the `notifications` section of its configuration and `publicUrl`.
     * <br/>
     * A transport that cannot work is reported and switched off rather than half-configured: `cloudflare` without a
     * relay URL or a sender would queue notices it can never send.
     *
     * @method
     * @param {TiNotificationSettings} [settings]
     * @returns {NotificationService} this
     * @public
     */
    configure(settings?: TiNotificationSettings): NotificationService;
    /**
     * Replaces the transport with an application's own, such as one for SMTP or Microsoft Graph, which the framework
     * does not depend on. `null` switches sending off. Called after the server has started, it wins over the
     * deployment's `TI_WEB_NOTIFY_TRANSPORT`.
     *
     * @method
     * @param {TiMailTransport|null} transport
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} If the transport has no `send` function.
     * @public
     */
    setTransport(transport: TiMailTransport | null): NotificationService;
    /**
     * Whether notices are sent at all: a transport is configured. With none, {@link NotificationService#emit} and
     * {@link NotificationService#notify} queue nothing, so switching one on later does not release a backlog of
     * notices that went stale while it was off.
     *
     * @property
     * @returns {boolean}
     * @public
     */
    get isEnabled(): boolean;
    /**
     * Registers a notice an application sends. Registered at start-up, like a configuration document.
     *
     * @method
     * @param {string} kind The notice's name, which rules refer to.
     * @param {TiNoticeDefinition} definition
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a missing name or label key, or a link or format that is not a function.
     * @public
     */
    registerNotice(kind: string, definition: TiNoticeDefinition): NotificationService;
    /**
     * Registers an event an application raises, with the attributes a rule may filter it by.
     *
     * @method
     * @param {string} name The event's name, such as `task.created`.
     * @param {TiNotificationEventDefinition} [definition]
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a missing name or an attribute that is not a non-empty string.
     * @public
     */
    registerEvent(name: string, definition?: TiNotificationEventDefinition): NotificationService;
    /**
     * Builds the definition of the `notifications` configuration document, for the application to register through
     * `registerConfigDocument( "notifications", … )` and to seed. The framework owns the schema and the validator; the
     * application supplies the default rules and its own editor metadata (a file path, labels, a group).
     * <br/>
     * The validator refuses a rule naming an event or a notice that is not registered, or filtering on an attribute
     * its event does not declare, and two rules with one ID. It reads the registrations when it runs, so the document
     * may be registered before the events and notices are.
     *
     * @method
     * @param {TiNotificationsDocument} [defaults] `{ enabled: true, rules: [] }` unless stated.
     * @param {Object} [metadata] Merged into the document's editor metadata.
     * @returns {{schema: Object, validators: Array<function>, defaultValue: TiNotificationsDocument, metadata: Object}}
     * @public
     */
    configDocument(defaults?: TiNotificationsDocument, metadata?: Object): {
        schema: Object;
        validators: Array<Function>;
        defaultValue: TiNotificationsDocument;
        metadata: Object;
    };
    /**
     * Raises an event: every enabled rule for it whose filter the event's data passes queues its notice for the
     * recipient. The notice's key is the rule's notice joined to the event's key, so two rules for one notice send it
     * once.
     * <br/>
     * Call it after the write that made the event happen has settled, and never while holding a write lock: it reads the
     * rules and the outbox, and a lock held across that is a lock held across the store.
     *
     * @method
     * @param {string} name A registered event.
     * @param {Object} occurrence
     * @param {string} occurrence.key What makes this occurrence unique, such as a task and its deadline.
     * @param {TiNotificationRecipient} occurrence.recipient
     * @param {Object} [occurrence.data] The event's attributes and the notice's values.
     * @returns {Promise<number>} The number of notices queued; 0 when every one was already queued or sent.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For an unregistered event, a missing key or a malformed recipient.
     * @public
     */
    emit(name: string, occurrence: {
        key: string;
        recipient: TiNotificationRecipient;
        data?: Object;
    }): Promise<number>;
    /**
     * Queues one notice for one person, unless the same key was queued or sent before. Resolves once the notice is in
     * the outbox, not once it is delivered, so a request handler never waits on mail. It never rejects for a delivery
     * failure, only for a malformed call.
     *
     * @method
     * @param {Object} notice
     * @param {string} notice.kind A registered notice.
     * @param {string} notice.key What makes this notice unique for this person.
     * @param {TiNotificationRecipient} notice.recipient
     * @param {Object} [notice.data] The values the notice's texts and link read.
     * @returns {Promise<boolean>} `true` if queued; `false` if already queued or sent, or sending is off.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For an unknown kind, a missing key or a malformed recipient.
     * @public
     */
    notify(notice: {
        kind: string;
        key: string;
        recipient: TiNotificationRecipient;
        data?: Object;
    }): Promise<boolean>;
    /**
     * Sends what the outbox holds, one notice at a time, up to {@link DRAIN_LIMIT} a pass. One pass runs at a time: a
     * call made during a pass is answered when a pass that started after it has finished, so whatever was queued before
     * the call has been tried.
     * <br/>
     * A transient failure is retried with backoff, up to {@link MAX_ATTEMPTS} attempts; a permanent one is recorded and
     * not retried. A daily limit stops the pass until the next UTC day, and a rate limit for a minute; neither counts
     * an attempt.
     *
     * @method
     * @returns {Promise<TiNotificationDrainReport>}
     * @public
     */
    drain(): Promise<TiNotificationDrainReport>;
    /**
     * Removes every queued notice and ledger entry of one person, for an application's erasure path. A notice being
     * sent at that moment is finished first, so its ledger entry is removed too rather than written after the erasure.
     *
     * @method
     * @param {string} recipientID
     * @returns {Promise<number>} How many entries were removed.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For a missing ID.
     * @public
     */
    forget(recipientID: string): Promise<number>;
    /**
     * Renders a notice for one person in their language, else the deployment's: the subject, the text with the link
     * after it, and the same text as minimal HTML. The HTML has no remote image, no tracking pixel and no rewritten
     * link: a notice points to the application, it does not report on whoever opens it.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient} recipient
     * @param {Object} [data]
     * @returns {TiRenderedNotice}
     * @throws {Error} With `code` `E_NOTICE_UNKNOWN` or `E_NOTICE_LABEL_MISSING`, and `transient` false.
     * @public
     */
    render(kind: string, recipient: TiNotificationRecipient, data?: Object): TiRenderedNotice;
    /**
     * Whether an event's data passes a rule's filter. Every attribute the filter names must hold one of its values; an
     * empty or absent filter passes everything, and an attribute with an empty list of values passes nothing.
     *
     * @method
     * @param {Object<string, string[]>} [when]
     * @param {Object} [data]
     * @returns {boolean}
     * @public
     */
    static passes(when?: Record<string, string[]>, data?: Object): boolean;
    /**
     * The JSON Schema of the `notifications` document.
     *
     * @method
     * @returns {Object}
     * @public
     */
    static documentSchema(): Object;
}
declare namespace NotificationService {
    export { CONFIG_KEY };
    export var _a: Readonly<NotificationService>;
    export { _a as instance };
}
