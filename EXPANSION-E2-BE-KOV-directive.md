# EXPANSION E2-BE — Kite wallet topology + sweeper extension — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). Consolidates former `e2-b` (wallet topology) + `e2-e` (sweeper extension) per Desktop's consolidation ruling, confirmed by Forces this session.
**Spec:** `MARKET-EXPANSION-PROJECT.md` §3 E2 (E2-B, E2-E), §4 G4 (per-chain key isolation), §4 G5 (repatriation economics).
**Depends on:** `e2-a` (chain abstraction registry, `C:\Users\kidco\dev\grey\EXPANSION-E2-A-KOV-directive.md`). Confirm whether it's merged to `main` before branching — if not yet merged, branch from `e2-a`'s branch tip and state that base commit explicitly in your report.
**Branch:** `expansion-e2-be-kite-wallet-sweeper`.
**Nature:** real key custody + real fund-movement code. This is the highest-stakes diff in E2 so far — treat review accordingly, and expect a slower, more careful pass from Desktop than E2-A got.
**Discipline (restated, unchanged):** explicit staging paths only, never `git add -A`/`.`; `vitest run` canonical; MCP/tool failure → retry ≤3 then STOP+report; no time estimates; cite `file:line` for every claim. Reviews are diffs, not prose. **Merge is Forces-gated, no exceptions — open the PR, report ready, stop.**

## Before writing anything: locate real precedent, don't build from plan prose

MEP §1 lists "Sweeper + Uniswap v3 conversion + relayer refuel (M5)" and "`@grey/ceremony` cold-key CLI (M4)" as the leverage this phase reuses. **Find and cite the actual files** — the sweeper package, the ceremony CLI, wherever they live in the tree — with `file:line`, before writing a line of new code. Do not design Kite's wallet/sweeper flow from the MEP's description alone; that document specifies what must be true, not how the existing Base implementation achieves it mechanically. Confirm the real Base pattern first, then mirror it for Kite's Tier A→B→D path. This is the standing project lesson from the 2026-08-04 handoff: never trust a shape/behavior claim from a summary — including this directive's own prose — when it's checkable against real source. If anything below turns out to not match what the sweeper/ceremony code actually does, the code wins; flag the mismatch rather than silently building against this doc's assumption.

## Task 1 — Kite wallet topology (E2-B)

- Generate `KITE_PAY_TO` (Tier A, hot, lives on the VPS) and `KITE_POOL_WALLET` (Tier B, key offline) via `@grey/ceremony`, same key-generation discipline as Base/M4. Encrypted keystores under `C:\Users\kidco\.grey\keys\`, per G4.
- **No Tier C on Kite.** MEP is explicit: KITE staking economics aren't legible post-mainnet. Do not build or provision anything staking-shaped, even speculatively.
- **Never share keys across chains** — Kite's keys are Kite's, full stop, even where the Base pattern is byte-for-byte the template.
- Dedicated RPC app for Kite, following the existing `grey-local`/`grey-sweeper`/`grey-core` per-service topology (G4) — confirm what that topology actually looks like for Base before replicating it; don't assume from the name alone.
- Wire `KITE_PAY_TO` into the E2-A chain registry as Kite's first real config entry — this is where Kite's actual chain-id/RPC-URL/pay-to address get populated. E2-A deliberately left this registry keyed generically but empty of Kite values; this is that entry landing.

## Task 2 — Sweeper extension (E2-E)

- Extend the existing sweeper to cover Kite Tier A → Kite Tier B, then a bridge leg from Kite Tier B to Base Tier D.
- Confirm CCTP vs. Across availability for Kite specifically before assuming Base's bridge choice carries over unchanged — don't hardcode an assumption here that E3 will have to re-litigate for Gnosis anyway.
- Reuse the Uniswap v3 conversion / relayer-refuel logic from M5 where the token pair and liquidity shape are actually equivalent; flag explicitly — don't silently guess — anywhere Kite's token/liquidity shape doesn't match Base's assumptions.

## Task 3 — Tests (the gate)

- G4 assertion: Kite key material is never derivable from, or shared with, any Base/ACP key material.
- G5: assert the sweep-cycle mechanics complete correctly on testnet. G5's actual economic proof (settled value exceeds bridge + gas cost) is a live-production observation, not something a test can certify — say so plainly in your report rather than treating a passing test as proof of the economics.
- Full existing sweeper test suite green, plus new Kite-path coverage.
- `vitest run`, full suite.

## What this phase explicitly does not do

- Does not touch Agent Passport registration, EvaluationKit rendering, or MCP hub registration — that's the next directive (`e2-cd`).
- Does not decide or build any Kite listing/discovery presence — this phase is financial plumbing only.

## Bion task restructuring — do this first, before branching

From `C:\Users\kidco\dev\bion\repo`:
- **Ratify `e2-a`** — its build directive is authorized and has landed (`C:\Users\kidco\dev\grey\EXPANSION-E2-A-KOV-directive.md`).
- **Merge `e2-b` + `e2-e` into a single task `e2-be`**, `owner=kov`, `deps=e2-a`, and ratify it — this directive is its build spec.
- **Merge `e2-c` + `e2-d` into a single task `e2-cd`**, `owner=kov`, `deps=e2-be`. Leave `ratified=false` — no build directive for it yet, and it will carry a Forces-gated checkpoint (the Passport registration action itself) that Desktop will detail when that directive lands.
- Report the resulting `pnpm task list --project expansion` output in your reply so Desktop can confirm the graph before the next directive is written.

## Deliver

Export the diff before reporting back — reviewing as a diff next turn:

```
git diff main..expansion-e2-be-kite-wallet-sweeper > review-e2-be-kite-wallet-sweeper.diff
```

Report: the Bion task-list output (above), the diff export path, full `vitest run` output, and explicit `file:line` citations for the existing Base sweeper/ceremony code you built from. Merge stays Forces-gated regardless of test outcome — PR-ready and stop.
