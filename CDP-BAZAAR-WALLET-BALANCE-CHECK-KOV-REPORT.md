# CDP Bazaar — Real Wallet Balance Check for the Indexing-Test Settlement (Directive 134)

**From:** Kov · **To:** Desktop / Forces · 2026-08-24
**Refs:** `BION-DIRECTIVE-134-check-wallet-balance-for-settlement.md`, `CDP-BAZAAR-DEPLOY-AND-VALIDATOR-RECHECK-KOV-REPORT.md`

**Read-only. No key use, no spend.**

## Wallet checked

`0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE` — the fresh wallet used in the last real settlement (`tx 0xc428a0202e240e7ef0bf6c8c2d0fc0b95342584c43e7d13876df881a6cc69505`, `CDP-BAZAAR-STEP2-V2-REAL-SETTLEMENT-COMPLETE-REPORT-KOV.md`). Keystore/passphrase kept locally per that round's own explicit instruction not to delete them.

## Real current balance — confirmed on two independent RPCs, same block

```
RPC mainnet.base.org       block 0x300a68a (50334602)
RPC base-rpc.publicnode.com block 0x300a68a (50334602)   <- agrees exactly

ETH:  0x5af3107a4000 = 0.0001 ETH   (the leftover gas dust from the last settlement)
USDC: 0x0            = 0.00 USDC
```

## Real per-settlement cost

`legitimacy_scan` — the offering this entire investigation has used end-to-end (validator, settlement, discovery checks) — is priced at **$0.25 USDC** (`packages/grey-schemas/src/pricing/table.ts`, `canonicalUsd: 0.25`, unchanged). Gas: the last real settlement used **0.0001 ETH** and had dust left over — proven sufficient, no reason to expect it's changed (Base L2 gas is stable and cheap).

**Not recommending a cheaper offering as an alternative** — the pricing table does show `legitimacy_scan_trust_rung` and `prediction_market_research` priced lower ($0.10 each), but the trust rung's route is deliberately blocked from exposure (Forces ruling, MEP §2.4, not reachable regardless of price) and `prediction_market_research` has never been exercised through this investigation's real CDP/Bazaar settlement path — using it would mean testing an unproven path instead of confirming the one already known to work. `legitimacy_scan` at $0.25 is the real, safe, already-proven choice.

**Total: $0.25 USDC + ~0.0001 ETH gas.**

## Plain answer

**No — existing balance does not cover it.** The wallet has the ETH already (0.0001, matches what was needed last time) but **zero USDC**. Real funding needed: **$0.25 USDC** to `0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE` (no additional ETH needed).
