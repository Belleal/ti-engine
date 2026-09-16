# Working agreement — Belleal/ti-engine

Read this at session start, then load the **`ti-engine` skill** before touching code.

This file is the *process*: how we work, what "done" means, how things land. It is deliberately short and
slow-changing. Everything volatile — architecture, package layout, the domain model, version numbers, counts,
invariants — lives in the skill, which is **authoritative** wherever the two appear to disagree.

A near-identical copy of the shared sections lives in **`Belleal/competence`**. A change to those sections belongs
in both repositories.

---

## Start of session

1. **Load the repo skill.** `ti-engine` here; `competence` in the application repository. Do it before answering
   architecture questions, not after being corrected.
2. **Set the commit identity**, before the first commit:

   ```bash
   git config user.name "Boris Kostadinov"
   git config user.email "kostadinov.boris@gmail.com"
   ```

   This is not cosmetic. `cla.yml` fails any PR whose commit authors have not signed `CLA.md`, and the allowlist
   holds `Belleal` alone. The CLA's §1 defines a contributor as "the individual … or the legal entity" — an agent is
   neither and holds no rights to grant, so the correct resolution is to author as the maintainer and disclose the
   assist in trailers, never to widen the allowlist. A commit authored as `Claude <noreply@anthropic.com>` has to be
   re-authored before the PR can go green.
3. **Do not touch signing configuration.** See *Commit signing* below — it is environment-provided.

---

## Commit signing

Commits from this environment **are** SSH-signed: `gpg.format=ssh`, `commit.gpgsign=true` and a signing helper are
configured globally, and the signature in the object is real. **Do not change that configuration** — it is provided
by the environment, and editing it breaks signing rather than improving it.

`git log --show-signature` is misleading here: it reports `N` because no `allowedSignersFile` exists in the
container. To check whether a commit is actually signed, look at the object:

```bash
git cat-file -p <sha> | grep -q gpgsig && echo signed || echo unsigned
```

**They will still show as Unverified on GitHub, and that is expected.** The signing key belongs to the Claude Code
environment, not to the maintainer. GitHub requires SSH keys to be globally unique and rejects this one with *"Key
is already in use"* — it is already held elsewhere, which is what a platform-provided key looks like. It therefore
cannot be mapped to the maintainer's account, and arguably should not be: a key shared across environments would
put his identity on anything it ever signed.

So the honest position is that **agent commits are signed but unverified, and the maintainer's own commits are the
ones that carry the badge.** Do not spend session time trying to change this, and never generate a replacement key
inside the container — it dies with the session, and registering a throwaway key is worse than no signature.

If verified agent commits ever become worth it, the only workable route is a **dedicated** signing key generated on
the maintainer's machine, registered to his account as a Signing Key, and supplied to the environment as a secret.
Worth being clear about what that grants: an SSH *signing* key cannot push or authenticate, so the exposure is
limited to forging signatures attributed to him — narrower than an auth key, but not nothing.

---

## Code convention

**`packages/core` is the reference.** When unsure, open the nearest file in `core` and match it. ESLint enforces
almost none of this — its only rule is `no-unused-vars` as a warning — so the convention is upheld by reading, not
by tooling. "It lints clean" is not evidence that it matches the house style.

- **Licence header** on every new `.js` file, copied verbatim from a sibling in the *same package* (packages differ:
  Apache-2.0 here, AGPL-3.0-or-later in competence).
- **CommonJS** — `require()` / `module.exports`. No ESM.
- **Four-space indent**, double quotes, semicolons.
- **Spaces inside parentheses, brackets and braces**: `foo( a, b )`, `[ 1, 2 ]`, `{ key: value }`,
  `if ( x === y ) {`. This is the most visible marker of the style and the easiest to get wrong.
- **JSDoc on everything exported** — a prose description first, then `@method` / `@param` / `@returns` /
  `@throws`, and `@public` or `@private`. Shared object shapes are `@typedef`s in the package's
  `definitions.types.js`, not inline.
- **`#alias` imports** from the package's `imports` map for anything internal; the `exports` map across packages.
  Never a relative path that crosses a directory, and never a deep path past a package's `exports` map.
- **Private class fields** are `#name`; singletons export one frozen `instance`.
- **Comments say why, not what** — and where a line prevents a specific defect, say which. The comment that names
  the bug it is holding back is the one that survives the next refactor.

---

## Commits

Conventional Commits, scoped to the package: `feat(web-framework)`, `fix(auth-manager)`, `docs(competence)`,
`build(deps)`, `test(...)`, `chore(build)`. `!` marks a breaking change, which may land inside a minor bump.

**Bundle thematically — fewer, larger commits.** Never one commit per TDD step.

The body carries what a diff cannot: **what was wrong, why it survived, what changed, and the evidence**. Real
numbers, not adjectives — test counts, measured output, the reproduction. If a reasonable alternative was rejected,
say which and why; that paragraph is what stops the next person re-litigating it.

