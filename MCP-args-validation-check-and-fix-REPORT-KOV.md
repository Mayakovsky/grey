# MCP tools/call — Confirm and Fix Missing Request Validation — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `MCP-args-validation-check-and-fix-KOV-directive.md`.

## Confirmed, precisely

`args` was validated against **nothing**, anywhere, before reaching the handler:
- `mcp.ts`'s `tools/call` (pre-fix, line 210): `offeringHandlers[slug]({offeringId: slug, requirement: args}, deps)` — no ajv call, no schema check, on the path.
- Checked whether the handler validates internally instead — `handlers/legitimacy_scan.ts`: `const body = (input.requirement ?? {}) as {token_address?: string; project_name?: string}` — a bare TypeScript type assertion. Compile-time only; zero runtime enforcement, would silently pass through a wrong-shaped value.
- Confirmed genuinely different from the HTTP routes: those get validation for free via Fastify's `setValidatorCompiler` (`packages/grey-core/src/server/validators.ts`), resolved through each route's `$grey` schema marker — MCP's hand-rolled JSON-RPC dispatch has no equivalent mechanism at all.

## Fix

Added `offeringRequestValidators[paidSlug](args)` (imported from `@grey/schemas/validators` — the exact same Ajv-compiled validators the HTTP routes already use, zero new schemas) in `mcp.ts`'s `tools/call` handler.

**Sequencing**, per the directive's explicit instruction: checked where the payment gate sat relative to the handler call, and slotted validation in correctly —
1. Tool name known (unchanged).
2. **No payment header → `PaymentRequirements` (unchanged, still first)** — mirrors the HTTP route's own precedent for why a body-independent presence check has to run before anything shape-dependent.
3. **NEW: validate `args` against `offeringRequestValidators[paidSlug]`** → clean rejection if invalid, *before* decode/verify/settle.
4. decode → verify → settle (unchanged, now unreachable for malformed args).
5. Handler call (unchanged).

Validation failures return `CallToolResult{isError:true}` with a human-readable ajv error summary (`{instancePath} {message}`, joined) — matching this file's existing fail-clean convention for payment/verify/settle rejections (`ok(id, textResult({error: ...}, true))`), not a JSON-RPC protocol-level error (`fail()`, which stays reserved for structural issues like an unknown method — a deliberate choice to stay consistent with how every other tool-level rejection in this file is already shaped).

## Test

Two new tests in `mcp.test.ts`:
- **Payment header present + malformed args (missing required `token_address`)** → clean `isError`, error text contains `token_address`, and **`wallet.calls` stays at length 0** — same "nothing broadcast" proof pattern as `preHandler.test.ts`'s FDQ-40 test. Didn't need a cryptographically real signed payment to prove this: validation now runs before decode, so any non-empty header string is enough to clear the presence check and reach the new validation step — `wallet.calls` staying empty proves `settle()` was never reached either way.
- **Malformed args + no payment header at all** → still returns `PaymentRequirements` (locks in the precedence: presence check wins over shape validation, matching the HTTP route).

The existing "paid tool without payment → PaymentRequirements" test already used valid `args`, so it continues to serve as the valid-args regression check, unchanged.

## Gate

`turbo run build test typecheck lint` on `@grey/core` + `@grey/x402-middleware` + `@grey/acp-adapter`, forced/no-cache — **14/14 green**. 139 grey-core tests (9 in `mcp.test.ts`, up from 7).

## Deliver

- `review-mcp-args-validation.diff` exported at the repo root (102 lines, `main..mcp-args-validation`).
- **[PR #41](https://github.com/Mayakovsky/grey/pull/41)** — `mcp-args-validation` → `main`. Not merged. Separate branch from PR #40, as instructed — moved first.
