# Grey — Market Expansion Project (MEP)

**Status:** RATIFIED (OD-1, OD-2, OD-3, OD-5 resolved 2026-07-26; OD-4 open)
**Prepared:** 2026-07-26
**Ratified:** 2026-07-26 by Forces
**Prepared by:** Claude Desktop (architect) at Forces's direction
**Intended manager:** Bion — first independent management project
**Baseline:** grey/main `2b9c56f`, tag `movement-6-acp-channel-adapter-baseline`
**Inputs:** `C:\Users\kidco\dev\grey\Grey Revenue Platform Porfolio.md` (May 2026), `C:\Users\kidco\dev\grey\Grey Revenue Platform Deep Dive - 2026-07.md` (July 2026), `ADAPTER-BUILD-GENERAL-HANDOFF.md`

---

## 0. Frame

### 0.1 What this project is

Grey earns today on two channels: Virtuals ACP (via the grey-core `AcpAdapter`, sole live seller on `0xa966…e98f`) and x402 (public API at `api.whitepapergrey.com` behind Caddy). M6 delivered the `ChannelIngress` interface and proved the adapter pattern end-to-end. The Market Expansion Project spends that investment: it adds one revenue surface at a time, in an order where each surface's build leaves behind a reusable component the next surface consumes.

This is not a "ship nine integrations" project. It is a **capability ladder** that happens to produce revenue surfaces as a side effect. If the project stops after E2, grey-core is still strictly better off. If it stops after E4, Grey has a complete multi-rail billing stack that any future platform plugs into in days rather than movements.

### 0.2 The governing insight

From the July deep dive: on x402, one independent data marketplace logged **1,183 agent probes → 5 settlements → $0.11 revenue.** The diagnosed constraint was *evaluation*, not payment — buyer agents could not judge whether the resource was worth its price, so they walked.

Grey's problem is therefore not "be present on more platforms." It is **"be legible to a buying agent in the ~200ms it spends deciding."** Every expansion in this plan carries an evaluation-legibility component, and E1 exists almost entirely for that purpose.

### 0.3 What we already own (the leverage)

| Asset | Movement | Reused by |
|---|---|---|
| `ChannelIngress` interface + adapter pattern | M6 | Every expansion |
| `AcpAdapter` as reference implementation | M6 | E2, E3, E6 |
| x402 middleware + public API surface | M5 | E1, E2, E3 |
| `grey_two` schema (`buyer_records`, `tracked_jobs`) | M6 | E4 metering, E7 tenanting |
| 17-offering JSON Schema layer (`@grey/schemas`, draft 2020-12, OpenAPI 3.1) | M2.5 | E1 — **this is already 80% of Bazaar metadata** |
| `cacheOrLive.ts` orchestration | M3.5 | E1 `computeClass` gating |
| Sweeper + Uniswap v3 conversion + relayer refuel | M5 | E2, E3 (per-chain) |
| ERC-8004 DID `did:erc8004:8453:58618` | M4 | E5 identity, cross-surface reputation |
| Buyer-reputation gating (shadow mode) | M0-Ext | Cross-cutting gate G2 |
| `@grey/ceremony` cold-key CLI | M4 | Any new chain's key generation |

The single largest piece of unrecognised leverage is `@grey/schemas`. Bazaar's discovery extension wants per-parameter descriptions and input/output schemas. Grey has draft-2020-12 schemas and an OpenAPI 3.1 document for all 17 offerings already. E1 is substantially a *projection* of existing artifacts into a new metadata shape, not new authorship.

### 0.4 Non-goals

- Not building all eight expansions. E5 onward are explicitly conditional on E1–E4 economics.
- Not chasing agent-count vanity metrics (Agentverse's 2.7M agents, Olas's 10M txns). Every gate in this plan is denominated in **settled USDC to a Grey wallet**.
- Not re-architecting grey-core. Every expansion is additive behind `ChannelIngress` or behind the pricing engine.

---

## 1. Sequencing logic

Order is set by three ranked criteria:

1. **Marginal build cost against what exists** — cheapest-from-here first.
2. **Component bequest** — does this expansion leave behind something the next one needs?
3. **Time-to-first-settled-USDC** — revenue proximity breaks ties.

Applying those:

```
E1  x402 Bazaar / Agentic.Market   ── bequeaths: EvaluationKit, computeClass, MCP surface
      │
E2  Kite AI                        ── bequeaths: multi-chain channel abstraction, price multipliers
      │
E3  Olas Mech Marketplace          ── bequeaths: cross-chain settlement + bridge-to-Tier-D
      │
E4  Nevermined                     ── bequeaths: metering, entitlements, subscription state
      │
      ├── E5  Skyfire               ── bequeaths: agent-identity credential (KYA/JWT), OAuth2 bridge
      │         │
      │   E7  Direct B2B            ── consumes E4 metering + E5 auth + E1 MCP
      │
      └── E6  Agentverse / ASI:One  ── bequeaths: first non-HTTP protocol adapter (uAgents)

E8  Bittensor Path A               ── capital-gated, no bequest, terminal
```

E5/E6 run as independent branches off the E4 trunk and may be reordered or dropped without disturbing anything upstream. E7 is the only expansion with two prerequisites. E8 bequeaths nothing and is therefore strictly last.

