// e3-b3 — registry listing + EvaluationKit render (Base). Reuses the single EvaluationKit source
// (Invariant #33 — "no hand-authored per-platform metadata") for the three mech offerings; the
// only mech-specific overlay is price, which is legitimately per-channel by design (Invariant
// #31 — the 0.65× multiplier resolves at the adapter boundary, never baked into the canonical
// EvaluationKit projection itself, so this file has to apply it, same as every channel's own
// listing renderer would for its own multiplier).
//
// Scope note (read before wiring this into an actual on-chain publish step): this produces the
// EvaluationKit-shaped listing data — branding, schemas, sample, mech-resolved price. It does NOT
// publish anything on-chain. Research during e3-b1/b3 found the Mech Marketplace's off-chain
// metadata format (referenced on-chain via ComplementaryServiceMetadata's hash, hosted on IPFS)
// had no publicly documented JSON schema — unlike Bazaar's well-documented `extensions.bazaar`
// shape, there was no confirmed field-by-field spec to target here at the time. RESOLVED
// (BION-DIRECTIVE-30): the real schema was recovered from a live registered mech's actual
// IPFS-hosted document (Gnosis Marketplace subgraph -> gateway.autonolas.tech, verified
// byte-for-byte against its on-chain hash) — see config.ts's `GREY_MECH_PAYLOAD_HASH` doc comment
// for the full derivation, and `adapters/mech-adapter/metadata/mech-payload.json` for Grey's real
// authored content. This file's EvaluationKit render still isn't wired into that document (the
// two serve different purposes — this is per-offering listing data, the payload is the mech's
// whole tool catalog) — the actual IPFS publish + on-chain hash registration remains Forces-
// executed, same pattern as e1-e's "metadata packaging is kov's, on-chain registration is
// Forces'."
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import type { EvaluationKitEntry } from '@grey/schemas/evaluationKit';
import { MECH_OFFERING_SLUGS, mechPriceUsdFor, type MechOfferingSlug } from './prices.js';

export type MechListingEntry = EvaluationKitEntry & { readonly slug: MechOfferingSlug };

/** One EvaluationKit entry per mech offering, with priceUsd overridden to the 0.65×-resolved
 *  mech-channel price (canonical everywhere else in the entry — branding/schemas/sample are
 *  100% reused, not re-authored). */
export function buildMechListing(): readonly MechListingEntry[] {
  return MECH_OFFERING_SLUGS.map((slug) => {
    const kit = buildEvaluationArtifact(slug);
    // `slug` explicit (not just spread from `kit`): buildEvaluationArtifact's return type widens
    // slug back to the full OfferingSlug union, losing the narrow MechOfferingSlug literal the
    // loop variable actually carries — re-assert it explicitly so MechListingEntry's narrower
    // `slug` type checks.
    return { ...kit, slug, priceUsd: mechPriceUsdFor(slug) } satisfies MechListingEntry;
  });
}
