export = NotificationService;
import type { TiEditableNoticeText, TiMailTransport, TiNoticeDefinition, TiNoticeLayout, TiNoticeTexts, TiNotificationDrainReport, TiNotificationEventDefinition, TiNotificationRecipient, TiNotificationSettings, TiNotificationsDocument, TiRenderedNotice } from "#definitions";
/**
 * The intervals a job tick may send what the outbox holds at, in hours: the `notifications` document's
 * `sendEveryHours`. Each divides a day, so the passes fall at the same hours of every day, counted from midnight UTC.
 *
 * @type {ReadonlyArray<number>}
 */
declare const SEND_INTERVALS: ReadonlyArray<number>;
/**
 * The interval when the document names none: every hour, so a notice waiting for a retry waits an hour at most where
 * the ticks come that often.
 *
 * @type {number}
 */
declare const DEFAULT_SEND_EVERY_HOURS: number;
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
 * and on a job tick once in each interval the document's `sendEveryHours` sets ({@link NotificationService#sendDue}).
 * A ledger entry records it once sent or given up, so the same key is never sent twice: two
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
     * The deployment's public base URL, without a trailing slash, or `null` when none is set: then a notice goes
     * without a link.
     *
     * @property
     * @returns {string|null}
     * @public
     */
    get publicUrl(): string | null;
    /**
     * The name the transport gives itself, such as `log` or `cloudflare`, or `null` with none or a transport without
     * one. `log` delivers nothing, which a feature that cannot work without mail needs to know.
     *
     * @property
     * @returns {string|null}
     * @public
     */
    get transportName(): string | null;
    /**
     * Registers a notice an application sends. Registered at start-up, like a configuration document.
     *
     * <br/>
     * `placeholders` and `labels` are what an editor needs: the names the subject and the text may use, and the other
     * labels `format` reads, each with the names it may use. Declaring them makes those texts editable through the
     * `notifications` document, and the validator refuses an edit using a name the notice does not offer.
     *
     * @method
     * @param {string} kind The notice's name, which rules refer to.
     * @param {TiNoticeDefinition} definition
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a missing name or label key, a link, format or attachments that is not a function, or placeholders or labels that are not lists of names.
     * @public
     */
    registerNotice(kind: string, definition: TiNoticeDefinition): NotificationService;
    /**
     * Sets how a notice looks as HTML: the application's name as a wordmark at the top, its colours, and the label keys
     * of the button that opens the link and of the footer. `null` returns to the plain layout. The button and the
     * footer are editable like a notice's texts.
     *
     * @method
     * @param {TiNoticeLayout|null} layout
     * @returns {NotificationService} this
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} On a colour that is not `#rgb` or `#rrggbb`, a font that is not a plain family list, or a name or label key that is not a string.
     * @public
     */
    setLayout(layout: TiNoticeLayout | null): NotificationService;
    /**
     * Every text an editor may change: each notice's subject and text, the labels its `format` reads, and the layout's
     * button and footer. A key read in more than one place is listed once, naming every notice that reads it, and
     * held to the strictest of its uses: one line if any use takes one, and only the names every use offers.
     *
     * @method
     * @returns {TiEditableNoticeText[]} In registration order: per notice its subject, its text and its labels; then the layout's.
     * @public
     */
    editableTexts(): TiEditableNoticeText[];
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
     * <br/>
     * The document may also hold **edited texts** (`texts`) and the **application's options** (`options`):
     * - `texts` holds only what an administrator changed, by label key and language; every other text comes from the
     *   shipped labels, so a release that rewords a text reaches a deployment that never edited it. The validator
     *   refuses a key {@link NotificationService#editableTexts} does not list, a language the shipped label lacks, an
     *   empty text, a line break where the part takes one line, and a placeholder the text does not offer.
     * - `options` is the application's, validated by the schema it passes here, and read by
     *   {@link NotificationService#getOptions} over the defaults it gives.
     * - `sendEveryHours` is how often a job tick sends what the outbox holds, one of {@link SEND_INTERVALS}, read by
     *   {@link NotificationService#getSendEveryHours}; every hour when the document names none.
     *
     * @method
     * @param {TiNotificationsDocument} [defaults] `{ enabled: true, rules: [] }` unless stated.
     * @param {Object} [metadata] Merged into the document's editor metadata.
     * @param {Object} [extensions]
     * @param {Object} [extensions.options] The JSON Schema of `options`. Without it the document holds no options.
     * @returns {{schema: Object, validators: Array<function>, defaultValue: TiNotificationsDocument, metadata: Object}}
     * @public
     */
    configDocument(defaults?: TiNotificationsDocument, metadata?: Object, extensions?: {
        options?: Object;
    }): {
        schema: Object;
        validators: Array<Function>;
        defaultValue: TiNotificationsDocument;
        metadata: Object;
    };
    /**
     * The application's options: the stored document's over the defaults given to
     * {@link NotificationService#configDocument}, one key at a time, so an option a release adds has its default on a
     * deployment whose document predates it.
     *
     * @method
     * @returns {Promise<Object>}
     * @public
     */
    getOptions(): Promise<Object>;
    /**
     * How often a job tick sends what the outbox holds, in hours: the stored document's `sendEveryHours`, or
     * {@link DEFAULT_SEND_EVERY_HOURS} when it names none or cannot be read. Read on every tick, so an edit counts from
     * the next one.
     *
     * @method
     * @returns {Promise<number>} One of {@link SEND_INTERVALS}.
     * @public
     */
    getSendEveryHours(): Promise<number>;
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
     * A job tick's pass over the outbox: {@link NotificationService#drain}, once in each interval of
     * `sendEveryHours` hours. A tick inside an interval already passed sends nothing.
     * <br/>
     * The interval bounds how long a waiting notice waits when nothing else wakes the dispatcher: a retry that falls due
     * after the process has slept, such as a container a Worker wakes only for requests and ticks, or what a pass left
     * at its limit. It is not a cap on sending: a notice queued by a write is sent straight after it, and while the
     * process runs the dispatcher's own timer retries on the backoff (1, 5, 15 and 60 minutes). Holding those to the
     * interval would only make mail later.
     * <br/>
     * The check and the record are one step under a lock, so two ticks that overlap pass once. The interval is recorded
     * when its pass has finished. A store that cannot be read is not a reason to hold mail back, so the pass runs; one
     * that cannot be written loses only the record, and the next tick passes again.
     *
     * @method
     * @param {Date} [now] The tick's moment; the current time unless stated.
     * @returns {Promise<TiNotificationDrainReport|null>} The pass's report, or `null` when this interval had its pass.
     * @public
     */
    sendDue(now?: Date): Promise<TiNotificationDrainReport | null>;
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
     * after it, and the same text as HTML in the layout {@link NotificationService#setLayout} set. The HTML has no
     * remote image, no tracking pixel and no rewritten link: a notice points to the application, it does not report
     * on whoever opens it.
     * <br/>
     * Each text is the edited one when `texts` holds it, else the shipped label. The dispatcher passes the document's
     * edits; an editor passes its unsaved ones to preview them exactly as they would be sent.
     * <br/>
     * A notice that declares `attachments` also renders its files, encoded for the message; one that returns none has
     * no `attachments` at all, as before.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient|{language?: string}} recipient Only the language is read.
     * @param {Object} [data]
     * @param {TiNoticeTexts} [texts] Edited texts, by label key and language.
     * @returns {TiRenderedNotice}
     * @throws {Error} With `code` `E_NOTICE_UNKNOWN`, `E_NOTICE_LABEL_MISSING` or `E_NOTICE_ATTACHMENT_INVALID`, and `transient` false.
     * @public
     */
    render(kind: string, recipient: TiNotificationRecipient | {
        language?: string;
    }, data?: Object, texts?: TiNoticeTexts): TiRenderedNotice;
    /**
     * Sends one notice straight away through the transport, past the outbox and the ledger: an editor's "send me a
     * test". Nothing records it, so it can be sent again, and it never stops the real notice of the same key. It
     * renders with `texts` when given, else with the document's edits.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient} recipient
     * @param {Object} [data]
     * @param {TiNoticeTexts} [texts] Edited texts to try before saving them.
     * @returns {Promise<{messageId: string|null}>}
     * @throws {Error} (as a rejection) With `code` `E_NOTICE_TRANSPORT_OFF` while sending is off, `E_NOTICE_UNKNOWN` or `E_NOTICE_LABEL_MISSING`, or the transport's own code.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For a malformed recipient.
     * @public
     */
    sendTest(kind: string, recipient: TiNotificationRecipient, data?: Object, texts?: TiNoticeTexts): Promise<{
        messageId: string | null;
    }>;
    /**
     * Sends one notice straight away through the transport, past the outbox and the ledger, and makes one attempt: a
     * notice that is useless once late, such as a sign-in link that expires in minutes. Nothing records it, nothing
     * retries it, and the caller learns at once whether it went. It renders with the document's edited texts, or with
     * the shipped labels alone when the document cannot be read, since a notice that must go now should not wait on it.
     * <br/>
     * The data is not stored anywhere, so it may carry what the outbox must not hold, such as a secret for the link.
     *
     * @method
     * @param {string} kind A registered notice.
     * @param {TiNotificationRecipient} recipient
     * @param {Object} [data]
     * @returns {Promise<{messageId: string|null}>}
     * @throws {Error} (as a rejection) With `code` `E_NOTICE_TRANSPORT_OFF` while sending is off, `E_NOTICE_UNKNOWN` or `E_NOTICE_LABEL_MISSING`, or the transport's own code.
     * @throws {TiException.E_GEN_INVALID_ARGUMENT_TYPE} (as a rejection) For a malformed recipient.
     * @public
     */
    sendNow(kind: string, recipient: TiNotificationRecipient, data?: Object): Promise<{
        messageId: string | null;
    }>;
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
     * The moment the interval of `hours` hours holding `now` began, in milliseconds: intervals count from midnight on
     * the deployment's clock (core's `time-zone`, CA-550), so with 6 they begin at 00:00, 06:00, 12:00 and 18:00 where
     * the organization is, and with 24 a day's notices go at its midnight. They used to count from midnight UTC, which
     * sent a daily summary at 02:00 or 03:00 in Sofia.
     * <br/>
     * They treat a daylight-saving night as the jobs do. An interval of one hour is every real hour, the repeated one
     * included, as an hourly job's period is (core's `hourStartIn`): counted from the first showing, the second
     * repeated hour had no pass (the review pass). A longer interval begins at its boundary's first showing, as a daily
     * job does, so it is never cut in two. A provider's daily limit is not one of these: it is the provider's day, and
     * stays on UTC.
     *
     * @method
     * @param {number} hours One of {@link SEND_INTERVALS}.
     * @param {Date} now
     * @param {string} [zone] The deployment's unless stated.
     * @returns {number}
     * @public
     */
    static intervalStart(hours: number, now: Date, zone?: string): number;
    /**
     * The JSON Schema of the `notifications` document.
     *
     * @method
     * @param {Object|null} [optionsSchema] The application's schema of `options`; without it the document holds none.
     * @returns {Object}
     * @public
     */
    static documentSchema(optionsSchema?: Object | null): Object;
}
declare namespace NotificationService {
    export { CONFIG_KEY };
    export { SEND_INTERVALS };
    export { DEFAULT_SEND_EVERY_HOURS };
    export var _a: Readonly<NotificationService>;
    export { _a as instance };
}