**Struck from the May portfolio:** SingularityNET as a standalone integration (folded into E6 — same ASI Alliance since the January 2026 merger completion; a dedicated `snet-daemon` adapter is redundant). Bittensor Path B (own subnet) — ~1,500 TAO / ~$470K locked registration is incompatible with grinder funding.

---

## 2. Pricing architecture

### 2.1 The problem to solve

Forces's constraint: per-network price differentiation is acceptable **provided it does not dilute compute.** A $0.10 offering on Olas is a fine volume play if it costs Grey nothing to serve. It is a catastrophe if it triggers a full L1→L2→L3 pipeline run.

The answer is not pricing discipline. It is a **mechanical guard in grey-core** that makes the bad case unrepresentable.

### 2.2 `computeClass` — the anti-dilution invariant

Every offering carries a `computeClass` enforced at the `cacheOrLive.ts` boundary:

| Class | Behaviour on cache miss | Marginal cost | Minimum price |
|---|---|---|---|
| `CACHE_ONLY` | Return 404 / "not yet analysed" + optional upsell pointer to a `LIVE_ALLOWED` offering | ~$0 | $0.05 |
| `LIVE_ALLOWED` | Run the live pipeline | Full L1–L3 | Live-cost floor × 3 |
| `LIVE_PRIORITY` | Run live, jump queue, higher token budget | Full L1–L3, premium models | Live-cost floor × 6 |

**Proposed Invariant #30:** *No offering may be served at a price below its `computeClass` floor on any channel. `CACHE_ONLY` offerings never trigger live compute under any circumstance, including a paid retry.*

This single rule makes every subsequent per-network pricing decision safe. Cheap tiers become pure cache monetisation — the marginal cost of a cache hit is a Postgres read.

### 2.3 Canonical price list + network multiplier

One canonical USD price per offering (source of truth in `@grey/schemas`), one `networkMultiplier` per channel applied at the adapter boundary. Adapters never hold hardcoded prices.

| Channel | Multiplier | Rationale |
|---|---|---|
| x402 / Base (E1) | **1.00×** | Reference. Fee-free CDP settlement, best margin. |
| Virtuals ACP | **1.00×** | Existing production prices grandfathered; no repricing during expansion. |
| Kite (E2) | **1.00×** | Mirror x402 until Kite economy shape is legible. |
| Olas / Gnosis (E3) | **0.65×**, `CACHE_ONLY` offerings only | Volume play into prediction-market traffic. Live compute never offered at this multiplier. |
| Nevermined (E4) | **1.15×** effective | Absorbs credit-model overhead; subscription convenience premium. |
| Skyfire (E5) | **1.35×** | Absorbs the 2–3% platform fee plus enterprise framing. |
| Agentverse (E6) | **1.00×**, Research tier only | Conversational lookup buyers; no premium justification. |
| Direct B2B (E7) | Retainer, off-multiplier | Model A. See §2.5. |

### 2.4 The trust rung — **BLOCKED**

The design: every channel exposes `legitimacy_scan` at **$0.10, `CACHE_ONLY`** (Olas: $0.065). This is the answer to the evaluation-friction finding — a buying agent that cannot justify $5 on an unknown seller can justify $0.10, and the output is designed to make the $5 offering's value self-evident. Cache-only means we can afford to be wrong about conversion.

> **BLOCK (Forces, 2026-07-26): the $0.10 trust rung does not go live.**
> A $0.10 cache-only offering is abuse bait while buyer-reputation gating still runs in shadow mode (`BUYER_GATING_BLOCK_ENABLED=false`). The rung may be **designed, built and tested** as part of E1-C, but it must not be exposed on any channel until Forces explicitly lifts this block. Gate **G2** (§4) is the review point.
>
> Practical consequence: E1-C ships the offering behind a hard disable flag, defaulting off, with tests asserting it is unreachable on every live channel. E1's gate to E2 does **not** depend on the rung.

### 2.5 Specific price recommendations (changes from deployment plan v7)

| Offering | v7 | Recommended | Reason |
|---|---|---|---|
| `compliance_research_input` (Skyfire) | $15.00 | **$9.00 — RATIFIED (OD-1)** | Live x402 comps sell on-demand research at $10 with zero platform fee. $15 on a platform with no demonstrated premium-buyer channel is above market. $9 × 1.35 multiplier ≈ $12.15 realised — retains the premium without the credibility gap. |
| `technical_verification` (x402) | $5.00 | **$5.00 — hold** | Validated by live comps ($2 briefs / $10 on-demand). Correctly positioned between them. |
| `prediction_market_research` (Olas) | $0.10 | **$0.10, `CACHE_ONLY`** | Price correct; the change is the compute class, which is what makes it safe. |
| `quick_protocol_facts` (Agentverse) | $0.20 | **$0.20, `CACHE_ONLY`** | Same reasoning. |
| `allocation_risk_report` (B2B) | $7,500/mo Model B | **Model A lead: $750–$2,000/mo — RATIFIED** | Giza's *entire* annualised protocol fee revenue is ~$202.5K on ~$6.5M TVL. A $7,500/mo retainer is ~44% of that. Model B stays on the menu for larger allocators; it cannot lead. |
| `legitimacy_scan` | — | **$0.10 `CACHE_ONLY` — BUILT BUT BLOCKED** | New: universal trust rung. Not exposed on any channel pending Forces review at G2. See §2.4. |

