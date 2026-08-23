# CDP Bazaar — Diagnose the Exact Rejection — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-23
**Refs:** `CDP-BAZAAR-DIAGNOSE-REJECTION-KOV-directive.md`

## Outcome, stated plainly up front

**A clean diff — no discrepancy found, checked every way available.** Grey's real, current
`extensions.bazaar` declaration passes the SDK's own bundled runtime validator (both the
ajv schema-vs-content check and the separate structural spec check), and independently rules out
every specific documented rejection cause CDP's own public docs name: input/schema mismatch, a
missing `paymentPayload.resource`, and a 500-character description cap. As instructed, reporting
this plainly rather than treating it as a dead end — a validator-clean declaration that a real
backend still rejects is itself the important finding this task asked for.

## Task 1 — ground truth, verbatim

Fresh real `POST /v1/cdp/offerings/legitimacy_scan` 402 (no payment header), decoded
`PAYMENT-REQUIRED` header, `extensions.bazaar` block exactly as sent — unchanged from every prior
capture this investigation:

```json
{"info":{"input":{"type":"http","method":"POST","bodyType":"json","body":{"token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","project_name":"Example Protocol"}},"output":{"type":"json","example":{"projectName":"Example Protocol","tokenAddress":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","structuralScore":4,"verdict":"PASS","hypeTechRatio":0.5,"claimCount":3,"claimsMicaCompliance":"NOT_MENTIONED","micaCompliant":"NOT_APPLICABLE","micaSummary":"No MiCA-relevant claims found.","generatedAt":"2026-06-13T00:00:00.000Z","discoveryStatus":"cached","discoverySourceTier":0,"discoveryAttempts":[{"tier":0,"status":"cached","structuralScore":4,"claimCount":3,"note":"hit"}]}}},"schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"input":{"type":"object","properties":{"type":{"type":"string","const":"http"},"method":{"type":"string","enum":["POST","PUT","PATCH"]},"bodyType":{"type":"string","enum":["json","form-data","text"]},"body":{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://schemas.whitepapergrey.com/v1/requests/legitimacy_scan.schema.json","title":"LegitimacyScanRequest","description":"Request body for the legitimacy_scan offering. Field shapes ground-truthed from plugin-wpv AgentCardConfig.ts inputSchema (M3 FDQ-2).","type":"object","properties":{"token_address":{"type":"string"},"project_name":{"type":"string"}},"required":["token_address"],"additionalProperties":false}},"required":["type","method","bodyType","body"],"additionalProperties":false},"output":{"type":"object","properties":{"type":{"type":"string"},"example":{"type":"object"}},"required":["type"]}},"required":["input"]}}
```

## Task 2 — the SDK's own runtime validators (more authoritative than reading types)

`@x402/extensions/bazaar`'s compiled source (`chunk-KKZBRP7D.mjs`) ships two real, exported runtime
checks, not just TS types:

- **`validateDiscoveryExtension(extension)`** — compiles `extension.schema` with `ajv` and validates
  `extension.info` against it directly. This is the actual mechanism `/validate` and (per the SDK's
  design) any conforming facilitator would use.
- **`validateDiscoveryExtensionSpec(extension)`** — a separate, hand-written structural check
  (valid `input.type`, valid `method`/`bodyType` combinations, etc.), independent of ajv.

Both expect a single argument: the **inner** `{info, schema}` object — confirmed by reading
`declareDiscoveryExtension()`'s own return shape: `return { bazaar: extension }`, where `extension`
is exactly `{info, schema}`. Grey's `buildCdpBazaarExtension()` calls `declareDiscoveryExtension()`
directly and uses its result unmodified as `body.extensions` — so `paymentRequired.extensions` =
`{bazaar: {info, schema}}`, matching the SDK's own convention for the top-level `extensions` field
exactly (a map from extension key to extension content). No wrapping mismatch here, checked
directly rather than assumed.

## Task 3 — ran the real validators against Grey's real content

```
validateDiscoveryExtension(declared.bazaar): {"valid":true}
validateDiscoveryExtensionSpec(declared.bazaar): {"valid":true}
```

