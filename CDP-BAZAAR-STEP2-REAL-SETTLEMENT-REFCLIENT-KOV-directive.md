# CDP BAZAAR — STEP 2: REAL SETTLEMENT VIA REFERENCE CLIENT — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**Real money. One settlement. Stop and report after — do not repeat without a fresh explicit go,
regardless of outcome.** Same discipline as every prior real-money round in this investigation.

## What this is

The test that actually resolves the three-week investigation. Step 1 confirmed the real
`@x402/core` `x402Client` correctly echoes `extensions.bazaar` from our live 402 into
`paymentPayload.extensions`, byte-for-byte. What it couldn't confirm is whether any of our five
real settlements' hand-rolled scripts ever did the same — there's no retroactive way to check. This
settles it directly: settle for real using the actual reference client to build and sign the
payment, instead of a hand-rolled script, and see whether `EXTENSION-RESPONSES` comes back
populated instead of `{}`, and whether the resource gets indexed afterward.

## Step 0 — check before assuming anything about funding

Reuse the existing wallet from settlement #5 — `0x451d781CFce55C00D1ccBc9c208c036bf9124813`.
Don't generate a new one; reusing it is what makes this a clean single-variable comparison against
settlement #5 (same payer, same offering, only the client construction changes).

1. Check its current on-chain USDC and ETH balance on Base mainnet.
2. Check the current live price of `legitimacy_scan` via a real 402 (prices may have moved since
   settlement #5's $0.25).
3. Compute whether the existing balance covers it. Expected: ~0.05 USDC left (0.30 funded, 0.25
   spent on settlement #5) and ETH untouched (EIP-3009 doesn't spend the buyer's gas) — but check
   the real number, don't assume the arithmetic held.
4. If a top-up is needed, report the exact amount with the math shown (current balance, current
   price, exact delta) and **stop and wait for Forces to send it** — same as the original Step 0
   pattern. Don't proceed on an assumption that funding will arrive.

## Step 1 — build and sign the real payment with the reference client, this time for real

Same mechanism as your last report (`client.createPaymentPayload(paymentRequired)`, real production
402 for `legitimacy_scan`), but this time:

1. Sign with the **real funded wallet's actual key**, not the disposable Anvil test key.
2. Complete the full flow: submit the signed `PAYMENT-SIGNATURE` header to Grey's real production
   endpoint, get the real `200` + `PAYMENT-RESPONSE: success`.
3. Confirm on-chain: real tx hash, direct RPC confirmation, `status: 0x1`, correct Base mainnet
   USDC contract — same rigor as every prior settlement.
4. Confirm the `revenue_events` row lands (already proven to work post-RLS on settlement #5; this
   just reconfirms it holds here too).

## Step 2 — the actual answer

Capture `EXTENSION-RESPONSES` on this settle's response, same technique as before. **This is the
whole point of the test:**

- If it comes back with a populated `bazaar` object (not `{}`) — that's the confirmation. The
  reference client's echo reached CDP where the hand-rolled scripts' apparently didn't, and the fix
  for future settlement testing is simply "use `x402Client`."
- If it's still `{}` — that's just as important to know. It would mean a compliant buyer echo alone
  isn't sufficient, and something else remains unexplained even with fully correct client behavior
  on both ends. Report it exactly as plainly as the positive case — don't undersell a clean
  negative result.

## Step 3 — standard discovery poll, same as every prior settlement

`GET /discovery/merchant?payTo=` (or search) for the same window used throughout this thread (10
minutes has been sufficient historically). Report indexed or not, same as always.

## Cleanup

Delete any scratch script and key material used for this run once the report's written, same
hygiene as every prior round.

## Deliver

One report: funding check (Step 0), settlement confirmation (tx hash, on-chain status,
`revenue_events` row), the `EXTENSION-RESPONSES` capture — the answer either way — and the
discovery poll result. Concrete evidence throughout, not summarized conclusions, same standard as
your last two reports.
