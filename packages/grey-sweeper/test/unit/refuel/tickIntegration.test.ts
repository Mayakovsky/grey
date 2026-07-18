import { describe, it, expect, vi } from 'vitest';
import type { Address, Hash } from 'viem';
import { runTick } from '../../../src/index.js';
import type { TickDeps } from '../../../src/index.js';
import { THRESHOLD_USDC } from '../../../src/config.js';
import {
  DEFAULT_FLOOR_WEI,
  DEFAULT_TARGET_WEI,
  DEFAULT_HARDFLOOR_WEI,
  DEFAULT_MAX_USDC,
  DEFAULT_GAS_RESERVE_WEI,
} from '../../../src/refuel/settings.js';
import type { RefuelSettings } from '../../../src/refuel/settings.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WALLET = '0x394e81DA28799b578620803772FAeE403dE2d3f6' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224' as Address;
const TXHASH = ('0x' + 'cd'.repeat(32)) as Hash;
const NOW = 1_700_000_000_000;
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
  deps: TickDeps;
  logTexts: string[];
  logRows: Array<ReadonlyArray<unknown>>;
  sweepSend: ReturnType<typeof vi.fn>;
  refuelGetBalance: ReturnType<typeof vi.fn>;
  balanceReads: number;
}

function harness(opts: {
  balance: bigint;              // agent USDC at first read
  balanceAfterRefuel?: bigint;  // agent USDC at second read (post-ok-refuel)
  relayerEth: bigint | Error;
  quoteOut?: bigint;
  refuelEnabled?: boolean;
  omitRefuelDeps?: boolean;
}): H {
  const logTexts: string[] = [];
  const logRows: Array<ReadonlyArray<unknown>> = [];
  let usdcReads = 0;

  const sweepSend = vi.fn(async () => TXHASH);
  // relayer-only balance read (the recovery agent read is dispatched separately)
  const refuelGetBalance = vi.fn(async () => {
    if (opts.relayerEth instanceof Error) throw opts.relayerEth;
    return opts.relayerEth;
  });
  let refuelBalanceOfCalls = 0;

  const refuelPublic = {
    getBalance: vi.fn(async (args: { address: Address }) => {
      if (args.address === WALLET) return 0n; // agent native ETH — no stranded value here
      return refuelGetBalance(); // relayer
    }),
    getTransactionCount: vi.fn(async () => 5), // FDQ-57 explicit nonce source
    readContract: vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'getPool') return POOL;
      if (args.functionName === 'token0') return WETH;
      if (args.functionName === 'slot0') return [Q96, 0, 0, 0, 0, 0, true] as const;
      if (args.functionName === 'balanceOf') {
        // first balanceOf = recovery WETH check (no stranded); rest = post-swap output
        refuelBalanceOfCalls += 1;
        return refuelBalanceOfCalls === 1 ? 0n : (opts.quoteOut ?? 0n);
      }
      throw new Error(`unexpected read ${args.functionName}`);
    }),
    simulateContract: vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'quoteExactInputSingle') return { result: [opts.quoteOut ?? 0n, 0n, 0, 0n] as const };
      return { result: undefined };
    }),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' as const })),
  };
  const refuelWallet = {
    writeContract: vi.fn(async () => TXHASH),
    sendTransaction: vi.fn(async () => TXHASH),
  };

  const deps: TickDeps = {
    balanceClient: {
      readContract: vi.fn(async () => {
        usdcReads += 1;
        return usdcReads === 1 ? opts.balance : (opts.balanceAfterRefuel ?? opts.balance);
      }),
    },
    walletClient: { sendTransaction: sweepSend },
    receiptClient: { waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' as const })) },
    pool: {
      query: vi.fn(async (text: string, params?: ReadonlyArray<unknown>) => {
        logTexts.push(text);
        if (text.includes('MAX(swept_at)')) return { rows: [{ last: null }] };
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
      post: async () => ({ statusCode: 200 }),
    },
    agentWallet: WALLET,
    usdcAddress: USDC,
    chainId: 8453,
    now: () => NOW,
    ...(opts.omitRefuelDeps
      ? {}
      : {
          refuel: {
            settings: { ...SETTINGS, enabled: opts.refuelEnabled ?? true },
            publicClient: refuelPublic as unknown as NonNullable<TickDeps['refuel']>['publicClient'],
            walletClient: refuelWallet as unknown as NonNullable<TickDeps['refuel']>['walletClient'],
          },
        }),
  };

  return {
    deps,
    logTexts,
    logRows,
    sweepSend,
    refuelGetBalance,
    get balanceReads() {
      return usdcReads;
    },
  };
}

describe('runTick + refuel — F-Q4(a) ordering and fall-through', () => {
  it('refuel skipped (relayer healthy) → sweep proceeds exactly as pre-F', async () => {
    const h = harness({ balance: THRESHOLD_USDC, relayerEth: DEFAULT_FLOOR_WEI });
    expect(await runTick(h.deps)).toBe('swept');
    expect(h.refuelGetBalance).toHaveBeenCalledTimes(1);
    expect(h.sweepSend).toHaveBeenCalledTimes(1);
  });

  it('refuel FAILURE never blocks the sweep (revenue safety outranks gas)', async () => {
    const h = harness({ balance: THRESHOLD_USDC, relayerEth: new Error('rpc down') });
    expect(await runTick(h.deps)).toBe('swept');
    expect(h.sweepSend).toHaveBeenCalledTimes(1);
  });

  it('an ok refuel re-reads the agent balance so the sweep sees post-swap reality', async () => {
    const h = harness({
      balance: THRESHOLD_USDC + 10_000_000n,
      balanceAfterRefuel: THRESHOLD_USDC,
      relayerEth: 300_000_000_000_000n,
      quoteOut: 9_950_000n,
    });
    expect(await runTick(h.deps)).toBe('swept');
    expect(h.balanceReads).toBe(2);
    // the sweep amount is the post-refuel balance
    const ok = h.logRows.find((r) => r[4] === 'ok');
    expect(ok![1]).toBe(THRESHOLD_USDC.toString());
  });
});

describe('runTick + refuel — disabled/absent means byte-for-byte pre-F (spec §5.3)', () => {
  it('refuel disabled via settings → refuel clients never touched, sweep unchanged', async () => {
    const h = harness({ balance: THRESHOLD_USDC, relayerEth: 0n, refuelEnabled: false });
    expect(await runTick(h.deps)).toBe('swept');
    expect(h.refuelGetBalance).not.toHaveBeenCalled();
  });

  it('refuel deps absent (older callers) → identical pre-F behavior', async () => {
    const h = harness({ balance: THRESHOLD_USDC, relayerEth: 0n, omitRefuelDeps: true });
    expect(await runTick(h.deps)).toBe('swept');
    expect(h.refuelGetBalance).not.toHaveBeenCalled();
  });
});

describe('runTick — FDQ-42 chain filter reaches the query', () => {
  it('passes chainId as the last-sweep query param', async () => {
    const h = harness({ balance: 0n, relayerEth: DEFAULT_FLOOR_WEI });
    await runTick(h.deps);
    expect(h.logTexts.some((t) => t.includes('AND chain_id = $1'))).toBe(true);
  });
});
