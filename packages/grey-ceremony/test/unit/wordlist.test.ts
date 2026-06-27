import { describe, it, expect } from 'vitest';
import {
  WORDLIST_SHA256,
  WORDLIST_SIZE,
  loadWordlist,
  parseWordlist,
} from '../../src/diceware/index.ts';

describe('wordlist digest pin', () => {
  it('loads the on-disk list and exposes 7776 words', () => {
    const { words, byCode } = loadWordlist();
    expect(words).toHaveLength(WORDLIST_SIZE);
    expect(WORDLIST_SIZE).toBe(7776);
    expect(byCode.size).toBe(7776);
    expect(byCode.get('11111')).toBe('abacus');
  });

  it('throws when the content does not match the pinned digest', () => {
    const corrupted = '11111\tabacus\n'; // wrong content
    expect(() => parseWordlist(corrupted, WORDLIST_SHA256)).toThrow(/digest mismatch/);
  });

  it('throws when the expected digest is corrupted', () => {
    // Real content, but verify against a wrong expected hash.
    expect(() => parseWordlist('11111\tabacus\n', 'deadbeef')).toThrow(/digest mismatch/);
  });
});
