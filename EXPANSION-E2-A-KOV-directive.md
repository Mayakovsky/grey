# EXPANSION E2-A — Chain abstraction refactor (Base → per-chain registry) — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04), per confirmation of `EXPANSION-E2-OPENING-REPORT-KOV.md` §2.
**Spec:** `MARKET-EXPANSION-PROJECT.md` §3 E2 (E2-A), §2.3 (networkMultiplier table), §1 (Kite bequeaths "multi-chain channel abstraction, price multipliers").
**Anchor:** confirm current `grey/main` HEAD before branching — no drift expected since the E1 merge, but verify, don't assume.
**Branch:** `expansion-e2-a-chain-abstraction`.
**Nature:** config + schema refactor. **No external surface, route, or Base runtime behavior changes on this phase.** Zero new chain goes live here — this phase makes the *shape* multi-chain-capable; it does not populate Kite's real values. Low-risk, mechanical, byte-identical guard is the gate.
**Discipline (restated, unchanged):** explicit staging paths only, never `git add -A`/`.`; `vitest run` is the canonical runner; MCP/tool failure → retry ≤3 then STOP+report; no time estimates; cite `file:line` for every claim in your report. Reviews are diffs, not prose summaries. **Merge is Forces-gated — open the PR, report ready, stop.**

## Confirmation of your read (§2 of your report)

Your grounding is correct and matches the plan: `ChannelIngress` (`packages/grey-core/src/channels/ingress.ts:35`) and `X402Adapter` are already chain-agnostic — **do not touch either.** The actual work is one layer down, in config + pricing, exactly where you found it. Proceed on that basis.

Two things to resolve explicitly, since you flagged both as open:

1. **`packages/grey-core/src/deps/index.ts:20-30,97-106` is in scope.** `createHandlerDeps()` reading `BASE_X402_PAY_TO`/`X402_NETWORK` directly is the same class of hardcoding as `config.ts` — if it doesn't also route through the new registry, the registry is decorative rather than real. Update it to resolve through the registry, keyed to a single `'base'`/`eip155:8453` entry for now. Byte-identical output is the test.
2. **Kite's real chain ID, RPC URL, and single-vs-second-listener topology are correctly out of scope for E2-A** — you read that right. Design the registry keyed generically (chain id / network string → config), but do not populate a Kite entry with real values or make a topology decision here. That's E2-B/D territory.

## Task 1 — Per-chain config registry (`adapters/x402-middleware`)

Replace the single-`X402Config`-per-process load in `config.ts:32-102` with a registry keyed by network/chain-id string. Concretely:
- `NETWORK_CHAIN_ID` / `isNetwork()` (`config.ts:10-17`) become a lookup against a registry of known networks, not a hardcoded 2-value check — but **only `eip155:8453` and `eip155:84532` are registered in this phase.** Do not add a Kite entry yet (see above).
- `loadX402Config()` continues to resolve `X402_NETWORK`, `BASE_X402_PAY_TO`, `BASE_RPC_URL`, `X402_RELAYER_PRIVATE_KEY` to the exact same values as today, now via the registry rather than direct env reads.
- `clients.ts:32-41` (hardcoded RPC fallback URLs) and `prices.ts:67-73` (`USDC_BY_NETWORK`) both move to registry-driven lookup, same constraint: current Base values unchanged.

## Task 2 — `Channel` union + `NETWORK_MULTIPLIER` in `@grey/schemas`

Per §2.3: add `'kite'` to `Channel` (`packages/grey-schemas/src/pricing/types.ts:28`) and `NETWORK_MULTIPLIER.kite = 1.0` (`table.ts:93`) — Kite mirrors x402 exactly until volume is legible. This is the one place a Kite-specific value *does* land in E2-A, because it's a pricing constant, not a runtime chain config — no wallet, no RPC, no live surface implied by it existing in the type.

## Task 3 — `GreyCoreConfig` / `createHandlerDeps()`

Per the confirmation above: route the single `payTo`/`network` pair through the new registry. No behavior change; this is the proof that Task 1's registry is load-bearing, not parallel dead code.

## Task 4 — Tests (the gate)

- Full existing suites green, unmodified assertions: `adapters/x402-middleware/test`, `packages/grey-schemas/test/pricing.test.ts`.
- New: registry resolves `eip155:8453`/`eip155:84532` to byte-identical config vs. the pre-refactor direct-env-read values (golden-value comparison, not just "doesn't throw").
- New: `NETWORK_MULTIPLIER.kite === 1.0`, `Channel` type accepts `'kite'`.
- New: registry lookup for an unregistered network fails closed (throws/errors), not silently falls back to Base — this is the assertion that actually earns the word "abstraction" here; without it the registry is just Base with extra steps.
- `vitest run`, full suite.

## What this phase explicitly does not do

- Does not add a Kite network/chain-id/RPC entry to the config registry.
- Does not touch `ChannelIngress` or `X402Adapter`.
- Does not decide single-process-vs-second-listener for Kite.
- Does not generate any wallet, key, or Kite Agent Passport registration — that's e2-b/e2-c territory, sequenced after this lands.

## Deliver

Export the diff before reporting back — I'm reviewing this as a diff next turn, not a prose summary:

```
git diff main..expansion-e2-a-chain-abstraction > review-e2-a-chain-abstraction.diff
```

Report: the diff export path, full `vitest run` output, and explicit confirmation of the golden-value byte-identical test result for both existing Base networks. Merge stays Forces-gated regardless of test outcome — stop after PR-ready.
