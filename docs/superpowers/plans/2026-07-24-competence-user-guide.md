# Competence End-User Guide + In-App Process Guide & Help — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a comprehensive role-based end-user guide as markdown in the repo, served in-app through generated Help screens plus a hand-authored Process Guide screen, with both sidebar Quick Links enabled.

**Architecture:** Markdown chapters in `packages/competence/docs/user-guide/en/` are the single source of truth. A build script (`bin/build/build-user-guide.js`, using `marked` as a build-time devDependency) converts each chapter into a complete, committed, static HTML screen fragment under `bin/static/fragments/guide/`. The app registers those nine screens plus a hand-authored `process-guide` screen — all public fragments served by the existing web-framework machinery. A test suite guards freshness (regenerate-and-diff), registration wiring, and CSP discipline.

**Tech Stack:** Node.js (CommonJS), `marked` 18.0.7 (devDep, build-time only), HTMX + Alpine.js (CSP build), `node --test`, existing ti-framework CSS primitives.

**Spec:** `docs/superpowers/specs/2026-07-24-competence-user-guide-design.md` · **Tracking:** YouTrack `CA-92`

## Global Constraints

- **CommonJS everywhere** — `require()` / `module.exports`; every new `.js` file starts with the repo's GPL license header (copy verbatim from `packages/competence/bin/build/build-competency-relevancy.js` lines 1–7).
- **Code style** — double quotes, spaces inside parens (`fs.readFileSync( filePath, "utf8" )`), 4-space indent, JSDoc on exported functions. Must pass `npx eslint .` (flat config at repo root).
- **Alpine CSP rules** — no inline `style="…"` attributes, no `?.` in template expressions, no `Array.isArray(...)` inline. Applies to the hand-authored Process Guide fragment AND to generated output.
- **No runtime dependencies added** — `marked` is pinned **exactly** `"18.0.7"` in `devDependencies` of `packages/competence/package.json`. Generated HTML is committed, so the container never needs it. `package-lock.json` is gitignored — commit only `package.json`.
- **Generated files** — every generated fragment starts with the banner `<!-- GENERATED FILE — do not edit. …` (exact text in Task 2). Never hand-edit files under `bin/static/fragments/guide/`.
- **Guide language** — English only in v1. Guide content is plain English text (not label-driven); the surrounding chrome stays label-driven. New sidebar/topbar labels ship en + bg (bg pending native review, per convention).
- **Guide markdown rules** — each chapter starts with one `# H1` title; **no raw HTML** (build error); **no relative `.md` links** (build error) — cross-reference chapters as plain text; callouts are blockquotes starting `> **Note:**` / `> **Warning:**` / `> **Tip:**`.
- **Content accuracy** — every behavioral claim in the guide must be verified against `packages/competence/README.md` or the code before writing. Do not guess. Uncertain claims get checked, not hedged.
- **Commits** — Conventional Commits scoped `(competence)`, every message references `(CA-92)`, one thematic commit per task (do NOT commit per TDD micro-step). End every commit message with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- **Version target** — competence `3.13.3` → `3.14.0` (Task 9 only; earlier tasks do not touch version or CHANGELOG).
- **Never commit `.run/*.run.xml`** (they carry live local credentials in the working tree).
- Run all commands from the repo root `C:\Users\b.kostadinov\WebstormProjects\ti-engine` unless a task says otherwise. Package-scoped npm commands use `-w @ti-engine/competence`.

---

### Task 1: README refresh (close the 3.13.x gaps)

**Files:**
- Modify: `packages/competence/README.md` (Deployment section ~lines 46–83; env-var table ~line 1063)

**Interfaces:**
- Consumes: nothing.
- Produces: an accurate README — the primary source for the guide chapters written in Tasks 3–6.

- [ ] **Step 1: Rewrite the Deployment intro + production notes to defer to INSTALL.md**

In `packages/competence/README.md`, replace this block (currently under `## Deployment (Docker)`):

```markdown
The competence app ships as a container built from the monorepo. It requires a Redis
instance **with the JSON module** (Redis Stack, or Redis 8+).
```

with:

```markdown
The competence app ships as a container built from the monorepo. It requires a Redis
instance **with the JSON module** (Redis Stack, or Redis 8+).

> **Deploying for real?** See **[INSTALL.md](INSTALL.md)** — the system-administrator
> installation & operations guide (image tags, configuration reference, secrets, TLS,
> Kubernetes pointers, backups, upgrades, troubleshooting). The sections below are the
> developer quickstart only.
```

Then replace the whole `### Production notes` section (the five bullets plus the closing paragraph about `.env.example` and image tags):

```markdown
### Production notes

- Put a TLS-terminating reverse proxy / ingress in front (the container runs plain HTTP;
  it trusts `X-Forwarded-*`). Keep `TI_WEB_USE_TLS=false`.
- Set `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` and `TI_WEB_COOKIE_SECRET` to strong, private values.
- Set `COMPETENCE_TEST_USER_ENABLED=false` (default).
- Point `TI_MEMORY_CACHE_*` at your JSON-capable Redis; set `TI_MEMORY_CACHE_AUTH_KEY` if it requires auth.
- See `.env.example` for the full variable list. Images are published to
  `ghcr.io/belleal/ti-engine-competence` (`:latest`, `:X.Y.Z` on `competence-v*` tags, `:edge` on master).
```

with:

```markdown
### Production notes

Production deployment is covered end-to-end in **[INSTALL.md](INSTALL.md)**. The essentials:

- **Azure SSO is the container default** — the image ships `TI_WEB_AUTH_METHODS=openid-azure`, so you must
  configure the Azure OpenID credentials (or explicitly override the auth methods); the placeholder `local`
  credentials auth is off by default and is a development stand-in only.
- The container exposes **`GET /health`** for liveness probes (the Docker `HEALTHCHECK` uses it).
- Put a TLS-terminating reverse proxy / ingress in front (the container runs plain HTTP;
  it trusts `X-Forwarded-*`). Keep `TI_WEB_USE_TLS=false`.
- Set `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY` and `TI_WEB_COOKIE_SECRET` to strong, private values.
- Keep `COMPETENCE_TEST_USER_ENABLED=false` (default).
- See `.env.example` for the full variable list. Images are published to
  `ghcr.io/belleal/ti-engine-competence` (`:latest`, `:X.Y.Z` on `competence-v*` tags, `:edge` on master).
```

- [ ] **Step 2: Align the `COMPETENCE_PRELOAD_DATA` row with the merge-seed semantics**

In the `### Environment Variables` table near the end of the README, replace the row:

```markdown
| `COMPETENCE_PRELOAD_DATA`     | `false` | If `true`, seeds employee and evaluation data from `bin/data/seeders/` into Redis on startup (useful for development and testing)                                                                                                                      |
```

with:

```markdown
| `COMPETENCE_PRELOAD_DATA`     | `false` | If `true`, merges demo employee/evaluation seed data from `bin/data/seeders/` into Redis on startup. Non-destructive — collections are only initialized when empty, so existing data persists; while the flag stays `true` the seed is re-applied on every boot. See INSTALL.md §11 for details. |
```

- [ ] **Step 3: Verify the claims against INSTALL.md**

Run: `grep -n "openid-azure\|/health\|merges seed" packages/competence/INSTALL.md | head`
Expected: hits confirming the Azure default (§1/§7), the `/health` probe (§12), and the merge-seed wording (§7/§11). If any claim mismatches INSTALL.md, fix the README wording to match INSTALL.md (it is the authority for ops behavior).

- [ ] **Step 4: Commit**

```bash
git add packages/competence/README.md
git commit -m "docs(competence): README refresh — link INSTALL.md, Azure-SSO default, /health probe, merge-seed wording (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Guide build pipeline (`build-user-guide.js`) — TDD

**Files:**
- Create: `packages/competence/bin/build/build-user-guide.js`
- Create: `packages/competence/test/user-guide-build.test.js`
- Modify: `packages/competence/package.json` (devDependency + script)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (consumed by Tasks 3–8 and the Task 7 tests):
  - `parseChapterSource( fileName: string, raw: string ) → { order: number, slug: string, fragmentName: string, title: string, bodyMd: string }` — throws on bad file name / missing H1.
  - `convertMarkdown( md: string, fileName: string ) → string` — HTML; throws on raw HTML or relative `.md` links.
  - `buildGuideScreens( sources: Array<{ fileName: string, raw: string }>, packageVersion: string ) → Array<{ fileName: string, fragmentName: string, html: string }>` — sorted by chapter order; output `fileName` is `frame-help-<slug>.html`.
  - Constants `GUIDE_SOURCE_DIR`, `OUTPUT_DIR` (absolute paths).
  - CLI behavior: `npm run build:guide -w @ti-engine/competence` wipes and rewrites `bin/static/fragments/guide/`.
  - Generated-file contract: banner comment, `.ti-doc` content wrapper, chapter nav with `hx-get="/app/help-<slug>"`, `aria-current="page"` on the active chapter, prev/next footer, version stamp `Guide for competence v<version>`.

- [ ] **Step 1: Add the devDependency and npm script**

In `packages/competence/package.json`, add (keeping existing content intact):

```json
    "scripts": {
        "start": "node ../../node_modules/@ti-engine/core/bin/start-instance.js",
        "test": "node --test test/*.test.js",
        "test:json": "node --test test/json-config-validation.test.js",
        "build:guide": "node bin/build/build-user-guide.js"
    },
    "devDependencies": {
        "marked": "18.0.7"
    },
