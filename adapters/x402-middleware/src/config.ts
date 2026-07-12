// Fail-closed config load — mirrors grey-sweeper's discipline (hand-rolled validation, no zod/ajv).
// Every field required at runtime is validated here or the process refuses to serve paid routes.
import process from 'node:process';
import { getAddress, isHex, type Address, type Hex } from 'viem';
import type { X402Config, X402Network } from './types.js';
import { USDC_BY_NETWORK } from './prices.js';

type Env = Record<string, string | undefined>;

const NETWORK_CHAIN_ID: Record<X402Network, number> = {
  'eip155:8453': 8453,
  'eip155:84532': 84532,
};

function isNetwork(v: string): v is X402Network {
  return v === 'eip155:8453' || v === 'eip155:84532';
}

function required(env: Env, key: string): string {
  const v = env[key];
  if (v === undefined || v.trim() === '') {
    throw new Error(`x402-middleware: missing required env ${key}`);
  }
  return v.trim();
}

/**
 * Load + validate the x402 config from the environment. NEVER logs values (the relayer key is
 * secret). Throws on any invalid/missing field so grey-core fails closed rather than serving a
 * paid route with a broken payment gate.
 */
export function loadX402Config(env: Env = process.env): X402Config {
  const networkRaw = required(env, 'X402_NETWORK');
  if (!isNetwork(networkRaw)) {
    throw new Error(
      `x402-middleware: X402_NETWORK must be eip155:8453 or eip155:84532, got "${networkRaw}"`,
    );
  }
  const network = networkRaw;

  let payTo: Address;
  try {
    payTo = getAddress(required(env, 'BASE_X402_PAY_TO'));
  } catch {
    throw new Error('x402-middleware: BASE_X402_PAY_TO is not a valid checksummed 0x address');
  }

  const rpcUrl = required(env, 'BASE_RPC_URL');

  const keyRaw = required(env, 'X402_RELAYER_PRIVATE_KEY');
  const relayerPrivateKey = (keyRaw.startsWith('0x') ? keyRaw : `0x${keyRaw}`) as Hex;
  if (!isHex(relayerPrivateKey) || relayerPrivateKey.length !== 66) {
    throw new Error('x402-middleware: X402_RELAYER_PRIVATE_KEY must be a 32-byte hex private key');
  }

  const timeoutRaw = env.X402_MAX_TIMEOUT_SECONDS?.trim();
  const maxTimeoutSeconds = timeoutRaw ? Number(timeoutRaw) : 120;
  if (!Number.isInteger(maxTimeoutSeconds) || maxTimeoutSeconds <= 0) {
    throw new Error(
      `x402-middleware: X402_MAX_TIMEOUT_SECONDS must be a positive integer, got "${timeoutRaw}"`,
    );
  }

  return {
    payTo,
    network,
    chainId: NETWORK_CHAIN_ID[network],
    rpcUrl,
    relayerPrivateKey,
    maxTimeoutSeconds,
    usdc: USDC_BY_NETWORK[network],
  };
}
