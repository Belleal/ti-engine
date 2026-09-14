# Competence Repository Extraction — Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are ordered by dependency, not convenience:
> **nothing is deleted from ti-engine until Task 8's gates all pass.**

**Goal:** Move `competence` into `Belleal/competence` with its history intact, leaving `Belleal/ti-engine`
holding only the four packages it publishes to npm.

**Architecture:** The extracted application consumes `@ti-engine/core` and `@ti-engine/web-framework` from npm
at caret ranges instead of through npm workspaces. No application code changes; one test is rewritten off a
deep import, and the docs preview builder's framework paths move into `node_modules`.

**Tech Stack:** Node.js ≥20.19 CommonJS, `node --test`, Docker/BuildKit, GitHub Actions, GHCR + Google
Artifact Registry, Cloud Run.

**Spec:** `docs/superpowers/specs/2026-09-14-competence-repository-extraction-design.md`
**Issue:** CA-120 · **Branch (ti-engine):** `claude/eloquent-davinci-1z088q`, off `master`

## Status (2026-09-14)

Phases A and B are done; Phase C has not started. Nothing is deleted from ti-engine.

- **Phase A** merged as PR #146.
- **Phase B** is `Belleal/competence` PR #1 — 645 commits, 297 files, full history. `npm ci` clean,
  **1058/1058 tests across 211 suites** (identical to the monorepo), lint 0 errors.
- **Task 8's image gates are open**: the environment this ran in has the docker binary but no usable daemon, and
  `deploy.sh` needs `gcloud`. `docker build` runs in that PR's own CI instead.

The extraction found four couplings and two undeclared dependencies beyond the one the spec originally named;
§5 of the design record is corrected, and its §11 gate table gained the two checks that would have caught them.

## Global Constraints

- **Every commit message ends with `(CA-120)`.** Conventional Commits, scoped `competence`, `web-framework`,
  `ci`, `build` or `docs` as appropriate.
- **Commit as the maintainer.** `user.name "Boris Kostadinov"`, `user.email "kostadinov.boris@gmail.com"` —
  `cla.yml` fails a PR whose commit author is not on the allowlist. Keep the `Co-Authored-By` /
  `Claude-Session` trailers.
- **Never `git add` any `.run/*.run.xml`** — git-tracked but carrying live local credentials.
- **`.gitattributes` must exist in the new repository before the first checkout on Windows.** `core.autocrlf=true`
  plus no `.gitattributes` corrupts the three competency `.xlsx` workbooks irrecoverably and can bake a stray
  CR into a Dockerfile `ENV` value.
- **AGPL header on every `.js` file in the competence repository**, Apache-2.0 in ti-engine. The files carry
  the right headers today; do not normalise them across the boundary.
- **Do not rename the package, the container image, or `npm-publish.yml`.** Each is load-bearing: the package
  name feeds the About screen, the image name is in every documented `docker pull`, and the workflow filename
  is the key npm trusted publishing is bound to.
- **The competence version does not reset.** It continues from 3.36.1.
- **Two repositories, two clones.** ti-engine is at `/home/user/ti-engine` (currently **shallow** — a full
  clone is required before Task 4). The new repository is at `/home/user/competence`.

---

## Phase A — Prepare in ti-engine

### Task 1: Rewrite the deep-import test

`packages/competence/test/config-drift-reporting.test.js` requires three web-framework internals by relative
path. None is in web-framework's `exports` map, so the test cannot resolve them once the framework is a
node_modules dependency.

- [ ] Read the test and identify what the three internals provide (fixture assembly, not the subject).
- [ ] Rewrite against `@ti-engine/web-framework/config-management`, which is what the test actually exercises.
- [ ] Confirm the rewritten test **fails** against a deliberately broken drift report — a test that passes
      either way pins nothing.
- [ ] `npm test -w @ti-engine/competence` green at its current count.
- [ ] Verify no other file in the package escapes it:
      `grep -rnE 'require\(\s*"(\.\./){2,}' packages/competence` returns nothing.
- [ ] Commit: `test(competence): drive config-drift reporting through the public facade (CA-120)`.

### Task 2: Land Task 1

- [ ] Push, open a PR against `master`, let CI run.
- [ ] Merge once green. **This must be on `master` before Task 4** — the history import should carry the
      fixed test, not the broken one.

