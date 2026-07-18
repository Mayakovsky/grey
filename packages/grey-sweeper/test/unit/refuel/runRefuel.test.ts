import { describe, it, expect, vi } from 'vitest';
import type { Address, Hash } from 'viem';
import { runRefuel } from '../../../src/refuel/index.js';
import type { RefuelDeps } from '../../../src/refuel/index.js';
import { RELAYER_ADDRESS } from '../../../src/refuel/addresses.js';
import {
  DEFAULT_FLOOR_WEI,
  DEFAULT_TARGET_WEI,
  DEFAULT_HARDFLOOR_WEI,
  DEFAULT_MAX_USDC,
  DEFAULT_GAS_RESERVE_WEI,
} from '../../../src/refuel/settings.js';
import type { RefuelSettings } from '../../../src/refuel/settings.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const AGENT = '0x394e81DA28799b578620803772FAeE403dE2d3f6' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224' as Address;
const HASH = ('0x' + 'ef'.repeat(32)) as Hash;
const Q96 = 2n ** 96n;

const SETTINGS: RefuelSettings = {
  enabled: true,
  floorWei: DEFAULT_FLOOR_WEI,
  targetWei: DEFAULT_TARGET_WEI,
  hardFloorWei: DEFAULT_HARDFLOOR_WEI,
  maxUsdcPerTick: DEFAULT_MAX_USDC,
  gasReserveWei: DEFAULT_GAS_RESERVE_WEI,
};

interface H {
  deps: RefuelDeps;
  logRows: Array<ReadonlyArray<unknown>>;
  opsAlerts: string[];
  critAlerts: string[];
  writes: string[];
}

