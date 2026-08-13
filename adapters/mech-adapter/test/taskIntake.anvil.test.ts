// Full task-intake loop, end to end, behind the anvil skip-gate (BION-DIRECTIVE-43) — same
// convention as safeDeliveryClient.anvil.test.ts (GREY_MECH_ANVIL=1, skipped by default). Submits
// a real request via MechMarketplace.request(...) against a forked Base mainnet (reusing D-38's
// own owner/maxDeliveryRate override setup rather than re-deriving it — see that file's header for
// why each override is there and how the slots were verified), lets MechAdapter.pollAndRespond
// detect it, route it through the REAL grey-core `predictionMarketResearch` handler (never
// re-implemented here), sign and deliver the real response, and confirms via the same independent
// checks D-38 used: numTotalDeliveries() incremented, a real Deliver-shaped log present.
//
// The pieces NOT hit against a real external service: IPFS content fetch and Filebase pinning.
// requestContent.ts's fetchRequestContent hits a real gateway in production; this test stubs
// `global.fetch` to serve real-shaped content (built the same way requestContent.test.ts's
// fixtures were, from real observed examples) for the exact hash this test derives and uses as the
// real on-chain `requestData`. BION-DIRECTIVE-45: pinning now runs for real in production
// (responsePinner.ts) — this test injects `createStubResponsePinner` (an in-memory, no-network
// fake) rather than a real Filebase account, same "stub/local pinning target" posture the
// directive itself asks for; responsePinner.ts's own real pin/verify/retry logic is separately
// covered end-to-end by test/responsePinner.test.ts against a stubbed fetch. Everything else — the
// request, the event, the routing, the signature, the delivery — is real.
import { describe, it, expect } from 'vitest';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  pad,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { offeringHandlers } from '@grey/core';
import type { HandlerDeps, OfferingHandler } from '@grey/core';
import type { OfferingSlug } from '@grey/schemas/responses';
import { MechAdapter } from '../src/mechAdapter.js';
import { createSafeDeliveryClient } from '../src/safeDeliveryClient.js';
import { OLAS_MECH_ABI } from '../src/mechAbi.js';
import { SAFE_ABI } from '../src/safeAbi.js';
import { MARKETPLACE_ADDRESSES, type MechAdapterConfig } from '../src/config.js';
import { deriveResponseHash } from '../src/requestContent.js';
import { createStubResponsePinner } from '../src/responsePinner.js';
import { silentLogger } from '../src/logger.js';

const ENABLED = process.env.GREY_MECH_ANVIL === '1';
const RPC = process.env.MECH_ANVIL_RPC ?? 'http://127.0.0.1:8545';
const d = ENABLED ? describe : describe.skip;

// BION-DIRECTIVE-55: the real, corrected mech (the original, 0x1ECFb7c086bCd483cF49405dadA00c3a
// 6294f6A8, is permanently inert — see config.ts's GREY_MECH_ADDRESS_ORIGINAL_INERT).
const MECH: Address = getAddress('0x1a2A7b94726B0711E5365C0D73E79C77a9256Ad7');
const MULTISIG: Address = getAddress('0x5587335a6Fa1Dc7C421f2b87D91C7E9def095872');
const MARKETPLACE: Address = MARKETPLACE_ADDRESSES.mechMarketplaceProxy;
const SENTINEL_OWNERS: Address = '0x0000000000000000000000000000000000000001';
const OWNERS_MAPPING_BASE_SLOT = 2n; // see safeDeliveryClient.anvil.test.ts — empirically verified
const MECH_MAX_DELIVERY_RATE_SLOT = 1n; // ditto
const TEST_DELIVERY_RATE = 1_000_000_000_000n; // 1e12 wei — avoids the anvil >~1e35 wei wall

const MARKETPLACE_REQUEST_ABI = parseAbi([
  'function request(bytes requestData, uint256 maxDeliveryRate, bytes32 paymentType, address priorityMech, uint256 responseTimeout, bytes paymentData) payable returns (bytes32 requestId)',
]);

function ownersMappingSlot(key: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [key, OWNERS_MAPPING_BASE_SLOT]));
}

