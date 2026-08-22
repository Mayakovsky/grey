// e3-b1's Base-fork test tooling, extended for Gnosis (BION-DIRECTIVE-97/98 Task 2/3). Scoped to
// this package only (npm devDependency, no system Foundry/anvil install — user's explicit choice
// given neither Base nor Gnosis has a usable testnet deployment of the current Marketplace-based
// mech stack to test against instead; see test/fork/marketplaceRead.fork.test.ts and D-97's Chiado
// finding). `MECH_FORK_CHAIN` selects which chain gets forked — defaults to `base`, so omitting it
// (every pre-existing invocation of `test:fork`) reproduces the exact e3-b1 config unchanged.
import type { HardhatUserConfig } from 'hardhat/config';

type ForkChainKey = 'base' | 'gnosis';

const FORK_CHAIN: ForkChainKey = process.env.MECH_FORK_CHAIN?.trim() === 'gnosis' ? 'gnosis' : 'base';

const FORK_CHAIN_CONFIG: Record<
  ForkChainKey,
  { chainId: number; defaultRpcUrl: string; rpcEnvVar: string; blockNumber: number }
> = {
  base: {
    chainId: 8453,
    defaultRpcUrl: 'https://mainnet.base.org',
    rpcEnvVar: 'BASE_FORK_RPC_URL',
    // Picked comfortably recent during e3-b1 research (current head was ~49.7M at that time),
    // must postdate the Mech Marketplace's Base deployment. Bump if the RPC's retained history
    // window ages it out.
    blockNumber: 49_700_000,
  },
  gnosis: {
    chainId: 100,
    defaultRpcUrl: 'https://rpc.gnosischain.com',
    rpcEnvVar: 'GNOSIS_FORK_RPC_URL',
    // BION-DIRECTIVE-113 — bumped again from D-110's 47_843_700: that block predates the real,
    // now-executed corrected createMech call (BION-DIRECTIVE-111/112, tx
    // 0x62c919b2ff77016fc42fea9123db6e7c884c1a9f008070733c3946c28fd1e747, landed at block
    // 47_844_995), so it couldn't be used to fork-prove anything against GNOSIS_MECH_ADDRESS's
    // real, live, correctly-priced state. This pin (real chain head read live via eth_blockNumber
    // was 47_846_148 at the time) postdates the corrected mech's creation, so the fork genuinely
    // sees the real GNOSIS_MECH_ADDRESS mech, already deployed and payable. Bump again if the
    // RPC's retained history window ages it out, or once service 3789 undergoes any further real
    // on-chain change this fork needs to see.
    blockNumber: 47_846_000,
  },
};

const { chainId: FORK_CHAIN_ID, defaultRpcUrl, rpcEnvVar, blockNumber: FORK_BLOCK_NUMBER } =
  FORK_CHAIN_CONFIG[FORK_CHAIN];
const FORK_RPC_URL = process.env[rpcEnvVar]?.trim() || defaultRpcUrl;

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  networks: {
    hardhat: {
      forking: {
        url: FORK_RPC_URL,
        // Pinned (Hardhat's own startup warning recommends this for performance/determinism
        // regardless) — also rules out any interaction between a moving "latest" fork block and
        // the hardfork-activation lookup below.
        blockNumber: FORK_BLOCK_NUMBER,
      },
      // EDR (Hardhat's Rust simulator) inherits the chain id from the forked RPC itself (leaving
      // `chainId` unset does NOT default to 31337 in forking mode, contrary to an earlier
      // assumption here) and has no built-in hardfork-activation-history table for either chain
      // id — every eth_call failed with "No known hardfork for execution on historical
      // block ... The node was not configured with a hardfork activation history" (eth_getCode
      // was unaffected — only historical-state execution needs the lookup). A flat top-level
      // `hardfork` setting did NOT fix this for Base (EDR still consults the chain-specific
      // activation table for historical-block execution, not just a flat default) — the
      // documented fix is registering an explicit hardfork-activation-history entry per chain id
      // via `chains`, so EDR has an answer for "which hardfork was active at any block on this
      // chain" without needing its own built-in knowledge of either chain's history.
      chainId: FORK_CHAIN_ID,
      hardfork: 'cancun',
      chains: {
        [FORK_CHAIN_ID]: {
          hardforkHistory: {
            cancun: 0,
          },
        },
      },
      // KNOWN UNRESOLVED, CONFIRMED CHAIN-AGNOSTIC (Base: e3-b1, 2026-08-08; Gnosis: D-97/98,
      // 2026-08-20 — both real runs, not inferred): none of the above — individually or combined
      // — actually fixes eth_call against forked state, on EITHER chain. Every readContract/
      // simulateContract fails with "No known hardfork for execution on historical block ... The
      // node was not configured with a hardfork activation history", identical error shape on
      // both chain id 8453 and chain id 100, even though this config matches Hardhat's own
      // documented `chains`/`hardforkHistory` shape exactly (verified directly against hardhat's
      // installed config-resolution.js — config.chains resolves correctly on the JS side; the
      // failure appears to originate inside the EDR native (Rust/napi) binary, which this pass
      // could not inspect further). eth_getCode against the fork DOES work on both chains (proves
      // the forked bytecode is real, including for a genuinely separate chain's real mainnet
      // state) — eth_call/simulateContract does not, on either. D-28 inferred this was an EDR
      // limitation rather than a Base-specific bug from Base-only evidence; running the identical
      // suite against a real Gnosis fork (D-97/98) is the actual confirmation of that inference,
      // not a restatement of it — see test/fork/*.forkcheck.ts's real observed pass/fail counts.
    },
  },
};

export default config;
