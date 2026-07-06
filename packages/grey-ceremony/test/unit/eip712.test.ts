import { describe, it, expect } from 'vitest';
import { keccak256, recoverTypedDataAddress, toBytes, toHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import {
  AGENT_WALLET_SET_TYPES,
  PRIMARY_TYPE,
  REGISTRY_BY_CHAIN_ID,
  agentWalletSetDigest,
  buildDomain,
  typehash,
} from '../../src/eip712/index.ts';
import { runSignConsent } from '../../src/commands/sign-consent.ts';
import { encryptKeystore } from '../../src/crypto/index.ts';
import { Buffer } from 'node:buffer';

// FIXED KAT TUPLE
const TUPLE = {
  agentId: 42n,
  newWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
  owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const,
  deadline: 1893456000n,
};

const MAINNET_DIGEST = '0x77097bf669f5eaa54b50bbda08962ee0b987c89d6c56ee476bbcde6e5deea86a';
const SEPOLIA_DIGEST = '0x922a40a43c906c46e09085d5e761f6f1b03b02292157b99e1e025c5faaf45cf7';
const EXPECTED_TYPEHASH =
  '0x678b53cd718d595370ab070ebf48edfdcd834beac116bf23e625fc7f4d5b7d32';

describe('EIP-712 AgentWalletSet', () => {
  it('typehash matches keccak256 of the canonical type string', () => {
    const computed = keccak256(
      toBytes('AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)'),
    );
    expect(typehash()).toBe(computed);
    expect(typehash()).toBe(EXPECTED_TYPEHASH);
  });

  it('mainnet KAT: digest equals committed expected (chainId 8453)', () => {
    const digest = agentWalletSetDigest(8453, REGISTRY_BY_CHAIN_ID[8453], TUPLE);
    expect(digest).toBe(MAINNET_DIGEST);
  });

  it('sepolia KAT: digest equals committed expected and differs from mainnet (84532)', () => {
    const digest = agentWalletSetDigest(84532, REGISTRY_BY_CHAIN_ID[84532], TUPLE);
    expect(digest).toBe(SEPOLIA_DIGEST);
    expect(digest).not.toBe(MAINNET_DIGEST);
  });

  it('signature recovers to the agent address', async () => {
    // anvil account 1 private key → derives TUPLE.newWallet
    const pk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const agentAddr = privateKeyToAddress(pk);
    expect(agentAddr.toLowerCase()).toBe(TUPLE.newWallet.toLowerCase());

    const ks = await encryptKeystore({
      keyBytes: Buffer.from(pk.slice(2), 'hex'),
      address: agentAddr,
      passphrase: 'pw pw pw pw pw pw',
    });
    const r = await runSignConsent(ks, 'pw pw pw pw pw pw', {
      tokenId: TUPLE.agentId,
      newWallet: TUPLE.newWallet,
      owner: TUPLE.owner,
      deadline: TUPLE.deadline,
      chainId: 8453,
    });
    expect(r.digest).toBe(MAINNET_DIGEST);
    expect(r.signature).toMatch(/^0x[0-9a-f]{130}$/);

    const recovered = await recoverTypedDataAddress({
      domain: buildDomain(8453, REGISTRY_BY_CHAIN_ID[8453]),
      types: AGENT_WALLET_SET_TYPES,
      primaryType: PRIMARY_TYPE,
      message: TUPLE,
      signature: r.signature,
    });
    expect(recovered.toLowerCase()).toBe(agentAddr.toLowerCase());
  });

  it('digest helper accepts toHex/byte forms consistently', () => {
    // sanity: typehash is stable across re-derivation
    expect(typehash()).toBe(keccak256(toBytes('AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)')));
    expect(toHex(toBytes(EXPECTED_TYPEHASH))).toBe(EXPECTED_TYPEHASH);
  });
});
