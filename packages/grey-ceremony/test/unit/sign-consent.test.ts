import { describe, it, expect, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { privateKeyToAddress } from 'viem/accounts';
import { encryptKeystore } from '../../src/crypto/index.ts';
import type { KeystoreJson } from '../../src/crypto/index.ts';
import { runSignConsent, validateSignConsent } from '../../src/commands/sign-consent.ts';
import { runAddress } from '../../src/commands/address.ts';

const AGENT_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const AGENT_ADDR = privateKeyToAddress(AGENT_PK);
const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PW = 'sign consent test passphrase ok';

let keystore: KeystoreJson;

beforeEach(async () => {
  keystore = await encryptKeystore({
    keyBytes: Buffer.from(AGENT_PK.slice(2), 'hex'),
    address: AGENT_ADDR,
    passphrase: PW,
  });
});

describe('sign-consent validation', () => {
  it('errors when --owner is missing', () => {
    expect(() =>
      validateSignConsent({
        tokenId: 1n,
        newWallet: AGENT_ADDR,
        owner: '',
        deadline: 1n,
        chainId: 8453,
      }),
    ).toThrow(/--owner is required/);
  });

  it('errors when --new-wallet is not a valid address', () => {
    expect(() =>
      validateSignConsent({
        tokenId: 1n,
        newWallet: 'not-an-address',
        owner: OWNER,
        deadline: 1n,
        chainId: 8453,
      }),
    ).toThrow(/not a valid address/);
  });

  it('errors when the agent key does not match --new-wallet', async () => {
    await expect(
      runSignConsent(keystore, PW, {
        tokenId: 1n,
        newWallet: OWNER, // not the agent address
        owner: OWNER,
        deadline: 1n,
        chainId: 8453,
      }),
    ).rejects.toThrow(/does not match --new-wallet/);
  });

  it('signs successfully when the agent key matches --new-wallet', async () => {
    const r = await runSignConsent(keystore, PW, {
      tokenId: 7n,
      newWallet: AGENT_ADDR,
      owner: OWNER,
      deadline: 1893456000n,
      chainId: 8453,
    });
    expect(r.signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(r.message.agentId).toBe(7n);
  });
});

describe('keystore integrity (Layer-3 derive-and-assert)', () => {
  it('passes for an untampered keystore', async () => {
    const out = await runAddress(keystore, PW);
    expect(out.address.toLowerCase()).toBe(AGENT_ADDR.toLowerCase());
  });

  it('throws an integrity error when the clear address field is mutated', async () => {
    const tampered: KeystoreJson = {
      ...keystore,
      address: OWNER, // valid address but not the one the key derives to
    };
    await expect(runAddress(tampered, PW)).rejects.toThrow(
      /Keystore integrity check failed/,
    );
  });

  it('reveals the private key only when asked', async () => {
    const out = await runAddress(keystore, PW, true);
    expect(out.privateKey?.toLowerCase()).toBe(AGENT_PK.toLowerCase());
  });
});
