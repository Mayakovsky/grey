# Bankr Bridge — Expand Offerings — Build Report (Kov)

**Directive:** `BANKR-BRIDGE-EXPAND-OFFERINGS-KOV-directive.md`
**Branch:** `bankr-bridge-expand-offerings`, pushed to origin — `https://github.com/Mayakovsky/grey/pull/new/bankr-bridge-expand-offerings`
**Base:** `main` @ the same tip `legitimacy_scan`'s bridge and the filesystem-MCP docs landed on
**Status:** Build + test done. Nothing deployed anywhere — branch pushed for review per the directive, VPS/Bankr untouched.

## Trust rung — checked, confirmed excluded correctly

`TRUST_RUNG_ENABLED` is **not set** in `/etc/grey/grey-core.env` on the VPS (`ssh` + `grep`, confirmed live, not assumed). Per `trustRungEnabled()`'s own logic (`adapters/x402-middleware/src/trustRung.ts:27-29` — "unset/anything-but-'true' → disabled"), `legitimacy_scan_trust_rung` is unreachable on every channel right now. Standing Forces block B-1 (2026-07-26) is still in effect, not lifted. Correctly left out of this batch.

## Files touched

- `packages/grey-core/src/server/routes/bankrBridge.ts` — `BANKR_BRIDGE_SLUGS` extended from `['legitimacy_scan']` to all 6 normal paid slugs. Route registration loop was already generic per-slug (`offeringHandlers[slug]` + `buildEnvelope`) — genuinely a one-line array change, no new route logic.
- `packages/grey-core/test/routes/bankrBridge.test.ts` — original `legitimacy_scan` describe block left untouched; added a `describe.each` block covering the 5 new slugs with the identical 8 assertions each (404 unmounted, 403 missing/wrong/short secret, 400 bad body, 200 + envelope shape, primary `/v1/offerings/<slug>` unaffected, $0 bridge-ledger event distinct from real revenue) — parametrized rather than hand-copied 40 lines of near-identical prose, same coverage.
- `integrations/bankr-bridge/x402/verify-whitepaper/index.ts`, `verify-full-tech/index.ts`, `claim-extraction/index.ts`, `claim-history/index.ts`, `quick-protocol-facts/index.ts` — one handler per offering, same shape as `legitimacy-scan/index.ts`. Applied `Response.json(await res.json())` on the success path from the start, per the directive's explicit instruction.
  - Note on that instruction: Desktop's own later mail (`BANKR-CREDENTIALS-RUNBOOK.md`) retracted this as a required fix for `legitimacy-scan` — Bankr's docs confirm plain objects are auto-wrapped, so the un-wrapped form was never actually broken. Both forms are documented-valid; wrapping is harmless, just not strictly necessary. Applied as instructed for consistency across all 6 handlers; did not go back and change `legitimacy-scan/index.ts` (out of this directive's scope, already live and working).
- `integrations/bankr-bridge/bankr.x402.json` — 5 new service entries under `services`. Each `output` schema cited against the real `@grey/schemas` response types, not placeholders:
  - `verify-whitepaper` → `TokenomicsAuditReport` (`@grey/schemas/src/index.ts:180-184`), confirmed as `LegitimacyScanReport` + `claims`/`claimScores`/`logicSummary` via `responses/v1/verify_whitepaper.schema.json`'s `allOf: [legitimacy_scan.schema.json]`.
  - `verify-full-tech` → `FullVerificationReport` (`index.ts:186-195`), confirmed as `TokenomicsAuditReport` + `confidenceScore`/`evaluations`/`focusAreaScores`/`llmTokensUsed`/`computeCostUsd` via `responses/v1/verify_full_tech.schema.json`'s `allOf: [verify_whitepaper.schema.json]`.
  - `claim-extraction` → `responses/v1/claim_extraction.schema.json` (`whitepaper`/`structuralAnalysis`/`claims`/`tokenAddress`, all required).
  - `claim-history` → `responses/v1/claim_history.schema.json` (`project`/`verifications`/`claims` required, `note` optional).
  - `quick-protocol-facts` → `responses/v1/quick_protocol_facts.schema.json` (`project`/`type`/`miCAStatus`/`headlineVerdict`/`lastVerified`/`sources` required, `note` optional).
  - All 5 use the same envelope-wrapper shape as `legitimacy-scan`'s already-corrected entry (`payload` nested under the full `GreyResponseEnvelope`, not flattened) — same reasoning, not re-derived from scratch.
- Prices: `1.50` / `3.00` / `0.75` / `0.25` / `0.30` — confirmed against `packages/grey-schemas/src/pricing/table.ts`'s `canonicalUsd` for each slug directly, matches the directive's table exactly.

## Test results

`vitest run`, `packages/grey-core`:
```
Test Files  23 passed (23)
     Tests  195 passed (195)
```
Up from 155 (the `legitimacy_scan`-only baseline) — 40 new tests, `bankrBridge.test.ts` now 48 total (8 original + 8×5 new). `tsc --noEmit`: clean.

## What's next (blocked on your review)

Per the directive: stop here, no VPS or Bankr-side action until you state merge-only vs. merge-and-deploy. Once cleared:
1. VPS: same env-gated, dormant-safe deploy as before — reuses the existing live `GREY_BANKR_BRIDGE_SECRET`, no new secret needed.
2. Bankr side: `bankr x402 deploy <kebab-slug>` for each of the 5 (from `integrations/bankr-bridge`, secret already set at the project level from the `legitimacy-scan` deploy — no new `env set` needed either, it's the same project).
3. Verify each exactly like the `legitimacy-scan` runbook: `bankr x402 schema <url>` matches, unauthenticated `curl -i -X POST <url>` returns a clean 402 with correct price/network/asset/`payTo`.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