### 2.6 Margin instrumentation

E1 ships a per-call cost ledger (model spend + RPC + infra amortisation, attributed per `channel × offering`). Without it, every pricing decision after E1 is guesswork. Realised margin per channel becomes a standing gate input.

---

## 3. The expansions

Each expansion states: objective, why it sits here, what it reuses, **what it bequeaths**, phases, pricing, gate to proceed, kill criteria, and success metric.

---

### E1 — x402 Bazaar / Agentic.Market

**Objective.** Make Grey's existing x402 endpoints discoverable and *evaluable* by autonomous buyers, and pursue Agentic.Market curated status.

**Why first.** The payment rail already exists and earns (M5). Zero new settlement infrastructure. This is the only expansion whose revenue upside requires no new chain, wallet, or protocol — purely metadata and evaluation surface. It is also where the evaluation-friction problem is solved once for all subsequent expansions. Promoting this from "outstanding non-blocking delta D1–D7" to first position is the largest single change this plan makes to the standing sequence.

**Reuses.** x402 middleware (M5), `@grey/schemas` 17-offering JSON Schema + OpenAPI 3.1 (M2.5), `cacheOrLive.ts` (M3.5), Caddy/`api.whitepapergrey.com` (M5).

**Bequeaths.**
- **EvaluationKit** — the reusable metadata projection: per-parameter descriptions, input/output schemas, sample request/response pairs, service taxonomy tags, icon/branding assets. Every later expansion's listing is a re-render of this.
- **`computeClass` enforcement** in `cacheOrLive.ts` — the anti-dilution invariant every later pricing decision depends on.
- **Per-call cost ledger** — margin instrumentation.
- **MCP tool surface** — Bazaar indexes MCP tools alongside HTTP endpoints. Building it here means E2 (Kite is an MCP hub), E5 (Skyfire monetises MCP servers) and E7 (B2B buyers want MCP) inherit it free.

**Phases.**
- **E1-A — `computeClass` + pricing engine.** Add `computeClass` and canonical-price fields to `@grey/schemas`; enforce at the `cacheOrLive.ts` boundary; add `networkMultiplier` resolution at the adapter boundary. Land Invariant #30. *No external surface changes.*
- **E1-B — Bazaar discovery metadata.** Project `@grey/schemas` into the bazaar extension shape on every x402 route: `discoverable: true`, `serviceName`, `tags`, `description`, `inputSchema`, `outputSchema`, `iconUrl`. Respect the validation rules (printable ASCII for `serviceName`/`tags`; absolute https `iconUrl`, no IP literals/loopback — soft-drop means a bad field vanishes silently, so verify indexing rather than assuming).
- **E1-C — Evaluation artifacts (+ trust rung, built-not-exposed).** Publish sample outputs and a public capability page an evaluating agent can fetch pre-purchase — these ship live. Build `legitimacy_scan` at $0.10 `CACHE_ONLY` **behind a hard disable flag, default off**, with tests asserting it is unreachable on every live channel. **The rung is blocked from exposure by Forces ruling (§2.4); G2 is the review point.** The public capability page carries the evaluation load in the meantime.
- **E1-D — MCP tool surface.** Expose the offering set as paid MCP tools over the same x402 rail. List in Bazaar as MCP.
- **E1-E — Curation pursuit.** Agentic.Market's curated tier sorts above the general index (70 curated services at launch). Submit; supply human-readable metadata; iterate on placement.
- **E1-F — Cost ledger + margin dashboard.** Per-call attribution, realised margin per `channel × offering`.

**Pricing.** Reference tier, 1.00×. (Trust rung $0.10 built but blocked — §2.4 / B-1.)

**Gate to E2.** Verified Bazaar indexing of all discoverable routes + ~~at least one settled non-self payment through a Bazaar-discovered path~~ (**decoupled from E2 timing, OD-6, 2026-08-02 — see §5.1**) + margin ledger live and showing positive realised margin on `LIVE_ALLOWED` offerings. **The gate does not depend on the trust rung**, which is blocked (§2.4) — if/when a non-self settled payment does land, it must come through a normally-priced offering, same as originally specified.

**Kill criteria.** None — E1 is unconditional. Its components are prerequisites for the rest of the project regardless of x402 revenue.

**Success metric.** Probe-to-settlement conversion rate on Bazaar-discovered traffic. This is the number the entire project is designed around; establish the baseline here.

---

### E2 — Kite AI

**Objective.** Add Kite Chain as a second EVM settlement surface, and in doing so generalise the channel layer from Base-only to multi-chain.

**Why second.** Kite shipped mainnet + Agent Passport on 2026-04-30, and Passport is **self-serve** — the DevRel gate assumed in the May portfolio does not exist. Kite explicitly supports x402 as a protocol standard alongside AP2, MPP and MCP, and runs a 90+ service-provider directory. Marginal build cost against E1 is the lowest of any *new* platform: same protocol, same middleware, same EvaluationKit listing, different chain and registry. It is the cheapest possible forcing function for the multi-chain abstraction that E3 requires.

**Reuses.** Everything from E1. `@grey/ceremony` for Kite key generation. Sweeper architecture (M5) as the per-chain template.

