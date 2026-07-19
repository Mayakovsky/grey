// @grey/core production entry (`pnpm start` / `pnpm dev`). NOT invoked by CI or tests. Builds
// runtime deps (real GREY_DATABASE_URL via @grey/pipeline) + the x402 payment gate, then starts
// the Fastify server. Fails closed: loadX402Config throws if the payment env is missing/invalid,
// so grey-core never serves a paid route without a working gate.
import {
  loadX402Config,
  makeRelayerClients,
  makeX402PreHandler,
  priceUsdFor,
  PAID_SLUGS,
} from '@grey/x402-middleware';
import { createHandlerDeps } from './deps';
import { X402Adapter } from './channels/x402Adapter';

const deps = createHandlerDeps();

// Build the paid-route gate. The relayer key is loaded + used entirely inside
// @grey/x402-middleware (invariant #19) — start.ts never names or handles the key.
const x402Config = loadX402Config();
const relayer = makeRelayerClients(x402Config);
const x402PreHandler = makeX402PreHandler(x402Config, {
  wallet: relayer.wallet,
  publicClient: relayer.publicClient,
  logger: deps.logger,
});

// M6 Phase A: x402 now boots THROUGH the ChannelIngress seam. The adapter runs the SAME
// buildServer(deps, gate) + listen path this file used inline — zero per-request change.
const port = Number(process.env.GREY_CORE_PORT ?? 3002);
const adapter = new X402Adapter({
  deps,
  gate: x402PreHandler,
  port,
  relayerAddress: relayer.relayerAddress,
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
