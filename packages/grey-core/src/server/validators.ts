// @grey/core Fastify validator wiring (Q1 / FDQ-4 / FDQ-8). Fastify's setValidatorCompiler is
// configured to DELEGATE to @grey/schemas/validators' pre-compiled Ajv2020 validators — no
// second ajv instance (HC#12), no @fastify/ajv-compiler dependency (FDQ-8). Routes attach a
// `$grey` marker on their schema; the compiler resolves it to the matching pre-compiled
// validator. NO setSerializerCompiler (FDQ-4) — response correctness is enforced by
// narrowEnvelope at the route layer, not via Fastify serialization.
import type { FastifyInstance } from 'fastify';
import type { OfferingSlug, PaidOfferingSlug } from '@grey/schemas/responses';
import {
  offeringValidators,
  offeringRequestValidators,
  envelopeValidator,
} from '@grey/schemas/validators';

/** Marker attached to a route's schema (body/response/etc.) so the compiler can pick a validator. */
export interface GreySchemaMarker {
  kind: 'request' | 'response' | 'envelope';
  offering?: OfferingSlug;
}

/** Install the delegating validator compiler. Call once on the FastifyInstance before routes. */
export function installValidatorCompiler(app: FastifyInstance): void {
  app.setValidatorCompiler(({ schema }) => {
    const marker = (schema as { $grey?: GreySchemaMarker }).$grey;
    if (!marker) {
      throw new Error('grey validator compiler: route schema is missing its `$grey` marker');
    }
    if (marker.kind === 'envelope') {
      return envelopeValidator;
    }
    if (!marker.offering) {
      throw new Error(`grey validator compiler: a "${marker.kind}" marker must carry an offering`);
    }
    if (marker.kind === 'request') {
      const v = offeringRequestValidators[marker.offering as PaidOfferingSlug];
      if (!v) {
        throw new Error(`grey validator compiler: no request validator for "${marker.offering}"`);
      }
      return v;
    }
    // marker.kind === 'response'
    const v = offeringValidators[marker.offering];
    if (!v) {
      throw new Error(`grey validator compiler: no response validator for "${marker.offering}"`);
    }
    return v;
  });
}
