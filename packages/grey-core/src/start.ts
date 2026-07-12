// @grey/core production entry (`pnpm start` / `pnpm dev`). NOT invoked by CI or tests. Builds
// runtime deps (real GREY_DATABASE_URL via @grey/pipeline) + the x402 payment gate, then starts
// the Fastify server. Fails closed: loadX402Config throws if the payment env is missing/invalid,
// so grey-core never serves a paid route without a working gate.
import { loadX402Config, makeRelayerClients, makeX402PreHandler } from '@grey/x402-middleware';
import { buildServer } from './server';
import { createHandlerDeps } from './deps';

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

const app = buildServer(deps, x402PreHandler);
const port = Number(process.env.GREY_CORE_PORT ?? 3002);

app
  .listen({ port, host: '0.0.0.0' })
  .then((addr) => deps.logger.info(`grey-core listening on ${addr} (x402 gate active, relayer ${relayer.relayerAddress})`))
  .catch((err: unknown) => {
    deps.logger.error('grey-core failed to start', {}, err);
    process.exit(1);
  });