**Both pass, cleanly, no errors.** As a negative control, ran the same validators against the
*wrong* argument (the outer `{bazaar: {...}}` wrapper instead of the inner object) — this reliably
produces the exact class of bug the directive asked to check for (novadyne-hq's "nested in the
wrong place" pattern):

```
validateDiscoveryExtension(declared): {"valid":false,"errors":["Schema validation failed: schema must be object or boolean"]}
validateDiscoveryExtensionSpec(declared): {"valid":false,"errors":["Missing or invalid 'info' field"]}
```

This confirms the negative control actually detects the hypothesized bug shape — and confirms
Grey's real code does **not** have it. `buildCdpChallenge()` assigns
`extensions: buildCdpBazaarExtension(kit)` directly (`cdpFacilitator.ts`), never re-wrapping.

## Task 4 — cross-referenced CDP's public docs, found the two documented rejection causes, ruled both out

`docs.cdp.coinbase.com/x402/seller/get-discovered`'s own troubleshooting section, quoted verbatim:

> "Rejections are usually strict JSON Schema validation: your declared `input` must validate
> against `schema.properties.input`. The settle request also has to carry `paymentPayload.resource`,
> because without it the Bazaar has no resource to attach the metadata to."

Both checked directly, not assumed:
1. **Input-vs-schema validation** — already confirmed `valid: true` via the real ajv check above.
2. **`paymentPayload.resource` presence** — confirmed present in the actual real settlement from
   the prior round's own capture: `paymentPayload.resource = {url: "https://api.whitepapergrey.com/
   v1/cdp/offerings/legitimacy_scan", description, mimeType, serviceName, tags, iconUrl}`, populated
   both by the reference client (copied from `paymentRequired.resource`) and re-asserted
   server-side by Grey's own `decodeCdpPaymentPayload()` (`cdpFacilitator.ts`), which explicitly
   overwrites `.resource` rather than trusting the buyer's copy.

**A third, separate documented constraint, found while reading the rest of the page** (not
mentioned in the troubleshooting section, but real and load-bearing): *"Keep it to 500 characters
or fewer, because the CDP Facilitator rejects verify and settle requests whose description exceeds
that limit."* Checked every active paid offering's real, built declaration directly — both the
resource-level description and the nested request-body schema's description:

```
legitimacy_scan:       resource.description=75 chars,  body-schema.description=133 chars
verify_whitepaper:     resource.description=75 chars,  body-schema.description=135 chars
verify_full_tech:      resource.description=75 chars,  body-schema.description=134 chars
claim_extraction:      resource.description=77 chars,  body-schema.description=150 chars
claim_history:         resource.description=66 chars,  body-schema.description=200 chars
quick_protocol_facts:  resource.description=68 chars,  body-schema.description=210 chars
```

All six active offerings, both description fields, all comfortably under 500 characters. **Ruled
out for every offering, not just `legitimacy_scan`.**

**No other documented rejection cause found on this page** — it names exactly these three
mechanisms (`input`/schema mismatch, missing `resource`, description length) as the concrete,
checkable rules; everything else about ranking/curation/health-probing is unrelated to the binary
accept/reject decision this investigation is chasing. No SDK/docs disagreement found — the docs and
the SDK's own runtime validator agree on what "valid" means, and Grey's content satisfies both.

## What this means

**A genuinely clean result.** Every check available — the SDK's own schema validator, its separate
structural spec validator, and all three specific failure modes CDP documents publicly — comes back
clean for Grey's real, current declaration. This isn't a shrug: it means the actual defect (if it's
a defect in Grey's content at all, rather than something else entirely — a CDP-side bug, an
undocumented additional rule, a mismatch between the OSS `@x402/extensions` package's validation
logic and CDP's real backend implementation of the same rules, or something about *how* CDP's
Facilitator itself parses the specific JSON it received in this settlement, not just whether the
content is schema-valid) sits **outside every publicly-documented and SDK-validatable surface**
this task could check. That's a real, reportable boundary, not a gap in this pass's effort.

**Not proposing or applying a fix** — per this directive's explicit instruction, this was
diagnosis only; any change to `packages/grey-core` or `adapters/x402-middleware` waits for
Desktop's review.

## Deliver checklist

- [x] Task 1: verbatim capture of Grey's real, current `extensions.bazaar` — unchanged, shown above
- [x] Task 2: SDK's own runtime validators identified and read from source (`validateDiscoveryExtension`,
      `validateDiscoveryExtensionSpec`), preferred over TS types per the directive's own instruction
- [x] Task 3: ran both real validators against Grey's real content — clean pass; negative control
      confirms the validators actually catch the hypothesized "wrong nesting" bug class, and Grey's
      code doesn't have it
- [x] Task 4: cross-referenced CDP's public docs — found and ruled out all three documented,
      checkable rejection mechanisms (schema mismatch, missing `resource`, description length)
      across every active offering, not just the one that was settled
- [x] No new money spent this pass — pure code/schema/docs comparison, no network call to CDP
      needed for Tasks 2/3 (local validation only); Task 1's capture and Task 4's balance-adjacent
      checks used only already-real, already-issued 402s
