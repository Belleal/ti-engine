# ti-engine repository changelog

This document contains the list of changes made to the ti-engine monorepo. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.2.5

Publishing to npm was tied to a manually created GitHub release and covered only `core` and `tester`, so
`web-framework` and `web-content` were published by hand — and drifted: `web-content` sat at `0.2.0` locally against
`0.1.1` on the registry. The trigger is now the merge itself, and what to publish is derived from the registry rather
than from a person remembering to cut a release.

* feat(ci): publish `core`, `web-framework`, `web-content` and `tester` on merge into `master`. The plan is a
  comparison of each package's declared version against the npm registry, so a merge that bumps nothing publishes
  nothing, a merge that bumps several publishes each of them in dependency order, and a re-run after a partial failure
  skips whatever already landed. The registry is used rather than a `git diff` of the merge commit because a cancelled
  run, a hand-published version, or two bumps landing at once all leave the registry correct where the diff would not
* feat(ci): authenticate to npm with trusted publishing (OIDC) instead of the `NPM_TOKEN` secret — no long-lived
  credential in the repository, and provenance attestations are attached automatically. Requires a one-time trusted
  publisher per package on npmjs.com keyed to the `npm-publish.yml` filename
* feat(ci): tag each published version `<package>-v<version>` and open a GitHub release carrying that version's
  `CHANGELOG.md` section, matching the `competence-v*` tag convention `cd.yml` already keys on
* feat(ci): add `.github/scripts/npm-publish-plan.js` (registry diff, publishable-package allowlist, job-summary
  table) and `.github/scripts/changelog-section.js` (locates a version's section by heading, since the changelogs in
  this repository are not consistently ordered — `core` lists newest first, `web-content` oldest first)
* refactor(ci)!: the release-triggered publish is gone. `core` no longer has two publish paths that would race to a
  `403` on the second, and publishing a version is now a `version` bump rather than a GitHub release
* fix(ci): Dependabot was scanning `/core` and `/tester` — paths from before everything moved under `packages/` — so
  two of its three configured directories had never matched anything and no package's dependencies were being
  watched. It now covers `/` and the `/packages/*` glob, which also picks up a new package without another edit here
* feat(ci): group Dependabot's minor and patch updates so five daily-scanned manifests do not become five times the
  pull requests, leaving majors to arrive on their own; add the `github-actions` ecosystem, since the workflows pin
  their actions to major tags and nothing was watching those
* build(release): bump package version from `1.2.4` to `1.2.5`

## Version 1.2.4

* build(deps): update `@eslint/js` from ^9.39.1 to ^10.0.1
* build(deps): update `@eslint/json` from ^0.14.0 to ^1.0.0
* build(deps): update eslint from ^9.39.1 to ^10.0.0
* build(deps): update globals from ^17.2.0 to ^17.3.0
* build(deps): update prettier from ^3.6.2 to ^3.8.1
* build(engines): update Node.js requirement from >=18.0.0 to >=20.0.0