```

Run: `npm install`
Expected: completes without error; `node -e "console.log(require('marked') ? 'marked ok' : 'fail')"` from `packages/competence` prints `marked ok`.

- [ ] **Step 2: Write the failing unit tests**

Create `packages/competence/test/user-guide-build.test.js`. Start with the GPL header (copy lines 1–7 of `packages/competence/bin/build/build-competency-relevancy.js` verbatim), then:

```js
/*
 * Unit + repo-state guards for the User Guide build pipeline (bin/build/build-user-guide.js).
 *
 * Part 1 (this suite): pure-function behavior — chapter parsing, markdown conversion rules (raw HTML and relative
 * .md links are build errors; tables get a scroll wrapper; h2/h3 get stable ids; external links open in a new tab),
 * and screen assembly (banner, chapter nav, prev/next, version stamp).
 *
 * Part 2 (added when the screens are registered): the committed generated output under
 * bin/static/fragments/guide/ must be exactly reproducible from docs/user-guide/en (freshness), every screen must
 * be registered/mapped/titled, and the output must stay CSP-clean.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const {
    parseChapterSource,
    convertMarkdown,
    buildGuideScreens
} = require( "../bin/build/build-user-guide.js" );

describe( "User guide build — chapter parsing", () => {

    it( "derives order, slug, fragment name, title, and body from the file", () => {
        const chapter = parseChapterSource( "03-employee.md", "# For Employees\n\nIntro paragraph." );
        assert.equal( chapter.order, 3 );
        assert.equal( chapter.slug, "employee" );
        assert.equal( chapter.fragmentName, "help-employee" );
        assert.equal( chapter.title, "For Employees" );
        assert.equal( chapter.bodyMd, "Intro paragraph." );
    } );

    it( "rejects a file name that does not match NN-<slug>.md", () => {
        assert.throws( () => parseChapterSource( "employee.md", "# X" ), /must match NN-<slug>\.md/ );
    } );

    it( "rejects a chapter that does not start with an H1 title", () => {
        assert.throws( () => parseChapterSource( "01-overview.md", "No title here." ), /must start with a '# <title>' H1/ );
    } );

} );

describe( "User guide build — markdown conversion", () => {

    it( "renders headings with stable ids and paragraphs", () => {
        const html = convertMarkdown( "## Your First Steps\n\nHello.", "01-overview.md" );
        assert.match( html, /<h2 id="your-first-steps">Your First Steps<\/h2>/ );
        assert.match( html, /<p>Hello\.<\/p>/ );
    } );

    it( "wraps tables in a scroll container", () => {
        const md = "| A | B |\n|---|---|\n| 1 | 2 |";
        const html = convertMarkdown( md, "01-overview.md" );
        assert.match( html, /<div class="ti-doc-table">\s*<table>/ );
        assert.match( html, /<\/table>\s*<\/div>/ );
    } );

    it( "rejects raw HTML in the markdown", () => {
        assert.throws( () => convertMarkdown( "Hello <span>world</span>.", "01-overview.md" ), /Raw HTML is not allowed/ );
    } );

    it( "rejects relative .md links", () => {
        assert.throws( () => convertMarkdown( "See [the manager chapter](05-manager.md).", "01-overview.md" ), /Relative \.md links are not allowed/ );
    } );

    it( "opens external links in a new tab", () => {
        const html = convertMarkdown( "Visit [the repo](https://github.com/Belleal/ti-engine).", "01-overview.md" );
        assert.match( html, /<a href="https:\/\/github\.com\/Belleal\/ti-engine" target="_blank" rel="noopener noreferrer">/ );
    } );

    it( "emits no inline styles, scripts, or event-handler attributes", () => {
        const md = "## Section\n\nText with **bold** and `code`.\n\n> **Note:** a callout.\n\n- one\n- two";
        const html = convertMarkdown( md, "01-overview.md" );
        assert.doesNotMatch( html, /\s(?:style|on[a-z]+)\s*=\s*"/i );
        assert.doesNotMatch( html, /<script/i );
    } );

} );

describe( "User guide build — screen assembly", () => {

    const sources = [
        { fileName: "01-overview.md", raw: "# Overview & Key Concepts\n\nWelcome." },
        { fileName: "02-getting-started.md", raw: "# Getting Started\n\nSign in." },
        { fileName: "03-employee.md", raw: "# For Employees\n\nYour evaluation." }
    ];

    it( "builds one screen per chapter, sorted by order, with the generated banner", () => {
        const screens = buildGuideScreens( sources, "3.14.0" );
        assert.deepEqual( screens.map( ( s ) => s.fileName ), [ "frame-help-overview.html", "frame-help-getting-started.html", "frame-help-employee.html" ] );
        assert.deepEqual( screens.map( ( s ) => s.fragmentName ), [ "help-overview", "help-getting-started", "help-employee" ] );
        for ( const screen of screens ) {
            assert.match( screen.html, /^<!-- GENERATED FILE — do not edit\./ );
        }
    } );

    it( "renders the chapter nav on every screen with the current chapter marked", () => {
        const screens = buildGuideScreens( sources, "3.14.0" );
        const overview = screens[ 0 ].html;
        assert.match( overview, /hx-get="\/app\/help-getting-started"/ );
        assert.match( overview, /hx-get="\/app\/help-employee"/ );
        assert.match( overview, /aria-current="page"[^>]*>Overview &amp; Key Concepts</ );
        assert.equal( ( overview.match( /aria-current="page"/g ) || [] ).length, 1 );
    } );

    it( "renders prev/next footer links and the version stamp", () => {
        const screens = buildGuideScreens( sources, "3.14.0" );
        const middle = screens[ 1 ].html;
        assert.match( middle, /competence-guide-prev/ );
        assert.match( middle, /competence-guide-next/ );
        assert.match( middle, /Guide for competence v3\.14\.0/ );
        assert.doesNotMatch( screens[ 0 ].html, /competence-guide-prev/ );
        assert.doesNotMatch( screens[ 2 ].html, /competence-guide-next/ );
    } );

    it( "rejects duplicate chapter orders or slugs", () => {
        assert.throws( () => buildGuideScreens( [ ...sources, { fileName: "01-intro.md", raw: "# Intro\n\nX." } ], "3.14.0" ), /Duplicate chapter order/ );
    } );

} );
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @ti-engine/competence`
Expected: FAIL — `Cannot find module '../bin/build/build-user-guide.js'`. All other suites stay green.

- [ ] **Step 4: Implement the build script**

Create `packages/competence/bin/build/build-user-guide.js`. Start with the GPL header (copy lines 1–7 of `build-competency-relevancy.js` verbatim), then:

```js
/*
 * Build step: generate the in-app User Guide screens from the markdown source in `docs/user-guide/`.
 *
 * The markdown chapters are the source of truth (docs/user-guide/en/NN-<slug>.md; the numeric prefix fixes the
 * order, the slug fixes the fragment name `help-<slug>`, the first line must be the `# H1` chapter title). This
 * script converts each chapter into a complete, static HTML screen fragment at
 * `bin/static/fragments/guide/frame-help-<slug>.html` — page head, chapter navigation (current chapter marked),
 * the converted content wrapped in `.ti-doc`, prev/next footer links, and a version stamp from package.json.
 * The generated files are committed; the app serves them like any other registered fragment
 * (bin/competence-web-application.js). `test/user-guide-build.test.js` regenerates the guide in-memory and fails
 * when the committed output is stale — after editing any chapter run:  npm run build:guide
 * OVERWRITES everything under bin/static/fragments/guide/.
 *
 * CSP discipline (enforced by tests): no raw HTML in the markdown (build error), no inline styles, no scripts,
 * no event-handler attributes in the output. Relative *.md links are rejected — cross-reference chapters as plain
 * text (the chapter navigation is the navigation); external http(s) links open in a new tab.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const { marked } = require( "marked" );

const PACKAGE_ROOT = path.resolve( __dirname, "..", ".." );
const GUIDE_SOURCE_DIR = path.join( PACKAGE_ROOT, "docs", "user-guide", "en" );
const OUTPUT_DIR = path.join( PACKAGE_ROOT, "bin", "static", "fragments", "guide" );

const CHAPTER_FILE_PATTERN = /^(\d{2})-([a-z0-9-]+)\.md$/;
const GENERATED_BANNER = ( sourceFile ) => `<!-- GENERATED FILE — do not edit. Source: docs/user-guide/en/${ sourceFile }. Regenerate: npm run build:guide -->`;

/**
 * Converts heading/title text to a URL- and id-safe slug.
 *
 * @method
 * @param {string} text
 * @returns {string}
 * @public
 */
function slugify( text ) {
    return String( text ).toLowerCase().replace( /[^a-z0-9]+/g, "-" ).replace( /^-+|-+$/g, "" );
}

/**
 * Escapes a string for safe use in HTML text or attribute content.
 *
 * @method
 * @param {string} text
 * @returns {string}
 * @public
 */
function escapeHtml( text ) {
    return String( text ).replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" ).replace( /"/g, "&quot;" );
}

/**
 * Parses one chapter source file into its metadata and markdown body.
 *
 * @method
 * @param {string} fileName E.g. "03-employee.md" — the NN prefix fixes the order, the slug fixes the fragment name.
 * @param {string} raw The file content; the first non-empty line must be the `# H1` chapter title.
 * @returns {{ order: number, slug: string, fragmentName: string, title: string, bodyMd: string }}
 * @public
 */
function parseChapterSource( fileName, raw ) {
    const match = CHAPTER_FILE_PATTERN.exec( fileName );
    if ( !match ) {
        throw new Error( `Guide chapter file name '${ fileName }' must match NN-<slug>.md (e.g. 03-employee.md)` );
    }
    const lines = String( raw ).replace( /^\uFEFF/, "" ).split( /\r?\n/ );
    let titleLineIndex = -1;
    for ( let i = 0; i < lines.length; i++ ) {
        if ( lines[ i ].trim() !== "" ) {
            titleLineIndex = i;
            break;
        }
    }
    if ( titleLineIndex < 0 || !lines[ titleLineIndex ].startsWith( "# " ) ) {
        throw new Error( `Guide chapter '${ fileName }' must start with a '# <title>' H1 line` );
    }
    return {
        order: Number( match[ 1 ] ),
        slug: match[ 2 ],
        fragmentName: `help-${ match[ 2 ] }`,
        title: lines[ titleLineIndex ].slice( 2 ).trim(),
        bodyMd: lines.slice( titleLineIndex + 1 ).join( "\n" ).trim()
    };
}

/**
 * Converts chapter markdown to HTML under the guide's content rules.
 *
 * @method
 * @param {string} md
 * @param {string} fileName Used in error messages.
 * @returns {string}
 * @public
 */
function convertMarkdown( md, fileName ) {
    let rawHtmlSample = null;
    let html = marked.parse( md, {
        gfm: true,
        async: false,
        walkTokens: ( token ) => {
            if ( token.type === "html" && rawHtmlSample === null ) {
                rawHtmlSample = token.raw.trim().split( "\n" )[ 0 ];
            }
        }
    } );
    if ( rawHtmlSample !== null ) {
        throw new Error( `Raw HTML is not allowed in guide markdown (${ fileName }): '${ rawHtmlSample }' — use plain markdown; callouts are '> **Note:** …' blockquotes` );
    }
    if ( /href="[^"]*\.md(?:#[^"]*)?"/.test( html ) ) {
        throw new Error( `Relative .md links are not allowed in guide markdown (${ fileName }) — cross-reference chapters as plain text; the chapter navigation is the navigation` );
    }
    // Stable ids on h2/h3 (future deep-link anchors), scroll wrapper on tables, new-tab external links:
    html = html.replace( /<h([23])>([\s\S]*?)<\/h\1>/g, ( full, level, inner ) => {
        return `<h${ level } id="${ slugify( inner.replace( /<[^>]+>/g, "" ) ) }">${ inner }</h${ level }>`;
    } );
    html = html.replace( /<table>/g, "<div class=\"ti-doc-table\">\n<table>" ).replace( /<\/table>/g, "</table>\n</div>" );
    html = html.replace( /<a href="(https?:\/\/[^"]+)">/g, "<a href=\"$1\" target=\"_blank\" rel=\"noopener noreferrer\">" );
    return html;
}

