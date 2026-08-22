// BION-DIRECTIVE-113's own required proof — real Hardhat fork of CURRENT Gnosis mainnet state
// (service 3789's real, corrected, payable mech — GNOSIS_MECH_ADDRESS, live since
// BION-DIRECTIVE-111/112's real registration), proving the exact real on-chain call sequence
// scripts/self-test-request.ts makes: read the mech's own real maxDeliveryRate()/paymentType()
// live, derive the real request content hash, then submit request() with those exact values and
// have it succeed for real.
//
// Uses hardhat_impersonateAccount to call AS the real BASE_MECH_PAY_TO address (the real, live
// wallet this self-test uses) without ever needing its private key — fork-only, never broadcasts
// to real Gnosis mainnet. Does NOT exercise real Filebase pinning (that's a real network
// dependency out of scope for a local fork — responsePinner.ts's own real pin/verify/retry logic
// is already covered end-to-end by test/responsePinner.test.ts) — this proof is scoped to what a
// fork CAN prove for real: the on-chain request() call itself, built from the exact real,
// live-read values the script resolves, succeeds and produces a real, correctly-recorded pending
// request. Delivery/settlement by the live, already-running grey-mech-adapter-gnosis.service is
// necessarily NOT provable on a fork (there is no live service watching a local fork) — that's
// what Forces' real run proves, via the script's own Step 4/5 watch phase.
//
// Opt-in, NOT part of `pnpm test` (vitest run) — run via:
//   MECH_FORK_CHAIN=gnosis pnpm --filter @grey/mech-adapter test:fork:self-test-request
import hre from 'hardhat';
import { strict as assert } from 'node:assert';
import { createPublicClient, createWalletClient, custom, decodeEventLog, parseAbi } from 'viem';
import { CHAINS, GNOSIS_MECH_ADDRESS, BASE_MECH_PAY_TO_ADDRESS } from '../../src/config.js';
import { MECH_MARKETPLACE_ABI, REQUEST_STATUS } from '../../src/marketplaceAbi.js';
import { OLAS_MECH_ABI } from '../../src/mechAbi.js';
import { deriveResponseHash } from '../../src/requestContent.js';

const MARKETPLACE_REQUEST_ABI = parseAbi([
  'function request(bytes requestData, uint256 maxDeliveryRate, bytes32 paymentType, address priorityMech, uint256 responseTimeout, bytes paymentData) payable returns (bytes32 requestId)',
]);

