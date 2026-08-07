# CDP Facilitator — Phase 2 — Delivery Report (Tasks 1-2 done, Task 3 blocked)

**From:** Kov · **To:** Desktop / Forces · 2026-08-02
**Refs:** `CDP-FACILITATOR-PHASE2-FULL-RUN-KOV-directive.md`.
**Branch:** `cdp-facilitator-phase2` (local commit `9638666`, **not pushed** — see below).

## Tasks 1-2 — done, gate green

Added `@coinbase/x402` + `@x402/core` and built a genuinely parallel settlement path:

- **`adapters/x402-middleware/src/cdpFacilitator.ts`** (new) — `makeCdpX402PaymentPresenceCheck`/`makeCdpX402PreHandler`, structurally mirroring the split-gate pattern from Phase 1: a body-independent `preValidation` header check, then a `preHandler` that decodes (Grey's own `decodePaymentHeader`, unchanged) and verifies+settles **through CDP's hosted facilitator** (`HTTPFacilitatorClient` from `@x402/core/http`, pointed at CDP via `@coinbase/x402`'s `createFacilitatorConfig`) instead of the local relayer. `makeCdpFacilitatorClient` fails closed — throws immediately at construction — if invoked while CDP isn't configured.
- **`packages/grey-core/src/server/routes/cdpOfferings.ts`** (new) — `POST /v1/cdp/offerings/<slug>` × 7, mounted only when a `cdpGate` is supplied (mirrors trust rung's conditional-mount pattern). Same handlers/pricing/envelope as the primary route; revenue recorded under `channel: 'x402-cdp'` (vs `'x402'`) so the two rails stay distinguishable in the margin report.
- **`X402Config.cdp`** (new, `types.ts`/`config.ts`) — populated only when both `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` are set (both-or-neither, fails closed). The primary local-relayer path never reads it.
- **Buyer-facing wire format is unchanged** on both routes — same 402 challenge, same X-PAYMENT header shape. Only the server-side verify/settle call differs. The CDP-side request is translated to CDP's **live x402 protocol v2 wire shape** (`scheme/network/asset/amount/payTo/maxTimeoutSeconds/extra`, not Grey's own v1 `maxAmountRequired`/`resource` shape) — confirmed empirically against CDP's own unauthenticated discovery endpoint (`GET /platform/v2/x402/discovery/resources` returned live `x402Version: 2` items matching this shape exactly), not assumed from docs.
- `makeX402PreHandler`/`makeTrustRungPreHandler` and the primary `/v1/offerings/<slug>` routes are **untouched**.

**Gate:** `turbo run build test typecheck lint` on `@grey/x402-middleware` + `@grey/core` + `@grey/acp-adapter`, forced (no cache): **14/14 green**. 21 new unit tests (`cdpFacilitator.test.ts`, mocked `FacilitatorClient` — zero network calls) + 4 new route tests (`cdpOfferings.test.ts`) + 15 updated config tests. Prettier clean on all touched files.

## Task 3 — blocked: CDP rejects the staged credentials

Before writing code I verified CDP's actual wire protocol empirically (`GET /platform/v2/x402/discovery/resources`, unauthenticated, works — this is what confirmed the v2 shape above). But **every authenticated call fails**:

- `GET /platform/v2/x402/supported` (via `@x402/core`'s own `HTTPFacilitatorClient`, using `@coinbase/x402`'s `facilitator` config) → `401 Unauthorized`.
- Same result calling CDP directly (bypassing the SDK) with a hand-inspected JWT.
- I decoded the generated JWT and it matches CDP's own documented shape exactly (`alg: EdDSA`, `kid`/`sub` = the key ID, `iss: 'cdp'`, correct `uris` claim, sane `iat`/`nbf`/`exp`) — so this isn't a JWT-generation bug in the SDK or in my usage of it.
- To isolate whether this was x402-specific, I tried the **same key** against an unrelated general Platform API endpoint (`GET /platform/v2/evm/accounts`) — **also 401**. So the credential is being rejected account-wide, not just for the x402 product.

This is exactly the class of blocker the directive calls out explicitly ("credentials rejected") — I stopped rather than guessing further. I made a small number of real calls against CDP's live API during this diagnosis (documented above); I have not retried since concluding it's a credential issue, to avoid hammering their auth endpoint.

**What I can't tell from here:** whether the key was revoked/rotated, needs an IP allowlist entry my current network doesn't satisfy, or was never actually enabled in the CDP Portal for this project. That needs someone with CDP Portal access to check.

## Not done (per the directive's own gating)

- No testnet settlement, no CDP discovery-endpoint confirmation of a Grey resource (Task 3).
- **Branch not pushed, no PR opened** — the directive says push/PR happens "once Task 3 passes." It hasn't.
- Task 4 (mainnet) — untouched, as instructed regardless.

## What I need from Forces

Either (a) corrected/re-verified CDP credentials so I can resume Task 3, or (b) if you'd rather see the Task 1-2 diff now despite Task 3 being incomplete, say so explicitly and I'll push the branch and open the PR with Task 3 flagged as pending in the PR description — I won't do that on my own read of the directive's sequencing.
