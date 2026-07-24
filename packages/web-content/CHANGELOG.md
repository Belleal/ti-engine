# ti-engine web-content changelog

This document will contain the list of changes made to the web-content package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 0.1.0

Initial scaffold of the content-publishing engine for the standalone author's site (design: `design/author-site-engine.md`). Layers on `@ti-engine/web-framework` >= 1.17.0 (the route-registration seams).

* feat(web-content): package inception — CommonJS package `@ti-engine/web-content` depending on `@ti-engine/core` and `@ti-engine/web-framework`; dependencies and `exports`/`imports` grow per phase
