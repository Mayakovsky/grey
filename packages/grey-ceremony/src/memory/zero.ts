// Layer 1 — best-effort memory hygiene.

import { Buffer } from 'node:buffer';

/**
 * Overwrite a buffer's contents with zeros in place.
 *
 * Caveat (honest): this only zeros the bytes we control. String copies handed
 * to external signing APIs may persist in the V8 heap until garbage collection,
 * and we cannot force-zero those. Prefer keeping secret material in Buffers and
 * calling this helper as soon as the secret is no longer needed.
 */
export function zero(buf: Buffer): void {
  buf.fill(0);
}

/** Zero several buffers (skips nullish entries). */
export function zeroAll(...bufs: Array<Buffer | null | undefined>): void {
  for (const b of bufs) {
    if (b) b.fill(0);
  }
}
