# Bankr Bridge — thin resale proxy on Bankr's x402 Cloud — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-09-19) — Option B of the Bankr integration research, platform pick made this instance.
**Spec:** this directive (new front; no prior spec file — successor to the "next front" note in `grey.md`/`ADAPTER-BUILD-GENERAL-HANDOFF.md` lineage, but this is not a `ChannelIngress` adapter, see Architecture below).
**Base:** `main` @ `d509dda847b5e2179cc5d8b15c1d18a6564f90e7`. **Branch:** `bankr-bridge-build`.
**Discipline (restated, unchanged):** explicit staging paths only, never `git add -A`/`.`; `vitest run` canonical; MCP/tool failure → retry ≤3 then STOP+report; no time estimates; cite `file:line`. Reviews are diffs. Merge is Forces-gated, no exceptions.

## Why

Bankr (bankr.bot) is an AI-agent trading platform whose agents already pay for pre-trade due-diligence signals over x402 (confirmed live pattern in their own ecosystem — a "pre-buy analysis gate" skill, a 31-tool "Security OS for autonomous agents"). Grey's `legitimacy_scan` is exactly that category of check. Goal: get it in front of Bankr's trading agents as a paid, discoverable x402 service, without touching Grey's existing production payment rail, signing keys, or fund flow.

## Architecture — thin proxy, not a new channel adapter

Two pieces. Grey's existing x402/CDP/ACP channels are untouched — this is additive, same posture as the CDP gate in `start.ts` (`cdpGate` only mounts when `x402Config.cdp` is non-null).

### 1. Grey-side: one new guarded internal route

Add `packages/grey-core/src/server/routes/bankrBridge.ts`, mounted the same additive way `mcp`/`cdpGate` are in `X402Adapter`/`buildServer` — **only when `GREY_BANKR_BRIDGE_SECRET` is set** in env, otherwise not mounted at all.

- Route: `POST /v1/bridge/bankr/<slug>`
- Slug allowlist for this pass — **`legitimacy_scan` only**, a new small const, not the full `PAID` array. Scope stays tight; more slugs are a follow-up directive, not this one.
- Auth: a static bearer secret, header `X-Grey-Bridge-Secret`, compared against `process.env.GREY_BANKR_BRIDGE_SECRET`. Constant-time compare (`crypto.timingSafeEqual`, same discipline as any other secret check in this codebase — check `x402-middleware` for the existing pattern before writing a new one). Missing/mismatched header → `403`, same shape as a normal auth failure, no payment semantics at all — **this route has no x402 gate, no wallet, no relayer, no signing key anywhere in its path.**
- Body validation: reuse the **same** `$grey` schema marker / `offeringRequestValidators` the existing PAID routes use (`offerings.ts` line ~62 pattern) — a malformed body still 400s, same as today.
- Handler body: call the **same** `offeringHandlers[slug]` + `buildEnvelope` the PAID route uses (`offerings.ts`), unchanged. This route is byte-for-byte the existing offering logic minus the payment gate — do not fork or reimplement the computation.
- Observability only (not blocking, do if it's cheap): log a usage event distinct from the real revenue ledger — e.g. `deps.revenueEvents.create({ channel: 'bankr-bridge', offering: slug, revenueUsd: 0 })` or a plain log line — so Kov/Desktop can see bridge call volume without it polluting the real x402 settlement numbers. **The actual USDC never touches grey-core on this path** — it settles directly to Grey's existing wallet via Bankr's facilitator (see part 2). If wiring a $0 revenue-ledger entry is awkward given the schema, skip it and just log — this is a nice-to-have, not a requirement.
- Test: new `packages/grey-core/test/routes/bankrBridge.test.ts` — assert 403 with no header, 403 with wrong secret, 400 on bad body with correct secret, 200 with correct secret + valid body returning the same envelope shape the PAID route produces. `vitest run`, canonical.

### 2. Bankr-side: a new deployable directory, outside the pnpm workspace

New top-level directory `integrations/bankr-bridge/` — **not** a workspace package, not published, no dependency on `@grey/*` internals. This is deployable artifact code for a third party's runtime (Bankr's serverless x402 Cloud), kept shallow and deletable on its own with zero blast radius to grey-core, per standing principle (prefer owning code; third-party deps stay shallow/swappable).

