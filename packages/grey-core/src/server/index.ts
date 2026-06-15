// @grey/core server factory. buildServer(deps) returns a configured FastifyInstance with the
// delegating validator compiler + probe routes. Phase C adds the paid offering routes (behind
// the x402 placeholder preHandler) and the free resource routes. Tests pass mocked deps and
// drive the app via app.inject() — no port binding, no live DB, no Anthropic.
import Fastify, { type FastifyInstance } from 'fastify';
import type { HandlerDeps } from '../deps';
import { installValidatorCompiler } from './validators';
import { registerProbes } from './routes/probes';
import { registerOfferingRoutes } from './routes/offerings';
import { registerResourceRoutes } from './routes/resources';

export function buildServer(deps: HandlerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  installValidatorCompiler(app);
  registerProbes(app, deps);
  registerOfferingRoutes(app, deps); // paid POST × 7, behind the x402 no-op preHandler
  registerResourceRoutes(app, deps); // free GET × 2
  return app;
}
