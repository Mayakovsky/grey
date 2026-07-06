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
