# ti-engine web-framework changelog

This document will contain the list of changes made to the framework. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

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