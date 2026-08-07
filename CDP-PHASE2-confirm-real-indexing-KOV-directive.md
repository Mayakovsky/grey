# CDP PHASE 2 — CONFIRM REAL INDEXING (SEPOLIA, NOT MAINNET)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Extends Task 3's original Sepolia testing — same network, same discipline. Mainnet stays separately gated (Task 4 of `CDP-FACILITATOR-PHASE2-FULL-RUN-KOV-directive.md`), untouched by this.

## Why

`POST /v2/x402/validate` now returns `valid: true`, `simulation.outcome: "accepted"` — the challenge shape is confirmed correct. But that's a dry-run simulation. Task 3's earlier real settlement predates every challenge-shape fix since, so nothing has actually proven that a *real* settlement through the *current*, corrected shape produces real indexing — only that the simulator says it should. Given how many rounds this exact saga took to surface one more layer each time, don't take the simulator's word as the last one.

## Task 1 — Real settlement, Sepolia

Same approach as Task 3 originally: get testnet USDC/ETH if needed, execute a real settlement through the CDP-routed `/v1/cdp/offerings/<slug>` path against the now-live, now-correctly-shaped production endpoint. Confirm on-chain, same rigor as before (real tx hash, confirmed via direct RPC call, status success).

## Task 2 — Confirm indexing, for real this time

After the settlement, poll `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (or the merchant/payTo-keyed lookup, whichever proved more reliable last time) until the resource actually appears, or until it's been a reasonable while without appearing (use judgment on how long is enough to call it — this isn't the same "keep polling forever" situation as before, since the validate check is now clean, so if it doesn't show up this time that itself would be a new, real finding worth reporting, not more waiting).

## Report

Either: (a) it's indexed — real proof, real tx hash, real discovery-endpoint confirmation, this leg of the E1→E2 gate is genuinely closed. Or (b) it's still not indexed despite a clean validate check and a real settlement — in which case stop and report exactly that combination of facts, since that would mean there's something about live cataloging beyond what `/validate` simulates, and it needs fresh investigation rather than another guess.

## Deliver

No code changes expected from this — it's a verification task, not a build task. If Task 1 or 2 surfaces something needing a code fix, stop and report rather than fixing on the spot, same as always.
