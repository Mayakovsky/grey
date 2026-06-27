import { describe, it, expect } from 'vitest';
import { shouldSweep } from '../../src/trigger.js';
import { CADENCE_MS, THRESHOLD_USDC } from '../../src/config.js';

const NOW = 1_700_000_000_000;

describe('shouldSweep — threshold logic', () => {
  it('sweeps when balance >= threshold (200 USDC)', () => {
    expect(shouldSweep(THRESHOLD_USDC, NOW, NOW)).toBe(true);
    expect(shouldSweep(THRESHOLD_USDC + 1n, NOW, NOW)).toBe(true);
  });

  it('does NOT sweep when balance < threshold and within cadence', () => {
    const recent = NOW - 1000;
    expect(shouldSweep(THRESHOLD_USDC - 1n, recent, NOW)).toBe(false);
    expect(shouldSweep(50_000_000n, recent, NOW)).toBe(false);
  });

  it('sweeps when balance < threshold but cadence elapsed and balance > 0', () => {
    const stale = NOW - CADENCE_MS;
    expect(shouldSweep(1n, stale, NOW)).toBe(true);
    expect(shouldSweep(THRESHOLD_USDC - 1n, stale, NOW)).toBe(true);
  });

  it('does NOT sweep when balance is 0 even past cadence', () => {
    const stale = NOW - CADENCE_MS - 1;
    expect(shouldSweep(0n, stale, NOW)).toBe(false);
  });
});

describe('shouldSweep — cadence arithmetic', () => {
  it('treats null lastSweepAt as epoch 0 (always past cadence)', () => {
    expect(shouldSweep(1n, null, NOW)).toBe(true);
    expect(shouldSweep(0n, null, NOW)).toBe(false);
  });

  it('exact cadence boundary counts as elapsed (>=)', () => {
    const exactly = NOW - CADENCE_MS;
    expect(shouldSweep(1n, exactly, NOW)).toBe(true);
    const justUnder = NOW - CADENCE_MS + 1;
    expect(shouldSweep(1n, justUnder, NOW)).toBe(false);
  });
});