/**
 * Assembles the complete screen fragment for one chapter: page head, chapter nav, content, prev/next footer.
 *
 * @method
 * @param {Object} chapter One element of `chapters`.
 * @param {Object[]} chapters All parsed chapters, sorted by order.
 * @param {string} sourceFile The chapter's source file name (for the banner).
 * @param {string} packageVersion Stamped into the footer.
 * @returns {string}
 * @public
 */
function assembleScreen( chapter, chapters, sourceFile, packageVersion ) {
    const index = chapters.indexOf( chapter );
    const navItems = chapters.map( ( entry ) => {
        const isCurrent = entry === chapter;
        return `            <button class="competence-guide-nav-item${ isCurrent ? " active" : "" }" type="button"${ isCurrent ? " aria-current=\"page\"" : "" } hx-get="/app/${ entry.fragmentName }" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">${ escapeHtml( entry.title ) }</button>`;
    } ).join( "\n" );
    const previous = index > 0 ? chapters[ index - 1 ] : null;
    const next = index < chapters.length - 1 ? chapters[ index + 1 ] : null;
    const previousButton = previous
        ? `            <button class="ti-btn ghost competence-guide-prev" type="button" hx-get="/app/${ previous.fragmentName }" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">← ${ escapeHtml( previous.title ) }</button>`
        : "            <span></span>";
    const nextButton = next
        ? `            <button class="ti-btn ghost competence-guide-next" type="button" hx-get="/app/${ next.fragmentName }" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">${ escapeHtml( next.title ) } →</button>`
        : "            <span></span>";
    return `${ GENERATED_BANNER( sourceFile ) }
<div class="ti-page competence-guide-page">
    <div class="ti-page-head">
        <div class="ti-page-eyebrow">User Guide</div>
        <h1 class="ti-page-title">${ escapeHtml( chapter.title ) }</h1>
    </div>
    <div class="competence-guide-layout">
        <nav class="ti-panel competence-guide-nav" aria-label="Guide chapters">
${ navItems }
        </nav>
        <article class="ti-panel competence-guide-content">
            <div class="ti-doc">
${ convertMarkdown( chapter.bodyMd, sourceFile ) }
            </div>
            <footer class="competence-guide-footer">
${ previousButton }
                <span class="competence-guide-version">Guide for competence v${ escapeHtml( packageVersion ) }</span>
${ nextButton }
            </footer>
        </article>
    </div>
</div>
`;
}

/**
 * Builds every guide screen from the chapter sources.
 *
 * @method
 * @param {Array<{ fileName: string, raw: string }>} sources
 * @param {string} packageVersion
 * @returns {Array<{ fileName: string, fragmentName: string, html: string }>} Sorted by chapter order.
 * @public
 */
function buildGuideScreens( sources, packageVersion ) {
    const chapters = sources.map( ( source ) => Object.assign( parseChapterSource( source.fileName, source.raw ), { sourceFile: source.fileName } ) );
    chapters.sort( ( a, b ) => a.order - b.order );
    const seenOrders = new Set();
    const seenSlugs = new Set();
    for ( const chapter of chapters ) {
        if ( seenOrders.has( chapter.order ) ) {
            throw new Error( `Duplicate chapter order ${ chapter.order } (${ chapter.sourceFile })` );
        }
        if ( seenSlugs.has( chapter.slug ) ) {
            throw new Error( `Duplicate chapter slug '${ chapter.slug }' (${ chapter.sourceFile })` );
        }
        seenOrders.add( chapter.order );
        seenSlugs.add( chapter.slug );
    }
    return chapters.map( ( chapter ) => {
        return {
            fileName: `frame-${ chapter.fragmentName }.html`,
            fragmentName: chapter.fragmentName,
            html: assembleScreen( chapter, chapters, chapter.sourceFile, packageVersion )
        };
    } );
}

/**
 * CLI entry: reads docs/user-guide/en, wipes and rewrites bin/static/fragments/guide.
 *
 * @method
 * @private
 */
function main() {
    const packageVersion = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "package.json" ), "utf8" ) ).version;
    const fileNames = fs.readdirSync( GUIDE_SOURCE_DIR ).filter( ( name ) => name.endsWith( ".md" ) );
    if ( fileNames.length === 0 ) {
        throw new Error( `No guide chapters found in ${ GUIDE_SOURCE_DIR }` );
    }
    const sources = fileNames.map( ( fileName ) => {
        return { fileName: fileName, raw: fs.readFileSync( path.join( GUIDE_SOURCE_DIR, fileName ), "utf8" ) };
    } );
    const screens = buildGuideScreens( sources, packageVersion );
    fs.rmSync( OUTPUT_DIR, { recursive: true, force: true } );
    fs.mkdirSync( OUTPUT_DIR, { recursive: true } );
    for ( const screen of screens ) {
        fs.writeFileSync( path.join( OUTPUT_DIR, screen.fileName ), screen.html, "utf8" );
    }
    console.log( `build-user-guide: generated ${ screens.length } screen(s) into ${ path.relative( PACKAGE_ROOT, OUTPUT_DIR ) }` );
}

module.exports = { parseChapterSource, convertMarkdown, assembleScreen, buildGuideScreens, slugify, GUIDE_SOURCE_DIR, OUTPUT_DIR };

