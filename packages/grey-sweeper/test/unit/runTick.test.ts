import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hash } from 'viem';
import { runTick } from '../../src/index.js';
import type { TickDeps } from '../../src/index.js';
import { BASE_POOL_WALLET_ADDRESS, THRESHOLD_USDC, CADENCE_MS } from '../../src/config.js';
import { GasLowError, NonAllowlistError } from '../../src/errors.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WALLET = '0x2222222222222222222222222222222222222222' as Address;
const TXHASH = ('0x' + 'cd'.repeat(32)) as Hash;
const NOW = 1_700_000_000_000;

interface Harness {
  deps: TickDeps;
  logRows: Array<ReadonlyArray<unknown>>;
  opsAlerts: string[];
  critAlerts: string[];
  send: ReturnType<typeof vi.fn>;
}

function harness(opts: {
  balance: bigint;
  lastSweepAt?: number | null;
  receiptStatus?: 'success' | 'reverted';
  sendThrows?: Error;
}): Harness {
  const logRows: Array<ReadonlyArray<unknown>> = [];
  const opsAlerts: string[] = [];
  const critAlerts: string[] = [];
  const lastSweepAt = opts.lastSweepAt ?? null;

  const send = vi.fn(async () => {
    if (opts.sendThrows) throw opts.sendThrows;
    return TXHASH;
  });

  const deps: TickDeps = {
    balanceClient: { readContract: vi.fn(async () => opts.balance) },
    walletClient: { sendTransaction: send },
    receiptClient: {
      waitForTransactionReceipt: vi.fn(async () => ({
        status: opts.receiptStatus ?? 'success',
      })),
    },
    pool: {
      query: vi.fn(async (text: string, params?: ReadonlyArray<unknown>) => {
        if (text.includes('MAX(swept_at)')) {
          return { rows: [{ last: lastSweepAt === null ? null : new Date(lastSweepAt) }] };
        }
        if (params) logRows.push(params);
        return { rows: [] };
      }),
    },
    alertDeps: {
      opsUrl: 'ops',
      critUrl: 'crit',
      delay: async () => {},
      post: async (url, o) => {
        if (url === 'ops') opsAlerts.push(o.body);
        else critAlerts.push(o.body);
        return { statusCode: 200 };
      },
    },
    agentWallet: WALLET,
    usdcAddress: USDC,
    chainId: 8453,
    now: () => NOW,
  };

  return { deps, logRows, opsAlerts, critAlerts, send };
}

describe('runTick — happy path (threshold met)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = harness({ balance: THRESHOLD_USDC });
  });

  it('sweeps, writes an ok log row, fires an operational alert', async () => {
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('swept');
    expect(h.send).toHaveBeenCalledTimes(1);
    // ok row: status at index 4, tx_hash at 0, dest at 3
    const ok = h.logRows.find((r) => r[4] === 'ok');
    expect(ok).toBeDefined();
    expect(ok![0]).toBe(TXHASH);
    expect(ok![3]).toBe(BASE_POOL_WALLET_ADDRESS);
    expect(h.opsAlerts.length).toBeGreaterThanOrEqual(1);
    expect(h.critAlerts.length).toBe(0);
  });
});

describe('runTick — threshold not met within cadence', () => {
  it('skips: no broadcast, writes a skipped row, no alert', async () => {
    const h = harness({ balance: 10n, lastSweepAt: NOW - 1000 });
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('skipped');
    expect(h.send).not.toHaveBeenCalled();
    const skipped = h.logRows.find((r) => r[4] === 'skipped');
    expect(skipped).toBeDefined();
    expect(h.opsAlerts.length).toBe(0);
  });
});

describe('runTick — cadence elapsed with dust', () => {
  it('sweeps a sub-threshold balance once the week has passed', async () => {
    const h = harness({ balance: 5n, lastSweepAt: NOW - CADENCE_MS });
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('swept');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});

describe('runTick — error classification', () => {
  it('recoverable GasLow on broadcast → failed outcome + operational alert (no critical)', async () => {
    const h = harness({ balance: THRESHOLD_USDC, sendThrows: new GasLowError() });
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('failed');
    const failed = h.logRows.find((r) => r[4] === 'failed');
    expect(failed![5]).toBe('GasLowError');
    expect(h.opsAlerts.length).toBeGreaterThanOrEqual(1);
    expect(h.critAlerts.length).toBe(0);
  });

  it('unrecoverable NonAllowlist on broadcast → failed outcome + critical alert', async () => {
    const h = harness({ balance: THRESHOLD_USDC, sendThrows: new NonAllowlistError() });
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('failed');
    expect(h.critAlerts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('runTick — never throws', () => {
  it('returns failed (not throw) when balance read errors', async () => {
    const h = harness({ balance: 0n });
    h.deps.balanceClient = {
      readContract: vi.fn(async () => {
        throw new Error('rpc 500');
      }),
    };
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('failed');
    expect(h.critAlerts.length).toBeGreaterThanOrEqual(1);
  });
});
