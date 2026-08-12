# ti-engine

![Logo](https://raw.githubusercontent.com/Belleal/ti-engine/master/packages/core/docs/ti-engine-icon.ico)

Flexible framework for the creation of microservices with [node.js](https://nodejs.org/).

## Introduction

The **ti-engine** is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using **node.js**.
The architectural concept of the framework is based on a standard _messaging system_ that allows for certain customization but also provides predictability and traceability of its behavior.

## Why ti-engine?

The framework is created based on a decade of professional experience with the utilized technologies and architectural approach. Its primary goal is to provide you with a lightweight and flexible solution that can help you quickly build a microservice ecosystem with any degree of size and complexity.

This is what you gain by using **ti-engine** in your project:

* **Simplicity**: Begin productive work within minutes and get to codding your business logic
* **Flexibility**: Go as complex as you need to in your implementation
* **Reliability**: Message exchange between the services is constantly tracked across the entire ecosystem
* **Security**: Messages are encrypted in transit and cannot be modified by external agents
* **Scalability**: Serve mullions of requests by multiplying stateless service instances (hardware limitations still apply)
* **Containerization**: Go with containers from the very start as the framework is designed to work in such an environment

These are just some benefits **ti-engine** offers. Get to know it better to find out more ways in which it can help you improve productivity.

For more information and getting started guide, please read the documentation of the individual packages:

* [ti-engine/core](https://github.com/Belleal/ti-engine/tree/master/packages/core): This is the framework itself, and there you can find the main documentation.
* [ti-engine/tester](https://github.com/Belleal/ti-engine/tree/master/packages/tester): This is a sample tester microservice build with the framework.

## Releasing to npm

`core`, `web-framework`, `web-content` and `tester` are published automatically by the
[`npm-publish.yml`](.github/workflows/npm-publish.yml) workflow on every push to `master`, which in normal use means
every merged pull request. It can also be run by hand from the Actions tab (`workflow_dispatch`), which is the retry
path if a run fails part-way. Releasing a package is therefore just the two edits it always was:

1. bump `version` in that package's `package.json`;
2. add the matching `## Version X.Y.Z` section to its `CHANGELOG.md`.

On merge the workflow compares each package's declared version against the registry and publishes only the ones that
are actually new — a merge that bumps nothing publishes nothing, and a merge that bumps three packages publishes all
three, in dependency order. Each published version also gets a `<package>-v<version>` git tag and a GitHub release
whose body is that changelog section. `competence` is deliberately excluded: it is the application, and it ships as a
container image through `cd.yml`.

A release counts as finished only once the version is on the registry *and* carries its tag, so a run that published
but failed before tagging is picked up and completed by the next one rather than left half-released — a re-run
publishes nothing twice. A version bump with no matching changelog section fails the run **before** anything is
published, since the release notes are built from that section.

Publishing authenticates with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) over OIDC rather
than a token, so there is no npm secret in this repository and every release carries a provenance attestation. Each
package needs its trusted publisher configured once on npmjs.com, under *Settings → Trusted Publisher → GitHub
Actions*: organization `Belleal`, repository `ti-engine`, workflow filename `npm-publish.yml`, no environment.
**Renaming the workflow file breaks publishing** until those entries are updated to match, and a brand-new package
has to be published by hand once before a trusted publisher can be added for it.
