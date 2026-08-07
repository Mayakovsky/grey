# CDP Phase 2 — PR #42 Deploy + Real Validator Check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03

## Merge + deploy — done

PR #42 merged (`e23b6a6`). VPS fast-forwarded `db71b37` → `e23b6a6` — this one had a real new dependency (`@x402/extensions` + transitives, 11 packages), `pnpm install --frozen-lockfile` downloaded cleanly (7.3s), filtered build 12.2s, clean restart, memory stayed healthy throughout (never below ~447Mi free / 1.2Gi available). `/health`/`/identity` both 200, live 402 body confirmed carrying the new `PAYMENT-REQUIRED` header.

## The real validator check — big progress, one more thing

```
POST /v2/x402/validate against https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan
```

Result: still `valid: false`, but the error changed character entirely — no longer a shape/nesting guess gone wrong:

```
"v2 discovery extension validation failed: [Schema validation failed: 
Get \"https://schemas.whitepapergrey.com/v1/_shared.schema.json\": 
dial tcp: lookup schemas.whitepapergrey.com on 172.20.0.10:53: no such host]"
```

This is CDP's validator trying to actually **fetch a URL** — confirmed with a direct `curl` that `schemas.whitepapergrey.com` doesn't resolve at all. `kit.outputSchema`'s properties reference `_shared.schema.json` via `$ref`, relative to the schema's own `$id`. That `$id` was always just a namespace identifier for Grey's local ajv registry (`@grey/schemas/validators` loads `_shared.schema.json` via `addSchema`, never over the network) — never meant to be a real, publicly fetchable URL. CDP's validator doesn't know that convention and tries to dereference the `$ref` for real.

**Fixed in a new PR** (not #42 — that's merged and deployed correctly; this is new information that only showed up from the real live check, exactly as expected): dropped `output.schema` from what `buildCdpBazaarExtension` sends. It's optional, only tightens `output.example`'s validation (which stays included, unaffected), and every output-related CDP check is `severity: advisory` — so this is a safe, scope-preserving drop. Verified the runtime output directly: `info.output.example` unchanged, `schema.properties.output`'s nested schema no longer carries any `$ref`. Full gate green (14/14), all 94 x402-middleware tests unaffected (none asserted on `output.schema`'s content).

**[PR #43](https://github.com/Mayakovsky/grey/pull/43)** — not merged, per standing process, even though this one's small and low-risk. Same rule either way.

## Status

This is genuinely the closest yet — every check EXCEPT this one external-fetch issue has passed live since PR #42 landed (`x402_version`, `payment_required_header`, all `accepts[0].*`, `has_bazaar_extension`, `bazaar.info.*`, `bazaar.schema` presence). One more merge + deploy + re-check should tell us whether this is actually the last thing, or whether something else is waiting behind it.
