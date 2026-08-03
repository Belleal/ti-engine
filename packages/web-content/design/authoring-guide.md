# Authoring Guide — writing a content record

What goes in a record and what every field emits. This is the writer-facing
reference for `@ti-engine/web-content`: `content/schema.js` defines what is
*valid*, and a consuming site's markup contract defines what its theme
*targets* — neither tells you what to type.

Field lists are taken from the renderers. Where a field is described as
producing an element, that element is what the code emits today.

---

## 1. How a record is found

A record is one YAML or front-matter file, and it is served **only** if the
consuming application registers it. Nothing is discovered by scanning a
directory: dropping a file into the content folder does nothing at all until it
is listed. That is deliberate — it is what stops an unfinished manuscript
becoming a live page by accident.

Where the register lives is the application's choice; `readSources()` takes an
explicit list of paths.

---

## 2. The envelope

Everything above `sections` identifies the record.

```yaml
id: home
type: page                  # page | post | book | release
path: /
lang: en
title: Home Page
visibility: public
status: published
seo:
  description: …
```

| Field             | Required            | Notes                                                                                                                                                                 |
|-------------------|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`              | ✅                  | Unique across all records. Referenced by `featured` lists and `translationOf`.                                                                                        |
| `type`            | ✅                  | `page`, `post`, `book`, `release`. Selects the template.                                                                                                              |
| `path`            | ✅                  | Must start with `/`. **Stored, never computed** — deriving it at render time means renaming a title silently moves a live URL.                                        |
| `lang`            | ✅                  | `en` or `bg`. Drives `hreflang`, the language selector, and date/number formatting.                                                                                   |
| `title`           | ✅                  | The record's name: `<title>`, listings, breadcrumbs. *Not* automatically rendered into the body.                                                                      |
| `visibility`      | ✅                  | `public`, `authenticated`, or `role:<name>`. **Its absence is a hard failure, never a silent default.** `role:__none__` means nobody, ever — administrators included. |
| `status`          | ✅                  | `draft` or `published`. A draft appears in no listing, feed, sitemap or archive, and 404s for the public.                                                             |
| `aliases`         |                     | Extra URLs that 301 to `path`. An alias clears the same visibility gate as a direct hit, so it cannot disclose a hidden or unpublished record.                        |
| `translationOf`   |                     | The `id` of the counterpart in the other language. **Must be reciprocal** — both records need it, or `hreflang` is emitted on neither.                                |
| `subtitle`        |                     | Envelope-level; distinct from a section's own `subtitle`.                                                                                                             |
| `publishedAt`     |                     | ISO-8601. Orders `sort: recent` and fills the post meta line.                                                                                                         |
| `updatedAt`       |                     | ISO-8601.                                                                                                                                                             |
| `seo.description` | ✅ *(within `seo`)* | Meta description and Open Graph.                                                                                                                                      |
| `seo.ogImage`     |                     | Social card image.                                                                                                                                                    |
| `seo.noindex`     |                     | Forces `noindex` even on a published public record.                                                                                                                   |

A `page` requires `sections`. A `post` requires `form`.

---

## 3. The body: `sections`

```yaml
sections:
  - type: hero
    …
  - type: prose
    …