describe('mech-adapter — self-test request, real Hardhat fork proof (BION-DIRECTIVE-113)', function () {
  this.timeout(60_000);

  const client = createPublicClient({ transport: custom(hre.network.provider) });
  const marketplaceAddress = CHAINS[100].marketplace.mechMarketplaceProxy;

  before(async () => {
    // Same real infra note as registerLivePreflightOrdering.forkcheck.ts — EDR refuses eth_call
    // exactly AT the pinned fork block for chains without baked-in hardfork-activation history.
    await hre.network.provider.request({ method: 'evm_mine', params: [] });
  });

  it('the real script\'s exact call sequence — live-read maxDeliveryRate/paymentType, derived request hash, then request() — succeeds for real and records a real pending request', async () => {
    // Step 1, same as the script: read the mech's own real, current values — no placeholder, no
    // guessed value.
    const deliveryRate = await client.readContract({ address: GNOSIS_MECH_ADDRESS, abi: OLAS_MECH_ABI, functionName: 'maxDeliveryRate' });
    const paymentType = await client.readContract({ address: GNOSIS_MECH_ADDRESS, abi: OLAS_MECH_ABI, functionName: 'paymentType' });
    assert.equal(deliveryRate, 130_000_000_000_000_000n, 'expected the real corrected mech\'s live price to still be 0.13 xDAI');

    // Step 2, same as the script: the real content-hash derivation (deriveResponseHash), not a
    // hand-rolled keccak — this is the exact function the live adapter's own fetch path expects.
    const requestContent = {
      prompt: 'Grey mech self-test fork-proof (BION-DIRECTIVE-113) — will BTC exceed $150,000 before 2027-01-01?',
      tool: 'prediction_market_research',
      nonce: 'd113-forkcheck-nonce',
      schema_version: '2.0',
      request_context: null,
    };
    const requestDataHash = await deriveResponseHash(JSON.stringify(requestContent));

    // Step 3 — real self-directed request, impersonating the real requester, no private key
    // involved, fork-only.
    await hre.network.provider.request({ method: 'hardhat_impersonateAccount', params: [BASE_MECH_PAY_TO_ADDRESS] });
    const walletClient = createWalletClient({ account: BASE_MECH_PAY_TO_ADDRESS, transport: custom(hre.network.provider) });

    // BION-DIRECTIVE-113 — 300s is the real protocol-enforced MAXIMUM responseTimeout (found by
    // this exact fork proof, first run with 900n: reverted OutOfBounds(900, 60, 300) — see the
    // negative-control test below), not a guess.
    const requestArgs = [requestDataHash, deliveryRate, paymentType, GNOSIS_MECH_ADDRESS, 300n, '0x'] as const;

    const txHash = await walletClient.writeContract({
      address: marketplaceAddress,
      abi: MARKETPLACE_REQUEST_ABI,
      functionName: 'request',
      args: requestArgs,
      value: deliveryRate,
      chain: null,
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    assert.equal(receipt.status, 'success', 'expected the real self-directed request() call to succeed on the fork');

    // Ground truth from the real receipt's own event, same discipline as the real script.
    let requestId: `0x${string}` | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MECH_MARKETPLACE_ABI, eventName: 'MarketplaceRequest', data: log.data, topics: log.topics });
        if (decoded.eventName !== 'MarketplaceRequest') continue;
        requestId = decoded.args.requestIds[0];
        break;
      } catch {
        continue;
      }
    }
    assert.ok(requestId, 'expected a real MarketplaceRequest event in the receipt');
    console.log(`[fork] real self-test requestId: ${requestId}`);

    const status = await client.readContract({ address: marketplaceAddress, abi: MECH_MARKETPLACE_ABI, functionName: 'getRequestStatus', args: [requestId!] });
    assert.equal(status, REQUEST_STATUS.REQUESTED_PRIORITY, 'expected the real request to be recorded as pending (RequestedPriority) immediately after submission');
  });

  it('(negative control) responseTimeout outside [60, 300] seconds really reverts OutOfBounds — the real bound the script\'s default relies on', async () => {
    const deliveryRate = await client.readContract({ address: GNOSIS_MECH_ADDRESS, abi: OLAS_MECH_ABI, functionName: 'maxDeliveryRate' });
    const paymentType = await client.readContract({ address: GNOSIS_MECH_ADDRESS, abi: OLAS_MECH_ABI, functionName: 'paymentType' });
    const requestDataHash = await deriveResponseHash(JSON.stringify({
      prompt: 'BION-DIRECTIVE-113 negative-control fixture — never actually intended to succeed',
      tool: 'prediction_market_research',
      nonce: 'd113-forkcheck-oob-nonce',
      schema_version: '2.0',
      request_context: null,
    }));
    await hre.network.provider.request({ method: 'hardhat_impersonateAccount', params: [BASE_MECH_PAY_TO_ADDRESS] });
    const walletClient = createWalletClient({ account: BASE_MECH_PAY_TO_ADDRESS, transport: custom(hre.network.provider) });

    await assert.rejects(
      walletClient.writeContract({
        address: marketplaceAddress,
        abi: MARKETPLACE_REQUEST_ABI,
        functionName: 'request',
        args: [requestDataHash, deliveryRate, paymentType, GNOSIS_MECH_ADDRESS, 900n, '0x'],
        value: deliveryRate,
        chain: null,
      }),
      /OutOfBounds|reverted/i,
      'expected responseTimeout=900 (this script\'s original, wrong guess) to really revert OutOfBounds(900, 60, 300) on this real forked state',
    );
  });
});
