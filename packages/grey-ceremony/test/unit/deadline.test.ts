import { describe, it, expect } from 'vitest';
import { deadlineWarning, MAX_DEADLINE_OFFSET_S } from '../../src/commands/deadline.ts';

const NOW = 1_783_000_000;

describe('deadlineWarning (FDQ-24 deadline guard)', () => {
  it('MAX_DEADLINE_OFFSET_S is 300 (the registry ~5-min cap)', () => {
    expect(MAX_DEADLINE_OFFSET_S).toBe(300);
  });

  it('returns null exactly at the 300s boundary', () => {
    expect(deadlineWarning(BigInt(NOW + 300), NOW)).toBeNull();
  });

  it('warns one second over the boundary', () => {
    const w = deadlineWarning(BigInt(NOW + 301), NOW);
    expect(w).toMatch(/deadline too far/);
    expect(w).toMatch(/301s ahead/);
  });

  it('warns for a far-future (1 hour) deadline and reports the offset', () => {
    const w = deadlineWarning(BigInt(NOW + 3600), NOW);
    expect(w).toMatch(/3600s ahead/);
    expect(w).toMatch(/<= 300s/);
  });

  it('returns null for a short (60s) deadline', () => {
    expect(deadlineWarning(BigInt(NOW + 60), NOW)).toBeNull();
  });

  it('returns null for an already-past deadline', () => {
    expect(deadlineWarning(BigInt(NOW - 100), NOW)).toBeNull();
  });
});
