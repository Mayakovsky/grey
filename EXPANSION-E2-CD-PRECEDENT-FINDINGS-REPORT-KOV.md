# EXPANSION E2-CD — precedent-research findings — STOPPED before Task 1/2/3 code

**From:** Kov · **To:** Desktop · **Re:** `EXPANSION-E2-CD-KOV-directive.md`.
**Status:** Not branched. No code written. The directive's own mandatory "locate real precedent" step (five items) turned up findings that materially contradict its assumptions — same posture as `EXPANSION-E2-BE-BLOCKED-real-precedent-findings-REPORT-KOV.md`, per the directive's own instruction to stop rather than build around a wrong assumption.

**Headline finding, before the detail:** "Kite Agent Passport" and "Kite's provider directory" are not the same product, and MEP's framing conflates them. **Agent Passport is a buyer-side identity/wallet system with no relevance to Grey as a seller.** The thing Grey actually needs is the **Agent App Store** (a different Kite AIR component) — and getting *listed* there requires an admin invitation Grey doesn't have, from a platform in "limited access mode." This is closer to OD-4-shaped (an outreach/access question, Forces' call) than to the key-ceremony's "one mechanical action" shape.

## Findings, in the directive's order

### 1. EvaluationKit rendering (E1-B)

Real code: `packages/grey-schemas/src/evaluationKit/build.ts`'s `buildEvaluationKit()` (line 86), `buildAllEvaluationKits()` (145), `buildEvaluationArtifact()` (156). Consumed by:
- `packages/grey-core/src/server/routes/discovery.ts:26-53` — Grey's own free `GET /v1/discovery/services[/:slug]`.
- `adapters/x402-middleware/src/challenge.ts:52` (`buildCdpBazaarExtension`) — a **separate reshaper** that projects `EvaluationKitEntry` into CDP's `@x402/extensions/bazaar` wire shape via that library's own `declareDiscoveryExtension()` builder, not a direct pass-through.

`EvaluationKitEntry` is not a neutral shape — `build.ts:58-79`'s `isPrintableAscii`/`isValidIconUrl` are **Bazaar's own validation rules**, baked in at construction time. The existing precedent is therefore "write a dedicated reshaper per platform" (as CDP's got one), not "assume byte-compatibility" — exactly what the directive warned against assuming, and the warning was warranted.

### 2. MCP tool surface (E1-D)

Real code: `packages/grey-core/src/server/routes/mcp.ts` — one hand-rolled JSON-RPC endpoint (`POST /v1/mcp`, line 115), `tools/list` (134) projects `buildEvaluationKit()` into `{name, description, inputSchema}` via `toolDef()` (101-108). This is Grey's own live, already-built endpoint — "registering against Kite's MCP hub" is necessarily an external action (telling Kite this endpoint exists), not new endpoint code. See finding 4 for what that external action actually turns out to be (short version: I could not confirm Kite operates a distinct "MCP hub" at all).

### 3. ERC-8004 DID binding pattern

Real code: `@grey/ceremony`'s `link-agent.ts` (`validateLinkAgent`, line 27) — broadcasts `setAgentWallet(...)` against Grey's own on-chain ERC-8004 registry, gated by a local encrypted keystore + passphrase (`unlockKeystore`, `promptPassphrase`). This is a fully on-chain, keystore-based mechanism.

External research (finding 4) found **zero mention of ERC-8004, external DIDs, or any decentralized-identity binding** across three separate Kite sources (Agent Passport intro, agentpassport.ai, the Service Provider Guide). Kite's Passport identity is device-passkey-based (WebAuthn), not DID-based. **Conclusion: no binding code should be written — there's nothing on Kite's side for `link-agent`'s pattern to bind to.** MEP's "bind to the existing ERC-8004 DID where the Passport model permits" — the model does not permit it.

### 4. Kite Agent Passport's real registration flow — the finding that reframes this directive

Fetched directly, not summarized from a search snippet:
- `docs.gokite.ai/kite-agent-passport` (kite-agent-passport intro): registration is **email verification + web dashboard + a device-bound WebAuthn passkey** ("click the verification link... on the dashboard, generate a passkey... tied to your device (fingerprint, Face ID, or hardware key)"). No API. No wallet-signature step. No DID.
- `agentpassport.ai`: consistent with the above — a "Kpass" CLI skill exists for *using* an agent's passport (spending), not for *registering as a service provider*.
- `docs.gokite.ai/kite-agent-passport/service-provider-guide` — fetched specifically because it's the seller-facing doc, and it says something different from what the directive assumed: **it describes zero registration/onboarding mechanism.** It only covers *technical integration* — "return a 402 response with payment terms including your wallet address, verify via facilitator, deliver the service" — i.e., implement x402 (or AP2/MPP) correctly, which **Grey already does, unchanged, for Base**. Its only "setup" instruction is for *testing as a buyer* against your own service ("set up a Passport account... fund with testnet tokens... create an agent and approve a spending session... point the agent at your service endpoint") — that's Kite verifying a demo purchase flow, not Grey registering to be found.

So: **Agent Passport is not what a seller registers for.** Searching further for where sellers actually list surfaced the real mechanism, under a differently-named Kite AIR component:
- `app.gokite.ai` ("GoKite Catalog Services") — the **Agent App Store**. Per Kite's own onboarding description (search-confirmed, not yet independently fetched page-by-page — flagging that distinction): register requires (a) a prepared API endpoint with API-key auth, (b) **an OpenAPI schema in JSON**, (c) **an invitation from Kite AI admin** — quoting: *"As a group owner, you'll receive an invitation from Kite AI admin"* — and (d) a web-form submission using that invitation. Kite's own docs state the platform is **"currently in limited access mode, with gradual opening of access to users and service providers through waitlist and invitation system."**

**This is the actual Forces-gated checkpoint, and it's a different shape than the directive (or `EXPANSION-E2-KITE-KEY-CEREMONY-RUNBOOK-FORCES.md`) modeled.** The key ceremony was "Forces does one mechanical, self-contained action (run a CLI, generate a keypair) and hands back a result." This looks more like "Forces requests access to a waitlisted program, and Grey may or may not get an invitation on any particular timeline" — closer in kind to OD-4 (B2B outreach timing, Forces-gated, not Bion's to initiate) than to a runbook step. I have not written a `EXPANSION-E2-KITE-PASSPORT-REGISTRATION-RUNBOOK-FORCES.md` file for this reason: a runbook implies "here are the steps, go execute them," and step (c) — getting the invitation — isn't a step Forces can just execute; it may require requesting access from Kite first and waiting.

### 5. Directory-listing dependency

I found no statement that Agent App Store listing requires an existing Agent Passport identity, and no statement that it's independent either — the Service Provider Guide's silence on any identity prerequisite is suggestive but not a confirmation. Reporting the uncertainty rather than picking the reading that's more convenient to proceed on.

## What this means for Tasks 1–3

- **Task 1 (build the binding, stop before registering):** There is no binding code to build. Kite Agent Passport doesn't apply to Grey as a seller, doesn't support DID binding, and has no API — nothing here is a config/payload-construction problem. The actual gate is an App Store invitation request, which I'm treating as Forces' call to make (or not make) — same category as OD-4, not a mechanical runbook.
- **Task 2 (EvaluationKit re-render):** The real target shape is an **OpenAPI JSON document** (Kite's App Store wants "OpenAPI schema in JSON format"), not `EvaluationKitEntry`/Bazaar's shape. Grey already has one: `packages/grey-schemas/openapi/openapi.yaml` (247 lines), served live at `GET /openapi` (`packages/grey-core/src/server/routes/probes.ts:12,30`) — but it hardcodes Base-specific `x-x402-network: "base-mainnet"` and Base's USDC address in its `securitySchemes` block (openapi.yaml lines ~25-32). A Kite variant would need those swapped for Kite's real values (`eip155:2366`, `0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e`, verified in E2-BE) — **but I don't have confirmation that Kite's submission form even inspects those vendor-extension fields**, versus just wanting a generically-valid OpenAPI document. Building a full Kite-flavored variant now risks guessing at a shape I can't verify without actually reaching the submission form (behind the same invitation gate as Task 1).
- **Task 3 (MCP hub registration):** I could not find any evidence Kite operates a distinct "MCP hub" separate from the Agent App Store's generic service listing. MEP's phrasing may be reading "Kite explicitly supports x402 as a protocol standard alongside AP2, MPP and MCP" (a statement about protocols Kite's ecosystem recognizes) as implying a dedicated MCP registration surface that I could not confirm exists. If it doesn't, Task 3 may collapse into Task 2 (same App Store listing, same invitation gate) rather than being a separate mechanism.

## Recommendation

Three options, not mine to pick:
1. **Have Forces request Agent App Store access from Kite now** (an outreach action, same posture as OD-4) — once an invitation exists, the real submission form will show the actual OpenAPI/metadata requirements precisely, and I can build the correct Kite-flavored artifact against real requirements instead of a guess.
2. **Build a best-effort Kite OpenAPI JSON variant now anyway** (converting the existing `openapi.yaml`, correcting the x402 vendor fields to Kite's real values) as prep work, accepting it may need revision once real submission requirements are visible — lower cost, but risks wasted/wrong work given the shape uncertainty above.
3. **Park E2-CD here** and treat the App Store invitation as a standing open item (like OD-4), moving to whatever's next in the E2/E3 sequence that doesn't depend on it.

Standing by — no branch, no code, until you weigh in.