function harness(opts: {
  relayerEth: bigint | Error;
  agentUsdc?: bigint;
  agentEth?: bigint;      // agent NATIVE ETH (FDQ-58 native-recovery sweep source)
  quoteOut?: bigint;      // amountOut the quoter simulation returns (== post-swap WETH)
  strandedWeth?: bigint;  // WETH held by the agent BEFORE any swap (FDQ-55 B recovery)
  settings?: Partial<RefuelSettings>;
  simulateThrowsOn?: string;
  transferRevertsOnReceipt?: number; // Nth waitForTransactionReceipt reverts (FDQ-55 C)
}): H {
  const logRows: Array<ReadonlyArray<unknown>> = [];
  const opsAlerts: string[] = [];
  const critAlerts: string[] = [];
  const writes: string[] = [];
  // The recovery pre-swap balanceOf is the FIRST WETH read; the post-swap output
  // read is the rest. Models reality: agent holds no WETH until a swap mints it.
  let balanceOfCalls = 0;
  let receiptCalls = 0;

  const publicClient = {
    getBalance: vi.fn(async (args: { address: Address }) => {
      if (args.address === AGENT) return opts.agentEth ?? 0n; // native ETH (recovery source)
      if (opts.relayerEth instanceof Error) throw opts.relayerEth;
      return opts.relayerEth;
    }),
    getTransactionCount: vi.fn(async () => 7), // FDQ-57: explicit nonce source
    readContract: vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'getPool') return POOL;
      if (args.functionName === 'token0') return WETH;
      if (args.functionName === 'slot0') return [Q96, 0, 0, 0, 0, 0, true] as const;
      if (args.functionName === 'balanceOf') {
        balanceOfCalls += 1;
        return balanceOfCalls === 1 ? (opts.strandedWeth ?? 0n) : (opts.quoteOut ?? 0n);
      }
      throw new Error(`unexpected read ${args.functionName}`);
    }),
    simulateContract: vi.fn(async (args: { functionName: string }) => {
      if (opts.simulateThrowsOn === args.functionName) throw new Error(`sim revert: ${args.functionName}`);
      if (args.functionName === 'quoteExactInputSingle') {
        return { result: [opts.quoteOut ?? 0n, 0n, 0, 0n] as const };
      }
      return { result: undefined };
    }),
    waitForTransactionReceipt: vi.fn(async () => {
      receiptCalls += 1;
      return {
        status: receiptCalls === opts.transferRevertsOnReceipt ? ('reverted' as const) : ('success' as const),
      };
    }),
  };
  const walletClient = {
    writeContract: vi.fn(async (args: { functionName: string }) => {
      writes.push(args.functionName);
      return HASH;
    }),
    sendTransaction: vi.fn(async () => HASH),
  };

  const deps: RefuelDeps = {
    publicClient: publicClient as unknown as RefuelDeps['publicClient'],
    walletClient: walletClient as unknown as RefuelDeps['walletClient'],
    pool: {
      query: vi.fn(async (_text: string, params?: ReadonlyArray<unknown>) => {
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
    agent: AGENT,
    usdcAddress: USDC,
    agentUsdcBalance: opts.agentUsdc ?? 20_000_000n,
    chainId: 8453,
    settings: { ...SETTINGS, ...opts.settings },
  };
  return { deps, logRows, opsAlerts, critAlerts, writes };
}

// refuel_log param order: [chain_id, before, deficit, usdc_in, quote_out, min_out,
//                          swap, unwrap, transfer, delivered, status, err_class, err_detail]
const statusOf = (row: ReadonlyArray<unknown>) => row[10];

describe('runRefuel — steady state', () => {
  it('relayer at/above floor → skipped, silent, ZERO log rows', async () => {
    const h = harness({ relayerEth: DEFAULT_FLOOR_WEI });
    expect((await runRefuel(h.deps)).status).toBe('skipped');
    expect(h.logRows).toHaveLength(0);
    expect(h.opsAlerts).toHaveLength(0);
    expect(h.critAlerts).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });

  it('disabled → skipped without even reading the balance', async () => {
    const h = harness({ relayerEth: 0n, settings: { enabled: false } });
    expect((await runRefuel(h.deps)).status).toBe('skipped');
    expect((h.deps.publicClient.getBalance as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe('runRefuel — ok path', () => {
  it('below floor → swaps (capped), delivers, logs ok, ops alert', async () => {
    // relayer 0.0003 ETH < floor; deficit 0.0017 ETH; price=1 → USDC needed ≈ 1.717e15,
    // clamped to the $10 cap (10_000_000). Quote returns within band.
    const h = harness({ relayerEth: 300_000_000_000_000n, quoteOut: 9_950_000n });
    const r = await runRefuel(h.deps);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.usdcIn).toBe(DEFAULT_MAX_USDC); // cap clamp (invariant #22)
      expect(r.ethDeliveredWei).toBe(9_950_000n);
    }
    const ok = h.logRows.find((row) => statusOf(row) === 'ok');
    expect(ok).toBeDefined();
    expect(ok![3]).toBe(DEFAULT_MAX_USDC.toString()); // usdc_in
    expect(h.opsAlerts.some((m) => m.includes('refuel: swapped'))).toBe(true);
    expect(h.critAlerts).toHaveLength(0);
    expect(h.writes).toEqual(['approve', 'exactInputSingle', 'withdraw']);
  });
});

describe('runRefuel — insufficient USDC', () => {
  it('agent balance below minimum viable → insufficient_usdc + ops alert (above hard floor)', async () => {
    const h = harness({ relayerEth: 300_000_000_000_000n, agentUsdc: 50_000n });
    expect((await runRefuel(h.deps)).status).toBe('insufficient_usdc');
    const row = h.logRows.find((r) => statusOf(r) === 'insufficient_usdc');
    expect(row).toBeDefined();
    expect(h.opsAlerts.some((m) => m.includes('will retry as revenue accrues'))).toBe(true);
    expect(h.critAlerts).toHaveLength(0);
  });

  it('same, but BELOW the hard floor → CRITICAL escalation (spec §1.5 failsafe)', async () => {
    const h = harness({ relayerEth: 100_000_000_000_000n, agentUsdc: 50_000n });
    expect((await runRefuel(h.deps)).status).toBe('insufficient_usdc');
    expect(h.critAlerts.some((m) => m.includes('HARD floor'))).toBe(true);
  });
});

describe('runRefuel — quote out of band', () => {
  it('classifies quote_oob, logs, ops alert, retries next tick (above hard floor)', async () => {
    // spot expects 10_000_000 → floor 9_900_000; 9_000_000 is out of band
    const h = harness({ relayerEth: 300_000_000_000_000n, quoteOut: 9_000_000n });
    expect((await runRefuel(h.deps)).status).toBe('quote_oob');
    expect(h.logRows.find((r) => statusOf(r) === 'quote_oob')).toBeDefined();
    expect(h.opsAlerts.some((m) => m.includes('quote out of band'))).toBe(true);
    expect(h.critAlerts).toHaveLength(0);
    expect(h.writes).toHaveLength(0); // nothing broadcast
  });
});

describe('runRefuel — execution failure', () => {
  it('a swap-step failure → failed + CRITICAL alert; never throws', async () => {
    const h = harness({
      relayerEth: 300_000_000_000_000n,
      quoteOut: 9_950_000n,
      simulateThrowsOn: 'exactInputSingle',
    });
    expect((await runRefuel(h.deps)).status).toBe('failed');
    expect(h.logRows.find((r) => statusOf(r) === 'failed')).toBeDefined();
    expect(h.critAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it('relayer balance read failure → failed + CRITICAL; never throws', async () => {
    const h = harness({ relayerEth: new Error('rpc 500') });
    expect((await runRefuel(h.deps)).status).toBe('failed');
    expect(h.critAlerts.some((m) => m.includes('failed to read relayer balance'))).toBe(true);
  });
});

describe('runRefuel — FDQ-55 B + FDQ-58: stranded-value recovery', () => {
  it('unwraps orphaned WETH then sweeps native ETH above the reserve to the relayer', async () => {
    // agent holds stranded WETH (unwrapped → native) so native ETH = reserve + 5e14;
    // relayer AT floor → no new swap. Recovery: unwrap, then sweep the 5e14 excess.
    const h = harness({
      relayerEth: DEFAULT_FLOOR_WEI,
      strandedWeth: 500_000_000_000_000n,
      agentEth: DEFAULT_GAS_RESERVE_WEI + 500_000_000_000_000n,
    });
    const r = await runRefuel(h.deps);
    expect(r.status).toBe('skipped'); // relayer at floor after recovery → no top-up swap
    expect(h.writes).toEqual(['withdraw']); // unwrap ONLY — no approve/exactInputSingle
    const send = (h.deps.walletClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      to: Address;
      value: bigint;
    };
    expect(send.to).toBe(RELAYER_ADDRESS);
    expect(send.value).toBe(500_000_000_000_000n); // excess above the gas reserve
    const ok = h.logRows.find((row) => statusOf(row) === 'ok');
    expect(ok).toBeDefined();
    expect(ok![6]).toBeNull(); // swap_tx — honest: recovery had no swap
    expect(ok![8]).toBe(HASH); // transfer_tx present
    expect(ok![9]).toBe((500_000_000_000_000n).toString()); // eth_delivered
    expect(h.opsAlerts.some((m) => m.includes('recovered'))).toBe(true);
  });

  it('FDQ-58: native ETH above reserve (no WETH) is swept to the relayer — no unwrap', async () => {
    // reproduces the live stuck position: unwrap already mined, native ETH stranded.
    const h = harness({
      relayerEth: DEFAULT_FLOOR_WEI,
      agentEth: DEFAULT_GAS_RESERVE_WEI + 162_222_914_207_892n,
    });
    const r = await runRefuel(h.deps);
    expect(r.status).toBe('skipped');
    expect(h.writes).toHaveLength(0); // no WETH to unwrap — sweep only
    const send = (h.deps.walletClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      to: Address;
      value: bigint;
    };
    expect(send.to).toBe(RELAYER_ADDRESS);
    expect(send.value).toBe(162_222_914_207_892n);
    const ok = h.logRows.find((row) => statusOf(row) === 'ok');
    expect(ok![7]).toBeNull(); // unwrap_tx null — nothing to unwrap
  });

  it('steady state (no WETH, native ETH at/below reserve) writes no recovery row and no writes', async () => {
    const h = harness({ relayerEth: DEFAULT_FLOOR_WEI, agentEth: DEFAULT_GAS_RESERVE_WEI });
    await runRefuel(h.deps);
    expect(h.logRows).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
    expect((h.deps.walletClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

describe('runRefuel — FDQ-55 C: partial execution is logged truthfully', () => {
  it('a swap that mined then a transfer failure logs status=failed WITH swap_tx (never null)', async () => {
    // relayer below floor → swap; receipts approve(1) swap(2) unwrap(3) transfer(4)
    // → transfer receipt reverts. The audit row must carry the swap that moved USDC.
    const h = harness({ relayerEth: 300_000_000_000_000n, quoteOut: 9_950_000n, transferRevertsOnReceipt: 4 });
    const r = await runRefuel(h.deps);
    expect(r.status).toBe('failed');
    const failed = h.logRows.find((row) => statusOf(row) === 'failed');
    expect(failed).toBeDefined();
    expect(failed![6]).toBe(HASH); // swap_tx RECORDED — money moved on-chain, the row says so
    expect(failed![7]).toBe(HASH); // unwrap_tx recorded too
    expect(h.critAlerts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('runRefuel — ETH destination (invariant #21, observed end-to-end)', () => {
  it('the delivery sendTransaction targets the pinned relayer literal', async () => {
    const h = harness({ relayerEth: 300_000_000_000_000n, quoteOut: 9_950_000n });
    await runRefuel(h.deps);
    const send = (h.deps.walletClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      to: Address;
    };
    expect(send.to).toBe(RELAYER_ADDRESS);
  });
});
