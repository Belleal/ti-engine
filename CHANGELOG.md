# ti-engine repository changelog

This document contains the list of changes made to the ti-engine monorepo. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.2.9

* feat(ci): add `npm run check:types` and run it in CI. It rebuilds the published declarations and fails on stale
  committed output, then type-checks both the declarations and a generated consumer that imports all 37 public
  subpaths — everything with `skipLibCheck: false`, which is TypeScript's default and the setting under which a
  consumer actually reads them. The declarations are checked one package at a time, because a parse error anywhere in
  a program suppresses the whole semantic pass: measured together, three packages carrying 251 errors reported 7
* build(deps-dev): add `typescript` at the workspace root for the declaration build
* build(release): bump package version from `1.2.8` to `1.2.9`

## Version 1.2.8

* fix(ci): restrict the CI workflow's `GITHUB_TOKEN` to `contents: read`. Nothing in it writes — it lints, tests and builds an image without pushing — but `npm install` runs dependency lifecycle scripts, and those had the repository's default token permissions available to them (CodeRabbit, #117)
* build(release): bump package version from `1.2.7` to `1.2.8`

## Version 1.2.7

* build(deps-dev): update `@eslint/json` from ^1.0.0 to ^2.0.1. Lint-only and confined to the workspace root — no package ships it, and `eslint .` reports the same 25 pre-existing warnings and no errors on the major
* docs(skill): re-sync the repository skill — the root and `core` versions it quoted were a release behind, and it described no publishing process at all now that one exists
* docs(competence): correct the version targets in `INSTALL.md`, which still named `web-framework` `1.18.1` and `core` `1.7.1`, and note that `core` 1.8.0's new Redis 6.0 floor is already covered by that guide's stricter Redis Stack / Redis 8+ requirement. Documentation only — no competence code changed, so its version is untouched rather than minting a container image tag for a prose fix

## Version 1.2.6

The Dependabot change in 1.2.5 rested on a wrong reading and made things worse. Its claim that no package's
dependencies were being watched was false: with npm workspaces Dependabot already traverses every workspace manifest
from the root, so the long-standing `/` entry had always covered `packages/*/package.json` — pull request #109 bumped
`ioredis` inside `packages/core` from that entry alone. The `/core` and `/tester` entries really were dead paths from
before the move to `packages/`, but they were harmless noise rather than a gap. Adding `/packages/*` alongside the
root is what turned one bump into two identical pull requests (#109 and #111).

* fix(ci): scan from the workspace root only. The root entry reaches every workspace manifest on its own, so listing
  the packages as well produced a duplicate pull request for every dependency the root and a package share
* feat(ci): point Dependabot's version updates at `current` rather than `master`, so dependency bumps flow through the
  usual release pull request instead of pushing the release branch ahead of the development branch and forcing a
  back-merge per bump. Security updates are unaffected — they always target the default branch, which is where an
  advisory-driven fix belongs anyway
* build(release): bump package version from `1.2.5` to `1.2.6`

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
* feat(ci): treat a release as finished only when the version is on the registry **and** carries its tag. Publishing
  and tagging are two systems and only the npm half is irreversible, so a run that published and then failed before
  tagging would previously leave the package permanently untagged — every later run saw it on the registry and skipped
  it. The plan is now computed from both, so the next run finishes what the last one started and still publishes
  nothing twice
* build(ci)!: pin every action in every workflow to a full commit SHA with the version as a trailing comment. A
  version tag is mutable, and `npm-publish.yml` runs actions in a job holding `id-token: write` and `contents: write`.
  Dependabot's new `github-actions` ecosystem keeps the pins current
* feat(ci): add `.github/scripts/npm-publish-plan.js` (registry diff, publishable-package allowlist, job-summary
  table) and `.github/scripts/changelog-section.js` (locates a version's section by heading, since the changelogs in
  this repository are not consistently ordered — `core` lists newest first, `web-content` oldest first)
* feat(ci): a version bump without a matching `## Version X.Y.Z` changelog section fails the run before anything is
  published. The release notes are built from that section, and the plan job is the last point at which failing is
  free — after `npm publish` the version is permanent, so the release step there falls back to a pointer at the
  changelog rather than abandoning the tag over an authoring gap
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
