// Full on-chain round-trip behind the anvil skip-gate (existing convention, mirrored from
// adapters/x402-middleware/test/integration.anvil.test.ts — GREY_X402_ANVIL there, GREY_MECH_ANVIL
// here, same naming convention per BION-DIRECTIVE-38). SKIPPED by default (CI + normal runs) — the
// unit suite (safeDeliveryClient.test.ts) covers the pure calldata/signature logic; this proves the
// real network-touching path against a forked Base mainnet: real MechMarketplace, real deployed
// mech (0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8), real Safe v1.3.0 multisig
// (0x5587335a6Fa1Dc7C421f2b87D91C7E9def095872).
//
// To run:
//   anvil --fork-url <base-mainnet-rpc>
//   GREY_MECH_ANVIL=1 MECH_ANVIL_RPC=http://127.0.0.1:8545 pnpm --filter @grey/mech-adapter test
//
// ── Why the multisig's owner is overridden on the fork, and why that's still a real proof ───────
// The real Safe's sole owner is BASE_MECH_AGENT_INSTANCE — a ceremony-generated key this codebase
// never holds (Forces-held, by design; see config.ts's doc comment). A fork test therefore cannot
// sign as the real owner. Standard fork-testing technique used instead: directly overwrite the
// Safe's owners-linked-list storage (`anvil_setStorageAt`) to install a LOCAL test keypair as the
// sole owner, then exercise the REAL Safe v1.3.0 bytecode's REAL `checkNSignatures`/`execTransaction`
// against a REAL signature produced by this package's actual `signSafeTransactionHash` code path.
// Every byte of Safe's signature-verification logic still runs for real; only WHICH address it
// expects differs — a substitution that touches zero verification logic. The owners-mapping base
// slot (2) was not guessed: empirically verified by reading real storage against the real live
// multisig (owners[SENTINEL_OWNERS] == the real owner, and the reverse link) at both directions,
// cross-checked against GnosisSafe.sol's real inheritance-order state-variable declarations
// (Singleton.masterCopy=0, ModuleManager.modules=1, OwnerManager.owners=2/ownerCount=3/threshold=4)
// — both methods agreed exactly.
//
// ── Why a real pending request is created on the fork rather than faked ─────────────────────────
// `deliverToMarketplace` calling into `MechMarketplace.deliverMarketplace` reverts `ZeroAddress()`
// for any request id the Marketplace has no record of (confirmed by reading MechMarketplace.sol's
// real source) — a fabricated request id would make the whole round-trip fail for a reason that
// has nothing to do with the Safe-signing capability under test. So this test creates a REAL,
// valid pending request first (impersonating a funded requester, calling the real
// `MechMarketplace.request(...)`, targeting Grey's real mech as priorityMech) — real preconditions
// on the fork, same "impersonate + fund, then run the real flow" pattern
// integration.anvil.test.ts already established for x402's USDC whale.
//
// Flagged, not hidden: the real mech's real `maxDeliveryRate()` is an unusually large number
// (~1.14e77 wei) — confirmed live against real Base mainnet during D-38 research (two independent
// RPCs, ruling out a decode bug), not a fork artifact. Investigating WHY is out of this directive's
// scope (D-38 is signing-capability only) — worth a separate look, flagged in the status report.
//
// Funding a request at that real rate turned out to be blocked by a genuine anvil/revm tooling
// limitation, not a bug in this adapter's code: bisected directly (see the D-38 status report) —
// `anvil_setBalance` correctly sets and persists balances up to ~1e30 wei, but a plain ETH transfer
// with `value` above roughly 1e35 wei is rejected "insufficient funds" by anvil's own node even
// when the sender's real on-chain balance is independently confirmed (via a fresh `eth_getBalance`
// read) to exceed the transfer amount — same "real, reproducible tooling wall, not a guess" posture
// as BION-DIRECTIVE-26's Hardhat/EDR finding. Worked around the SAME way this test already handles
// the Safe owner: the mech's `maxDeliveryRate` storage slot is overridden on the fork to a small,
// realistic value for this test run only (slot 1, empirically verified against the real live mech
// contract the same way the owners-mapping slot was — reading sequential slots until the known real
// value was found, not derived from source declaration order alone, since OlasMech.sol inherits
// from Mech.sol/Account.sol, whose own storage vars precede it and aren't independently confirmed
// here). This keeps the REST of the test (real request(), real deliverToMarketplace, real Safe
// execTransaction) proceeding through 100% real business logic with a realistic amount, rather than
// leaving the whole round-trip blocked on an unrelated tooling limitation.
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
import { createSafeDeliveryClient } from '../src/safeDeliveryClient.js';
import { OLAS_MECH_ABI } from '../src/mechAbi.js';
import { SAFE_ABI } from '../src/safeAbi.js';
import { MARKETPLACE_ADDRESSES } from '../src/config.js';

const ENABLED = process.env.GREY_MECH_ANVIL === '1';
const RPC = process.env.MECH_ANVIL_RPC ?? 'http://127.0.0.1:8545';
const d = ENABLED ? describe : describe.skip;

