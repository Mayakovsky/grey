// Fail-closed config load — mirrors grey-sweeper's discipline (hand-rolled validation, no zod/ajv).
// Every field required at runtime is validated here or the process refuses to serve paid routes.
import process from 'node:process';
import { getAddress, isHex, type Address, type Hex } from 'viem';
import type { X402Config } from './types.js';
import { isRegisteredNetwork, networkRegistryEntry } from './registry.js';

type Env = Record<string, string | undefined>;

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
  if (!isRegisteredNetwork(networkRaw)) {
    throw new Error(
      `x402-middleware: X402_NETWORK must be eip155:8453 or eip155:84532, got "${networkRaw}"`,
    );
  }
  const network = networkRaw;
  const { chainId, usdc } = networkRegistryEntry(network);

  let payTo: Address;
  try {
    payTo = getAddress(required(env, 'BASE_X402_PAY_TO'));
  } catch {
    throw new Error('x402-middleware: BASE_X402_PAY_TO is not a valid checksummed 0x address');
  }

  const rpcUrl = required(env, 'BASE_RPC_URL');
  const rpcUrlFallback = env['BASE_RPC_URL_FALLBACK']?.trim() || null;

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

  // CDP Facilitator Phase 2: optional — the primary self-hosted relayer path never reads these.
  // All-or-none: any subset set without the rest is a config mistake, fail closed rather than
  // silently treating it as "not configured".
  const cdpApiKeyId = env.CDP_API_KEY_ID?.trim() || null;
  const cdpApiKeySecret = env.CDP_API_KEY_SECRET?.trim() || null;
  const cdpResourceBaseUrl = env.CDP_RESOURCE_BASE_URL?.trim().replace(/\/+$/, '') || null;
  const cdpFieldsPresent = [cdpApiKeyId, cdpApiKeySecret, cdpResourceBaseUrl].map(
    (v) => v !== null,
  );
  if (cdpFieldsPresent.some(Boolean) && !cdpFieldsPresent.every(Boolean)) {
    throw new Error(
      'x402-middleware: CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_RESOURCE_BASE_URL must all be set, or all be absent',
    );
  }
  if (cdpResourceBaseUrl !== null && !/^https:\/\//.test(cdpResourceBaseUrl)) {
    throw new Error('x402-middleware: CDP_RESOURCE_BASE_URL must start with https://');
  }
  const cdp =
    cdpApiKeyId && cdpApiKeySecret && cdpResourceBaseUrl
      ? {
          apiKeyId: cdpApiKeyId,
          apiKeySecret: cdpApiKeySecret,
          resourceBaseUrl: cdpResourceBaseUrl,
        }
      : null;

  return {
    payTo,
    network,
    chainId,
    rpcUrl,
    rpcUrlFallback,
    relayerPrivateKey,
    maxTimeoutSeconds,
    usdc,
    cdp,
  };
}