const chain = defineChain({
  id: 8453,
  name: 'base-fork',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

d('mech-adapter — full task-intake loop, Base mainnet fork (BION-DIRECTIVE-43)', () => {
  it(
    'detects a real request, routes it through the real handler, signs and delivers a real response',
    async () => {
      const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
      const publicClient = createPublicClient({ chain, transport: http(RPC) });

      // ── 1. Install a local test keypair as the multisig's sole owner (same as D-38) ───────────
      const testPrivateKey = generatePrivateKey();
      const testAccount = privateKeyToAccount(testPrivateKey);
      await test.setBalance({ address: testAccount.address, value: 10n ** 18n });
      await test.setStorageAt({ address: MULTISIG, index: ownersMappingSlot(SENTINEL_OWNERS), value: pad(testAccount.address) });
      await test.setStorageAt({ address: MULTISIG, index: ownersMappingSlot(testAccount.address), value: pad(SENTINEL_OWNERS) });
      expect(await publicClient.readContract({ address: MULTISIG, abi: SAFE_ABI, functionName: 'getOwners' })).toEqual([
        testAccount.address,
      ]);

      // ── 2. Override the mech's real (anvil-hostile) maxDeliveryRate (same as D-38) ────────────
      await test.setStorageAt({
        address: MECH,
        index: pad(`0x${MECH_MAX_DELIVERY_RATE_SLOT.toString(16)}`),
        value: pad(`0x${TEST_DELIVERY_RATE.toString(16)}`),
      });
      const deliveryRate = await publicClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'maxDeliveryRate' });
      expect(deliveryRate).toBe(TEST_DELIVERY_RATE);

      // ── 3. Create a real, valid pending request — real content shape, real derived hash ───────
      const requestContent = {
        prompt: 'Will ETH exceed $10,000 by end of 2026?',
        tool: 'prediction_market_research',
        nonce: 'd43-fork-test-nonce',
        schema_version: '2.0',
        request_context: null,
      };
      const requestContentJson = JSON.stringify(requestContent);
      const requestDataHash = await deriveResponseHash(requestContentJson);

      const paymentType = await publicClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'paymentType' });
      const requesterPrivateKey = generatePrivateKey();
      const requester = privateKeyToAccount(requesterPrivateKey).address;
      await test.setBalance({ address: requester, value: deliveryRate + 10n ** 18n });
      await test.impersonateAccount({ address: requester });

      const { result: requestId } = await publicClient.simulateContract({
        address: MARKETPLACE,
        abi: MARKETPLACE_REQUEST_ABI,
        functionName: 'request',
        args: [requestDataHash, deliveryRate, paymentType, MECH, 60n, '0x'],
        account: requester,
        value: deliveryRate,
      });
      const requesterWallet = createWalletClient({ chain, transport: http(RPC), account: requester });
      const requestTxHash = await requesterWallet.sendTransaction({
        account: requester,
        to: MARKETPLACE,
        data: encodeFunctionData({
          abi: MARKETPLACE_REQUEST_ABI,
          functionName: 'request',
          args: [requestDataHash, deliveryRate, paymentType, MECH, 60n, '0x'],
        }),
        value: deliveryRate,
        chain,
      });
      const requestReceipt = await publicClient.waitForTransactionReceipt({ hash: requestTxHash });
      expect(requestReceipt.status).toBe('success');
      await test.stopImpersonatingAccount({ address: requester });

      // ── 4. Stub the IPFS fetch for exactly this hash — see file header for why. Scoped to the
      // gateway URL only: viem's own RPC transport also goes through globalThis.fetch, and every
      // anvil/chain call must pass through untouched. ──────────────────────────────────────────
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('gateway.autonolas.tech') && urlStr.includes(requestDataHash.slice(2))) {
          return new Response(requestContentJson, { status: 200 });
        }
        return originalFetch(url as never, init);
      }) as typeof fetch;

      try {
        // ── 5. Real MechAdapter, real handler, real signed-delivery client ───────────────────────
        const config: MechAdapterConfig = {
          payToAddress: requester,
          poolWalletAddress: requester,
          rpcUrl: RPC,
          databaseUrl: 'postgres://unused-in-this-test',
          observeOnly: false,
        };
        const adapter = new MechAdapter({
          config,
          safeDeliveryClient: createSafeDeliveryClient(RPC, MULTISIG, testAccount),
          publicClient,
          handlers: { prediction_market_research: offeringHandlers.prediction_market_research } as Record<OfferingSlug, OfferingHandler>,
          handlerDeps: {} as HandlerDeps, // predictionMarketResearch's real implementation touches no deps
          responsePinner: createStubResponsePinner(),
          logger: silentLogger(),
        });

        const deliveriesBefore = await publicClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'numTotalDeliveries' });

        const result = await adapter.pollAndRespond(
          MECH,
          MARKETPLACE,
          requestReceipt.blockNumber,
          requestReceipt.blockNumber,
          ['prediction_market_research'] as OfferingSlug[],
        );

        expect(result.routingErrors).toEqual([]);
        expect(result.routed).toHaveLength(1);
        expect(result.routed[0].requestId).toBe(requestId);
        expect(result.routed[0].slug).toBe('prediction_market_research');
        expect(result.delivery?.success).toBe(true);
        expect(result.delivery?.txHash).toBeDefined();

        // ── 6. Independently verify — not just trusting the client's own success flag ───────────
        const deliverReceipt = await publicClient.waitForTransactionReceipt({ hash: result.delivery!.txHash! });
        expect(deliverReceipt.status).toBe('success');
        const deliveriesAfter = await publicClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'numTotalDeliveries' });
        expect(deliveriesAfter).toBe(deliveriesBefore + 1n);
        const deliverLog = deliverReceipt.logs.find((log) => log.address.toLowerCase() === MECH.toLowerCase());
        expect(deliverLog).toBeDefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
    60_000,
  );
});
