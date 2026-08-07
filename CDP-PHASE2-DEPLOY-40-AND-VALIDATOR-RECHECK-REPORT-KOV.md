# CDP Phase 2 — PR #40 Deploy + Validator Re-check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** PR #40 (merged), the `parse` check saga.

## Deploy — done, verified live

VPS fast-forwarded `51c1c4c` → `db71b37` (PR #40). No lockfile changes. Filtered build: 11.5s, clean. `sudo systemctl restart grey-core`: clean startup, memory stayed healthy throughout (never below ~483Mi free / 1.1Gi available). `/health`/`/identity` both 200.

## Validator re-check — the `parse` error moved, didn't clear

```
POST /v2/x402/validate against https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan
```

Still `valid: false`, still exactly one failing required check (`parse`), but the error text changed shape:

**Before PR #40:** `"(root): token_address is required (root): Additional property input is not allowed (root): Additional property output is not allowed"` — validating `info` (`{input, output}`) against a schema requiring `token_address` at its root.

**Now, after PR #40:** `"(root).input: token_address is required (root).input: Additional property body is not allowed (root).input: Additional property type is not allowed (root).input: Additional property method is not allowed (root).input: Additional property bodyType is not allowed"` — validating `info.input`'s *value* against `schema.properties.input`.

**What this means:** CDP is validating `info.input` (still my HTTP-protocol-metadata object — `{type:'http', method:'POST', bodyType:'json'}`) against `schema.properties.input` (the real per-offering request schema, requiring `token_address`). PR #40's fix nested the request schema one level deeper as instructed, but the *thing being checked against it* — `info.input` — is still the wrong shape. This means my (and the directive's) reading of the Binance B402 worked example was still incomplete: `info.input`/`info.output` apparently aren't meant to hold HTTP-transport metadata (method/bodyType) at all — CDP is expecting `info.input` to actually match the request schema, i.e. look like real request *data* (something with a `token_address`), not protocol description.

I don't have a confident guess at what `info.input`/`info.output` should actually contain instead (a literal example value? the schema itself, duplicated? something else the Binance reference shows that the directive's quoted snippet didn't capture in full?) — two rounds of spec-inference against this exact field have now both been wrong when checked live, so I'm stopping here rather than guessing a third time. Discovery still shows `total: 0` for the merchant lookup, unchanged.

## Status

- Deploy: done, verified — nothing further needed there, all prior fixes (v2 challenge, `PAYMENT-SIGNATURE` header, this schema nesting) confirmed still correctly in place and not regressed (`x402_version`, `payment_required_header`, all `accepts[0].*`, `has_bazaar_extension` all still pass).
- Bazaar indexing: still the one open leg. Needs either the full Binance B402 reference (not just the snippet) or CDP support/docs directly answering what `info.input`/`info.output` should actually contain, rather than another inference pass from my end.
