// @grey/core production entry (`pnpm start` / `pnpm dev`). NOT invoked by CI or tests. Builds
// runtime deps (real GREY_DATABASE_URL via @grey/pipeline) and starts the Fastify server.
import { buildServer } from './server';
import { createHandlerDeps } from './deps';

const deps = createHandlerDeps();
const app = buildServer(deps);
const port = Number(process.env.GREY_CORE_PORT ?? 3002);

app
  .listen({ port, host: '0.0.0.0' })
  .then((addr) => deps.logger.info(`grey-core listening on ${addr}`))
  .catch((err: unknown) => {
    deps.logger.error('grey-core failed to start', {}, err);
    process.exit(1);
  });