---

## Phase B — Create the new repository

### Task 3: Full clone of ti-engine

- [ ] `git clone https://github.com/Belleal/ti-engine /tmp/ti-engine-full` (no `--depth`). The working clone
      is shallow and `git filter-repo` refuses to rewrite shallow history.
- [ ] Verify: `git -C /tmp/ti-engine-full rev-list --count HEAD` returns substantially more than 367.

### Task 4: Extract with history

- [ ] Install `git-filter-repo` (not present in this environment): `pip install git-filter-repo`.
- [ ] From a copy of the full clone, rewrite to competence only, paths lifted to the root:
      `git filter-repo --path packages/competence/ --path-rename packages/competence/:`
- [ ] Bring the four root files across as their own commit rather than through the filter — they were never
      under `packages/competence/`, so a path filter cannot see them: `docker-compose.yml`, `.dockerignore`,
      `.env.example`, `.github/workflows/cd.yml`.
- [ ] Copy in `.gitattributes`, `CONTRIBUTING.md`, `CLA.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
      `.devcontainer/`, and the `.claude/` competence assets (`competence-design-concept/`, the three `.xlsx`
      workbooks, `commands/competence-framework-refactor.md`).
- [ ] Copy the design records per §6.2's rule — every document referencing competence (32 of 35), under the
      same `docs/superpowers/{specs,plans}/` layout.
- [ ] Verify history survived: `git log --follow application/competence-framework.js | tail -5` reaches a 2021-era
      commit, and `git log --oneline | wc -l` is in the expected range.
- [ ] Push to `Belleal/competence` on a branch — **not** `main` directly; `main` currently holds the
      placeholder `first commit` (`fd8c6ce`) and the import supersedes it.

### Task 5: Rewire the manifest and entry points

- [ ] `package.json`: `"@ti-engine/core": "^1.11.1"`, `"@ti-engine/web-framework": "^1.32.0"`.
- [ ] `start` script → `node node_modules/@ti-engine/core/bin/start-instance.js`.
- [ ] `npm install`, then **commit `package-lock.json`** (the new repository does not inherit ti-engine's
      lockfile ignore — check `.gitignore` explicitly).
- [ ] `docs/superpowers/preview/build-preview.js`: its `WF` path becomes
      `node_modules/@ti-engine/web-framework/bin/static/scripts`, its `CO` path the repository root.
- [ ] Gate: `npm ci` from a clean checkout, then `node -e "require.resolve('@ti-engine/core')"`.
      **Not** `require.resolve( '@ti-engine/core/bin/start-instance.js' )` — that subpath is not in core's
      `exports` map, so it throws `ERR_PACKAGE_PATH_NOT_EXPORTED` even on a correct install. (The command
      was inherited from the CA-90 docker plan and had evidently never been run.) The `start` script and the
      Dockerfile `CMD` both address that file as a filesystem **path**, which Node does not route through
      `exports` — so they work, and what is worth checking is that the file exists and that `.` resolves to it.
- [ ] Gate: full test suite green at the monorepo count; `npx eslint .` with no new errors.

### Task 6: Rewire the container build

- [ ] `Dockerfile`: drop the workspace choreography. Copy `package.json` + `package-lock.json`, `npm ci
      --omit=dev` (web-framework's `postinstall` now runs normally — no `--ignore-scripts` + manual
      `npm run postinstall -w`), then copy source. `WORKDIR` loses its `packages/competence` suffix.
- [ ] Keep `HEALTHCHECK` and `CMD` as they are — both already address `/app/node_modules/@ti-engine/...`.
- [ ] `docker-compose.yml`: `context: .`, `dockerfile: Dockerfile`.
- [ ] `.dockerignore`: drop the `packages/` prefixes.
- [ ] Gate: `docker build .` succeeds; `docker compose up` boots and `curl localhost:3000/health` returns
      `200` with `{"status":"ok"}`.

### Task 7: Rewire CI/CD

- [ ] Port `ci.yml` from ti-engine, reduced to this repository: install, lint, `npm test`, `npm run test:json`,
      docker build. Drop `check:types` (no published declarations here).
- [ ] `cd.yml`: tag convention `competence-v*` → `v*`, everywhere it appears including the dispatch validation
      and the error messages naming `packages/competence/INSTALL.md`.
- [ ] Add `codeql-analysis.yml`, `cla.yml` and a Dependabot config — all per-repository, none inherited.
- [ ] Paths: every workflow reference to `packages/competence/...` loses the prefix.
- [ ] Gate: push the branch and let CI run green before merging it to `main`.

### Task 8: Prove it end to end

Nothing in Phase C starts until every one of these passes:

- [ ] `npm ci` clean, full suite green, lint clean.
- [ ] Image builds; container boots; `/health` returns `200`.
- [ ] `DRY_RUN=1 ./deploy/gcp/deploy.sh` emits the expected commands with no error.
- [ ] `git log --follow` on a moved file reaches its original commit.
- [ ] CI green on the new repository.

---

## Phase C — Remove from ti-engine

### Task 9: Delete and slim

- [ ] `git rm -r packages/competence`, plus `docker-compose.yml`, `.dockerignore`, `.env.example`,
      `.github/workflows/cd.yml`, and the `.claude/` competence assets.
- [ ] `ci.yml`: drop the `npm run test:json -w @ti-engine/competence` step; repoint `docker-build` at `tester`.
- [ ] `packages/tester/Dockerfile`: a minimal image for that job. `tester` exercises `core` only — the job
      stops covering the web tier, which is a real reduction in signal and is recorded as a follow-up, not
      solved here.
- [ ] Design records: delete the 10 that reference only competence; keep the 21 shared ones (now duplicated in
      both repositories) and the 3 framework-only ones. `docs/superpowers/preview/` goes with competence.
- [ ] `LICENSE.md`: remove the AGPL row; collapse the table to a single Apache-2.0 statement and move the
      dual-licensing note to the competence repository.
- [ ] Root `README.md`: remove the competence paragraph. `.gitignore`: remove competence-specific entries.
- [ ] `.claude/skills/ti-engine/SKILL.md`: split. The framework half stays; the competence half becomes the
      new repository's own skill.
- [ ] Gate: `npm test --workspaces --if-present` green, `npm run lint` clean, `npm run check:types` reporting
      no drift, `docker-build` green against `tester`.
- [ ] Gate: `grep -rn "packages/competence" --exclude-dir=node_modules .` returns only historical references
      inside kept design records and CHANGELOGs.
- [ ] PR against `master`; merge once green.

---

## Phase D — Re-point the infrastructure

These are account- and cloud-side; none is a file change in either repository, and **CD from the new
repository will fail at Google authentication until Task 10 is done.**

### Task 10: Workload Identity Federation

- [ ] Update the provider's attribute condition:
      `assertion.repository=='Belleal/competence' && ( assertion.ref=='refs/heads/main' ||
      assertion.ref.startsWith('refs/tags/v') )`.
- [ ] Update the IAM binding from `attribute.repository/Belleal/ti-engine` to `.../Belleal/competence`.
- [ ] Update `bootstrap.sh`'s `GITHUB_REPO` default and its hardcoded-repository comment.
- [ ] Verify with `DRY_RUN=1 ./deploy/gcp/bootstrap.sh` before the real run.

### Task 11: GHCR, YouTrack, and repository settings

- [ ] Re-link the `ti-engine-competence` GHCR package to `Belleal/competence` and grant that repository push.
- [ ] Confirm `docker pull ghcr.io/belleal/ti-engine-competence:latest` still works from outside.
- [ ] Link `Belleal/competence` to YouTrack project `CA` — keep ti-engine linked too.
- [ ] Enable CodeRabbit and Debricked on the new repository.
- [ ] Branch protection on `main` with the new CI checks required.

### Task 12: Close out

- [ ] `INSTALL.md`: refresh the stale version header (it still targets competence 3.19.1 /
      web-framework 1.23.0 / core 1.11.0) and any repository URL.
- [ ] Both CHANGELOGs record the split.
- [ ] CA-120: status comment covering both repositories, log time, set State/Stage.
- [ ] Open the follow-up for the lost web-tier container coverage in ti-engine.

---

## Rollback

Before Task 9 the split is free to abandon: ti-engine still holds a complete, working competence and the new
repository can be deleted. After Task 9 the recovery is `git revert` of the removal commit, which restores
`packages/competence` in full — the reason Task 9 is a single, self-contained commit rather than a series.
