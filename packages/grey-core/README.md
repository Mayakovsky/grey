# @grey/core

Grey's HTTP service. Wires the M2.5-frozen `@grey/schemas` contract layer into buyer-facing
route handlers, consuming `@grey/pipeline`'s repos for DB-backed reads (Q3 proxy via
`GREY_DATABASE_URL`). First product-runtime package in the monorepo (Movement 3).

## Scope (M3)

- **Fastify 5** server (`buildServer(deps)` factory) with `setValidatorCompiler` delegating to
  `@grey/schemas/validators`' pre-compiled Ajv2020 validators — no second ajv instance, no
  `@fastify/ajv-compiler`, no `setSerializerCompiler`.
- **9 offering handlers** (Phase C) — all **cache-READ-only** in M3 (FDQ-1): pure-DB reads +
  cache lookups; on cache-miss (always, while `grey_two` is empty) they return a typed-empty /
  `NOT_IN_DATABASE` response. Live-compute (discovery + pipeline + persist) is deferred to a
  later movement (M3.5). No `runFullPipeline`, no Anthropic, in M3.
- **Probes:** `GET /health`, `GET /identity` (`did:erc8004:8453:58618` — minted M4 Phase C), `GET /openapi`
  (serves `@grey/schemas/openapi/openapi.yaml`). No auth (Q9).
- **`narrowEnvelope<O>`** — runtime+compile-time bridge for the envelope's `{}`-typed payload.
- **`mapToRecord`** — Map→Record projection seam (Q5).
- **x402 placeholder** `preHandler` — no-op in M3; M5 fills with real `X-PAYMENT` handling.

## Out of scope (M3)

x402 implementation (M5) · ERC-8004 DID minting (M4) · live ACP integration (M5) · real `dist/`
builds (M5, D-RESOLVE continues) · VPS cutover (M5/M6) · live-compute for the 4 compute
offerings (M3.5).

## Entry points

| Export | Purpose |
|---|---|
| `buildServer(deps)` | construct the FastifyInstance (tests pass mocked deps + use `app.inject()`) |
| `createHandlerDeps(env?)` | runtime DI factory (reads `GREY_DATABASE_URL` via `@grey/pipeline`) |
| `narrowEnvelope` / `EnvelopeNarrowingError` | envelope payload narrowing (Q6) |
| `buildEnvelope` | assemble a `GreyResponseEnvelope` from a typed payload |
| `mapToRecord` | Map→Record projection (Q5) |

## Scripts

- `pnpm dev` — `tsx watch src/start.ts` (local server; reads `GREY_DATABASE_URL`, `GREY_CORE_PORT`)
- `pnpm start` — `tsx src/start.ts` (production entry; not invoked by CI)
- `pnpm test` — `vitest run` (all tests use `app.inject()` / mocked repos; no live DB, no Anthropic)
- `pnpm typecheck` — `tsc -p . && tsc -p tsconfig.test.json` (Pattern 5 compile-time guards)
