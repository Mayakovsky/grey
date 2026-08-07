# CDP / BAZAAR ALIGNMENT — PHASE 2 (route settle/verify through CDP Facilitator)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02).
**Refs:** `CDP-BAZAAR-ALIGNMENT-PHASE1-KOV-directive.md` (do this after Phase 1 lands — deploy + validation-order fix + wire-format reprojection), `CDP-BAZAAR-COMPATIBILITY-AUDIT-REPORT-KOV.md`.
**Gate:** Forces is generating a CDP Secret API Key in the portal (IP-allowlisted to the production VPS) and setting `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` in both local `.env` and `/etc/grey/grey-core.env` on the VPS. **Do not attempt live mainnet settlement through CDP until Forces confirms those values are set** — build and test against Base Sepolia in the meantime; the keys work identically for testnet and mainnet, only the network config differs.

## Why

Confirmed by the audit: CDP only indexes a resource once a real payment for it settles through CDP's own Facilitator. Grey's `verify()`/`settle()` are entirely self-hosted today (own relayer, own EIP-712/EIP-3009 logic, zero CDP contact). This phase adds CDP as the settlement path — Forces' ruling stands: connective infrastructure to external platforms is in scope for Expansion, unlike dependencies in Grey's own core.

## Task 1 — Wire in `@coinbase/x402`

Add the package. Its default export:
```typescript
import { facilitator } from "@coinbase/x402";
// reads CDP_API_KEY_ID / CDP_API_KEY_SECRET automatically
```
This needs to slot into `adapters/x402-middleware`'s existing `verify()`/`settle()` call sites (`verify.ts`, `settle.ts`) — today those do local EIP-712 recovery and a direct `writeContract` via the relayer's own key. Design question for you to resolve: does CDP's facilitator **replace** that local logic entirely (CDP does verify+settle, Grey's relayer wallet is no longer the one broadcasting), or does Grey keep its own settlement as the primary path and add a **second**, CDP-routed path purely for Bazaar-visible routes? Either is defensible — flag which you're building and why, don't silently pick.

## Task 2 — Config

`adapters/x402-middleware/src/config.ts`'s `X402Config`/`loadX402Config()` currently has no facilitator field at all (confirmed by the audit — this is genuinely new surface, not a rewire of something existing). Add it, reading `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` — fail closed (clear error, not silent no-op) if CDP routing is requested but the keys aren't set, matching this codebase's existing fail-closed conventions elsewhere.

## Task 3 — Test on Base Sepolia first

Same discipline as every prior mainnet-adjacent change in this project's history. Get testnet USDC/ETH from the CDP Faucet if needed. Confirm a real (testnet) settlement completes through CDP, then confirm via CDP's discovery endpoints (`GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`, filtered or just grep the response) that the route actually shows up — that's the real end-to-end proof, not just "the call didn't error."

## Task 4 — Only after Task 3 passes on testnet, and only with Forces' explicit go

Flip to mainnet. This is real settlement infrastructure changing — treat it with the same weight as the M5 mainnet cutover, not as a routine deploy.

## Deliver

Diff + Sepolia test evidence (transaction hash, and the discovery-index confirmation). Do not touch mainnet config without a separate, explicit go from Forces after Task 3's evidence is reviewed.