**Bequeaths.**
- **Multi-chain channel abstraction** — chain registry, per-network config resolution, per-chain wallet/sweeper/relayer wiring, per-chain RPC posture. E3 (Gnosis) is a config exercise afterwards rather than a rebuild.
- **`networkMultiplier` proven in production** on a second surface.
- ~~Kite Agent Passport identity — a second identity credential alongside the ERC-8004 DID; informs E5's credential work.~~ **CORRECTED 2026-08-04: does not apply.** Agent Passport is Kite's buyer-side identity/spending-guardrail system (WebAuthn passkey), not something a seller registers for, and does not support binding to an external DID — confirmed directly against `docs.gokite.ai/kite-agent-passport` and its Service Provider Guide. This bequest does not materialize; struck rather than silently dropped.

**Phases.**
- **E2-A — Chain abstraction refactor.** Extract Base-specific assumptions out of the x402 adapter into a chain registry. No behaviour change on Base; this is a pure refactor with the existing test suite as the guard.
- **E2-B — Kite wallet topology.** `KITE_PAY_TO` (Tier A hot, on VPS) → `KITE_POOL_WALLET` (Tier B, key offline). Keys generated via `@grey/ceremony`. **Tier C on Kite: NO** (KITE staking economics not legible post-mainnet). Never share keys across chains.
- **E2-C — ~~Agent Passport registration~~ DOES NOT APPLY (corrected 2026-08-04).** Agent Passport is Kite's buyer-side identity/spending-guardrail system, not a seller-registration mechanism — Grey has nothing to register here. The actual seller-facing mechanism is the Agent App Store (see E2-D).
- **E2-D — Listing + directory presence.** Corrected 2026-08-04: the real mechanism is Kite's **Agent App Store**, not a generic "provider directory" — invitation-gated, currently in limited access mode (see **OD-7**). Requires an OpenAPI JSON schema submission (Grey's existing `openapi.yaml` needs a Kite-flavored variant, not assumed byte-compatible with Bazaar's `EvaluationKitEntry` shape). No evidence of a separate "MCP hub" registration surface was found — this likely collapses into the same App Store listing rather than being a distinct step. **Further downgraded 2026-08-04 (see OD-7): the actual application Forces submitted was a generic lead-capture Typeform, not a vendor-onboarding system.** Nothing concrete to build against; this phase is dormant, not merely blocked.
- **E2-E — Sweeper extension.** Kite Tier A → Tier B, then bridge path to Tier D on Base.

**Pricing.** 1.00× — mirror x402 exactly. Revisit only when Kite volume is legible.

**Gate to E3.** Chain abstraction merged with Base behaviour byte-identical + first settled payment on Kite + sweeper cycle completed Kite→Tier B. **Status 2026-08-04: 2 of 3 met** (chain abstraction ✅ merged E2-A; sweeper cycle ✅ merged E2-BE). The third — first settled payment — is blocked by **OD-7**, now understood to be dormant rather than actively in-progress (see §5.2), not by unfinished Grey-side work. **Forces elected to proceed to E3 in parallel** per the operating brief's own deviation clause (§7.4), rather than block the whole project on an access channel with no confirmed path forward at all.

**Kill criteria.** If no settled non-self payment materialises on Kite after the directory listing has been live through a full observation window, stop investing in Kite-specific work. **The chain abstraction is retained regardless** — that is the real deliverable and E3 depends on it.

**Success metric.** Settled USDC on Kite; secondarily, days-to-integrate for the *next* chain (should collapse sharply).

---

### E3 — Olas Mech Marketplace

**Objective.** Add Gnosis Chain as a settlement surface and place the Intelligence concentration in front of Olas's prediction-market buyer traffic.

**Why third.** Olas has genuine, verified buyer concentration: prediction-market agents account for 75%+ of Safe transactions on Gnosis on many days, and the marketplace has surpassed 10M+ agent-to-agent transactions. Crucially, Olas now supports x402 — which means E2's chain abstraction may let us serve Olas over the x402 rail rather than authoring a bespoke Python Mech Tool. **Verify this at spec time; it is the difference between a config expansion and a new-language adapter.**

**Reuses.** Multi-chain abstraction (E2), EvaluationKit (E1), `computeClass` (E1) — which is what makes a $0.065 offering safe.

**Bequeaths.**
- **Cross-chain settlement + bridge-to-Tier-D** (Circle CCTP or Across from Gnosis to Base). First non-Base-family value repatriation.
- **Marketplace-registry integration pattern** — Olas has its own on-chain registry and reputation surface, unlike Bazaar's metadata-only indexing. That pattern generalises to E6.

**Phases.**
- **E3-A — Rail decision. RATIFIED (OD-2): x402-over-Olas is the primary; Python Mech Tool is an evidence-triggered fallback.** Path (i) x402-over-Olas is a config expansion of the E2 abstraction; path (ii) Python Mech Tool wrapping grey-core HTTP is a new adapter in a new language. Forces ruling: the determination is made **during the E3 build period**, not in advance — build against (i), and the trigger for (ii) is a demonstrated lifecycle step that cannot be expressed over x402, written up as an FDQ before any language-adding work begins.
- **E3-B — Gnosis wallet topology.** `GNOSIS_MECH_PAY_TO` (Tier A) → `GNOSIS_POOL_WALLET` (Tier B). **Tier C on Gnosis: NO** — staking OLAS for Mech emissions means holding a token down ~99.6% from ATH with sub-$1M daily liquidity, to chase an emissions subsidy. Not worth the cold-storage overhead under grinder funding.
- **E3-C — Intelligence offering set, cache-only.** `prediction_market_research` $0.065, `resolution_evidence_compiler`, `daily_tech_brief` — all `CACHE_ONLY` at the 0.65× multiplier. Live-compute offerings, if listed at all, list at 1.00×.
- **E3-D — Bridge to Tier D.** Gnosis Tier B → Base Tier D. CCTP preferred; Across as fallback.
- **E3-E — Registry listing + EvaluationKit render.**

