# ti-engine tester package changelog

This document contains the list of changes made to the tester package. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.3.3

* build(engines): update Node.js requirement from >=18.0.0 to >=20.0.0
* fix(tester): declare `repository`, `bugs` and `homepage`, which this package alone among the four published ones was
  missing. Publishing through OIDC attaches a provenance attestation naming the repository the tarball was built from,
  and the registry rejects the upload unless `repository.url` agrees with it — so the publish failed with a `422` and
  an empty `repository.url` against the expected `https://github.com/Belleal/ti-engine`. The metadata now matches the
  other packages, `directory` included, so the package page also links back to its own subdirectory
