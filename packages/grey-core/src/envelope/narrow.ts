// @grey/core envelope narrowing (Q6). j-s-t-t cannot model the envelope's allOf[if/then]
// discrimination, so the generated `payload` is `{}`. narrowEnvelope bridges runtime
// (offeringValidators[slug]) and compile-time (ResponseFor<O>): validate the payload against
// the offering's response schema, then return it typed. Fail-loud on mismatch (a contract
// violation, not a recoverable branch).
import type { GreyResponseEnvelope } from '@grey/schemas/envelope';
import type { OfferingSlug, ResponseFor } from '@grey/schemas/responses';
import { offeringValidators } from '@grey/schemas/validators';

// ajv ErrorObject[] derived from the validators map — avoids a direct `ajv` dependency in grey-core.
type ValidatorErrors = NonNullable<(typeof offeringValidators)[string]['errors']>;

export class EnvelopeNarrowingError extends Error {
  constructor(
    public readonly offering: string,
    public readonly errors: ValidatorErrors,
    message?: string,
  ) {
    super(message ?? `envelope payload failed "${offering}" schema validation`);
    this.name = 'EnvelopeNarrowingError';
  }
}

/**
 * Narrow an envelope's `{}`-typed payload to the offering's response type. Validates via the
 * pre-compiled response validator; throws EnvelopeNarrowingError on discriminator mismatch or
 * payload validation failure.
 */
export function narrowEnvelope<O extends OfferingSlug>(
  env: GreyResponseEnvelope,
  offering: O,
): ResponseFor<O> {
  if (env.offering !== offering) {
    throw new EnvelopeNarrowingError(
      offering,
      [],
      `envelope offering "${String(env.offering)}" does not match requested "${offering}"`,
    );
  }
  const validate = offeringValidators[offering];
  if (!validate) {
    throw new EnvelopeNarrowingError(offering, [], `no response validator for "${offering}"`);
  }
  const payload = env.payload;
  if (!validate(payload)) {
    throw new EnvelopeNarrowingError(offering, validate.errors ?? []);
  }
  return payload as ResponseFor<O>;
}
