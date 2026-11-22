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

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