if ( require.main === module ) {
    main();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @ti-engine/competence`
Expected: PASS — all `user-guide-build` tests green, all pre-existing suites green. (The `aria-current` assertion expects the nav title HTML-escaped — `Overview &amp; Key Concepts` — which is what `escapeHtml` on nav titles must produce.)

- [ ] **Step 6: Lint**

Run: `npx eslint packages/competence/bin/build/build-user-guide.js packages/competence/test/user-guide-build.test.js`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add packages/competence/package.json packages/competence/bin/build/build-user-guide.js packages/competence/test/user-guide-build.test.js
git commit -m "feat(competence): user-guide build pipeline — markdown-to-fragment generator with CSP/link/raw-HTML guards (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Author chapters 01 (Overview & Key Concepts) + 02 (Getting Started)

**Files:**
- Create: `packages/competence/docs/user-guide/en/01-overview.md`
- Create: `packages/competence/docs/user-guide/en/02-getting-started.md`
- Create (generated): `packages/competence/bin/static/fragments/guide/frame-help-overview.html`, `frame-help-getting-started.html`

**Interfaces:**
- Consumes: the Task 2 pipeline (`npm run build:guide`).
- Produces: chapter H1 titles used in every screen's nav — `Overview & Key Concepts` and `Getting Started` (changing a title later regenerates ALL screens).

**Authoring rules for every content task (3–6):** second person, task-oriented, no code identifiers or file paths, no screenshots, callouts as `> **Note:**` / `> **Warning:**` / `> **Tip:**` blockquotes, no raw HTML, no `.md` links. **Verify every claim against `packages/competence/README.md`** (section names cited per chapter below) — where the brief below and the README disagree, the README wins; if the README and code disagree, read the code and flag it.

- [ ] **Step 1: Write `01-overview.md`** — H1 `# Overview & Key Concepts`. Sections and required facts (verify against README *Overview*, *Core Concepts*, *Performance Appraisal Process*, *Scoring Algorithm*, *Data Visibility by Role*):

  - `## What this application does` — competency-based performance appraisals; collaborative evaluation (self + optional peer feedback + manager review) producing a weighted score against thresholds; runs in cycles.
  - `## Who does what` — a table of the five capacities: Employee (everyone; self-assessment, sees own results), Team Member (per-evaluation peer reviewer, conferred by being picked for an evaluation's team), Manager (manages a unit; starts/reviews evaluations, availability calendar, conducts interviews), Supervisor (process owner; cycles, scheduling, oversight, formal closure), Administrator (configuration; separate allowlist, not an org role). Note: roles are derived automatically at sign-in from the org chart; a person can hold several; Supervisors can additionally be granted.
  - `## Appraisal cycles` — cycles are created in planning, locked to active (only one active at a time), later closed; evaluations can only start while a cycle is active; closing never deletes in-flight evaluations.
  - `## Competencies — what you are graded on` — three categories (Expertise, Insight, Commitment) each with three subcategories (nine total — table with the plain-language descriptions from the README); which competencies apply to you is determined by your role family, specialization (optional — "generalist" when unset), and stage-level; each competency shows a scope description of expected mastery at your level; **your evaluation's competency set is frozen when the evaluation starts** — later configuration changes never alter an in-flight evaluation.
  - `## Grades` — table S = Superior / R = Regular / U = Unsatisfactory / N = Not Utilized with meanings (from README *Evaluation Grades*).
  - `## Scores and what they mean` — after the manager submits, a score is computed per category plus a final score; contributions are weighted (self 20%, team 30%, manager 50%) and **renormalized to the rounds that actually happened** (a skipped round never drags the score down); all-Regular lands around 100. Thresholds table T1 Weak ≤76 / T2 Insufficient ≤89 / T3 Expected ≤105 / T4 Good ≤119 / T5 Outstanding ≤150 with the interpretations.
  - `## The life of an evaluation` — status walk: Open (self + team rounds) → In Review (manager round) → Ready (scores visible, interview) → Closed (final; closure feedback/goals visible); a Supervisor can withdraw a stalled evaluation. Deadlines in one paragraph: the self deadline is enforced (late input rejected), the team deadline gates finalizing peer feedback, the manager deadline is a reminder, never a block.
  - `## Privacy at a glance` — individual peer grades are never shown to anyone but their author (only the team cumulative); the employee sees manager grades, the team cumulative, and the manager's written feedback only from Ready; anonymous team notes go to the manager only; analytics suppress groups smaller than 3.

- [ ] **Step 2: Write `02-getting-started.md`** — H1 `# Getting Started`. Sections (verify against README *Implemented Screens → Dashboard*, the sidebar in `component-sidebar.html`, and INSTALL.md §7 for the sign-in methods):

  - `## Signing in` — you sign in with your organization account (single sign-on; typically Microsoft Entra/Azure — the exact methods depend on your deployment); no separate registration; if sign-in fails, contact your administrator. Your roles are resolved automatically from the organization chart at sign-in.
  - `## The Dashboard` — your landing page: greeting + your current evaluation status and an "Open My Evaluation" shortcut; the cycle card (cycle name, progress bar, key dates); stat cards that adapt to your role (employee: peer-feedback progress, self-grade progress, days to the manager deadline, team coverage; manager/supervisor: team evaluation counts by status); the **Tasks** panel — your personal to-do list (pending peer reviews, overdue rounds, interview notices) where each task navigates to the right screen; the Activity feed of recent evaluation events.
  - `## Finding your way around` — sidebar tour as a table (item → what it is → who sees it): Dashboard / Org Chart / My Evaluation / My Scores (everyone); Availability (managers); Interviews (managers + supervisors); People (managers + supervisors); Cycles, Oversight (supervisors); Cycle analytics, Trends (supervisors); Team analytics (managers + supervisors); Administration (admin-allowlisted); Process Guide + Help (everyone). The screen title appears in the topbar; your name/level sit at the bottom of the sidebar.
  - `## Personalizing` — the theme toggle (light "Daylight" and dark "Black Glass"), collapsing the sidebar.
  - `## Where to go next` — one line per remaining chapter (plain text, no links).

- [ ] **Step 3: Generate and verify**

Run: `npm run build:guide -w @ti-engine/competence`
Expected: `build-user-guide: generated 2 screen(s) into bin\static\fragments\guide`. If it throws (raw HTML / `.md` link / missing H1), fix the markdown, not the generator.

Run: `npm test -w @ti-engine/competence`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/competence/docs/user-guide packages/competence/bin/static/fragments/guide
git commit -m "docs(competence): user guide — Overview & Key Concepts + Getting Started chapters (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Author chapters 03 (For Employees) + 04 (For Team Members)

**Files:**
- Create: `packages/competence/docs/user-guide/en/03-employee.md`, `04-team-member.md`
- Regenerate: `packages/competence/bin/static/fragments/guide/` (now 4 files)

**Interfaces:**
- Consumes: Task 2 pipeline. Produces: H1 titles `For Employees`, `For Team Members`.

- [ ] **Step 1: Write `03-employee.md`** — H1 `# For Employees`. Sections (verify against README *Step 3 — Self-Evaluation*, *Evaluation Status Lifecycle*, *Evaluation Form*, *Scores*, *Step 8*, *Data Visibility by Role*):

  - `## When your evaluation starts` — your manager (or a Supervisor) starts it; you get a dashboard task; status is Open; you cannot start one yourself.
  - `## Completing your self-assessment` — open My Evaluation; the role banner shows you are grading as the Employee; competencies are grouped by category and subcategory; read each competency's scope description (what mastery looks like at your level) before grading S/R/U/N; use N when a competency was not applicable or not demonstrated; add your written comment (your self-evaluation note); **Save Draft** any time; **Submit** requires every competency graded and is final for your round.
  - `## Your deadline` — shown on the form, derived from the cycle; **a late draft save or submit is rejected**, so don't sit on a completed form; if you genuinely cannot complete it, tell your manager — a Supervisor can move the evaluation on without your grades after the deadline (they are then simply excluded from the score, not counted as zeros).
  - `## While others review` — after you submit (and any team round completes) the status becomes In Review for your manager; your inputs are read-only now; grades others give are hidden from you until results are ready.
  - `## Your results` — at Ready: the evaluation form shows a compact final-score panel and a results-ready bar to **My Scores** — final score + threshold, per-category chips, the subcategory radar, the self/team/manager comparison (team is the cumulative only), strengths and development areas, your score history across cycles, and "how it's calculated" notes; your manager's grades and written feedback are visible from Ready.
  - `## The interview and closure` — a Supervisor books the interview into your (or the conducting) manager's calendar — you get a dashboard notice with the date; during the meeting your results, feedback, and next-period goals are discussed; after the meeting the outcome is recorded and a Supervisor formally closes the evaluation; **once Closed**, My Scores additionally shows the interview feedback, your next-period goals, and a Performance Improvement Plan if one was set; you also get a time-boxed "evaluation closed" dashboard notice.
  - `## What you can and cannot see` — a short table: your grades/comment (always yours); manager grades + written feedback (from Ready); team cumulative grade (from Ready); individual teammate grades and anonymous team notes (never).

- [ ] **Step 2: Write `04-team-member.md`** — H1 `# For Team Members`. Sections (verify against README *Step 4 — Team Evaluation*, *Data Visibility by Role*, the team-feedback finalize bullets in *Current Status*, and the eligibility rule in the ti-engine skill/`organization-manager.js` — peers exclude the evaluatee and their whole management chain):

  - `## You've been asked for peer feedback` — the evaluation's manager picks 3–5 peers when starting it; eligibility excludes the person being evaluated and their management chain, so feedback comes from genuine peers; you get a dashboard task while your input is pending.
  - `## Giving your feedback` — open the evaluation (via the task or the Org Chart); the role banner shows Team; **by default grading is collective**: you give one grade per subcategory (nine grades), and it applies to every competency in that subcategory (your organization may instead use per-competency grading); you see **no one else's grades** while grading; you may add a short written note.
  - `## Anonymity — what happens to your input` — your individual grades are **never shown to anyone**, including the employee and the manager; all team grades are averaged into a single cumulative grade per competency (rounded to the nearest grade); your written note is shown to the manager **anonymously** and never to the employee.
  - `## Deadline and finalizing` — you can submit **once**, before the team-feedback deadline (set on the cycle); when everyone submits, the round completes automatically; after the deadline a manager (or Supervisor) may finalize the round so the evaluation can move on — grades already submitted still count; if nobody submitted, the round is simply excluded from scoring (it never drags the score down).
  - `## Why it matters` — the team round carries 30% of the final score when it happens; one paragraph on giving honest, scope-anchored feedback.

- [ ] **Step 3: Generate, test, commit**

Run: `npm run build:guide -w @ti-engine/competence` → `generated 4 screen(s)`. Run: `npm test -w @ti-engine/competence` → PASS.

```bash
git add packages/competence/docs/user-guide packages/competence/bin/static/fragments/guide
git commit -m "docs(competence): user guide — For Employees + For Team Members chapters (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Author chapters 05 (For Managers) + 06 (For Supervisors)

**Files:**
- Create: `packages/competence/docs/user-guide/en/05-manager.md`, `06-supervisor.md`
- Regenerate: `packages/competence/bin/static/fragments/guide/` (now 6 files)

**Interfaces:**
- Consumes: Task 2 pipeline. Produces: H1 titles `For Managers`, `For Supervisors`.

- [ ] **Step 1: Write `05-manager.md`** — H1 `# For Managers`. Sections (verify against README *Step 2*, *Step 6*, *Step 7*, *Step 8*, *Employees List*, *Evaluation Form*, *Manager Availability Calendar*, *Interview Schedule*, *Employee Management*, and the Insights bullet in *Current Status*):

  - `## Your responsibilities in a cycle` — one-paragraph overview: start evaluations for your people, complete manager reviews, keep an availability calendar, conduct interviews and record outcomes, watch your team's progress.
  - `## Starting an evaluation` — from the Org Chart, "Start Evaluation" appears for employees without an active one (you cannot start your own); the New Evaluation screen shows the employee's profile and cycle, and lets you optionally pick 3–5 eligible peers for team feedback (the picker excludes the employee and their management chain); on confirmation the evaluation opens with the employee's competency set **frozen as of that moment**.
  - `## Your own evaluation` — you are also an employee: you complete your own self-assessment like anyone else (see the employee chapter).
  - `## The manager review` — when the evaluation reaches In Review you get a notification/task; you see the self grades, the team cumulative, and the anonymous team notes (only you see those); grade every competency, write your feedback (revealed to the employee once results are ready); Save Draft / Submit; **your deadline is a reminder, not a block** — a late submit is never rejected, but overdue reviews surface to Supervisors, who may complete the review on your behalf (with a recorded reason); submitting computes the scores and moves the evaluation to Ready.
  - `## Finalizing team feedback` — if peers haven't all submitted by the cycle's team-feedback deadline, you (or a Supervisor, read-only facilitator) can finalize the round so the evaluation isn't stuck; submitted grades still count; the action is recorded on the evaluation.
  - `## Your availability calendar` — the weekly grid bounded to the current cycle: hover an empty cell to mark it available (✓) or busy (✕); click a marked cell to remove it; booked cells are read-only and show the employee's name — Supervisors book interviews into your available slots.
  - `## Interviews — conducting and recording the outcome` — the Interviews screen lists evaluations with results ready; the **conducting manager is whoever owns the booked calendar slot** (you may conduct an interview for a colleague's report — you'll get a "team interview scheduled" notice); after the interview date has passed, record the outcome: written feedback, up to five next-period goals (each with an optional target date), and an optional Performance Improvement Plan; a Supervisor then formally closes the evaluation.
  - `## People` — the employee master/detail editor; what you can edit is permission-gated; changing someone's role family or specialization warns with the count of in-flight evaluations (they keep their frozen sets); every change is audited.
  - `## Team analytics` — Insights for your reporting line: coverage, interview timing, self-vs-manager alignment, the competence heatmap, score-by-level, drivers, and grader calibration; every chart has a "how it's calculated" note; **groups smaller than 3 are hidden** for privacy.

- [ ] **Step 2: Write `06-supervisor.md`** — H1 `# For Supervisors`. Sections (verify against README *Step 1*, *Cycle Management*, *Cycle Setup*, *Evaluations Oversight*, *Step 7*, *Step 8*, *Role assignment* under *Core Concepts → Roles*, and the Insights/Trends bullets):

  - `## The process owner` — you run the cycle end-to-end: create and configure it, unblock stalls, schedule interviews, close evaluations, close the cycle; how the role is held: the top manager and heads of sufficiently deep sub-organizations hold it automatically ("structural"); structural Supervisors can grant it to others from People (a granted Supervisor has the powers but cannot manage roles; grants apply at next sign-in; structural roles cannot be revoked).
  - `## Creating and configuring a cycle` — Cycles: create with an ID, name, and dates (starts in planning); Cycle Setup: per family and specialization, pick the Active Competency Sets — the picker only offers each family's own competency pool; the baseline must cover all nine subcategories; a resolved set may not exceed the cap (30 by default); mark a specialization "no extra competencies" when intentional; **exclude** whole families that aren't ready (they're skipped by validation and hidden); clone selections between nodes to speed setup.
  - `## Locking a cycle` — Lock validates everything (subcategory floor coverage, cap, valid references, pool membership, every included family configured) and shows any errors grouped by family; a locked cycle is Active — the only one at a time — and evaluations can start.
  - `## Keeping evaluations moving (Oversight)` — the active cycle's in-progress evaluations with overdue badges; three reason-required, audited actions: **Advance without self** (waive a stalled self round after its deadline — those grades are excluded from scoring, not zeroed), **Complete manager review** (open the form in proxy mode and submit on the manager's behalf), **Withdraw** (any active status; irreversible; releases a booked interview slot; the employee can immediately get a fresh evaluation); overdue counts also appear as dashboard tasks.
  - `## Scheduling interviews` — Interviews: pick a Ready evaluation, book any manager's available slot from the weekly picker (the slot owner becomes the conducting manager and both sides are notified); cancel to release the slot and clear the date.
  - `## Recording outcomes and closing evaluations` — outcome recording (feedback/goals/PIP) is available to the conducting manager, an org-line superior, or you, once the interview date has passed; **closing is yours alone**: enabled once the interview was held and an outcome recorded; the confirmation shows the employee, score, goal count, and PIP flag; closing is irreversible and reveals the closure artifacts to the employee.
  - `## Closing the cycle` — the confirmation warns how many evaluations are not yet closed (by status) but does not block; closing prevents new evaluations, keeps in-flight ones completable, and writes an anonymized statistical snapshot that powers cross-cycle Trends.
  - `## Analytics` — Cycle analytics (the six reports for the whole cycle), Team analytics, and Trends (cross-cycle: overall score trend, gap closure, ladder movement, cohort comparison, plus a per-employee history you can open for people you're authorized to see); small groups (<3) are always suppressed.

- [ ] **Step 3: Generate, test, commit**

Run: `npm run build:guide -w @ti-engine/competence` → `generated 6 screen(s)`. Run: `npm test -w @ti-engine/competence` → PASS.

```bash
git add packages/competence/docs/user-guide packages/competence/bin/static/fragments/guide
git commit -m "docs(competence): user guide — For Managers + For Supervisors chapters (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Author chapters 07 (For Administrators) + 08 (The Appraisal Process) + 09 (FAQ & Glossary)

**Files:**
- Create: `packages/competence/docs/user-guide/en/07-administrator.md`, `08-appraisal-process.md`, `09-faq-glossary.md`
- Regenerate: `packages/competence/bin/static/fragments/guide/` (now 9 files)

**Interfaces:**
- Consumes: Task 2 pipeline. Produces: H1 titles `For Administrators`, `The Appraisal Process`, `FAQ & Glossary`. **Task 8 (Process Guide screen) deep-links `help-employee`, `help-team-member`, `help-manager`, `help-supervisor`, `help-appraisal-process` — those fragment names must exist exactly as generated here.**

- [ ] **Step 1: Write `07-administrator.md`** — H1 `# For Administrators`. Sections (verify against README *Administration* and *Configuration Reference*):

  - `## Who is an administrator` — a separate allowlist configured by the operations team (not an org-chart role); admins see the Administration sidebar section.
  - `## The Configuration screen` — the landing page: a feed of every configuration change (versioned), validated restore of a previous version, and export of the current configuration as a bundle to hand to the development team for committing back to source.
  - `## What you can edit` — one short subsection per screen: Competency Texts (bilingual names/descriptions/scope anchors — built for the Bulgarian review); Archetype Assignment (which relevancy curve each competency uses, with a curve preview); Archetype Curve Editor (the twelve per-level weights, name, description); Role Families (names, descriptions, specializations).
  - `## When changes take effect` — the important nuance, stated plainly: structural data (archetype assignments and weights, role families, active sets) is live for **future** evaluations; texts and names are translation labels — exported, committed, and visible after the next release; **running evaluations never change** — every evaluation carries a frozen snapshot from its start.
  - `## Safety rails` — every save is validated (format + business rules, e.g. references must exist); every change is versioned and restorable; restores are validated too.

- [ ] **Step 2: Write `08-appraisal-process.md`** — H1 `# The Appraisal Process`. The end-to-end narrative (verify against README *Detailed Process Steps* 1–8 and the *Evaluation Status Lifecycle*): an intro paragraph; `## Step N — <name>` for each of the eight steps, each 1–2 paragraphs in neutral voice ("the Supervisor locks the cycle…"), naming the acting role(s), the screen, and the status effect; a `## The status lifecycle` section with the textual diagram (as a fenced code block):

    ```
    NOT STARTED → OPEN → IN REVIEW → READY → CLOSED
                    └────────┴──────────┴──► WITHDRAWN (Supervisor action, any active status)
    ```

    and one line per status meaning; close with `## Where to read more` — one line per role chapter (plain text).

- [ ] **Step 3: Write `09-faq-glossary.md`** — H1 `# FAQ & Glossary`. `## Frequently asked questions` — each question an `###` heading with a 1–3 sentence answer; include at least these (answers verified against README sections in parentheses):

  1. Why can't I see my manager's grades yet? (revealed at Ready — *Data Visibility*)
  2. Can I ever see how a specific teammate graded me? (never — only the cumulative — *Data Visibility*)
  3. Can grades be changed after submitting? (no; Supervisor recovery paths exist for stalled rounds — *Status Lifecycle*)
  4. What happens if I miss my self-evaluation deadline? (late input rejected; Supervisor may waive; excluded from scoring — *Step 3*)
  5. Does a skipped team round hurt the score? (no — renormalized — *Scoring Algorithm*)
  6. What does "Not Utilized" (N) do to the score? (weight 0 for that competency — use when not applicable/demonstrated — *Evaluation Grades*)
  7. Who sees my written self-evaluation comment? (your manager — *Data Visibility*)
  8. Who conducts my interview? (whoever owns the booked calendar slot — usually your manager — *Step 8*)
  9. Why won't the cycle lock? (validation failed — floor coverage / cap / pool / unconfigured included family — *Step 1*, *Cycle Management*)
  10. Why is a chart cell empty in analytics? (groups under 3 are suppressed for privacy — *Current Status [Data]*)
  11. When do I see the interview feedback and my goals? (once the evaluation is Closed, on My Scores — *Step 8*)
  12. Can a closed evaluation be reopened or edited? (no — closing is irreversible — *Step 8*)
  13. What is a Performance Improvement Plan? (an optional formal plan recorded with the interview outcome — *Step 8*)
  14. How do I get administrator access? (operations-managed allowlist — *Administration*)

  `## Glossary` — a two-column table defining, at minimum: Appraisal cycle, Active Competency Set, Baseline, Specialization, Generalist, Competency pool, Stage-level, Relevancy, Grade, Threshold, Snapshot, Collective team evaluation, Cumulative team grade, Conducting manager, Structural Supervisor, Granted Supervisor, Oversight, Waive (self round), Withdraw, Closure, PIP.

- [ ] **Step 4: Generate, test, verify fragment names, commit**

Run: `npm run build:guide -w @ti-engine/competence` → `generated 9 screen(s)`.
Run: `ls packages/competence/bin/static/fragments/guide/`
Expected — exactly these nine files:
```
frame-help-overview.html
frame-help-getting-started.html
frame-help-employee.html
frame-help-team-member.html
frame-help-manager.html
frame-help-supervisor.html
frame-help-administrator.html
frame-help-appraisal-process.html
frame-help-faq-glossary.html
```
Run: `npm test -w @ti-engine/competence` → PASS.

```bash
git add packages/competence/docs/user-guide packages/competence/bin/static/fragments/guide
git commit -m "docs(competence): user guide — Administrators, Appraisal Process, FAQ & Glossary chapters (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire up the Help screens (registration, sidebar, labels, CSS, repo-state tests)

**Files:**
- Modify: `packages/competence/bin/competence-web-application.js` (fragment registrations after the `evaluations-oversight` one, ~line 157; `sidebarNavMapping` at ~line 232)
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html` (Help button, lines ~173–179)
- Modify: `packages/competence/bin/localization/competence-labels.json` (nine `interface.topbar.*` entries)
- Modify: `packages/competence/bin/static/scripts/competence-main.css` (append guide + `.ti-doc` styles)
- Modify: `packages/competence/test/user-guide-build.test.js` (append the repo-state suite)

**Interfaces:**
- Consumes: the nine generated fragments and their exact names from Task 6; `buildGuideScreens`/`GUIDE_SOURCE_DIR`/`OUTPUT_DIR` from Task 2.
- Produces: nine public screens reachable at `/app/help-<slug>`; the sidebar nav key `"help"`; CSS classes `.competence-guide-layout/-nav/-nav-item/-content/-footer/-version/-prev/-next`, `.ti-doc`, `.ti-doc-table` (consumed by Task 8's fragment styling assumptions).

- [ ] **Step 1: Append the repo-state tests (failing first)**

Append to `packages/competence/test/user-guide-build.test.js`:

```js
const fs = require( "node:fs" );
const path = require( "node:path" );
const { GUIDE_SOURCE_DIR, OUTPUT_DIR } = require( "../bin/build/build-user-guide.js" );

const PACKAGE_ROOT = path.resolve( __dirname, ".." );
const WEB_APPLICATION_FILE = path.join( PACKAGE_ROOT, "bin", "competence-web-application.js" );
const LABELS_FILE = path.join( PACKAGE_ROOT, "bin", "localization", "competence-labels.json" );

// Task 8 appends "process-guide" here (hand-authored screen — registered/mapped/titled but not generated):
const GUIDE_FRAGMENT_NAMES = [
    "help-overview", "help-getting-started", "help-employee", "help-team-member", "help-manager",
    "help-supervisor", "help-administrator", "help-appraisal-process", "help-faq-glossary"
];

const normalizeLineEndings = ( text ) => text.replace( /\r\n/g, "\n" );

describe( "User guide — repo state", () => {

    it( "committed screens are exactly reproducible from docs/user-guide (run npm run build:guide after editing)", () => {
        const { buildGuideScreens } = require( "../bin/build/build-user-guide.js" );
        const packageVersion = JSON.parse( fs.readFileSync( path.join( PACKAGE_ROOT, "package.json" ), "utf8" ) ).version;
        const sources = fs.readdirSync( GUIDE_SOURCE_DIR ).filter( ( name ) => name.endsWith( ".md" ) )
            .map( ( fileName ) => ( { fileName: fileName, raw: fs.readFileSync( path.join( GUIDE_SOURCE_DIR, fileName ), "utf8" ) } ) );
        const screens = buildGuideScreens( sources, packageVersion );
        const committed = fs.readdirSync( OUTPUT_DIR ).filter( ( name ) => name.endsWith( ".html" ) );
        assert.deepEqual( committed.sort(), screens.map( ( screen ) => screen.fileName ).sort(), "generated file set differs from committed set" );
        for ( const screen of screens ) {
            const onDisk = normalizeLineEndings( fs.readFileSync( path.join( OUTPUT_DIR, screen.fileName ), "utf8" ) );
            assert.equal( onDisk, normalizeLineEndings( screen.html ), `${ screen.fileName } is stale — run 'npm run build:guide -w @ti-engine/competence' and commit the result` );
        }
    } );

    it( "every guide screen is registered, sidebar-mapped, and topbar-titled", () => {
        const webApplicationSource = fs.readFileSync( WEB_APPLICATION_FILE, "utf8" );
        const labels = JSON.parse( fs.readFileSync( LABELS_FILE, "utf8" ) );
        const missing = [];
        for ( const fragmentName of GUIDE_FRAGMENT_NAMES ) {
            if ( !webApplicationSource.includes( `addFragment( "${ fragmentName }"` ) ) {
                missing.push( `${ fragmentName }: addFragment registration` );
            }
            if ( !webApplicationSource.includes( `"${ fragmentName }": "` ) ) {
                missing.push( `${ fragmentName }: sidebarNavMapping entry` );
            }
            const topbarLabel = labels.interface && labels.interface.topbar && labels.interface.topbar[ fragmentName ];
            if ( !topbarLabel || !topbarLabel.en || !topbarLabel.bg ) {
                missing.push( `${ fragmentName }: interface.topbar label (en + bg)` );
            }
        }
        assert.deepEqual( missing, [], `Guide screens missing wiring:\n  ${ missing.join( "\n  " ) }` );
    } );

    it( "generated output stays CSP-clean (no inline styles, scripts, or event handlers)", () => {
        const offenders = [];
        for ( const fileName of fs.readdirSync( OUTPUT_DIR ).filter( ( name ) => name.endsWith( ".html" ) ) ) {
            const html = fs.readFileSync( path.join( OUTPUT_DIR, fileName ), "utf8" );
            if ( /\s(?:style|on[a-z]+)\s*=\s*"/i.test( html ) || /<script/i.test( html ) ) {
                offenders.push( fileName );
            }
        }
        assert.deepEqual( offenders, [], `Generated guide screens with CSP violations: ${ offenders.join( ", " ) }` );
    } );

} );
```

Note: `describe`, `it`, and `assert` are already imported at the top of this file from Task 2 — do not re-import them; only add the `fs`/`path`/build-module requires shown if not already present.

Run: `npm test -w @ti-engine/competence`
Expected: FAIL — the wiring test reports all nine fragments missing registration/mapping/labels. The freshness and CSP tests PASS (Task 6 committed fresh output).

- [ ] **Step 2: Register the nine screens**

In `packages/competence/bin/competence-web-application.js`, immediately after the `evaluations-oversight` `addFragment` call, add:

```js
        // End-user guide screens — public (any signed-in user). The HTML under bin/static/fragments/guide/ is
        // GENERATED from docs/user-guide by bin/build/build-user-guide.js (npm run build:guide) — edit the markdown,
        // never these files:
        this.addFragment( "help-overview", {
            title: "User Guide — Overview",
            path: "fragments/guide/frame-help-overview.html"
        } );
        this.addFragment( "help-getting-started", {
            title: "User Guide — Getting Started",
            path: "fragments/guide/frame-help-getting-started.html"
        } );
        this.addFragment( "help-employee", {
            title: "User Guide — For Employees",
            path: "fragments/guide/frame-help-employee.html"
        } );
        this.addFragment( "help-team-member", {
            title: "User Guide — For Team Members",
            path: "fragments/guide/frame-help-team-member.html"
        } );
        this.addFragment( "help-manager", {
            title: "User Guide — For Managers",
            path: "fragments/guide/frame-help-manager.html"
        } );
        this.addFragment( "help-supervisor", {
            title: "User Guide — For Supervisors",
            path: "fragments/guide/frame-help-supervisor.html"
        } );
        this.addFragment( "help-administrator", {
            title: "User Guide — For Administrators",
            path: "fragments/guide/frame-help-administrator.html"
        } );
        this.addFragment( "help-appraisal-process", {
            title: "User Guide — The Appraisal Process",
            path: "fragments/guide/frame-help-appraisal-process.html"
        } );
        this.addFragment( "help-faq-glossary", {
            title: "User Guide — FAQ & Glossary",
            path: "fragments/guide/frame-help-faq-glossary.html"
        } );
