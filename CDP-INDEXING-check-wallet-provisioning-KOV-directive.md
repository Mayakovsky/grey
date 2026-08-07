# CDP INDEXING — CHECK WALLET PROVISIONING (factual check, not a fix)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Investigation only — no code changes expected.

## Context, stated carefully

An open, unresolved GitHub issue (x402-foundation/x402 #2112) describes a different developer hitting the same symptom — real settlements, clean challenge shape, still absent from CDP's discovery catalog — and raises an unconfirmed hypothesis: that Bazaar indexing might require the `payTo` wallet be provisioned through Coinbase's own CDP account infrastructure, not a self-generated external EOA. **This is one person's unconfirmed theory about their own setup, not a confirmed fact about CDP's system, and it doesn't automatically explain Grey's situation just because the symptom matches.** Check it because it's cheap and factual to check, not because it's assumed to be the answer.

## Task

1. Confirm which wallet is actually used as `payTo` in the CDP-routed challenge (`buildCdpChallenge`/`buildCdpPaymentRequirementsEntry`) — cite the actual address and where it's configured.
2. Confirm how that wallet's key was generated/is held — Grey's own encrypted keystore (self-generated, matching the project's existing wallet architecture) or something provisioned via `@coinbase/x402`'s CDP Wallet APIs. This should be answerable from existing code/docs without needing Portal access.
3. While you're in there: note anything else that looks meaningfully different between Grey's setup and a "should obviously be indexed" baseline — don't fixate only on the wallet theory if something else stands out. This is an open look, not a confirm-the-hypothesis exercise.

## Report

Plain facts: which wallet, how it's held, and anything else notable. No recommendation needed from you on what to do about it — that's a decision for Forces once the facts are in, not something to solve here.
