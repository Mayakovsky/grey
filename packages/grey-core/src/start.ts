// @grey/core production entry (`pnpm start` / `pnpm dev`). NOT invoked by CI or tests. Builds
// runtime deps (real GREY_DATABASE_URL via @grey/pipeline) + the x402 payment gate, then starts
// the Fastify server. Fails closed: loadX402Config throws if the payment env is missing/invalid,
// so grey-core never serves a paid route without a working gate.
import {
  loadX402Config,
  makeRelayerClients,
  makeX402PreHandler,
  makeX402PaymentPresenceCheck,
  priceUsdFor,
  PAID_SLUGS,
  trustRungEnabled,
  makeTrustRungPreHandler,
  makeTrustRungPaymentPresenceCheck,
  makeCdpX402PreHandler,
  makeCdpX402PaymentPresenceCheck,
} from '@grey/x402-middleware';
import { createHandlerDeps } from './deps';
import { X402Adapter } from './channels/x402Adapter';

const deps = createHandlerDeps();

// Build the paid-route gate. The relayer key is loaded + used entirely inside
// @grey/x402-middleware (invariant #19) — start.ts never names or handles the key.
// CDP/Bazaar alignment Phase 1 revision: the gate is two hooks — see offerings.ts's header
// comment for why (preValidation's body-independent header check must run before Fastify's
// schema validation; the real verify+settle logic stays on preHandler, after it).
const x402Config = loadX402Config();
const relayer = makeRelayerClients(x402Config);
const x402Gate = {
  preValidation: makeX402PaymentPresenceCheck(x402Config),
  preHandler: makeX402PreHandler(x402Config, {
    wallet: relayer.wallet,
    publicClient: relayer.publicClient,
    logger: deps.logger,
  }),
};

// E1-C, Invariant #34: the ONE place trustRungEnabled() is read for the x402 channel — start.ts is
// the boot boundary, same posture as x402Config/relayer above. Default off; Forces-gated to flip.
const trustRungOn = trustRungEnabled();
const trustRungGate = trustRungOn
  ? {
      preValidation: makeTrustRungPaymentPresenceCheck(x402Config),
      preHandler: makeTrustRungPreHandler(x402Config, {
        wallet: relayer.wallet,
        publicClient: relayer.publicClient,
        logger: deps.logger,
      }),
    }
  : undefined;

// CDP Facilitator Phase 2: a PARALLEL settlement path, additive only — mounted at
// /v1/cdp/offerings/<slug> only when CDP_API_KEY_ID/CDP_API_KEY_SECRET are configured
// (x402Config.cdp non-null). Does not touch x402Gate/relayer above; the primary revenue rail is
// unaffected either way. No local relayer clients involved — CDP does its own verify/settle.
const cdpGate = x402Config.cdp
  ? {
      preValidation: makeCdpX402PaymentPresenceCheck(x402Config),
      preHandler: makeCdpX402PreHandler(x402Config, { logger: deps.logger }),
    }
  : undefined;

// M6 Phase A: x402 now boots THROUGH the ChannelIngress seam. The adapter runs the SAME
// buildServer(deps, gate) + listen path this file used inline — zero per-request change.
const port = Number(process.env.GREY_CORE_PORT ?? 3002);
const adapter = new X402Adapter({
  deps,
  gate: x402Gate,
  port,
  relayerAddress: relayer.relayerAddress,
  trustRungEnabled: trustRungOn,
  trustRungGate,
  cdpGate,
  // E1-D: MCP is unconditional (unlike the trust rung) — reuses the SAME relayer clients as the
  // HTTP gate, verify/settle against the same USDC contract, just a different transport.
  mcp: { x402Config, wallet: relayer.wallet, publicClient: relayer.publicClient },
});

// FDQ-66(a) boot-wrapper: record the catalog for identity()/observability. Routes stay statically
// mounted from PAID (server/routes/offerings.ts) — this does NOT drive route registration. Prices
// come from the single source (invariant #20).
for (const slug of PAID_SLUGS) {
  adapter.registerOffering({ slug, priceUsd: priceUsdFor(slug) });
}

adapter.start().catch((err: unknown) => {
  deps.logger.error('grey-core failed to start', {}, err);
  process.exit(1);
});
