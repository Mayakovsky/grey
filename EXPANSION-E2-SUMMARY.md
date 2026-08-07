# EXPANSION E2 — SUMMARY (KITE ABSTRACTION BASELINE)

**Sealed:** 2026-08-05, by Kov, per `EXPANSION-E2-WRAP-CHECKS-KOV-directive.md` (AUTHORIZED by Forces 2026-08-04).
**`main` HEAD at seal:** `e51665a685138c96eae5d0371b23109a9c56b032` (2026-08-04 22:53:49 -0400).
**Tag:** `movement-e2-kite-abstraction-baseline`, applied to the above commit.

## What shipped

- **E2-A — chain abstraction refactor.** PR #46 (`expansion-e2-a-chain-abstraction`, commit `ca76846`). Extracted Base-specific assumptions out of the x402 adapter into a table-driven per-chain `NETWORK_REGISTRY` (`adapters/x402-middleware/src/registry.ts`). No behaviour change on Base — pure refactor, existing test suite as the guard.
- **E2-BE — Kite wallet topology + scoped sweep.** PR #47 (`expansion-e2-be-kite-wallet-sweeper`, commit `aaf66e8`). `KITE_PAY_TO` (Tier A, hot, on VPS) → `KITE_POOL_WALLET` (Tier B, key offline), keys generated via `@grey/ceremony`. Tier C on Kite deliberately NOT built (KITE staking economics not legible post-mainnet). Sweep Kite Tier A → Tier B only — no refuel automation, no bridge to Tier D on Base (both deliberately deferred, see below).
- **G4 wrap-check (RPC posture).** Confirmed 2026-08-05, directly against Alchemy's chain directory: no managed RPC provider supports Kite mainnet yet, so a dedicated-provider app (the `grey-core`/Base pattern) isn't available. Rather than leave that looking like an oversight, `NETWORK_REGISTRY`'s Kite entry now wires in `fallback()` across all four of Kite's own documented regional endpoints (global/Virginia/Tokyo/Ireland, per `docs.gokite.ai/kite-chain/1-getting-started/tools`) instead of just the single global one — closer to G4's spirit without a dedicated app.
- **`.env.example` gap closed.** `GREY_SWEEPER_GAS_FLOOR_WEI` documented (required only by the on-demand `checkGas` script, not the sweeper service; no invented default — value pending real Kite gas cost data).

## What didn't ship, and why

- **E2-C — does not apply.** Originally scoped as "Agent Passport registration." Corrected 2026-08-04: Kite Agent Passport is Kite's **buyer-side** identity/spending-guardrail product (WebAuthn passkey), not a seller-registration mechanism. Grey, as a seller, has nothing to register there. This bequest is struck, not silently dropped — see `MARKET-EXPANSION-PROJECT.md` §3 E2-C and §5.2 OD-7 for the full correction trail.
- **E2-D — listing/directory presence — dormant, not merely blocked.** The real seller-facing mechanism is Kite's Agent App Store, invitation-gated. Forces went through Kite's actual, current application process on 2026-08-04: it is a generic 5-question Typeform ending "thanks, we'll notify you" — no App Store branding, no dashboard, no OpenAPI submission step, no invitation code. Earlier docs describing a formal Step0/1/2 registration flow with a 24-hour invitation window were themselves confirmed **stale** — retired from Kite's live site, only ever retrieved via a cached search snippet, never the live site itself. There is currently no live application surface with any defined path forward to track, which is why this is recorded as dormant rather than "blocked, no committed timeline." Bion's `e2-cd` task reflects this (`status='blocked'`, description updated 2026-08-05; not ratified — no real build spec exists until an invitation, if any, lands and submission requirements become visible).
- **Refuel automation and bridge-to-Tier-D (Kite → Base) — deliberately deferred.** Scoped out of E2-BE explicitly; no live Kite payment volume yet to justify building either.

## Gate to E3 — status

2 of 3 met: chain abstraction merged (E2-A) ✅, sweeper cycle Kite Tier A → Tier B merged (E2-BE) ✅. The third — first settled payment on Kite — is blocked by E2-D/OD-7's dormancy, not unfinished Grey-side work. Forces elected to proceed to E3 (Olas, Gnosis) in parallel rather than block the whole project on an access channel with no confirmed path forward (`EXPANSION-E3-OPENING-HANDOFF-KOV.md`). The chain abstraction is retained regardless — it's the real deliverable E3 depends on.

## Corrected understanding of Kite AIR, for any future instance touching this again

- **Agent Passport ≠ App Store.** Passport is buyer-side identity/spending-guardrails (WebAuthn passkey-based); it does not support binding to an external DID. The App Store is the actual seller-listing mechanism, and as of 2026-08-04 it is invitation-gated behind a generic lead-capture Typeform — not a structured vendor-onboarding flow. Do not assume either the old Step0/1/2/24-hour-window narrative or a formal OpenAPI submission step is currently real; both were checked live and found not to exist. If Kite's onboarding changes in the future, re-verify against `docs.gokite.ai` directly rather than trusting this summary.
