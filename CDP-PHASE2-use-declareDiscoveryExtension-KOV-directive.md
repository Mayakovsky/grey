# CDP BAZAAR EXTENSION — STOP HAND-ROLLING, USE THE REFERENCE FUNCTION

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Supersedes the schema-nesting approach from the last two rounds — both were wrong in the same underlying way (guessing the internal wire shape instead of using the library's own builder). New branch/PR.

## Why the last two attempts failed, precisely

Both assumed `buildCdpBazaarExtension` needed to hand-construct the exact internal `{info: {input, output}, schema}` object CDP's validator checks. Every attempt at that internal shape has been wrong when checked live. The actual fix: stop guessing the internal shape — there's a reference function that builds it, and every real-world usage of the Bazaar extension (official x402-foundation examples, Coinbase's own extension docs, several independent implementations) calls it the same way.

## Fix

1. Add `@x402/extensions` (check version compatibility against the already-pinned `@x402/core@^2.20.0` — don't just take the latest, confirm it's the version meant to pair with what's already installed).
2. **Before writing anything**, read the actual installed package's type definitions/source for `declareDiscoveryExtension` directly — same "confirm against the real installed code" discipline that correctly found the `PAYMENT-SIGNATURE` header issue. Web research points strongly at the right shape, but verify against the real package this time, not just external examples, given how burned we've been guessing at wire shapes.
3. Replace `buildCdpBazaarExtension`'s hand-rolled `{info, schema}` construction with a call to `declareDiscoveryExtension()`, passing:
   - `input`: a **real, schema-valid example request value** for the offering — not transport metadata (method/bodyType), not the schema itself. For `legitimacy_scan`, an actual example object satisfying the real request schema (a plausible `token_address` value, etc.).
   - `inputSchema`: the offering's real request schema — this part was always correct, just nested wrong.
   - `output`: `{ example: <real sample response, same source EvaluationKit already uses>, schema: <response schema, if Grey has one for this offering — check before assuming> }`.
4. This is the same shared function used by the trust rung, the primary route's Phase 1 reprojection, and this CDP route — fix it once, all three benefit, same as last time. Update all affected tests to match the new construction, don't let any silently drift.

## What I'm not prescribing

Whether `declareDiscoveryExtension`'s exact parameter names match what I've written above precisely, or whether there's a related registration step (`bazaarResourceServerExtension`) that turns out to matter even though Grey doesn't use `@x402/core`'s full `x402ResourceServer` framework — that's exactly the kind of detail to confirm against the actual package source in step 2, not assume from my research. If the real package needs something structurally different from what I've described, follow the real package, not this directive's guess at its shape.

## Verify

Same as every round: full gate green, then merge + deploy is needed before the real validator check means anything — confirmed pattern by now, nothing new there.

## Deliver

Diff export (`git diff main..<branch> > review-cdp-bazaar-declare-extension.diff`), full gate green, do not merge.
