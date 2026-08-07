# CDP FACILITATOR — PHASE 2, FULL RUN

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02). Supersedes `CDP-BAZAAR-ALIGNMENT-PHASE2-KOV-directive.md` — same scope, run continuously instead of stopping between tasks.
**Refs:** `CDP-BAZAAR-COMPATIBILITY-AUDIT-REPORT-KOV.md`, `CDP-BAZAAR-PHASE1-REVISION-REPORT-KOV.md` (Phase 1 is live in prod, split gate verified).
**Architecture, decided — don't re-litigate:** CDP Facilitator is a **parallel settlement path, not a replacement.** Grey's self-hosted `verify()`/`settle()` stays the primary path for the existing 7 offerings + trust rung. CDP routing is additive — built for Bazaar-visibility purposes specifically, doesn't touch the proven revenue path. Design accordingly: don't rip out or bypass the existing relayer logic anywhere.

**Keys:** `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` are already staged in both local `.env` and `/etc/grey/grey-core.env` (confirmed live, from the Phase 1 deploy). Nothing further needed there.

## Run straight through Tasks 1–3. Do not stop between them.

**Task 1 — Wire `@coinbase/x402`.** Add the package. Build the parallel path — a second verify/settle route (or a second gate variant, whatever shape fits this codebase's existing patterns best) that calls CDP's `facilitator` (reads the env vars automatically) instead of the local relayer logic. This does not replace `makeX402PreHandler`/`makeX402PaymentPresenceCheck` — those keep running exactly as they do today for the primary path.

**Task 2 — Config.** Add the facilitator field to `X402Config`/`loadX402Config()`. Fail closed (clear error, not silent no-op) if CDP routing is invoked without the keys present — consistent with this codebase's existing conventions.

**Task 3 — Test on Base Sepolia.** Get testnet funds from the CDP Faucet if needed. Confirm a real testnet settlement completes through CDP. Confirm via CDP's discovery endpoint (`GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`) that the route actually appears — that's the real proof, not just "the call didn't error."

Once Task 3 passes: push the branch, open the PR, export the review diff the usual way (`git diff main..<branch> > review-cdp-phase2.diff` at the repo root), full gate green. **Do not merge. Do not push to main directly.** Standing rule, unchanged by anything recent — report the PR as ready and wait for an explicit go.

## Hard stop — do not proceed past here without explicit Forces authorization, separately from the PR/merge gate above

**Task 4 — Mainnet.** Flipping this from Sepolia to real Base-mainnet CDP routing is not part of "run through Phase 2." This is genuinely new settlement infrastructure touching real funds for the first time — same weight as the original M5 mainnet cutover. Report Task 3's evidence and stop. Wait to be told to proceed, with the same explicit clarity as every prior mainnet-adjacent decision in this project's history.

## What "stopping when necessary" means in practice

Keep moving through 1–3 without checking in at each step. Stop only for: Task 4 (above), anything that would touch `main` without review having happened first, a genuine blocker (credentials rejected, CDP API behaving unexpectedly, an ambiguous design call not already resolved above), or the normal MCP/tool failure discipline (retry ≤3, then stop and report). Everything else — build it, test it, get to a mergeable PR, report.
