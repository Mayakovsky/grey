import { describe, it, expect } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  defineChain,
  http,
  erc20Abi,
  keccak256,
  encodeAbiParameters,
  pad,
  toHex,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import process from 'node:process';
import { readSpot, quoteUsdcToWeth } from '../../src/refuel/quote.js';
import type { QuoteClientLike } from '../../src/refuel/quote.js';
import { executeRefuel, recoverStranded } from '../../src/refuel/execute.js';
import type { RefuelPublicLike, RefuelWalletLike } from '../../src/refuel/execute.js';
import { RELAYER_ADDRESS } from '../../src/refuel/addresses.js';

/**
 * Anvil MAINNET-FORK refuel end-to-end (spec §5.2 — the ratified strategy).
 * Skipped unless GREY_REFUEL_FORK=1; NOT counted toward the CI-default floor.
 *
 * Provisioning (see TESTING.md):
 *   anvil --fork-url <keyed Base RPC> --chain-id 8453 --port 8545
 *   GREY_REFUEL_FORK=1 vitest run test/anvil/refuel.fork.test.ts
 *
 * Runs the REAL refuel path (readSpot → quoteUsdcToWeth → executeRefuel) against
 * live Base pool/quoter/router/WETH with zero funds at risk. The test agent is a
 * FRESHLY GENERATED key each run — anvil's well-known default accounts carry
 * EIP-7702 delegations on Base (codesize 23), so WETH.withdraw's 2300-gas
 * `.transfer()` OOGs into their delegated code; a random EOA (codesize 0, like the
 * real agent 0x394e…) receives ETH cleanly. USDC is dealt via anvil_setStorageAt
 * (FiatToken balance slot 9).
 */
const RUN = process.env['GREY_REFUEL_FORK'] === '1';
const RPC = process.env['GREY_SWEEPER_RPC_URL'] ?? 'http://127.0.0.1:8545';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const CHAIN = 8453;
const POOL = '0xd0b53d9277642d899df5c87a3966a349a798f224';
const weth9DepositAbi = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
] as const;

const forkChain = defineChain({
  id: CHAIN,
  name: 'anvil-base-fork',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

describe.skipIf(!RUN)('anvil mainnet-fork — refuel round-trip', () => {
  // fresh clean EOA per run (see header): never a well-known/delegated address
  const account = privateKeyToAccount(generatePrivateKey());
  const pub = createPublicClient({ chain: forkChain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: forkChain, transport: http(RPC) });
  const test = createTestClient({ chain: forkChain, mode: 'anvil', transport: http(RPC) });
  const quoteClient = pub as unknown as QuoteClientLike;
  const refuelPublic = pub as unknown as RefuelPublicLike;
  const refuelWallet = wallet as unknown as RefuelWalletLike;

  async function dealUsdc(to: Address, amount: bigint): Promise<void> {
    // FiatToken balances mapping at slot 9; the packed value's top bit is blacklist.
    const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [to, 9n]));
    await test.setStorageAt({ address: USDC, index: slot, value: pad(toHex(amount)) });
  }
  const usdcBal = (a: Address) =>
    pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
  const wethBal = (a: Address) =>
    pub.readContract({ address: WETH, abi: erc20Abi, functionName: 'balanceOf', args: [a] });

  it('quotes within band, swaps USDC→WETH, unwraps, delivers ETH to the pinned relayer', async () => {
    await test.setBalance({ address: account.address, value: parseEther('1') }); // gas
    await dealUsdc(account.address, 5_000_000n); // $5
    expect(await usdcBal(account.address)).toBe(5_000_000n);
    const usdcIn = 1_000_000n; // $1 refuel

    // real sizing read + real quote (QuoterV2 + slot0 band)
    const spot = await readSpot(quoteClient, CHAIN, USDC);
    expect(spot.pool.toLowerCase()).toBe(POOL);
    const quote = await quoteUsdcToWeth(quoteClient, CHAIN, USDC, usdcIn);
    expect(quote.amountOut).toBeGreaterThan(0n);
    expect(quote.minOut).toBeGreaterThan(0n); // invariant #22: never a zero bound
    expect(quote.minOut).toBeLessThanOrEqual(quote.amountOut);

    const relayerBefore = await pub.getBalance({ address: RELAYER_ADDRESS });
    const agentBefore = await usdcBal(account.address);

    const r = await executeRefuel({
      walletClient: refuelWallet,
      publicClient: refuelPublic,
      agent: account.address,
      usdcAddress: USDC,
      chainId: CHAIN,
      quote,
    });

    const relayerAfter = await pub.getBalance({ address: RELAYER_ADDRESS });
    const agentAfter = await usdcBal(account.address);

    // relayer received EXACTLY the delivered ETH
    expect(relayerAfter - relayerBefore).toBe(r.ethDeliveredWei);
    // agent spent EXACTLY amountIn USDC
    expect(agentBefore - agentAfter).toBe(usdcIn);
    // on-chain bound honored (invariant #22)
    expect(r.ethDeliveredWei).toBeGreaterThanOrEqual(quote.minOut);
    // full audit spine present
    expect(r.swapTx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.unwrapTx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.transferTx).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('FDQ-55 B + FDQ-58: recovers stranded WETH — unwraps + sweeps native ETH to the relayer', async () => {
    // reproduce id48's aftermath: the agent holds WETH (a swap that mined, then a
    // later step failed) and NO USDC. Recovery unwraps it and sweeps everything
    // above the gas reserve to the relayer, leaving the agent at ~reserve.
    const RESERVE = 2_000_000_000_000_000n; // 0.002 ETH (DEFAULT_GAS_RESERVE_WEI)
    await test.setBalance({ address: account.address, value: parseEther('1') });
    const stranded = 400_000_000_000_000n; // 0.0004 ETH
    const dep = await wallet.writeContract({
      address: WETH,
      abi: weth9DepositAbi,
      functionName: 'deposit',
      value: stranded,
    });
    await pub.waitForTransactionReceipt({ hash: dep });
    expect(await wethBal(account.address)).toBe(stranded);

    const relayerBefore = await pub.getBalance({ address: RELAYER_ADDRESS });
    const rec = await recoverStranded({
      walletClient: refuelWallet,
      publicClient: refuelPublic,
      agent: account.address,
      chainId: CHAIN,
      gasReserveWei: RESERVE,
    });

    expect(rec.recovered).toBe(true);
    // the relayer receives EXACTLY what recovery reports it delivered
    expect((await pub.getBalance({ address: RELAYER_ADDRESS })) - relayerBefore).toBe(
      rec.recovered ? rec.ethDeliveredWei : 0n,
    );
    // WETH fully unwrapped; agent left at ~reserve (minus the transfer's own gas)
    expect(await wethBal(account.address)).toBe(0n);
    const agentAfter = await pub.getBalance({ address: account.address });
    expect(agentAfter).toBeLessThanOrEqual(RESERVE);
    expect(agentAfter).toBeGreaterThan(RESERVE - 100_000_000_000_000n); // within 0.0001 ETH gas
    if (rec.recovered) expect(rec.ethDeliveredWei).toBeGreaterThan(parseEther('0.9')); // swept the excess
  });
});
