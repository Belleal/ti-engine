# Design — A picture of the screen with Send Feedback, personal information blanked

| | |
| --- | --- |
| **Date** | 2026-10-21 |
| **Packages** | `packages/web-framework` |
| **Status** | Decided by Boris on 2026-10-21 (§3); the rules in §4 follow from the decision and the measurements in §5. |
| **Version target** | web-framework `1.58.0` |
| **Author** | Boris Kostadinov (with Claude) |
| **Tracking** | YouTrack [`CA-544`](https://belleal.youtrack.cloud/issue/CA-544), under [`CA-11`](https://belleal.youtrack.cloud/issue/CA-11) |

---

## 1. Why

A manager asked, through Feedback itself, to attach a screenshot to a report: a problem is easier to describe with the
screen in front of the reader. An upload button would let anyone attach any file, of any size, with anything in it.

## 2. What exists

- **Send Feedback** (1.56.0, CA-528) posts `{ kind, text, anonymous, screen, browser }` as JSON to
  `/app/send-feedback`. A problem names the screen the person left, which `tiScreenTrail` keeps.
- **Items are values** under `ti:feedback:item:<uuid>`. That lets erasure delete them, which D1 cannot do to a
  document. The inbox reads them all with `matchKeys`, eight at a time.
- **The JSON body parser** takes at most 1 MB for every request.
- **The CSP** has `style-src-elem 'self' https: 'nonce-…'`, with no `'unsafe-inline'`, and `img-src 'self' data:
  https:`. A `<style>` a script inserts without the nonce is refused.
- **Text an application shows from data** comes through Alpine bindings, `x-text` and `x-html`. Text from the label
  catalogue comes through the framework's `x-text-label`, whose expression is a key and never data.

## 3. Decided (Boris, 2026-10-21)

1. The application takes the picture itself. There is **no upload button**.
2. It is limited in size and type.
3. **Personal information is redacted**, and the form says so in small print.
4. The defaults recommended with it stand. The option is off until the person ticks it. They see the picture before
   sending. It is stored apart from the item and seen by administrators only. It goes when the item goes.

## 4. The rules

### 4.1 When it is taken

- **When Send Feedback is opened, of the screen being left.** The way there is held, the picture is taken, and then it
  goes on.
  - **A link** (the user menu, an application's own `hx-get="/app/send-feedback"`) is held through htmx's
    `htmx:confirm`, and then its request is issued.
  - **`tiApplication.openScreen( "send-feedback" )`** takes the picture first, before it changes anything. It names the
    new screen and pushes its URL before its request starts. Held at `htmx:confirm`, the hold saw "already on Send
    Feedback" and took nothing (the review pass). The sidebar's entries and What's new's links go this way.
  - **Bounded at 4 seconds.** Past that, or on any failure, the form opens with no picture.
  - **The shell shows busy** while the screen is drawn, since nothing else on it changes.
  - **A second way to Send Feedback while held is the same one**, and is dropped: a double click would send the form
    twice.
  - **A navigation begun meanwhile wins:** a GET into `#ti-content`, Back or Forward (`popstate`), or htmx's history
    restore. Going on would replace the screen the person asked for since with Send Feedback, and a picture of a
    screen already left. The picture is dropped. A POST into the screen, an autosave, is no navigation and cancels
    nothing.
  - **Whatever happens while the hold is set up, it is let go**, so a throw cannot leave it, and the busy state, on.
- **Not taken when there is no screen to take**: a reload of `/app/send-feedback`, or a click on Send Feedback from
  Send Feedback itself.
- **On a narrow screen the drawer closes first, and is left out.** There the sidebar is a drawer laid over the screen,
  which the person opened to reach Send Feedback. It used to close only on `htmx:beforeRequest`, after the hold, and it
  was still sliding shut as the copy was made (measured at 390 px).
- **It stays in the browser** (`tiScreenTrail.picture`) until the person ticks the option and sends. Sending, another
  piece of feedback, and the next picture all drop it.

### 4.2 What is blanked

The picture is drawn from a copy of the page (§5). **Every rule applies to the copy only; the screen is never touched.**

- **Text is blanked unless it is known not to be data (fail closed).** A text is kept only inside an element carrying
  `x-text-label` (a catalogue label) or `data-ti-keep`. Everything else is blanked, unless an ancestor carries
  `data-ti-redact`, which blanks even what the two would keep. That covers:
  - what `x-text`, `x-html` and any directive an application writes put on screen;
  - text a server put into a fragment.

  The alternative, blanking only what `x-text` and `x-html` bind, was rejected. It keeps whatever an application's own
  directive writes, and a single such directive would leak.
- **A blanked text keeps its length.** Each character other than a space becomes `x`, drawn as a grey bar. The layout
  stays readable, and nothing of the text remains, whatever the stylesheet does. This is the length-keeping convention
  of the session-replay tools.
- **Form fields lose their values.** A text-like `input` becomes bullets of its value's length. A `textarea` keeps its
  line breaks and spaces, and every other character becomes a bullet. Checkboxes and radio buttons keep their state;
  a `select` shows its option's text, blanked by the text rule.
- **Images are blanked unless kept:**
  - `img` becomes a grey box of its size;
  - `canvas`, `video`, `iframe`, `object` and `embed` likewise.

  The framework's icons are CSS masks and stay.
- **Chart text is blanked by the text rule** (SVG `text`), and its shapes stay. Without the names, a shape says
  nothing of whom it measures.
- **What reaches the drawing after the copy is blanked too** (`onCreateForeignObjectSvg`, measured):
  - A pseudo-element's `content` is written into the drawing's stylesheet. One with a letter or digit becomes x's, and
    anything computed (`attr()`, a counter) becomes "xxx". A mark such as "›" stays.
  - The text of an SVG symbol a `<use>` draws goes.
- **`data-ti-redact` draws its element grey**, a photo set as a CSS background included, and leaves no background
  image inside it, a pseudo-element's included (a rule appended to the drawing). Only the marked element is grey:
  grey on each descendant too layered with the markup's depth.
- **The `content` rewrite is a scanner, not a pattern**: it finds the property only where a declaration starts, never
  inside `justify-content`, and reads a value whole, so a `;` inside a string cuts nothing.
- **The user menu is left out entirely** (`.ti-sidebar-flyout`). It is the menu used to reach Send Feedback, not part
  of the screen being reported.
- **So is what is not displayed**: templates, and anything whose computed `display` is `none`. It is never drawn, and
  copying it cost half the time (§5). The test is not `offsetParent === null`, which `display: contents` also gives,
  and whose children are drawn.
- **Attributes XML cannot read are dropped from the copy**: any name with a prefix other than `xmlns`, `xlink` or
  `xml`, such as Alpine's `x-bind:class`. One is enough for the browser to refuse the drawing (§5).

### 4.3 Its size and type

- **One image, WebP.** Where the browser cannot write WebP (`toBlob` answers another type, as Safari does), it is JPEG.
- **At most 1600 px on its longest side.** The scale is the screen's pixel ratio, lowered until the longer side fits.
- **At most 1,000,000 bytes.** If it is larger, the quality steps down (0.82, 0.7, 0.55), then the size, by a quarter,
  up to three times. A screen of the framework's shell measured 30 to 200 KB (§5).
- **The server checks it all again** (`Feedback#readPicture`):
  - a `data:` URL of `image/webp` or `image/jpeg` with strict base64;
  - the file's own signature for that type;
  - its dimensions read from the file, 1 to 1600 px a side;
  - at most 1,000,000 bytes decoded.

  Anything else is 422 `error.feedback.picture`, and nothing is stored.
- **`POST /app/send-feedback` alone takes a body of up to 1.5 MB**, enough for the picture in base64. Every other
  request keeps the 1 MB limit.
  - **Read only from someone signed in.** The body is read after the session, CSRF and sign-in checks. Read before
    them, anyone could have made the server parse 1.5 MB (the review pass). The cost, kept: on this one route the CSRF
    token must come in the `x-xsrf-token` header, as the shell sends it, since the check finds no body yet.

### 4.4 Where it is kept, and who sees it

- **Under its own key**, `ti:feedback:picture:<feedback ID>`, a value as the items are: 1,333,336 characters of base64
  at most, under D1's 2,000,000-byte row.
- **The item records only that it has one**: `picture: { type, bytes, width, height }`, or null. So the inbox, the
  e-mail and an export never carry the image by accident.
- **The item is written first, then the picture.** A picture is found, shown and erased only through its item.
  Written first, a failure or a restart between the two writes would have kept it for good, beyond any erasure (the
  review pass). The other way round, the worst left is an item naming a picture that is not there, which reads as no
  longer available. A picture that cannot be written takes its item back, and the person is told; it is deleted
  too, in case the failed write landed all the same. Both writes run under the item's key, which erasure takes, so
  an erasure between them cannot leave the picture behind.
- **Administrators only.** `GET /app/feedback-picture?feedbackID=<id>` answers `{ feedbackID, type, width, height,
  data }` to the `admin` role, like the inbox. The Feedback screen loads a picture only when asked to show it.
- **It goes with its item**: `eraseSentBy` deletes both, under the item's key. An anonymous item cannot be found by
  erasure, and its picture stays with it.

### 4.5 The form

- **The option appears only when there is a picture:** "Attach a picture of the screen you were on". It is not ticked.
- **The small print sits under the option and is always shown with it:** "Names, numbers and anything typed are
  blanked out before the picture is taken, and it shows only what was on the screen. Look at it before you send."
- **Ticking the option shows the picture**, at the width of the form.

## 5. Measured (Chromium, the framework's CSP verbatim)

| Library | Result |
| --- | --- |
| `modern-screenshot` 4.7.0, defaults | **Fails.** Embedding fonts inserts an inline `<style>`; the CSP refuses it (`style-src-elem`), its `sheet` is null, and it throws. |
| `modern-screenshot` 4.7.0, `font: false` | **Works, no violation.** 139 ms for a 1000×600 page, 6.6 KB as WebP. `onCloneNode` hands over the copy to blank in. `features.restoreScrollPosition` keeps an inner scroller where it was. |
| `html-to-image` 1.11.13 | Works, no violation, 101 ms. **No hook on its copy**, so it could only blank by changing the live screen. Loses inner scroll. |

- **`font: false` costs an application its web font in the picture.** The framework's own typeface is the system's,
  but an application may load one (Competence loads Onest), and the picture's text is then drawn in the fallback.
  Most of that text is blanked anyway, and the layout still reads.
- **Three things only a real screen showed** (Competence's evaluation screen, 1,053 elements, Chromium at 1440 px):

  | What | Measured | Now |
  | --- | --- | --- |
  | One `x-bind:class` in the copy | XML parse error, `Namespace prefix x-bind for class on div is not defined`; the image is broken and the picture empty | Prefixed attributes dropped from the copy |
  | Every CSS custom property copied onto every element | 296 declarations an element; an 8.6 MB drawing; 5.3 s | `includeStyleProperties`: the 406 standard properties alone. With undisplayed nodes left out: 1.5 MB, **0.72 s**, the WebP byte-identical |
  | The copied `-webkit-text-fill-color` | paints the bars' `x`s over `color: transparent` | Set to transparent on each bar too |

- **End to end** (Competence on this build, in Chromium):
  - EN at 1440 px: the form opened in 0.94 s, and the picture was 72.7 KB of WebP at 1440×1000.
  - BG at 390 px, through the drawer: 1.25 s, a 7.3 KB picture of 390×844, with no drawer in it.
  - Both stored the picture and showed it to an administrator at its full size.
  - No console error, no CSP violation, and no Issues-panel entry beyond one that predates this.
- **The library is vendored** as `bin/static/scripts/lib/modern-screenshot.min.js`. It is pinned exactly and copied by
  the postinstall, like htmx and Alpine (CA-402), and guarded by `test/bundled-libraries.test.js`.
- **It is loaded only when a picture is taken**, by a script element from `ti-framework.js`. Under `'strict-dynamic'`,
  a script a trusted script inserts runs without its own nonce. So nobody who never opens Send Feedback downloads it.

## 6. Not done

- **No picture of a whole scrolled page.** It is the screen in view, which is what "the screen I was on" means.
- **No crop or brush.** The person can only send it or leave it out. The blanking is the protection, and the preview
  is the check.
- **No CSS background image is blanked unless marked.** The framework sets none from data, and blanking every one
  would take a checkbox's tick with it. An application that shows a photo as a background marks its element
  `data-ti-redact`.
- **No retention timer.** A picture lives as long as its item, which is how long administrators keep feedback.
- **The personal-data export lists the picture's metadata, not the image.** An application that wants the image in
  its export reads `Feedback#fetchPicture`.
