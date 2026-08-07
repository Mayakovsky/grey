# CDP PHASE 2 — FIX BAZAAR EXTENSION SCHEMA NESTING (root cause found)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Same PR track, but touches `buildCdpBazaarExtension` — shared code, read carefully before changing.

## Root cause, confirmed against two independent sources, not guessed

Coinbase's own docs state the validation rule directly: *"ensure your extension input strictly matches `schema.properties.input`."* A parallel x402v2 Bazaar implementation (Binance's B402) publishes a full worked example confirming the shape:

```json
{
  "info": { "input": {...}, "output": {...} },
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": { "input": { /* the REAL request-body schema goes here */ } },
    "required": ["input"]
  },
  "description": "..."
}
```

`info` and `schema` as siblings under `bazaar` was correct — that part of the original build was right. The bug: `schema` is currently set to Grey's actual per-offering request-body schema *directly* (the one requiring `token_address`, disallowing extras). It needs to be a **meta-schema wrapping that real schema one level deeper**, at `schema.properties.input`. Right now CDP is validating `info` (which has `input`/`output`, no `token_address`) against a schema that expects `token_address` at the root — exactly matching the error text.

## Fix

In `buildCdpBazaarExtension` (wherever it currently sources `schema` from — almost certainly the offering's real request JSON Schema, reused directly): wrap it. New shape:
```
schema: {
  type: "object",
  properties: { input: <the existing real request schema, unchanged> },
  required: ["input"],
}
```
Add `output` to `properties`/consider adding to `required` only if there's a real output schema being declared for `info.output` — check what `info.output` actually contains for these offerings before deciding whether to require it or leave it optional; don't guess, look at what's already being built into `info.output` today.

## Scope note — this is shared code, touch it once, correctly

Since `buildCdpBazaarExtension` is shared across the trust rung, the primary route's Phase 1 `extensions.bazaar` reprojection, and this CDP route, fixing it here fixes it everywhere. That's the right outcome (all three should have the same correct shape) — but means the trust rung's and primary route's existing tests for this function need to keep passing too. Run the full gate, not just this file's tests, before calling it done.

## Verify

Re-run `POST /v2/x402/validate` against the live CDP route once deployed (this needs merge + deploy to test for real, same as every prior round of this exact loop — nothing new to note there). Confirm `parse` — the one remaining failing check — now passes, and confirm nothing that was already passing (`x402_version`, `payment_required_header`, the `accepts[0].*` checks, `has_bazaar_extension`) regresses.

## Deliver

Diff export, same PR/branch unless you judge it needs its own — your call given the shared-code touch. Full gate green. Do not merge.
