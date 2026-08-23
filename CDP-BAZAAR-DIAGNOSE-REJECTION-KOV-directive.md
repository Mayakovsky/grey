# CDP BAZAAR — DIAGNOSE THE EXACT REJECTION — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**No new money.** This is a code/schema comparison task, not another settlement.

## What just happened, and why this is the actual breakthrough

Real settlement, real reference client, `EXTENSION-RESPONSES` came back populated for the first
time ever: `{"bazaar":{"status":"rejected","rejectedReason":"invalid discovery configuration"}}`.
Every prior settlement got silence or `{}` — this is the first time CDP has told us *why*, even at
just a category level. It directly confirms novadyne-hq's warning from early in this thread:
`/validate` (which Grey passes 25/25) inspects the public route; the real settle-time check
inspects the actual transmitted envelope, and they can disagree. Grey's declaration fails a check
`/validate` never runs.

`rejectedReason` is a category, not a field-level diagnosis. This directive is about getting from
"invalid discovery configuration" to the specific thing that's wrong.

## Task 1 — ground truth: what Grey actually declares, verbatim

Print Grey's complete, current `extensions.bazaar` block exactly as it appears in a real 402 for
`legitimacy_scan` — the full object, not a summary or a recollection of what the code is "supposed"
to send. Same discipline as every capture in this investigation: verbatim, not paraphrased.

## Task 2 — what CDP's own SDK says the shape should be

You already read `@x402/core`'s compiled source for the wire-path finding last round. Go back to
it, but this time for the type/schema side: find the SDK's own TypeScript type or interface for the
discovery/bazaar extension (`declareDiscoveryExtension`, `bazaarResourceServerExtension`, or
whatever the actual exported names are — read them from source, don't assume names from memory).
If the SDK ships any runtime validation or JSON Schema for this shape (not just a TS type — an
actual `ajv`/zod/similar schema it validates against before sending), that's the more authoritative
source; prefer it if it exists.

## Task 3 — diff them, field by field

Compare Task 1's real output against Task 2's expected shape directly. Look specifically for the
kind of defect this investigation has already seen once, in a different seller's case (novadyne-hq,
earlier in `#3045`): a field present but nested in the wrong place (e.g. under `schema.properties`
or `examples` instead of as a direct sibling), or a required field silently absent. Don't assume
it's the same specific field they had — check independently — but that's the shape of bug worth
checking for first, since we now know CDP's validator category-matches theirs exactly
("invalid discovery configuration").

## Task 4 — secondary check against CDP's public docs

Cross-reference against `https://docs.cdp.coinbase.com/x402/bazaar` (or wherever the current
discovery extension schema is documented) as a second source, in case the SDK's shipped types have
drifted from what CDP's validator actually enforces. If the two sources disagree with each other,
that's worth reporting explicitly rather than picking one silently.

## Deliver

The specific discrepancy, if found — exact field, exact expected shape vs. exact actual shape,
verbatim on both sides. If nothing discrepant turns up despite a careful diff, say that plainly
too — a clean diff against a rejected declaration would itself be an important, reportable result,
not a dead end to paper over. Don't propose or apply a fix yet — find the exact problem first,
Desktop will review before anything gets changed in `packages/grey-core` or
`adapters/x402-middleware`.
