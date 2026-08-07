# CDP PHASE 2 — v2-SHAPED CHALLENGE, CDP ROUTE ONLY

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03).
**Scope ruling:** build a v2-shaped 402 challenge specifically for `/v1/cdp/offerings/<slug>`. Do **not** touch `buildPaymentRequirements` (v1) or anything on the primary `/v1/offerings/<slug>` route or the trust rung — those stay exactly as they are. This is additive to the already-isolated CDP module, not a wire-format migration.

## Task 1 — Get the full v2 spec up front, don't whack-a-mole the validator

The validator's downstream checks (`has_accepts`, `accepts[0].*`, `bazaar.*`, `payment_required_header`) are all still cascading as skipped — we only know `x402_version` is the current blocker, not what comes after it once that's fixed. Pull the actual v2 `PaymentRequiredResponse`/402-body spec from CDP's docs (`docs.cdp.coinbase.com/x402/bazaar` and whatever it links to for the core protocol spec, `@x402/core`'s own type definitions are also fair game since it's already a dependency) before writing code — get the complete shape once, not one validator complaint at a time. Specifically nail down what `payment_required_header` actually checks — that name suggests something beyond just the JSON body shape (a specific response header CDP expects), don't guess at it.

## Task 2 — Build it, CDP-route only

A new challenge-builder living alongside the rest of `cdpFacilitator.ts` (not a change to `challenge.ts`'s `buildPaymentRequirements`, which primary + trust rung both depend on). Since the buyer-facing challenge becomes v2-native for this route, the buyer's returned `X-PAYMENT` payload will also be v2-shaped — figure out whether `decodePaymentHeader` (currently v1) needs a v2 counterpart, or whether `verifyAndSettleViaCdp`'s existing v1→v2 translation step becomes unnecessary/simpler once the input is already v2-native. Your call on the cleanest shape — this is exactly the kind of internal-structure decision you don't need to stop for, just don't let it leak into the primary route's types/functions.

## Task 3 — Cheap, informational, do alongside Task 1

Re-run `POST /v2/x402/validate` against the **primary** route's live URL (`https://api.whitepapergrey.com/v1/offerings/legitimacy_scan`) too. My working guess is it hits the identical `x402_version` wall, same root cause, since it shares `buildPaymentRequirements`. Just want it confirmed rather than assumed — report the result, no action on it either way; the primary route staying v1 is the ruling above, informational only.

## Verify

Re-run the validator against the CDP route once Task 2 lands. Confirm it clears `x402_version` and whatever `payment_required_header` actually turns out to require, and check whether it now passes fully or surfaces something further downstream — report exactly what it says either way.

## Deliver

Standard: diff export (`git diff main..<branch> > review-cdp-v2-challenge.diff` at the repo root) before any merge, full gate green, do not merge. Report Task 3's result and Task 1's spec findings alongside the diff, even though Task 3 isn't gated on the diff landing.
