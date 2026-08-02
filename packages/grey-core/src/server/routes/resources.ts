// Free resource routes: GET /v1/resources/<slug> × 2. No request body, no x402 (free). Calls the
// cache-read handler and wraps the payload in a GreyResponseEnvelope.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';

// Exported so other surfaces (e.g. server/routes/mcp.ts, E1-D) reuse this exact list.
export const FREE = ['daily_greenlight_list', 'scam_alert_feed'] as const;

export function registerResourceRoutes(app: FastifyInstance, deps: HandlerDeps): void {
  for (const slug of FREE) {
    app.get(`/v1/resources/${slug}`, async (_req, reply) => {
      const start = deps.clock().getTime();
      const result = await offeringHandlers[slug]({ offeringId: slug, requirement: {} }, deps);
      const env = buildEnvelope({
        offering: slug,
        payload: result.payload as never,
        requestId: randomUUID(),
        config: deps.config,
        subject: result.subject,
        metadata: {
          costUsd: 0,
          model: 'none',
          latencyMs: deps.clock().getTime() - start,
          timestamp: deps.clock().toISOString(),
          cacheHit: result.cacheHit,
        },
      });
      reply.send(env);
    });
  }
}
