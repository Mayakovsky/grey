// Build the 402 body — strict-canonical x402 `PaymentRequirements` (Forces ruling: maxTimeoutSeconds
// only, no server nonce/expiresAt). One `accepts` entry: the buyer signs an EIP-3009 authorization
// for `maxAmountRequired` USDC to `payTo`, using the `extra` domain hints.
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import type { EvaluationKitEntry } from '@grey/schemas/evaluationKit';
import type { X402Config, PaymentRequirements, CdpBazaarExtension } from './types.js';
import { priceAtomicFor } from './prices.js';

/** Reshape Grey's EvaluationKitEntry into CDP's `extensions.bazaar` wire shape (Task 3). Shared
 *  by challenge.ts, trustRung.ts's buildTrustRungPaymentRequirements, and cdpFacilitator.ts's
 *  buildCdpChallenge — one mapping, not three.
 *
 *  `schema` nesting (fixed per CDP-PHASE2-fix-bazaar-schema-nesting-KOV-directive.md): CDP's docs
 *  state the rule directly — "ensure your extension input strictly matches schema.properties.input"
 *  — confirmed against a second, independent worked example (Binance's B402 x402v2 Bazaar
 *  implementation). `schema` must describe the shape of `info` itself (`{input, output}`), NOT the
 *  offering's real request-body schema directly at its root. The real per-offering request schema
 *  now lives one level deeper, at `schema.properties.input`. Previously `schema` WAS the raw
 *  request-body schema (requiring e.g. `token_address`), so CDP's validator rejected `info` against
 *  it — `info` has `input`/`output` keys, not `token_address`. `output` is in `properties` but not
 *  `required`: `info.output` is only ever `{example: <response>}` (an example value, not a formal
 *  schema) or absent (no `kit.sample`) — matching the advisory (not required) severity CDP's own
 *  validator gives `bazaar.info.output`. */
export function buildCdpBazaarExtension(kit: EvaluationKitEntry): CdpBazaarExtension {
  return {
    bazaar: {
      info: {
        // Every x402 route buildPaymentRequirements is called for is a paid POST/JSON route
        // (the 2 free GETs never go through x402 at all) — method is not derived per-slug.
        input: { type: 'http', method: 'POST', bodyType: 'json' },
        output: kit.sample ? { example: kit.sample.response } : undefined,
      },
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          input: kit.inputSchema ?? {},
          output: { type: 'object' },
        },
        required: ['input'],
      },
    },
  };
}

export function buildPaymentRequirements(
  cfg: X402Config,
  slug: string,
  resource: string,
  error?: string,
): PaymentRequirements {
  // E1-B: every x402 route carries its own Bazaar discovery metadata in the 402 body — the
  // single EvaluationKit source (Invariant #33), not a hand-authored per-route literal.
  // buildEvaluationArtifact (not the leaner buildEvaluationKit) so extensions.bazaar.info.output
  // can carry a real sample — Round 2's evaluation artifacts, reused rather than re-authored.
  const kit = buildEvaluationArtifact(slug as OfferingSlug);
  const body: PaymentRequirements = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        maxAmountRequired: priceAtomicFor(slug).toString(),
        resource,
        description: `Grey ${slug} offering`,
        mimeType: 'application/json',
        payTo: cfg.payTo,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        asset: cfg.usdc.address,
        extra: {
          name: cfg.usdc.name,
          version: cfg.usdc.version,
          bazaar: {
            discoverable: kit.discoverable,
            serviceName: kit.serviceName,
            tags: kit.tags,
            description: kit.description,
            inputSchema: kit.inputSchema,
            outputSchema: kit.outputSchema,
            iconUrl: kit.iconUrl,
          },
        },
      },
    ],
    extensions: buildCdpBazaarExtension(kit),
  };
  if (error) body.error = error;
  return body;
}
