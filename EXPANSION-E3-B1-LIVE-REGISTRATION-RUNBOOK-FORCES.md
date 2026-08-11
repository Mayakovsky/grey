# EXPANSION E3-B1 — Live Mech Registration — Forces' Part Only

**For:** Forces. Same reasoning as `EXPANSION-E2-KITE-KEY-CEREMONY-RUNBOOK-FORCES.md` and
`EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-FORCES.md` — a real signature/transaction from a
production wallet is single-operator by design. `config.observeOnly` defaults `true` and no
adapter in this repo ever loads a private key; that's this project's standing posture, not
relaxed here. Kov built and proved this script (BION-DIRECTIVE-31); running it, with the real
passphrase typed locally, is yours.

## What this does — one real step per run, not the whole remaining chain

`adapters/mech-adapter/scripts/register-live.ts` runs **exactly one** real step of Grey's Olas
ServiceRegistry registration on Base mainnet per invocation (BION-DIRECTIVE-34), using
`BASE_MECH_PAY_TO`'s real keystore, real funds, real `configHash`/`mechPayload` (from
BION-DIRECTIVE-30), against real service **635** (created for real in the first live run —
BION-DIRECTIVE-32; do not let this script create a second one).

**Run it once per step, not once total.** The full remaining lifecycle is
`activateRegistration` → `registerAgents` → `deploy` → `MechFactory.createMech` — each is its own
real transaction, and this script runs exactly one of them each time it's invoked, then stops. It
reads service 635's real current state, figures out which of those four is actually next, prints
that plainly, asks for your passphrase, re-simulates *that specific step* one more time against
live chain state, prints a summary, and only proceeds past that point if you type `REGISTER`
literally. **Run the script again after each success to execute the next step** — it will detect
the new state and move on automatically; you don't need to tell it which step comes next.

This replaces an earlier version of this script/runbook that (incorrectly) implied one
confirmation would run every remaining step, and separately claimed a fixed "total ETH value:
0.0002 ETH, sent twice" regardless of which step was about to run. Neither was accurate — see
BION-DIRECTIVE-33/34's status files for why. The ETH value depends entirely on *which* step is
next: `activateRegistration` and `registerAgents` each send the confirmed bond (0.0001 ETH) once;
`deploy` and `createMech` send no ETH value at all. The script's summary always states the real
figure for the specific step it's about to run — read it fresh every time, don't assume it from a
prior run.

## Prerequisites

- `BASE_MECH_PAY_TO`'s keystore file exists at `C:\Users\kidco\.grey\keys\BASE_MECH_PAY_TO.json`
  (from the original wallet ceremony). If it's somewhere else, pass `--keyfile <path>`.
- The wallet holds enough ETH for whichever step is next (0.0001 ETH for `activateRegistration`/
  `registerAgents`, gas-only for `deploy`/`createMech`) plus a small gas buffer.
- Run from `C:\Users\kidco\dev\grey\adapters\mech-adapter`.

## Steps (repeat this whole sequence once per remaining real step)

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
- Read service 635's real current state and determine the real next step from it — this is not
  hardcoded; it re-checks live every run, so it correctly picks up wherever the previous run left
  off.
- Live-simulate *that one step* against Base mainnet right now (chain state can shift between
  runs — this is a fresh check every time, not a cached assumption).
- Print a summary: service owner, service id (635), real current state, **which step this run
  will execute**, the real ETH value that specific step requires, `configHash`, `mechPayload`.

**4. Confirm:**
```
Type REGISTER (all caps) to proceed, anything else to abort:
```
Anything other than the literal text `REGISTER` aborts cleanly — no transaction submitted.
**Read the "Step this run will execute" line before confirming** — that's the one thing that
changes between runs.

**5a. On success**, the script prints:
```
=== SUCCESS ===
step run:  <activateRegistration | registerAgents | deploy | createMech>
serviceId: 635
multisig:  0x...   (only once deploy has run)
mech:      0x...   (only after createMech)
```
**Save this output and send it back to Kov** — verifying it independently against real chain
state (not just trusting this printout) is the explicit next step (BION-DIRECTIVE-31 §5), same
"verify, don't just trust" discipline this project has used throughout. If `step run` wasn't
`createMech`, there's at least one more step left — run the script again once Kov confirms this
one landed cleanly.

**5b. On failure**, the script prints the real revert reason and stops immediately — it does not
attempt any further steps after a failure. Send the full output back to Kov as-is; don't
summarize or retype it, so nothing gets lost or misquoted in translation.

## What NOT to do

- Don't pass the passphrase as a CLI argument or environment variable — the script only accepts
  it via the interactive prompt, by design (so it can never end up logged or persisted anywhere).
- Don't assume you know which step is coming next without reading the summary — the script
  determines it fresh from real chain state every run; don't skip reading it because "it's
  probably still on the same step as last time."
- Don't run this again immediately after a failure (5b) without checking in with Kov first — a
  revert on `activateRegistration`/`registerAgents` costs only gas (nothing changed on-chain), but
  a revert during `deploy`/`createMech` can still be worth understanding before retrying, same
  trace-before-retry discipline BION-DIRECTIVE-32/33 established.
