# EXPANSION E2-BE (REVISED) — Kite wallet topology + scoped sweep — KOV REPORT

**From:** Kov · **To:** Desktop · **Re:** `EXPANSION-E2-BE-REVISED-KOV-directive.md`.
**Status:** PR-ready. Merge is Forces-gated — not merged.
**Branch:** `expansion-e2-be-kite-wallet-sweeper`, base `main` @ `7e594f2a2246c749359fd1bd39cfd7fc2ebff865` (confirmed before branching).
**PR:** https://github.com/Mayakovsky/grey/pull/47
**Diff export:** `C:\Users\kidco\dev\grey\review-e2-be-kite-wallet-sweeper.diff` (726 lines).

## What landed

**Task 1 — wallet topology.** `KITE_PAY_TO` (`0x06B29A204A2dB5dEA63b2d14cdfb2cFC4C90aA0C`) and `KITE_POOL_WALLET` (`0xb20634383Af7BBFD3592f763FE293b7387867fb8`) — addresses only, exactly as handed down, no key material touched anywhere in this diff:
- `adapters/x402-middleware/src/registry.ts` — new `NETWORK_REGISTRY['eip155:2366']` entry: `chainId: 2366`, RPC, and USDC.e asset data. `X402Network` widened to include it (`types.ts`).
- `packages/grey-core/src/deps/index.ts` — `CHANNEL_IDENTITY_REGISTRY` entry type is now `{payToEnvVar,networkEnvVar} | {payTo,network}`; Kite uses the literal variant, Base's entry is untouched (still env-driven, byte-identical). `resolveChannelIdentity` and `CHANNEL_IDENTITY_REGISTRY` are now exported for tests.
- `packages/grey-sweeper/src/config.ts` — `KITE_POOL_WALLET_ADDRESS` added to `POOL_WALLET_BY_CHAIN_ID`, `ChainId` widened to `8453 | 84532 | 2366`, `parseChainId` accepts `'2366'`.
- No Tier C, no key material passed through me at any point — confirmed by design (I only ever had the two addresses).

**Task 2 — sweep only.** `sweep.ts`/`trigger.ts`/`index.ts`'s `runTick` needed **zero code changes** — they were already fully chain-parameterized (`chainId`/`usdcAddress`/`agentWallet` all injected, `poolWalletFor(chainId)` already fails closed). Extending `POOL_WALLET_BY_CHAIN_ID` was sufficient to make the existing sweep path work for Kite. Added:
- `packages/grey-sweeper/src/gasBalance.ts` — `checkGasBalance()` (read-only, native-balance-vs-floor) + `formatGasBalanceCheck()`.
- `packages/grey-sweeper/src/checkGas.ts` — on-demand script (not a systemd service, not scheduled), reuses the sweeper's own `loadConfig()`/`loadAgentAccount()` so it always checks the wallet that actually signs the sweep, requires a new `GREY_SWEEPER_GAS_FLOOR_WEI` env var (deliberately no invented default — a human sets it once real Kite gas costs are better understood; see the volume-threshold discussion below for the numbers I *could* get).
- Did **not** add a Kite entry to `refuel/addresses.ts`'s `UNISWAP_BY_CHAIN_ID` — confirmed by reading `refuel/index.ts:62` that `runRefuel()`'s first line is `if (!deps.settings.enabled) return { status: 'skipped' }`, before any chain-specific lookup. `GREY_REFUEL_ENABLED=false` on a Kite sweeper deployment fully inerts refuel with zero code changes needed — verified this rather than assumed it.

**Correctness fix found and made:** `main.ts`'s `buildChain()` hardcoded `nativeCurrency: {name:'Ether',symbol:'ETH'}` unconditionally — harmless while only Base existed, wrong the moment chainId can be Kite (native token is KITE, verified live against `docs.gokite.ai/kite-chain/1-getting-started/network-information`). Fixed via a `NATIVE_CURRENCY_BY_CHAIN_ID` map keyed by the same `ChainId` union `loadConfig` already validates, so an unhandled chain id is a compile error, not a silent wrong label.

**Correction to my own earlier work:** E2-A's tests (already merged, PR #46) used a fabricated placeholder — `'eip155:2317'`, labeled "Kite mainnet chain id" — that I invented as a plausible-looking number before doing real research this phase. It was wrong. Kite's real mainnet id, confirmed live, is **2366**. Fixed both occurrences (`registry.test.ts`, `config.test.ts`) in this diff, replacing the placeholder with the real, now-registered value plus a new "unregistered" test case using Kite's real testnet id (2368, confirmed live, deliberately not registered — no real testnet Tier A/B addresses exist).

## Task 3 — tests

- Kite address distinctness vs. every Base literal, across all three places an address lives (`registry.ts`, `CHANNEL_IDENTITY_REGISTRY`, sweeper `config.ts`) — I could not test distinctness against ACP's wallet specifically; its address isn't a code literal anywhere (env-configured, only ever appears truncated in comments), so there's nothing to import and compare against.
- Fail-closed: unregistered chain ids still throw in both the x402-middleware registry and `poolWalletFor` (including Kite's real-but-unregistered testnet id, not just an arbitrary number).
- `gasBalance.ts`: 8 unit tests against a mocked balance client, no live RPC.
- Static guard (`noKiteBridge.test.ts`): source-grep across `grey-sweeper/src` for bridge/repatriation-shaped identifiers (`lucid.?multi.?bridge`, `cctp`, `across protocol`, `bridge.gokite.ai`, `bridgeToBase`, `repatriat`) — fails the moment such a path is added, not just today's absence of one. Mirrors `grey-ceremony`'s existing `no-math-random.test.ts` convention rather than inventing a new pattern.
- `vitest run`, full monorepo: **732 passed, 5 skipped** (pre-existing anvil-integration skips, unaffected), 0 failed.
- `turbo run typecheck`: 14/14 tasks green across all 7 workspace packages.
- `turbo run lint`: 0 errors.

## Volume threshold for automated refuel (asked for in the PR description, not code)

Grounded in real numbers, queried live rather than invented — full reasoning is in the PR body, summary here:
- Kite mainnet gas price right now: **175 gwei** (`eth_gasPrice`, live).
- KITE/USD: **$0.0975** (CoinGecko, live).
- Per-sweep-tx cost: **≈$0.0011**, using the industry-standard ~65,000 gas figure for a plain ERC-20 `transfer()` — I was **not** able to get a Kite-specific *observed* number for a plain transfer; the one real mined transaction I found via Kite's own block explorer was a bridge/burn operation at ~790,000 gas, which I did not use because it isn't representative of what a sweep tx actually does.
- At these economics, gas cost itself is negligible next to any plausible settlement revenue — the real cost of staying manual is operator attention, not money. **My proposal: build automated refuel once manual top-up would be needed more than ~once/week, and only once a real DEX/liquidity venue for USDC.e↔KITE is confirmed to exist** (still unverified — I looked, found nothing, and didn't go further since building against an unconfirmed venue was exactly this session's earlier blocker). Once real Kite sweeps start landing, `grey_two.sweep_log`'s actual observed gas cost will be a better number than this estimate.

## What I did not do

- No key material generated, requested, or handled — only the two addresses.
- No Uniswap-swap refuel pipeline for Kite.
- No bridge/repatriation integration, no due-diligence spend on one.
- No Agent Passport registration, EvaluationKit rendering, or MCP hub registration (e2-cd territory).

## Standing

PR #47 open, diff exported, full suite/typecheck/lint green. Not merging — stop here per standing rule. Awaiting your review.
