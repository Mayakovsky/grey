# @grey/ceremony

Self-authored, operator-only CLI for Grey's cold-key custody and the ERC-8004 mint
ceremony. **No third-party wallet software** (no MetaMask / Rabby / Frame). Runs on the
operator's local machine; never deployed to the VPS, never imported by grey-core or
grey-sweeper.

Subcommands: `genphrase` (6-word EFF diceware), `genkey` (atomic gen+encrypt keystore),
`address` (decrypt → address), `mint` (ERC-8004 `register()`), `sign-consent` (EIP-712
`AgentWalletSet` consent), `link-agent` (`setAgentWallet`), `verify` (on-chain reads).

Encryption: AES-256-GCM with an Argon2id-derived key (256 MiB / 4 / 1) from a 6-word
passphrase. Keystores are transparent JSON (`§5b.3`); the passphrase is the only secret.

**Three-layer architecture** (for the M4.5 standalone-crypto extraction): Layer 1 (`crypto/`,
`diceware/`, `memory/`, `prompt/`) is chain-agnostic pure crypto; Layer 2 (`rpc/`) is a
generic EVM adapter; Layer 3 (`eip712/`, `transactions/`, `commands/`) holds all ERC-8004
vocabulary. See `movement-4-did-sweeper-spec.md` §16.

Anvil end-to-end tests are opt-in: set `GREY_CEREMONY_ANVIL=1`. See `TESTING.md`.
