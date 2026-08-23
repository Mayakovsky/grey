# CDP BAZAAR — INSPECT OUR OWN OUTBOUND SETTLE ENVELOPE — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**No new money unless Task 1 comes up empty.**

## Context — why this matters, precisely

`x402-foundation/x402#3045` (our own GitHub thread): a different seller (novadyne-hq) spent 40 days
chasing the exact `EXTENSION-RESPONSES: {}` symptom we have, and found the real meaning of it:

> "CDP receives the extension and ignores it entirely — no rejection, no reason, no engagement. If
> you capture only the decoded object you will read that as 'empty outcome' and go looking for a
> rejectedReason that does not exist."

Their specific cause was version-dialect-related (their v1 settles got the extension dropped
silently; ours are v2, so that exact cause doesn't transfer). What does transfer is the diagnostic
method, and it's a real correction to how we've been reasoning about this:

> "`POST /x402/validate` is necessary but not sufficient... it inspects the route — it fetches your
> public 402 — while the settle-time check inspects the envelope you actually send. A green
> validate is not evidence that indexing will succeed."

We've treated our 25/25 `/validate` pass as proof our discovery declaration is sound. It isn't —
`/validate` checks our public 402 challenge, not the actual outbound request our server sends to
CDP's `/settle` endpoint. **We have never directly inspected the literal bytes of that outbound
request.** We've checked what we serve to buyers (the 402) and what CDP sends back to us (where we
found the empty `{}`). The gap in between — what we actually transmit at settle time — is
unexamined. That's the actual failure boundary the `EXTENSION-RESPONSES` field is designed to
reveal, per novadyne-hq's resolved case.

## Task 1 — check what's already captured, before spending anything

You logged the facilitator's raw *response* for settlement #5 and for the rejected dry-run
`/verify` call in the last round (`CDP-BAZAAR-EXTENSION-RESPONSES-CHECK-REPORT-KOV.md`). Check
whether your interception also captured the **outbound request body** — what our server actually
sent to `api.cdp.coinbase.com/platform/v2/x402/verify` and `/settle` — for either of those calls.
If request logging sits in the same place as the response logging you already used, this costs
nothing to check.

If you have it: inspect the actual JSON payload sent, specifically:

1. Is `extensions.bazaar` present in the outbound payload at all, at the path CDP's settle-time
   parser expects (not just present somewhere in our own internal representation)?
2. Does its shape match what our 402 challenge declares (the thing `/validate` actually checks)? A
   mismatch between "what we advertise" and "what we transmit at settle time" is exactly
   novadyne-hq's failure mode, just with a different root cause than theirs.
3. Compare against the working `info.input{type, method}` shape novadyne-hq eventually needed
   (quoted in their thread, useful as a positive reference even though our own `/validate` already
   passes on this specific shape) — the point isn't to re-check what validate already confirmed,
   it's to confirm the *same* structure survives all the way into the real settle-time transmission.

## Task 2 — only if Task 1 finds nothing captured

If neither call's outbound request body was logged, don't force a new real settlement for this —
a dry-run `/verify` call (no real payment, same as the rejected one you already ran) transmits the
same extension payload a real settle would, since the extension declaration isn't contingent on
payment succeeding. Capture the outbound request this time, not just the response. No new money
required either way.

## Deliver

Report exactly what the outbound payload contains — verbatim, not summarized — for whichever call
you were able to inspect. If `extensions.bazaar` is missing, malformed, or doesn't match what our
402 declares, that's the concrete, fixable bug this whole investigation has been circling. If it's
present and correctly shaped, that's also worth knowing precisely — it would mean our case is
genuinely different from novadyne-hq's despite the identical symptom, and the next place to look is
wherever CDP's settle-time parser diverges from what it says it expects.
