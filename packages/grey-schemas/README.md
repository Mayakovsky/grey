# @grey/schemas

Shared domain types for the verification pipeline — the single type contract
consumed by `@grey/pipeline` and (from Movement 3) `@grey/core`.

Promoted wholesale from `@grey/pipeline/src/types.ts` in Movement 2.

## What's exported

- **Enums:** `WhitepaperStatus`, `ClaimCategory`, `Verdict`, `MathValidity`,
  `Plausibility`, `Originality`, `Consistency` (runtime values, not erasable types)
- **Core interfaces:** `WhitepaperRecord`, `ExtractedClaim`, `ClaimEvaluation`,
  `StructuralAnalysis`, `MicaAnalysis`, `VerificationResult`
- **Report tiers** (each a superset of the one below): `LegitimacyScanReport` →
  `TokenomicsAuditReport` → `FullVerificationReport`; plus `DailyBriefingReport`
- **MiCA unions:** `MicaClaimStatus`, `MicaComplianceStatus`
- **Discovery provenance:** `DiscoveryStatus`, `DiscoveryAttempt`
- **Config shape:** `ScoreWeights`
- **Crawler I/O:** `ResolvedContent`

## Anti-cycle constraint

This package MUST NOT import from `@grey/pipeline`. The dependency is one-way:
pipeline (and later grey-core) consume schemas, never the reverse.

## Deferred: JSON Schema / OpenAPI layer

The versioned JSON Schemas, common response envelope, OpenAPI 3.1 spec, and ajv
validation tests described in `phase2-work-breakdown-kovsky.md` Step 3 are
**deferred** (D-SCOPE — see `movement-2-grey-schemas-extraction-spec.md` §15).
They will be authored here in a post-M2 movement, after the offering list is
re-confirmed.