```

- [ ] **Step 3: Add the sidebar-active mapping**

In the same file's `sidebarNavMapping` object, after `"evaluations-oversight": "evaluations-oversight"`, add (note the added trailing comma on the previous line):

```js
                    "help-overview": "help",
                    "help-getting-started": "help",
                    "help-employee": "help",
                    "help-team-member": "help",
                    "help-manager": "help",
                    "help-supervisor": "help",
                    "help-administrator": "help",
                    "help-appraisal-process": "help",
                    "help-faq-glossary": "help"
```

- [ ] **Step 4: Add the topbar labels**

In `packages/competence/bin/localization/competence-labels.json`, inside the existing `interface.topbar` object (alongside the other screen-title entries), add:

```json
      "help-overview": {
        "en": "User Guide — Overview",
        "bg": "Ръководство — Общ преглед"
      },
      "help-getting-started": {
        "en": "User Guide — Getting Started",
        "bg": "Ръководство — Първи стъпки"
      },
      "help-employee": {
        "en": "User Guide — For Employees",
        "bg": "Ръководство — За служители"
      },
      "help-team-member": {
        "en": "User Guide — For Team Members",
        "bg": "Ръководство — За членове на екип"
      },
      "help-manager": {
        "en": "User Guide — For Managers",
        "bg": "Ръководство — За мениджъри"
      },
      "help-supervisor": {
        "en": "User Guide — For Supervisors",
        "bg": "Ръководство — За супервайзори"
      },
      "help-administrator": {
        "en": "User Guide — For Administrators",
        "bg": "Ръководство — За администратори"
      },
      "help-appraisal-process": {
        "en": "User Guide — The Appraisal Process",
        "bg": "Ръководство — Процесът на оценяване"
      },
      "help-faq-glossary": {
        "en": "User Guide — FAQ & Glossary",
        "bg": "Ръководство — Въпроси и речник"
      }
