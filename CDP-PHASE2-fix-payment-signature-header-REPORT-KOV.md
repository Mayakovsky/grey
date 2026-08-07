# CDP Phase 2 — Fix PAYMENT-SIGNATURE Header — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-PHASE2-fix-payment-signature-header-KOV-directive.md`.

## Verified independently before touching anything

Checked `@x402/core`'s own compiled source rather than taking the directive's claim on faith — same discipline as every other wire-shape decision in this feature. Confirmed: `encodePaymentSignatureHeader` switches on `x402Version` — `case 2` emits `PAYMENT-SIGNATURE`, `case 1` emits `X-PAYMENT`. Matches the directive exactly; real bug, not a false alarm.

## Fix

Both hooks in `cdpFacilitator.ts` now read `req.headers['payment-signature']` instead of `req.headers['x-payment']`. Scoped to this file only — `verify.ts`/`preHandler.ts` (the primary, v1 route) untouched, still correctly read `X-PAYMENT`. Also corrected the file's own header comment, which had wrongly asserted the request header was unchanged between v1/v2 — that was the root misconception behind the bug in the first place, worth fixing so it doesn't mislead the next read of this file.

## Test fix

`cdpFacilitator.test.ts`'s local `reqReply()` helper (a file-local copy, not shared with `preHandler.test.ts`) now sets `payment-signature`. Confirmed this is genuinely local — `preHandler.test.ts` has its own separate copy of the same helper pattern, untouched, still `x-payment`. Also renamed the relevant test titles (`"...when X-PAYMENT is absent"` etc.) to say `PAYMENT-SIGNATURE`, since the old names would now describe the wrong header.

## Verify

Full gate green: `turbo run build test typecheck lint` on `@grey/x402-middleware` + `@grey/core` + `@grey/acp-adapter`, forced/no-cache — **14/14**, all 25 `cdpFacilitator.test.ts` tests still pass, `preHandler.test.ts` (primary route) unaffected.

Per the directive's request for a check beyond the unit tests: wired `makeCdpX402PaymentPresenceCheck`/`makeCdpX402PreHandler` into a real (throwaway, not committed) Fastify app via `app.inject()`, sent a v2-shaped payload under a `payment-signature` header, and confirmed the mock `client.verify()` was actually invoked (proving the header was read and reached decode/verify, not just that the unit test's direct function call happened to match) — `status: 402` (mock verify rejected it), `reached decode/verify path: true`.

## Deliver

- `review-cdp-v2-challenge.diff` re-exported at the repo root (overwritten), 697 lines, `main..cdp-phase2-v2-challenge`, both commits.
- **PR #39** now has 2 commits (the v2-challenge feature + this fix). Still open, not merged.
