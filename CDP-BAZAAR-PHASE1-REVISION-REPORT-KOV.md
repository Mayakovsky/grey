# CDP/Bazaar Alignment — Phase 1 Revision — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-02
**Refs:** `CDP-BAZAAR-PHASE1-REVISION-split-gate-KOV-directive.md`, revising Task 2 of `CDP-BAZAAR-ALIGNMENT-PHASE1-KOV-directive.md` on the same PR #37 branch.

## The split

`@grey/x402-middleware`'s single `makeX402PreHandler` (wired as one `preValidation` hook) is now two hooks:

- **`makeX402PaymentPresenceCheck(cfg)`** — new, `preValidation`. Checks only whether `X-PAYMENT` is present; missing/empty → 402 immediately, body-independent. Runs *before* Fastify's schema validation, so a probe with no known body shape still gets the Bazaar metadata instead of a bare schema 400 (unchanged from the last version — this piece was correct).
- **`makeX402PreHandler(cfg, deps)`** — unchanged internals, now wired to `preHandler` instead of `preValidation`. Runs *after* schema validation, so a request with a payment header but a malformed body 400s on schema before verify/settle ever runs. This restores the pre-existing buyer protection the single-hook move had removed.

Same split applied to the trust-rung gate: `makeTrustRungPaymentPresenceCheck` (new, `preValidation`) + `makeTrustRungPreHandler` (unchanged, now `preHandler`).

Both grey-core route files (`offerings.ts`, `trustRung.ts`) now wire both hooks; `buildServer`, `X402Adapter`, and `start.ts` thread a `{ preValidation, preHandler }` gate object (`X402Gate`, exported from `offerings.ts`) instead of a single function. `mcp.ts` untouched, per the directive — it never used Fastify schema validation.

## Test added

`adapters/x402-middleware/test/preHandler.test.ts` — a real Fastify instance with body-schema validation wired, both hooks installed, proving the actual combined contract (a unit test calling `makeX402PreHandler` directly can't exercise "does schema validation run first" at all, since there's no schema validation in that harness):

- **Valid, cryptographically-verifiable X-PAYMENT + malformed body → 400** (not 402, not 200), `wallet.calls` has length 0 — settlement genuinely never ran.
- No X-PAYMENT + malformed body → 402 with requirements (preValidation wins the race, unchanged behavior).
- Valid X-PAYMENT + valid body → still settles and reaches the handler (200, `wallet.calls` length 1) — the split didn't break the happy path.

All prior tests — the 7-offering + trust-rung "no-payment + malformed-body → 402" coverage from the last version — pass unchanged, as expected (the presence-check hook catches the missing-header case identically).

## Gate

`turbo run build test typecheck lint` on `@grey/x402-middleware` + `@grey/core`, forced (no cache): **10/10 green**. `@grey/acp-adapter` (the other consumer in the dependency graph) also verified unaffected: 8/8 green. Prettier clean on all 15 touched files (one pre-existing baseline drift file, `scripts/esbuild-lib.mjs`, confirmed via `git stash` to fail lint identically on `main` — not touched by this change).

## Delivered

- New commit `b9b95f3` pushed to `cdp-bazaar-alignment-phase1` (PR #37, now 2 commits) — not a new PR, per the directive.
- `review-cdp-alignment-phase1.diff` re-exported at the repo root (overwritten), 1194 lines — full delta from `main`, both commits.
- PR #37 still open, not merged — same as before.
