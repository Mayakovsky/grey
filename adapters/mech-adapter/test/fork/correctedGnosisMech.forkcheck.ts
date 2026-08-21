// BION-DIRECTIVE-110's own required proof — real Hardhat fork of CURRENT Gnosis mainnet state
// (service 3789 already Deployed, real multisig, real first — broken — mech already registered),
// proving the CORRECTED createMech call (a second mech for the same service, mirroring Base's own
// D-53/55 precedent) succeeds and produces a mech whose maxDeliveryRate() reads back exactly the
// real, Forces-confirmed price (0.13 xDAI = 130_000_000_000_000_000 wei), not the metadata hash.
//
// Uses hardhat_impersonateAccount to call AS the real BASE_MECH_PAY_TO address (the real service
// owner) without ever needing its private key — a standard, safe local-fork-only technique; this
// NEVER broadcasts to real Gnosis mainnet, only to the in-process forked node. This directive does
// NOT authorize the real signed call (that stays Forces' passphrase-gated action, unchanged) —
// this file is the proof it will work, not the execution itself.
//
// Opt-in, NOT part of `pnpm test` (vitest run) — run via:
//   MECH_FORK_CHAIN=gnosis pnpm --filter @grey/mech-adapter test:fork
import hre from 'hardhat';
import { strict as assert } from 'node:assert';
import { createPublicClient, createWalletClient, custom, encodeAbiParameters, decodeAbiParameters } from 'viem';
import { CHAINS, BASE_MECH_PAY_TO_ADDRESS } from '../../src/config.js';
import { MECH_MARKETPLACE_ABI } from '../../src/marketplaceAbi.js';
import { decodeCreateMechAddress } from '../../src/marketplaceClient.js';

const REAL_SERVICE_ID = 3789n; // real, already-Deployed service on Gnosis (D-105/106)
const REAL_DELIVERY_RATE_WEI = 130_000_000_000_000_000n; // 0.13 xDAI, Forces' confirmed real price (D-110 §0)

describe('mech-adapter — corrected Gnosis mech, real Hardhat fork proof (BION-DIRECTIVE-110)', function () {
  this.timeout(60_000);

  const client = createPublicClient({ transport: custom(hre.network.provider) });
  const gnosisNativeFactory = CHAINS[100].marketplace.factories.NATIVE;
  const marketplaceAddress = CHAINS[100].marketplace.mechMarketplaceProxy;

  it('the real, correctly-encoded payload decodes back to exactly the real delivery rate (sanity check on the fixture itself)', () => {
    const payload = encodeAbiParameters([{ type: 'uint256' }], [REAL_DELIVERY_RATE_WEI]);
    const [decoded] = decodeAbiParameters([{ type: 'uint256' }], payload);
    assert.equal(decoded, REAL_DELIVERY_RATE_WEI);
  });

  it('corrected createMech call succeeds for real on the fork, and the resulting mech maxDeliveryRate() reads back exactly the real price', async () => {
    // Real-account impersonation — no private key involved, fork-only, never broadcasts to real
    // Gnosis mainnet.
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [BASE_MECH_PAY_TO_ADDRESS],
    });
    const walletClient = createWalletClient({
      account: BASE_MECH_PAY_TO_ADDRESS,
      transport: custom(hre.network.provider),
    });

    const payload = encodeAbiParameters([{ type: 'uint256' }], [REAL_DELIVERY_RATE_WEI]);

    const txHash = await walletClient.writeContract({
      address: marketplaceAddress,
      abi: MECH_MARKETPLACE_ABI,
      functionName: 'create',
      args: [REAL_SERVICE_ID, gnosisNativeFactory, payload],
      chain: null,
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    assert.equal(receipt.status, 'success', 'expected the corrected createMech call to succeed on the fork');

    // Ground truth is the real CreateMech event in the real receipt, same discipline as the real
    // executeCreateMech path (marketplaceClient.ts) — never trust a pre-broadcast prediction.
    const correctedMechAddress = decodeCreateMechAddress(receipt.logs, txHash);
    console.log(`[fork] corrected Gnosis mech deployed at: ${correctedMechAddress}`);

    const maxDeliveryRate = await client.readContract({
      address: correctedMechAddress,
      abi: [
        { type: 'function', name: 'maxDeliveryRate', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
      ] as const,
      functionName: 'maxDeliveryRate',
    });
    console.log(`[fork] corrected mech maxDeliveryRate() = ${maxDeliveryRate}`);
    assert.equal(maxDeliveryRate, REAL_DELIVERY_RATE_WEI, 'expected the corrected mech to charge exactly the real, confirmed price');
  });
});