```

(BG pending native review, matching the established convention.)

- [ ] **Step 5: Enable the sidebar Help button**

In `packages/competence/bin/static/fragments/components/component-sidebar.html`, replace the disabled Help button:

```html
        <button class="ti-sidebar-item" type="button" x-text-label:data-tip="interface.navigation.help" x-text-label:aria-label="interface.navigation.help"
                disabled>
            <span class="ti-sidebar-item-icon">
                <span class="ti-icon help-circle md" aria-hidden="true"></span>
            </span>
            <span class="ti-sidebar-item-label" x-text-label="interface.navigation.help">Help</span>
        </button>
```

with:

```html
        <button hx-get="/app/help-overview" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'help'"
                x-bind:class="{ active: active === 'help' }" class="ti-sidebar-item" type="button"
                x-text-label:data-tip="interface.navigation.help" x-text-label:aria-label="interface.navigation.help">
            <span class="ti-sidebar-item-icon">
                <span class="ti-icon help-circle md" aria-hidden="true"></span>
            </span>
            <span class="ti-sidebar-item-label" x-text-label="interface.navigation.help">Help</span>
        </button>
```

(The Process Guide button stays disabled until Task 8.)

- [ ] **Step 6: Append the guide styles**

Append to `packages/competence/bin/static/scripts/competence-main.css`:

```css
/* ---------- User Guide (generated Help screens) + shared doc typography ---------- */

.competence-guide-layout {
    display: grid;
    grid-template-columns: 240px minmax( 0, 1fr );
    gap: var(--s-4);
    align-items: start;
}

@media (max-width: 900px) {
    .competence-guide-layout {
        grid-template-columns: 1fr;
    }
}

.competence-guide-nav {
    position: sticky;
    top: var(--s-4);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--s-2);
}

.competence-guide-nav-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--s-2) var(--s-3);
    border: 0;
    background: transparent;
    color: var(--fg-secondary);
    font-size: var(--fs-sm);
    border-radius: var(--r-sm);
    cursor: pointer;
}

.competence-guide-nav-item:hover {
    background: var(--bg-sunken);
    color: var(--fg-primary);
}

.competence-guide-nav-item.active {
    background: var(--accent-soft);
    color: var(--fg-primary);
    font-weight: 600;
}

.competence-guide-content {
    padding: var(--s-5);
}

.competence-guide-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    margin-top: var(--s-5);
    padding-top: var(--s-4);
    border-top: 1px solid var(--border-soft);
}

.competence-guide-version {
    color: var(--fg-tertiary);
    font-size: var(--fs-xs);
    white-space: nowrap;
}

.ti-doc {
    color: var(--fg-secondary);
    line-height: 1.65;
    max-width: 78ch;
}

.ti-doc h2 {
    color: var(--fg-primary);
    font-size: 1.25rem;
    margin: var(--s-5) 0 var(--s-3);
    padding-bottom: var(--s-1);
    border-bottom: 1px solid var(--border-soft);
}

.ti-doc h2:first-child {
    margin-top: 0;
}

.ti-doc h3 {
    color: var(--fg-primary);
    font-size: 1.05rem;
    margin: var(--s-4) 0 var(--s-2);
}

.ti-doc p {
    margin: 0 0 var(--s-3);
}

.ti-doc ul,
.ti-doc ol {
    margin: 0 0 var(--s-3);
    padding-left: 1.4em;
}

.ti-doc li {
    margin-bottom: var(--s-1);
}

.ti-doc li > ul,
.ti-doc li > ol {
    margin-top: var(--s-1);
    margin-bottom: 0;
}

.ti-doc strong {
    color: var(--fg-primary);
}

.ti-doc a {
    color: var(--accent);
    text-decoration: none;
}

.ti-doc a:hover {
    text-decoration: underline;
}

.ti-doc code {
    background: var(--bg-sunken);
    border: 1px solid var(--border-soft);
    border-radius: var(--r-sm);
    padding: 0.1em 0.35em;
    font-size: 0.9em;
}

.ti-doc pre {
    background: var(--bg-sunken);
    border: 1px solid var(--border-soft);
    border-radius: var(--r-md);
    padding: var(--s-3);
    overflow-x: auto;
    margin: 0 0 var(--s-3);
}

.ti-doc pre code {
    background: transparent;
    border: 0;
    padding: 0;
}

.ti-doc blockquote {
    margin: 0 0 var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-left: 3px solid var(--accent);
    background: var(--bg-sunken);
    border-radius: var(--r-sm);
}

.ti-doc blockquote p {
    margin: 0;
}

