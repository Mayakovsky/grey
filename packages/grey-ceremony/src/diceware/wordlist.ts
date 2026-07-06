// Layer 1 — EFF large wordlist loader with a pinned content digest.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pinned SHA-256 of data/eff_large_wordlist.txt. */
export const WORDLIST_SHA256 =
  'addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e';

/** The EFF large list has exactly 7776 entries (6^5). */
export const WORDLIST_SIZE = 7776;

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Parse the raw wordlist text into a code→word map and an ordered word array.
 * Verifies the content digest against the pinned value; throws on mismatch.
 * Exposed separately so the digest check is unit-testable without disk I/O.
 */
export function parseWordlist(
  raw: string,
  expectedSha256: string = WORDLIST_SHA256,
): { byCode: Map<string, string>; words: string[] } {
  const actual = sha256Hex(raw);
  if (actual !== expectedSha256) {
    throw new Error(
      `Wordlist digest mismatch: expected ${expectedSha256}, got ${actual}`,
    );
  }
  const byCode = new Map<string, string>();
  const words: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) {
      throw new Error(`Malformed wordlist line (no tab): ${line}`);
    }
    const code = line.slice(0, tab);
    const word = line.slice(tab + 1);
    byCode.set(code, word);
    words.push(word);
  }
  if (words.length !== WORDLIST_SIZE) {
    throw new Error(`Wordlist size mismatch: expected ${WORDLIST_SIZE}, got ${words.length}`);
  }
  return { byCode, words };
}

let cached: { byCode: Map<string, string>; words: string[] } | undefined;

/** Load and cache the on-disk wordlist, verifying its pinned digest. */
export function loadWordlist(): { byCode: Map<string, string>; words: string[] } {
  if (!cached) {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '..', '..', 'data', 'eff_large_wordlist.txt'), 'utf8');
    cached = parseWordlist(raw);
  }
  return cached;
}
