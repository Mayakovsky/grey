# EXPANSION E3-B1 — Mech Adapter Go-Live: Funding + Enable Checklist — Forces' Part Only

**For:** Forces. Same reasoning as every prior mainnet-checkpoint document in this project
(`EXPANSION-E3-B1-LIVE-REGISTRATION-RUNBOOK-FORCES.md`'s "a real signature/transaction from a
production wallet is single-operator by design," `EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-
FORCES.md`'s key-generation split) — funding a wallet and flipping a live switch on real,
already-built infrastructure is yours; building and fork-proving it was Kov's (BION-DIRECTIVE-45).
**This document is a checklist, not a script.** Nothing in it runs automatically. Read every item,
confirm it's true, and only then take the final enable action at the bottom.

## What this gates

`grey-mech-adapter` (BION-DIRECTIVE-45) is built, fork-proven, and installed on the VPS —
**disabled, not running.** `MECH_ADAPTER_OBSERVE_ONLY` defaults `true` regardless, so even once
the unit is enabled and running, it will not submit a single real transaction until that flips too.
This runbook covers both: getting the unit safely enabled, and — as a clearly separate, later
decision — flipping `observeOnly` off. Do not treat "the unit is running" and "it is allowed to act
on real requests" as the same milestone; they are deliberately two different gates.

## Precondition 1 — `BASE_MECH_AGENT_INSTANCE` funded with real ETH — **MET** (BION-DIRECTIVE-45-ADDENDUM, 2026-08-12)

**Real, funded, independently confirmed — not just trusted from Forces' report:** re-checked
directly via `eth_getBalance` against Base mainnet (not cached, not assumed from the addendum's own
claim) — `0x4391C092cF342C6a8eeCe352712fC0C8df14450d` holds **0.001 ETH**. Matches exactly. It is
the sole (threshold=1) signer of Grey's real mech multisig
(`0x5587335a6Fa1Dc7C421f2b87D91C7E9def095872`) and pays gas **directly out of its own balance** for
every delivery — `safeDeliveryClient.ts`'s `execTransaction` call is built with `gasPrice: 0`,
`refundReceiver: 0x0` (no Safe-side gas refund mechanism), so the Safe's own balance was never
relevant here; this EOA specifically needed ETH, and now has it.

**This is deliberately not the runbook's original 0.1 ETH suggestion.** Forces is operating under
real scarcity right now; 0.001 ETH is the considered amount, not a partial/interim figure awaiting
top-up to the suggested number — treat it as the real funding decision, not a placeholder.

**Real headroom math, against the same directly-measured cost this runbook already cites** (212,210
gas, real sampled `effectiveGasPrice` ~1.002 gwei, ~0.000213 ETH/delivery):

| | value |
|---|---|
| Funded | 0.001 ETH |
| Real cost per delivery (sampled gas price) | ~0.000213 ETH |
| Deliveries covered at the sampled price | **~4.7** |
| Deliveries covered if gas price is 2× the sample | **~2.3** |
| Deliveries covered if gas price is 5× the sample | **~0.9** |

**Read this plainly, not just as a number: this is thin margin, not a comfortable buffer.**
Routing/pinning failures cost nothing (all off-chain, before any transaction is built — see
`taskIntake.ts`'s `routeRequest`), so a bad request or a Filebase hiccup does not touch this
balance. The real risk is entirely on the on-chain step: `execTransaction` is built with a nonzero
`safeTxGas` specifically so a failed *inner* `deliverToMarketplace` call surfaces as
`success: false` rather than reverting the whole transaction (see `safeDeliveryClient.ts`'s own
header) — which means **a failed delivery attempt still spends real gas**, it just fails cleanly
instead of reverting. One bad first attempt, on top of even a modest gas-price uptick, could leave
only one or two more tries. See the "Forces says go" checklist below and Kov's reply to the
addendum (`bion/_internal/BION-DIRECTIVE-45-ADDENDUM-STATUS.md`) for the real recommendation on
whether this is enough for a single go-live proof attempt as-is.

**Do not fund the multisig itself** (`0x5587335a...`) for this purpose — it was, and remains,
irrelevant to gas payment under this delivery design.

## Precondition 2 — Filebase credential live and verified

`MECH_ADAPTER_FILEBASE_ACCESS_KEY_ID` / `MECH_ADAPTER_FILEBASE_SECRET_ACCESS_KEY` /
`MECH_ADAPTER_FILEBASE_BUCKET` (`.env.example`'s "Mech adapter" block has the full doc comment for
each) must be real, live Filebase S3-compatible API credentials, filled into
`/etc/grey/mech-adapter.env` on the VPS directly (never committed, never passed through this
codebase's own process/tool-call transcript — same posture as every hot key in this project).
Provisioning this credential is explicitly **not** something Kov does (BION-DIRECTIVE-45's own
scope) — a new third-party account/API-key, same identity boundary as everything else.

**A NEW bucket, not `grey-olas`** (D-38-ADDENDUM's static, one-time-pinned registration metadata
bucket) — Kov's reasoned call in BION-DIRECTIVE-45's design: dynamic per-response pinning should
have an independent lifecycle/rate-limit/cleanup posture from the permanent registration data, so a
mistake in one blast-radius doesn't touch the other. Forces picks the real bucket name/account when
provisioning; nothing in the code assumes a specific name (`MECH_ADAPTER_FILEBASE_BUCKET` is fully
env-driven).

**Verify it for real before trusting it** — same "don't deliver on faith" discipline
`responsePinner.ts` itself enforces at runtime, done here once by hand before enabling the unit:

```bash
# From the VPS, after filling in the real credential in /etc/grey/mech-adapter.env:
cd /opt/grey/grey/adapters/mech-adapter
set -a && source /etc/grey/mech-adapter.env && set +a
node --input-type=module -e "
import { loadFilebaseCredentialsFromEnv } from './dist/filebaseCredentials.js';
import { createFilebasePinner } from './dist/responsePinner.js';
const pinner = createFilebasePinner({ credentials: loadFilebaseCredentialsFromEnv() });
try {
  const r = await pinner.pinAndVerify(JSON.stringify({ smoke: 'test', ts: Date.now() }));
  console.log('OK — pinned and independently verified:', r);
} catch (e) {
  console.error('FAILED:', e);
  process.exit(1);
}
"
```

A successful run prints a real `cid`/`hashBytes32` and exits 0 — that's real proof the credential
works AND the independent-gateway verification step resolves, not just that Filebase accepted the
upload. A failure here means do not proceed to enabling the unit; the adapter will fail every real
delivery the same way once live.

## Precondition 3 — the unit's own fork-proof gate is green, on the actual code being deployed

Before enabling, confirm on the VPS (not trusted from a prior local run):

```bash
cd /opt/grey/grey
pnpm --filter @grey/mech-adapter build
pnpm --filter @grey/mech-adapter test         # unit suite — must be 100% green
# Fork-proof suite (needs a local anvil — see BION-DIRECTIVE-45-STATUS.md for how Kov ran this):
GREY_MECH_ANVIL=1 pnpm --filter @grey/mech-adapter test
```

Both the plain unit suite and the `GREY_MECH_ANVIL=1` fork suite (registration, signed delivery,
full task-intake-with-pinning) must pass on the exact commit being deployed — not assumed carried
over from Kov's own pre-merge report, since a merge or rebase could in principle introduce drift.

## Enabling the unit (does NOT yet permit real writes)

Only after Preconditions 1–3 are all true:

```bash
sudo systemctl enable grey-mech-adapter
sudo systemctl start grey-mech-adapter
systemctl status grey-mech-adapter --no-pager
journalctl -u grey-mech-adapter -n 50 --no-pager
```

Expect a clean `mech-adapter: starting` log line (offerings count, `observeOnly: true`) and no
crash-loop. Because `MECH_ADAPTER_OBSERVE_ONLY` still defaults `true`, the running unit will detect
real requests, route them through the real handlers, pin real responses to Filebase, and
**simulate** delivery — logging what it would have done — without ever submitting a real
`execTransaction`. Let it run in this state for a real observation period before the next step;
watching real routing/pinning behavior against real live traffic, with zero funds-risk, is the
entire point of shipping `observeOnly` as a separate gate.

## Precondition 4 (final) — flipping `observeOnly` to `false`

Only after a real observation period under Precondition-4's simulate-only running has shown clean
behavior (real requests detected, routed, pinned, and simulated-delivered without errors):

```bash
# Edit /etc/grey/mech-adapter.env: MECH_ADAPTER_OBSERVE_ONLY=false
sudo systemctl restart grey-mech-adapter
journalctl -u grey-mech-adapter -f
```

Watch the first real delivery live. Confirm independently against real chain state after it —
same "don't just trust the printout" discipline every prior real transaction in this project has
used (`BION-E3-B1-LIVE-REGISTRATION-COMPLETE-REPORT-KOV.md` is the clearest precedent: a printed
success value there was later found wrong and had to be independently re-derived from the real
receipt). At minimum: `MechMarketplace`'s real `RequestStatus` for the delivered request id should
read `Delivered`, and the real IPFS content at the delivered hash should resolve and match what was
served.

## Forces says go

The four preconditions above are not self-certifying — this line is the actual gate:

```
[x] Precondition 1 confirmed — BASE_MECH_AGENT_INSTANCE funded, amount: 0.001 ETH (~4.7 deliveries at sampled gas price, thin margin — see math above), confirmed via eth_getBalance 2026-08-12
[ ] Precondition 2 confirmed — Filebase credential live, verified via the smoke-test script above
[ ] Precondition 3 confirmed — fork-proof gate green on the deployed commit: ______
[ ] Unit enabled + started, observed clean under observeOnly=true for: ______ (duration)
[ ] Precondition 4 — Forces says go: flip MECH_ADAPTER_OBSERVE_ONLY=false — signed: ______  date: ______
```

Nothing past this line runs without that explicit signature — same standing posture as every other
real-money capability this project has shipped.
