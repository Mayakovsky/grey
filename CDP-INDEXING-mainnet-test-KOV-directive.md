# CDP INDEXING — MAINNET TEST (real funds, one settlement, treat with M5-cutover weight)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). **Real money. One settlement. Stop and report after — do not repeat without a fresh explicit go, regardless of outcome.**

## What this is and isn't

This tests exactly one variable: whether CDP's Bazaar indexing requires a mainnet settlement specifically, since every prior test (successful or not) has been Sepolia, and every success story in the community thread that led here settled on Base mainnet. This does **not** touch the primary self-hosted revenue path, does **not** change CDP from a parallel path to anything more, and this specific settlement — being Grey testing its own pipe — does **not** count toward the separate "non-self settled payment" leg of the E1→E2 gate. It's diagnostic only.

## Step 0 — generate a fresh, single-purpose wallet, report the address, wait for funding

Don't reuse any existing Grey wallet (agent, relayer, cold pool, ACP seller) or Benthic's — all either carry real operational/identity significance or third-party custody complexity that has nothing to do with this test. Generate a brand-new wallet, same local encrypted-keystore pattern already used for Grey's other wallets (no third-party auth, Kov has direct signing access from the moment it's created). Report the address back — it's just a receiving address, not sensitive, fine to include directly in the report. **Stop here and wait.** Forces will fund it directly with a small amount of real USDC and a small amount of ETH for gas on Base mainnet. Do not proceed to Step 1 until funding is confirmed on-chain — check the balance yourself before assuming a funding message means it landed.

## Step 1 — if funded, execute exactly one real settlement

Same methodology as every Sepolia test so far (scratch checkout on the VPS, real local Fastify server running actual current `main` code, real HTTP round-trip against the real CDP-routed route, real signed EIP-3009 authorization) — but pointed at Base **mainnet** (`eip155:8453`) instead of Sepolia, and against the **cheapest** currently-priced offering specifically, to minimize real money at risk. Confirm on-chain the same rigorous way as always: real tx hash, direct RPC confirmation, `status: 0x1`, against the correct mainnet USDC contract address (not the Sepolia one — double-check this explicitly before signing anything, this is the one detail most likely to get mixed up carrying over Sepolia-tuned code).

**One settlement. Not "a couple to be sure."** If it fails for a reason unrelated to the indexing question (a config mixup, wrong contract address, etc.), stop and report rather than retrying — a failed real-money attempt needs Forces' eyes before a second one, not an automatic retry.

## Step 2 — poll discovery, same as before

`GET /discovery/merchant?payTo=` (or search) for a reasonable window — 10 minutes is enough given prior evidence, no need to poll longer than that this time.

## Report

Plainly: indexed or not, after a confirmed real mainnet settlement. Either answer closes this specific question for good — no further mainnet spend needed either way once this one result is in.

## Cleanup

Same as every prior round — scratch checkout, bundle, any `.env` copy used for signing, all deleted from the VPS after the run.
