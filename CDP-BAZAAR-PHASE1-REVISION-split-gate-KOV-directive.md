# CDP/BAZAAR ALIGNMENT — PHASE 1 REVISION (split the x402 gate, don't just move it)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02). Revises Task 2 of `CDP-BAZAAR-ALIGNMENT-PHASE1-KOV-directive.md` on PR #37 — do not merge #37 as-is; push this as a follow-up commit on the same branch.
**Nature:** payment-gate code, high review surface — same discipline as before.

## The problem with the current `preValidation` wiring

Moving the whole x402 gate (`x402PreHandler`) to `preValidation` correctly fixes the bug the audit found — an unpaid probe with no body now gets 402-with-metadata instead of 400, which is what CDP's validator (and any real discovery crawler) needs.

But it also moved *settlement itself* ahead of schema validation. Before this change, a request with a valid payment header but a malformed body would 400 during schema validation, *before* the x402 gate ran — the buyer was never charged for a request that was going to fail anyway. After the current change, that same buyer's payment settles first, then the request 400s. That's a real new cost to a paying caller for a routine, client-preventable mistake (a typo in their JSON) — not the same category as the existing "settlement stands even if the handler errors afterward" posture this was justified by, which was about rare unexpected failures, not deterministic input mistakes the schema validator used to catch for free.

## The fix: split the gate into two hooks, don't move it as one unit

1. **A new, lightweight `preValidation` hook** that does exactly one thing: check whether `X-PAYMENT` header is present at all. Missing/empty → reply `402` immediately with `buildPaymentRequirements(...)` (same body as today), regardless of what the request body contains — this is the piece that fixes the discovery-crawler bug, and it needs nothing from the body to do its job. Present → let the request continue, do nothing else here (no decode, no verify, no settle).

2. **Keep the real verify+settle logic on `preHandler`**, same as it was before this whole change — which still runs *after* Fastify's schema validation. So: no payment header → 402 immediately (new hook, body-independent). Payment header present but body fails schema → 400, *before* verify/settle ever runs, same buyer protection as today. Payment header present and body valid → verify+settle runs as it always has.

Refactor `adapters/x402-middleware/src/preHandler.ts`'s `makeX402PreHandler` into this two-hook shape (exact function/export names are your call — e.g. return `{ preValidation, preHandler }` from one factory, or two separate exported factories, whichever fits this file's existing style better). Wire both hooks on the route options in `packages/grey-core/src/server/routes/offerings.ts` and `trustRung.ts` — `preValidation` gets the new lightweight check, `preHandler` gets the existing verify+settle. `mcp.ts` needs no change — it doesn't use Fastify's schema-validation feature at all, so this ordering issue doesn't apply there.

## Test to add — this exact scenario was untested in the last version

A request **with a valid payment header but a malformed/empty body** must: not broadcast anything (assert `wallet.calls` has length 0, same pattern used in `preHandler.test.ts`'s existing "clean 402, not a wasted reverted tx" test), and return `400`, not `402` and not `200`. This is the test that actually proves the split works — confirm settlement genuinely didn't happen, not just that the status code looks right.

Keep the existing new tests from the last version (no-payment + malformed-body → 402 across all 7 offerings, plus the trust-rung equivalent) — those should still pass unchanged under this design, since the lightweight `preValidation` hook still catches the missing-header case the same way.

## Deliver

Push as a new commit on the same PR #37 branch (don't open a second PR for this — it's a revision of the same change, not new scope). Export the updated diff the same way as before:
```
git diff main..<PR-37-branch-name> > review-cdp-alignment-phase1.diff
```
(overwrite the existing file at the grey repo root) so I can review the actual delta, not just take the description on faith. Full gate green, same as always, before pushing.
