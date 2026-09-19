# Bankr Bridge — Desktop Review — branch `bankr-bridge-build` @ `db10bb3`

**From:** Claude Desktop · **To:** Kov / Forces · **Verdict: MERGE-ONLY.**

## What I reviewed
- `git diff main..bankr-bridge-build --stat` (9 files, +563/-0 — confirmed additive)
- `packages/grey-core/src/server/routes/bankrBridge.ts` (full)
- `packages/grey-core/src/server/index.ts`, `src/channels/x402Adapter.ts`, `src/start.ts` diffs (wiring)
- `integrations/bankr-bridge/bankr.x402.json` (full)
- `integrations/bankr-bridge/x402/legitimacy-scan/index.ts` (full)
- `packages/grey-core/test/routes/bankrBridge.test.ts` (full, 8 tests)

## grey-core (packages/grey-core/**) — clean, cleared to merge and deploy

- Wiring in `index.ts` / `x402Adapter.ts` / `start.ts` mirrors the `cdpGate` optional-mount pattern exactly. No changes to existing gate logic, the `PAID` array, wallet/relayer code, or `MCP_TOOL_SLUGS`.
- `bankrBridge.ts`: `timingSafeEqual` secret check is correct — length checked before the constant-time compare, no length-oracle. Reuses `offeringHandlers[slug]` + `buildEnvelope` unchanged; no forked computation.
- Observation, not a blocker: the secret check runs inside the handler body rather than a `preValidation` hook, so Fastify's schema validation runs before the auth check — a request with a malformed body and no/wrong secret gets 400, not 403. `offerings.ts` splits this deliberately for x402-crawler reasons that don't apply here (this route has no x402 semantics at all), and the input schema is already public in `bankr.x402.json`, so there's no disclosure and no cost asymmetry (schema validation is cheap; neither path touches `offeringHandlers` or the ledger). Leaving as-is.
- `bankr.x402.json`: correctly trued up — payload now nests the full envelope instead of the directive's original flat draft, cited against `GreyResponseEnvelope.d.ts:10-86`, `envelope/build.ts:31-45`, `grey-schemas/src/index.ts:164-178` as required. Matches my own read of those files earlier in this build.
- Tests: 8/8 cover the real surface — 404 unmounted, 403 missing/wrong/short secret, 400 bad body, 200 + envelope shape, primary `/v1/offerings/legitimacy_scan` route unaffected (regression guard), $0 ledger event kept distinct from real x402 revenue. No gaps I'd ask for.

**Verdict: merge to `main` now. VPS deploy of this code is also cleared now** — the route 404s until `GREY_BANKR_BRIDGE_SECRET` is set in the VPS env, so shipping the dormant route ahead of the secret is zero-risk, same posture as any other env-gated addition in this codebase.

## integrations/bankr-bridge (Bankr-side proxy) — one required fix before deploy, not a gate issue

`x402/legitimacy-scan/index.ts` success path: `return await res.json();` returns a plain object. Both error paths already return `Response.json(...)`. Bankr's handler signature (`(req: Request) => Response`) is the standard fetch-API edge-handler contract — the same one this file's own error paths assume. A plain object on the one path that actually matters (the paid, revenue-generating success response) does not satisfy that contract as written. This is a real bug on the primary path, not a style nit.

**Kov: fix**
```typescript
return Response.json(await res.json());
```
(forwarding `res.status` too is free correctness, though `res.ok` is already checked so it's always 200 today). Add one test asserting the handler returns a `Response` instance on the success path. `vitest run`, report back. No gate — no account, no key, no fund flow — build now.

## Overall verdict: MERGE-ONLY

- **grey-core:** merge to `main`. VPS deploy of grey-core's own route: cleared, ship it now (inert without the secret).
- **Bankr-side `bankr x402 deploy legitimacy-scan`:** NOT cleared. Blocked on (1) the Response-wrap fix above, and (2) the standing account-creation gate (Bankr account/API key — Forces' call per the original directive, status pending on Forces' side).

Once both clear: generate a fresh production secret (do not reuse Kov's local test secret), `bankr x402 env set GREY_BANKR_BRIDGE_SECRET=<production secret>`, then `bankr x402 deploy legitimacy-scan`.
