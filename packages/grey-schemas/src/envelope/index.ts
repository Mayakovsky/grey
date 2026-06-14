// @grey/schemas/envelope — the response envelope type + its compiled validator.
// Mixed barrel: explicit `export type` for the type, `export` for the runtime validator
// (required under verbatimModuleSyntax: true).
export type { GreyResponseEnvelope } from '../generated/v1/GreyResponseEnvelope';
export { envelopeValidator } from '../validators';