const MECH: Address = getAddress('0x1ECFb7c086bCd483cF49405dadA00c3a6294f6A8');
const MULTISIG: Address = getAddress('0x5587335a6Fa1Dc7C421f2b87D91C7E9def095872');
const MARKETPLACE: Address = MARKETPLACE_ADDRESSES.mechMarketplaceProxy;
const SENTINEL_OWNERS: Address = '0x0000000000000000000000000000000000000001';
const OWNERS_MAPPING_BASE_SLOT = 2n; // see file header — empirically verified, not guessed
const MECH_MAX_DELIVERY_RATE_SLOT = 1n; // see file header — empirically verified, not guessed
const TEST_DELIVERY_RATE = 1_000_000_000_000n; // 1e12 wei — realistic, avoids the anvil >~1e35 wall

// request()/requestBatch() aren't in marketplaceAbi.ts's MECH_MARKETPLACE_ABI — this package (the
// SELLER/mech side) never legitimately calls them itself; only a real buyer would. Test-setup-only
// ABI fragment, kept local to this file rather than added to production source.
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

d('mech-adapter — signed Safe delivery, Base mainnet fork (BION-DIRECTIVE-38)', () => {
  it(
    'a real signed execTransaction delivers a real pending request through the real mech + Safe',
    async () => {
      const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
      const publicClient = createPublicClient({ chain, transport: http(RPC) });

      // ── 1. Install a local test keypair as the multisig's sole owner ──────────────────────────
      const testPrivateKey = generatePrivateKey();
      const testAccount = privateKeyToAccount(testPrivateKey);
      // Gas money for testAccount to submit execTransaction itself (separate from the Safe tx's
      // own `value`, which stays 0 — deliverToMarketplace is nonpayable). A real deployment funds
      // BASE_MECH_AGENT_INSTANCE the same way, outside this codebase (ceremony/Forces-lane).
      await test.setBalance({ address: testAccount.address, value: 10n ** 18n });
      await test.setStorageAt({
        address: MULTISIG,
        index: ownersMappingSlot(SENTINEL_OWNERS),
        value: pad(testAccount.address),
      });
      await test.setStorageAt({
        address: MULTISIG,
        index: ownersMappingSlot(testAccount.address),
        value: pad(SENTINEL_OWNERS),
      });
      const owners = await publicClient.readContract({ address: MULTISIG, abi: SAFE_ABI, functionName: 'getOwners' });
      expect(owners).toEqual([testAccount.address]);
      const threshold = await publicClient.readContract({ address: MULTISIG, abi: SAFE_ABI, functionName: 'getThreshold' });
      expect(threshold).toBe(1n); // unchanged — only the owner identity was substituted

      // ── 2. Override the mech's absurdly large real maxDeliveryRate for this run (see file
      // header — a genuine anvil tooling limitation with >~1e35 wei transfers, not a bug here) ───
      await test.setStorageAt({
        address: MECH,
        index: pad(`0x${MECH_MAX_DELIVERY_RATE_SLOT.toString(16)}`),
        value: pad(`0x${TEST_DELIVERY_RATE.toString(16)}`),
      });
      const deliveryRate = await publicClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'maxDeliveryRate' });
      expect(deliveryRate).toBe(TEST_DELIVERY_RATE);

      // ── 3. Create a real, valid pending request targeting Grey's real mech ────────────────────
      const paymentType = await publicClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'paymentType' });

      const requesterPrivateKey = generatePrivateKey();
      const requester = privateKeyToAccount(requesterPrivateKey).address;
      await test.setBalance({ address: requester, value: deliveryRate + 10n ** 18n });
      await test.impersonateAccount({ address: requester });

      const requestData = '0x1234' as const;
      const { result: requestId } = await publicClient.simulateContract({
        address: MARKETPLACE,
        abi: MARKETPLACE_REQUEST_ABI,
        functionName: 'request',
        args: [requestData, deliveryRate, paymentType, MECH, 60n, '0x'],
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
          args: [requestData, deliveryRate, paymentType, MECH, 60n, '0x'],
        }),
        value: deliveryRate,
        chain,
      });
      const requestReceipt = await publicClient.waitForTransactionReceipt({ hash: requestTxHash });
      expect(requestReceipt.status).toBe('success');
      await test.stopImpersonatingAccount({ address: requester });

      // ── 4. Build + sign the Safe execTransaction wrapping deliverToMarketplace ────────────────
      const deliveryData = '0xd311be9e' as const; // opaque delivery blob — content is application-defined
      const client = createSafeDeliveryClient(RPC, MULTISIG, testAccount);
      const signed = await client.buildSignedDelivery(MECH, [requestId], [deliveryData]);
      expect(signed.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);

      const deliveriesBefore = await publicClient.readContract({
        address: MECH,
        abi: OLAS_MECH_ABI,
        functionName: 'numTotalDeliveries',
      });

      // ── 5. Execute it for real on the fork ─────────────────────────────────────────────────────
      const { txHash, success } = await client.executeDelivery(signed);
      expect(success).toBe(true);
      const deliverReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      expect(deliverReceipt.status).toBe('success');

      // ── 6. Independently verify — not just trusting the client's own success flag ─────────────
      const deliveriesAfter = await publicClient.readContract({
        address: MECH,
        abi: OLAS_MECH_ABI,
        functionName: 'numTotalDeliveries',
      });
      expect(deliveriesAfter).toBe(deliveriesBefore + 1n);

      const deliverLog = deliverReceipt.logs.find((log) => log.address.toLowerCase() === MECH.toLowerCase());
      expect(deliverLog).toBeDefined();
    },
    60_000,
  );
});
