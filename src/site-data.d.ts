// SPDX-License-Identifier: MIT

// The types of site-data.js, which scripts/build-site.mjs writes into _site/src/. The page
// imports it instead of reading build.json, because its Content-Security-Policy allows no fetch.

export declare const BUILD: {
  /** The main repository's URL. */
  repository: string;
  /** The main repository's commit that core and the examples come from. */
  upstreamCommit: string;
  coreVersion: string;
  specVersion: string;
};

export declare const EXAMPLES: { id: string; title: string; source: string }[];

export declare const PROMPTS: {
  id: string;
  /** "eval" for the main repository's eval tasks, "playground" for this repository's own. */
  kind: 'eval' | 'playground';
  title: string;
  request: string;
  /** An example answer, when the prompt has one. */
  answer?: string;
}[];
