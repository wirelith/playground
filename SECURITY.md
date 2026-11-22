# Security policy

The playground renders sources from anyone: typed, pasted, opened from a share link, or pasted from an AI reply. If you find a way to make it do harm, please tell us privately.

## How to report

Use GitHub's private vulnerability reporting: open this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report.

Please don't open a public issue, discussion or pull request about a vulnerability before it is fixed.

Include the source, share link or paste that shows the problem, the browser and its version, and what happened.

## In scope

Anything, from a source, a share link, a paste or anything else a visitor can supply, that makes the site:

- request anything from another origin, or send anything anywhere;
- run injected code; or
- insert markup outside the SVG element and attribute allowlist in the specification (Appendix D).

Also in scope: a way to freeze the page despite the render time limit, a way past the size limits on sources, pastes and share links, and anything the site stores in the browser.

## Report it to the main repository instead

A problem in `@wirelith/core` itself, such as output outside the allowlist for some source, affects every host, not only this site. Report it privately to [wirelith/wirelith](https://github.com/wirelith/wirelith/security/advisories/new).

## Out of scope

- What the hosting provider logs about requests for the site's files.
- Framing the site in another page. It has no accounts and no actions that change anything.

## Supported versions

Only the site as currently deployed from `main` receives fixes.
