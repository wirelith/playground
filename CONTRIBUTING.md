# Contributing to the Wirelith Playground

Thank you for helping. Please read this whole page before you open a pull request.

This repository holds the playground only. The language, its specification, `@wirelith/core` and the conformance suite live in [wirelith/wirelith](https://github.com/wirelith/wirelith), and so do the rules below in their original form.

## The ground rules

These three rules apply to everything in this project: files, commit messages, branch names, pull request titles and descriptions, issues, code comments, test data, examples, prompts and CI logs. Checks enforce what they can; the rest depends on you.

### 1. Everything here is public, forever

- This repository is public, and its whole history is public: commits, issues, pull requests, CI logs, branch names and author emails. Nothing can be cleaned up later, so never write something you would not want everyone to read.
- The copyright holder's name appears in exactly two files, `LICENSE` and `NOTICE`, and nowhere else. Not in package fields, docs, examples, prompts, comments or commit messages. A check fails if it appears anywhere else.
- Nothing here may be specific to any real organisation: no client or customer names, no real people, and no internal projects, products, URLs or documents.
- Examples, prompts, example answers, fixtures and tests use made-up products and made-up people. Reuse the invented names already in the specification, or invent new ones. If you are not sure a name is made up, pick another.
- Don't name other diagramming, charting or wireframing products, formats or services, for comparison, for credit, or for any other reason. Don't describe Wirelith as a version of another tool. Prompts don't name AI products either: the page says "your AI assistant".
- Name a third party only where it is the thing being integrated with or depended on, and state it as a plain fact: for example Node, pnpm, a font's or icon set's name and license, or the host the site is deployed to, which is named only in the files that deploy to it.

### 2. Independent, and safe with any input

- The site makes no network request except to load its own files. No analytics, cookies, trackers, CDNs or third-party fonts, and nothing in browser storage.
- The only Wirelith code it runs is `@wirelith/core`, built from a pinned commit of the main repository. It has no runtime dependencies of its own.
- Every source is untrusted: typed, pasted, loaded from a link, or pasted from an AI reply. Core runs in a worker with a time limit, and its SVG is checked against the specification's allowlist before anything is drawn. Nothing is ever inserted as HTML.
- Nothing here is specific to one host application. The site works the same wherever its files are served.

### 3. These rules bind everyone

- Before you push, check your diff, your commit messages and your branch name against these rules.
- Pull requests are checked automatically. Please don't try to work around a check. If you think a check is wrong, open an issue.

The project also keeps a private list of terms that must never appear here. CI checks every pull request against it and reports only a file and line number. If it flags your pull request, rewrite that place, and don't mention what you removed anywhere.

## Commits

Every commit must:

1. **Use a GitHub noreply email** as its author and committer. Find yours under GitHub, Settings, Emails ("Keep my email addresses private"). It looks like `12345+yourname@users.noreply.github.com`. Set it for this repository:

   ```sh
   git config user.email "12345+yourname@users.noreply.github.com"
   ```

2. **Be signed off** under the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). Signing off means you certify that you wrote the change, or otherwise have the right to submit it under this project's license. Add the sign-off with `-s`:

   ```sh
   git commit -s -m "Explain what changed"
   ```

   This adds a line `Signed-off-by: Your Name <your noreply email>`, which must match the commit's author. There is no contributor license agreement.

3. **Be signed**, by GPG or SSH key, if you have push access to this repository. The main branch only accepts signed commits.

The hooks in `.githooks` check the first two for you; `pnpm install` turns them on.

To fix commits that fail the check, amend them and force-push your branch:

```sh
git commit --amend -s --reset-author --no-edit             # the last commit
git rebase --signoff --exec 'git commit --amend --reset-author --no-edit' main   # every commit
```

## Development

You need Node 22.13 or newer and pnpm 11. With Node's bundled corepack, `corepack enable` provides the right pnpm; otherwise install `pnpm@11.28.9` with npm.

```sh
pnpm install                 # also turns on the git hooks
pnpm lint                    # formatting, lint, and the GitHub Actions lint
node scripts/check-spdx.mjs  # every source file starts with its license line
pnpm typecheck
pnpm test
pnpm build                   # the site, in _site/
pnpm test:e2e                # the built site in Chromium, Firefox and WebKit (after pnpm build)
pnpm preview                 # build, then serve _site/ locally
pnpm run check-licenses      # every dependency has an allowed license
pnpm run check-upstream      # every file taken from the main repository is unchanged
pnpm hygiene                 # the copyright-holder check, and the denylist if you have it
```

### Dependencies

- The site has no runtime dependencies, and must stay that way. The only code it runs is its own and the vendored `@wirelith/core`.
- A dev dependency needs an exact version, a license that `scripts/check-licenses.mjs` allows, and a release at least 14 days old. pnpm enforces the age rule, and refuses any dependency that wants to run an install script.
- The end-to-end tests use a headless browser library, as a dev dependency only. Install its browsers once with `pnpm exec playwright install chromium firefox webkit`. The tests paste through the clipboard, so don't copy anything while they run.

### Source files

Every source file starts with a `SPDX-License-Identifier: MIT` comment, and no other license header.

## Adding a prompt

The "Ask your AI" panel offers ready-made prompts: some of the main repository's eval tasks (which ones is a list in `src/config.js`), then this repository's own, in `prompts/`.

- `prompts/<id>.md` is one prompt: a title line, then the request. The id is lowercase words joined by `-`.
- `prompts/<id>.wirelith` is its example answer, if it has one. CI fails if an example answer has an error.
- Use made-up products and people only. Reuse the invented names in the specification, such as Fernway, Larkboard or Vellumcrest. Name no AI product: the page says "your AI assistant".

## Files from the main repository

Some files here come byte for byte from [wirelith/wirelith](https://github.com/wirelith/wirelith): the built `@wirelith/core`, the examples and prompts under `vendor/wirelith/`, the fonts and icon license under `third-party/`, `scripts/hygiene/`, `scripts/check-spdx.mjs`, `scripts/check-licenses.mjs`, `scripts/install-hooks.mjs`, `.githooks/`, `.github/workflows/pr-checks.yml`, `.github/workflows/scan-posts.yml`, `biome.json`, `CODE_OF_CONDUCT.md` and `LICENSE`. `scripts/upstream.lock.json` lists every one with its SHA-256.

The one file of this repository's own under `vendor/` is `vendor/biome.json`, which turns Biome off there: those files are checked in the main repository.

**Never edit them here.** CI fails if any differs from the lock. To change one:

1. Make the change in the main repository, through its own pull request and checks.
2. Once it is merged and CI has passed on `main`, move this repository to that commit, as the [README](README.md#moving-to-a-newer-core) explains, in a pull request that changes nothing else.

## Pull requests

- Keep each pull request to one change.
- Fill in the template. Say what changed, what you deliberately left out, and how you tested it.
- Tick every box in the checklist once it is true. A check fails while any box is unticked. The box about changing the language is true here when the pull request doesn't change it, which a pull request in this repository never does.
- Maintainers merge by squashing.
