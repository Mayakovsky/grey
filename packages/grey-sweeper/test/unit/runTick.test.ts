import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hash } from 'viem';
import { runTick } from '../../src/index.js';
import type { TickDeps } from '../../src/index.js';
import {
  BASE_POOL_WALLET_ADDRESS,
  SEPOLIA_TEST_POOL_WALLET_ADDRESS,
  THRESHOLD_USDC,
  CADENCE_MS,
} from '../../src/config.js';
import type { ChainId } from '../../src/config.js';
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
  chainId?: ChainId;
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
      user: 'grey-sweeper',
      pass: 'test-pass',
      delay: async () => {},
      post: async (url, o) => {
        if (url === 'ops') opsAlerts.push(o.body);
        else critAlerts.push(o.body);
        return { statusCode: 200 };
      },
    },
    agentWallet: WALLET,
    usdcAddress: USDC,
    chainId: opts.chainId ?? 8453,
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

describe('runTick — Sepolia (chainId 84532) routes to the test pool (FDQ-23)', () => {
  it('sweeps to the Sepolia test pool, not the mainnet literal', async () => {
    const h = harness({ balance: THRESHOLD_USDC, chainId: 84532 });
    const outcome = await runTick(h.deps);
    expect(outcome).toBe('swept');
    const ok = h.logRows.find((r) => r[4] === 'ok');
    expect(ok![3]).toBe(SEPOLIA_TEST_POOL_WALLET_ADDRESS);
    expect(ok![3]).not.toBe(BASE_POOL_WALLET_ADDRESS);
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

describe('runTick — read-failure escalation (D-169)', () => {
  // Shape of the real 2026-09-23 incident: viem wraps an Alchemy 503 as a plain
  // ContractFunctionExecutionError — NOT RpcDownError, so isRecoverable() is false.
  function rpc503(): Error {
    const e = new Error('HTTP request failed.\n\nStatus: 503\nDetails: Service Unavailable');
    e.name = 'ContractFunctionExecutionError';
    return e;
  }

  /** Harness whose balance read fails while `failing.on` is true. */
  function flaky(): { h: Harness; failing: { on: boolean } } {
    const h = harness({ balance: 10n, lastSweepAt: NOW - 1000 });
    const failing = { on: true };
    h.deps.balanceClient = {
      readContract: vi.fn(async () => {
        if (failing.on) throw rpc503();
        return 10n;
      }),
    };
    h.deps.readFailures = { consecutive: 0 };
    return { h, failing };
  }

  it('a single read blip pages operational, not critical, and still logs a failed row', async () => {
    const { h } = flaky();
    expect(await runTick(h.deps)).toBe('failed');
    expect(h.critAlerts).toHaveLength(0);
    expect(h.opsAlerts).toHaveLength(1);
    expect(h.opsAlerts[0]).toContain('1/3 before critical');
    const failed = h.logRows.find((r) => r[4] === 'failed');
    expect(failed![5]).toBe('ContractFunctionExecutionError');
  });

  it('the real incident pattern (fail, ok, fail) never pages critical', async () => {
    const { h, failing } = flaky();
    await runTick(h.deps);
    failing.on = false;
    expect(await runTick(h.deps)).toBe('skipped');
    expect(h.deps.readFailures!.consecutive).toBe(0);
    failing.on = true;
    await runTick(h.deps);
    expect(h.critAlerts).toHaveLength(0);
    expect(h.deps.readFailures!.consecutive).toBe(1);
  });

  it('a sustained outage escalates to critical on the 3rd consecutive failure and every one after', async () => {
    const { h } = flaky();
    await runTick(h.deps);
    await runTick(h.deps);
    expect(h.critAlerts).toHaveLength(0);
    await runTick(h.deps);
    expect(h.critAlerts).toHaveLength(1);
    expect(h.critAlerts[0]).toContain('3 consecutive');
    await runTick(h.deps);
    expect(h.critAlerts).toHaveLength(2);
  });

  it('recovery after escalation resets the counter and sends an operational recovered notice', async () => {
    const { h, failing } = flaky();
    for (let i = 0; i < 3; i++) await runTick(h.deps);
    failing.on = false;
    const opsBefore = h.opsAlerts.length;
    expect(await runTick(h.deps)).toBe('skipped');
    expect(h.deps.readFailures!.consecutive).toBe(0);
    expect(h.opsAlerts.slice(opsBefore).some((a) => a.includes('recovered after 3'))).toBe(true);
  });

  it('a DB read failure (getLastSweepTimestamp) counts toward the same escalation', async () => {
    const h = harness({ balance: 10n });
    h.deps.readFailures = { consecutive: 0 };
    h.deps.pool = {
      query: vi.fn(async () => {
        throw new Error('pooler timeout');
      }),
    };
    for (let i = 0; i < 3; i++) expect(await runTick(h.deps)).toBe('failed');
    expect(h.critAlerts).toHaveLength(1);
  });

  it('without readFailures wired, a single read failure still pages critical (fail-loud default)', async () => {
    const { h } = flaky();
    delete h.deps.readFailures;
    await runTick(h.deps);
    expect(h.critAlerts).toHaveLength(1);
  });
});
