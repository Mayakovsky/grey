# Testing @grey/sweeper

## Unit tests (default — CI-deterministic)

```
pnpm -F @grey/sweeper test
pnpm -F @grey/sweeper typecheck
```

The unit suite (`test/unit/*.test.ts`) uses **mocked** viem clients and a mocked
`pg.Pool`. It touches **no network, no anvil, and no real database** and is the
suite gated in CI. All sweep decisions, allowlist enforcement, error
classification, alert tiering/retry, and the per-tick `runTick(deps)` integration
run against injected mocks.

## Anvil broadcast tests (opt-in)

`test/anvil/*.test.ts` exercises a real ERC-20 broadcast against a local anvil
fork. These are wrapped in `describe.skipIf(process.env.GREY_SWEEPER_ANVIL !== '1')`
and are **skipped by default** (and are NOT counted toward the unit-test floor).

### Provision Foundry / anvil

Install Foundry via `foundryup`, pinned to a known-good toolchain:

```
curl -L https://foundry.paradigm.xyz | bash
foundryup --version nightly-de33b6af53005037b463318d2628b5cfcaf39916
```

(Any pinned `foundryup --version <tag>` works; pin it so anvil's behaviour is
reproducible across machines.)

### Run anvil

Start a Base mainnet fork so USDC exists at its canonical address:

```
anvil --fork-url "$GREY_SWEEPER_RPC_URL" --chain-id 8453
```

### Enable the gated tests

```
GREY_SWEEPER_ANVIL=1 pnpm -F @grey/sweeper test
```

With the gate set, the anvil specs un-skip and broadcast a real (forked) USDC
`transfer` to the hard-coded pool wallet, then assert the on-chain receipt and a
written `grey_two.sweep_log` row. Without `GREY_SWEEPER_ANVIL=1` they are no-ops.

## Refuel mainnet-fork rig (opt-in) — spec §5.2

`test/anvil/refuel.fork.test.ts` runs the REAL Phase-F refuel path
(`readSpot → quoteUsdcToWeth → executeRefuel`, plus `recoverStrandedWeth`) against
live Base pool/quoter/router/WETH on an anvil fork. Zero funds at risk; seconds
per loop; unlimited iterations. Gated `GREY_REFUEL_FORK=1`, skipped by default,
not counted toward the unit floor. **This rig is the ratified test strategy — it
is where refuel defects surface, not mainnet (the FDQ-53/55 lane lesson).**

```
anvil --fork-url <keyed Base RPC> --chain-id 8453 --port 8545
GREY_REFUEL_FORK=1 pnpm -F @grey/sweeper test test/anvil/refuel.fork.test.ts
```

It defaults to `http://127.0.0.1:8545` (override via `GREY_SWEEPER_RPC_URL`). USDC
is dealt to the test agent via `anvil_setStorageAt` (FiatToken balance slot 9);
gas via `anvil_setBalance`.

### ⚠️ Gotcha — anvil's default accounts have EIP-7702 delegations on Base

The rig generates a **fresh random EOA per run** for the test agent, and it must:
anvil's well-known default keys (`0xf39F…2266`, `0x7099…79C8`, …) carry **EIP-7702
delegations on Base mainnet** (`codesize 23` on the fork). `WETH.withdraw` pays
out ETH via a **2300-gas** `.transfer()`, which OOGs into their delegated code and
reverts — a phantom "withdraw is broken" that has nothing to do with the refuel.
The real agent (`0x394e…`) is a plain EOA (`codesize 0`), so production is fine.
**Only a real fork surfaces this** — a mock would have agreed the withdraw worked.
Never use a well-known/default address as the fork test agent.
