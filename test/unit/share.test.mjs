// SPDX-License-Identifier: MIT

import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, MAX_SOURCE_BYTES, MESSAGES } from '../../src/share.js';

const b64url = (/** @type {Uint8Array} */ b) => Buffer.from(b).toString('base64url');
const defaults = { notes: true, flows: true, screen: '' };

describe('share links', () => {
  it('round-trip a source exactly, with every kind of character', async () => {
    const source = 'wirelith 0.1\n\nscreen "Café 😀 漢字" #a\n  text "a\\"b" //   ﻿\n';
    const fragment = await encodeShare({ source, ...defaults });
    expect(fragment).toMatch(/^v=1&src=[A-Za-z0-9_-]+$/);
    expect(await decodeShare(`#${fragment}`)).toEqual({ source, ...defaults });
  });

  it('round-trip the options, and write only those that differ from the defaults', async () => {
    const shared = { source: 'screen "A" #a\n', notes: false, flows: false, screen: 'a' };
    const fragment = await encodeShare(shared);
    expect(fragment).toMatch(/&notes=0&flows=0&screen=a$/);
    expect(await decodeShare(fragment)).toEqual(shared);
  });

  it('ignore a fragment that is not a share link', async () => {
    expect(await decodeShare('')).toBeNull();
    expect(await decodeShare('#')).toBeNull();
    expect(await decodeShare('#section-2')).toBeNull();
  });

  it('accept a source of exactly 65,536 bytes, and refuse one byte more', async () => {
    const at = 'x'.repeat(MAX_SOURCE_BYTES);
    const ok = await encodeShare({ source: at, ...defaults });
    expect((await decodeShare(ok))?.source).toBe(at);
    const over = await encodeShare({ source: `${at}y`, ...defaults });
    await expect(decodeShare(over)).rejects.toThrow(MESSAGES.tooLarge);
  });

  it('stop a decompression bomb at the limit', async () => {
    // 10 MB of zeros compresses to about 10 KB; decoding stops after 64 KB of output.
    const bomb = b64url(deflateRawSync(Buffer.alloc(10_000_000), { level: 9 }));
    expect(bomb.length).toBeLessThan(20_000);
    const started = Date.now();
    await expect(decodeShare(`v=1&src=${bomb}`)).rejects.toThrow(MESSAGES.tooLarge);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('reject bad base64url', async () => {
    for (const src of ['abc$', 'a+b/', 'abcde', '%00', 'a b']) {
      await expect(decodeShare(`v=1&src=${src}`)).rejects.toThrow(MESSAGES.base64);
    }
  });

  it('reject control characters in the fragment', async () => {
    await expect(decodeShare('v=1&src=ab%01cd')).rejects.toThrow(MESSAGES.base64);
    await expect(decodeShare('v=1&src=\u0000\u0007')).rejects.toThrow(MESSAGES.base64);
  });

  it('reject a truncated stream', async () => {
    const whole = deflateRawSync(Buffer.from('screen "A"\n'.repeat(200)));
    const cut = b64url(whole.subarray(0, Math.floor(whole.length / 2)));
    await expect(decodeShare(`v=1&src=${cut}`)).rejects.toThrow(MESSAGES.stream);
  });

  it('reject bytes that are not a deflate stream', async () => {
    await expect(decodeShare(`v=1&src=${b64url(new Uint8Array([0xff, 0xff, 0xff, 0xff]))}`)).rejects.toThrow(
      MESSAGES.stream,
    );
  });

  it('reject a source that is not UTF-8', async () => {
    const bad = b64url(deflateRawSync(Buffer.from([0x73, 0xff, 0xfe, 0x0a])));
    await expect(decodeShare(`v=1&src=${bad}`)).rejects.toThrow(MESSAGES.utf8);
  });

  it('refuse a 10 MB fragment without decoding it', async () => {
    await expect(decodeShare(`v=1&src=${'A'.repeat(10_000_000)}`)).rejects.toThrow(MESSAGES.tooLong);
  });

  it('refuse a version it does not know, and keep decoding version 1', async () => {
    await expect(decodeShare('v=2&src=AAAA')).rejects.toThrow(MESSAGES.version);
    // A version 1 link made by hand, as any future playground must still open it.
    const v1 = `v=1&src=${b64url(deflateRawSync(Buffer.from('screen "Old link" #old\n')))}&flows=0&screen=old`;
    expect(await decodeShare(v1)).toEqual({
      source: 'screen "Old link" #old\n',
      notes: true,
      flows: false,
      screen: 'old',
    });
  });

  it('ignore a screen option that is not an id', async () => {
    const src = b64url(deflateRawSync(Buffer.from('x')));
    expect((await decodeShare(`v=1&src=${src}&screen=%3Cscript%3E`))?.screen).toBe('');
  });
});
