# @grey/schemas

The type + schema contract for Whitepaper Grey's verification pipeline, consumed by
`@grey/pipeline` and (from Movement 3) `@grey/core`.

Two layers:

1. **Domain types** (Movement 2) — the TypeScript interfaces + enums promoted wholesale
   from `@grey/pipeline/src/types.ts`. Exported from the package root (`@grey/schemas`).
2. **Response schema layer** (Movement 2.5) — JSON Schemas (draft 2020-12), a common
   response envelope, generated TypeScript types, ajv validators, and an OpenAPI 3.1
   surface for the 9 ratified offerings.

## Entry points (`exports` map)

| Import | Contents |
|---|---|
| `@grey/schemas` | M2 domain types + enums (the flat barrel; runtime enums live here) |
| `@grey/schemas/responses` | Generated TS types for the 9 offering responses + envelope + shared `$defs` |
| `@grey/schemas/envelope` | `GreyResponseEnvelope` type + its compiled ajv validator |
| `@grey/schemas/validators` | ajv-compiled validators (per-offering + envelope + `offeringValidators` map) |
| `@grey/schemas/openapi` | Path to the assembled `openapi.yaml` (read via `require.resolve` + `readFileSync`) |

`main`/`types` stay at `./src/index.ts` — the package is consumed via workspace source
(no `dist/` build until Movement 5, per the D-RESOLVE deviation).

## The 9 ratified offerings (Gate #0, 2026-06-13)

`legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `claim_extraction`,
`claim_history`, `quick_protocol_facts`, `daily_tech_brief`, plus the two free resources
`daily_greenlight_list` and `scam_alert_feed`. Each has a response schema in
`src/responses/v1/<slug>.schema.json`. (The score doc's other offerings were RECONSIDER /
DROP — no pipeline backing; out of M2.5 scope.)

## Layout

```
src/
├── index.ts                  # M2 domain types (canonical TS source of truth)
├── responses/
│   ├── index.ts              # type-only barrel re-exporting the generated types
│   └── v1/
│       ├── _shared.schema.json     # $defs: 7 enums + 3 unions + 6 interfaces
│       ├── envelope.schema.json    # GreyResponseEnvelope (payload XOR error)
│       └── <offering>.schema.json  # one per offering
├── generated/v1/             # codegen output (.d.ts) — COMMITTED, never hand-edited
├── envelope/index.ts         # envelope type + validator
└── validators/index.ts       # ajv2020 validators
openapi/openapi.yaml          # OpenAPI 3.1 (placeholder routes; M3-authoritative)
test/                         # ajv fixture tests + enum-drift test
```

## Codegen

`pnpm codegen` regenerates `src/generated/v1/*.d.ts` from the `*.schema.json` files via
`json-schema-to-typescript`. **The generated output is committed**, and CI's `codegen-drift`
job re-runs codegen and fails on any diff — so always re-run `pnpm codegen` after editing a
schema and commit the result.

## Tests

`pnpm test` runs:
- `validators.test.ts` — every fixture in `test/fixtures/v1/<slug>/` validated against the
  envelope validator (valid-* pass, invalid-* fail) + per-offering payload validators +
  envelope payload-XOR-error invariants.
- `enum-drift.test.ts` — bidirectional drift check between `_shared.schema.json` `$defs` and
  the canonical TS types: real enums via `Object.values`, union aliases via const-tuple
  mirrors with compile-time exhaustiveness guards.

## Anti-cycle constraint

`@grey/schemas` MUST NOT import from `@grey/pipeline`. One-way only: pipeline (and later
grey-core) consume schemas, never the reverse.

## Notes for Movement 3

- Request-body input schemas are **not** in M2.5 (response schemas only) — author them into
  `src/requests/v1/` as additive v1 work.
- `payload` is typed generically in the envelope TS (`json-schema-to-typescript` can't model
  the `if/then` discrimination); narrow it by `offering` using the per-offering response types.
- The `Map → Record` and `Date → ISO string` projections happen at M3's pipeline-stage→route
  boundary (the report tiers schematized here are already JSON-clean).
- Three sources of truth for response shapes (this package's TS, these JSON Schemas, and
  ElizaOS `AgentCardConfig.ts`) reconcile at the ElizaOS→monorepo cutover.
