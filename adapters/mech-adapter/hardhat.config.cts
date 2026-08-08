// e3-b1's Base-fork test tooling. Scoped to this package only (npm devDependency, no system
// Foundry/anvil install — user's explicit choice given the Base Marketplace has no testnet
// deployment, current or legacy, to test against instead; see test/fork/marketplaceRead.fork.test.ts).
import type { HardhatUserConfig } from 'hardhat/config';

const FORK_RPC_URL = process.env.BASE_FORK_RPC_URL?.trim() || 'https://mainnet.base.org';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  networks: {
    hardhat: {
      forking: {
        url: FORK_RPC_URL,
        // Pinned (Hardhat's own startup warning recommends this for performance/determinism
        // regardless) — also rules out any interaction between a moving "latest" fork block and
        // the hardfork-activation lookup below. Must postdate the Mech Marketplace's Base
        // deployment (confirmed live via eth_getCode against current chain state during e3-b1
        // research, current head was ~49.7M at that time) — picked comfortably recent, not an
        // arbitrary early block that could predate the contract's deployment. Bump if the RPC's
        // retained history window ages it out.
        blockNumber: 49_700_000,
      },
      // EDR (Hardhat's Rust simulator) inherits chain id 8453 from the forked RPC itself
      // (leaving `chainId` unset does NOT default to 31337 in forking mode, contrary to an
      // earlier assumption here) and has no built-in hardfork-activation-history table for that
      // chain id — every eth_call failed with "No known hardfork for execution on historical
      // block ... The node was not configured with a hardfork activation history" (eth_getCode
      // was unaffected — only historical-state execution needs the lookup). A flat top-level
      // `hardfork` setting did NOT fix this (EDR still consults the chain-specific activation
      // table for historical-block execution, not just a flat default) — the documented fix is
      // registering an explicit hardfork-activation-history entry for chain id 8453 via
      // `chains`, so EDR has an answer for "which hardfork was active at any block on this
      // chain" without needing its own built-in knowledge of Base's history.
      chainId: 8453,
      hardfork: 'cancun',
      chains: {
        8453: {
          hardforkHistory: {
            cancun: 0,
          },
        },
      },
      // KNOWN UNRESOLVED (e3-b1, 2026-08-08): none of the above — individually or combined —
      // actually fixes eth_call against the forked Base state. Every readContract still fails
      // with "No known hardfork for execution on historical block ... The node was not
      // configured with a hardfork activation history", even though this config matches
      // Hardhat's own documented `chains`/`hardforkHistory` shape exactly (verified directly
      // against hardhat's installed config-resolution.js — config.chains resolves correctly on
      // the JS side; the failure appears to originate inside the EDR native (Rust/napi) binary,
      // which this pass could not inspect further). eth_getCode against the fork DOES work
      // (proves the forked bytecode is real) — eth_call does not. Flagging as a genuine,
      // reproducible tooling limitation rather than guessing further; see the e3-b1 report.
    },
  },
};

export default config;
