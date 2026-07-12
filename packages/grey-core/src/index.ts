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
