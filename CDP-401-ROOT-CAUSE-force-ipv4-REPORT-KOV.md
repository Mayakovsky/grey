# CDP 401 — Root Cause Fix — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-401-ROOT-CAUSE-force-ipv4-KOV-directive.md`.

## Mechanism chosen: system-level (`/etc/gai.conf`), not application-level

`@x402/core`'s `HTTPFacilitatorClient` calls the bare global `fetch(...)` internally with no injectable dispatcher/agent/family option anywhere in its constructor or method signatures (confirmed by reading its compiled source, not just the docs) — so there's no clean way to pin `family: 4` scoped to *just* CDP's calls without either monkey-patching global `fetch` around each call (unsafe under concurrency on a server handling other requests at the same time) or setting undici's global dispatcher for the whole grey-core process anyway (which is no more scoped than the OS-level fix, just narrower in which processes it covers).

Given that, and given the codebase has **zero IPv6 dependency anywhere** (grep across `packages/`+`adapters/` found one hit, an unrelated loopback-detection string), and confirmed nothing else on the box needs IPv6 egress (SSH already runs over IPv4, no other outbound integration has any IPv6 requirement), I used the standard OS-level fix: uncommented the pre-existing, self-documenting line in `/etc/gai.conf`:

```
precedence ::ffff:0:0/96  100
```

This is `/etc/gai.conf`'s own built-in "for sites which prefer IPv4 connections" option (RFC 3484 precedence table) — not a custom hack. Backed up the original first (`/etc/gai.conf.bak-pre-ipv4-fix`). No code touched — nothing to diff/review.

## Verify

```
VPS unflagged default:  44.243.254.19   (was 2600:1f14:2164:c900:e945:a19c:f8a1:67f9)
VPS curl -4:            44.243.254.19   (unchanged, sanity check)
VPS curl -6:            2600:1f14:2164:c900:e945:a19c:f8a1:67f9  (unchanged, sanity check — IPv6 still works if explicitly requested)
```

Re-ran both original 401 probes from the VPS (JWT generated locally — pure crypto, no network — then the actual HTTP call issued from the VPS so it carries the VPS's now-IPv4 egress):

- `GET /platform/v2/x402/supported` → **200 OK**. Notable: `kinds` lists both `x402Version:1` entries (paired with simple network names like `"base"`/`"base-sepolia"`) and `x402Version:2` entries (paired with CAIP-2 names like `"eip155:84532"`) — confirms the v2/CAIP-2 wire-shape choice made in the Phase 2 code (`cdpFacilitator.ts`) is exactly what CDP's live API expects for that network-naming convention, not a guess.
- `GET /platform/v2/evm/accounts` (the unrelated general Platform API endpoint used to isolate x402-specific vs account-wide) → **200 OK**, `{"accounts":[]}`.

Root cause fully confirmed and resolved. Resuming Task 3 now.
