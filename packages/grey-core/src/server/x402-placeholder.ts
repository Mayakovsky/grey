// @grey/core x402 placeholder preHandler (M3 seam; M5 fills). Registered on the paid-routes
// scope in Phase C. In M3 it is a strict no-op: it does NOT read or write the `X-PAYMENT`
// header, does NOT parse EIP-712, does NOT touch the chain. The signature matches the M5
// preHandler shape so the real x402 middleware drops in without re-architecture.
import type { FastifyRequest } from 'fastify';

export async function x402Placeholder(req: FastifyRequest): Promise<void> {
  // M5 fills: parse X-PAYMENT (base64 EIP-712), validate signature, broadcast, gate on success.
  req.log.debug('x402 placeholder preHandler (no-op in M3)');
}
