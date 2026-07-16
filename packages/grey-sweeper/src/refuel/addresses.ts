import type { Address } from 'viem';

/**
 * Phase F refuel — pinned contract literals (invariant #21/#22 family).
 *
 * ETH DESTINATION: {@link RELAYER_ADDRESS} is a SOURCE LITERAL, mirroring the
 * invariant-#16 pattern in config.ts. Env CANNOT redirect where unwrapped ETH is
 * sent — changing the refuel destination requires a code change + review
 * (invariant #21). Address = the FDQ-31(a) dedicated relayer EOA
 * (ceremony-generated 2026-07-11, movement-5-phase-D-KOV-directive.md §0.3).
 */
export const RELAYER_ADDRESS = '0xDbDb19E0A316a4d3e2Eb1E25D2D5b3562C9B4Ac8' as const;

/**
 * Uniswap v3 deployment literals per chain. First-party verified against
 * docs.uniswap.org Base deployments (fetched 2026-07-15, F0 recon §1) and the
 * basescan-verified SwapRouter02 source. The USDC/WETH POOL address is
 * intentionally NOT pinned — it is derived at runtime via
 * factory.getPool(usdc, weth, POOL_FEE), so a wrong-pool literal is structurally
 * impossible (F0 recon §1 design note).
 */
export interface UniswapDeployment {
  swapRouter02: Address;
  quoterV2: Address;
  weth9: Address;
  factory: Address;
}

const BASE_MAINNET: UniswapDeployment = {
  swapRouter02: '0x2626664c2603336E57B271c5C0b26F421741e481',
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  weth9: '0x4200000000000000000000000000000000000006',
  factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
};

/** Completeness/fork-tests only — refuel is a mainnet behavior (no Sepolia liquidity). */
const BASE_SEPOLIA: UniswapDeployment = {
  swapRouter02: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  quoterV2: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
  weth9: '0x4200000000000000000000000000000000000006',
  factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
};

/**
 * chainId → deployment. Typed like POOL_WALLET_BY_CHAIN_ID (config.ts): unlisted
 * chainIds read back falsy and {@link uniswapFor} FAILS CLOSED, never defaulting.
 */
export const UNISWAP_BY_CHAIN_ID: Record<number, UniswapDeployment> = {
  8453: BASE_MAINNET,
  84532: BASE_SEPOLIA,
};

/** Uniswap v3 USDC/WETH fee tier: 0.05% (ratified F-Q2(a)). */
export const POOL_FEE = 500;

/** Resolve the Uniswap deployment for a chain. Fails closed on unlisted chainIds. */
export function uniswapFor(chainId: number): UniswapDeployment {
  const dep = UNISWAP_BY_CHAIN_ID[chainId];
  if (!dep) {
    throw new Error(
      `grey-sweeper refuel: no Uniswap deployment configured for chainId ${chainId} — refusing to swap`,
    );
  }
  return dep;
}
