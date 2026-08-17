# Contributing to ti-engine

Thanks for considering a contribution.

## Licensing at a glance

This repository is not under one single license — see [`LICENSE.md`](LICENSE.md) for the full breakdown:

- `core`, `web-framework`, `web-content`, and `tester` are **Apache-2.0**.
- `competence` is **AGPL-3.0-or-later**, with a separate commercial license available from the Maintainer.

When you add a new source file, copy the license header from an existing file **in the same package** — the
header text differs between the Apache-2.0 packages and `competence`.

## Contributor License Agreement (CLA)

Before a pull request can be merged, you'll be asked to sign the project's [CLA](CLA.md). This is a one-time step
handled automatically by a bot comment on your first pull request. It doesn't take away your rights to your own
contribution — it lets the Maintainer keep offering `competence` under both an open license and a paid commercial
license using the same codebase, and keeps the project able to update its open-source license terms in the future
without having to individually track down and re-clear every past contributor.

If you're not comfortable signing the CLA, you're still welcome to open issues, discuss designs, and report bugs —
just PRs with code changes need a signature.

## Making a change

1. Fork the repository and create a branch off `master`.
2. Keep changes scoped to one package where possible; cross-package changes are fine when the change genuinely
   spans packages.
3. Follow the existing code style (see `eslint.config.mjs` and `webstorm-js-code-style.xml`).
4. Add or update tests for behavior you change.
5. Update the relevant package's `CHANGELOG.md` with a version bump if your change should be released — see the
   "Releasing to npm" section of the root `README.md`.
6. Open a pull request describing the change and why it's needed.

## Code of Conduct

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