.ti-doc blockquote p + p {
    margin-top: var(--s-2);
}

.ti-doc hr {
    border: 0;
    border-top: 1px solid var(--border-soft);
    margin: var(--s-4) 0;
}

.ti-doc-table {
    overflow-x: auto;
    margin: 0 0 var(--s-3);
}

.ti-doc-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
}

.ti-doc-table th,
.ti-doc-table td {
    text-align: left;
    padding: var(--s-2) var(--s-3);
    border-bottom: 1px solid var(--border-soft);
    vertical-align: top;
}

.ti-doc-table th {
    color: var(--fg-primary);
    border-bottom-color: var(--border);
}
```

- [ ] **Step 7: Run the tests and lint**

Run: `npm test -w @ti-engine/competence`
Expected: PASS — all suites including the three new repo-state tests.
Run: `npm run test:json -w @ti-engine/competence`
Expected: PASS (labels JSON stays schema-valid).
Run: `npx eslint .`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/competence/bin/competence-web-application.js packages/competence/bin/static/fragments/components/component-sidebar.html packages/competence/bin/localization/competence-labels.json packages/competence/bin/static/scripts/competence-main.css packages/competence/test/user-guide-build.test.js
git commit -m "feat(competence): serve the user guide in-app — nine Help screens registered, sidebar Help enabled, doc styles, repo-state guards (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: The Process Guide screen

**Files:**
- Create: `packages/competence/bin/static/fragments/frame-process-guide.html`
- Modify: `packages/competence/bin/competence-web-application.js` (one registration + one mapping entry)
- Modify: `packages/competence/bin/static/fragments/components/component-sidebar.html` (Process Guide button)
- Modify: `packages/competence/bin/localization/competence-labels.json` (one topbar entry)
- Modify: `packages/competence/bin/static/scripts/competence-main.css` (Process Guide styles)
- Modify: `packages/competence/test/user-guide-build.test.js` (add `process-guide` to the wiring test)

**Interfaces:**
- Consumes: help fragment names from Task 6 (`help-employee`, `help-team-member`, `help-manager`, `help-supervisor`, `help-appraisal-process`); CSS variables and conventions from Task 7.
- Produces: the public `process-guide` screen at `/app/process-guide`.

- [ ] **Step 1: Extend the wiring test (failing first)**

In `packages/competence/test/user-guide-build.test.js`, change:

```js
const GUIDE_FRAGMENT_NAMES = [
    "help-overview", "help-getting-started", "help-employee", "help-team-member", "help-manager",
    "help-supervisor", "help-administrator", "help-appraisal-process", "help-faq-glossary"
];
```

to:

```js
const GUIDE_FRAGMENT_NAMES = [
    "help-overview", "help-getting-started", "help-employee", "help-team-member", "help-manager",
    "help-supervisor", "help-administrator", "help-appraisal-process", "help-faq-glossary",
    "process-guide"
];
```

Run: `npm test -w @ti-engine/competence`
Expected: FAIL — `process-guide` missing registration, mapping, and label. (The freshness/CSP tests still PASS — they only look at the generated `guide/` directory.)

- [ ] **Step 2: Create the fragment**

Create `packages/competence/bin/static/fragments/frame-process-guide.html`. Hand-authored, fully static (no Alpine component, no inline styles). The eight step summaries below are the verified content — write them out as shown:

```html
<!-- Process Guide — a hand-authored, static walkthrough of the eight appraisal steps. English-only in v1, like the
     generated User Guide chapters (see docs/user-guide); the BG pass regenerates/translates both together. -->
<div class="ti-page competence-pg-page">

    <div class="ti-page-head">
        <div class="ti-page-eyebrow">User Guide</div>
        <h1 class="ti-page-title">The Appraisal Process at a Glance</h1>
        <p class="ti-page-subtitle">Eight steps from opening a cycle to a closed evaluation — who does what, where, and what happens next. Every step links to the chapter with the full details.</p>
    </div>

    <!-- Status lifecycle -->
    <div class="ti-panel competence-pg-lifecycle-panel">
        <div class="ti-panel-head bar">
            <div class="ti-panel-head-icon"><span class="ti-icon cycles-loop md" aria-hidden="true"></span></div>
            <div class="ti-panel-title">The life of an evaluation</div>
        </div>
        <div class="competence-pg-lifecycle" role="list" aria-label="Evaluation statuses in order">
            <span class="competence-pg-status open" role="listitem">Open<span class="competence-pg-status-sub">self &amp; team rounds</span></span>
            <span class="competence-pg-arrow" aria-hidden="true">→</span>
            <span class="competence-pg-status in-review" role="listitem">In Review<span class="competence-pg-status-sub">manager round</span></span>
            <span class="competence-pg-arrow" aria-hidden="true">→</span>
            <span class="competence-pg-status ready" role="listitem">Ready<span class="competence-pg-status-sub">scores out, interview</span></span>
            <span class="competence-pg-arrow" aria-hidden="true">→</span>
            <span class="competence-pg-status closed" role="listitem">Closed<span class="competence-pg-status-sub">final &amp; irreversible</span></span>
        </div>
        <p class="competence-pg-lifecycle-note">A Supervisor can withdraw a stalled or mistaken evaluation from any active status — it is removed and a fresh one can be started.</p>
    </div>

    <!-- The eight steps -->
    <div class="competence-pg-steps">

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">1</span>
                <h2 class="competence-pg-step-title">The cycle opens</h2>
                <span class="competence-pg-role supervisor">Supervisor</span>
            </div>
            <p>A Supervisor creates the appraisal cycle, selects the competencies each role family is evaluated on, and locks the cycle once validation passes. From that moment the cycle is active — the only active one — and evaluations can be started.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">Cycles · Cycle Setup</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-supervisor" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">2</span>
                <h2 class="competence-pg-step-title">An evaluation starts</h2>
                <span class="competence-pg-role manager">Manager</span>
                <span class="competence-pg-role supervisor">Supervisor</span>
            </div>
            <p>A manager (or Supervisor) starts an evaluation for an employee and may pick 3–5 peers for team feedback. The employee's competency set is frozen into the evaluation at this moment — later configuration changes never affect it.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">Org Chart · New Evaluation</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-manager" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">3</span>
                <h2 class="competence-pg-step-title">Self-evaluation</h2>
                <span class="competence-pg-role employee">Employee</span>
            </div>
            <p>The employee grades every competency against its scope description and adds a written comment. Drafts can be saved until the deadline — a late submission is rejected, though a Supervisor can move a stalled evaluation on without it.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">My Evaluation</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-employee" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">4</span>
                <h2 class="competence-pg-step-title">Team feedback</h2>
                <span class="competence-pg-role team">Team Members</span>
            </div>
            <p>If peers were assigned, each submits feedback once — by default one grade per competency group. Individual grades stay private forever; only the averaged team grade is ever shown. A round that never happens is excluded from the score, not counted against it.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">My Evaluation (as Team)</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-team-member" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">5</span>
                <h2 class="competence-pg-step-title">Ready for review</h2>
                <span class="competence-pg-role system">Automatic</span>
            </div>
            <p>Once the self-evaluation is in and team feedback is complete (or was not requested), the evaluation moves to In Review on its own and the manager is notified.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">—</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-appraisal-process" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">6</span>
                <h2 class="competence-pg-step-title">Manager review</h2>
                <span class="competence-pg-role manager">Manager</span>
            </div>
            <p>The manager reviews the self grades, the team result, and the anonymous peer notes, then grades every competency and writes their feedback. Submitting computes the scores — the manager's input carries the largest weight — and the evaluation becomes Ready. The manager deadline is a reminder, never a block.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">Evaluation Form</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-manager" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">7</span>
                <h2 class="competence-pg-step-title">The interview is scheduled</h2>
                <span class="competence-pg-role manager">Manager</span>
                <span class="competence-pg-role supervisor">Supervisor</span>
            </div>
            <p>Managers keep a weekly availability calendar; a Supervisor books a slot for each Ready evaluation. Whoever owns the booked slot conducts the interview, and both the employee and that manager are notified of the date.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">Availability · Interviews</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-supervisor" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

        <div class="ti-panel competence-pg-step">
            <div class="competence-pg-step-head">
                <span class="competence-pg-step-number" aria-hidden="true">8</span>
                <h2 class="competence-pg-step-title">Interview &amp; closure</h2>
                <span class="competence-pg-role manager">Manager</span>
                <span class="competence-pg-role supervisor">Supervisor</span>
            </div>
            <p>After the meeting, the conducting manager records the outcome — written feedback, next-period goals, and an optional improvement plan. The Supervisor then formally closes the evaluation: grades are untouched, the closure becomes visible to the employee, and nothing can change afterwards.</p>
            <div class="competence-pg-step-foot">
                <span class="competence-pg-step-where">Interviews</span>
                <button class="ti-btn ghost" type="button" hx-get="/app/help-supervisor" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true">Learn more</button>
            </div>
        </div>

    </div>

    <!-- Roles legend -->
    <div class="ti-panel competence-pg-legend">
        <div class="ti-panel-head bar">
            <div class="ti-panel-head-icon"><span class="ti-icon users md" aria-hidden="true"></span></div>
            <div class="ti-panel-title">Who's who</div>
        </div>
        <ul class="competence-pg-legend-list">
            <li><span class="competence-pg-role employee">Employee</span> The person being evaluated — everyone holds this role.</li>
            <li><span class="competence-pg-role team">Team Member</span> A peer picked to give feedback on one specific evaluation.</li>
            <li><span class="competence-pg-role manager">Manager</span> Manages a unit — starts evaluations, reviews, and conducts interviews.</li>
            <li><span class="competence-pg-role supervisor">Supervisor</span> The process owner — runs cycles, unblocks stalls, schedules and closes.</li>
            <li><span class="competence-pg-role system">Automatic</span> Done by the application itself — no action needed.</li>
        </ul>
        <p class="competence-pg-legend-note">Roles are assigned automatically from the organization chart when you sign in; one person can hold several. Administrators (configuration) are a separate, operations-managed capacity.</p>
    </div>

</div>
```

- [ ] **Step 3: Register, map, label, enable the button**

1. In `competence-web-application.js`, after the `help-faq-glossary` registration:

```js
        this.addFragment( "process-guide", {
            title: "Process Guide",
            path: "fragments/frame-process-guide.html"
        } );
```

2. In `sidebarNavMapping`, after `"help-faq-glossary": "help"` (add a comma to that line):

```js
                    "process-guide": "process-guide"
```

3. In `competence-labels.json` `interface.topbar`, alongside the Task 7 entries:

```json
      "process-guide": {
        "en": "Process Guide",
        "bg": "Ръководство за процеса"
      }
