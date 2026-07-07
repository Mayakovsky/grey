// Layer 3 command — `sign-consent`: sign the EIP-712 AgentWalletSet consent.

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { getAddress, isAddress, keccak256, toBytes, toHex } from 'viem';
import { privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { parseKeystore } from '../crypto/index.ts';
import {
  AGENT_WALLET_SET_TYPES,
  PRIMARY_TYPE,
  agentWalletSetDigest,
  buildDomain,
  resolveRegistry,
  typehash,
} from '../eip712/index.ts';
import type { AgentWalletSetMessage } from '../eip712/index.ts';
import { zero } from '../memory/index.ts';
import { promptPassphrase } from '../prompt/index.ts';
import { unlockKeystore } from './address.ts';
import { confirmYes } from './confirm.ts';
import { deadlineWarning } from './deadline.ts';

export interface SignConsentParams {
  tokenId: bigint;
  newWallet: string;
  owner: string;
  deadline: bigint;
  chainId: number;
  registry?: string;
}

export interface SignConsentResult {
  typehash: Hex;
  structHash: Hex;
  domainSeparator: Hex;
  digest: Hex;
  signature: Hex;
  message: AgentWalletSetMessage;
  verifyingContract: Address;
}

/** Validate addresses + required fields, returning normalized values. */
export function validateSignConsent(params: SignConsentParams): {
  newWallet: Address;
  owner: Address;
  verifyingContract: Address;
} {
  if (!params.owner) {
    throw new Error('--owner is required');
  }
  if (!isAddress(params.newWallet)) {
    throw new Error(`--new-wallet is not a valid address: ${params.newWallet}`);
  }
  if (!isAddress(params.owner)) {
    throw new Error(`--owner is not a valid address: ${params.owner}`);
  }
  const verifyingContract = resolveRegistry(
    params.chainId,
    params.registry as Address | undefined,
  );
  return {
    newWallet: getAddress(params.newWallet),
    owner: getAddress(params.owner),
    verifyingContract,
  };
}

/**
 * Core sign-consent logic. The agent key (recovered from the keystore) must
 * derive to --new-wallet. Produces the digest pieces + a 65-byte signature.
 * `keystoreObj` + `passphrase` injected for testability; no broadcast.
 */
export async function runSignConsent(
  keystoreObj: unknown,
  passphrase: string,
  params: SignConsentParams,
): Promise<SignConsentResult> {
  const { newWallet, owner, verifyingContract } = validateSignConsent(params);

  const unlocked = await unlockKeystore(keystoreObj, passphrase);
  try {
    const agentAddr = privateKeyToAddress(toHex(unlocked.keyBytes));
    if (getAddress(agentAddr) !== newWallet) {
      throw new Error(
        `Agent key does not match --new-wallet: key is ${agentAddr}, --new-wallet is ${newWallet}`,
      );
    }

    const message: AgentWalletSetMessage = {
      agentId: params.tokenId,
      newWallet,
      owner,
      deadline: params.deadline,
    };

    const domain = buildDomain(params.chainId, verifyingContract);
    const digest = agentWalletSetDigest(params.chainId, verifyingContract, message);

    const account = privateKeyToAccount(toHex(unlocked.keyBytes));
    const signature = await account.signTypedData({
      domain,
      types: AGENT_WALLET_SET_TYPES,
      primaryType: PRIMARY_TYPE,
      message,
    });

    return {
      typehash: typehash(),
      structHash: structHash(message),
      domainSeparator: domainSeparatorHash(domain.name as string, domain.version as string, params.chainId, verifyingContract),
      digest,
      signature,
      message,
      verifyingContract,
    };
  } finally {
    zero(unlocked.keyBytes);
  }
}

// --- digest component helpers (for operator transparency / display) ---

function structHash(message: AgentWalletSetMessage): Hex {
  // keccak256(typehash ++ agentId ++ newWallet ++ owner ++ deadline), each 32 bytes.
  const parts = Buffer.concat([
    Buffer.from(typehash().slice(2), 'hex'),
    pad32(message.agentId),
    pad32Address(message.newWallet),
    pad32Address(message.owner),
    pad32(message.deadline),
  ]);
  return keccak256(toHex(parts));
}

function domainSeparatorHash(
  name: string,
  version: string,
  chainId: number,
  verifyingContract: Address,
): Hex {
  const domainTypehash = keccak256(
    toBytes(
      'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
    ),
  );
  const parts = Buffer.concat([
    Buffer.from(domainTypehash.slice(2), 'hex'),
    Buffer.from(keccak256(toBytes(name)).slice(2), 'hex'),
    Buffer.from(keccak256(toBytes(version)).slice(2), 'hex'),
    pad32(BigInt(chainId)),
    pad32Address(verifyingContract),
  ]);
  return keccak256(toHex(parts));
}

function pad32(value: bigint): Buffer {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  const buf = Buffer.from(hex, 'hex');
  const out = Buffer.alloc(32);
  buf.copy(out, 32 - buf.length);
  return out;
}

function pad32Address(addr: Address): Buffer {
  const buf = Buffer.from(addr.slice(2), 'hex');
  const out = Buffer.alloc(32);
  buf.copy(out, 32 - buf.length);
  return out;
}

/** CLI action. */
export async function signConsentAction(opts: {
  agentKeyfile: string;
  tokenId: string;
  newWallet: string;
  owner: string;
  deadline: string;
  chainId: string;
  registry?: string;
}): Promise<void> {
  const keystore = parseKeystore(readFileSync(opts.agentKeyfile, 'utf8'));
  const params: SignConsentParams = {
    tokenId: BigInt(opts.tokenId),
    newWallet: opts.newWallet,
    owner: opts.owner,
    deadline: BigInt(opts.deadline),
    chainId: Number(opts.chainId),
    registry: opts.registry,
  };
  const dw = deadlineWarning(params.deadline, Math.floor(Date.now() / 1000));
  if (dw) process.stderr.write(dw + '\n');
  const passphrase = await promptPassphrase();
  const r = await runSignConsent(keystore, passphrase, params);

  process.stdout.write(`typehash:         ${r.typehash}\n`);
  process.stdout.write(`domainSeparator:  ${r.domainSeparator}\n`);
  process.stdout.write(`structHash:       ${r.structHash}\n`);
  process.stdout.write(`digest:           ${r.digest}\n`);
  process.stdout.write('message:\n');
  process.stdout.write(`  agentId:   ${r.message.agentId}\n`);
  process.stdout.write(`  newWallet: ${r.message.newWallet}\n`);
  process.stdout.write(`  owner:     ${r.message.owner}\n`);
  process.stdout.write(`  deadline:  ${r.message.deadline}\n`);

  if (!(await confirmYes())) {
    process.stderr.write('Aborted.\n');
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`signature: ${r.signature}\n`);
}
