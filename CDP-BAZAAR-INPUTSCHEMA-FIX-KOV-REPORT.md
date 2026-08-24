# CDP Bazaar — `inputSchema` External `$id` Fix (Directive 131)

**From:** Kov · **To:** Desktop / Forces · 2026-08-23
**Refs:** `BION-DIRECTIVE-131-fix-bazaar-inputschema-external-id.md`, `CDP-BAZAAR-VALIDATOR-ROOT-CAUSE-KOV-REPORT.md` (the diagnosis this executes on)

## Outcome, stated plainly up front

**Fix built, real-tested, verified correct at the unit level — but full end-to-end confirmation needs a deploy, which is explicitly held per this directive's own Non-scope ("report before pushing").** Re-ran the live validator to document an honest baseline: it still shows the exact same failure right now, correctly, since the fix hasn't reached the live server yet.

## The fix

`adapters/x402-middleware/src/challenge.ts` — new `stripExternalSchemaRefs()`, applied only at `buildCdpBazaarExtension()`'s `inputSchema` field (was line 64, now wrapped):

```diff
-    inputSchema: (kit.inputSchema as Record<string, unknown> | null) ?? {},
+    inputSchema: stripExternalSchemaRefs((kit.inputSchema as Record<string, unknown> | null) ?? {}),
```

Located the existing `output.schema` fix first, as instructed — it's **outright omission** (`output: kit.sample ? { example: kit.sample.response } : undefined`, no `schema` key at all), safe there because output-side checks are `severity: advisory`. Confirmed `inputSchema` is `severity: required` directly from this session's own `agentic.market/validate` output (`"check":"bazaar.schema","severity":"required"`) — omitting it outright would fail a required check instead of clearing an optional one, so the same pattern doesn't transfer as-is. Instead: strip the external `$id`/`$ref` values, keep everything else (the schema's real `properties`/`required`/`additionalProperties` content untouched) — matching the x402 spec's own stated rule exactly ("$ref or $id values... that are not same-document JSON Pointer fragments" are rejected; same-document fragments like `#/definitions/foo` are fine).

**Scoped deliberately narrow**: only the copy handed to `declareDiscoveryExtension()` is stripped. `kit.inputSchema` itself, and its separate copy at `PaymentRequirements.accepts[0].extra.bazaar.inputSchema` (a distinct surface, per `types.ts`'s own comment: "other consumers may already read this field. Flag before removing, don't drop unilaterally") are both left carrying the real `$id` — confirmed via `grep` that `kit.inputSchema` is read in 9 real files across the codebase (MCP routes, discovery routes, trustRung, etc.), not just this one call site, so stripping at the source would have been the wrong scope.

## Real tests, real gate, both packages clean

Updated two pre-existing tests (`challenge.test.ts`, `trustRung.test.ts`) that asserted the bazaar-declared schema was byte-identical to `extra.bazaar.inputSchema` — now correctly assert they differ by exactly `$id`, with an explicit sanity check that the raw schema really does carry one to strip. Added 3 new tests: real `$id` stripped from a real-shaped schema, a same-document `$ref` fragment (`#/definitions/foo`) correctly *kept*, and an external (non-fragment) `$ref` correctly stripped too (not just `$id`).

```
adapters/x402-middleware: typecheck clean, vitest — 118 passed, 1 skipped (pre-existing, unrelated)
packages/grey-core:       typecheck clean, vitest — 147 passed (real consumer: MCP routes, discovery, x402 routes, trust rung)
```

265 real tests total, zero failures, across every real consumer of `kit.inputSchema`/`buildCdpBazaarExtension` I could find.

## Real validator re-run — honest baseline, not yet cleared (expected, not deployed)

```
POST https://agentic.market/api/x402-validate {"resource":"...legitimacy_scan","method":"POST"}
→ "valid": false, still: "schema must not contain external $ref/$id references"
```

**This is the correct, expected result right now** — the live server at `api.whitepapergrey.com` is still running the pre-fix code; nothing has been deployed. Confirming this error actually *clears* requires the fix to reach production, which is outside tonight's holding pattern (Non-scope: "Hold at local commits... report before pushing"). Not claiming a false positive here — reporting the real, current, unclosed state.

## `e1-e` — can't be answered yet, same reason

Whether this also resolves `e1-e`'s curated-tier blocker depends on the same deploy step. Once deployed and the validator clears, the natural next check is a discovery poll (`total: 0` → some real number) — flagging this as the concrete next step, not doing it now.

## Non-scope compliance

No new wallet spend (the validator call and all tests are free — no settlement needed to exercise this fix). `output.schema`'s existing fix read only as reference, not touched. Held at local commits (`bion/directive-131-fix-bazaar-inputschema-id`, two commits: the fix, then the D-129 report that predated this branch) — not pushed, per instruction.

## Ready to merge, but full closure needs a deploy decision

The code change itself is done, tested, and ready for review. Whether/when to deploy to the VPS — and re-check the live validator + discovery poll afterward — is a real, separate decision this directive didn't authorize; flagging it as the natural next step rather than assuming it.
