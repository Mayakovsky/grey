# EXPANSION E3-B1 — Agent Instance Wallet Ceremony — Forces' Part Only

**For:** Forces. Same reasoning as every prior ceremony in this project (`EXPANSION-E2-KITE-KEY-CEREMONY-RUNBOOK-FORCES.md`, `EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-FORCES.md`) — key generation is single-operator by design. Confirmed naming: `BASE_MECH_AGENT_INSTANCE`.

## What you're generating, and why this one's different

One new keystore — **`BASE_MECH_AGENT_INSTANCE`** — the address that will be registered as service 635's sole agent instance, distinct from `BASE_MECH_PAY_TO` (the operator/owner). This is required by the protocol itself: `ServiceRegistryL2.sol` hard-reverts if the operator and the agent instance are the same address.

**Read this before you generate anything — this key's job is not what the other ones were.** `BASE_MECH_PAY_TO`/`BASE_MECH_POOL_WALLET` are cold-ish: funded, occasionally touched. This one is different: once `deploy()` runs, this address becomes the **sole signer** (`threshold=1`) of the Safe multisig the service creates. Traced the real `OlasMech.sol` contract to confirm what that actually means operationally: every response Grey's mech ever delivers requires a call to `deliverToMarketplace()`, which is gated so that `msg.sender` must literally be that multisig — meaning **this key needs to sign a real transaction for every single delivered response**, not just once at setup. It will need to move toward automated signing eventually (same category as `GREY_AGENT_WALLET`'s hot-signing role in the sweeper) — that's a separate, later decision, not something this ceremony commits you to today, but generate this key knowing it's headed toward operational use, not long-term cold storage.

**Not a reuse of `GREY_DID_OWNER`** — that was considered and deliberately rejected: reusing Grey's core identity key as a routinely-signing operational key would share blast radius between the mech's delivery pipeline and Grey's on-chain identity. This is a clean, dedicated key for exactly one job.

## Steps — run from `C:\Users\kidco\dev\grey\packages\grey-ceremony`

**1. Generate the passphrase:**
```
pnpm dev:cli genphrase
```
Press Enter for CSPRNG generation, or `d` for manual dice entry. Prints a 6-word phrase. Keystrokes echo in this tool by design (single-operator threat model) — normal terminal hygiene applies: no screen-share, no session-logging tool capturing this window.

**2. Generate the keystore:**
```
pnpm dev:cli genkey --out C:\Users\kidco\.grey\keys\BASE_MECH_AGENT_INSTANCE.json
```
Enter the passphrase twice when prompted (new + confirm). Prints the address on success — copy it.

**3. (Optional sanity check) Confirm the address without touching the key:**
```
pnpm dev:cli address --keyfile C:\Users\kidco\.grey\keys\BASE_MECH_AGENT_INSTANCE.json
```
Never pass `--reveal-private` outside a genuine recovery need.

## What to hand back

Just the **address** — not the keystore file, not the passphrase. Hand it back and Kov will fold it into `mech-adapter`'s config as a source literal (same pattern as `BASE_MECH_PAY_TO_ADDRESS`), thread it into the `registerAgents` call, and re-prove via live simulation before anything runs for real again.
