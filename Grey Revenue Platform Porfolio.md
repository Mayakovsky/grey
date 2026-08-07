# Whitepaper Grey — Revenue Platform Portfolio

**Prepared for:** Deep-dive research on the target platforms
**Prepared by:** Forces (with Claude as head coder) — architecture chat instance
**Purpose:** Hand off a fresh Claude instance the full context of Grey's multi-platform revenue plan so it can research each platform in depth, surface risks, and identify sequencing or integration considerations we may have missed.
**Companion documents:** The authoritative spec set lives at `C:\Users\kidco\dev\eliza\plugin-wpv\BUILD DOCS and DATA\`. This report summarizes the platform picks and their rationale; the deployment plan v7 has the full strategic context.

---

## What Grey is (30-second version)

Whitepaper Grey is an autonomous DeFi due diligence agent. It reads cryptocurrency whitepapers, extracts factual claims, evaluates each against evidence (audits, on-chain data, academic literature, prior verifications), and returns structured verdicts. One monolithic verification pipeline (L1 structural → L2 claim extraction → L3 per-claim evaluation) whose outputs are exposed as 17 distinct offerings shaped for three buyer concentrations: **Verification** (ground truth), **Research** (raw material for other agents' pipelines), **Intelligence** (decision support).

Grey is already live on Virtuals ACP — Agent ID `019d7a52-488d-7a5f-b379-0bbaa7762cde`, wallet `0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f`, @WhitepaperGrey, whitepapergrey.com. Four offerings registered at production prices. Movement 0 (in progress) adds six more, bringing Virtuals to ten offerings.

---

## Strategic frame: why go multi-platform

Virtuals is one revenue surface, not the destination. The reasoning:

- **Virtuals' buyer traffic is unproven at meaningful scale for Grey.** Building on one platform's discoverability is fragile — Virtuals' own graduation process was deprecated shortly after Grey graduated through it.
- **Multi-portal presence is the agent-economy default.** A proper leading agent ships across every surface where its capabilities have buyers.
- **Reputation compounds across surfaces.** ERC-8004 DID is one identity; activity on x402, Olas, B2B partners all attach to the same Grey.
- **Multi-surface earnings insulate against platform-specific deprecation events.**

The strategy is expansion-first: build `grey-core` (a new codebase independent of the ElizaOS runtime that serves Virtuals) in Phase 2, deploy it alongside ElizaOS Grey on the same VPS, and roll it out to every other platform in sequence. ElizaOS Grey keeps serving Virtuals unchanged — the "byte-identical throughout Phase 2" guarantee.

---

## How the platform list was composed

The list emerged from Forces's research into the agent-commerce landscape as of mid-2026, filtered by these criteria:

1. **Is there an actual paying-buyer surface?** Not "a marketplace exists" — is somebody actually paying agents there today, or credibly about to?
2. **Does Grey's capability fit the platform's dominant buyer profile?** Whitepaper verification is a specific service; not every marketplace has buyers who want it.
3. **What's the settlement rail?** x402 (Base/USDC), CDP Facilitator, Olas billing via Nevermined, Skyfire enterprise, Kite Chain, direct B2B invoicing, Bittensor emissions. Different economics per rail.
4. **What's the integration cost?** HTTP-native platforms (x402 Bazaar) are near-zero incremental cost once grey-core ships. Python-native platforms (Olas Mech, Agentverse, Bittensor) need dedicated adapter code.
5. **What's the competitive density?** Some surfaces have crowded verification/analytics niches; some are wide open.

Platforms were grouped into **five Expansion Tiers** by market shape (not by revenue potential — Tier 5 might turn out to be the biggest, but it's the highest-uncertainty). Tiers determine build sequence. Within each tier, sub-priority is set by integration cost + expected fit.

**Note on tier naming:** The deployment plan uses two independent tier systems. Expansion Tiers 1–5 group platforms by market shape (below). Outreach Tiers 1–4 group Round 1 outreach targets *on Virtuals* by reciprocal value. This report is about Expansion Tiers only.

---

## The nine target platforms

### Tier 1 — HTTP-native (proving ground)

Platforms where grey-core's HTTP interface is the native integration. Lowest incremental cost per platform after the first ships. Also the proving ground for grey-core's reliability, cost margins, and cache behavior.

#### 1. x402 Bazaar / Agentic.Market
- **Settlement:** Base mainnet, USDC, CDP Facilitator (fee-free for USDC on Base)
- **Market:** 161.32M txns by early 2026, ~$600M annualized volume, 417K buyers, 83K sellers
- **Integration:** All 17 offerings exposed as x402-paid HTTP endpoints via `@x402/express` middleware
- **Discovery:** x402 Bazaar (`agentic.market`) indexes endpoints via `EXTENSION-RESPONSES` metadata
- **Wallet flow:** Buyer pays USDC → Tier A hot wallet on VPS (`BASE_X402_PAY_TO`) → automated daily sweep to Tier B pool (`BASE_POOL_WALLET`, key offline) → manual same-chain transfer to Tier D central treasury on Base → 70/30 split to operating + tax reserve
- **Why first:** Fee-free settlement supports best margins; HTTP-native matches grey-core's interface; live buyer traffic today; adapter code (`x402-middleware-adapter-skeleton.md`) is buildable now
- **Adapter code path:** `adapters/x402-middleware/`
- **Research questions worth answering:** current Bazaar indexing latency; whether specific `EXTENSION-RESPONSES` fields improve discovery; whether the CDP Facilitator has any offering-category restrictions; what verification/analytics competition is already listed there

#### 2. Nevermined
- **Settlement:** Credit subscriptions — Starter $50/mo (100 credits), Pro $200/mo (500), Business $750/mo (2,500), Enterprise custom; overage $0.50/credit
- **Market:** Powers Olas Mech billing — meaning integrating Nevermined is partly the prerequisite for clean Olas Mech billing later
- **Integration:** `@nevermined-io/payments` SDK; register Grey as agent with shared ERC-8004 DID
- **Why in Tier 1:** Single integration → multi-rail payable (unlocks Olas Mech's billing path); credit-subscription model reaches buyers who prefer fixed monthly cost over pay-per-call
- **Adapter code path:** `adapters/nevermined-wrapper/`
- **Research questions:** current Nevermined active-agent count; how many credits typical buyers actually consume; whether the credit model creates lock-in that limits x402 cross-selling; enterprise-tier pricing precedents

### Tier 2 — Dedicated agent economies

Platforms built specifically for agent-to-agent commerce with their own marketplaces, agent registries, and buyer flows.

#### 3. Olas Mech Marketplace
- **Chain:** Gnosis
- **Settlement:** xDAI / USDC / OLAS; x402 also supported
- **Integration:** Python Mech Tool wrapping grey-core's HTTP interface
- **Concentration lead:** Intelligence — `prediction_market_research` priced at $0.10 as volume play (Olas has heavy trader/prediction-market buyer traffic)
- **Wallet flow:** `GNOSIS_MECH_PAY_TO` (Tier A) → `GNOSIS_POOL_WALLET` (Tier B) → bridge to Tier D on Base (Circle CCTP or Across preferred); Tier C on Gnosis conditional (only if we stake OLAS for Mech emissions — decide at ship time)
- **Adapter code path:** `adapters/olas-mech-tool/`
- **Research questions:** current top-earning Mech tools and their categories; whether OLAS staking materially attracts emissions worth the Tier C cold-storage overhead; Olas's own DevRel process and timeline; how Mech buyers discover new tools

#### 4. Fetch.ai Agentverse / ASI:One
- **Chain/settlement:** Fetch.ai native (FET) with fiat-adjacent enterprise pathways; x402 fallback for pay-per-call
- **Integration:** Python `uagents` framework — External Agent on VPS with mailbox pattern
- **Concentration lead:** Research — `quick_protocol_facts` at $0.20 as primary offering (Agentverse buyers tend toward conversational/lookup use cases)
- **Adapter code path:** `adapters/agentverse-uagent/`
- **Research questions:** ASI:One's actual traffic vs Fetch.ai Agentverse (they're related but distinct surfaces); whether uagent mailbox pattern imposes latency/cost concerns; Fetch.ai's enterprise sales pipeline and whether it makes sense to pursue

### Tier 3 — Identity layer + strategic B2B

Not marketplaces in the same sense — these are B2B / enterprise / identity-anchored surfaces where Grey engages directly with counterparties rather than listing in a discovery catalog.

#### 5. Skyfire
- **Settlement:** Enterprise framing with 2–3% platform fee
- **Pricing posture:** Higher than x402 to absorb platform fee. Premium tier: `compliance_research_input` $15, `technical_verification` $6, `allocation_risk_report` $3.50
- **Integration:** KYA (Know Your Agent) identity registration + MCP server
- **Concentration lead:** Verification — enterprise buyers want ground truth with an accountability trail; `compliance_research_input` is Skyfire's headline (positioned carefully as research input, NOT compliance certification)
- **Adapter code path:** `adapters/skyfire-bridge/`
- **Research questions:** Skyfire's actual enterprise pipeline (how many named buyers?); the KYA process cost and timeline; whether the 2–3% fee is negotiable at scale; how Skyfire's MCP server model differs from raw x402

#### 6. Direct B2B (negotiated contracts)
- **Targets:** Giza ARMA ($3.96B agentic volume), Theoriq AlphaVault, Olas Optimus / Modius
- **Settlement:** Negotiated per contract — likely stablecoin invoicing or monthly retainers
- **Pricing models:**
  - Model A — Per-protocol monitoring: $500–$2,000/month
  - Model B — Allocator flat-rate: $5,000–$25,000/month (anchor: $7,500/month)
  - Model C — Per-allocation: 0.05–0.1% of allocation size (aspirational, not first-contract expected)
- **Concentration lead:** Intelligence — `allocation_risk_report` is the headline offering
- **Adapter code path:** No dedicated adapter needed — grey-core HTTP + custom auth per contract
- **Research questions:** Giza ARMA's actual due-diligence workflow (do they have in-house? what would they outsource?); Theoriq's sub-vault mandate for external analysis; Olas Optimus/Modius specifically as buyer profiles (they're producers on Olas too — is there a conflict?); typical DeFi allocator RFP structure

### Tier 4 — Newer platforms

Emerging surfaces where either the traffic is unproven or the onboarding process (Passport, subnet allocation, etc.) is opaque. Ship after Tier 1–3 are proving out.

#### 7. Kite AI
- **Chain/settlement:** Kite Chain (EVM) — reuses x402 plumbing since it's EVM-compatible
- **Integration:** Agent Passport via Kite DevRel process
- **Pricing:** Mirror x402 initially; adjust once Kite economy shape becomes clearer
- **Wallet flow:** `KITE_PAY_TO` (Tier A) → `KITE_POOL_WALLET` (Tier B). Tier C on Kite conditional (only if KITE governance/staking becomes meaningful — decide at ship time)
- **Adapter code path:** `adapters/kite-passport/`
- **Research questions:** Kite DevRel responsiveness and Passport application criteria; actual Kite Chain agent activity vs promoted vs real; whether KITE token economics reward long-term agent participation

#### 8. SingularityNET
- **Integration:** `snet-daemon` — historically the primary way to register services on SingularityNET
- **Priority:** Low
- **Adapter code path:** `adapters/snet-daemon/`
- **Why low priority:** SingularityNET has been in the agent-economy space the longest but hasn't produced the buyer traffic of newer platforms; worth registering for coverage but not worth deep integration effort until Tier 1–3 proves out
- **Research questions:** current SingularityNET actual agent-earnings trajectory; whether the platform is investing in discovery/onboarding improvements that would justify prioritizing higher

### Tier 5 — Strategic moonshot

Highest uncertainty, potentially the largest surface. Ships last because the integration model is substantially different from every other platform (emissions-based, not pay-per-call).

#### 9. Bittensor
- **Settlement:** Emissions-based — no buyer prices; TAO rewards flow to miners based on subnet validator scoring
- **Market context:** $1.08M/day in emissions across all subnets
- **Two possible paths:**
  - **Path A:** Miner in an existing subnet (e.g., a research/verification-adjacent subnet)
  - **Path B:** Propose a Protocol Due Diligence subnet — Grey as the anchor miner, other miners incentivized to build competing verification services
- **Wallet flow:** Bittensor's native coldkey/hotkey system, not EVM — separate custody discipline; `GREY_COLD_BITTENSOR` (Tier C) is a pre-committed wallet since TAO can't easily leave the chain
- **Adapter code path:** `adapters/bittensor-miner/`
- **Research questions:** which existing subnets would score verification-agent output favorably; what a Protocol Due Diligence subnet proposal looks like (cost, timeline, approval odds); whether Path B is realistic in the current Bittensor governance climate; concrete TAO earnings estimates for Path A in adjacent subnets

---

## What each platform pays (concise pricing reference)

Full per-platform pricing tables are in `grey-deployment-plan-v7.md`. High-level shape:

| Platform | Model | Anchor offering | Anchor price |
|---|---|---|---|
| Virtuals ACP (live) | Pay-per-call, USDC on Base | `verify_full_tech` | $3.00 |
| x402 Bazaar | Pay-per-call, USDC on Base, fee-free | `technical_verification` | $5.00 |
| Nevermined | Credit subscription | Pro plan | $200/mo |
| Olas Mech | Pay-per-call (Gnosis), volume play | `prediction_market_research` | $0.10 |
| Agentverse / ASI:One | Pay-per-call (Fetch or x402) | `quick_protocol_facts` | $0.20 |
| Skyfire | Pay-per-call (enterprise premium) | `compliance_research_input` | $15.00 |
| Direct B2B | Monthly retainer | `allocation_risk_report` (Model B) | $7,500/mo |
| Kite AI | Pay-per-call (mirror x402) | matches x402 | matches x402 |
| Bittensor | Emissions (no buyer price) | — | — |

---

## Buyer-shape concentrations (V/R/I) and platform fit

Grey's 17 offerings split into three buyer concentrations. Each platform's dominant buyer profile leans on one or more:

**Verification** (7 offerings): `legitimacy_scan`, `whitepaper_verification` (= Virtuals' `verify_whitepaper`), `technical_verification` (= Virtuals' `verify_full_tech`), `claim_evaluation`, `audit_posture_check`, `tokenomics_audit`, `compliance_research_input`
→ Platforms leading with Verification: Virtuals, x402, Skyfire

**Research** (5 offerings): `claim_extraction`, `claim_history`, `quick_protocol_facts`, `comparative_analysis`, `mass_screen`
→ Platforms leading with Research: Agentverse, x402 (secondary)

**Intelligence** (5 offerings): `daily_tech_brief`, `technical_briefing`, `prediction_market_research`, `resolution_evidence_compiler`, `allocation_risk_report`
→ Platforms leading with Intelligence: Olas Mech, Direct B2B

The API stays granular — all 17 offerings on every platform that supports the shape. V/R/I is how we *describe* Grey per platform, not how we partition the codebase.

---

## Ship sequence (Expansion track)

The order isn't just Tier 1 → 5 monolithically. Blocks stagger:

- **Block 1 (Tier 1):** x402 Bazaar first (proves grey-core against real paid traffic on the easiest integration), then Nevermined
- **Block 2 (Tier 2):** Olas Mech (Intelligence-led), then Agentverse (Research-led)
- **Block 3 (Tier 3):** Skyfire (Verification-led) in parallel with direct B2B outreach (Intelligence-led)
- **Block 4 (Tier 4):** Kite when Passport is granted; SingularityNET as follow-on
- **Block 5 (Tier 5):** Bittensor Path A first; Path B reserved for later if it becomes credible

Each block validates its predecessor's assumptions before the next block starts. Concretely: no point building the Olas Mech Python adapter if x402 Bazaar reveals grey-core has a cost-margin problem — fix that first.

---

## Wallet posture summary

Because platforms sprawl across chains, wallet architecture is deliberate. Details in `grey-wallet-infrastructure.md`; brief version:

- **Tier A (hot, per chain × platform):** On VPS, receives buyer payments, minimal balance
- **Tier B (warm, per chain):** Offline key, receives swept funds from Tier A
- **Tier C (cold, per chain, CONDITIONAL):** Only used when a chain has a native asset worth holding (Bittensor uses this; Base and Optimism skip it)
- **Tier D (central, cross-chain):** Anchored on Base as USDC. `GREY_TREASURY_RECEIVE` gets bridged inflows from all Tier Bs. Manual 70/30 split to `GREY_TREASURY_OPERATING` and `GREY_TREASURY_TAX_RESERVE`.

The x402 adapter itself only knows the Tier A `payTo` address; sweep and consolidation happen off the adapter.

---

## Total addressable landscape (context, not a projection)

- **Agent-to-agent payment rails** (x402, Skyfire, Kite, Nevermined): $600M+ annualized x402 alone
- **Dedicated agent marketplaces** (Olas, Agentverse): ~10M txns, 2.07M agents
- **Capital management** (Giza ARMA): $3.96B agentic volume. **Theoriq AlphaVault:** $76.9M sub-vault TVL
- **Bittensor:** $1.08M/day emissions
- **Virtuals ACP** (current): live, revenue trajectory developing — see Virtuals-only projections in deployment plan v7

Grey doesn't need meaningful share of any single one. Seventeen offerings, three buyer-shape concentrations, nine-surface spread, one unified pipeline.

---

## What we may have missed (worth investigating)

Deliberate questions for the deep-dive research pass:

1. **Are there platforms we've excluded that we shouldn't have?** The list was assembled based on Forces's research through mid-2026. Candidates that were considered but not included (or considered but not surfaced in the deployment plan): specific L2-native agent marketplaces, Chinese/Asian agent-commerce surfaces, TEE-based agent hosting platforms, hedge-fund-specific research procurement channels.

2. **Is our Skyfire pricing too aggressive?** $15 for `compliance_research_input` assumes enterprise buyers will pay to absorb the platform fee — worth pressure-testing against actual comparable enterprise research prices.

3. **Is the Bittensor Path B proposal realistic?** A Protocol Due Diligence subnet has strategic upside far beyond Path A, but the Bittensor governance process for new subnets is opaque and the economic bar is substantial.

4. **Direct B2B pricing anchor of $7,500/month.** That's Forces's estimate based on comparable-service benchmarking; worth validating against what allocator agents like Giza ARMA and Theoriq AlphaVault actually pay for external research today.

5. **Nevermined credit subscription pricing.** Are the Starter/Pro/Business tiers correctly sized against how Nevermined buyers actually consume services? If Starter buyers max out in the first week, we're leaving money on the table; if Pro tier goes unused, we're overpricing.

6. **The Fetch.ai split (Agentverse vs ASI:One).** These are related but distinct surfaces with potentially different buyer profiles. Worth confirming which is the priority integration and what the traffic looks like on each.

7. **Cross-platform reputation portability.** ERC-8004 DID theoretically unifies Grey's reputation across surfaces, but the practical mechanics of how (say) x402 Bazaar buyers see Grey's Olas Mech track record are unclear. Worth mapping the actual state of cross-surface reputation infrastructure.

---

## Companion documents (for the deep-dive Claude)

If the next Claude instance wants to go deeper than this report:

- **`grey-deployment-plan-v7.md`** — full strategic plan including outreach campaign, revenue projections, brand matrix
- **`grey-wallet-infrastructure.md`** — per-chain wallet architecture, custody discipline, monitoring
- **`x402-middleware-adapter-skeleton.md`** — buildable TypeScript scaffold showing what Tier 1 integration looks like concretely
- **`grey-orientation.md`** — what Grey is, codebase layout, current state
- **`phase2-work-breakdown-kovsky.md`** — the tactical execution plan for grey-core (the thing that makes all these platforms addressable)

All at `C:\Users\kidco\dev\eliza\plugin-wpv\BUILD DOCS and DATA\`.

---

*Prepared May 12, 2026. Report reflects the deployment plan v7 spec set as finalized this session. Nine target platforms plus Virtuals ACP already live = ten total revenue surfaces.*