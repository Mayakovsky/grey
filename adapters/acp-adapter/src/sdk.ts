// The ONE place the real @virtuals-protocol/acp-node-v2 SDK is loaded. It is a RUNTIME-ONLY
// external, resolved from node_modules on the box exactly as the ElizaOS agent resolves it. The
// import specifier is typed `string` (not a literal) so tsc does NOT statically resolve the SDK —
// the adapter core, its unit tests, and the dist build need none of the SDK's heavy transitive
// tree (@account-kit / @alchemy / @privy-io / socket.io — the M5 VPS OOM). main.ts calls this;
// tests inject a fake AcpSdkBundle instead.
import { base } from 'viem/chains';
import type { AcpSdkBundle, AcpAgentLike, AcpJobSession, AcpRoomEntry, AcpAgentConfig } from './acpTypes.js';

const ACP_SDK_SPECIFIER = '@virtuals-protocol/acp-node-v2';

/** The subset of the SDK's runtime surface the bundle maps (kept structural — no SDK types). */
interface RawAcpSdk {
  AcpAgent: { create(opts: { provider: unknown; transport: unknown }): Promise<AcpAgentLike> };
  PrivyAlchemyEvmProviderAdapter: {
    create(opts: {
      walletAddress: `0x${string}`;
      walletId: string;
      signerPrivateKey: string;
      chains: unknown[];
    }): Promise<unknown>;
  };
  AssetToken: { usdc(amount: number, chainId: number): unknown };
  SseTransport: new () => unknown;
  JobSession: new (
    agent: AcpAgentLike,
    walletAddress: string,
    jobId: string,
    chainId: number,
    roles: string[],
    entries: AcpRoomEntry[],
  ) => AcpJobSession;
}

export async function createRealSdkBundle(): Promise<AcpSdkBundle> {
  // `: string` (not a literal) → tsc treats the dynamic import as Promise<any>, never resolving
  // the module at compile time. Runtime resolves it from node_modules.
  const spec: string = ACP_SDK_SPECIFIER;
  const sdk = (await import(spec)) as unknown as RawAcpSdk;

  return {
    async createAgent(config: AcpAgentConfig, onEntry): Promise<AcpAgentLike> {
      // Q6: reuse the Privy non-custodial wallet 0xa966… — the SAME signer the pm2 agent uses, so
      // the Virtuals registration + Agent ID + accrued history are preserved across the cutover.
      const provider = await sdk.PrivyAlchemyEvmProviderAdapter.create({
        walletAddress: config.agentWalletAddress as `0x${string}`,
        walletId: config.privyWalletId,
        signerPrivateKey: config.privySignerKey,
        chains: [base],
      });
      // FDQ-63 (verified against the dist): create() + start() perform NO on-chain write — pure
      // client construct + SSE subscribe + REST reads. The only write risk is the adapter's own
      // setBudget/submit, which OBSERVE_ONLY suppresses.
      const agent = await sdk.AcpAgent.create({ provider, transport: new sdk.SseTransport() });
      agent.on('entry', (session, entry) => onEntry(session, entry));
      return agent;
    },
    assetUsdc(amount: number, chainId: number): unknown {
      return sdk.AssetToken.usdc(amount, chainId);
    },
    newSession(agent, providerAddress, jobId, chainId, entries): AcpJobSession {
      // Mirrors the SDK's own hydrateSessions() for a polled funded job with no hydrated session.
      return new sdk.JobSession(agent, providerAddress, jobId, chainId, ['provider'], entries);
    },
  };
}
