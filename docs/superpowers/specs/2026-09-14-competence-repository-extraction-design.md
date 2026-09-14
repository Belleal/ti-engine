# Extracting competence into its own repository — design record

**Issue:** CA-120 · **Packages:** competence (leaves), web-framework (one export decision), repo root
**Status:** Designed, approved 2026-09-14
**Builds on:** CA-90 (containerization + CI/CD), CA-94 (Cloud Run test environment), and the npm
trusted-publishing pipeline in `.github/workflows/npm-publish.yml`.

---

## 1. What this does

`competence` moves to its own repository, **`Belleal/competence`**. `Belleal/ti-engine` keeps only the four
packages it publishes to npm — `core`, `web-framework`, `web-content`, `tester` — and becomes what its README
already claims it is: a framework distribution, not a framework plus one large private application.

The extracted app consumes the framework the way any other consumer would: `@ti-engine/core` and
`@ti-engine/web-framework` as ordinary npm dependencies at pinned semver ranges.

## 2. Why this is a packaging move and not an untangling

The dependency direction is already correct, and has been for some time. Three facts establish it:

**competence reaches into the framework only through published `exports` subpaths.** Every `@ti-engine/*`
specifier in the package resolves through a declared entry point:

```
@ti-engine/core/{exceptions,cache,logger,tools,localization,service-consumer}
@ti-engine/web-framework/{config-management,web-application,web-server,authorization,config-drift}
```

**Nothing in the framework packages depends on competence.** Every occurrence of the string in `core`,
`web-framework`, `web-content` and `tester` is a comment explaining *why* a framework behaviour exists, or a
test fixture using competence-shaped data (`application-info.test.js`, `config-service.drift.test.js`). None
is a require, a path, or a runtime assumption.

**All four framework packages are already published at the versions in this tree**, so the extracted app has
something real to install on day one:

| Package | In tree | npm `latest` |
|---|---|---|
| `@ti-engine/core` | 1.11.1 | 1.11.1 |
| `@ti-engine/web-framework` | 1.32.0 | 1.32.0 |
| `@ti-engine/web-content` | 0.3.1 | 0.3.1 |
| `@ti-engine/tester` | 1.3.5 | 1.3.5 |

That is the whole reason this is tractable now rather than a month of API extraction: the seam already exists
and is already load-bearing.

## 3. Non-goals

- Changing any application behaviour. A user of the deployed app must not be able to tell this happened.
- Publishing `competence` to npm. It remains an application shipped as a container image.
- Renaming the package. It stays `@ti-engine/competence` — see §4.
- Renaming the container image. `ghcr.io/belleal/ti-engine-competence` stays, because every documented
  `docker pull` in `INSTALL.md` names it.
- Splitting `web-content` out as well. It is published, permissively licensed, and belongs where it is.
- Reorganising competence's internals. The package moves to the new repository root as-is.

## 4. Current state that constrains the design

| Fact | Consequence |
|---|---|
| `web-framework`'s `exports` map lists six subpaths, and an `exports` map blocks everything unlisted | The one test that deep-requires framework internals cannot survive the move unchanged (§5) |
| `application-info.js` derives the application's display name from the **leading npm scope** of the package name, and `application-info.test.js` pins `@ti-engine/competence` → `competence` | The package name is not cosmetic. Renaming it to bare `competence` changes what the About screen shows. It stays scoped |
| competence declares `"@ti-engine/core": "*"` and `"@ti-engine/web-framework": "*"` | Workspace wildcards. Outside a workspace they would resolve to whatever npm's `latest` is at install time — they must become real ranges |
| The `start` script is `node ../../node_modules/@ti-engine/core/bin/start-instance.js` | Two levels of workspace hoisting baked into a path |
| The Dockerfile copies four workspace manifests, installs with `--ignore-scripts`, then runs `npm run postinstall -w @ti-engine/web-framework` by hand | All of that exists *because* of the workspace. Outside it the build gets shorter, not longer (§7.2) |
| `package-lock.json` is gitignored repo-wide, and both the Dockerfile and CI comment on working around its absence | Defensible for a library monorepo publishing to npm; wrong for an application shipping a container image (§7.3) |
| `bootstrap.sh` binds Workload Identity Federation to `assertion.repository=='Belleal/ti-engine'` and to `refs/tags/competence-v*` | CD authenticates to Google as the repository. After the move it is a different repository and authentication fails (§8.1) |
| `ci.yml`'s `docker-build` job builds the competence image | It is the only CI job proving the framework composes into a running application (§9.2) |
| `.gitattributes` forces LF on `Dockerfile` and `*.sh`, and marks `*.xlsx` binary, because the repo runs `core.autocrlf=true` | A new repository without this file will silently corrupt the competency spreadsheets and can bake a stray CR into a Dockerfile `ENV` value |
| `LICENSE.md` documents a per-package split: Apache-2.0 × 4, AGPL-3.0-or-later for competence | The split removes the only AGPL package, so ti-engine becomes uniformly permissive (§9.3) |

