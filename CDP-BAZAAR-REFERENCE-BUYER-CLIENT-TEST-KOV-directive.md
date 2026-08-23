# CDP BAZAAR — TEST WITH THE REAL REFERENCE BUYER CLIENT — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**Step 1: no new money.** Step 2 (below) needs a fresh explicit go before any real settlement.

## Context

Your last report reversed the working hypothesis: `extensions.bazaar` only reaches CDP via
`paymentPayload.extensions`, populated by the **buyer's** client echoing our 402 declaration — not
anything in Grey's server code. Every one of our five real settlements used a hand-rolled signing
script, not the actual `@x402/core` reference `x402Client`. If our own scripts never performed that
echo, none of our settlements ever transmitted the extension at all — which would fully explain the
empty `EXTENSION-RESPONSES` on every one of them, with nothing left to attribute to CDP or to Grey.

## Step 1 — does the real reference client actually perform the echo?

Using the actual, unmodified `@x402/core` `x402Client` (the same one you read from source last
round, not a hand-signed payload) as the buyer:

1. Point it at Grey's real production 402 — `GET/POST` `legitimacy_scan` (or whichever offering)
   with no payment, get the real 402 response, same as any genuine buyer would.
2. Let the reference client build its response payload from that real 402 — this is the step that,
   per the SDK source, should read our declared `extensions` and merge a client echo into what it
   submits.
3. Capture what it actually constructs, before any signing/broadcast — same technique as last
   round (monkeypatch or intercept before the network call). Does `paymentPayload.extensions`
   appear in what the reference client builds, unprompted, just from consuming our real 402?
4. No real payment needed for this — you're inspecting client-side payload construction, not
   completing a transaction. If the library requires a funded/valid signer to get that far, use the
   same disposable-key/no-broadcast pattern as your last two dry-runs.

## Step 2 — only with a fresh go from us, not automatic

If Step 1 confirms the reference client performs the echo where our hand-rolled scripts didn't:
that's the actual answer, and the next move would be one more small real settlement using the
proper reference client instead of a hand-rolled script, checking whether `EXTENSION-RESPONSES`
comes back populated this time and whether the resource finally gets indexed. **Don't run this
without us seeing Step 1's result first and giving an explicit go** — report Step 1, stop, wait.

## Deliver

Step 1's captured payload, verbatim, same standard as your last two reports. State plainly whether
the echo appeared or didn't — this is the answer to the open question your last report ended on,
not a new investigation.