```

4. In `component-sidebar.html`, replace the disabled Process Guide button:

```html
        <button class="ti-sidebar-item" type="button" x-text-label:data-tip="interface.navigation.process-guide"
                x-text-label:aria-label="interface.navigation.process-guide" disabled>
            <span class="ti-sidebar-item-icon">
                <span class="ti-icon book md" aria-hidden="true"></span>
            </span>
            <span class="ti-sidebar-item-label" x-text-label="interface.navigation.process-guide">Process Guide</span>
        </button>
```

with:

```html
        <button hx-get="/app/process-guide" hx-target="#ti-content" hx-swap="innerHTML" hx-push-url="true" @click="active = 'process-guide'"
                x-bind:class="{ active: active === 'process-guide' }" class="ti-sidebar-item" type="button"
                x-text-label:data-tip="interface.navigation.process-guide" x-text-label:aria-label="interface.navigation.process-guide">
            <span class="ti-sidebar-item-icon">
                <span class="ti-icon book md" aria-hidden="true"></span>
            </span>
            <span class="ti-sidebar-item-label" x-text-label="interface.navigation.process-guide">Process Guide</span>
        </button>
```

- [ ] **Step 4: Append the Process Guide styles**

Append to `competence-main.css`:

```css
/* ---------- Process Guide screen ---------- */

.competence-pg-lifecycle-panel {
    margin-bottom: var(--s-4);
}

.competence-pg-lifecycle {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--s-2);
    padding: var(--s-4);
}

.competence-pg-status {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--s-2) var(--s-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--bg-sunken);
    color: var(--fg-primary);
    font-weight: 600;
    font-size: var(--fs-sm);
}

.competence-pg-status.ready {
    border-color: var(--accent);
}

.competence-pg-status.closed {
    border-color: var(--success);
}

.competence-pg-status-sub {
    color: var(--fg-tertiary);
    font-weight: 400;
    font-size: var(--fs-xs);
}

.competence-pg-arrow {
    align-self: center;
    color: var(--fg-tertiary);
}

.competence-pg-lifecycle-note {
    padding: 0 var(--s-4) var(--s-4);
    margin: 0;
    color: var(--fg-tertiary);
    font-size: var(--fs-sm);
}

.competence-pg-steps {
    display: grid;
    grid-template-columns: repeat( auto-fill, minmax( 340px, 1fr ) );
    gap: var(--s-4);
    margin-bottom: var(--s-4);
}

.competence-pg-step {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-4);
}

.competence-pg-step p {
    margin: 0;
    color: var(--fg-secondary);
    font-size: var(--fs-sm);
    line-height: 1.6;
    flex: 1;
}

.competence-pg-step-head {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
}

.competence-pg-step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--fg-primary);
    font-weight: 700;
    font-size: var(--fs-sm);
    flex-shrink: 0;
}

.competence-pg-step-title {
    margin: 0;
    font-size: 1.05rem;
    color: var(--fg-primary);
    flex: 1;
}

.competence-pg-role {
    display: inline-block;
    padding: 1px var(--s-2);
    border-radius: var(--r-pill);
    font-size: var(--fs-xs);
    font-weight: 600;
    border: 1px solid var(--border);
    color: var(--fg-secondary);
    background: var(--bg-sunken);
    white-space: nowrap;
}

.competence-pg-role.supervisor {
    border-color: var(--accent);
}

.competence-pg-role.manager {
    border-color: var(--info);
}

.competence-pg-role.employee {
    border-color: var(--success);
}

.competence-pg-role.team {
    border-color: var(--warn);
}

.competence-pg-step-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-2);
    border-top: 1px solid var(--border-soft);
    padding-top: var(--s-3);
}

.competence-pg-step-where {
    color: var(--fg-tertiary);
    font-size: var(--fs-xs);
}

.competence-pg-legend-list {
    list-style: none;
    margin: 0;
    padding: var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    color: var(--fg-secondary);
    font-size: var(--fs-sm);
}

.competence-pg-legend-list .competence-pg-role {
    margin-right: var(--s-2);
}

.competence-pg-legend-note {
    padding: 0 var(--s-4) var(--s-4);
    margin: 0;
    color: var(--fg-tertiary);
    font-size: var(--fs-sm);
}
```

- [ ] **Step 5: Run the tests and lint**

Run: `npm test -w @ti-engine/competence`
Expected: PASS — including the extended wiring test and the existing `fragment-input-bindings` suite (which automatically scans the new fragment).
Run: `npx eslint .`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/competence/bin/static/fragments/frame-process-guide.html packages/competence/bin/competence-web-application.js packages/competence/bin/static/fragments/components/component-sidebar.html packages/competence/bin/localization/competence-labels.json packages/competence/bin/static/scripts/competence-main.css packages/competence/test/user-guide-build.test.js
git commit -m "feat(competence): Process Guide screen — 8-step walkthrough with role badges, status lifecycle, deep links into Help (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Release prep — CHANGELOG + version 3.14.0

**Files:**
- Modify: `packages/competence/package.json` (version)
- Modify: `packages/competence/CHANGELOG.md` (new top entry)
- Regenerate: `packages/competence/bin/static/fragments/guide/` (version stamp changes)

**Interfaces:**
- Consumes: everything above. Produces: the released 3.14.0 state.

- [ ] **Step 1: Bump the version**

In `packages/competence/package.json`, change `"version": "3.13.3"` to `"version": "3.14.0"`.

- [ ] **Step 2: Regenerate the guide (footer version stamp)**

Run: `npm run build:guide -w @ti-engine/competence`
Expected: `generated 9 screen(s)`. The only diff in each generated file is the `Guide for competence v3.14.0` stamp.

- [ ] **Step 3: Add the CHANGELOG entry**

At the top of `packages/competence/CHANGELOG.md` (below the intro paragraph, above `## Version 3.13.3`), insert:

```markdown
## Version 3.14.0

End-user documentation: a comprehensive role-based user guide, in the repo and in the app. The markdown chapters under `docs/user-guide/` are the single source; a build step generates the in-app Help screens, and a hand-authored Process Guide screen walks the eight appraisal steps. The sidebar Quick Links ("Process Guide", "Help") — disabled placeholders until now — are live. See `docs/superpowers/specs/2026-07-24-competence-user-guide-design.md` (CA-92).

* docs(competence): refresh the README — link the `INSTALL.md` ops guide from Deployment, document the Azure-SSO container default and the `GET /health` probe, and align the `COMPETENCE_PRELOAD_DATA` wording with the non-destructive merge-seed semantics
* docs(competence): add the end-user guide — nine markdown chapters under `docs/user-guide/en/` (overview & key concepts, getting started, employees, team members, managers, supervisors, administrators, the appraisal process end-to-end, FAQ & glossary)
* feat(competence): generate the in-app Help screens from the guide markdown — `bin/build/build-user-guide.js` (`npm run build:guide`; `marked` pinned as a build-time devDependency) emits one committed static fragment per chapter with chapter navigation, prev/next links, and a version stamp; raw HTML, relative `.md` links, inline styles, and scripts are build errors
* feat(competence): register the nine public Help screens and enable the sidebar Help quick link, with sidebar active-state mapping and topbar titles (en + bg, bg pending native review); freshness, wiring, and CSP guards land in `test/user-guide-build.test.js`
* feat(competence): add the Process Guide screen — a hand-authored walkthrough of the eight appraisal steps with role badges, the evaluation status lifecycle, and deep links into the Help chapters; sidebar Process Guide quick link enabled
* build(release): bump package version from `3.13.3` to `3.14.0`
```

- [ ] **Step 4: Full verification suite**

Run: `npm test -w @ti-engine/competence` → PASS (the freshness test confirms the regenerated stamp matches the bumped version).
Run: `npm run test:json -w @ti-engine/competence` → PASS.
Run: `npm test` (repo root, all workspaces) → PASS.
Run: `npx eslint .` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/competence/package.json packages/competence/CHANGELOG.md packages/competence/bin/static/fragments/guide
git commit -m "build(release): competence 3.13.3 -> 3.14.0 — end-user guide + in-app Process Guide & Help (CA-92)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Browser verification + delivery

**Files:** none (verification; fixes loop back into the owning task's files with follow-up commits if needed)

- [ ] **Step 1: Start the stack** — from the repo root: `docker compose up -d --build` (dev compose enables `local` auth and the test-user panel). Wait for the app on `http://localhost:3000/login`.

- [ ] **Step 2: Walk the checklist in the Browser pane** (sign in via the test-user panel; use its roles override to switch capacities):

  1. Sidebar shows **Process Guide** and **Help** enabled (not grayed) for a plain employee.
  2. **Help** opens the Overview chapter; the chapter nav lists all nine chapters with Overview marked active; the topbar reads "User Guide — Overview".
  3. Click through every chapter via the nav; each renders (headings, tables, callouts); prev/next footers navigate; the version stamp reads `v3.14.0`.
  4. Browser **refresh (F5) on a chapter URL** re-renders the same chapter (server-side route works); browser back/forward walks the visited chapters.
  5. **Process Guide** renders the lifecycle strip, all eight step cards, and the legend; every "Learn more" lands on the right Help chapter and the sidebar highlight moves to Help.
  6. Toggle the theme — both screens are legible in Daylight and Black Glass (tables, callouts, badges, status strip).
  7. Resize to a narrow window — the chapter nav stacks above the content; tables scroll horizontally inside their wrapper; no page-level horizontal scroll.
  8. Spot-check role claims: as an employee, confirm Availability/Interviews/Manage/Insights are absent from the sidebar (matching the Getting Started table); as manager/supervisor, confirm they appear.
  9. Check the browser console for errors (there must be none attributable to the new screens — e.g. CSP violations).

- [ ] **Step 3: Capture proof** — screenshot a Help chapter and the Process Guide (one per theme) for the PR description.

- [ ] **Step 4: Fix-loop** — any issue found: diagnose against the owning task, fix the source (markdown → regenerate; fragment/CSS → edit), re-run `npm test -w @ti-engine/competence`, re-verify in the browser, and commit as `fix(competence): … (CA-92)`.

- [ ] **Step 5: Stop the stack** — `docker compose down`.

- [ ] **Step 6: Update YouTrack CA-92** — add a comment summarizing the delivery (chapters, screens, guards, version 3.14.0) and log the time spent (`log_work`). Leave State/Stage transitions to the PR/merge flow per repo convention.

- [ ] **Step 7: Integration** — implementation is complete; use the superpowers:finishing-a-development-branch skill to decide merge/PR (repo flow: PR from `current` to `master`, body ending with the standard generated-with footer).
