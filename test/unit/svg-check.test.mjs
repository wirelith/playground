// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { checkSvgDocument, parseAndCheck } from '../../src/svg-check.js';

const CASES = 'vendor/wirelith/conformance/cases';

/** A parser that throws on any XML error, as a browser reports one with a parsererror. */
const parser = {
  /** @param {any} s */
  parseFromString(s) {
    return /** @type {any} */ (
      new DOMParser({
        onError: (/** @type {string} */ level, /** @type {string} */ msg) => {
          if (level !== 'warning') throw new Error(msg);
        },
      }).parseFromString(s, 'image/svg+xml')
    );
  },
};

/** @param {string} svg */
const check = (svg) => parseAndCheck(svg, parser);

const ok = (/** @type {string} */ inner, /** @type {string} */ attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"${attrs}>${inner}</svg>`;

describe('the allowlist check', () => {
  const outputs = readdirSync(CASES)
    .map((c) => `${CASES}/${c}/output.svg`)
    .filter((f) => existsSync(f));

  it('has conformance outputs to check', () => {
    expect(outputs.length).toBeGreaterThan(40);
  });

  it.each(outputs)('accepts %s', (file) => {
    const result = check(readFileSync(file, 'utf8'));
    expect(result.ok ? null : result.reason).toBeNull();
  });

  it('accepts url(#…) and the embedded source', () => {
    const svg = ok(
      '<metadata><wl:source xmlns:wl="urn:wirelith:source" version="0.1">screen "A" &lt;b&gt;</wl:source></metadata>' +
        '<defs><clipPath id="c"><rect x="0" y="0" width="1" height="1"/></clipPath></defs>' +
        '<g clip-path="url(#c)"><path d="M0 0" marker-end="url(#wl-arrow)"/></g>',
    );
    expect(check(svg)).toMatchObject({ ok: true });
  });

  const bad = {
    script: ok('<script>alert(1)</script>'),
    foreignObject: ok('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'),
    style: ok('<style>*{fill:red}</style>'),
    'an onload attribute': ok('<g/>', ' onload="alert(1)"'),
    'an onclick on a child': ok('<rect x="0" y="0" width="1" height="1" onclick="alert(1)"/>'),
    'an external href': ok('<a href="https://example.com/"><text x="0" y="0">x</text></a>'),
    'an xlink:href': ok(
      '<g xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://example.com/x.svg#a"/></g>',
    ),
    'an href on an allowed element': ok('<g href="#a"/>'),
    'an external url()': ok('<g clip-path="url(https://example.com/x.svg#c)"/>'),
    'a quoted external url()': ok('<path d="M0 0" marker-end="url(\'https://example.com/#m\')"/>'),
    'a url() in fill': ok('<rect x="0" y="0" width="1" height="1" fill="URL(//example.com/p)"/>'),
    'an image': ok('<image x="0" y="0" width="1" height="1"/>'),
    'an attribute not in Appendix D': ok('<rect x="0" y="0" width="1" height="1" style="fill:red"/>'),
    'an element in another namespace': ok('<x:g xmlns:x="urn:other"/>'),
    'a comment': ok('<!-- hi -->'),
    'a processing instruction': ok('<?xml-stylesheet href="https://example.com/s.css"?>'),
    'wl:source outside metadata': ok('<wl:source xmlns:wl="urn:wirelith:source" version="0.1">x</wl:source>'),
    'markup inside wl:source': ok(
      '<metadata><wl:source xmlns:wl="urn:wirelith:source" version="0.1"><b xmlns="">x</b></wl:source></metadata>',
    ),
    'a non-SVG root': '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>',
    'an svg root in another namespace': '<svg xmlns="http://www.w3.org/1999/xhtml" width="1" height="1"/>',
    'a doctype': '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    'malformed XML': '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
  };

  it.each(Object.entries(bad))('rejects %s', (_name, svg) => {
    expect(check(svg).ok).toBe(false);
  });

  it('reports a parsererror document as malformed', () => {
    const doc = {
      getElementsByTagName: (/** @type {string} */ n) => ({ length: n === 'parsererror' ? 1 : 0 }),
    };
    const result = parseAndCheck('x', { parseFromString: () => /** @type {any} */ (doc) });
    expect(result).toEqual({ ok: false, reason: 'the SVG is not well-formed' });
  });

  it('rejects an svg root in no namespace', () => {
    const root = {
      nodeType: 1,
      localName: 'svg',
      namespaceURI: null,
      childNodes: { length: 0, item: () => null },
    };
    expect(checkSvgDocument({ documentElement: root, childNodes: { length: 1, item: () => root } })).toBe(
      'the root is not an SVG element',
    );
  });

  it('checks a parsed document directly', () => {
    expect(checkSvgDocument(parser.parseFromString(ok('<g/>')))).toBeNull();
  });
});
