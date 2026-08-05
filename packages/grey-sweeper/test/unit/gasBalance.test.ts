import { describe, it, expect } from 'vitest';
import { checkGasBalance, formatGasBalanceCheck } from '../../src/gasBalance.js';
import type { NativeBalanceClientLike } from '../../src/gasBalance.js';

const ADDRESS = '0x06B29A204A2dB5dEA63b2d14cdfb2cFC4C90aA0C' as const;

function mockClient(balanceWei: bigint): NativeBalanceClientLike {
  return {
    getBalance: async () => balanceWei,
  };
}

describe('checkGasBalance — read-only floor comparison (E2-BE scope cut: manual refuel)', () => {
  it('reports "ok" when balance is at or above the floor', async () => {
    const result = await checkGasBalance(mockClient(1_000_000_000_000_000n), ADDRESS, 500_000_000_000_000n);
    expect(result.status).toBe('ok');
    expect(result.balanceWei).toBe(1_000_000_000_000_000n);
    expect(result.floorWei).toBe(500_000_000_000_000n);
    expect(result.address).toBe(ADDRESS);
  });

  it('reports "ok" exactly at the floor (not below it)', async () => {
    const result = await checkGasBalance(mockClient(500_000_000_000_000n), ADDRESS, 500_000_000_000_000n);
    expect(result.status).toBe('ok');
  });

  it('reports "below_floor" when balance is under the floor', async () => {
    const result = await checkGasBalance(mockClient(1n), ADDRESS, 500_000_000_000_000n);
    expect(result.status).toBe('below_floor');
  });

  it('reports "below_floor" for a zero balance against any positive floor', async () => {
    const result = await checkGasBalance(mockClient(0n), ADDRESS, 1n);
    expect(result.status).toBe('below_floor');
  });

  it('never signs or moves funds — the client surface has no write method', () => {
    const client = mockClient(0n);
    expect('sendTransaction' in client).toBe(false);
    expect('writeContract' in client).toBe(false);
  });

  it('propagates a getBalance rejection rather than swallowing it', async () => {
    const failing: NativeBalanceClientLike = {
      getBalance: async () => {
        throw new Error('rpc unreachable');
      },
    };
    await expect(checkGasBalance(failing, ADDRESS, 1n)).rejects.toThrow('rpc unreachable');
  });
});

describe('formatGasBalanceCheck', () => {
  it('labels an ok result plainly', async () => {
    const result = await checkGasBalance(mockClient(10n), ADDRESS, 1n);
    expect(formatGasBalanceCheck(result)).toContain('OK');
    expect(formatGasBalanceCheck(result)).not.toContain('BELOW FLOOR');
  });

  it('labels a below-floor result with the manual-top-up instruction', async () => {
    const result = await checkGasBalance(mockClient(0n), ADDRESS, 1n);
    expect(formatGasBalanceCheck(result)).toContain('BELOW FLOOR');
    expect(formatGasBalanceCheck(result)).toContain('top up manually');
  });
});
