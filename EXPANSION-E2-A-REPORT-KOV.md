# EXPANSION E2-A — Chain abstraction refactor — KOV REPORT

**From:** Kov · **To:** Desktop · **Re:** `EXPANSION-E2-A-KOV-directive.md`, unblocked by `CORRECTION-e2a-not-built-KOV.md`.
**Status:** PR-ready. Merge is Forces-gated — not merged, will not merge without explicit authorization.
**Branch:** `expansion-e2-a-chain-abstraction`, base `main` @ `be3da2803d61c99b3bf0cad3a78e58df199ac738` (confirmed clean before branching).
**PR:** https://github.com/Mayakovsky/grey/pull/46
**Diff export:** `C:\Users\kidco\dev\grey\review-e2-a-chain-abstraction.diff` (440 lines, `git diff main..expansion-e2-a-chain-abstraction`).

## What landed, by task

**Task 1 — per-chain config registry.** New `adapters/x402-middleware/src/registry.ts`: `NETWORK_REGISTRY` (`Record<X402Network, NetworkRegistryEntry>`, `{chainId, defaultRpcFallbackUrl, usdc}`), `isRegisteredNetwork()`, `networkRegistryEntry()` (throws on lookup miss). Only `eip155:8453`/`eip155:84532` registered, per directive.
- `config.ts` — removed `NETWORK_CHAIN_ID`/`isNetwork` (was `config.ts:10-17`); `loadX402Config()` now calls `isRegisteredNetwork`/`networkRegistryEntry` for `chainId`+`usdc`, same env vars (`X402_NETWORK`, `BASE_X402_PAY_TO`, `BASE_RPC_URL`, `X402_RELAYER_PRIVATE_KEY`), same error message text (still matches `/X402_NETWORK/`, preserving the existing "rejects an unsupported network" assertion).
- `clients.ts:37-42` — the `cfg.chainId === 84532 ? sepolia : mainnet` ternary is now `networkRegistryEntry(cfg.network).defaultRpcFallbackUrl`. Same two URLs, registry-driven.
- `prices.ts` — `USDC_BY_NETWORK` no longer holds its own literal; both entries now read `NETWORK_REGISTRY['eip155:8453'].usdc` / `['eip155:84532'].usdc`. Re-exported unchanged for existing consumers (`test/_sign.ts`, `prices.test.ts`).
- `src/index.ts` — barrel-exports `NETWORK_REGISTRY`, `isRegisteredNetwork`, `networkRegistryEntry`, `NetworkRegistryEntry`, matching every other module's barrel-export convention.

**Task 2 — `Channel` + `NETWORK_MULTIPLIER`.** `packages/grey-schemas/src/pricing/types.ts:28` — `Channel` is now `'x402' | 'acp' | 'kite'`. `table.ts:93-98` — `NETWORK_MULTIPLIER.kite = 1.0`. Pricing constant only; no Kite wallet/RPC/route exists anywhere in this diff.

**Task 3 — `GreyCoreConfig`/`createHandlerDeps()`.** One interpretive call I made, flagging it explicitly rather than guessing silently: the directive says "route... through the new registry, keyed to a single `'base'`/`eip155:8453` entry" but the Task-1 registry (`NETWORK_REGISTRY`) only holds `chainId`/`defaultRpcFallbackUrl`/`usdc` — no `payTo`, no raw `network` string passthrough, and reusing it here would mean grey-core importing `@grey/x402-middleware`'s config path more deeply than the existing "informational read, no relayer key required" design permits (see the pre-existing comment at `deps/index.ts` that's now moved but unchanged in substance). So I built a second, narrower, parallel registry — `CHANNEL_IDENTITY_REGISTRY` (`packages/grey-core/src/deps/index.ts:92-105`), keyed by `'eip155:8453'`, holding just the two env-var names — and `resolveChannelIdentity()` reads through it. Same two env vars, same `?? ''` fallback, same values. Reasoning is documented in-line at `deps/index.ts:79-91`; correct me if you intended literal reuse of `NETWORK_REGISTRY` instead and I'll rework it.

**Task 4 — tests.**
- All pre-existing assertions unmodified and green.
- New golden-value tests (registry ↔ pre-refactor literal, byte-for-byte): `adapters/x402-middleware/test/registry.test.ts` (both networks' full entry), `test/config.test.ts` (both networks through `loadX402Config`).
- New fail-closed test: `registry.test.ts` — `networkRegistryEntry('eip155:1')`, `('eip155:2317')` (Kite's real mainnet chain id — chosen deliberately so the assertion means something concrete, not just an arbitrary string), `('not-a-network')`, `('')` all throw `/no registry entry/`; `config.test.ts` confirms `eip155:2317` through `loadX402Config` still throws `/X402_NETWORK/` same as any other unsupported network.
- New: `pricing.test.ts` — `NETWORK_MULTIPLIER.kite === 1.0`, `Channel` accepts `'kite'` via a typed variable, `resolvePriceUsd('legitimacy_scan', 'kite') === 0.25`.
- New: `cacheOrLive.test.ts` — `createHandlerDeps()`'s `config.payTo`/`network` byte-identical to the pre-refactor direct env reads, both when `BASE_X402_PAY_TO`/`X402_NETWORK` are set and when unset (`vi.stubEnv`/`vi.unstubAllEnvs`).

## Full `vitest run` output (monorepo, canonical)

```
 Test Files  83 passed | 4 skipped (87)
      Tests  709 passed | 5 skipped (714)
   Start at  18:29:13
   Duration  15.45s
```

Skipped: the 4 pre-existing anvil-integration tests (`integration.anvil.test.ts`, `grey-sweeper/test/anvil/broadcast.test.ts`, `grey-ceremony/test/anvil/ceremony-e2e.test.ts`, +1) — require a local Anvil chain, unaffected by this diff, same skip count as before.

Also ran (not required by the directive, ran anyway before calling this done):
- `turbo run typecheck` — 14/14 tasks successful across all 7 workspace packages, 0 errors.
- `turbo run lint` on the 3 touched packages — 0 errors.

## What this phase did not touch (confirmed, not just assumed)

`ChannelIngress` (`packages/grey-core/src/channels/ingress.ts`) and `X402Adapter` (`channels/x402Adapter.ts`) — zero diff lines in either. No Kite chain-id/RPC/wallet entry anywhere. No topology decision made.

## Standing per merge discipline

PR #46 open, diff exported, full suite + typecheck + lint green. Not merging — stop here per standing rule and the directive's own line 8. Awaiting your review.
