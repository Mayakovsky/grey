import { describe, it, expect } from 'vitest';
import { settle } from '../src/settle.js';
import { TEST_CFG, signedPayment, mockPublicClient, mockWallet } from './_sign.js';
import type { TransferAuthorization } from '../src/types.js';

async function authAndSig() {
  const { payload } = await signedPayment(TEST_CFG);
  const a = payload.payload.authorization;
  const auth: TransferAuthorization = {
    from: a.from,
    to: a.to,
    value: BigInt(a.value),
    validAfter: BigInt(a.validAfter),
    validBefore: BigInt(a.validBefore),
    nonce: a.nonce,
  };
  return { auth, signature: payload.payload.signature };
}

describe('settle — DIRECT via relayer', () => {
  it('submits transferWithAuthorization and returns the tx hash on a success receipt', async () => {
    const { auth, signature } = await authAndSig();
    const wallet = mockWallet('0x' + 'ee'.repeat(32));
    const r = await settle(TEST_CFG, auth, signature, {
      wallet,
      publicClient: mockPublicClient({ status: 'success' }),
    });
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(wallet.calls).toHaveLength(1);
    const call = wallet.calls[0] as { functionName: string; args: unknown[]; address: string };
    expect(call.functionName).toBe('transferWithAuthorization');
    expect(call.address).toBe(TEST_CFG.usdc.address);
    // from,to,value,validAfter,validBefore,nonce,v,r,s
    expect(call.args).toHaveLength(9);
    expect(typeof call.args[6]).toBe('number'); // v is uint8
  });

  it('throws on a reverted receipt (no successful settlement)', async () => {
    const { auth, signature } = await authAndSig();
    await expect(
      settle(TEST_CFG, auth, signature, {
        wallet: mockWallet(),
        publicClient: mockPublicClient({ status: 'reverted' }),
      }),
    ).rejects.toThrow(/reverted/);
  });
});
