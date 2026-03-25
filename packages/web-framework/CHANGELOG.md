# ti-engine web-framework changelog

This document will contain the list of changes made to the framework. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

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
* build(engines): update Node.js requirement from `>=20.0.0` to `>=24.0.0`
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
