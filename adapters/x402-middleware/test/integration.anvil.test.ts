// Full on-chain round-trip behind the anvil skip-gate (existing convention: GREY_*_ANVIL=1).
// SKIPPED by default (CI + normal runs) — the unit suite mocks chain I/O; this exercises the real
// transferWithAuthorization execution. Live Base Sepolia is Phase D's job; this is a fork-test.
//
// To run:
//   anvil --fork-url <base-mainnet-rpc>            # a Base fork with real USDC
//   GREY_X402_ANVIL=1 \
//   X402_ANVIL_RPC=http://127.0.0.1:8545 \
//   X402_ANVIL_USDC_WHALE=0x<a-base-USDC-holder> \
//   pnpm --filter @grey/x402-middleware test
import { describe, it, expect } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  defineChain,
  getAddress,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { settle } from '../src/settle.js';
import { verifyPayment, decodePaymentHeader } from '../src/verify.js';
import { USDC_BY_NETWORK } from '../src/prices.js';
import { RELAYER_PK, buyer, signedPayment } from './_sign.js';
import type { X402Config, TransferAuthorization } from '../src/types.js';

const ENABLED = process.env.GREY_X402_ANVIL === '1';
const RPC = process.env.X402_ANVIL_RPC ?? 'http://127.0.0.1:8545';
const WHALE = process.env.X402_ANVIL_USDC_WHALE as Address | undefined;
const d = ENABLED && WHALE ? describe : describe.skip;

const chain = defineChain({
  id: 8453,
  name: 'base-fork',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const usdc = USDC_BY_NETWORK['eip155:8453'];

const relayer = privateKeyToAccount(RELAYER_PK);
const PAY_TO = getAddress('0x000000000000000000000000000000000000dEaD'); // burn-ish receiver for the test

const cfg: X402Config = {
  payTo: PAY_TO,
  network: 'eip155:8453',
  chainId: 8453,
  rpcUrl: RPC,
  relayerPrivateKey: RELAYER_PK,
  maxTimeoutSeconds: 120,
  usdc,
};

d('x402 anvil integration (fork Base, real USDC)', () => {
  it('402 → sign → settle: buyer-signed EIP-3009 moves USDC via the relayer', async () => {
    const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
    const publicClient = createPublicClient({ chain, transport: http(RPC) });
    const wallet = createWalletClient({ account: relayer, chain, transport: http(RPC) });

    // Fund buyer + relayer with gas ETH, and buyer with USDC via whale impersonation.
    await test.setBalance({ address: buyer.address, value: 10n ** 18n });
    await test.setBalance({ address: relayer.address, value: 10n ** 18n });
    await test.setBalance({ address: WHALE as Address, value: 10n ** 18n });
    await test.impersonateAccount({ address: WHALE as Address });
    const fundHash = await wallet.sendTransaction({
      account: WHALE as Address,
      to: usdc.address,
      data: encodeFunctionData({
        abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
        functionName: 'transfer',
        args: [buyer.address, 1_000_000n], // 1 USDC
      }),
      chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    await test.stopImpersonatingAccount({ address: WHALE as Address });

    const balanceOf = (who: Address) =>
      publicClient.readContract({
        address: usdc.address,
        abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [who],
      }) as Promise<bigint>;

    const payToBefore = await balanceOf(PAY_TO);

    // Buyer signs a real EIP-3009 authorization for 0.25 USDC to payTo.
    const { header } = await signedPayment(cfg, { value: 250_000n });
    const decoded = decodePaymentHeader(header);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const verdict = await verifyPayment(cfg, decoded.payload, 250_000n, publicClient as never, nowSec);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;

    // Relayer settles on-chain.
    const auth: TransferAuthorization = verdict.authorization;
    const { txHash } = await settle(cfg, auth, verdict.signature as Hex, { wallet: wallet as never, publicClient: publicClient as never });
    expect(txHash).toMatch(/^0x/);

    const payToAfter = await balanceOf(PAY_TO);
    expect(payToAfter - payToBefore).toBe(250_000n); // USDC actually landed on payTo
  }, 60_000);
});
