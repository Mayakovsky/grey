import { describe, it, expect, vi } from 'vitest';
import type { Address, Hash } from 'viem';
import { executeRefuel, RefuelStepError, NonRelayerDestinationError } from '../../../src/refuel/execute.js';
import type { RefuelPublicLike, RefuelWalletLike } from '../../../src/refuel/execute.js';
import { RELAYER_ADDRESS } from '../../../src/refuel/addresses.js';
import type { Quote } from '../../../src/refuel/quote.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const AGENT = '0x394e81DA28799b578620803772FAeE403dE2d3f6' as Address;
const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224' as Address;
const HASH = ('0x' + 'ab'.repeat(32)) as Hash;

const QUOTE: Quote = { amountIn: 1_000_000n, amountOut: 995_000n, minOut: 985_050n, pool: POOL };

interface H {
  publicClient: RefuelPublicLike;
  walletClient: RefuelWalletLike;
  writes: Array<{ functionName: string; address: Address; args?: readonly unknown[] }>;
  sends: Array<{ to: Address; value: bigint }>;
  simulated: string[];
}

function harness(opts?: {
  simulateThrowsOn?: string;
  receiptRevertsOn?: number; // Nth receipt (1-based) reverts
  wethBalance?: bigint;
  wethBalances?: bigint[]; // successive post-swap balanceOf reads (FDQ-55 A retry)
}): H {
  const writes: H['writes'] = [];
  const sends: H['sends'] = [];
  const simulated: string[] = [];
  let receiptCount = 0;
  let balanceReads = 0;

  const publicClient: RefuelPublicLike = {
    simulateContract: vi.fn(async (args: { functionName: string }) => {
      simulated.push(args.functionName);
      if (opts?.simulateThrowsOn === args.functionName) throw new Error(`sim revert: ${args.functionName}`);
      return { result: undefined };
    }) as RefuelPublicLike['simulateContract'],
    waitForTransactionReceipt: vi.fn(async () => {
      receiptCount += 1;
      return { status: receiptCount === opts?.receiptRevertsOn ? ('reverted' as const) : ('success' as const) };
    }),
    readContract: vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === 'balanceOf') {
        const seq = opts?.wethBalances;
        if (seq) return seq[Math.min(balanceReads++, seq.length - 1)]!;
        return opts?.wethBalance ?? 995_000n;
      }
      throw new Error(`unexpected read ${args.functionName}`);
    }) as RefuelPublicLike['readContract'],
  };
  const walletClient: RefuelWalletLike = {
    writeContract: vi.fn(async (args: { functionName: string; address: Address; args?: readonly unknown[] }) => {
      // FDQ-53 tripwire: mirror real viem's behavior instead of accepting any
      // shape — a bare address in `account` means the JSON-RPC signing path.
      if ('account' in args && typeof (args as { account?: unknown }).account === 'string') {
        throw new Error('FDQ-53: eth_sendTransaction does not exist — write carried a bare account address');
      }
      writes.push(args);
      return HASH;
    }) as RefuelWalletLike['writeContract'],
    sendTransaction: vi.fn(async (args: { to: Address; value: bigint }) => {
      sends.push(args);
      return HASH;
    }),
  };
  return { publicClient, walletClient, writes, sends, simulated };
}

const base = (h: H) => ({
  walletClient: h.walletClient,
  publicClient: h.publicClient,
  agent: AGENT,
  usdcAddress: USDC,
  chainId: 8453,
  quote: QUOTE,
  sleep: async () => {}, // no-op backoff so the retry loop doesn't wall-clock the suite
});

