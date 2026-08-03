// Build the 402 body — strict-canonical x402 `PaymentRequirements` (Forces ruling: maxTimeoutSeconds
// only, no server nonce/expiresAt). One `accepts` entry: the buyer signs an EIP-3009 authorization
// for `maxAmountRequired` USDC to `payTo`, using the `extra` domain hints.
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import type { EvaluationKitEntry } from '@grey/schemas/evaluationKit';
import type { X402Config, PaymentRequirements, CdpBazaarExtension } from './types.js';
import { priceAtomicFor } from './prices.js';

/** Reshape Grey's EvaluationKitEntry into CDP's `extensions.bazaar` wire shape (Task 3). Shared
 *  by challenge.ts and trustRung.ts's buildTrustRungPaymentRequirements — one mapping, not two. */
export function buildCdpBazaarExtension(kit: EvaluationKitEntry): CdpBazaarExtension {
  return {
    bazaar: {
      info: {
        // Every x402 route buildPaymentRequirements is called for is a paid POST/JSON route
        // (the 2 free GETs never go through x402 at all) — method is not derived per-slug.
        input: { type: 'http', method: 'POST', bodyType: 'json' },
        output: kit.sample ? { example: kit.sample.response } : undefined,
      },
      schema: kit.inputSchema,
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
