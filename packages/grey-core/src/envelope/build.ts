// @grey/core envelope builder — assemble a GreyResponseEnvelope from a typed payload + the
// offering discriminator + correlation/identity metadata. The route layer (Phase C) calls this
// after a handler returns its payload, then narrowEnvelope round-trips it in tests.
import type { GreyResponseEnvelope } from '@grey/schemas/envelope';
import type { OfferingSlug, ResponseFor } from '@grey/schemas/responses';
import type { GreyCoreConfig } from '../deps';

export interface EnvelopeSubject {
  tokenAddress: string | null;
  projectName: string;
}

export interface EnvelopeMetadata {
  costUsd: number;
  model: string;
  latencyMs: number;
  timestamp: string;
  cacheHit: boolean;
}

export interface BuildEnvelopeArgs<O extends OfferingSlug> {
  offering: O;
  payload: ResponseFor<O>;
  requestId: string;
  config: GreyCoreConfig;
  subject: EnvelopeSubject;
  metadata: EnvelopeMetadata;
}

/** Build a success (payload-bearing) envelope. */
export function buildEnvelope<O extends OfferingSlug>(args: BuildEnvelopeArgs<O>): GreyResponseEnvelope {
  return {
    schemaVersion: 'v1',
    offering: args.offering,
    requestId: args.requestId,
    agent: {
      did: args.config.did,
      name: args.config.name,
      runtime: args.config.runtime,
    },
    subject: args.subject,
    payload: args.payload,
    metadata: args.metadata,
  };
}
