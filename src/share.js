// SPDX-License-Identifier: MIT

// Share links carry the source in the URL fragment, which browsers never send to a server:
//
//   #v=1&src=<base64url of deflate-raw of the UTF-8 source>[&notes=0][&flows=0][&screen=<id>]
//
// Version 1 must keep decoding as long as the playground exists: a later format gets a new v,
// and this decoder stays. A decoded source is untrusted input like any other.

export const SHARE_VERSION = '1';
export const MAX_SOURCE_BYTES = 65536;
/** Longer than any version 1 link to a source within the cap can be. */
export const MAX_ENCODED_LENGTH = 131072;

export const MESSAGES = {
  version: 'This link needs a newer version of the playground.',
  tooLong: 'This link is too long to open.',
  base64: 'This link is damaged: its source is not valid base64url.',
  stream: 'This link is damaged: its source could not be decompressed.',
  tooLarge: 'This link’s source is over 65,536 bytes, so it was not opened.',
  utf8: 'This link is damaged: its source is not valid UTF-8.',
};

export class ShareError extends Error {}

/**
 * @typedef {object} Shared
 * @property {string} source
 * @property {boolean} notes
 * @property {boolean} flows
 * @property {string} screen "" for all screens
 */

/** @param {Uint8Array} bytes */
function toBase64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text */
function fromBase64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new ShareError(MESSAGES.base64);
  let binary;
  try {
    binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  } catch {
    throw new ShareError(MESSAGES.base64);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Reads a whole stream into one array.
 * @param {ReadableStream<Uint8Array>} stream
 * @param {number} [limit] stop with an error past this many bytes
 */
async function readAll(stream, limit = Number.POSITIVE_INFINITY) {
  const reader = stream.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    let step;
    try {
      step = await reader.read();
    } catch {
      throw new ShareError(MESSAGES.stream);
    }
    if (step.done) break;
    total += step.value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new ShareError(MESSAGES.tooLarge);
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * @param {Uint8Array} bytes
 * @param {CompressionStream | DecompressionStream} transform
 * @param {number} [limit]
 */
function pipe(bytes, transform, limit) {
  const writer = transform.writable.getWriter();
  // Errors surface on the readable side; these promises are only kept from going unhandled.
  writer.write(/** @type {any} */ (bytes)).catch(() => {});
  writer.close().catch(() => {});
  return readAll(transform.readable, limit);
}

/**
 * The fragment for a source and its options, without the "#".
 * @param {Shared} shared
 */
export async function encodeShare({ source, notes, flows, screen }) {
  const compressed = await pipe(new TextEncoder().encode(source), new CompressionStream('deflate-raw'));
  const parts = [`v=${SHARE_VERSION}`, `src=${toBase64url(compressed)}`];
  if (!notes) parts.push('notes=0');
  if (!flows) parts.push('flows=0');
  if (screen) parts.push(`screen=${encodeURIComponent(screen)}`);
  return parts.join('&');
}

/**
 * Decodes a fragment, with or without its "#". Returns null when it isn't a share link at all.
 * @param {string} fragment
 * @returns {Promise<Shared | null>}
 */
export async function decodeShare(fragment) {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (text === '') return null;
  if (text.length > MAX_ENCODED_LENGTH + 1024) throw new ShareError(MESSAGES.tooLong);
  const params = new URLSearchParams(text);
  const version = params.get('v');
  if (version === null && !params.has('src')) return null;
  if (version !== SHARE_VERSION) throw new ShareError(MESSAGES.version);
  const src = params.get('src') ?? '';
  if (src.length > MAX_ENCODED_LENGTH) throw new ShareError(MESSAGES.tooLong);
  const bytes = await pipe(fromBase64url(src), new DecompressionStream('deflate-raw'), MAX_SOURCE_BYTES);
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ShareError(MESSAGES.utf8);
  }
  const screen = params.get('screen') ?? '';
  return {
    source,
    notes: params.get('notes') !== '0',
    flows: params.get('flows') !== '0',
    // An id is a letter, then letters, digits, "-" or "_" (spec section 3). Anything else is ignored.
    screen: /^[A-Za-z][A-Za-z0-9_-]*$/.test(screen) ? screen : '',
  };
}
