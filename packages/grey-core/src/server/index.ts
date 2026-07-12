// @grey/core server factory. buildServer(deps, x402PreHandler) returns a configured FastifyInstance
// with the delegating validator compiler + probes + the 7 paid offering routes (gated by the x402
// preHandler) + the 2 free resource routes. The gate is a REQUIRED param — Fastify-specific, so it
// stays out of the ingress-agnostic HandlerDeps; start.ts injects the real @grey/x402-middleware gate,
// tests inject a pass-through. Tests drive via app.inject() — no port binding, no live DB, no Anthropic.
import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify';
import type { HandlerDeps } from '../deps';
import { installValidatorCompiler } from './validators';
import { registerProbes } from './routes/probes';
import { registerOfferingRoutes } from './routes/offerings';
import { registerResourceRoutes } from './routes/resources';

export function buildServer(deps: HandlerDeps, x402PreHandler: preHandlerHookHandler): FastifyInstance {
  const app = Fastify({ logger: false });
  installValidatorCompiler(app);
  registerProbes(app, deps);
  registerOfferingRoutes(app, deps, x402PreHandler); // paid POST × 7, behind the x402 gate
  registerResourceRoutes(app, deps); // free GET × 2
  return app;
}
