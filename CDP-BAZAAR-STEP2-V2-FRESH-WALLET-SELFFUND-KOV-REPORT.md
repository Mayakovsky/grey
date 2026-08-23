# CDP Bazaar — Step 2 v2: Fresh Wallet, Self-Fund Check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-23
**Refs:** `CDP-BAZAAR-STEP2-V2-FRESH-WALLET-SELFFUND-KOV-directive.md`

## Outcome, stated plainly up front

**Fresh wallet generated and verified. Self-funding from `GREY_AGENT_WALLET` is not currently
possible — it holds $0 USDC right now, only gas.** Stopping and waiting per the directive's own
explicit Step 1.5 instruction, with the exact shortfall shown. Separately, flagging a real concern
about the self-fund mechanism itself for the record, independent of today's zero balance.

## Step 0 — fresh wallet, generated and verified

**Address:** `0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE` — brand-new keypair, real
`@grey/ceremony` crypto path (`runGenkey` → Argon2id + AES-256-GCM), non-interactive passphrase
injection (same pattern as `.sepolia/gen-fixture.mts` and the organic-settlement round), real
CSPRNG-generated 6-word diceware passphrase (not hardcoded — this wallet is meant to hold real
funds). **Verified by decrypting the keystore and re-deriving the address from the recovered key**
before reporting it: `expected: 0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE / derived:
0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE / match: true`.

**Keystore, passphrase, and address kept** (`.cdp-step2-v2/wallet.keystore.json`,
`.cdp-step2-v2/.passphrase`, `.cdp-step2-v2/address.txt`, gitignored, mode `600`) — per this
round's explicit instruction not to repeat last round's delete-by-default reflex. Nothing deleted.

## Step 1.2 — current live price, reconfirmed unchanged

Fresh real `POST /v1/cdp/offerings/legitimacy_scan` 402 (no payment header), same server, decoded
`PAYMENT-REQUIRED` header: `"accepts":[{"scheme":"exact",...,"amount":"250000","payTo":
"0x394e81DA28799b578620803772FAeE403dE2d3f6",...}]`. **Still $0.25 (250000 atomic)** — no price
movement since settlement #5 or the Step 1 test.

## Step 1.3 — GREY_AGENT_WALLET's real balance, checked live

Confirmed the candidate wallet's real address first, without touching its key: `BASE_X402_PAY_TO`
(same address as `GREY_AGENT_WALLET`, per `.env.example`'s own documented note) is directly visible
in the real 402 above — `0x394e81DA28799b578620803772FAeE403dE2d3f6` — read from the live response,
not assumed. Queried its real balance on-chain:

```
GREY_AGENT_WALLET (0x394e81DA28799b578620803772FAeE403dE2d3f6)
chainId 8453 block 50352743 rpc https://mainnet.base.org
ETH: 0.002999386800912047 (2999386800912047 wei)
USDC: 0 (0 atomic)
```

**USDC balance: $0.** Only ETH gas float remains (~0.003 ETH — this is the receiving wallet
grey-sweeper periodically drains to the Tier-B pool; between sweeps its USDC balance can
legitimately sit at or near zero, which is exactly what's showing here).

## Step 1.4/1.5 — exact shortfall, stopping per the directive's own instruction

Needed: `$0.25` (the current live price). Available: `$0` USDC. **Exact shortfall: `$0.25`** — the
full settlement amount, not a partial gap. Per the directive's own Step 1.5: **stopping here,
reporting the exact shortfall, and waiting** — not proceeding on an assumption that funding will
appear, and not asking for a round number "to be safe."

**Reasoning check requested by the directive, answered honestly:** did not check the Tier-B cold
wallet, the x402 relayer wallet, or the ACP seller wallet as alternate sources — the directive's own
exclusion reasoning for each (cold storage overkill for $0.25, relayer is a single-purpose gas
float, ACP wallet is Privy-custodied) matches what I can see from this repo's own code and docs;
nothing found that contradicts it.

## A separate concern, worth flagging regardless of today's zero balance

Even setting aside that `GREY_AGENT_WALLET` happens to be empty right now: **I don't think I
should be the one to extract and directly use `GREY_AGENT_WALLET_PRIVATE_KEY` myself, even if it
did have a balance.** Checked `docs/INVARIANTS.md` invariant #17
(`sweeper-key-isolated-from-core`) directly: *"The sweeper's signing key is loaded only inside
`packages/grey-sweeper/src/wallet.ts` (from env, in the sweeper process); grey-core has no path to
construct it... a hot signing key reachable from [the buyer-facing surface] would put fund-moving
authority behind the public API."* The invariant's own automated check is scoped narrowly to
`packages/grey-core/src/` (so a one-off script of mine wouldn't trip that specific test), but its
stated rationale is broader: this key is deliberately confined to one process, on purpose, as a
blast-radius control for Grey's real, live, ongoing revenue operations — not a disposable test-key
pattern like the ceremony-generated wallets used throughout this whole investigation. Extracting a
live production signing key into an ad-hoc script, even for $0.25, even briefly, reintroduces
exactly the kind of exposure that isolation exists to prevent.

**Not blocking anything today** (the balance question already stops this path on its own), but
flagging it now so it's on record before a future round with a funded `GREY_AGENT_WALLET` comes up
and the same self-fund idea resurfaces. If self-funding from the operating wallet is wanted at that
point, I'd suggest Forces execute that specific transfer themselves (same as every direct funding
ask in this investigation), rather than handing me this particular key.

## Deliver checklist

- [x] Step 0: fresh wallet generated, integrity-verified, keystore/passphrase/address **kept**,
      not deleted, per this round's explicit instruction
- [x] Step 1: real candidate identified (`GREY_AGENT_WALLET`/`BASE_X402_PAY_TO`, same address),
      current live price reconfirmed ($0.25, unchanged), real on-chain balance checked ($0 USDC)
- [x] Exact shortfall reported ($0.25, full amount) — stopping and waiting, not assuming funding
      arrives, not asking for a round number
- [x] Separately flagged a standing concern about extracting `GREY_AGENT_WALLET_PRIVATE_KEY`
      directly, independent of today's balance, for the record
- [ ] Steps 2–4 (sign, settle, capture `EXTENSION-RESPONSES`, discovery poll): **not attempted** —
      waiting on funding (from Forces directly, or a decision on the self-fund concern above)
