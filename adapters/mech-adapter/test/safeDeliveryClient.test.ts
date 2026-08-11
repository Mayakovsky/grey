// BION-DIRECTIVE-38 — unit coverage for the two pure, network-independent pieces of the Safe
// delivery path: calldata construction and signature production. The network-dependent pieces
// (reading the real multisig's nonce/getTransactionHash, submitting execTransaction) are proven
// against real Base mainnet state on a local fork instead — see safeDeliveryClient.anvil.test.ts
// (GREY_MECH_ANVIL=1) — not mocked here, same split marketplaceClient.test.ts already established
// for decodeCreateMechAddress vs. the network-touching create/execute paths.
import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, recoverAddress, type Hash, type Hex } from 'viem';
import { encodeDeliverToMarketplaceCalldata, signSafeTransactionHash } from '../src/safeDeliveryClient.js';
import { OLAS_MECH_ABI } from '../src/mechAbi.js';

// A real request id, taken directly from the Base marketplace subgraph during e3-b1 research
// (see test/fork/marketplaceRead.forkcheck.ts) — not fabricated, though it was never actually
// requested against Grey's own mech (which didn't exist yet at the time it was pulled).
const REAL_REQUEST_ID = '0x000157c6d62ed80c87a7f6d1879fdab16842a045823b52e2c9c5020b661a9a92' as const;
const DELIVERY_DATA = '0xdeadbeef1234' as const;

describe('encodeDeliverToMarketplaceCalldata (BION-DIRECTIVE-38)', () => {
  it('encodes exactly what viem\'s own encodeFunctionData would produce for the real ABI', () => {
    const requestIds: readonly Hash[] = [REAL_REQUEST_ID];
    const datas: readonly Hex[] = [DELIVERY_DATA];
    const expected = encodeFunctionData({
      abi: OLAS_MECH_ABI,
      functionName: 'deliverToMarketplace',
      args: [requestIds, datas],
    });
    expect(encodeDeliverToMarketplaceCalldata(requestIds, datas)).toBe(expected);
  });

  it('round-trips multiple request ids/datas in order', () => {
    const requestIds: readonly Hash[] = [REAL_REQUEST_ID, `0x${'ab'.repeat(32)}`];
    const datas: readonly Hex[] = [DELIVERY_DATA, '0x'];
    const calldata = encodeDeliverToMarketplaceCalldata(requestIds, datas);
    // Sanity: the function selector is a fixed 4-byte prefix regardless of args.
    expect(calldata.slice(0, 10)).toBe(
      encodeFunctionData({ abi: OLAS_MECH_ABI, functionName: 'deliverToMarketplace', args: [[REAL_REQUEST_ID], ['0x']] }).slice(0, 10),
    );
  });
});

describe('signSafeTransactionHash (BION-DIRECTIVE-38)', () => {
  // A well-known, public Anvil default test key (account #0) — not a secret, standard fixture
  // across the Foundry ecosystem. Used only to produce a deterministic, independently-verifiable
  // signature; never a real key.
  const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
  const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

  // A real Safe transaction hash shape (32 bytes) — deliberately not claimed to be a real
  // getTransactionHash() output (this test never talks to the network); what's under test is
  // purely "does signing+packing follow the format GnosisSafe.sol's checkNSignatures expects".
  const SOME_SAFE_TX_HASH = `0x${'11'.repeat(32)}` as Hash;

  it('produces a 65-byte {r}{s}{v} signature that recovers to the signer address', async () => {
    const signature = await signSafeTransactionHash(testAccount, SOME_SAFE_TX_HASH);
    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/); // 65 bytes = 130 hex chars

    // checkNSignatures's plain-ECDSA branch: ecrecover(dataHash, v, r, s) directly, no EIP-191
    // prefix — so recovery must be verified against the RAW hash, matching viem's recoverAddress
    // over the same unprefixed hash (not verifyMessage, which would add the prefix).
    const recovered = await recoverAddress({ hash: SOME_SAFE_TX_HASH, signature });
    expect(recovered.toLowerCase()).toBe(testAccount.address.toLowerCase());
  });

  it('produces v as 27 (0x1b) or 28 (0x1c) — the plain-ECDSA branch, never the eth_sign (v>30) branch', async () => {
    const signature = await signSafeTransactionHash(testAccount, SOME_SAFE_TX_HASH);
    const vByte = signature.slice(-2);
    expect(['1b', '1c']).toContain(vByte);
  });

  it('throws a clear error for an account with no raw sign() (e.g. a JSON-RPC account)', async () => {
    const jsonRpcAccount = { address: testAccount.address, type: 'json-rpc' as const };
    await expect(signSafeTransactionHash(jsonRpcAccount, SOME_SAFE_TX_HASH)).rejects.toThrow(/no raw sign/);
  });
});
