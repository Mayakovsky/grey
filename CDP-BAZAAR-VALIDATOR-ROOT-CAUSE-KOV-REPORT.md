# CDP Bazaar — agentic.market Validator Re-run + Root Cause Found

**From:** Kov · **To:** Desktop / Forces · 2026-08-23
**Refs:** `BION-DIRECTIVE-129-agentic-market-validator-and-bazaar-rejection.md`, `CDP-BAZAAR-DIAGNOSE-REJECTION-KOV-REPORT.md`, `CDP-BAZAAR-STEP2-V2-REAL-SETTLEMENT-COMPLETE-REPORT-KOV.md`, `CDP-INDEXING-real-resolution-six-checks-REPORT-KOV.md` (the 2026-08-04 prior run of this same validator)

## Outcome, stated plainly up front

**Root cause found, with a real, specific, field-level error message — not a guess.** Grey's `bazaar.schema`'s nested request-body sub-schema carries its own external `$id` (a real, resolvable-looking `https://schemas.whitepapergrey.com/...` URL). CDP/agentic.market's real backend explicitly forbids this (documented, SSRF/LFI-motivated rule), and this same defect was **already found and fixed once before — for the sibling `output.schema` field only.** `inputSchema` was never touched by that fix and still carries it.

## Task 1 — real validator re-run, real new signal this time

Traced the same real endpoint the 2026-08-04 investigation found (`POST https://agentic.market/api/x402-validate`, `{resource, method}` body — confirmed still current, not stale). Called it live against Grey's real `legitimacy_scan` offering:

```
POST https://agentic.market/api/x402-validate
{"resource":"https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan","method":"POST"}
→ HTTP 200
```

**This time, unlike 2026-08-04's byte-identical-to-CDP-/validate clean result, the response is `"valid": false`** — the preflight array's final check now fails:

```json
{"check":"parse","detail":"v2 discovery extension validation failed: [schema must not contain external $ref/$id references]","passed":false,"severity":"required"}
```

```json
"simulation":{"outcome":"rejected","rejectionReason":"invalid discovery configuration"}
```

**This is the exact same `rejectionReason` string CDP's real settle-time check gave in the 2026-08-23 real settlement** (`CDP-BAZAAR-STEP2-V2-REAL-SETTLEMENT-COMPLETE-REPORT-KOV.md`) — but this time with a concrete, checkable field-level reason attached, not just the category. All other 23 preflight checks still pass clean (well-formed URL, HTTPS, 402 reachable, correct headers, `accepts` shape, `bazaar.info` present, method match, etc.) — this is the *only* failing check.

## Task 2 — corroborated against both reference sources

**x402 spec's own docs** (`docs/extensions/bazaar.mdx`, troubleshooting section), quoted:
> "$ref or $id values in the schema field that are not same-document JSON Pointer fragments" — "external references such as `https://...`, `file://...`, or relative URIs are rejected to prevent SSRF/LFI." Only in-document `"$ref": "#/definitions/foo"`-style references are allowed.

**Reference server** (`examples/typescript/servers/bazaar`): every `declareDiscoveryExtension()` call in the real, known-working reference implementation uses a schema with **zero** `$id`/`$ref` fields anywhere — fully inline, self-contained.

**Grey's real, current violation**, verbatim (`packages/grey-schemas/src/requests/v1/legitimacy_scan.schema.json`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.whitepapergrey.com/v1/requests/legitimacy_scan.schema.json",
  "title": "LegitimacyScanRequest",
  ...
}
```
This flows unmodified into the bazaar extension's `inputSchema` via `buildCdpBazaarExtension()` (`adapters/x402-middleware/src/challenge.ts:64`):
```ts
inputSchema: (kit.inputSchema as Record<string, unknown> | null) ?? {},
```

## The real, load-bearing part: this exact bug class was already found and fixed once — for the wrong field

`challenge.ts:41-51`'s own comment documents that a **prior round already diagnosed this exact defect** for the sibling `output.schema` field: `kit.outputSchema` carries `$ref`s relative to its own `$id` (the same `schemas.whitepapergrey.com` host, confirmed non-DNS-resolving), CDP's live validator tried to dereference it over HTTP, and the fix was to **omit `output.schema` entirely** (justified there because output-schema checks are only `severity: advisory`).

**`inputSchema` is `severity: required`** (confirmed in this run's own preflight: `"check":"bazaar.schema","severity":"required"`) — so the same omit-it fix used for `output.schema` isn't available here without breaking a required check. The real fix needs to either strip `$id`/`$ref` from the schema before it reaches `declareDiscoveryExtension()`, or generate/maintain a `$id`-free variant of these request schemas specifically for bazaar declaration (leaving the real `$id`-bearing versions untouched for Grey's own local ajv registry, which legitimately needs them — `@grey/schemas/validators` loads them via `addSchema`).

**Not proposing or applying a fix** — per this directive's explicit instruction, reporting the exact finding only. This touches `adapters/x402-middleware/src/challenge.ts` and/or `packages/grey-schemas`, same files the "don't fix without Desktop review" instruction from the prior diagnose round named.

## Deliver checklist

- [x] Task 1: real validator output, full response captured above — real, new, field-level signal this run surfaced that the 2026-08-04 run didn't
- [x] Task 2: diffed against both reference sources (x402 spec docs, reference server) — both confirm the rule and its rationale (SSRF/LFI)
- [x] Root cause identified precisely: `inputSchema`'s embedded `$id` (`packages/grey-schemas/src/requests/v1/*.schema.json`, flows through `adapters/x402-middleware/src/challenge.ts:64`) — the same bug class already fixed once for `output.schema` at line 42-51 of the same file, never applied to the `input` side
- [x] No new spend, no new wallet activity — pure inspection/diffing (one real GET-shaped validator call, two real doc/reference fetches, local file reads only)
- [x] No fix applied — reported precisely, held for Desktop's review as instructed
