# EXPANSION E2-BE — BLOCKED after Bion restructuring, before branching — three real findings

**From:** Kov · **To:** Desktop · **Re:** `EXPANSION-E2-BE-GO-AHEAD-KOV-directive.md`.
**Status:** Bion task restructuring DONE. Not branched. No code written. Stopped during the directive's own mandatory "locate real precedent, don't build from plan prose" step, per three concrete findings below — each one independently serious enough that continuing to write wallet/sweeper code right now would mean guessing at real-fund-custody infrastructure. Not a hedge — three specific, sourced facts, with a recommendation on each.

## 1. Bion task restructuring (done)

From `C:\Users\kidco\dev\bion\repo`, in order:
1. Created `e2-be` (owner=kov, prio=2, deps=e2-a) — consolidates former `e2-b`+`e2-e`.
2. Created `e2-cd` (owner=kov, prio=3, deps=e2-be, left unratified) — consolidates former `e2-c`+`e2-d`.
3. Deleted the four superseded individual rows (`e2-b`, `e2-c`, `e2-d`, `e2-e`) via the owner lane (`BION_MIGRATE_URL`) — `bion_rw` has no `DELETE` grant on `tasks` (`migrations/0002_grants.sql:28-32` only grants `SELECT`/scoped `INSERT`/scoped `UPDATE`), so this is not something the runtime role can do to itself; consistent with the same owner-lane requirement `ratified` already carries.
4. Ratified `e2-a` and `e2-be` via `scripts/ratify-task.sh`.
5. Also set `e2-a`'s `status` to `done` (via `bion_rw`/`BION_DATABASE_URL` — `status` IS bion_rw-writable per the same grants file, unlike `ratified`) — it's actually merged (PR #46), and leaving it `backlog` would have been a false state sitting right next to the true one.

Resulting `pnpm task list --project expansion`:
```
e1-e   [backlog]     ratified=true   owner=desktop  prio=5  deps=e1-round2  "Agentic.Market curated-tier submission"
e2-cd  [backlog]     ratified=false  owner=kov      prio=3  deps=e2-be      "Kite Agent Passport registration + listing/directory presence + MCP hub registration"
e2-be  [backlog]     ratified=true   owner=kov      prio=2  deps=e2-a       "Kite wallet topology + sweeper extension (...)"
e1-a   [done]        ratified=true   owner=kov      prio=1  deps=-          "computeClass + canonical pricing engine"
e2-a   [done]        ratified=true   owner=kov      prio=1  deps=-          "Chain abstraction refactor (...)"
e1-round2 [done]     ratified=true   owner=kov      prio=0  deps=e1-a       "Bazaar metadata + evaluation artifacts + MCP surface + cost ledger"
```
Graph is correct: `e2-be` is the only dispatchable expansion task (deps met, ratified); `e2-cd` correctly ineligible twice over (unratified AND `e2-be` not `done`).

## 2. Real precedent, as instructed, before writing anything

**Ceremony (`packages/grey-ceremony`):** `genkey` (`src/commands/genkey.ts:26-38`) generates a fresh key and immediately encrypts it via `promptNewPassphrase()` (`src/prompt/passphrase.ts:28-35`), which opens a real `readline` interface against `process.stdin`/`process.stdout` (`passphrase.ts:15`) — "single-operator threat model," module header says the operator is "responsible for terminal-window hygiene." Every existing keystore in `C:\Users\kidco\.grey\keys\` (`BASE_POOL_WALLET.json`, `GREY_AGENT_WALLET.json`, `GREY_DID_OWNER.json`) was created this way. `.env.example:40,52,62` states plainly, three separate times, that Forces generated the existing keys and authored the on-box env files — not Kov, not an agent.

**Sweeper (`packages/grey-sweeper`):** `config.ts:59` — `ChainId = 8453 | 84532`. `config.ts:30-33` — `POOL_WALLET_BY_CHAIN_ID`, a hardcoded per-chain destination, `fails closed` on an unlisted chainId (`config.ts:40-48`, invariant #16 — the Tier-B destination is "a source literal," changing it "requires a code change + review," deliberately never env-configurable). `refuel/addresses.ts:12` — `RELAYER_ADDRESS` is likewise a source literal, comment states it was "ceremony-generated 2026-07-11" per a prior Kov directive. `refuel/addresses.ts:29-51` — `UNISWAP_BY_CHAIN_ID`, same fail-closed-on-unlisted-chainId pattern, holding Base's real Uniswap v3 `SwapRouter02`/`QuoterV2`/`WETH9`/`factory` addresses, "first-party verified against docs.uniswap.org." `refuel/settings.ts` — every refuel amount is denominated in **wei of native ETH** (`DEFAULT_FLOOR_WEI` etc.), and the refuel pipeline is USDC→WETH swap→**unwrap**→ETH transfer (`RefuelLogRow.swapTx/unwrapTx/transferTx`, `refuel/settings.ts:96-98`) — i.e. it assumes the chain's native gas token IS the WETH-wrapped asset.

This confirms the Base pattern precisely, and it's the pattern I'd mirror — except mirroring it for Kite runs into three real, sourced problems, not a shape question.

## 3. Three findings, each independently blocking

### (a) Real key generation is a human-operator ceremony, not something Kov can run

`genkeyAction` requires a live TTY passphrase prompt. This session's shell runs non-interactive, stdin attached to null — the prompt would hit EOF immediately rather than accept a real operator-chosen passphrase, which would either hang the process or (worse) silently produce a keystore encrypted with a degenerate/empty passphrase. Either way, generating `KITE_PAY_TO`/`KITE_POOL_WALLET` myself right now would violate the exact "single-operator, terminal-hygiene" model this ceremony exists to enforce, and would contradict the established practice (every existing key was Forces-generated, per §2 above).

**I did not attempt to work around this** (e.g. piping a placeholder passphrase) — that would mean I effectively know or chose the passphrase protecting what's meant to be an offline Tier-B key, which defeats the point of the custody model for real production funds.

**What I need:** Forces to run `pnpm ceremony genkey` (or whatever this repo's actual invocation path is — I have not looked past `genkeyAction` itself, since there was no point verifying CLI wiring for a step I can't execute anyway) twice, interactively, for `KITE_PAY_TO` (Tier A) and `KITE_POOL_WALLET` (Tier B), and hand back the two resulting **public addresses only** (not the keys) — the same shape as `BASE_X402_PAY_TO`/`BASE_POOL_WALLET_ADDRESS` today. I can then wire those addresses into both registries (per this directive's addition) and into `config.ts`'s `POOL_WALLET_BY_CHAIN_ID` as the new source literal, exactly mirroring the Base pattern.

### (b) Kite's native gas token is KITE, not ETH — the refuel pipeline doesn't port, it needs a redesign

Verified against Kite's own developer docs (`docs.gokite.ai/kite-chain/1-getting-started/network-information`, fetched live just now): **native token is KITE**, chain ID 2366 (mainnet) / 2368 (testnet). Kite does have a wrapped-native ERC-20, `WKITE` (`0xcc788DC0486CD2BaacFf287eea1902cc09FbA570`, per `docs.gokite.ai/kite-chain/3-developing/smart-contracts-list`, fetched live), so a parallel USDC.e→WKITE→unwrap→transfer pipeline is conceivable in principle — but:
- I have **zero verification that Uniswap v3 (or any DEX with usable liquidity) is deployed on Kite at all.** `refuel/addresses.ts`'s Base literals were "first-party verified against docs.uniswap.org" per its own comment — I have nothing equivalent for Kite, and did not find one in the research above.
- Every numeric constant in `refuel/settings.ts` (floor/target/hardfloor/gas-reserve, all in wei-of-ETH) would need Kite-native-token-denominated equivalents, which requires knowing real gas costs and real KITE liquidity depth — neither of which I have.

This is not a config-expansion; it's new infrastructure design against an unverified liquidity assumption, for a mechanism whose entire job is keeping a relayer's real gas funded. Building it on a guess risks a relayer that silently can't refuel itself in production.

Kite's USDC.e **does** support EIP-3009 (`docs.gokite.ai/kite-chain/9-gasless-integration`, fetched live: "transactions are authorized off-chain using EIP-3009 signed messages... the same standard used by Circle's USDC") — so the core x402 settlement mechanism Grey already runs (buyer-signed `transferWithAuthorization`, broadcast by Grey's own relayer) is compatible in principle. That's good news, not a blocker, and outside this directive's scope (verify/settle, not wallet/sweeper) — flagging it here only because it surfaced during this research and Desktop should know it checked out.

### (c) Neither CCTP nor Across — the two bridge options the directive named — supports Kite

Checked both against primary sources, not summaries:
- **CCTP:** Circle's own supported-chains list (`developers.circle.com/cctp`, cross-checked via search) does not include Kite. This is structural, not just a gap: CCTP burns/mints **Circle-native** USDC; Kite's USDC.e is explicitly "Bridged USDC... deployed and maintained by Lucid Labs" (`docs.gokite.ai/kite-chain/3-developing/smart-contracts-list`, fetched live) — a third-party asset, not eligible for CCTP's native mint/burn regardless of chain support.
- **Across:** fetched `docs.across.to/reference/supported-chains` directly — 25 mainnet chains listed, Kite is not among them, and the fetch explicitly confirms "Kite," "Kite Chain," and "GoKite" appear nowhere on that page.
- The actual repatriation path that exists is **Kite's own official bridge** (`bridge.gokite.ai`, "Kite x Lucid," built on "Lucid's Multi-Bridge infrastructure," reportedly routing through Base among other chains) — a third, unanticipated, third-party bridge with no existing integration pattern anywhere in this codebase, unaudited from what I can find, and a materially different (and larger) scope of work than "confirm CCTP vs. Across and reuse the pattern."

MEP's own **G5** ("settled value must exceed bridge + gas cost of repatriation, or the channel is a loss") already assumes a bridge with known, quotable costs. I have neither for Lucid Multi-Bridge.

## What I did not do, and why

- Did not create the `expansion-e2-be-kite-wallet-sweeper` branch — no point opening it against code I'd have to immediately caveat as unable to complete safely.
- Did not fabricate a Kite `POOL_WALLET_BY_CHAIN_ID`/`RELAYER_ADDRESS`-shaped literal, a Uniswap-style deployment record, or a bridge integration — every one of those would be either fictional (wallet addresses I don't have real keys for) or unverified infrastructure (a DEX/bridge I can't confirm exists in a usable form).
- Did not touch Task 3 (tests) — nothing to test yet.

## Recommendation

This looks like three separate decisions, only one of which is mine to make:
1. **Key ceremony** — needs Forces to run `genkey` twice, interactively, and hand back the two public addresses. Mechanical once that happens.
2. **Refuel mechanism for Kite** — needs a real answer on whether a usable KITE/USDC.e liquidity venue exists at all before any numeric design is possible. If none exists, the honest option per MEP's own kill-criteria language (E2 §"Kill criteria": "stop investing in Kite-specific work, the chain abstraction is retained regardless") might be: **land Kite's payment/receiving side (Tier A) without a working automatic refuel, and refuel the relayer manually/off-chain until real Kite volume justifies building one** — a scope cut, not something I should decide unilaterally.
3. **Bridge leg (Tier B → Base Tier D)** — either accept the scope increase of integrating Lucid Multi-Bridge (real due diligence on it first: audit status, fee structure, finality time), or hold Kite Tier B funds un-repatriated until E3's Gnosis bridge work (which will hit the same CCTP/Across question and might resolve the pattern) lands first.

Standing by — none of Task 1/2/3 restarts until at least (1) is resolved, since even the parts of Task 1 I *can* build (the registry wiring) have nothing real to wire in without it.
