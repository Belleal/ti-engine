# Design — What's new and Feedback as framework features

| | |
| --- | --- |
| **Date** | 2026-10-19 |
| **Packages** | `packages/web-framework` |
| **Status** | Decided by Boris on 2026-10-19 (§3). Implemented in web-framework 1.56.0. |
| **Version target** | web-framework `1.56.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-528`](https://belleal.youtrack.cloud/issue/CA-528), after [`CA-526`](https://belleal.youtrack.cloud/issue/CA-526) and [`CA-527`](https://belleal.youtrack.cloud/issue/CA-527), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11) |

---

## 1. Why

The appraisal application built two features on 2026-10-19, each inside the application: **What's new**, which tells
each person in plain words what a release changed for them, and **Feedback**, which lets anyone signed in send a
suggestion, a problem or praise to the administrators. Boris, the same day:

> "doesn't it make sense to have them as basis functionalities in the web-framework and have the Competence app only
> implement the specifics for its business case?"

and, once the split below was laid out: "let's do it."

Neither feature knows anything about appraisals. What's new needs a version, roles and a store; Feedback needs a
signed-in session, the administrators' allowlist, the notifications service and a store. The framework has all of
them.

## 2. What exists

**In the application** (competence 3.140.0 and the unmerged 3.141.0), read from its code:

| Piece | Generic? |
| --- | --- |
| The release record (`{ version, previous, since }`) and its rules: an upgrade, a restart, a rollback | Yes |
| The notes file, its schema, and which notes a person is shown | Yes, but the notes are the application's |
| A note's audience: `everyone`, `manager`, `supervisor`, `admin` | Mapped: its roles are numbers (`1`–`3`) |
| The "seen" marker, keyed by employee ID | The key is the application's |
| The feedback item's rules: kind, 4000 characters, anonymous, a problem's context | Yes |
| The administrators' screen, its statuses, the e-mail to the allowlisted administrators | Yes |
| The sender's name, from the employee record | The name is the application's |
| Personal-data export and erasure of both | The application's, over the framework's data |
| Storage in two partitioned collections, writes gated on the Worker's partition spec | Replaced (§7) |

**In the framework** (1.55.0): Profile and About as built-in screens; `application-info` reads the running version;
the notifications service (1.52.0) sends notices to recipients; `auth.admins` is the allowlist; the role gate
(`authorization.isAccessAllowed`) and the fragment registry know who may open which screen; the state store
(`cache.instance`) works on Redis and on D1, where the notification outbox already keeps values.

## 3. Decided (Boris, 2026-10-19)

1. Both features move into `@ti-engine/web-framework`, as Profile and About did: the framework ships the rules, the
   storage, the requests, the screens and the e-mail; the application states its own through options and one hook.
2. The application keeps the notes, where the Dashboard notice sits, who a session's person is, and personal data.
3. Nothing reaches production until both run on the framework and have been tried on staging.

The behaviour CA-526 and CA-527 decided is unchanged: since the deployment's previous release, a Dashboard notice;
administrators get a screen and an e-mail; a problem carries its context; the sender may stay anonymous.

## 4. What the application does

```js
class MyApplication extends TiWebAppManager {
    constructor() {
        super( "my-application" );
        this.enableWhatsNew( {
            notes: require( "./whats-new.json" ).releases,     // newest first
            baseline: "3.138.0",                                // what a deployment with no record ran
            audiences: { manager: [ 2 ], supervisor: [ 3 ] }    // a name → the roles it covers
        } );
        this.enableFeedback( { dateLocales: { en: "en-GB" } } );
    }

    // Optional: who a session is, as this application knows them.
    resolveSubject( session ) {
        return { id: session.user.employeeID, name: "…" };
    }
}
```

- **Opt-in.** An application that enables nothing gets no new screen, request, notice or menu entry.
- **`enableWhatsNew( options )`** validates the notes at once and throws on a malformed one, so a broken file stops
  the start rather than an empty screen later. It registers the `whats-new` fragment.
- **`enableFeedback( options )`** registers `send-feedback` (everyone signed in) and `feedback-inbox` (`roles: [
  "admin" ]`), the `feedback.received` event and the `feedback-received` notice.
- **`resolveSubject( session )`** (virtual) returns `{ id, name }` or `null`: the key a person's marker and feedback
  are kept under and the name an administrator reads. The default is the session user's `userID` and name.

## 5. What's new

- **Notes** are `[ { version, notes: [ { id, kind, audience, screen?, title, text } ] } ]`, newest first. `kind` is
  `new`, `improved` or `fixed`; `title` and `text` map a language to a string, at least one. The schema is in code
  (`WhatsNew.notesSchema( audiences )`); an audience outside `everyone`, `admin` and the application's names is
  refused, so a typo is caught at start-up.
- **Audiences.** `everyone` covers every session and `admin` the allowlist role; any other name covers the roles the
  application maps it to. A role code is never written in a note.
- **The release record**, a value at `ti:whats-new:release`, is read once per process. An upgrade makes the stored
  version the previous one; a restart on the same version changes nothing; a rollback keeps the previous version only
  where it is older still; no record reads as the `baseline` (CA-526 §5, unchanged).
- **The marker**, a value at `ti:whats-new:seen:<16 hex of the subject's SHA-256>` holding `{ version, at }`. The
  digest keeps an address-shaped ID out of the key.
- **Requests**: `GET /app/whats-new` (the notes for the session: those new in the running release, then earlier ones
  by version, each note's link kept only where its screen is registered and its roles admit the session),
  `GET /app/whats-new-status` (`{ version, unseen, first }`), `POST /app/whats-new-seen`.
- **The browser**: the `tiWhatsNew` store holds the status, loaded once the shell is initialized *for someone signed
  in* (the sign-in page initializes too, and asking from there answered 401, measured for CA-526), and only where the
  application enabled the feature (`configuration.features.whatsNew`). `markSeen`, `open` and `dismiss` serve a
  notice; `label` is a sidebar entry's accessible name with the count. The `tiScreenWhatsNew` component drives the
  screen, which marks the release seen once it has shown it. A status answered after that is dropped: a deep link
  to the screen asks for the status and the notes at once, and a late status brought the count back beside notes just
  read (found on review).

## 6. Feedback

- **The item**:

  ```js
  {
      feedbackID, kind: "suggestion" | "problem" | "praise" | "other", text,      // 1–4000 characters
      anonymous, submittedBy, senderName,          // both null when anonymous
      submittedAt, context: { screen, version, language, browser } | null,       // a problem only
      status: "new" | "in-progress" | "done" | "declined", statusChangedAt, statusChangedBy
  }
  ```

  The version and language are the server's; the screen must be a registered one other than the shell's own; the
  browser is cut to 200 characters with control characters made spaces. Anonymous keeps no ID, no name and no log
  line naming the sender.
- **The sender's name is kept with the item** (`senderName`), from `resolveSubject`. The application read it from the
  employee record each time the screen loaded; a framework has no record to read, and the item is the sender's to
  export or erase either way.
- **Requests**: `POST /app/send-feedback`, `GET /app/feedback-inbox` and `POST /app/feedback-status`, both
  administrator-only. A status change holds the item's key (`tools.KeyedLock`) and records who and when.
- **The e-mail**: to each allowlisted administrator whose entry is an address (`auth.admins`, read by the server at
  construction), never the sender, recipient ID `administrator-` and 12 hex digits of the address's SHA-256. The
  application's `notifications` document holds the rule, as for every notice. The texts read the kind, the sender
  (or "Anonymous"), the text and the date, which `dateLocales` writes in the locale the application names for a
  language.
- **The browser**: `tiScreenTrail` keeps the screen a person left for Send Feedback, the one a problem names;
  `tiScreenSendFeedback` and `tiScreenFeedbackInbox` drive the screens.

## 7. Storage: values, not documents

Every record is a **value**, as the notification outbox's are, never a JSON document: on D1 a document cannot be
deleted (`/v1/values/delete` reaches `state_values` alone), and erasure must delete.

- Feedback items are `ti:feedback:item:<feedbackID>`; the inbox lists them with `matchKeys` and reads them, eight at a
  time. **One document holding every item was rejected**: it is one read, but D1 keeps a document in one row, and a
  row is capped near 2 MB, a wall a busy installation would reach with no warning but failing writes.
- **No partition spec is involved.** The application's collections were partitioned documents, so a write had to wait
  until the Worker carried the build's spec, and Send Feedback answered 503 until then. Values need nothing of the
  Worker, so that gate and that refusal go.
- **The cost**: the inbox is `1 + n` reads on D1, where it was one, eight in flight at a time so a long list does not
  open hundreds of requests to the state service at once. How long that takes on Cloudflare has not been measured yet;
  staging is where it is measured, before production. A batch read in the D1 provider is not done (§10).

## 8. Personal data

The framework exports what an application's export and erasure need, keyed by the subject ID `resolveSubject` gave:
`WhatsNew#markerOf( id )` and `WhatsNew#forget( id )`; `Feedback#sentBy( id )` (everything sent under that ID, never
an anonymous item) and `Feedback#eraseSentBy( id )`. `./whats-new` and `./feedback` join the `exports` map.

## 9. Labels and screens

- The screens are `frame-whats-new.html`, `frame-send-feedback.html` and `frame-feedback-inbox.html`, each with its
  English on the element, as Profile and About do. An application translates by carrying the keys in its own catalogue
  (the framework's is never loaded by one); the keys are the ones the application already used
  (`interface.whats-new.*`, `interface.feedback.*`, `interface.send-feedback.*`, `interface.feedback-inbox.*`,
  `error.feedback.*`, `interface.notice.feedback-received.*`), so it needs no new ones.
- **A page title may mark its emphasis** with `*…*` in the label (`What's *new*`), which the screens render as `<em>`.
  The framework's own labels mark none. The application styled its titles that way, and without it would have to fork
  each fragment for one word.
- `sparkle`, `message` and `inbox` join the `.ti-icon` set.
- The default user menu gains "What's new" and "Send feedback" when they are enabled.

## 10. Not done

- **A dashboard notice in the framework's default dashboard**, which is a placeholder every application replaces.
  The store is what a notice binds to.
- **A batch read** (`getValues`) in the D1 provider, which would make the inbox one read again. It needs a state
  service endpoint, so it belongs to a change of its own.
- **A preview of the feedback e-mail with made-up data**: the application's E-mail Notifications screen renders it
  through `notifications.instance.render`, with its own sample.
- Everything CA-527 left out: a reply, a "My feedback" list, screenshots, a limit per sender.
