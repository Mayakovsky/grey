// Build the 402 body — strict-canonical x402 `PaymentRequirements` (Forces ruling: maxTimeoutSeconds
// only, no server nonce/expiresAt). One `accepts` entry: the buyer signs an EIP-3009 authorization
// for `maxAmountRequired` USDC to `payTo`, using the `extra` domain hints.
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import type { EvaluationKitEntry } from '@grey/schemas/evaluationKit';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import type { X402Config, PaymentRequirements, CdpBazaarExtension } from './types.js';
import { priceAtomicFor } from './prices.js';

/** Reshape Grey's EvaluationKitEntry into CDP's `extensions.bazaar` wire shape (Task 3). Shared
 *  by challenge.ts, trustRung.ts's buildTrustRungPaymentRequirements, and cdpFacilitator.ts's
 *  buildCdpChallenge — one mapping, not three.
 *
 *  STOP HAND-ROLLING (CDP-PHASE2-use-declareDiscoveryExtension-KOV-directive.md): two prior
 *  attempts at hand-constructing the internal `{info: {input, output}, schema}` object were both
 *  wrong when checked against CDP's live validator. The actual fix — confirmed by reading
 *  `@x402/extensions/bazaar`'s own compiled source (`node_modules/.../dist/cjs/bazaar/index.js`'s
 *  `createBodyDiscoveryExtension`), not just its docs/types — is to call the library's own
 *  `declareDiscoveryExtension()` builder instead of guessing the shape it produces:
 *
 *    - `input` is a REAL, schema-valid EXAMPLE REQUEST VALUE (e.g. `{token_address: "0x...", ...}`)
 *      — becomes `info.input.body`, NOT transport metadata. This was the actual bug behind both
 *      prior failures: `info.input` was being filled with `{type,method,bodyType}` (protocol
 *      description), but CDP's validator checks `info.input.body` against the real request schema
 *      — it needs an example that SATISFIES that schema, not a description of the HTTP transport.
 *    - `inputSchema` is the offering's real request schema — becomes `schema.properties.input
 *      .properties.body` (nested two levels deep, confirmed from the library source — one level
 *      deeper than the last attempt guessed).
 *    - `method`/`bodyType` are top-level config, not nested under `input` — the library places them
 *      into `info.input.method`/`info.input.bodyType` itself. `method` must be passed explicitly
 *      here: it's normally filled at request time by `bazaarResourceServerExtension`'s enrichment
 *      hook, which Grey's hand-rolled Fastify routes never run (no `x402ResourceServer` framework).
 *    - `output: {example, schema}` maps directly to `info.output`/the output branch of `schema`.
 *
 *  `kit.sample` is always populated in practice: every call site here uses `buildEvaluationArtifact`
 *  (not the leaner `buildEvaluationKit`), which always supplies `EVALUATION_SAMPLES[slug]` — a
 *  `Record<OfferingSlug, SampleExchange>` with no gaps. The `?? {}`/conditional fallbacks below are
 *  type-safety only (EvaluationKitEntry.sample is typed optional), never expected to be hit. */
export function buildCdpBazaarExtension(kit: EvaluationKitEntry): CdpBazaarExtension {
  return declareDiscoveryExtension({
    // `method` is stripped from the PUBLIC `DeclareDiscoveryExtensionInput` type (it's designed to
    // be filled by `bazaarResourceServerExtension`'s request-time enrichment hook), but the actual
    // runtime function this resolves to (`createBodyDiscoveryExtension`, confirmed in the compiled
    // source) destructures and honors `method` directly when supplied — matching the library's own
    // doc-comment example (`declareDiscoveryExtension({method: "POST", ...})`). Grey's hand-rolled
    // Fastify routes never run that enrichment hook (no `x402ResourceServer` framework), so it must
    // be supplied here; cast around the type gap rather than the runtime gap.
    method: 'POST',
    bodyType: 'json',
    input: (kit.sample?.request as Record<string, unknown> | undefined) ?? {},
    inputSchema: (kit.inputSchema as Record<string, unknown> | null) ?? {},
    output: kit.sample
      ? { example: kit.sample.response, schema: kit.outputSchema as Record<string, unknown> }
      : undefined,
  } as unknown as Parameters<typeof declareDiscoveryExtension>[0]) as CdpBazaarExtension;
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
