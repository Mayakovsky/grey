# MCP tools/call — CONFIRM AND FIX MISSING REQUEST VALIDATION

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). **PRIORITY — handle now, ahead of anything else queued.** A real, payment-gated production route with a potential validation gap doesn't wait for a convenient moment. Separate codepath from PR #40 (that one stays independently mergeable on its own timeline), but this one moves first.

## Confirm first

Kov's trace (`SECURITY-CHECK-inputSchema-fallback-REPORT-KOV.md`) noted, as a side observation, that `mcp.ts:209`'s `tools/call` handler passes `args` (raw `params.arguments`) directly to `offeringHandlers[slug]({offeringId, requirement: args}, deps)` with no visible ajv validation, unlike the HTTP routes which get Fastify's `setValidatorCompiler` enforcement automatically via the `$grey` schema marker. Confirm this precisely: is `args` validated against `offeringRequestValidators[slug]` (or anything equivalent) anywhere in the MCP path before reaching the handler, or genuinely nowhere?

## If genuinely unvalidated — fix it, and mind the sequencing

If confirmed, validate `args` against the same `offeringRequestValidators[slug]` the HTTP routes already use (same Ajv-compiled schemas, same source of truth — no new schemas to write) before calling the handler. **Sequencing matters here, same lesson as the HTTP split-gate fix:** validation needs to happen *before* settlement/payment, not after — a buyer whose `args` are malformed should get a clean rejection without being charged, not get charged and then hit a handler-level failure. Check where MCP's payment gate (verify/settle) currently sits relative to where the handler gets called, and make sure validation slots in before settlement completes, not after.

Return a clean, machine-readable JSON-RPC error on validation failure (matching this codebase's fail-clean discipline elsewhere) — not an unhandled exception, not a bare 500-equivalent.

## Test

Malformed `args` (missing required fields, wrong types, extra properties if the schema disallows them) for at least one offering, confirmed: no settlement occurs (same "nothing broadcast" check pattern used in `preHandler.test.ts`), clean error returned, not a crash.

## Deliver

Diff export (`git diff main..<branch> > review-mcp-args-validation.diff` at the repo root) before merge, full gate green, do not merge. If the confirmation step finds this is actually already handled somewhere Kov didn't see on the first pass, report that instead — no code change needed in that case.
