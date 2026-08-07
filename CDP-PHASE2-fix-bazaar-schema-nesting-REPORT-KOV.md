# CDP Phase 2 — Fix Bazaar Extension Schema Nesting — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-PHASE2-fix-bazaar-schema-nesting-KOV-directive.md`.

## Fix, exactly as specified

`buildCdpBazaarExtension` (`adapters/x402-middleware/src/challenge.ts`) now wraps the real per-offering request schema one level deeper:

```
schema: {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    input: kit.inputSchema ?? {},
    output: { type: 'object' },
  },
  required: ['input'],
}
```

`output` is in `properties` but not `required` — checked what `info.output` actually contains (per the directive's instruction): it's `kit.sample ? {example: kit.sample.response} : undefined` — an example value when a sample exists, or absent entirely, never a formal schema. That matches CDP's own validator giving `bazaar.info.output`/`bazaar.info.output.example` *advisory* (not required) severity, so `output` stays optional here too. Used a loose `{type:'object'}` placeholder for `output` rather than inventing a formal schema for the `{example}` wrapper shape, since none exists today.

Also fixed `types.ts`'s `CdpBazaarExtension.schema` doc comment, which had asserted the old (now-wrong) "verbatim from EvaluationKitEntry.inputSchema" claim — left uncorrected it would mislead the next person reading this type.

## Shared code — touched once, verified everywhere

`buildCdpBazaarExtension` is used by the primary route, the trust rung, and the CDP route. Updated the two existing tests that asserted the old flat shape:
- `challenge.test.ts` — the Phase 1 "top-level extensions.bazaar" test and the "pure reshape" test.
- `trustRung.test.ts` — the equivalent Phase 1 test for the trust rung's extension.

`cdpFacilitator.test.ts`'s own bazaar-extension test only ever checked `info`/`schema` truthiness (not exact shape), so it was unaffected — still 25/25 passing.

## Gate

`turbo run build test typecheck lint` on `@grey/x402-middleware` + `@grey/core` + `@grey/acp-adapter`, forced/no-cache — **14/14 green**. All 137 grey-core tests and 94 x402-middleware tests pass.

## Deliver

- This needed its own branch/PR — the prior PR (#39) was already merged by the time this directive landed, so there was no open branch to add a commit to. Diff exported as `review-cdp-bazaar-schema-fix.diff` (117 lines) rather than overwriting `review-cdp-v2-challenge.diff`, since that file documents PR #39's now-historical, already-merged diff.
- **[PR #40](https://github.com/Mayakovsky/grey/pull/40)** — `cdp-phase2-bazaar-schema-fix` → `main`. Not merged.

## Verify (deferred, same pattern as every prior round)

Needs merge + deploy to test against CDP's real validator, same as every round of this loop so far. Once live: re-run `/validate` against the CDP route, confirm `parse` clears and nothing already-passing regresses.
