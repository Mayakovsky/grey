# EXPANSION E2 — WRAP CHECKS — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). Small, mechanical — closing loose ends before E2 is treated as wrapped and the project moves to E3 in parallel with OD-7 (open).

## 1. G4 — dedicated RPC app: confirm or fix

G4 requires "a dedicated RPC app per service" for every new chain, same posture as Base's Alchemy-provisioned `grey-core` app (FDQ-41). E2-BE's registry entry for Kite uses `https://rpc.gokite.ai/` — Kite's own public endpoint — with no dedicated-provider app behind it. Confirm whether a managed RPC provider (Alchemy, or whatever this project would normally reach for) actually supports Kite mainnet yet:
- If yes, provision the dedicated app, same pattern as Base, and update the registry entry.
- If no managed provider supports Kite yet, that's a legitimate reason to use Kite's own public endpoint directly — but say so explicitly rather than leaving it looking like an oversight. Kite's own docs list four regional endpoints (global/Virginia/Tokyo/Ireland) recommended for redundancy in production — if a dedicated provider isn't available, wire in `fallback()` across those four rather than the single global one currently in the registry, which gets closer to G4's spirit even without a dedicated app.

## 2. Env var documentation gap

`GREY_SWEEPER_GAS_FLOOR_WEI` (introduced in E2-BE's `checkGas.ts`, deliberately no invented default) isn't in `.env.example`. Add it, with a comment noting it's required only for the on-demand `checkGas` script, not the sweeper service itself, and that the value should be set once real Kite gas costs are better understood rather than guessed now.

## 3. Bion — reflect the real state of `e2-cd`

`e2-cd` is currently `[backlog]`, which reads as "normal, unstarted work." It's actually blocked on OD-7 (App Store invitation, Forces-executed, no committed timeline) — update its description or status to say so explicitly, whatever Bion's schema actually supports for this (check before guessing at a field that doesn't exist). Don't ratify it — there's still no real build spec until the invitation lands and the actual submission requirements are visible.

## 4. E2 summary + seal

Write a short `EXPANSION-E2-SUMMARY.md` (mirroring M5/M6's sealing convention — a plain factual record, not a victory lap): what shipped (E2-A chain abstraction, E2-BE wallet topology + scoped sweep), what didn't and why (E2-C doesn't apply, E2-D blocked on OD-7, refuel automation and bridge-to-Tier-D deliberately deferred), current `main` HEAD, and the corrected understanding of Kite AIR (Passport ≠ App Store) for any future instance that touches this again. Tag `main` at its current HEAD as `movement-e2-kite-abstraction-baseline`, same convention as M6's tag, once the summary is written.

## Deliver

No diff export needed for this one — it's docs/task-graph/tag, not application code. Report when all four are done, with the tag confirmed and the summary file's path.
