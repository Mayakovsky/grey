# CDP / Bazaar Alignment — Phase 1 — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-02
**Refs:** `CDP-BAZAAR-ALIGNMENT-PHASE1-KOV-directive.md`, `CDP-BAZAAR-COMPATIBILITY-AUDIT-REPORT-KOV.md`.
**Delivery choice:** PR, not a direct hotfix — this touches the payment gate itself (route lifecycle ordering) and adds a new wire-format field; both warrant a reviewable diff over a silent change, despite the contained size.

## Task 1 — Production deploy: done, verified live

VPS was on `a4bdab1` (pre-Expansion); deployed to `main`'s current tip (`5f1bc5d`, includes E1-A/Round2/merge-prep + the revenue-events migration ledger entry).

- `git pull` → fast-forward, 71 files, matches expectations.
- Lockfile diff was 2 internal workspace symlinks only (`@grey/schemas` added as a dep of `x402-middleware`/`acp-adapter`/`grey-core`) — zero new external packages. `pnpm install --frozen-lockfile`: 7.1s, zero downloads.
- Filtered build (`turbo run build --filter=@grey/core... --filter=@grey/sweeper...`, avoiding `@grey/ceremony`'s argon2 native compile per the VPS's memory-constraint history): 26.5s, clean.
- `sudo systemctl restart grey-core`: active immediately, clean startup log line, no errors.
- **Live verification (both directive-specified checks passed):**
  - `POST https://api.whitepapergrey.com/v1/offerings/legitimacy_scan` (schema-valid body, no payment) → `402`, and `accepts[0].extra.bazaar` is now **present** (previously absent — confirmed absent in the audit report's own ground-truth curl).
  - `GET https://api.whitepapergrey.com/v1/discovery/services` → `200`, lists all 7 enabled offerings (route didn't exist at all pre-deploy — would have 404'd).
- Memory stayed healthy throughout (359Mi → 842Mi free after restart, no swap pressure, 2GB swap untouched).
- Observed, not caused: `grey-sweeper` and `grey-acp-adapter` both show `active` — pre-existing state from before this deploy (I only ever restarted `grey-core`, per the directive's scope). Flagging since the deploy runbook's own text says the sweeper should be "DISABLED until Phase E" — either that's already happened and the runbook is stale (it also still says "testnet," which is also stale — production is confirmed mainnet), or it's worth Forces confirming separately. Not touched by me either way.

## Task 2 — Validation-order fix: done, tested

`packages/grey-core/src/server/routes/{offerings,trustRung}.ts`: the x402 gate is now wired as Fastify's `preValidation` hook instead of `preHandler` — runs before body-schema validation instead of after. Same function, one property-name change, zero business-logic touched.

Verified the fix doesn't introduce a new class of risk: a request with *valid payment* but an *invalid body* now settles first, then 400s on schema — but this is the same "settlement stands even if something downstream fails" posture the codebase already established for handler-thrown errors (`preHandler.ts`'s own header comment). Not a new risk category, just one more thing that can happen after settlement, consistent with the existing design.

New tests (`x402-routes.test.ts`, `trustRung.test.ts`): all 7 priced offerings + the trust rung, empty/malformed body with no payment → asserts `402` with Bazaar metadata attached, never `400`. This is the exact gap the audit found live — reproduced and closed in the same pass.

## Task 3 — `extensions.bazaar`: done, documented uncertainty

Added a top-level `extensions.bazaar` object to `PaymentRequirements` (`adapters/x402-middleware/src/types.ts`), populated via a new shared `buildCdpBazaarExtension()` in `challenge.ts`, reused by `trustRung.ts`. Kept `accepts[0].extra.bazaar` unchanged, per the directive ("keep... unless you find a reason it should go" — found none; not removed).

**Honest limitation, called out rather than hidden:** CDP's public docs describe `bazaar.info`/`bazaar.schema` but never publish one complete worked example of the surrounding `extensions` envelope. I checked three sources (CDP's own bazaar docs, the x402 gitbook, the coinbase/x402 GitHub repo's visible structure) and none show whether `extensions` sits at the top of the response body or inside each `accepts[]` entry. I placed it at the top of the body (sibling to `accepts`) — the more spec-consistent reading, since discovery metadata describes the resource, not a specific payment option — and documented this as an open question directly in the type's doc comment (`CdpBazaarExtension` in `types.ts`). **This has not been validated against a real CDP-indexed endpoint** — Grey has no CDP API keys yet. Re-verify in Phase 2, once keys exist and a real settlement can be run through the Facilitator to see what CDP's indexer actually accepts.

New tests confirm the shape is structurally correct and additive (doesn't touch `extra.bazaar`), but cannot confirm CDP itself accepts it — that requires Phase 2.

## Gate

Full monorepo `build+test+typecheck+lint`: 28/28 green, twice (once before the deploy, once again after all Task 2/3 changes landed on the branch).

## Delivered

- **[PR #37](https://github.com/Mayakovsky/grey/pull/37)** — `cdp-bazaar-alignment-phase1` → `main`. Tasks 2 + 3, 10 files, full test coverage described above.
- Production deploy of already-merged `main` (Task 1) — live, verified, not gated on PR #37 (separate, lower-risk action, executed first per the directive's own "most urgent, do this first").

## Not done (by design)

`verify.ts`/`settle.ts`/`clients.ts` untouched — no CDP Facilitator routing. That's explicitly Phase 2, blocked on Forces obtaining CDP API keys from `portal.cdp.coinbase.com`. Noting for the record: a `CDP-BAZAAR-ALIGNMENT-PHASE2-KOV-directive.md` appeared on disk during this session — not opened or acted on, per the standing discipline of one directive at a time and the explicit "don't start that piece until told the keys exist" instruction in this directive.
