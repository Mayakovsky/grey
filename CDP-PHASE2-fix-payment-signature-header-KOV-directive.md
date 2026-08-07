# CDP PHASE 2 — FIX REQUEST HEADER NAME (X-PAYMENT → PAYMENT-SIGNATURE)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Send `review-cdp-v2-challenge.diff` back with this fix before merge.

## The bug

Both CDP-route hooks (`makeCdpX402PaymentPresenceCheck`, `makeCdpX402PreHandler` in `cdpFacilitator.ts`) read the buyer's payment from `req.headers['x-payment']`. In x402 protocol v2, the client-side request header was renamed from `X-PAYMENT` to `PAYMENT-SIGNATURE` — the same de-prefixing that turned `X-PAYMENT-RESPONSE` into `PAYMENT-RESPONSE` (which this diff already correctly handles). Confirmed independently across multiple sources describing the v1→v2 migration, not just asserted.

**Strong internal evidence this is a real bug, not a false alarm:** the code already imports and calls `decodePaymentSignatureHeader` from `@x402/core/http` — the function's own name says what header it expects — but feeds it `req.headers['x-payment']` instead of `req.headers['payment-signature']`. The import name and the header read are inconsistent with each other.

**Practical effect if unfixed:** a genuinely v2-native buyer, or CDP's own crawler making a real payment attempt, sends `PAYMENT-SIGNATURE`. This route looks for `x-payment`, finds nothing, and 402s again with a fresh challenge — indistinguishable from "no payment sent." The existing tests don't catch this because `reqReply()`'s test helper sets `headers['x-payment']` directly, matching the code's (wrong) assumption rather than the real protocol — passing tests, wrong behavior against real v2 clients.

## Fix

In both hooks, read `req.headers['payment-signature']` instead of `req.headers['x-payment']`. Scoped to this file only — the primary route's `verify.ts`/`preHandler.ts` correctly keep reading `X-PAYMENT`, since that route is v1 and v1's request header genuinely is `X-PAYMENT`. Don't touch anything outside `cdpFacilitator.ts`.

## Test fix

Update `reqReply()`'s usage in `cdpFacilitator.test.ts` (or the helper itself, your call) to set `payment-signature` instead of `x-payment` for this file's tests specifically — don't change the shared test helper's default behavior if other test files depend on it staying `x-payment`-based for the primary route's own tests.

## Verify

Same as before: full gate green, confirm via a quick manual check that a request with the header under `payment-signature` (not `x-payment`) is what actually reaches `decodeCdpPaymentPayload` in the real preHandler path, not just in the unit test.

## Deliver

Re-export `review-cdp-v2-challenge.diff` (overwrite) with this fix included. Full gate green. Do not merge — same as always.