`integrations/bankr-bridge/bankr.x402.json`:
```json
{
  "payTo": "0x394e81DA28799b578620803772FAeE403dE2d3f6",
  "network": "base",
  "currency": "USDC",
  "services": {
    "legitimacy-scan": {
      "description": "Fast structural + claims legitimacy read on a token project, cache-or-live. Runs Whitepaper Grey's due-diligence pipeline.",
      "price": "0.25",
      "methods": ["POST"],
      "category": "data",
      "tags": ["crypto", "due-diligence", "verification", "pre-trade"],
      "paymentScheme": "exact",
      "schema": {
        "input": {
          "type": "object",
          "properties": {
            "token_address": { "type": "string", "description": "Token contract address to check" },
            "project_name": { "type": "string", "description": "Project name (optional)" }
          },
          "required": ["token_address"]
        },
        "output": {
          "type": "object",
          "properties": {
            "projectName": { "type": "string" },
            "tokenAddress": { "type": ["string", "null"] },
            "structuralScore": { "type": "number", "description": "1-5; 0 means not analyzed (cache-miss)" },
            "verdict": { "type": "string" },
            "hypeTechRatio": { "type": "number" },
            "claimCount": { "type": "number" },
            "claimsMicaCompliance": { "type": "string" },
            "micaCompliant": { "type": "string" },
            "micaSummary": { "type": "string" },
            "generatedAt": { "type": "string" },
            "discoveryStatus": { "type": "string" }
          }
        }
      }
    }
  }
}
```
`payTo` is Grey's existing production wallet — already public as the `payTo` on every live Grey offering today. No new wallet, no key material anywhere in this directory. **Before wiring this into the actual config, true the `output` schema up against `LegitimacyScanReport` in `@grey/schemas/src/index.ts` directly — the shape above is transcribed from a live response capture, not copied from source. Cite file:line for whatever you confirm or correct.**

`integrations/bankr-bridge/x402/legitimacy-scan/index.ts` — handler, plain server-to-server fetch, no payment logic (Bankr's facilitator already handled that before this code runs):
```typescript
export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }
  const body = await req.json();
  if (!body?.token_address) {
    return Response.json({ error: "token_address is required" }, { status: 400 });
  }

  const res = await fetch("https://api.whitepapergrey.com/v1/bridge/bankr/legitimacy_scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Grey-Bridge-Secret": process.env.GREY_BANKR_BRIDGE_SECRET!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }
  return await res.json();
}
```
30s handler limit is comfortably enough — Grey's own handler is cache-or-live and already fast in production.

### Why this sidesteps the wire-format questions from the earlier research

The buyer-facing 402 challenge is generated entirely by Bankr's own facilitator when a Bankr agent calls this endpoint — Grey's own challenge shape (checked live: the CDP route delivers a base64-encoded header at `x402Version: 2`; the standard `/v1/offerings/*` route delivers a plain JSON body at `x402Version: 1` with `maxAmountRequired` instead of `amount`, and both use CAIP-2 network ids like `eip155:8453` where Bankr's own docs show short names like `base`) is irrelevant on this path. Grey's real endpoint is only ever called server-to-server, authenticated by a shared secret, never by Bankr's client directly.

## What Kov builds now vs. what's blocked

**Build now, no gate:**
- Everything in parts 1 and 2 above.
- Generate `GREY_BANKR_BRIDGE_SECRET` locally (a random token — not an account, not a key, not fund-touching). Document where it needs to land: Grey's VPS env, and later Bankr's `bankr x402 env set GREY_BANKR_BRIDGE_SECRET=...` (that second half is blocked below).
- All tests above, `vitest run` green.
- A local dry run: point the handler's fetch URL at a local grey-core instance instead of the production domain, confirm the full round-trip (fake secret → 403; real secret + valid body → real envelope back) without needing any Bankr credentials at all.
- Report back per usual (`BANKR-BRIDGE-BUILD-REPORT-KOV.md`, full path stated) with: files touched, diff summary, test results, and the exact two commands still needed to go live (`bankr x402 env set ...` and `bankr x402 deploy legitimacy-scan`) so Forces/Desktop can run them the moment an account exists.

**Blocked — do not attempt:**
- Creating a Bankr account or generating a Bankr API key. This is a new third-party account/identity — standing gate, Forces' call, not Kov's or Desktop's to do unilaterally (confirmed with Forces this session).
- Running `bankr login` / `bankr x402 deploy` / `bankr x402 env set` against a real Bankr account. Same reason — no account exists yet.
- Deploying the new grey-core route to the production VPS ahead of Desktop's diff review. Build and test on the branch; VPS rollout is a normal merge-gated step, same as always.

Stop at the branch + report. Desktop reviews the diff, states merge-only vs. merge-and-deploy explicitly in that review (two different "deploy"s are in play here — grey-core's own VPS deploy of the new route, and Bankr's `x402 deploy` of the proxy — don't conflate them in the report either).
