# CDP BAZAAR — STEP 2 (v2): FRESH WALLET, SELF-FUND IF POSSIBLE — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**Real money. One settlement. Stop and report after — do not repeat without a fresh explicit go,
regardless of outcome.** Supersedes `CDP-BAZAAR-STEP2-REAL-SETTLEMENT-REFCLIENT-KOV-directive.md`
— that one assumed the settlement #5 wallet could be reused; it can't (keystore/passphrase
deliberately deleted, no backup found or expected). This version starts from a fresh wallet.

## What this is, unchanged from the superseded version

The test that resolves the three-week investigation: settle for real using the actual reference
`x402Client` to build and sign the payment, instead of a hand-rolled script, and see whether
`EXTENSION-RESPONSES` comes back populated instead of `{}`, and whether the resource gets indexed
afterward.

## Step 0 — fresh wallet

Generate a brand-new wallet, same local encrypted-keystore pattern as every prior round. Report the
address. This time, **before deleting anything after the test runs, check with Desktop/Forces
first** — the last round's cleanup-by-default habit is exactly what made the previous wallet
unusable for this follow-up test. Good practice in general, wrong call in that specific instance;
worth pausing on this one rather than repeating the reflex.

## Step 1 — check whether this can be self-funded before asking Forces for anything

Forces asked directly: can this be funded from a wallet Kov already controls, rather than needing
new external money? Figure out whether that's real, don't assume either way.

1. Identify which wallets you hold usable signing keys for that could plausibly serve as a source
   — almost certainly `GREY_AGENT_WALLET` (the hot operating wallet that receives real buyer
   payments) is the natural candidate. **Exclude**, unless you have a specific reason to think
   otherwise: the Tier-B cold wallet (touching cold storage for a $0.25 test defeats the reason
   it's cold), the x402 relayer wallet (single-purpose gas float for the sweeper's own refuel
   cycle, not a general source), and the ACP seller wallet (Privy-managed custody — you likely
   don't hold a raw exportable key for it the way this needs). State plainly if any of that
   reasoning is wrong given what you can actually see.
2. Check the current live price of `legitimacy_scan` via a real 402 (don't assume it's still
   $0.25 — check the real number, same discipline as the last round).
3. Check the candidate wallet's actual current balance — real USDC and ETH on Base mainnet, not
   assumed.
4. If it has enough to cover the settlement price plus a small ETH gas buffer (same order of
   magnitude as before, ~0.0001 ETH — cheap insurance, not strictly required for EIP-3009's
   gasless design, but consistent with what's worked every prior round): **send exactly that
   amount, tight math shown, from the operating wallet to the fresh test wallet.** Report the
   internal transfer's tx hash and confirm it landed before proceeding to Step 2.
5. If it does **not** have enough, or if none of the wallets you control are appropriate sources
   for a reason worth naming: **stop, report the exact shortfall with the math shown, and wait.**
   Don't ask Forces for a round number "to be safe" — the exact delta, same discipline as every
   funding ask in this investigation.

## Step 2 — build and sign the real payment with the reference client

Once the fresh wallet is funded (whichever way): same mechanism as the confirmed Step 1 test
(`client.createPaymentPayload(paymentRequired)`, real production 402 for `legitimacy_scan`), but
completing the full flow this time:

1. Sign with the fresh wallet's real key.
2. Submit the signed `PAYMENT-SIGNATURE` header to Grey's real production endpoint, get the real
   `200` + `PAYMENT-RESPONSE: success`.
3. Confirm on-chain: real tx hash, direct RPC confirmation, `status: 0x1`, correct Base mainnet
   USDC contract.
4. Confirm the `revenue_events` row lands.

## Step 3 — the actual answer

Capture `EXTENSION-RESPONSES` on this settle's response. This is the whole point of the test:

- Populated `bazaar` object (not `{}`) → the reference client's echo reached CDP where the
  hand-rolled scripts' apparently didn't. Fix for future settlement testing: use `x402Client`.
- Still `{}` → equally important. A compliant buyer echo alone isn't sufficient, and something
  else remains unexplained even with fully correct behavior on both ends. Report it exactly as
  plainly as the positive case.

## Step 4 — standard discovery poll

`GET /discovery/merchant?payTo=` (or search), same window used throughout this thread (10 minutes
has been sufficient historically). Report indexed or not.

## Cleanup

This time: report back before deleting the fresh wallet's key material, in case a follow-up round
needs it. Everything else (scratch scripts) can be cleaned up as usual.

## Deliver

One report: which wallet funded it and how (self-funded internal transfer, or Forces-sent — state
which), settlement confirmation, the `EXTENSION-RESPONSES` capture, the discovery poll result.
Concrete evidence throughout, same standard as your last two reports.