**Pricing.** 0.65× on `CACHE_ONLY` only. This is the plan's only sub-1.00× multiplier and it exists solely because the cache makes it free to serve.

**Gate to E4.** Settled value on Gnosis + successful bridge cycle to Tier D + the 0.65× tier demonstrably not triggering live compute (assert in tests, verify in production logs).

**Kill criteria.** Olas buyer traffic is downstream of an OLAS-emissions flywheel. If marketplace fee flow contracts materially, or if the observed settled value on Grey's Gnosis Tier A does not cover the bridge + gas overhead of repatriation, stop and decommission the channel. The bridge component is retained.

**Success metric.** Settled value net of bridge and gas cost. A channel that earns $12 and costs $14 to repatriate is a loss dressed as traction.

---

### E4 — Nevermined

**Objective.** Add the credits/subscription billing model — and with it, the metering and entitlement layer grey-core currently lacks.

**Why fourth.** The `ADAPTER-BUILD-GENERAL-HANDOFF.md` standing guidance was to build low-friction ACP/x402-shaped channels before a credits/subscription one; E1–E3 discharge that. Nevermined's *platform* case is weak — almost every public metric is the company's own content marketing, and active-agent counts and per-buyer credit consumption have no public answers. Its *architectural* case is strong: it forces grey-core to grow real metering, entitlement state and subscription lifecycle, which E7 (B2B retainers) needs and which no pay-per-call channel would ever have motivated.

**Reuses.** `grey_two` schema (`buyer_records`, `tracked_jobs`), cost ledger (E1-F), EvaluationKit.

**Bequeaths.**
- **Metering + entitlement layer** — signed usage records, balance/burn accounting, entitlement checks ahead of service. Directly consumed by E7.
- **Subscription state machine** — recurring-period lifecycle, renewal, overage. Consumed by E7.
- **Multi-rail facilitator experience** — Nevermined bridges fiat card rails, credits, smart accounts and stablecoin settlement; useful reconnaissance for E5/E7 buyer profiles.

**Phases.**
- **E4-A — Metering core.** Per-call usage records in `grey_two`, cryptographically signed, append-only. Independent of Nevermined — this is grey-core infrastructure that Nevermined happens to consume first.
- **E4-B — Entitlement + balance.** Pre-service entitlement check; credit burn on delivery; overage handling.
- **E4-C — Nevermined SDK integration.** `@nevermined-io/payments`; register Grey with the shared ERC-8004 DID.
- **E4-D — Tier mapping.** *(Conditional — see kill criteria; OD-3 ratified.)* Map the 17 offerings onto credit counts such that effective realised price lands at ~1.15× the canonical list. **Open question with no public answer: whether Starter/Pro/Business tiers are correctly sized against real consumption. Resolve by asking Nevermined directly before committing to tier design, not by desk research.**
- **E4-E — Reconciliation.** Credits-consumed vs. compute-spent reconciliation into the cost ledger.

**Pricing.** 1.15× effective. Credit-count mapping is the mechanism.

**Gate to E5/E6.** Metering + entitlement layer merged and exercised by a real subscription + reconciliation clean for one full billing period.

**Kill criteria — RATIFIED (OD-3).** If Nevermined cannot supply consumption data sufficient to size tiers, ship the metering layer (E4-A/B/E) and **stop before E4-C/D.** The layer is the point; the platform is the excuse. This is a ruled-acceptable outcome, not a failure — Bion does not need to escalate to take it, only to report it.

**Success metric.** Metering layer correctness (reconciliation delta ≈ 0), then subscription revenue.

---

### E5 — Skyfire

**Objective.** Acquire the KYA agent-identity credential and monetise the MCP surface through Skyfire's rail.

**Branch order: RATIFIED (OD-5) — Skyfire runs before Agentverse.**

**Why here, and why reframed.** Skyfire's centre of gravity has moved to consumer agentic checkout and bot-defence identity. Its KYA JWTs are recognised at the merchant edge by the majority of enterprise bot managers — Akamai, F5, DataDome, Human, Imperva, Sequentum, Fastly — and the F5 integration reaches an estate fronting 80%+ of the Fortune Global 500. What it does **not** have, on the evidence, is a named enterprise buyer pipeline for third-party research services.

