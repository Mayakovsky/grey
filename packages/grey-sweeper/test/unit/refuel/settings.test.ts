import { describe, it, expect } from 'vitest';
import {
  loadRefuelSettings,
  DEFAULT_FLOOR_WEI,
  DEFAULT_TARGET_WEI,
  DEFAULT_HARDFLOOR_WEI,
  DEFAULT_MAX_USDC,
  DEFAULT_GAS_RESERVE_WEI,
} from '../../../src/refuel/settings.js';

describe('loadRefuelSettings — defaults (F-Q3(a) ratified values)', () => {
  it('applies the ratified defaults with an empty env', () => {
    const s = loadRefuelSettings({});
    expect(s.enabled).toBe(true);
    expect(s.floorWei).toBe(DEFAULT_FLOOR_WEI);
    expect(s.targetWei).toBe(DEFAULT_TARGET_WEI);
    expect(s.hardFloorWei).toBe(DEFAULT_HARDFLOOR_WEI);
    expect(s.maxUsdcPerTick).toBe(DEFAULT_MAX_USDC);
    expect(s.gasReserveWei).toBe(DEFAULT_GAS_RESERVE_WEI);
  });

  it('defaults encode 0.0005 / 0.002 / 0.0002 / 0.003 ETH and $10', () => {
    expect(DEFAULT_FLOOR_WEI).toBe(500_000_000_000_000n);
    expect(DEFAULT_TARGET_WEI).toBe(2_000_000_000_000_000n);
    expect(DEFAULT_HARDFLOOR_WEI).toBe(200_000_000_000_000n);
    expect(DEFAULT_MAX_USDC).toBe(10_000_000n);
    // FDQ-58 / Forces funding-sensitivity ruling: reserve = the agent's funded gas
    // float (0.003 ETH), so recovery relocates only genuine surplus, not the buffer.
    expect(DEFAULT_GAS_RESERVE_WEI).toBe(3_000_000_000_000_000n);
  });
});

describe('loadRefuelSettings — env overrides', () => {
  it('reads bigint overrides', () => {
    const s = loadRefuelSettings({
      GREY_REFUEL_FLOOR_WEI: '100',
      GREY_REFUEL_TARGET_WEI: '1000',
      GREY_REFUEL_HARDFLOOR_WEI: '50',
      GREY_REFUEL_MAX_USDC: '5000000',
      GREY_REFUEL_GAS_RESERVE_WEI: '7777',
    });
    expect(s.floorWei).toBe(100n);
    expect(s.targetWei).toBe(1000n);
    expect(s.hardFloorWei).toBe(50n);
    expect(s.maxUsdcPerTick).toBe(5_000_000n);
    expect(s.gasReserveWei).toBe(7777n);
  });

  it('GREY_REFUEL_ENABLED=false disables; true/1 enable; junk throws', () => {
    expect(loadRefuelSettings({ GREY_REFUEL_ENABLED: 'false' }).enabled).toBe(false);
    expect(loadRefuelSettings({ GREY_REFUEL_ENABLED: '0' }).enabled).toBe(false);
    expect(loadRefuelSettings({ GREY_REFUEL_ENABLED: 'true' }).enabled).toBe(true);
    expect(loadRefuelSettings({ GREY_REFUEL_ENABLED: '1' }).enabled).toBe(true);
    expect(() => loadRefuelSettings({ GREY_REFUEL_ENABLED: 'yes' })).toThrow(/true\/false/);
  });
});

describe('loadRefuelSettings — fail-closed validation', () => {
  it('rejects non-integer wei values', () => {
    expect(() => loadRefuelSettings({ GREY_REFUEL_FLOOR_WEI: '0.5' })).toThrow(/non-negative integer/);
    expect(() => loadRefuelSettings({ GREY_REFUEL_TARGET_WEI: '-1' })).toThrow(/non-negative integer/);
    expect(() => loadRefuelSettings({ GREY_REFUEL_MAX_USDC: 'ten' })).toThrow(/non-negative integer/);
  });

  it('rejects inverted thresholds (target ≤ floor)', () => {
    expect(() =>
      loadRefuelSettings({ GREY_REFUEL_FLOOR_WEI: '1000', GREY_REFUEL_TARGET_WEI: '1000' }),
    ).toThrow(/TARGET.*exceed.*FLOOR/);
  });

  it('rejects a hard floor above the floor', () => {
    expect(() =>
      loadRefuelSettings({ GREY_REFUEL_FLOOR_WEI: '1000', GREY_REFUEL_HARDFLOOR_WEI: '2000', GREY_REFUEL_TARGET_WEI: '3000' }),
    ).toThrow(/HARDFLOOR.*not exceed/);
  });
});
