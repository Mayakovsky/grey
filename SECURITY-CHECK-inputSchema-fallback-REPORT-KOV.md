# Security Check — `kit.inputSchema ?? {}` Fallback — Confirmation Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `SECURITY-CHECK-inputSchema-fallback-KOV-directive.md`.

## Answer: **confirmed separate.** `kit.inputSchema` never feeds real request enforcement.

Traced both paths end to end.

**Real enforcement path** — what a request actually has to satisfy:
- Every route sets `schema: { body: { $grey: { kind: 'request', offering: slug } } }`, never a schema object directly:
  - `packages/grey-core/src/server/routes/offerings.ts:56`
  - `packages/grey-core/src/server/routes/trustRung.ts:27`
  - `packages/grey-core/src/server/routes/cdpOfferings.ts:28`
- `installValidatorCompiler` (`packages/grey-core/src/server/validators.ts:34-40`) resolves that `$grey` marker to `offeringRequestValidators[marker.offering]`.
- `offeringRequestValidators` (`packages/grey-schemas/src/validators/index.ts:97-104`) are Ajv2020-compiled from schemas added via `ajv.addSchema([...])` (same file, ~line 54-59), sourced by direct static import of `../requests/v1/*.schema.json`.
- **`buildEvaluationArtifact`/`buildEvaluationKit`/`EvaluationKitEntry` are never referenced anywhere in this file or in `validators.ts`.**

**`kit.inputSchema`'s path** — where it actually comes from and goes:
- Sourced in `packages/grey-schemas/src/evaluationKit/build.ts:44-52` (`INPUT_SCHEMAS[slug]`), which imports the **same underlying static JSON files** as the validators above (`../requests/v1/*.schema.json`) — but via a separate import statement into a separate `Record<PaidOfferingSlug, object>`, with zero shared reference or merge with the `ajv`/`offeringRequestValidators` path.
- `kit.inputSchema` is consumed in exactly three places, all descriptive-only:
  1. `buildCdpBazaarExtension` (`adapters/x402-middleware/src/challenge.ts`) → `extensions.bazaar.schema.properties.input` (the 402 body's discovery metadata).
  2. `buildPaymentRequirements`'s `extra.bazaar.inputSchema` (same file) — same 402 body, same descriptive field.
  3. `mcp.ts:97` (`toolDef().inputSchema`) — the schema **advertised** in `tools/list`'s response, shown to MCP clients so they know what shape to send. Confirmed this also does **not** feed enforcement: `tools/call`'s handler (`mcp.ts:209`) passes `args` (the raw `params.arguments`) straight to `offeringHandlers[slug]({offeringId, requirement: args}, deps)` — `toolDef`'s `inputSchema` plays no role in that call at all.

So: two structurally identical schemas (same static file, imported twice, once for enforcement and once for description) that happen to originate from the same source content, but are genuinely separate JS objects with zero code-path connection. A gap in `INPUT_SCHEMAS` (the scenario `?? {}` guards against) can only produce a misleading/empty *advertised* schema in a 402 body or an MCP tool listing — it cannot loosen what Fastify's `setValidatorCompiler` actually checks a request against, because that path never touches `INPUT_SCHEMAS`/`EvaluationKitEntry` at all.

**No code change needed.** Closed, per (b) confirmed.

## One unrelated thing noticed while tracing, not part of what was asked

MCP's `tools/call` path (`mcp.ts:209`, quoted above) doesn't appear to run `args` through `offeringRequestValidators` or any other ajv validation before calling the handler — unlike the HTTP routes, which get Fastify's `setValidatorCompiler` enforcement automatically. Flagging only because I saw it while tracing the request-validation path end to end as asked; this is a separate question from the one in this directive (nothing to do with `kit.inputSchema`), and I haven't investigated whether that's intentional (e.g. handlers validate internally) or a real gap. Not acting on it — just noting it in case it's worth its own look sometime.
