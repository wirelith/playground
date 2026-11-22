# Wirelith Playground

Write a [Wirelith](https://github.com/wirelith/wirelith) source in the browser, see its problems and its rendering as you type, and download the SVG.

Everything runs in the page. The site loads only its own files and sends nothing anywhere: no accounts, no server, no analytics, no cookies, no storage. A share link carries the source in the part of the URL after `#`, which browsers never send to a server.

> **Status: 0.x, unstable.** It renders with `@wirelith/core` built from a pinned commit of the main repository. See [What it runs](#what-it-runs).

## Running it locally

You need Node 22.13 or newer and pnpm 11. With Node's bundled corepack, `corepack enable` provides the right pnpm; otherwise install `pnpm@11.28.9` with npm.

```sh
git clone https://github.com/wirelith/playground.git
cd playground
pnpm install          # also turns on the git hooks
pnpm preview          # builds the site into _site/ and serves it locally
```

`pnpm preview` serves the site with the same Content-Security-Policy it has in production, sent as a header as well. [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks to run before a pull request.

## What it runs

The only Wirelith code the site runs is `@wirelith/core`, built from one commit of [wirelith/wirelith](https://github.com/wirelith/wirelith). `scripts/upstream.lock.json` names that commit, the core and spec versions, and a SHA-256 for every file taken from it. The same commit provides the examples, the eval prompts, the conformance suite, the fonts, and this repository's hygiene scripts, hooks and two of its workflows, all byte for byte.

CI checks that every one of those files matches the lock, and fetches the commit again to check that it gives the same bytes.

## Moving to a newer core

1. Pick a commit on the main repository's `main` branch whose CI passed.
2. Run the update script with its full SHA:

   ```sh
   node scripts/update-upstream.mjs <commit>
   ```

   It refuses a commit that isn't on `main` or whose CI didn't pass. It replaces every vendored file, removes any the new commit no longer provides, and rewrites the lock. Set `GITHUB_TOKEN` if you hit the GitHub API's rate limit.
3. Check the result and open one pull request with the lock and the vendored files together:

   ```sh
   node scripts/check-upstream.mjs --rebuild
   pnpm lint && pnpm typecheck && pnpm test
   ```

## Deploying

The site is hosted on GitHub Pages and deployed by `.github/workflows/deploy.yml`.

- **A merge deploys.** Every push to `main` builds the site from that commit, checks it with `scripts/check-site.mjs`, and deploys it. Deploys run one at a time, and a deploy that has started always finishes.
- **Then it is checked.** `scripts/smoke.mjs` fetches the live `build.json`, checks that it names the deployed commit, and checks that every file it lists is served with the bytes that were built. Run it yourself with `node scripts/smoke.mjs <site URL> [<commit>]`.
- **To roll back,** run the Deploy workflow by hand (Actions, Deploy, Run workflow) with `ref` set to an earlier commit on `main`, such as the commit the previous `build.json` named. The workflow refuses a commit that isn't on `main`. Then revert the bad change in a pull request, so `main` and the live site agree again.

The repository needs these settings first: Pages, Source "GitHub Actions"; and the `github-pages` environment limited to the `main` branch.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
