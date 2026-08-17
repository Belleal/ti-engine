# ti-engine tester package changelog

This document contains the list of changes made to the tester package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.3.5

License change only — no functional code changed.

* chore(license): relicense package from `GPL-3.0-or-later` to `Apache-2.0`. See `LICENSE` and `NOTICE`
* docs(license): update the source file's license header to the Apache-2.0 notice

## Version 1.3.4

Packaging metadata only — no code changed. This package is the framework's runnable reference service, and its npm entry did not say so.

* fix(package): replace the description, which was the generic monorepo blurb shared verbatim with `core`, with one that says what this package actually is. It is the line npm shows in search results
* feat(package): declare `keywords`, which the package had none of
* fix(package): declare `files`. The published tarball was already correct — eight files, and the tracked `.env` was never included — but only because npm's defaults happened to agree. Anything dropped into the package directory would have shipped; now the contents are opt-in

## Version 1.3.3

* build(engines): update Node.js requirement from >=18.0.0 to >=20.0.0
* fix(tester): declare `repository`, `bugs` and `homepage`, which this package alone among the four published ones was
  missing. Publishing through OIDC attaches a provenance attestation naming the repository the tarball was built from,
  and the registry rejects the upload unless `repository.url` agrees with it — so the publish failed with a `422` and
  an empty `repository.url` against the expected `https://github.com/Belleal/ti-engine`. The metadata now matches the
  other packages, `directory` included, so the package page also links back to its own subdirectory
