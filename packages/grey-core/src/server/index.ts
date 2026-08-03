// @grey/core server factory. buildServer(deps, x402Gate) returns a configured FastifyInstance
// with the delegating validator compiler + probes + the 7 paid offering routes (gated by the x402
// gate) + the 2 free resource routes. The gate is a REQUIRED param — Fastify-specific, so it
// stays out of the ingress-agnostic HandlerDeps; start.ts injects the real @grey/x402-middleware gate,
// tests inject a pass-through. Tests drive via app.inject() — no port binding, no live DB, no Anthropic.
import Fastify, { type FastifyInstance } from 'fastify';
import type { HandlerDeps } from '../deps';
import { installValidatorCompiler } from './validators';
import { registerProbes } from './routes/probes';
import { registerOfferingRoutes, type X402Gate } from './routes/offerings';
import { registerCdpOfferingRoutes } from './routes/cdpOfferings';
import { registerResourceRoutes } from './routes/resources';
import { registerDiscoveryRoutes } from './routes/discovery';
import { registerTrustRungRoute } from './routes/trustRung';
import { registerMcpRoute, type McpRouteDeps } from './routes/mcp';

export interface BuildServerOptions {
  /** E1-C, Invariant #34: default OFF. Only start.ts (reading @grey/x402-middleware's
   *  trustRungEnabled()) and trust-rung-specific tests should ever pass `true`. */
  trustRungEnabled?: boolean;
  /** Required when trustRungEnabled is true — both hooks from @grey/x402-middleware's trust-rung
   *  factories. NOT the general x402Gate (different slug/price). */
  trustRungGate?: X402Gate;
  /** CDP Facilitator Phase 2: mounts POST /v1/cdp/offerings/<slug> × 7 when present — presence
   *  IS the enable signal (unlike trustRungEnabled, there's no separate boolean; "is CDP
   *  configured" and "was a gate built for it" are the same question). start.ts only builds this
   *  when X402Config.cdp is non-null; tests omit it entirely to leave the routes unmounted. */
  cdpGate?: X402Gate;
  /** E1-D: mounts POST /v1/mcp when present. Optional so existing callers (and most tests) are
   *  unaffected; start.ts always passes it (MCP is unconditional — only the trust rung is gated). */
  mcp?: McpRouteDeps;
}

export function buildServer(
  deps: HandlerDeps,
  x402Gate: X402Gate,
  opts: BuildServerOptions = {},
): FastifyInstance {
  const trustRungEnabled = opts.trustRungEnabled ?? false;
  const app = Fastify({ logger: false });
  installValidatorCompiler(app);
  registerProbes(app, deps);
  registerOfferingRoutes(app, deps, x402Gate); // paid POST × 7, behind the x402 gate
  registerResourceRoutes(app, deps); // free GET × 2
  registerDiscoveryRoutes(app, { trustRungEnabled }); // E1-B: free Bazaar discovery index, GET × 2
  if (trustRungEnabled) {
    if (!opts.trustRungGate) {
      throw new Error('buildServer: trustRungEnabled requires opts.trustRungGate');
    }
    registerTrustRungRoute(app, deps, opts.trustRungGate); // E1-C, default off
  }
  if (opts.cdpGate) registerCdpOfferingRoutes(app, deps, opts.cdpGate); // CDP Facilitator Phase 2
  if (opts.mcp) registerMcpRoute(app, deps, opts.mcp); // E1-D: paid MCP tools, POST × 1
  return app;
}
