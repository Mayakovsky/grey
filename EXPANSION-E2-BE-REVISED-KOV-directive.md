# EXPANSION E2-BE (REVISED) — Kite wallet topology + scoped sweep — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). Supersedes `EXPANSION-E2-BE-KOV-directive.md` and `EXPANSION-E2-BE-GO-AHEAD-KOV-directive.md` — same base and dependency chain, scope revised per your `EXPANSION-E2-BE-BLOCKED-real-precedent-findings-REPORT-KOV.md`. All three findings resolved by Forces; your stop was correct on all three.
**Spec:** `MARKET-EXPANSION-PROJECT.md` §3 E2 (E2-B, E2-E) as scoped down below; §4 G4, G5.
**Base:** `main` @ `7e594f2a2246c749359fd1bd39cfd7fc2ebff865` (E2-A merge). **Branch:** `expansion-e2-be-kite-wallet-sweeper`.
**Wallet addresses (confirmed by Forces via the ceremony runbook, two distinct passphrases, keystores encrypted and kept offline as designed):**
- `KITE_PAY_TO` (Tier A) = `0x06B29A204A2dB5dEA63b2d14cdfb2cFC4C90aA0C`
- `KITE_POOL_WALLET` (Tier B) = `0xb20634383Af7BBFD3592f763FE293b7387867fb8`

You will never receive or need the private keys or passphrases — addresses only, same as `RELAYER_ADDRESS`'s existing pattern in the sweeper config. **Cleared to branch.**
**Discipline (restated, unchanged):** explicit staging paths only, never `git add -A`/`.`; `vitest run` canonical; MCP/tool failure → retry ≤3 then STOP+report; no time estimates; cite `file:line`. Reviews are diffs. Merge is Forces-gated, no exceptions.

## Resolution of your three findings — confirming your stop was right on all three

1. **Key ceremony.** Confirmed: Forces runs it, on normal terms, same discipline as every prior key in this project. You get two addresses back, nothing else. Not a design change, just execution.
2. **Refuel mechanism.** Your proposed scope cut is accepted, with the framing Forces gave it directly: *"squirt some lighter fluid on the grill and light the match"* — manual gas funding to start, a portion of revenue rolled into gas money as it materializes, automation only once volume justifies it. Concretely:
   - Build the Tier A→Tier B **sweep** in full — that's the real substance of the E2→E3 gate criterion ("sweeper cycle completed Kite→Tier B") and it doesn't depend on refuel automation existing.
   - Do **not** build the Uniswap-swap-based auto-refuel pipeline this phase — the DEX/liquidity assumption underneath it is unverified on Kite, per your finding.
   - Add a simple **relayer gas-balance visibility check** instead — read-only, reports the Kite relayer's native KITE balance against a floor (log line or on-demand script is enough; no scheduling infra needed). This is how a human knows when to manually top up gas.
   - Propose a **volume threshold** (in the diff's PR description, not code) at which automated refuel becomes worth building — ground it in an actual observed gas cost per sweep/settle tx on Kite testnet, don't invent a round number. This is a flag for a future directive, not a build target now.
3. **Bridge leg.** Accepted: **do not integrate Lucid Multi-Bridge, or any bridge, this phase.** Tier B holds settled Kite funds un-repatriated for now — that's a deliberate, explicit stopping point, not an oversight. No due-diligence spend on the bridge either; revisit only once real Kite volume exists or something changes the calculus.

## Task 1 — Kite wallet topology (scoped)

- Wire the two addresses above into **both** registries — `adapters/x402-middleware/src/registry.ts`'s `NETWORK_REGISTRY` and `grey-core/deps/index.ts`'s `CHANNEL_IDENTITY_REGISTRY` — same shape as the existing Base entries in each. Addresses are source literals, never env-configurable, matching invariant #16's existing pattern (`POOL_WALLET_BY_CHAIN_ID`, `RELAYER_ADDRESS`).
- **No Tier C.** Unchanged.
- Dedicated RPC app for Kite, same per-service topology as Base (`grey-local`/`grey-sweeper`/`grey-core`).
- You never touch key material — only the two addresses Forces hands you. If anything in this task seems to require a private key or a passphrase, stop and flag it; that would mean something's wrong upstream.

## Task 2 — Sweep only (scoped down from the original "sweeper extension")

- Build Kite Tier A → Kite Tier B sweep, mirroring the real fail-closed `POOL_WALLET_BY_CHAIN_ID` pattern from `packages/grey-sweeper/src/config.ts` you already cited.
- Build the read-only gas-balance visibility check described above.
- Do not build refuel automation. Do not build any bridge/repatriation code — Tier B is the end of the line for Kite funds this phase.

## Task 3 — Tests

- Confirm the two new Kite addresses are correctly distinct from any existing Base/ACP address across both registries — copy-paste-wrong-chain is the realistic failure mode now, not key leakage, since no key material passes through your hands.
- Sweep fail-closed test: an unlisted chain id still throws, same pattern as the existing Base sweeper test.
- Gas-balance check: unit-test the floor-comparison logic against a mocked balance read — no live Kite RPC dependency required for the test itself.
- Explicit negative test: assert there is **no** code path that attempts a Kite→Base transfer or bridge call — something that would fail if that got added later by accident, not just an absence of code today.
- `vitest run`, full suite.

## What this phase explicitly does not do

- Does not build automated refuel.
- Does not integrate Lucid Multi-Bridge, CCTP, Across, or any other bridge.
- Does not touch Agent Passport registration, EvaluationKit rendering, or MCP hub registration — that's `e2-cd`, next.

## Deliver

```
git diff main..expansion-e2-be-kite-wallet-sweeper > review-e2-be-kite-wallet-sweeper.diff
```

Report: diff export path, full `vitest run` output, confirmation both addresses are wired into both registries, and your proposed volume-threshold number with the reasoning behind it. Merge stays Forces-gated — PR-ready and stop.