So: **treat Skyfire as a credential acquisition with a revenue tail, not as a revenue tier.** Registration appears developer self-serve, so the cost of holding the credential is low. The credential matters in two directions — inbound (enterprise buyers whose stacks recognise KYA) and outbound (if Grey's own agents ever need to traverse bot-defended surfaces).

**Reuses.** MCP tool surface (E1-D), metering (E4), EvaluationKit.

**Bequeaths.** **Agent-identity credential layer** — signed-JWT identity, OAuth2/OIDC bridge, KYA-token handling. E7's per-contract auth is a specialisation of this.

**Phases.**
- **E5-A — KYA registration** bound to the ERC-8004 DID where the model permits.
- **E5-B — JWT/OAuth2 credential layer** in grey-core (generalised, not Skyfire-specific).
- **E5-C — KYAPay monetisation of the MCP surface** from E1-D.
- **E5-D — Premium tier listing** at 1.35×, with `compliance_research_input` repriced to $9.00 canonical (§2.5).

**Pricing.** 1.35×. Positioned carefully as *research input*, never as compliance certification.

**Gate.** None onward — E5 is a branch terminus feeding E7.

**Kill criteria.** If no settled payment arrives after listing, retain the KYA credential (cheap to hold, useful independently) and stop Skyfire-specific work.

**Success metric.** Credential held and recognised; secondarily, settled premium-tier revenue.

---

### E6 — Fetch.ai Agentverse / ASI:One

**Objective.** Add the first non-HTTP-native protocol adapter and place the Research concentration in front of conversational-lookup buyers.

**Runs after E5 per OD-5.**

**Why here.** Agentverse is the registration surface; ASI:One is the demand funnel that calls into it — the ASI1 model autonomously discovers and invokes Agentverse-registered agents. That is a genuinely different discovery mechanism from Bazaar's metadata index, and worth having. But: the 2.7M agent count is a directory count, not activity; Fetch's own CEO puts the figure at "ninety percent of AI agents never get used"; AI-to-AI payments only rolled out in December 2025; and monetisation is described as "tags, subscriptions, or deep links" — vaguer plumbing than 402-and-settle. This is the first expansion requiring a Python `uagents` adapter, so its build cost is materially higher than E1–E3 while its demand evidence is materially weaker. Hence late.

**SingularityNET is folded in here.** Since the January 2026 ASI Alliance merger completion, Agentverse registration *is* the ASI-ecosystem coverage. The `adapters/snet-daemon/` line item is struck.

**Reuses.** EvaluationKit, `computeClass`, metering.

**Bequeaths.** **Non-HTTP protocol adapter pattern** under `ChannelIngress` — proves the interface generalises past request/response HTTP. Valuable if any future surface is protocol-native rather than HTTP-native.

**Phases.**
- **E6-A — uAgent adapter** (External Agent on VPS, mailbox pattern) behind `ChannelIngress`.
- **E6-B — Mailbox latency/cost characterisation.** **No public data exists on this.** Measure empirically on testnet before committing to the pattern; it is a live risk to the adapter design.
- **E6-C — Almanac registration + EvaluationKit render** with Agentverse's SEO/ranking metadata tooling.
- **E6-D — Research tier**: `quick_protocol_facts` $0.20 `CACHE_ONLY`, plus `claim_extraction`, `claim_history`.

**Pricing.** 1.00×, Research tier only.

**Kill criteria.** If E6-B shows mailbox latency or cost incompatible with the price point, stop before E6-C. Do not build a channel that loses money per call on principle.

**Success metric.** Settled value; secondarily, ASI:One invocation counts as a leading indicator.

---

### E7 — Direct B2B (negotiated contracts)

**Objective.** Land per-protocol monitoring retainers with DeFi allocators and vault curators.

**Why here.** Highest revenue per unit of any surface, lowest *platform* code (grey-core HTTP + per-contract auth), highest *human* effort. It sits late because it consumes E4's metering and E5's auth.

> **Outreach start: UNRESOLVED (OD-4).** Whether the non-engineering outreach track opens early (parallel from E1) or waits for E7 engineering is a Forces call not yet made. Bion does **not** initiate outreach on its own judgement. This blocks no engineering work in E1–E6; E7-A/B remain sequenced as written. Carry OD-4 forward as a live open decision and re-raise it at the E4 gate at the latest — a contract signed before metering exists would create delivery obligations grey-core cannot yet meter.

**The re-anchor.** The May portfolio's Model B $7,500/mo anchor does not survive contact with current numbers. Giza: ~$6.5M TVL, ~$202.5K annualised protocol fees. A $7,500/mo retainer is ~44% of their entire annual fee revenue. Theoriq's AlphaVault launched December 2025 and its TVL is incentive-farmed against 1% of THQ supply — it will churn when the campaign ends.

**Posture (Model A lead ratified):**
- **Lead with Model A: $750–$2,000/mo per-protocol monitoring.** Model B ($5,000–$25,000/mo allocator flat-rate) stays on the menu for genuinely larger counterparties but cannot be the opening position.
- **Broaden the target list beyond Giza/Theoriq** — the allocator-agent category itself deflated. Candidates: larger vault curators (Mellow, StakeWise, and the Turtle ecosystem), independent risk-curation firms, prediction-market resolution buyers who already consume Grey output on Olas.
- **Re-verify TVL and fee figures immediately before any outreach.** These move fast; the numbers in this document are July 2026 snapshots.

**Reuses.** Metering + subscription state (E4), credential/auth layer (E5), MCP surface (E1-D), grey-core HTTP.

**Bequeaths.** Tenanted access model — per-contract keys, quotas, SLA reporting. Terminal for the project but foundational for any future enterprise work.

**Phases.**
- **E7-A — Tenanting**: per-contract auth, quotas, isolation.
- **E7-B — Reporting surface**: usage and SLA reporting per tenant.
- **E7-C — Outreach** (non-engineering; **start timing pending OD-4**): target list, Model A framing, `allocation_risk_report` as headline.
- **E7-D — First contract delivery.**

**Pricing.** Model A $750–$2,000/mo. Model C (per-allocation, 0.05–0.1%) remains aspirational and is not a first-contract instrument.

**Success metric.** Signed contracts; monthly recurring revenue.

---

### E8 — Bittensor Path A

**Objective.** Optional. Mine in an existing subnet whose validator scoring rewards verification-style output.

**Why last, and why conditional.** Emissions halved on 2025-12-14 (7,200 → 3,600 TAO/day, ≈$767K/day at TAO ≈ $213 — the May portfolio's $1.08M/day figure is stale). **Path B is struck**: subnet registration reached ~1,500 TAO (~$470K locked) with dynamic doubling per registration. Path A is harsher than owner economics in one specific way — **miner UID registration TAO is burned and unrecoverable**, and miners outside their immunity period get pruned if their emissions rank lowest.

The deeper risk is governance instability: the emission-share model changed twice in eight months (flow-based from November 2025, deprecated and reverted to price-based EMA in June 2026). The reward function a miner optimises against is not stable. And no existing subnet has been identified whose validator scoring obviously rewards whitepaper-verification output.

**Bequeaths.** Nothing. Non-EVM coldkey/hotkey custody is a separate discipline that generalises to nothing else in the stack. This is why it is terminal.

**Preconditions (all required).** E1–E4 economics proven positive · a specific subnet identified whose scoring demonstrably fits, by reading taostats subnet-by-subnet at decision time · UID burn treated as at-risk capital Forces is willing to lose · `GREY_COLD_BITTENSOR` Tier C provisioned via `@grey/ceremony`.

**Revisit trigger for Path B.** The planned 128 → 256 active-subnet expansion, combined with registration-price decay. Not before.

---

## 4. Cross-cutting gates

These are not expansions. They are conditions that must hold at specific points.

**G1 — Margin instrumentation live.** *Required before E2.* Shipped in E1-F. Without per-call cost attribution, every pricing multiplier in §2.3 is a guess.

**G2 — Buyer reputation: shadow → enforce. HARD BLOCK ON THE TRUST RUNG.** The gating built in M0-Extension still runs with `BUYER_GATING_BLOCK_ENABLED=false`. Forces ruling 2026-07-26: **the $0.10 trust rung is blocked from live exposure on every channel until reviewed.** The rung may be built and tested in E1-C behind a default-off disable flag; it may not be reachable in production. G2 is the review point at which Forces decides whether to lift the block, and lifting it presupposes reputation gating flipped to enforce first. Bion may not lift this block on its own authority under any circumstance, including a later expansion appearing to need the rung.

**G3 — `computeClass` assertion coverage.** *Required before E3.* The 0.65× Olas tier is only safe if `CACHE_ONLY` provably cannot reach live compute. Assert in `vitest run`; verify in production logs before the tier goes live.

**G4 — Per-chain key isolation.** *Required at every new chain.* Never share keys across services or chains. Keys generated via `@grey/ceremony`, encrypted keystores under `C:\Users\kidco\.grey\keys\`. Dedicated RPC app per service (`grey-local` / `grey-sweeper` / `grey-core` topology).

**G5 — Repatriation economics.** *Required before any non-Base chain goes live.* Settled value must exceed bridge + gas cost of repatriation, or the channel is a loss.

---

## 5. Decision register

### 5.1 Resolved — Forces, 2026-07-26

| ID | Decision | Ruling | Lands in |
|---|---|---|---|
| **OD-1** | Skyfire `compliance_research_input` price | **$9.00** (from $15.00). $9 × 1.35 ≈ $12.15 realised — premium retained, credibility gap closed against $10 x402 comps. | §2.5, E5-D |
| **OD-2** | Olas rail | **x402-over-Olas primary; Python Mech Tool as evidence-triggered fallback.** Determination made during the E3 build period, not in advance. | E3-A |
| **OD-3** | Nevermined scope if consumption data unavailable | **Ship metering (E4-A/B/E), skip the platform.** Ruled-acceptable outcome; report, do not escalate. | E4 kill criteria |
| **OD-5** | E5/E6 branch order | **Skyfire first**, Agentverse second. | E5, E6 |
| **OD-6** | Does the E1→E2 gate's "settled non-self payment" leg have to clear before E2 build starts | **Decoupled from E2 timing (2026-08-02).** Real, non-self settlement is still the goal and still tracked — wait for organic Bazaar-discovered traffic to produce it, promotion continues in parallel — but E2 build is not blocked on it. Indexing and the margin-ledger leg of the gate are **unaffected** and still required before E2 in earnest. | §3 E1 gate to E2 |

### 5.2 Open

| ID | Decision | Status | Effect while open |
|---|---|---|---|
| **OD-4** | B2B outreach start — parallel from E1, or wait for E7 engineering | **TBD (Forces).** | Bion does not initiate outreach. Blocks no engineering in E1–E6. Re-raise at the E4 gate at the latest: a contract signed before metering exists creates delivery obligations grey-core cannot meter. |
| **OD-7** | Kite Agent App Store access — request invitation now, or hold | **DOWNGRADED 2026-08-04: not resolved, likely dormant.** Forces submitted the application; it turned out to be a generic 5-question Typeform ending "thanks, we'll notify you," branded only "Kite AI" — no App Store or marketplace-specific language anywhere in it, no dashboard, no OpenAPI submission step, no invitation code. This does not look like a functioning vendor-onboarding system; more likely a lead-capture/notify list for something not yet built or not yet open. The earlier docs describing a Step0/1/2 registration flow with a 24-hour invitation window were themselves confirmed stale — retired from Kite's current live documentation, retrieved only via a cached search snippet, not the live site (browser-confirmed 2026-08-04). Revisit only if Kite actually opens a real onboarding flow with concrete requirements. | Bion does not request access again on its own judgement. E2-D's listing work has nothing concrete to build against — treat as dormant, not "in progress." Chain abstraction (E2-A) and wallet/sweep (E2-BE) are unaffected and already retained. |

### 5.3 Standing blocks

Not decisions — instructions. Liftable only by explicit Forces authorisation.

| ID | Block | Status |
|---|---|---|
| **B-1** | $0.10 `legitimacy_scan` trust rung: no live exposure on any channel | **ACTIVE (Forces, 2026-07-26).** Build and test permitted behind a default-off flag (E1-C). Review point is G2. Not liftable by Bion. |

---

## 6. Ledger and invariants

**New invariants proposed by this plan** (FDQ ledger opens at FDQ-77; invariants continue from #29):

- **#30** — No offering may be served below its `computeClass` floor on any channel. `CACHE_ONLY` offerings never trigger live compute under any circumstance, including a paid retry.
- **#31** — Adapters never hold hardcoded prices. All pricing resolves from the canonical list in `@grey/schemas` through a `networkMultiplier` at the adapter boundary.
- **#32** — No new chain goes live without Tier A/Tier B separation, `@grey/ceremony`-generated keys, a dedicated RPC app, and a demonstrated repatriation path to Tier D.
- **#33** — Every channel listing renders from the single EvaluationKit source. No hand-authored per-platform metadata.
- **#34** — Any offering under a standing Forces block ships behind a default-off disable flag with tests asserting unreachability on every live channel. Blocks lift only on explicit Forces authorisation, never on a downstream expansion's apparent need.

**Plan deltas superseded.** The July deep dive's D1–D7 are absorbed and revised here: D1 (Kite → E2, earlier than the proposed Block 2.5), D2 (SingularityNET struck, folded into E6), D3 (B2B Model A lead at $750–$2,000/mo), D4 (Olas Tier C = NO, confirmed), D5 (Bittensor Path B struck; Path A = E8, capital-gated), D6 (Skyfire reframed as credential acquisition; price cut per OD-1), D7 (**promoted from non-blocking to E1, first position**). Added: `computeClass` + multiplier engine (§2.2–2.3), MCP surface at E1-D, reputation flip-to-enforce as gate G2, and standing block B-1 on the trust rung.

---

## 7. Bion operating brief

This project is structured to be run by an independent manager. The operating contract:

0. **Two things Bion may not do on its own authority.** (a) Lift the B-1 trust-rung block (§2.4, §4 G2, §5.3). (b) Initiate B2B outreach while OD-4 is open (§5.2, E7). Both require explicit Forces authorisation. Everything else in this document is Bion's to run.
1. **One expansion at a time.** Do not open E(n+1) before E(n)'s gate is met. The bequest chain is the whole design; skipping ahead means rebuilding.
2. **Gates are denominated in settled USDC and merged code, never in activity.** Directory listings, agent counts and probe volumes are diagnostics, not gates.
3. **Kill criteria are instructions, not suggestions.** When a kill criterion fires, stop the platform-specific work and retain the bequeathed component. Several expansions are explicitly designed to be worth doing even if the platform earns nothing.
4. **Deviation from this plan is expected.** Treat it as a north star, not a contract. As each expansion comes into focus, divergence is normal — apply engineering judgement, flag and discuss changes. A better plan now beats a correction later.
5. **Kov comms format is binding.** Every instruction set to Kov is a markdown file written to disk, never a chat code block. Every directive instructs Kov to output the **diff** (`gh pr diff <n>` or raw hunks) for review, not a prose report summarising its own work. Diffs are the artifact of record.
6. **Standing rules apply unchanged.** No time estimates in any output. Explicit file paths only when staging git — never `git add -A` or `git add .`. Commits and pushes only with explicit Forces authorisation. `vitest run` is the canonical test runner. Never wipe or delete from `wpv_claims`, `wpv_verifications`, or `wpv_whitepapers` without explicit Forces approval. MCP failure discipline: retry up to 3×, then stop and report — never silently proceed on partial context.
7. **Every external metric in this document is a July 2026 snapshot.** TVL, token prices and platform volumes move fast. Re-verify before any decision that depends on them — particularly the E7 target numbers.

---

*Plan produced 2026-07-26. Supersedes the platform sequencing in `grey-deployment-plan-v7.md` Block 1–5 and the D1–D7 deltas in `Grey Revenue Platform Deep Dive - 2026-07.md`. Does not supersede the pricing tables in v7 except where §2.5 states explicitly.*
