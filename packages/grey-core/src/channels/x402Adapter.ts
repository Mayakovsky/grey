// M6 Phase A — `X402Adapter implements ChannelIngress`: a BOOT-WIRING SHELL over what start.ts
// already does. It contains ZERO per-request payment logic — the preHandler/verify/settle/challenge
// path is imported and used untouched (invariant #19: the relayer key never enters grey-core). Its
// only job is to run the existing `buildServer(deps, gate)` + `listen` through the ChannelIngress
// lifecycle so x402 genuinely runs *through* the seam, and to surface the channel's identity/catalog.
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { HandlerDeps } from '../deps';
import { buildServer } from '../server';
import type { McpRouteDeps } from '../server/routes/mcp';
import type { ChannelIdentity, ChannelIngress, OfferingRegistration } from './ingress';

export interface X402AdapterOptions {
  /** The channel-agnostic core deps (same object start.ts builds via createHandlerDeps). */
  deps: HandlerDeps;
  /** The x402 payment gate (built in start.ts from @grey/x402-middleware; used here untouched). */
  gate: preHandlerHookHandler;
  /** Listen port (start.ts passes GREY_CORE_PORT ?? 3002). */
  port: number;
  /** Listen host. Defaults to 0.0.0.0 (the production bind). */
  host?: string;
  /** Informational only: the relayer ADDRESS (never the key) for the boot log line. */
  relayerAddress?: string;
  /** E1-C, Invariant #34: default OFF. start.ts is the one boot boundary that reads
   *  @grey/x402-middleware's trustRungEnabled() and passes the result through here. */
  trustRungEnabled?: boolean;
  /** Required when trustRungEnabled is true — @grey/x402-middleware's makeTrustRungPreHandler(...)
   *  output. NOT the same as `gate`: different slug/price, so a different verify/settle path. */
  trustRungPreHandler?: preHandlerHookHandler;
  /** E1-D: mounts POST /v1/mcp when present. Unconditional (unlike the trust rung) — MCP exposes
   *  the same 7+2 normal offerings, not a blocked one. */
  mcp?: McpRouteDeps;
}

/**
 * x402 channel adapter. FDQ-66(a) boot-wrapper: `registerOffering` records the catalog for
 * `identity()`/observability only — routes stay statically mounted from `PAID` (server/routes/
 * offerings.ts). start()/stop() are the ONLY lifecycle; the per-request path is 100% the existing
 * Fastify server, byte-identical to the pre-adapter inline `buildServer`+`listen`.
 */
export class X402Adapter implements ChannelIngress {
  private readonly deps: HandlerDeps;
  private readonly gate: preHandlerHookHandler;
  private readonly port: number;
  private readonly host: string;
  private readonly relayerAddress?: string;
  private readonly trustRungEnabled: boolean;
  private readonly trustRungPreHandler?: preHandlerHookHandler;
  private readonly mcp?: McpRouteDeps;
  private readonly offerings: OfferingRegistration[] = [];
  private app: FastifyInstance | null = null;
  private boundAddress: string | null = null;

  constructor(opts: X402AdapterOptions) {
    this.deps = opts.deps;
    this.gate = opts.gate;
    this.port = opts.port;
    this.host = opts.host ?? '0.0.0.0';
    this.relayerAddress = opts.relayerAddress;
    this.trustRungEnabled = opts.trustRungEnabled ?? false;
    this.trustRungPreHandler = opts.trustRungPreHandler;
    this.mcp = opts.mcp;
  }

  async start(): Promise<void> {
    if (this.app) throw new Error('X402Adapter: already started');
    // The SAME call start.ts made inline — the seam adds no per-request code.
    const app = buildServer(this.deps, this.gate, {
      trustRungEnabled: this.trustRungEnabled,
      trustRungPreHandler: this.trustRungPreHandler,
      mcp: this.mcp,
    });
    this.app = app;
    this.boundAddress = await app.listen({ port: this.port, host: this.host });
    this.deps.logger.info(
      `grey-core listening on ${this.boundAddress} (x402 gate active` +
        (this.relayerAddress ? `, relayer ${this.relayerAddress})` : ')'),
    );
  }

  async stop(): Promise<void> {
    if (!this.app) return;
    await this.app.close();
    this.app = null;
    this.boundAddress = null;
  }

  registerOffering(reg: OfferingRegistration): void {
    // FDQ-66(a) boot-wrapper: record for identity()/observability only — NO route change.
    this.offerings.push(reg);
  }

  identity(): ChannelIdentity {
    // Receiver-side identity from the read-only config surface (deps/index.ts: payTo + DID).
    return { receivingAddress: this.deps.config.payTo, did: this.deps.config.did };
  }

  /** Observability accessors (not on the slim ChannelIngress interface). */
  listOfferings(): readonly OfferingRegistration[] {
    return this.offerings;
  }
  address(): string | null {
    return this.boundAddress;
  }
}
