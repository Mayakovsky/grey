# Bankr Bridge — Build Report (Kov)

**Directive:** `BANKR-BRIDGE-BUILD-KOV-directive.md`
**Branch:** `bankr-bridge-build`, pushed to `origin` — `https://github.com/Mayakovsky/grey/pull/new/bankr-bridge-build`
**Base:** `main` @ `d509dda` (directive's stated base commit, unmodified in this branch)
**Commit:** `5222b03` — `feat(bankr-bridge): thin resale proxy on Bankr's x402 Cloud`
**Status:** Everything in "build now, no gate" is done. Nothing in "blocked" was touched.

## Files touched

New:
- `packages/grey-core/src/server/routes/bankrBridge.ts` — the route
- `packages/grey-core/test/routes/bankrBridge.test.ts` — 8 tests
- `integrations/bankr-bridge/bankr.x402.json` — Bankr-side service config
- `integrations/bankr-bridge/x402/legitimacy-scan/index.ts` — Bankr-side handler
- `BANKR-BRIDGE-BUILD-KOV-directive.md` — committed alongside (was untracked at repo root)

Modified (additive-only, mirrors the `cdpGate` conditional-mount pattern):
- `packages/grey-core/src/server/index.ts` — `buildServer` gains `opts.bankrBridgeSecret?: string`; mounts the route only when present (`server/index.ts:52-54`)
- `packages/grey-core/src/channels/x402Adapter.ts` — `X402AdapterOptions`/`X402Adapter` carry `bankrBridgeSecret` through to `buildServer`
- `packages/grey-core/src/start.ts` — reads `process.env.GREY_BANKR_BRIDGE_SECRET`, passes it to the adapter

## Diff summary

**Route** (`bankrBridge.ts`): `POST /v1/bridge/bankr/legitimacy_scan`, slug allowlist is a new `BANKR_BRIDGE_SLUGS = ['legitimacy_scan']` const (not `offerings.ts`'s `PAID` array). Auth: header `X-Grey-Bridge-Secret`, constant-time compare via `node:crypto`'s `timingSafeEqual` — buffers of unequal length short-circuit to `false` before reaching it (`timingSafeEqual` throws on a length mismatch rather than comparing; the short-circuit leaks the secret's *length* via timing, not its content — the standard accepted tradeoff). Missing/wrong header → `403` with the same error-envelope shape as a normal auth failure, no payment semantics. Body validation reuses the same `$grey` request marker / `offeringRequestValidators` the PAID route uses (`offerings.ts:64`) — malformed body still 400s. Handler calls `offeringHandlers['legitimacy_scan']` + `buildEnvelope`, byte-for-byte the same call `offerings.ts:85-102` makes — not forked. Observability: logs a `$0` usage event on `deps.revenueEvents.create({ channel: 'bankr-bridge', offering: slug, revenueUsd: 0 })`, fail-open on write error (same non-fatal pattern as `offerings.ts:73-84`), distinct from the real `x402`/`x402-cdp` revenue channels.

**No `timingSafeEqual` precedent existed anywhere in the codebase to reuse** — checked `adapters/x402-middleware` first per the directive's instruction; genuinely absent. `bankrBridge.ts` is the first use; wrote the standard length-check-then-compare pattern.

**`bankr.x402.json` correction** (the directive explicitly asked for this, cite file:line): the directive's draft `output` schema modeled the flat `LegitimacyScanReport` fields as the top-level response shape. The real wire response is the **full `GreyResponseEnvelope`**, verbatim — `bankrBridge.ts`'s handler (like `offerings.ts`'s) calls `buildEnvelope()` and `reply.send(env)`; the Bankr-side handler (`integrations/bankr-bridge/x402/legitimacy-scan/index.ts`) is a pure pass-through (`return await res.json();`), so whatever grey-core sends is what Bankr's caller gets, unmodified. Confirmed against:
- `packages/grey-schemas/src/generated/v1/GreyResponseEnvelope.d.ts:10-86` — envelope shape (`schemaVersion`, `offering`, `requestId`, `agent{did,name,runtime}`, `subject{tokenAddress,projectName}`, `payload`, `metadata{costUsd,model,latencyMs,timestamp,cacheHit}`)
- `packages/grey-core/src/envelope/build.ts:31-45` — `buildEnvelope()`, called unchanged by the bridge route
- `packages/grey-schemas/src/index.ts:164-178` — `LegitimacyScanReport`, the `payload` shape

The corrected `bankr.x402.json` nests the draft's fields under `payload` and adds two fields the draft omitted — `discoverySourceTier` and `discoveryAttempts` — present on `LegitimacyScanReport` (`index.ts:176-177`) and in the generated response schema (`packages/grey-schemas/src/responses/v1/legitimacy_scan.schema.json:22-26`) but missing from the directive's transcribed draft.

**Second, smaller thing worth flagging (not corrected — it's the directive's own given Bankr-side code, unchanged):** that handler's success path returns `await res.json()` directly — a plain object, not a `Response`. Only its `405`/`400`/`502` error branches wrap in `Response.json(...)`. Confirmed live in the dry run below (`res2 instanceof Response` is `false` on the success path). If Bankr's serverless runtime expects a `Response` uniformly, this may need a `Response.json(await res.json())` wrap — flagging for Desktop's review rather than guessing at Bankr's runtime contract myself.

## Test results

`vitest run` (canonical), `packages/grey-core`:
```
Test Files  23 passed (23)
     Tests  155 passed (155)
```
8 new in `test/routes/bankrBridge.test.ts`: 404 with no `bankrBridgeSecret` configured (route doesn't exist), 403 no header, 403 wrong secret, 403 wrong-length secret (exercises the length-mismatch short-circuit), 400 bad body + correct secret, 200 correct secret + valid body → `expectValidEnvelope` passes, primary `/v1/offerings/legitimacy_scan` unaffected, `$0` `bankr-bridge` usage event recorded distinct from `x402`/`x402-cdp`.

`tsc --noEmit` on `packages/grey-core`: clean.

## Local dry run

Spun a real `buildServer(...)` instance (`fakeDeps`, `bankrBridgeSecret` set) bound to `127.0.0.1:<ephemeral port>`, pointed the Bankr-side handler's fetch at it via a `GREY_BRIDGE_URL` env override (added to `index.ts` for exactly this — defaults to the production URL when unset, so the given code's behavior is unchanged in production), then called the actual handler function:

1. Direct fetch, wrong secret → grey-core: **403** (confirms the route's own auth independent of the Bankr-side wrapper)
2. Round-trip through the Bankr-side handler, wrong secret → handler result: **502** `{ error: 'upstream error' }` (the handler squashes every non-2xx upstream status, including the 403 from #1, into a uniform 502 — that's the directive's given code, unchanged)
3. Round-trip, correct secret + valid body → handler result: a plain object, `offering: 'legitimacy_scan'`, `schemaVersion: 'v1'`, `payload` keys matching `LegitimacyScanReport` exactly (including `discoverySourceTier`/`discoveryAttempts`)

No Bankr credentials involved at any point.

## `GREY_BANKR_BRIDGE_SECRET`

Generated locally (32 random bytes, base64url) — not committed to git (`.env.bankr-bridge.local`, covered by the existing `.env.*.local` gitignore pattern at `.gitignore:21`). Value handed over out-of-band via Bion mail/live-notify, not in this file or the repo.

Where it needs to land:
1. **Grey's VPS env** — add `GREY_BANKR_BRIDGE_SECRET=<value>` to grey-core's production env and restart the process. This alone makes `POST /v1/bridge/bankr/legitimacy_scan` live on the VPS (still requires Desktop's diff review + the normal merge-gated deploy step first).
2. **Bankr's env** (blocked, needs a Bankr account first): `bankr x402 env set GREY_BANKR_BRIDGE_SECRET=<same value>`

## The two commands still needed to go live (blocked, not run)

```
bankr x402 env set GREY_BANKR_BRIDGE_SECRET=<value>
bankr x402 deploy legitimacy-scan
```
Both require a Bankr account/API key that does not exist yet — Forces' call per the directive, not run here.

## Two separate "deploy"s — do not conflate

1. **grey-core's own VPS deploy** of the new `/v1/bridge/bankr/legitimacy_scan` route — a normal merge-gated step, same as always, after Desktop's diff review of this branch.
2. **Bankr's `x402 deploy`** of the `integrations/bankr-bridge/` proxy to their serverless runtime — blocked on a Bankr account existing at all (Forces' call).

Desktop: please state merge-only vs. merge-and-deploy explicitly in the review, per the directive.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