End every commit with:

```text
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: <session URL>
```

**Never commit:** a model identifier in any file, message or PR body (chat replies only); `.env`; `.run/*.run.xml`
(they carry live local credentials); any secret value in a committed file — secrets live in Secret Manager.

---

## Definition of done

Before pushing, run the repo's own checks and quote the real results:

```bash
npm test            # fans out across workspaces
npm run lint        # 0 errors; some pre-existing warnings are expected
npm run build:types && npm run check:types   # declarations are committed and must not drift
```

- A version bump means **both** `package.json` and a matching `## Version X.Y.Z` section in that package's
  `CHANGELOG.md`. `npm-publish.yml` fails the run if the section is missing.
- **Generated files are regenerated, never hand-edited** — `types/` here, the Help fragments and relevancy data in
  competence.
- **Keep the skill current.** If the change makes anything the skill asserts wrong — a version, a count, an
  invariant, a file's purpose, a registration point — the skill edit ships **in the same PR**. Skills go stale one
  merged PR at a time, and a stale skill is worse than none because it is believed.

---

## Pull requests

**Standing authorization: open the PR, subscribe to it, and drive it.** No need to ask. Never merge — that is
Boris's.

Driving it means: CI to green; every CodeRabbit finding verified against the code and either fixed or answered;
threads addressed then resolved; a stale PR body rewritten when later commits outdate it.

There is no PR template on purpose — a fixed one flattens the description and pre-fills Boris's own PRs. Write
prose that fits the change, covering:

- **what was wrong** — the defect, concretely
- **why it survived / why it matters** — the reason it was not obvious, which is usually the most useful paragraph
- **what changed**, and what was rejected
- **verification** — commands, counts, measured before/after
- **what was deliberately not done**, and why

**CodeRabbit is a reviewer, not an oracle.** Verify every finding against the code before acting: this session it
raised two, one of which was a real copy of a helper nobody had noticed, and one whose premise (`trust proxy` off)
did not hold. Fix the real ones; when declining, reply with the measurement that settles it rather than an opinion.
There is no round limit — repeated findings mean fix the root cause.

Every comment, reply or review posted to GitHub ends with:

```text

---
_Generated by [Claude Code](https://claude.ai/code)_
```

**Do not poll a healthy PR.** Events wake the session on CI failures and comments. A periodic check-in is a backstop
for what webhooks miss, so it belongs on a red or conflicted PR — not on a green one waiting for a human, where it
just produces a string of "nothing changed" turns. Stretch it overnight; stop it when the PR merges or closes.

---

## Working method

What made the difference on the bugs solved so far, in order of how often it mattered:

- **Reproduce before fixing.** Both auth bugs in this repository were diagnosed by building the failing case —
  a real `CompetenceWebServer`, then real Chromium — not by reading. The reproduction is also the regression test.
- **Measure library and browser behaviour; never recall it.** `req.secure` under `trust proxy`, what Entra's
  `userinfo` returns, what Helmet's `useDefaults` includes: each was decided by running it, and in two cases the
  measured answer contradicted the plausible one.
- **Suspect the report's framing, not just its symptom.** "The env var is not being read" was measured and found
  correct; the real cause was elsewhere. Confirm the premise before fixing what it points at.
- **One validated push beats three speculative ones.** A push that turns CI red costs a cycle and the reviewer's
  trust.
- **Do not widen the change.** An adjacent defect gets named in the PR under "not done", not smuggled into the diff.

---

## Environment traps

- **`process.loadEnvFile` does not override an existing OS environment variable.** A stale `export` in the shell
  silently beats a correct `.env`, and the file looks right the whole time. Suspect this first whenever
  configuration "is not being read" — it has already cost one full investigation.
- **Tag pushes are rejected for agent sessions** (403 on the tag ref) even though branch pushes succeed.
  `npm-publish.yml` creates release tags itself.
- **A merged PR's branch cannot carry follow-up work.** Restart the branch from the updated default branch and open
  a new PR.

---

## This repository

- Default branch **`master`**; work lands on a topic branch opened against it.
- Four packages — `core`, `web-framework`, `web-content`, `tester` — each with its **own** version and
  `CHANGELOG.md`. Dependency direction: `core` → `web-framework` → `web-content`; `tester` → `core`.
- **Merging to `master` publishes to npm.** A version bump plus its changelog section is the entire release ritual;
  `npm-publish.yml` compares declared versions against the registry, so a merge that bumps nothing publishes
  nothing.
- **A framework fix reaches competence only after it is on npm**, then by a semver range bump there. Order:
  merge here → confirm the version on npm (`npm view @ti-engine/web-framework version`) → bump the range in
  competence.
- Work is tracked in **YouTrack project `CA`**, which spans both repositories: create a `CA-###` card under its
  epic, put the ID in commit messages, and log time spent.
