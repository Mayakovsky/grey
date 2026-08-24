<!--
DRAFT — not posted. For Forces to review and paste into x402-foundation/x402#3045 as a comment.
Desktop has no GitHub write access; this file is the deliverable.
-->

Update since our last comment — we ran the definitive test, and for the first time in this whole
thread, CDP told us *why* it's rejecting us. Posting the full diagnosis because it's a clean, fully
ruled-out case that I think narrows this down more than anything else here so far.

## The test: settle with the real reference client, not a hand-rolled script

Every one of our prior five settlements used a hand-signed payload, built by us, not CDP's actual
reference `x402Client`. We redid it properly: real `@x402/core` `x402Client`, real EIP-3009
signature, real settlement, real $0.25, tx `0xc428a0202e240e7ef0bf6c8c2d0fc0b95342584c43e7d13876df881a6cc69505` on Base mainnet, `status: 0x1`.

For the first time ever, `EXTENSION-RESPONSES` came back **populated, not empty**:

```json
{"bazaar":{"status":"rejected","rejectedReason":"invalid discovery configuration"}}
```

Present on both `verify()` and `settle()`. Still not indexed at T+2min or T+10min, as expected given
an explicit rejection.

This confirms what several people converged on earlier in this thread: `POST /v2/x402/validate`
inspects the declared route; the real settle-time check inspects the transmitted envelope, and they
can disagree. Ours do — we pass `/validate` 25/25, every time, and still get rejected here.

## We then tried to find out what, specifically — and came up clean everywhere

`rejectedReason` is a category, not a field. So we went looking for the field, using every
checkable surface:

1. **`@x402/extensions/bazaar`'s own shipped runtime validators** — `validateDiscoveryExtension`
   (ajv, schema-vs-content) and `validateDiscoveryExtensionSpec` (hand-written structural check).
   Ran both directly against our real, current `extensions.bazaar` declaration:
   `{"valid":true}` on both, no errors.
2. **Confirmed the validators actually work**, rather than trusting a pass from something too
   lenient to matter: ran them against a deliberately wrong-nested version (the outer `{bazaar:
   {...}}` wrapper instead of the inner `{info, schema}` object — the same shape of bug an earlier
   comment in this thread traced their own case to). Both validators correctly flag it as invalid.
   Our real code doesn't have that shape.
3. **All three rejection mechanisms named in [CDP's own troubleshooting docs](https://docs.cdp.coinbase.com/x402/seller/get-discovered)**, checked directly, not assumed:
   - `input` vs `schema.properties.input` mismatch — clean (confirmed by the ajv pass above)
   - `paymentPayload.resource` missing — present, correctly populated, and explicitly re-asserted
     server-side rather than trusted from the buyer's copy
   - description over 500 characters — checked every one of our six active offerings, both the
     resource-level and request-body-schema descriptions; longest is 210 characters

So: SDK-clean, docs-clean, across every offering we have. Whatever's actually being rejected isn't
visible in the open-source validation logic or the published rejection causes.

## What we think this points to

Given a structurally perfect declaration still gets "invalid discovery configuration," the
remaining explanations all sit outside what's checkable from our side: an undocumented rule, a
drift between the open-source `@x402/extensions` package's validation and what the real Facilitator
backend enforces, or something account/configuration-level rather than content-level.

Which brings us back to the question `#2112` raised and never got an answer to: **is `payTo`
required to be a wallet provisioned through a CDP developer account, rather than an externally
generated EOA?** Our `payTo` is externally generated, same as theirs. "Invalid discovery
configuration" is vague enough to plausibly describe an account-side gate as easily as a payload
defect — and that would be consistent with everything above: nothing wrong with what we're sending,
something CDP is checking that we can't see.

## What we can hand over

Full validator run output, the exact `extensions.bazaar` JSON for all six offerings, and the
settlement details above, if anyone from the CDP/x402 team wants to look at this specific
account/request pair directly. Community-side diagnosis feels genuinely exhausted at this point —
if there's a better channel than this thread to get an account-side check, we'd take the pointer.
