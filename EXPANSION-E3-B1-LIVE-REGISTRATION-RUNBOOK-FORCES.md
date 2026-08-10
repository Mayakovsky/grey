# EXPANSION E3-B1 — Live Mech Registration — Forces' Part Only

**For:** Forces. Same reasoning as `EXPANSION-E2-KITE-KEY-CEREMONY-RUNBOOK-FORCES.md` and
`EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-FORCES.md` — a real signature/transaction from a
production wallet is single-operator by design. `config.observeOnly` defaults `true` and no
adapter in this repo ever loads a private key; that's this project's standing posture, not
relaxed here. Kov built and proved this script (BION-DIRECTIVE-31); running it, with the real
passphrase typed locally, is yours.

## What this does

`adapters/mech-adapter/scripts/register-live.ts` runs Grey's real Olas ServiceRegistry
registration on Base mainnet — the 4-step lifecycle (`create` → `activateRegistration` →
`registerAgents` → `deploy`) plus `MechFactory.createMech`, using `BASE_MECH_PAY_TO`'s real
keystore, real funds, real `configHash`/`mechPayload` (from BION-DIRECTIVE-30). It asks for your
passphrase interactively, re-checks live chain state one more time, prints everything it's about
to do, and only proceeds past that point if you type `REGISTER` literally.

**Before you run it — the one non-obvious number:** the real total ETH the script will send is
**0.0002 ETH, not 0.0001 ETH.** `registerAsMech`'s own implementation sends the confirmed bond
(0.0001 ETH) to *both* `activateRegistration` and `registerAgents` separately (real Olas
ServiceRegistry semantics — the service-level deposit and the per-instance operator bond are two
distinct payable calls). The script's summary prints this total explicitly before asking for
confirmation — check it matches this note.

## Prerequisites

- `BASE_MECH_PAY_TO`'s keystore file exists at `C:\Users\kidco\.grey\keys\BASE_MECH_PAY_TO.json`
  (from the original wallet ceremony). If it's somewhere else, pass `--keyfile <path>`.
- The wallet is funded with at least ~0.0002 ETH plus a small gas buffer (per Forces' 2026-08-10
  confirmation, it already is).
- Run from `C:\Users\kidco\dev\grey\adapters\mech-adapter`.

## Steps

**1. Run the script:**
```
pnpm register:live
```
(or, if you need a non-default keyfile path: `pnpm register:live -- --keyfile <path>`)

**2. Enter the passphrase when prompted:**
```
Passphrase:
```
Keystrokes echo in this tool by design (same single-operator threat model as every other
ceremony command) — normal terminal hygiene applies: no screen-share, no session-logging tool
capturing this window.

**3. The script will:**
- Confirm the keystore's address matches `BASE_MECH_PAY_TO` (aborts if it doesn't — wrong keyfile).
- Re-check `create()` live against Base mainnet right now (chain state can shift between when
  this was last checked and when you actually run it). This checks `create()` only, not the
  full chain — see the script's own `preflightCheckCreate()` doc comment if you want the "why."
- Print a summary: service owner, agent id, bond per call, **total ETH value (0.0002 ETH)**,
  `configHash`, `mechPayload`, and a live gas estimate for `create()`.

**4. Confirm:**
```
Type REGISTER (all caps) to proceed, anything else to abort:
```
Anything other than the literal text `REGISTER` aborts cleanly — no transaction submitted.

**5a. On success**, the script prints:
```
=== SUCCESS ===
serviceId: <n>
multisig:  0x...
mech:      0x...
```
**Save these three values and send them back to Kov** — verifying them independently against
real chain state (not just trusting this printout) is the explicit next step (BION-DIRECTIVE-31
§5), same "verify, don't just trust" discipline this project has used throughout.

**5b. On failure**, the script prints the real revert reason and stops immediately — it does not
attempt any further steps after a failure. Send the full output back to Kov as-is; don't
summarize or retype it, so nothing gets lost or misquoted in translation.

## What NOT to do

- Don't pass the passphrase as a CLI argument or environment variable — the script only accepts
  it via the interactive prompt, by design (so it can never end up logged or persisted anywhere).
- Don't run this more than once without checking in first if step 5b happens — a revert on
  `create()` costs only gas (nothing was created), but a revert partway through a later step
  after `create()` already landed for real leaves a real, partially-registered service sitting
  on-chain that the next attempt needs to account for (`existingServiceId`), not silently retry
  from scratch.
