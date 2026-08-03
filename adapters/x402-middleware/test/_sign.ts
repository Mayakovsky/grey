// Test helpers: a real buyer that signs EIP-3009 authorizations, so verify.test exercises the
// actual viem recover round-trip (not a mocked signature). Anvil dev keys — no real funds.
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import type { X402Config, PaymentPayload } from '../src/types.js';
import { USDC_BY_NETWORK } from '../src/prices.js';

export const BUYER_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
export const RELAYER_PK =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
export const buyer = privateKeyToAccount(BUYER_PK);

/** payTo = anvil account #1 (checksummed). */
export const PAY_TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

export const TEST_CFG: X402Config = {
  payTo: PAY_TO,
  network: 'eip155:84532',
  chainId: 84532,
  rpcUrl: 'http://127.0.0.1:8545',
  relayerPrivateKey: RELAYER_PK,
  maxTimeoutSeconds: 120,
  usdc: USDC_BY_NETWORK['eip155:84532'],
  cdp: null,
};

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export interface AuthOverrides {
  from?: `0x${string}`;
  to?: `0x${string}`;
  value?: bigint;
  validAfter?: bigint;
  validBefore?: bigint;
  nonce?: Hex;
  network?: X402Config['network'];
  /** Sign against a different domain (to force a recovery/asset mismatch). */
  domainOverride?: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: `0x${string}`;
  };
}

const NONCE_A = ('0x' + 'ab'.repeat(32)) as Hex;

/** Build + sign a valid X-PAYMENT payload for `cfg`, applying overrides for negative tests. */
export async function signedPayment(
  cfg: X402Config,
  over: AuthOverrides = {},
): Promise<{ payload: PaymentPayload; header: string }> {
  const auth = {
    from: over.from ?? buyer.address,
    to: over.to ?? cfg.payTo,
    value: over.value ?? 250_000n,
    validAfter: over.validAfter ?? 0n,
    validBefore: over.validBefore ?? 9_999_999_999n,
    nonce: over.nonce ?? NONCE_A,
  };
  const signature = await buyer.signTypedData({
    domain: {
      name: over.domainOverride?.name ?? cfg.usdc.name,
      version: over.domainOverride?.version ?? cfg.usdc.version,
      chainId: over.domainOverride?.chainId ?? cfg.chainId,
      verifyingContract: over.domainOverride?.verifyingContract ?? cfg.usdc.address,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: auth,
  });
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: over.network ?? cfg.network,
    payload: {
      signature,
      authorization: {
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        nonce: auth.nonce,
      },
    },
  };
  return { payload, header: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') };
}

/** A public client whose authorizationState returns `used`, simulateContract throws when
 *  `simRevert`, and receipts return `status`. */
export function mockPublicClient(
  opts: { used?: boolean; status?: 'success' | 'reverted'; simRevert?: boolean } = {},
) {
  return {
    readContract: async () => opts.used ?? false,
    simulateContract: async () => {
      if (opts.simRevert) throw new Error('execution reverted: authorization is used');
      return { request: {} };
    },
    waitForTransactionReceipt: async () => ({ status: opts.status ?? 'success' }),
  };
}

export function mockWallet(txHash = '0x' + 'cd'.repeat(32), opts: { throwOn?: string } = {}) {
  const calls: unknown[] = [];
  return {
    calls,
    writeContract: async (args: unknown) => {
      calls.push(args);
      if (opts.throwOn) throw new Error(opts.throwOn);
      return txHash as Hex;
    },
  };
}