describe('executeRefuel — happy path', () => {
  it('approve(exact) → swap(minOut) → unwrap(full balance) → deliver to the pinned relayer', async () => {
    const h = harness();
    const r = await executeRefuel(base(h));

    expect(h.writes.map((w) => w.functionName)).toEqual(['approve', 'exactInputSingle', 'withdraw']);
    // approve-exact: amountIn, never unlimited
    expect(h.writes[0]!.args).toEqual([expect.any(String), QUOTE.amountIn]);
    // swap carries the invariant-#22 bound
    const swapParams = (h.writes[1]!.args![0]!) as { amountOutMinimum: bigint; recipient: Address };
    expect(swapParams.amountOutMinimum).toBe(QUOTE.minOut);
    expect(swapParams.recipient).toBe(AGENT);
    // ETH leg: exactly the unwrapped amount, exactly to the literal
    expect(h.sends).toEqual([{ to: RELAYER_ADDRESS, value: 995_000n }]);
    expect(r.ethDeliveredWei).toBe(995_000n);
    // every write simulated first (FDQ-40)
    expect(h.simulated).toEqual(['approve', 'exactInputSingle', 'withdraw']);
  });

  it('FDQ-53 regression: writes NEVER carry a bare account address (local signing only)', async () => {
    const h = harness();
    await executeRefuel(base(h));
    // Passing account:<address> to a real viem writeContract selects the
    // node-managed JSON-RPC path (eth_sendTransaction), which no provider
    // supports — the live FDQ-53 failure. Simulations DO carry account (correct
    // msg.sender); writes must not.
    for (const w of h.writes) {
      expect('account' in w).toBe(false);
    }
  });
});

describe('executeRefuel — invariant #21 runtime guard', () => {
  it('refuses a non-relayer destination BEFORE any call', async () => {
    const h = harness();
    await expect(
      executeRefuel({ ...base(h), relayer: AGENT }),
    ).rejects.toBeInstanceOf(NonRelayerDestinationError);
    expect(h.writes).toHaveLength(0);
    expect(h.sends).toHaveLength(0);
  });
});

describe('executeRefuel — step gating', () => {
  it('a failed swap simulation broadcasts nothing at that step (zero-gas rejection)', async () => {
    const h = harness({ simulateThrowsOn: 'exactInputSingle' });
    await expect(executeRefuel(base(h))).rejects.toMatchObject({ name: 'RefuelStepError', step: 'swap' });
    // approve happened; swap never written; no ETH moved
    expect(h.writes.map((w) => w.functionName)).toEqual(['approve']);
    expect(h.sends).toHaveLength(0);
  });

  it('a reverted receipt surfaces as RefuelStepError with the step tagged', async () => {
    const h = harness({ receiptRevertsOn: 2 }); // approve ok, swap receipt reverts
    await expect(executeRefuel(base(h))).rejects.toBeInstanceOf(RefuelStepError);
    expect(h.sends).toHaveLength(0);
  });

  it('FDQ-55 A: retries a stale post-swap read and COMPLETES once consistent (never strands)', async () => {
    // the confirmed swap yields >= minOut; the first reads are stale zeros (the
    // id48 failure). Retry, then finish — a single stale zero is never grounds to
    // abandon the swapped funds mid-flight (Forces' ruling).
    const h = harness({ wethBalances: [0n, 0n, 995_000n] });
    const r = await executeRefuel(base(h));
    expect(h.writes.map((w) => w.functionName)).toEqual(['approve', 'exactInputSingle', 'withdraw']);
    expect(h.sends).toEqual([{ to: RELAYER_ADDRESS, value: 995_000n }]);
    expect(r.ethDeliveredWei).toBe(995_000n);
  });

  it('FDQ-55 A/C: a balance that never reaches minOut after all retries throws unwrap, carrying swapTx', async () => {
    const h = harness({ wethBalance: 1n }); // stays below minOut across every retry
    await expect(executeRefuel(base(h))).rejects.toMatchObject({
      step: 'unwrap',
      partial: { swapTx: HASH },
    });
    expect(h.writes.map((w) => w.functionName)).toEqual(['approve', 'exactInputSingle']);
    expect(h.sends).toHaveLength(0);
  });

  it('FDQ-55 C: a reverted ETH transfer throws transfer, carrying swapTx AND unwrapTx', async () => {
    const h = harness({ receiptRevertsOn: 4 }); // approve, swap, unwrap ok; transfer receipt reverts
    await expect(executeRefuel(base(h))).rejects.toMatchObject({
      step: 'transfer',
      partial: { swapTx: HASH, unwrapTx: HASH },
    });
  });
});
