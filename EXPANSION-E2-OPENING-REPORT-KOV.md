# EXPANSION — E2 OPENING REPORT (Kov → Desktop)

**From:** Kov · **To:** Desktop · **Re:** `EXPANSION-E2-OPENING-HANDOFF-KOV.md` Task 3 (author Bion tasks, report understanding, stop before code).
**Status:** MEP §3 E2 section read in full. No code written. Bion tasks authored, unratified.

## 1. Bion tasks authored

Per `--project expansion`, `pnpm task create`, from `C:\Users\kidco\dev\bion\repo`:

```
e2-a  [backlog]  ratified=false  owner=kov  prio=1  deps=-      "Chain abstraction refactor (extract Base-specific assumptions into chain registry)"
e2-b  [backlog]  ratified=false  owner=kov  prio=2  deps=e2-a   "Kite wallet topology (KITE_PAY_TO Tier A, KITE_POOL_WALLET Tier B, no Tier C, @grey/ceremony keys)"
e2-c  [backlog]  ratified=false  owner=kov  prio=3  deps=e2-b   "Kite Agent Passport registration (self-serve, bind to ERC-8004 DID where permitted)"
e2-d  [backlog]  ratified=false  owner=kov  prio=4  deps=e2-c   "Listing + directory presence (EvaluationKit re-render into Kite directory, MCP hub registration)"
e2-e  [backlog]  ratified=false  owner=kov  prio=5  deps=e2-b   "Sweeper extension (Kite Tier A -> Tier B, bridge path to Tier D on Base)"
```

Not ratified — same posture as `e1-a`/`e1-round2` were before their build directives landed; leaving that step to you/Forces.

**Deviation from the literal 6-way split `BION-DIRECTIVE-21` used for E1:** actual E1 history (`pnpm task list --project expansion`) shows `e1-b/c/d/f` were never created as separate rows — they landed consolidated into one `e1-round2` task after `e1-a`. I did not mirror that consolidation for E2. Reasoning: E1's b/c/d/f were homogeneous (metadata/dev work, groupable). E2's B and C are not — B is key custody (`@grey/ceremony`, Tier A/B wallet generation) and C is external identity registration (Kite Agent Passport) — different risk profiles that seem to warrant separate review points rather than one bundled diff. Flagging this as a judgment call, not a settled fact — correct me if you want E2 collapsed the same way E1 was.

**Dependency shape:** linear spine `a→b`, then fan-out `b→c` and `b→e` (mirrors E1's `a→{b,c,f}` fan-out shape), then `c→d`. `d` depending on `c` (not `b` directly) is sufficient — `c` can't reach `done` until `b` is, so by the time `d` is eligible both ancestors are guaranteed satisfied. `selectDispatchable()` (`bion/repo/src/loop/dispatcher.ts:24`) only requires direct deps `= 'done'`, so this holds.

**One open flag, not decided unilaterally:** `e1-e` (Agentic.Market curated submission) was authored `owner=desktop` because it's third-party account creation / ToS acceptance — a Forces-gated action per that directive's own note. `e2-c` (Kite Agent Passport registration) is also third-party account/identity creation, just self-serve rather than DevRel-gated. I kept `owner=kov` on it because MEP §3 E2 explicitly frames "self-serve" as the reason Kite is cheap to build, and because `e2-b`/`e2-d`/`e2-e` all sit downstream of it in the critical path — routing it through Forces the way `e1-e` was would stall the whole expansion on a manual step, which the "self-serve" framing seems designed to avoid. But "self-serve" and "Forces-gated" are orthogonal axes and MEP doesn't say explicitly which one wins here. Say the word if you want `e2-c`'s owner changed before ratification.

## 2. E2's first buildable phase: E2-A, chain abstraction refactor

Grounded in what's actually in the tree, not just MEP §3 prose:

- **`ChannelIngress` (`packages/grey-core/src/channels/ingress.ts:35`) is already channel-agnostic** — `start/stop/registerOffering/identity()`, no chain literal anywhere in the interface. `X402Adapter` (`packages/grey-core/src/channels/x402Adapter.ts`) is a thin lifecycle shell over `buildServer` — also no chain literal. **The seam itself needs no E2-A work.**
- **The actual Base-only assumptions live one layer down, in config + pricing:**
  - `packages/grey-schemas/src/pricing/types.ts:28` — `export type Channel = 'x402' | 'acp';` with the comment *"Grows with each expansion (E2 Kite, E3 Olas, ...)"* already sitting there. `NETWORK_MULTIPLIER: Record<Channel, number>` (`table.ts:93`) is keyed off this union. E2-A adds `'kite'` here and a `NETWORK_MULTIPLIER.kite = 1.0` entry (MEP §2.3: Kite mirrors x402 exactly).
  - `adapters/x402-middleware/src/types.ts:6` — `export type X402Network = 'eip155:8453' | 'eip155:84532';` (Base mainnet/Sepolia only).
  - `adapters/x402-middleware/src/config.ts:10-17` — `NETWORK_CHAIN_ID` and `isNetwork()` hard-validate against exactly those two network strings; `loadX402Config()` (`config.ts:32-102`) builds **one** `X402Config` per process off single env vars (`X402_NETWORK`, `BASE_X402_PAY_TO`, `BASE_RPC_URL`, `X402_RELAYER_PRIVATE_KEY`).
  - `adapters/x402-middleware/src/clients.ts:32-41` — RPC client construction hardcodes the mainnet/Sepolia Base RPC fallback URLs inline.
  - `adapters/x402-middleware/src/prices.ts:67-73` — `USDC_BY_NETWORK` keyed the same way.
  - `packages/grey-core/src/deps/index.ts:20-30,97-106` — `GreyCoreConfig` carries a single `payTo`/`network` pair, read from `BASE_X402_PAY_TO`/`X402_NETWORK` directly in `createHandlerDeps()`.

**What E2-A actually is, concretely:** turn the single-network config load (`config.ts`) into a per-chain registry keyed by network/chain-id, with Base's existing env var names (`X402_NETWORK`, `BASE_X402_PAY_TO`, `BASE_RPC_URL`, `X402_RELAYER_PRIVATE_KEY`) continuing to resolve to byte-identical values through the new registry — and add `Channel`/`NETWORK_MULTIPLIER` entries in `@grey/schemas` for `'kite'`. No route, adapter interface, or Base runtime behavior changes. The existing test suites (`adapters/x402-middleware/test`, `packages/grey-schemas/test/pricing.test.ts`) are the guard MEP §3 refers to — I have not touched them yet.

**What E2-A is not, on this reading:** it does not touch `ChannelIngress`/`X402Adapter` — those are already generic. It also doesn't yet decide Kite's actual RPC URL, chain ID, or whether Kite is served over the same Fastify process or a second listener — that's implicitly E2-B/D territory (wallet topology, directory listing) and I haven't seen anything in the MEP or the tree that resolves it, so I'm not guessing at it here.

## 3. Standing before next step

No code written. Waiting on your confirmation/correction of the above (especially the `e2-c` owner flag and the E1-style-consolidation-vs-not call) before a build directive on `e2-a`.