```

Sections render **in order**. Each is a map whose `type` selects the renderer.
A field the renderer does not read is ignored; a field left out emits nothing —
which is why a section never renders an empty placeholder.

### Fields every section understands

From the common wrapper, before the type's own body:

| Field         | Values                                    | Effect                                                                                    |
|---------------|-------------------------------------------|-------------------------------------------------------------------------------------------|
| `type`        | see §4                                    | **Required.** Selects the renderer. An unknown type renders nothing rather than throwing. |
| `background`  | `abyss` `deep` `mid` `surface` `elevated` | Adds `bg-*`. ⚠️ **On a `hero` this field means the image instead — see §4.**              |
| `wrap`        | `wrap-page` `wrap-wide` `wrap-prose`      | Overrides the type's default measure.                                                     |
| `tight`       | `true`                                    | Adds `.section-tight`.                                                                    |
| `reveal`      | `true`                                    | Adds `.reveal` for scroll choreography.                                                   |
| `revealDelay` | `1`–`3`                                   | Adds `.reveal-delay-N`.                                                                   |
| `showWhen`    | `announced` `prerelease` `released`       | Adds `on-*`; the theme shows the section only in that release state.                      |
| `screenLabel` | text                                      | Sets `data-screen-label`.                                                                 |

### Chrome — the heading block above a body

| Field         | Produces                                                                                               |
|---------------|--------------------------------------------------------------------------------------------------------|
| `eyebrow`     | `.section-eyebrow`                                                                                     |
| `title`       | `.section-header`                                                                                      |
| `titleAccent` | Wraps that text in `.accent` **where it appears in `title`**. Appended if it is not part of the title. |
| `subtitle`    | `.section-subtitle`                                                                                    |
| `divider`     | `gold` (default) or `scarlet` — a short rule                                                           |

> **`hero` and `audio` draw their own heading.** Both read the same `title` and
> `subtitle` and render them themselves, so the chrome skips those fields for
> those two types — otherwise the title would appear twice. Their `divider` is
> also drawn by the type, in the place that type wants it.

---

## 4. Section types

### `hero`

The opening block of a page. Default measure `wrap-page`.

```yaml
- type: hero
  primary: true
  background: /media/study.webp
  backgroundAlt: A candlelit study
  title: Welcome to my Page
  titleAccent: Welcome
  divider: scarlet
  scrollHint: Descend ↓
```

| Field           | Produces                                                   | Notes                                                                                                                                                              |
|-----------------|------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `background`    | `.hero-media > img[src]`                                   | ⚠️ **The image**, not a `bg-*` layer. `background: mid` on a hero yields *both* the `bg-mid` class and `<img src="mid">` — a broken image, with no error anywhere. |
| `backgroundAlt` | the image's `alt`                                          | Leave empty only if the image is decorative.                                                                                                                       |
| `primary`       | `<h1>` instead of `<h2>`                                   | **Exactly one section per page** should set it. Two `h1`s is a document with two titles.                                                                           |
| `pretitle`      | `.hero-pretitle`                                           | Above the title. Not the chrome's `eyebrow`.                                                                                                                       |
| `title`         | `.hero-title`                                              |                                                                                                                                                                    |
| `titleAccent`   | `.accent` span inside the title                            | Placed where it appears in `title`; appended if it is not part of it.                                                                                              |
| `subtitle`      | `.hero-subtitle`                                           |                                                                                                                                                                    |
| `tagline`       | `.hero-tagline`                                            |                                                                                                                                                                    |
| `intro`         | `.hero-intro`                                              |                                                                                                                                                                    |
| `divider`       | `<hr class="divider-scarlet\|divider-gold divider-short">` | Drawn **between the content and the foot**.                                                                                                                        |
| `scrollHint`    | `.hero-foot > .scroll-hint`                                | The whole foot. Omit it and no `.hero-foot` is emitted.                                                                                                            |

Emitted structure:

```html
<section class="section section-hero">
  <div class="wrap-page">
    <div class="hero-media"><img src="…" alt="…"></div>
    <div class="hero-content">
      <p class="hero-pretitle">…</p>
      <h1 class="hero-title"><span class="accent">Welcome</span> to my Page</h1>
      <p class="hero-subtitle">…</p>
      <p class="hero-tagline">…</p>
      <p class="hero-intro">…</p>
    </div>
    <hr class="divider-scarlet divider-short">
    <div class="hero-foot"><p class="scroll-hint">Descend ↓</p></div>
  </div>
</section>
```

> **A note for theme authors.** `.hero-media` is emitted as a sibling of
> `.hero-content`, not behind it, so a theme that layers the media absolutely
> must give the content — *and anything else it places inside the hero* — a
> stacking context. An element without one is painted underneath: rendered,
> correct in the inspector, invisible on screen.

### Types not yet documented here

`prose` · `verse` · `characterCards` · `audio` · `languageExample` · `agePanels`
· `timeStrip` · `timeline` · `gallery` · `capture` · `featured` · `postList` ·
`closing` · `dictionary`

A test fails if a section type exists in the schema and is listed neither above
nor here, so this list cannot quietly fall behind the code.

---

## 5. When a record does not appear

A record that fails validation is **excluded from the index and logged**, rather
than crashing the site — so the boot log is the first place to look. The same
applies to an id or path claimed by two records: the conflict is reported and
one of them is dropped.

A `status: draft` record is invisible to the public but reachable by its path
for a viewer holding the preview capability, marked by the draft ribbon. That is
the intended way to review before publishing.
