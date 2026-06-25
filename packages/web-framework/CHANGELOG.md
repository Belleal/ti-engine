# ti-engine web-framework changelog

This document will contain the list of changes made to the framework. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.10.2

Readability and scaling fixes for the chart primitives, surfaced while polishing the Statistics & Results screens (CA-61).

* fix(web-framework): stacked bar charts now caption each row (the group/cycle label plus an optional per-row value) and render an optional swatch legend driven by `spec.options.legend`, so a coverage "By group" chart reads as labelled bars instead of anonymous colour blocks; the row labels also land on the cross-cycle trend bars
* fix(css): horizontal bar charts opt out of the global `svg` `max-height` so bar thickness and label size stay identical regardless of row count — a tall org-wide chart is no longer uniformly scaled down and rendered finer than the same chart on a smaller subtree; the per-row geometry is trimmed for a cleaner look
* feat(css): `.ti-chart-legend` / `.ti-chart-legend-item` / `.ti-chart-legend-swatch` — a chart swatch legend whose colours route through the inherited grade/ink chart tokens
* build(release): bump package version from `1.10.1` to `1.10.2`

## Version 1.10.1

Review fixes for the ti-chart primitives (Statistics & Results, CA-61, PR #83 — CodeRabbit pass).

* fix(web-framework): drillable heatmap/box marks get an accessible name; `renderChart` clears stale `data-ti-chart-empty`/`aria-label` on rerender; `renderStat` renders a missing value as an em dash; the provisional line-dot stroke follows its `tone-*` class
* fix(css): `.ti-chart-sr` uses `clip-path: inset(50%)` instead of the deprecated `clip` property
* build(release): bump package version from `1.10.0` to `1.10.1`

## Version 1.10.0

### Charting primitive library (Statistics & Results, CA-61)

* feat(web-framework): new `ti-charts.js` — a CSP-safe SVG charting library backing the competence Statistics & Results reporting. Eight primitives via a single `renderChart(figure, spec)` dispatcher: `gauge`, `bars` (stacked / grouped / diverging modes), `stat`, `scatter`, `heatmap` (sequential / diverging scales), `box`, `radar`, and `line` (mean + p25–p75 band, sparkline, stacked, dashed-provisional trailing segment). The pure layout helpers (`gaugeArcPath`, `barSegments`, `scatterLayout`, `heatmapLayout`, `boxLayout`, `radarLayout`, `lineLayout`, …) are unit-tested in isolation
* feat(web-framework): register the `x-ti-chart` Alpine CSP directive (binds a spec object to a host `<figure>`); every chart builds its SVG with `createElementNS` + `setAttribute` only (never `element.style.*` except `setProperty("--var")`) and ships a visually-hidden `.ti-chart-sr` accessibility table
* feat(css): `.ti-chart-*` styles + per-type `figure[data-ti-chart-type]` size caps + `--chart-seq-1…5` sequential ramp tokens and grade/tone colours in both themes (daylight + black-glass)
* build(release): bump package version from `1.9.3` to `1.10.0`

## Version 1.9.3

* feat(css): an empty `.ti-grade-chip` (a competency whose rating is still awaited) now renders an hourglass glyph via `::before` instead of a literal dash, so "awaiting rating" reads as a clear visual state wherever an empty grade chip is shown to a permitted viewer
* build(release): bump package version from `1.9.2` to `1.9.3`

## Version 1.9.2

* feat(css): add `.ti-spacer` — a flexible spacer (`flex: 1 1 auto`) that pushes following siblings to the far end of a flex row/column. Promotes the bespoke per-screen `competence-empmgmt-actions-spacer` into a shared primitive, now consumed by the employee-management actions panel and the evaluation screen's team-feedback finalize bar
* build(release): bump package version from `1.9.1` to `1.9.2`

## Version 1.9.1

* build(deps): upgrade `ajv` from ^6.15.0 to ^8.20.0 — ajv 8 renamed the validation-error `dataPath` (dot style) to `instancePath` (JSON Pointer)
* fix(config-registry): normalize ajv 8's `instancePath` back to the dot/bracket data path the registry has always exposed on schema issues (e.g. `.competencies.E1-1.name`, array indices as `[0]`), so the public `ConfigValidationIssue.path` contract is unchanged across the upgrade; the ajv compile options (`meta`, `schemaId: "$id"`, `validateSchema: false`) and Draft-07 handling are unchanged
* build(deps): update `helmet` from ^8.1.0 to ^8.2.0

## Version 1.9.0

* feat(css): add `.ti-panel-body-intro` — the canonical description/intro line under a `.ti-panel-head` (`--fs-sm`, secondary foreground, `0 var(--s-3) var(--s-5)` padding, 1.5 line-height); replaces the per-screen intro paragraphs that screens used to hand-style
* refactor(css): tighten the key/value primitives — `.ti-kv-label` is now an uppercase `--fs-xs` 600-weight caption (0.05em letter-spacing); `.ti-kv-value` is `--fs-sm` 400-weight — for a consistent, scannable key/value rhythm across screens
* refactor(css): drop the redundant `margin-left: auto` from `.ti-panel-head-aside` (the panel head already positions it via its flex layout)
* fix(sidebar): the user-profile flyout actions (Profile, Settings, Logout) now actually fire. The menu items bind their `hx-*` attributes through Alpine (`x-bind`), which HTMX does not pick up on its initial document scan — so the buttons previously only closed the flyout. The flyout now runs `htmx.process` on its panel when it opens (idempotent on re-open), wiring up each button's `hx-get`/`hx-post`/`hx-target`/`hx-swap`
* fix(sidebar): the role/department line under the user name no longer overflows the fixed-width sidebar — `.ti-sidebar-user-name` and `.ti-sidebar-user-sub` truncate with an ellipsis, and `.ti-sidebar-user-text` gets `flex: 1` so it bounds the text column
* style(css): expand the `.ti-icon` size-modifier one-liners (`.xs`/`.sm`/`.md`/`.lg`/`.xl`) to block form for consistency with the rest of the sheet
* build(release): bump package version from `1.8.0` to `1.9.0`

## Version 1.8.0

* feat(notifications): notifications can now show a secondary **details** line under the generic message. `tiApplication.formatException` returns `{ message, details }` (resolved from the exception's `data.details`, falling back to the raw text for non-localized messages) and `tiApplication.notify` accepts that payload — so an error like "The request parameters are not recognized or not supported." now also shows the specifics (e.g. "Competency codes not in the 'QE' pool: …") in a smaller, muted font. The returned object stringifies to its message, so existing string usages keep working unchanged
* fix(css): raise the toast stack above the modal layer (`z-index` 1100 → 1300; the modal backdrop is 1200) so a notification raised while a modal is open is no longer hidden behind it

## Version 1.7.1

* fix(web-handlers): web-application request errors that carry no explicit `httpCode` are no longer reported as `500`. A new `resolveHttpCode` derives the status from the exception code — request-validation and application-logic errors (`E_WEB_*` / `E_APP_*`) map to `422 Unprocessable Content`, security (`E_SEC_*`) to `403`, resource not-found/already-exists to `404`/`409`, and method/URI/content errors to `405`/`404`/`415`; only genuine internal, communication, and unknown errors still default to `500`. An explicit `httpCode` on the exception always wins. Applied in both the `/app` request handler (`formatException`) and the default error handler

## Version 1.7.0

* feat(css): introduce `.ti-data-grid` family — `.ti-data-grid`, `.ti-data-grid-head`, `.ti-data-grid-rows`, `.ti-data-grid-row` with shared `--ti-grid-cols` template; row state modifiers `.is-current` (accent-soft, "current user") and `.is-selected` (accent-soft + left accent bar); wrapper variants `.bordered` (horizontal dividers for tabular displays) and `.compact` (denser padding); cell utilities `.ti-cell-center` / `.ti-cell-right` for per-cell alignment
* feat(css): introduce `.ti-page-head` as a vertical block stack (eyebrow above title, subtitle below) using `--fs-xs` for the eyebrow and clamping subtitle width at 60ch
* feat(css): introduce a reusable `.ti-form*` family — `.ti-form`, `.ti-form-section`, `.ti-form-section-title`, `.ti-form-grid` (with `.cols-1` / `.cols-3` modifiers), `.ti-form-row` (with `.wide` for grid-spanning), `.ti-form-readonly`, `.ti-form-hint`, `.ti-form-error`, `.ti-form-actions`, `.ti-form-state` (with `.saved` / `.unsaved`); single responsive collapse to one column under 720px
* feat(css): extend `.ti-panel-head` with sub-elements — `.ti-panel-head-icon` (32x32 framed icon slot), `.ti-panel-head-text` (title + subtitle stack inside a flex row), `.ti-panel-title-aside` (inline qualifier next to the title), `.ti-panel-subtitle` (dimmed sub line), `.ti-panel-head-aside` (right-aligned read-only info with left-border separator), and the `.bar` modifier (sunken full-width banner)
* feat(icons)!: rebase `.ti-icon` on `background-color: currentColor` so icons inherit the surrounding text colour; add size modifiers `.xs` (12px), `.sm` (14px), `.md` (16px), `.lg` (24px), `.xl` (32px); add `.legacy-gray` modifier to preserve the previous gray/hover behaviour for consumers that rely on the fixed colour scheme
* feat(icons): add 21 new `.ti-icon` variants (lucide / feather style, 24x24 viewBox) — `plus`, `close`, `check`, `check-clipboard`, `send`, `search`, `clock`, `warning-triangle`, `info-circle`, `bell`, `check-circle`, `eye`, `calendar-blank`, `user`, `users`, `briefcase`, `folder`, `book`, `help-circle`, `bar-chart`, `chevron-left`, `chevron-right`, `dashboard-grid`, `cycles-loop`, `sun`
* feat(icons): add `.ti-icon.moon` mask variant so theme toggles can mirror the target mode
* feat(framework): add `tiApplication.hasRole(roleCode)` helper that does the array-shape check in plain JS (the Alpine CSP build does not expose `Array` to its expression evaluator, so `Array.isArray(...)` written inline in a template raises `Undefined variable: Array`)
* feat(framework): add `tiApplication.topbarPrimaryCta` store slot plus `setTopbarPrimaryCta` / `setTopbarPrimaryCtaDisabled` API for per-screen CTA buttons in the topbar; auto-cleared on screen navigation so each screen owns its slot
* feat(css): native select chevron replaced by a custom down-chevron SVG positioned at right: 10px / 14x14; padding-right reserves the slot; glass theme overrides the SVG stroke colour because `background-image` can't pick up `currentColor`
* feat(css): subdue `::-webkit-calendar-picker-indicator` to opacity 0.7 (1 on hover) so date-input visual weight matches the chevron
* feat(notification bar): replace inline toast SVGs with `.ti-icon` mask classes (success check, danger close, warn triangle, info circle, close button)
* feat(sidebar): replace inline navigation SVGs with `.ti-icon` mask classes (collapse chevron, dashboard home, sun theme toggle)
* refactor(css): drop the screen-specific page-header, form, and tabular-layout CSS that duplicated framework primitives; all in-tree screens (`frame-employees-list`, `frame-cycles`, `frame-cycle-setup`, `frame-competence-evaluation`, `frame-new-evaluation`, `frame-manager-calendar`, `frame-interview-schedule`, `frame-employee-management`) now consume `.ti-page-head`, `.ti-data-grid`, `.ti-form*`, and `.ti-panel-head*` instead
* docs(modal): doc-block on `.ti-modal-*` confirming it as the canonical shared primitive (introduced in 1.6.3 via the competence cycle-setup work)
* build(release): bump package version from `1.6.3` to `1.7.0`

## Version 1.6.3

* feat(css): add `--ti-internal-padding` CSS variable to the design token system
* feat(css): add `--ti-border-color` CSS variable for consistent border theming
* feat(icons): add `.ti-icon.calendar` and `.ti-icon.schedule` icon variants with hover states
* feat(css): add `.ti-data-value.fill-space` modifier for flex-grow behavior in inline data value layouts
* fix(css): remove `min-width: 120px` constraint from `.ti-button.inline` for more flexible sizing
* fix(css): update z-index stacking values for dropdown and overlay elements to prevent layering conflicts
* build(deps): update `openid-client` from ^6.8.2 to ^6.8.4
* build(deps): update bundled `@alpinejs/csp` from ^3.15.11 to ^3.15.12
* build(deps): update bundled `htmx.org` from ^2.0.8 to ^2.0.10
* build(static): refresh bundled Alpine.js CSP and HTMX library files to match updated dependency versions

## Version 1.6.2

* feat(ui): replace Material Symbols usage with framework-native `.ti-icon` classes across sidebar flyouts, login actions, and notification bar
* feat(sidebar): merge administration and user flyout menus into a single `sidebarApplicationMenu` with configurable menu icon and updated actions
* feat(css): add embedded SVG mask icon variants (`app-menu`, `dashboard`, `settings`, `error`, `user-profile`, `login`, `logout`, `internet`) and increase default icon size to `24px`
* refactor(theme): remove Material Symbols-specific icon styling from the black-glass theme
* build(static): remove external Google Material Symbols stylesheet import from static `index.html`
* build(release): bump package version from `1.6.1` to `1.6.2`

## Version 1.6.1

* feat(css): add inline button support via `.ti-button.inline` and new `--ti-button-inline-height` design token
* refactor(ui): update sidebar flyout positioning logic to use shared `tiToolbox` viewport helpers (`getVisibleBox`, `clampToBox`)
* fix(ui): fix the call to utility functions `getVisibleBox` and `clampToBox` in the sidebar flyout component
* build(release): bump package version from `1.6.0` to `1.6.1`

## Version 1.6.0

* feat(toolbox): add Alpine.js `tiToolbox` store with shared utility methods (`deepMerge`, `deepFreeze`, `structuredClone`, `formatDate`, viewport helpers, and cookie access)
* feat(ui): move sidebar menu configuration into `ti-framework.js` and register `tiComponentsConfig` during Alpine.js initialization
* refactor(static): remove legacy `ti-user-interface.js` from static assets and stop loading it from `index.html`
* refactor(components): update framework components to consume toolbox utilities through Alpine stores
* refactor(docs): add and expand JSDoc typedefs and method-level documentation in `ti-framework.js`
* build(release): bump package version from `1.5.3` to `1.6.0`

## Version 1.5.3

* feat(framework): add `openScreen` method for in-app navigation
* fix(auth): add explicit HTTP `401` status to authentication failure

## Version 1.5.2

* feat(framework): expand application API by improving `sendRequest`, `notify`, and `getLabel` methods
* feat(tooltip): add helper methods `getTooltipMessage`, `handleEnter`, `handleLeave`, `showTooltip`, `hideTooltip` to the tooltip component
* feat(css): improve styles and style structure

## Version 1.5.1

* feat(framework): add `isValidDate` utility function for validating Date instances
* feat(framework): add `deepFreeze` utility function for recursive object freezing
* feat(framework): add `getLabel` method on application configuration for nested label resolution with dot notation
* feat(framework): add Alpine.js directive `x-text-label` for runtime label translation
* feat(framework): add a configuration object to replace labels object with enhanced structure
* feat(config): add authentication state (`auth.isAuthenticated`) to config endpoint response
* feat(placeholder): add inner content capture and injection for placeholder replacement
* feat(tooltip): add a new tooltip component with Alpine.js integration and positioning
* feat(css): add CSS custom properties for padding, margin, and font-family
* feat(css): add tooltip styling variables (background, foreground, size, shadow, arrow)
* feat(css): add `.ti-content.pane` block with flex layout and overflow handling
* feat(css): add error color, flyout item shadows, and separator color variables
* feat(css): add `.ti-glass-btn-black.large` variant with left-justified content
* refactor(framework): change user initialization from `undefined` to `null`
* refactor(framework): improve request failure handling with proper error rejection
* refactor(css): replace hard-coded spacing with CSS variables across components
* refactor(css): add `overflow: hidden` to body and `.ti-main` for better layout control
* refactor(css): convert color and styling values to CSS variables throughout
* refactor(handlers): add `convertUriToString` helper for safe URI object stringification
* refactor(handlers): add a request context object (query, params, headers, url, method) to JSON responses
* refactor(handlers): augment user data with default employeeID and roles in the user information handler
* build(deps): update express from ^5.1.0 to ^5.2.1
* build(deps): update express-session from ^1.18.2 to ^1.19.0
* build(deps): update lodash from ^4.17.21 to ^4.17.23
* build(deps): update openid-client from ^6.8.1 to ^6.8.2
* build(deps): update `@alpinejs/csp` from ^3.15.2 to ^3.15.8
* build(engines): update Node.js requirement from >=18.0.0 to >=20.0.0

## Version 1.5.0

* feat(web-app)!: change `TiWebAppManager` to be an abstract class
* feat(web-app): rename class `WebAppManager` to `TiWebAppManager` and add a static file caching mechanism
* feat(web-app): add `addFragment` method with override protection for custom HTML fragment registration
* feat(web-app): add `webAppIdentifier` getter to expose application identifier
* feat(web-server): add support for dynamic web application instantiation from config via `classPath`
* feat(web-server): add `defineWebApplicationRoutes` and `defineUnprotectedRoutes` extension points
* feat(web-server): add `endpointEnabled` flag to conditionally enable API endpoint proxy
* feat(web-server): add serving for `.well-known` directory for web standards compliance
* feat(package): add public exports for `./web-application` and `./web-server` subpaths
* feat(package): add `files` whitelist and repository metadata (homepage, bugs URL, git repository)
* feat(package): add Node.js version requirement (>=18.0.0) via the `engines` field
* feat(build): add a post-install script to vendor HTMX and Alpine.js CSP libraries locally
* refactor(web-app): replace `fullPublicPath` with `staticContentPaths` array for multi-path static content resolution
* refactor(web-app): add file location search algorithm with caching via `#locateStaticFile` method
* refactor(web-app): update `transformHtml` signature to remove `fullPublicPath` parameter
* refactor(web-app): update `assembleHtmlView` to accept `staticContentPaths` instead of `fullPublicPath`
* refactor(web-server): replace the single static path with configurable `staticContentPaths` array
* refactor(web-server): merge web server default config with the provided service config in constructor
* refactor(web-server): load web server default config directly from the package JSON import instead of the ENV configuration
* refactor(web-server): improve TLS initialization error handling to reject promise instead of throw
* refactor(package): reorganize imports from `./server/...` to `./bin/...` and `./components/...` paths
* refactor(package): move `@alpinejs/csp` from dependencies to devDependencies
* build(static): replace CDN script references with local copies for HTMX and Alpine.js CSP
* build(env): remove `TI_INSTANCE_CONFIG` and update `TI_LOCALIZATION_LABELS_PATH` to use `bin/localization/` path
* build(env): add `TI_AUDITING_LOG_MIN_LEVEL` configuration variable
* fix(ui): change `aria-expanded` binding from string to boolean in the sidebar flyout component
* fix(ui): remove incorrect `type="button"` attribute from `Home` anchor element
* docs: improve various documentation comments and class descriptions

## Version 1.4.0

* feat(ui): add a notification bar component with Alpine.js integration and auto-dismiss functionality
* feat(ui): add CSS variables and styles for the notification system
* feat(routes): add `/not-found` fragment and route for 404 error pages
* feat(routes): add `/app/error` route for error handling testing - will be removed later
* feat(routes): add `/app/config` data endpoint for serving application configuration
* feat(localization): add language property to `User` class with getter and JSON serialization
* feat(localization): integrate localization module for label management and localized error messages
* feat(session): add language property to session data populated from user or service configuration
* feat(handlers): add response type detection helper `isAcceptingResponseType` for content negotiation
* feat(handlers): enhance error responses with localized messages via localization module
* feat(handlers): add HTMX-aware error handling with HX-Redirect and HX-Retarget headers
* feat(handlers): implement `processDataRequest` method in WebAppManager for serving data resources
* feat(config): add a language configuration option to the `WebServiceConfiguration` object
* refactor(handlers): delegate error handling from resource protection to error middleware
* refactor(handlers): improve 401/404 response handling by routing through exceptions and middleware
* refactor(handlers): enhance CSRF and origin validation to use error middleware instead of direct responses
* refactor(handlers): improve service call error handling to raise exceptions and delegate to middleware
* refactor(handlers): refactor invalid route handler to raise exceptions instead of direct 404 responses
* fix(types): correct ExpressRequest typedef from `import("express").req` to `import("express").Request`
* build(config): update publicPath from `packages/web-framework/bin/static` to `bin/static`
* build(config): update TLS certificate paths to use relative `bin/tls/` paths
* build(env): update `TI_INSTANCE_CLASS` and `TI_INSTANCE_CONFIG` paths to use relative `bin/` paths
* build(env): add `TI_LOCALIZATION_LABELS_PATH` environment variable for custom labels
* build(run): update IDE run configuration to use relative paths and the correct working directory
* build(labels): add an empty `web-server-labels.json` file for custom localization labels

## Version 1.3.0

* feat: first working prototype version