## 5. The two code couplings

Only two files in the repository actually cross the seam. Both are outside the application's runtime path,
which is why this has stayed invisible.

### 5.1 `test/config-drift-reporting.test.js`

```js
require( "../../web-framework/components/config-store" )
require( "../../web-framework/components/config-registry" )
require( "../../web-framework/components/config-change-notifier" )
```

Three relative paths out of the package and into a sibling's internals. None of the three is in
`web-framework`'s `exports` map, so once the framework is installed from npm these cannot resolve at all.

**Resolved with no framework change at all**, which the first draft of this record did not anticipate. The
test now composes the stack the way the application composes it: a `TiWebAppManager` subclass — the seam
`registerCompetenceConfig` is written against — registers into the `ConfigRegistry` singleton, and
`ConfigService` reads that same singleton. Both `./web-application` and `./config-management` are published.

That is also a better test than what it replaces: it exercises the wiring the app actually runs, rather than a
composition unique to one file.

Two alternatives were considered and rejected:

- **Add the three internals to `web-framework`'s `exports`.** Cheaper, and it works, but a package's exports
  map is the one thing consumers are entitled to treat as stable, and three modules would have become
  permanent public API for one test's convenience.
- **Add a `registerDocument` method to `ConfigService`.** Tempting, because the published facade has a real
  asymmetry — `registerEditor` is public on `ConfigService`, but document registration exists only on
  `TiWebAppManager`, which reaches `configRegistry.instance` directly and bypasses the service entirely. A
  consumer holding only `config-management` therefore cannot complete a registration. That is worth fixing on
  its own merits one day; it is not worth fixing *because a test needs it*, and going through
  `TiWebAppManager` removed the need.

**Follow-up, not solved here:** the `registerEditor` / no-`registerDocument` asymmetry on the published
`config-management` facade.

This is fixed **in ti-engine first**, as its own pull request, before any extraction. It is a change to a test
in the package being moved; landing it separately keeps it reviewable as what it is rather than burying it in
a 200-file move.

### 5.2 `docs/superpowers/preview/build-preview.js`

The Insights preview builder reads CSS and `ti-charts.js` from `packages/web-framework/...` and
`competence-main.css` from `packages/competence/...`, both by relative path from the repo root. It travels with
competence and its framework reads become `node_modules/@ti-engine/web-framework/...`.

## 6. What moves, what stays, what is duplicated

### 6.1 Code and configuration

**Moves:** `packages/competence/**` (216 tracked files), plus the four root files that are competence's in all
but location — `docker-compose.yml` (it builds `packages/competence/Dockerfile`), `.dockerignore`,
`.env.example` (headed *"competence — environment template"*), and `.github/workflows/cd.yml` (entirely the
competence image pipeline). From `.claude/`: `competence-design-concept/`, the three competency `.xlsx`
workbooks, and `commands/competence-framework-refactor.md`.

**Stays:** the four packages, `npm-publish.yml`, `codeql-analysis.yml`, `cla.yml`, `ci.yml` (trimmed, §9.2),
`.types-check/` (which has tsconfigs for core, web-framework and web-content and never had one for
competence), `eslint.config.mjs`, `.coderabbit.yaml`.

