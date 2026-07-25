// Cross-provider on-chain history fetch (B.7) — the viem side of the reputation gate, kept OUT of
// the gate core so the gate stays viem-free and pure-testable (the gate takes an injected
// CrossProviderFetch). Ported from plugin-wpv BuyerReputationGate.fetchCrossProviderOnChain.
//
// Counts JobCompleted + JobCreated events whose indexed `client` == the buyer wallet. JobExpired
// has NO buyer field (indexes jobId only) so it is not usable here (B.7). Non-gating (iteration 1
// collects, never enforces), so a failure is fail-soft at the call site.
import { createPublicClient, http, parseAbiItem, getAddress } from 'viem';
import type { CrossProviderFetch } from './buyerReputationGate.js';

// ACP contract on Base (SDK core/constants ACP_CONTRACT_ADDRESSES[base.id]) — verified.
const ACP_CONTRACT_BASE = '0x238E541BfefD82238730D00a2208E5497F1832E0';
const EVT_JOB_COMPLETED = parseAbiItem(
  'event JobCompleted(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, bytes32 reason)',
);
const EVT_JOB_CREATED = parseAbiItem(
  'event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)',
);

/** Build the cross-provider fetcher over an RPC URL. Returns undefined when no URL is configured,
 *  so the gate simply skips cross-provider tallies (they stay 0 — never gated on). */
export function makeCrossProviderFetch(rpcUrl: string | undefined): CrossProviderFetch | undefined {
  if (!rpcUrl || !rpcUrl.trim()) return undefined;
  const client = createPublicClient({ transport: http(rpcUrl) });
  return async (walletLowercased: string) => {
    const clientAddr = getAddress(walletLowercased); // checksummed for the topic filter
    const [completed, created] = await Promise.all([
      client.getLogs({
        address: ACP_CONTRACT_BASE as `0x${string}`,
        event: EVT_JOB_COMPLETED,
        args: { client: clientAddr },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      client.getLogs({
        address: ACP_CONTRACT_BASE as `0x${string}`,
        event: EVT_JOB_CREATED,
        args: { client: clientAddr },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
    ]);
    return { completes_total: completed.length, creates_total: created.length };
  };
}
