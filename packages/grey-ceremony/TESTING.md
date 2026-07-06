# Testing `@grey/ceremony`

## Running the CLI in dev

`@grey/ceremony` is source-consumed (no real `dist/` until M5 D-RESOLVE), so the
`bin` shim at `./dist/index.js` does not resolve in dev. Invoke the CLI via the
`dev:cli` script, which wraps `tsx`:

```bash
pnpm -F @grey/ceremony dev:cli <subcommand> [args...]
```

Examples:

```bash
pnpm -F @grey/ceremony dev:cli --help
pnpm -F @grey/ceremony dev:cli genphrase
pnpm -F @grey/ceremony dev:cli genkey --out /path/to/keystore.json
```

**Do NOT insert a `--` separator before the subcommand.** In this pnpm 11
workspace the `--` token is forwarded literally to the CLI (commander then sees
it as an unknown command and errors); arguments after the script name pass
through directly. Equivalent no-script form:
`pnpm -F @grey/ceremony exec tsx src/index.ts <subcommand> [args...]`.

## Unit tests (CI default — no network, no anvil)

```bash
pnpm -F @grey/ceremony typecheck   # tsc over src + test
pnpm -F @grey/ceremony test        # vitest run (unit only by default)
```

All `test/unit/*.test.ts` are deterministic and require no chain access. The
EIP-712 known-answer vectors are committed (mainnet chainId 8453 and Base
Sepolia chainId 84532) so the typed-data digest can regress-test offline.

The anvil end-to-end test under `test/anvil/` is **skipped by default** via
`describe.skipIf(process.env.GREY_CEREMONY_ANVIL !== '1')` and does not count
toward the unit total.

## Anvil end-to-end (opt-in)

The full ceremony round-trip (`mint` → `sign-consent` → `link-agent` →
`verify`) needs a local EVM with the ERC-8004 IdentityRegistry deployed.

### 1. Provision Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup --install nightly        # pin a known Foundry version for repeatability
anvil --version                    # confirm
```

Pin the Foundry version you provisioned in your runbook so the fork is
reproducible (e.g. `foundryup -v nightly-<commit>`).

### 2. Start a fork

```bash
# Base mainnet fork (chainId 8453) or Base Sepolia (chainId 84532)
anvil --fork-url "$BASE_RPC_URL" --chain-id 8453
```

### 3. Run the gated suite

```bash
GREY_CEREMONY_ANVIL=1 \
GREY_CEREMONY_RPC_URL=http://127.0.0.1:8545 \
pnpm -F @grey/ceremony test
```

The anvil `describe` block unskips only when `GREY_CEREMONY_ANVIL=1`.

## RPC URL resolution

Chain-touching commands (`mint`, `link-agent`, `verify`) take `--rpc-url`, or
fall back to the `GREY_CEREMONY_RPC_URL` environment variable. With neither set
they exit nonzero with a clear message.

## CLI exit codes

| Code | Meaning                                                              |
|------|---------------------------------------------------------------------|
| 0    | Success.                                                            |
| 1    | Uncaught error (bad keystore, integrity failure, validation error, missing RPC URL, mismatched key, etc. — surfaced by the top-level handler). |
| 2    | Operator declined a confirmation prompt (did not type `YES`) — `mint`, `link-agent`, `sign-consent` abort without acting. |

`commander` itself exits nonzero on unknown commands / missing required options.