**Copied, not moved:** `.gitattributes`, `CONTRIBUTING.md`, `CLA.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
`.devcontainer/`. Each is repository-level governance or tooling that both repositories need. The CLA matters
most: `cla.yml` is per-repository, so without its own copy the new repository accepts contributions ungated.

### 6.2 Design records — the duplication rule

35 design documents (12 specs, 23 plans) live under `docs/superpowers/`. Classifying them by hand invites
argument, so the rule is mechanical:

> **ti-engine keeps every document that references a framework package. The competence repository gets a copy
> of every document that references competence.** A document that references both is copied to both.

Counted against the tree that is **24 kept, 32 copied, 21 of them in both places**. The overlap is not
accidental duplication — it is the honest shape of the history. `config-drift-reconciliation` is
simultaneously the record of web-framework 1.24.0 and of competence 3.20.0; the Insights chart-primitive plans
are simultaneously `ti-charts.js` and the screens that drove it. Neither repository can tell that story alone,
and a copy costs bytes.

A duplicated record is frozen history in both places. Neither copy is edited again; new records are written in
whichever repository owns the change.

## 7. The new repository

### 7.1 Manifest

```
"@ti-engine/core":          "*"  →  "^1.11.1"
"@ti-engine/web-framework": "*"  →  "^1.32.0"
"start": "node ../../node_modules/@ti-engine/core/bin/start-instance.js"
      →  "node node_modules/@ti-engine/core/bin/start-instance.js"
```

Caret ranges rather than exact pins: the framework is the maintainer's own, released from the adjacent
repository, and a patch arriving without a competence commit is the desired behaviour. The lockfile (§7.3) is
what makes any individual build reproducible.

Name, `imports` map (25 `#alias` entries, all package-internal), `files`, license and engines are untouched.

### 7.2 The Dockerfile gets shorter

The current build copies four workspace manifests, installs with `--ignore-scripts` because web-framework's
`postinstall` needs source that is not there yet, copies three package source trees, then runs that postinstall
by hand. Every one of those steps is workspace choreography.

Outside the workspace it is a normal application build: copy `package.json` + `package-lock.json`, `npm ci
--omit=dev` — which runs the framework's `postinstall` in the ordinary way — then copy the source. The
`HEALTHCHECK` and `CMD` paths (`/app/node_modules/@ti-engine/{web-framework,core}/...`) are already
node_modules paths and keep working; only the `WORKDIR` drops its `packages/competence` suffix.

### 7.3 The lockfile is committed

ti-engine gitignores `package-lock.json`, and the Dockerfile and CI both carry comments explaining how they
work around it. That trade is reasonable for a monorepo whose output is npm packages resolved afresh by each
consumer. It is the wrong trade for an application whose output is a container image: an unpinned transitive
dependency means the image built from a release tag is not the image built from that tag yesterday.

The new repository commits the lockfile and `npm ci` replaces `npm install` in the image build and in CI.

## 8. Infrastructure bound to the repository name

This is the part that does not move by copying files, and the part most likely to be discovered late.

### 8.1 Google Workload Identity Federation

`deploy/gcp/bootstrap.sh` creates a provider whose attribute condition is

```
assertion.repository=='Belleal/ti-engine' &&
  ( assertion.ref=='refs/heads/master' || assertion.ref.startsWith('refs/tags/competence-v') )
```

and an IAM binding on `attribute.repository/Belleal/ti-engine`. Both are identity assertions about *this*
repository. After the move, CD presents a token from `Belleal/competence`, fails the condition, and the run
dies at authentication having already built and possibly pushed to GHCR — a release tag with half its images.

Both the condition and the binding must be updated before the first CD run from the new repository, and the
ref clause changes with the tag convention (`competence-v*` → `v*`). `bootstrap.sh` is idempotent and supports
`DRY_RUN=1`; the change is to its defaults plus one re-run.

### 8.2 GHCR

The image name stays. GHCR packages are owned by the account rather than by a repository, so the existing
package is re-linked to the new repository and every documented `docker pull` keeps working. What changes is
which repository's `GITHUB_TOKEN` may push to it — a package setting, not a rename.

### 8.3 YouTrack

Project `CA` is linked to `Belleal/ti-engine`. Commits carrying `(CA-###)` from the new repository will not
associate until it is linked as well. Both repositories stay linked: the framework side keeps producing `CA`
work too.

### 8.4 Everything else that is per-repository

CodeQL, Debricked, CodeRabbit, Dependabot, branch protection and required status checks all configure per
repository and need standing up on the new one. Dependabot in particular: ti-engine's root-level config reaches
every package through npm workspaces, which the new repository does not have.

