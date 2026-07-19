// @grey/core — public package surface (M3 Phase B skeleton; Phase C adds handler exports).
// D-RESOLVE: consumed via source (main/types → ./src/index.ts); real dist build at M5.
export { buildServer } from './server';
export { createHandlerDeps } from './deps';
export type { HandlerDeps, GreyCoreConfig, CreateHandlerDepsEnv } from './deps';

export { narrowEnvelope, EnvelopeNarrowingError } from './envelope/narrow';
export { buildEnvelope } from './envelope/build';
export type { BuildEnvelopeArgs, EnvelopeSubject, EnvelopeMetadata } from './envelope/build';

export { mapToRecord } from './projection';

export { installValidatorCompiler } from './server/validators';
export type { GreySchemaMarker } from './server/validators';

// Handlers (M3 Phase C) — ingress-agnostic offering handlers (the M5 ACP adapter reuses them).
export { offeringHandlers } from './handlers';
export type { HandlerInput, HandlerResult, OfferingHandler } from './handlers/types';

// Channels (M6 Phase A) — the ChannelIngress seam + the x402 reference adapter. The ACP adapter
// (Phase C) implements the same interface over the same shared offeringHandlers map.
export type { ChannelIngress, OfferingRegistration, ChannelIdentity } from './channels/ingress';
export { X402Adapter } from './channels/x402Adapter';
export type { X402AdapterOptions } from './channels/x402Adapter';
