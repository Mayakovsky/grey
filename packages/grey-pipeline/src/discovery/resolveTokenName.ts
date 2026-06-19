// grey-pipeline/discovery — resolveTokenName (M3.5 Q2 (a)-trivial / FDQ-7).
// Lifted verbatim from plugin-wpv/src/acp/JobRouter.ts:84-164 (logic unchanged). Standalone
// function; deps = `fetch` + `process.env.BASE_RPC_URL` only (no DB, no Anthropic). Resolves a
// token address → project name via DexScreener (chain-agnostic), falling back to on-chain ERC-20
// name() for EVM addresses, then canonicalizes the result.

import { canonicalizeProjectName } from './helpers';
import { createLogger } from '../logger';

const log = createLogger({ component: 'resolveTokenName' });

/**
 * Resolve a token address to a project name using DexScreener API.
 * Works across ALL chains (Ethereum, Base, Solana, Arbitrum, BSC, 60+).
 * Falls back to on-chain ERC-20 name() for EVM addresses if DexScreener fails.
 * Returns null if resolution fails entirely.
 */
export async function resolveTokenName(tokenAddress: string): Promise<string | null> {
  // Tier 1: DexScreener (chain-agnostic, covers all major tokens)
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(tokenAddress)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (resp.ok) {
      const data = (await resp.json()) as {
        pairs?: Array<{ baseToken?: { address?: string; name?: string; symbol?: string } }>;
      };
      const match = data.pairs?.find(
        (p) => p.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase(),
      );
      if (match?.baseToken?.name) {
        const raw = match.baseToken.name;
        const canonical = canonicalizeProjectName(raw) ?? raw;
        if (canonical !== raw) {
          log.info('DexScreener resolved token name (canonicalized)', {
            tokenAddress: tokenAddress.slice(0, 10),
            raw,
            canonical,
          });
        } else {
          log.info('DexScreener resolved token name', {
            tokenAddress: tokenAddress.slice(0, 10),
            name: raw,
          });
        }
        return canonical;
      }
    }
  } catch {
    /* DexScreener unavailable — try fallback */
  }

  // Tier 2: On-chain ERC-20 name() for 0x addresses
  if (tokenAddress.startsWith('0x')) {
    const rpcUrls = [
      'https://ethereum-rpc.publicnode.com',
      process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
    ];
    for (const rpcUrl of rpcUrls) {
      try {
        const resp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: tokenAddress, data: '0x06fdde03' }, 'latest'], // name()
          }),
          signal: AbortSignal.timeout(3000),
        });
        const data = (await resp.json()) as { result?: string };
        if (data.result && data.result !== '0x' && data.result.length > 2) {
          // ABI-decode the string: skip 0x + 64 chars offset + 64 chars length, then read hex pairs
          const hex = data.result.slice(2); // remove 0x
          if (hex.length >= 192) {
            // offset(64) + length(64) + data(64+)
            const strLen = parseInt(hex.slice(64, 128), 16);
            if (strLen > 0 && strLen < 100) {
              const strHex = hex.slice(128, 128 + strLen * 2);
              const name = Buffer.from(strHex, 'hex').toString('utf8').trim();
              if (name.length > 0 && /^[\x20-\x7E]+$/.test(name)) {
                const canonical = canonicalizeProjectName(name) ?? name;
                if (canonical !== name) {
                  log.info('ERC-20 name() resolved (canonicalized)', {
                    tokenAddress: tokenAddress.slice(0, 10),
                    raw: name,
                    canonical,
                    rpcUrl: rpcUrl.slice(0, 30),
                  });
                } else {
                  log.info('ERC-20 name() resolved', {
                    tokenAddress: tokenAddress.slice(0, 10),
                    name,
                    rpcUrl: rpcUrl.slice(0, 30),
                  });
                }
                return canonical;
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}