**npm trusted publishing is deliberately untouched.** Each published package's trusted publisher is keyed to
the workflow *filename* in this repository. `npm-publish.yml` does not move, is not renamed, and its job matrix
is unchanged — competence was never in it.

## 9. ti-engine after the split

### 9.1 Root cleanup

`docker-compose.yml`, `.dockerignore`, `.env.example` and `cd.yml` leave. `ci.yml` loses the
`npm run test:json -w @ti-engine/competence` step. The root `README.md` loses its competence paragraph, and
`.gitignore` its competence-specific entries.

### 9.2 `tester` becomes the container-build target

Removing the `docker-build` job would remove the only automated evidence that the framework composes into a
bootable application — precisely the regression class a framework repository cannot detect from unit tests.
`tester` is already a working `ServiceProvider` with a service registry, and gains a small Dockerfile so the
job keeps running against something the repository still owns.

This is a genuine reduction in signal and worth naming: `tester` exercises `core` only, so the job stops
covering the web tier. Recovering that would mean a minimal web-framework smoke app, which is more than this
work should take on. Recorded as a follow-up, not solved here.

### 9.3 Licensing simplifies

`competence` is the only AGPL-3.0-or-later package. With it gone, `LICENSE.md`'s table collapses to a single
statement: everything in ti-engine is Apache-2.0. For a framework whose whole pitch is embeddability, removing
a copyleft package from the repository people clone is a real improvement, and the dual-licensing note moves to
the competence repository where the AGPL actually applies.

### 9.4 The skill splits

`.claude/skills/ti-engine/SKILL.md` documents both the framework and the application in one file. It splits:
the framework half stays, the competence half becomes the new repository's own skill. Each then describes a
repository a reader can actually check out.

## 10. Risk, and the ordering that contains it

The failure mode is a partial move: competence deleted from ti-engine, the new repository not yet able to
build or deploy, and the deployed application unreleasable until someone reconstructs the missing half.

The ordering exists to make that impossible:

1. Fix the test coupling in ti-engine (§5.1). Normal PR, merges to master.
2. Extract into the new repository **with history preserved**.
3. Rewire: manifest, Dockerfile, CI/CD, lockfile, docs, skill.
4. **Prove it.** Full test suite green, image builds, `DRY_RUN=1 ./deploy.sh` clean, container boots and
   serves `/health`.
5. Only then remove competence from ti-engine and slim the root.
6. Re-point WIF, GHCR, YouTrack, branch protection.

Between steps 2 and 5 the application exists in both repositories. That is the point: ti-engine remains the
working fallback until the replacement is proven, and the cost is a short window in which a competence commit
would have to be made twice — mitigated by not making one.

**History preservation** uses `git filter-repo` against a full (non-shallow) clone, keeping every commit that
touched `packages/competence/**` with paths rewritten to the new root. The CHANGELOG reaches back to 1.x and
the design records cite commit hashes; a single squashed import would break both.

## 11. Proof gates

The new repository is not accepted until all of these pass:

| Gate | Check |
|---|---|
| Resolution | `npm ci` from a clean checkout with no workspace present |
| Entry point | `node -e "require.resolve('@ti-engine/core/bin/start-instance.js')"` |
| Tests | The full competence suite, at the count it has in the monorepo today |
| Lint | `npx eslint .` with no new errors |
| Image | `docker build .` succeeds; container boots, `/health` returns `200` |
| Deploy | `DRY_RUN=1 ./deploy.sh` emits the expected commands |
| History | `git log --follow` on a moved file reaches its original commit |

And in ti-engine after removal: full suite green, `npm run check:types` reporting no drift, `docker-build`
green against `tester`, and no dangling reference to `packages/competence` anywhere in the tree.

## 12. Delivery

Two repositories, and the commits are not interchangeable. In ti-engine: the test fix first (its own PR), then
the removal PR once the new repository is proven. In the competence repository: the history import, then the
rewiring, then the proof.

Every commit in both repositories carries `(CA-120)`. Versions: competence's own version does **not** reset —
it continues from 3.36.1, because the application is the same application and its CHANGELOG is continuous.
web-framework moves only if §5.1's rejected option is revisited.
