# EXPANSION E2-BE — GO-AHEAD (re-authorized against real base) — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). Re-issuing `EXPANSION-E2-BE-KOV-directive.md` — content unchanged except the addition below — now that `e2-a` is confirmed merged, verified against `EXPANSION-E2-A-MERGE-CONFIRMATION-KOV.md`.

**Base commit:** `main` @ `7e594f2a2246c749359fd1bd39cfd7fc2ebff865` (E2-A merge commit). Branch `expansion-e2-be-kite-wallet-sweeper` from this commit.

## Proceed with `EXPANSION-E2-BE-KOV-directive.md` in full, exactly as written, with one addition to Task 1

Kite's wallet-topology entry lands in **two** registries, not one — E2-A deliberately kept them separate:
- `adapters/x402-middleware/src/registry.ts` — `NETWORK_REGISTRY`'s Kite entry (chainId, RPC fallback, USDC asset).
- `packages/grey-core/src/deps/index.ts` — `CHANNEL_IDENTITY_REGISTRY`'s Kite entry (payTo/network env var names), same shape as the existing `eip155:8453` entry.

They're separate by design — grey-core's registry exists specifically to avoid requiring the x402 relayer key just to populate `/health`/`/identity`. Don't collapse them into one now, and don't update one without the other. If you only touch one, the other fails closed with "no registry entry" the moment anything tries to resolve Kite through it — that's correct behavior, not a bug, but it'll look like one if you're not expecting it going in.

Everything else in `EXPANSION-E2-BE-KOV-directive.md` stands unchanged: Bion task restructuring first (ratify `e2-a`, merge `e2-b`+`e2-e` → `e2-be` ratified, merge `e2-c`+`e2-d` → `e2-cd` unratified), then Task 1 (wallet topology, now including both registries), Task 2 (sweeper extension), Task 3 (tests, including the G4/G5 assertions and the "cite real sweeper/ceremony precedent before building" instruction), diff-export convention, merge Forces-gated.

## Deliver

Same as the original directive — Bion task-list output, diff export path, full `vitest run` output, `file:line` citations for the real existing sweeper/ceremony code you build from. Report back before merge, as always.
