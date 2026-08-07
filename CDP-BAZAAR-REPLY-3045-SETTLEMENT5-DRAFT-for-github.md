<!--
DRAFT — not posted. For Forces to review and paste into x402-foundation/x402#3045 as a comment.
Desktop has no GitHub write access; this file is the deliverable.
-->

Update from our side, prompted by @Nikolife2016's test above — which settled the GET-defaulting
question cleanly, thank you for that. We ran one more settlement specifically to close the
remaining open thread from it, and it surfaced something more precise than "never indexed."

## A fifth settlement, this time with nothing left to explain away

Our first four settlements (linked in the thread history above) were all run against scratch/test
deployments rather than our actual production service. This one wasn't: real production process,
real HTTP round-trip a genuine buyer would make, no test harness involved.

- Resource: `https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan`, $0.25 USDC, Base
  mainnet
- Settlement tx: `0x75e8bff253180b378a306780f9d54070ddf7dd6d77606f263094542ca2b84082`
- `PAYMENT-RESPONSE`: `{"success":true,...}`, confirmed on-chain two ways (independent RPCs
  agreeing on `status: success`, correct USDC contract, matching block timestamp)

## Answering the crawler question directly

We'd been logging every request to our 7 paid routes continuously since ~22 hours before this
settlement. In that entire window — not just the minutes around settlement, the whole thing —
**zero requests from any source other than our own settlement script touched any of those routes.**
No GET, no POST, no probe of any kind, from anyone. Whatever gates cataloguing, it isn't an
independent crawl of the declared `resource.url`, at least not one that leaves any trace in access
logs over a 17+ hour window bracketing a real settlement.

## `EXTENSION-RESPONSES` — present, not absent, but empty

This is where it gets more specific than what we'd seen reported elsewhere in this thread or in
#2112. We can see the header directly (our resource server logs the facilitator's raw response
before doing anything else with it):

- On this settlement's `verify` and `settle` calls: **the header is present**, valid, and decodes
  to `{}` — no `bazaar` key, despite our declaration correctly including
  `extensions.bazaar.info`/`schema` and settling cleanly end to end.
- On a separate dry-run `verify` call we deliberately made fail (`isValid: false`, unfunded test
  signer): **the header was absent entirely.** Not `{}` — nothing.
- We also directly confirmed `access-control-expose-headers` is empty on our own facilitator
  traffic, independent of #2112's report of the same thing — so even where the header exists,
  nothing served through a browser-origin client could read it.

So: not "never emitted" (#2112's finding) — emitted, but seemingly only on `isValid: true`, and
carrying no information either way. If that generalizes, the header can't currently do the job the
[Bazaar Indexing Process guide](https://docs.cdp.coinbase.com/x402/bazaar) describes for it, on
either a rejection or — new here — a full success.

This seems related to what came out of #2993's investigation into `EXTENSION-RESPONSES` and the
resulting spec PR (#3049): the ecosystem-side ask there is that a facilitator's metadata-handling
outcome be legible through this header rather than inferred from a bare status code. Our data adds
another angle to that: even when there's no rejection at all, the header isn't carrying the outcome
either.

## Still not indexed

Polled discovery for 11 minutes post-settlement (past the standard we've used throughout this
thread). `pagination.total: 0` on every poll. Same result as our prior four settlements, now
including the one with nothing left to attribute it to.

## What we're asking at this point

1. Is `EXTENSION-RESPONSES` ever populated with real Bazaar-acceptance status on a successful
   settlement with a correctly-declared `extensions.bazaar` block, or is an empty `{}` expected
   behavior today? If it's the latter, that's useful to know plainly — we (and it sounds like
   others in this thread) can stop treating it as a diagnostic signal.
2. #2112 asked whether `payTo` is expected to be a CDP-registered/provisioned wallet rather than an
   external EOA, and never got an answer. Our `payTo` is also an externally-generated wallet, not
   provisioned through a CDP account. The docs say there's no separate registration step — the
   first settlement should catalog a route — which by that description should already have
   happened for us five times over. Given two independent sellers hitting the identical gap with
   externally-generated wallets, is this the actual gating factor?
3. #2993 mentions a manual reindex being triggered for another seller at some point (#2691). Does
   that lever still exist, and could it be applied here if the automatic path genuinely isn't
   firing?

Happy to hand over full raw logs (Caddy access log around the settlement window, the decoded
`EXTENSION-RESPONSES` payload, the dry-run response headers in full) if that's useful for tracking
this down.
