# EXPANSION E3-B1 — Base Mech Wallet Ceremony — Forces' Part Only

**For:** Forces. Same reasoning as `EXPANSION-E2-KITE-KEY-CEREMONY-RUNBOOK-FORCES.md` — key generation is single-operator by design, same as every existing key in this project (`BASE_POOL_WALLET`, `GREY_AGENT_WALLET`, `GREY_DID_OWNER`, `KITE_PAY_TO`, `KITE_POOL_WALLET`). Kov has the rest of `e3-b1` as a separate track, blocked until the two addresses below land. Confirmed naming: `BASE_MECH_PAY_TO` / `BASE_MECH_POOL_WALLET`.

## What you're generating

Two new keystores — **not** a reuse of `BASE_POOL_WALLET` (that's the existing x402 revenue wallet on Base; G4 requires per-service isolation even on a chain Grey already operates on):
- **`BASE_MECH_PAY_TO`** — Tier A, hot, will live on the VPS, receives mech task payments.
- **`BASE_MECH_POOL_WALLET`** — Tier B, key stays offline, consolidation point before eventual Tier D sweep.

## Before you type anything: two passphrases, not one

Tier A and Tier B each need their **own distinct passphrase**. Generate both before you run either `genkey` command — don't generate one and reuse it, and don't proceed to Tier B until Tier A's `genkey` is fully done and you've deliberately produced a second, different phrase for it. If you're ever unsure whether you're about to retype a phrase you already used, stop and run `genphrase` again rather than guess.

## Steps — run from `C:\Users\kidco\dev\grey\packages\grey-ceremony`

**1. Generate Tier A's passphrase:**
```
pnpm dev:cli genphrase
```
Press Enter for CSPRNG generation, or `d` for manual dice entry. Prints a 6-word phrase — this is **Tier A's passphrase only**. Keystrokes echo in this tool by design (single-operator threat model, per the tool's own header comment) — normal terminal hygiene applies: no screen-share, no session-logging tool capturing this window.

**2. Generate Tier A's keystore:**
```
pnpm dev:cli genkey --out C:\Users\kidco\.grey\keys\BASE_MECH_PAY_TO.json
```
Enter Tier A's passphrase twice when prompted (new + confirm). Prints the address on success — copy it.

**3. Generate Tier B's passphrase — run `genphrase` again, fresh:**
```
pnpm dev:cli genphrase
```
This is a **second, independent run** — the output must be a different phrase than Tier A's. This is Tier B's passphrase only; never use Tier A's here.

**4. Generate Tier B's keystore:**
```
pnpm dev:cli genkey --out C:\Users\kidco\.grey\keys\BASE_MECH_POOL_WALLET.json
```
Enter Tier B's passphrase (from step 3) twice when prompted. Copy the printed address.

**5. (Optional sanity check) Confirm each address without touching the key:**
```
pnpm dev:cli address --keyfile C:\Users\kidco\.grey\keys\BASE_MECH_PAY_TO.json
pnpm dev:cli address --keyfile C:\Users\kidco\.grey\keys\BASE_MECH_POOL_WALLET.json
```
Never pass `--reveal-private` outside a genuine recovery need.

## What to hand back

Just the two **addresses** — not the keystore files, not either passphrase. Hand them back and Kov will fold them into the `mech-adapter` wiring as source literals (same pattern as `KITE_PAY_TO`/`KITE_POOL_WALLET` in `adapters/x402-middleware/src/registry.ts`). The rest of `e3-b1` (adapter package scaffold, testnet cycle) doesn't strictly need these addresses to *start* — the adapter can be built and tested against the Marketplace contracts with placeholder addresses — but wiring the real payment-acceptance path and any testnet funding does need them, so this shouldn't sit too long behind the rest of the build.
