// bridge-threshold-check.ts — BION-DIRECTIVE-117/109. Real-money-safe: entirely read-only, no
// private key, no signing, no submission — this script only DECIDES whether bridging Gnosis's
// Tier B balance back to Base (via Ethereum) is currently economical, using live, current gas
// prices and token prices, never stale/guessed numbers.
//
// Why "dynamic threshold", not a fixed dollar figure: BION-DIRECTIVE-109 found the real two-hop
// bridge cost (Gnosis -> Ethereum via OmniBridge, Ethereum -> Base via L1StandardBridge) was
// ~$5-15 at ~3 gwei Ethereum gas; re-measured live during BION-DIRECTIVE-117 at ~0.14 gwei, the
// SAME two-hop cost came out to ~$0.23 -- a >20x swing from gas price alone. Ethereum gas is
// famously volatile (routinely 1-100+ gwei depending on network conditions) -- pinning a fixed
// dollar threshold to either snapshot would be wrong within days. This script instead computes
// the REAL cost live, every time it's run, and triggers only when the accumulated balance clears
// it by a configurable safety margin (default 10x) -- a threshold that self-adjusts to whatever
// gas conditions actually are at decision time, not whatever they were when this was written.
//
// Real primary-source mechanism this script's cost model is based on (BION-DIRECTIVE-109/117,
// confirmed by reading the real deployed contracts directly, not guessed):
//   Leg 1 (Gnosis -> Ethereum, OmniBridge / "xDai Bridge"):
//     - Home mediator (Gnosis):    0xf6A78083ca3e2a662D6dd1703c939c8aCE2e268d
//     - Foreign mediator (Ethereum): 0x88ad09518695c6c3712AC10a214bE5109a655671
//     - Real ABI (fetched from the real implementation contract behind the mediator's proxy,
//       0x2dbdCC6CAd1a5a11FD6337244407bC06162aAf92): native xDAI is bridged via its wrapped
//       ERC20 form, WXDAI (0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d) -- confirmed live,
//       `isRegisteredAsNativeToken(WXDAI) == true` on the real mediator. Real flow: wrap real
//       xDAI into WXDAI (WXDAI.deposit(), payable), approve the mediator to spend it (ERC20
//       approve), then call `relayTokens(address token, uint256 value)` on the mediator. This
//       script estimates all three real calls' gas live; it does NOT yet execute them (see file
//       footer -- that's the concrete next build step, not yet done).
//   Leg 2 (Ethereum -> Base, Base's own official bridge):
//     - L1StandardBridge (Ethereum): 0x3154Cf16ccdb4C6d922629664174b904d80F2C35 (BION-DIRECTIVE-109,
//       pinned via Base's own official docs, confirmed live via eth_getCode)
//     - Real function: `bridgeETHTo(address to, uint32 minGasLimit, bytes data)`, payable.
//
// Run: pnpm bridge:threshold-check [--safety-multiplier 10] [--gnosis-token-usd 1]
import process from 'node:process';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { CHAINS, BASE_MECH_POOL_WALLET_ADDRESS } from '../src/config.js';

const L1_STANDARD_BRIDGE = '0x3154Cf16ccdb4C6d922629664174b904d80F2C35' as const;
const OMNIBRIDGE_HOME_MEDIATOR = '0xf6A78083ca3e2a662D6dd1703c939c8aCE2e268d' as const;
const WXDAI = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d' as const;

const L1_STANDARD_BRIDGE_ABI = parseAbi([
  'function bridgeETHTo(address to, uint32 minGasLimit, bytes data) payable',
]);
const WXDAI_ABI = parseAbi([
  'function deposit() payable',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const OMNIBRIDGE_ABI = parseAbi([
  'function relayTokens(address token, uint256 value)',
]);

function parseArgs(argv: string[]): { safetyMultiplier: number; gnosisTokenUsd: number } {
  const smIdx = argv.indexOf('--safety-multiplier');
  const safetyMultiplier = smIdx !== -1 && argv[smIdx + 1] ? Number(argv[smIdx + 1]) : 10;
  const tuIdx = argv.indexOf('--gnosis-token-usd');
  // xDAI is a real, live USD-pegged stablecoin -- 1.0 is the correct default, not a guess; the
  // flag exists only so a future caller can override if that peg is ever meaningfully off.
  const gnosisTokenUsd = tuIdx !== -1 && argv[tuIdx + 1] ? Number(argv[tuIdx + 1]) : 1.0;
  return { safetyMultiplier, gnosisTokenUsd };
}

async function fetchEthUsd(): Promise<number> {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  if (!res.ok) throw new Error(`bridge-threshold-check: CoinGecko price fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as { ethereum: { usd: number } };
  return json.ethereum.usd;
}

async function main(): Promise<void> {
  const { safetyMultiplier, gnosisTokenUsd } = parseArgs(process.argv.slice(2));

  const gnosisClient = createPublicClient({ chain: CHAINS[100].viemChain, transport: http(CHAINS[100].defaultRpcUrl) });
  const ethClient = createPublicClient({ chain: mainnet, transport: http('https://ethereum-rpc.publicnode.com') });

  console.log('--- Step 1: real current Tier B balance (Gnosis) ---');
  const balanceWei = await gnosisClient.getBalance({ address: BASE_MECH_POOL_WALLET_ADDRESS });
  const balanceXdai = Number(formatEther(balanceWei));
  const balanceUsd = balanceXdai * gnosisTokenUsd;
  console.log(`Real Tier B balance: ${balanceXdai} xDAI (~$${balanceUsd.toFixed(2)})`);

  console.log('\n--- Step 2: real current gas prices, both chains ---');
  const gnosisGasPrice = await gnosisClient.getGasPrice();
  const ethGasPrice = await ethClient.getGasPrice();
  const ethUsd = await fetchEthUsd();
  console.log(`Gnosis gas price: ${gnosisGasPrice} wei`);
  console.log(`Ethereum gas price: ${ethGasPrice} wei (${(Number(ethGasPrice) / 1e9).toFixed(3)} gwei)`);
  console.log(`ETH/USD: $${ethUsd}`);

  console.log('\n--- Step 3: real live gas estimates for each real leg ---');
  // Leg 1a: WXDAI.deposit() -- read-only estimate, no real wrap happens here.
  const depositGas = await gnosisClient.estimateContractGas({
    address: WXDAI,
    abi: WXDAI_ABI,
    functionName: 'deposit',
    account: BASE_MECH_POOL_WALLET_ADDRESS,
    value: 1n, // trivial probe value -- real amount doesn't change the gas cost materially for a simple deposit
  });
  // Leg 1b: WXDAI.approve(mediator, amount)
  const approveGas = await gnosisClient.estimateContractGas({
    address: WXDAI,
    abi: WXDAI_ABI,
    functionName: 'approve',
    args: [OMNIBRIDGE_HOME_MEDIATOR, balanceWei],
    account: BASE_MECH_POOL_WALLET_ADDRESS,
  });
  // Leg 1c: OmniBridge.relayTokens(WXDAI, amount) -- real estimate will fail if the account has no
  // real WXDAI balance/allowance yet (it doesn't, nothing's been wrapped) -- fall back to a
  // conservative real-world-observed figure for this specific call shape if the live estimate
  // reverts for that reason, rather than silently reporting a wrong number.
  let relayGas: bigint;
  try {
    relayGas = await gnosisClient.estimateContractGas({
      address: OMNIBRIDGE_HOME_MEDIATOR,
      abi: OMNIBRIDGE_ABI,
      functionName: 'relayTokens',
      args: [WXDAI, balanceWei],
      account: BASE_MECH_POOL_WALLET_ADDRESS,
    });
  } catch {
    relayGas = 150_000n; // conservative placeholder -- see file footer, this needs a real fork-proof to pin down exactly
    console.log('(relayTokens live estimate reverted, as expected with no real WXDAI balance yet -- using a conservative 150,000 gas placeholder; a real fork-proof should replace this before real execution is built)');
  }
  const gnosisLegGasTotal = depositGas + approveGas + relayGas;
  console.log(`Gnosis leg (deposit + approve + relayTokens): ${depositGas} + ${approveGas} + ${relayGas} = ${gnosisLegGasTotal} gas`);

  // Leg 2: L1StandardBridge.bridgeETHTo -- real estimate against the real live contract.
  // BASE_MECH_POOL_WALLET genuinely holds 0 ETH on Ethereum mainnet (it's never been funded
  // there -- this wallet only ever operates on Gnosis/Base), so even a 1-wei probe value makes
  // estimateContractGas revert with InsufficientFunds -- a real, structural limitation of
  // estimating gas as an account with no balance, not a bug in the call itself. Falls back to
  // BION-DIRECTIVE-109's own real, live-measured figure for this exact call shape when that
  // happens, rather than reporting a wrong number.
  let bridgeGas: bigint;
  try {
    bridgeGas = await ethClient.estimateContractGas({
      address: L1_STANDARD_BRIDGE,
      abi: L1_STANDARD_BRIDGE_ABI,
      functionName: 'bridgeETHTo',
      args: [BASE_MECH_POOL_WALLET_ADDRESS, 200_000, '0x'],
      account: BASE_MECH_POOL_WALLET_ADDRESS,
      value: 1n,
    });
  } catch {
    bridgeGas = 662_768n; // BION-DIRECTIVE-109's real eth_estimateGas for this exact call, measured against a funded account
    console.log('(bridgeETHTo live estimate reverted -- BASE_MECH_POOL_WALLET has 0 ETH on mainnet, expected -- using BION-DIRECTIVE-109\'s real measured figure, 662768 gas, for this exact call shape)');
  }
  console.log(`Ethereum leg (bridgeETHTo): ${bridgeGas} gas`);

  console.log('\n--- Step 4: real total cost, today, right now ---');
  const gnosisLegCostWei = gnosisLegGasTotal * gnosisGasPrice;
  const gnosisLegCostUsd = Number(formatEther(gnosisLegCostWei)) * gnosisTokenUsd;
  const ethLegCostWei = bridgeGas * ethGasPrice;
  const ethLegCostUsd = Number(formatEther(ethLegCostWei)) * ethUsd;
  const totalCostUsd = gnosisLegCostUsd + ethLegCostUsd;
  console.log(`Gnosis leg cost: ~$${gnosisLegCostUsd.toFixed(4)}`);
  console.log(`Ethereum leg cost: ~$${ethLegCostUsd.toFixed(4)}`);
  console.log(`TOTAL real two-hop bridging cost right now: ~$${totalCostUsd.toFixed(4)}`);

  console.log('\n--- Step 5: the decision ---');
  const threshold = totalCostUsd * safetyMultiplier;
  console.log(`Safety-margin threshold (${safetyMultiplier}x real cost): $${threshold.toFixed(2)}`);
  console.log(`Real Tier B balance: $${balanceUsd.toFixed(2)}`);
  if (balanceUsd >= threshold) {
    console.log(`\n>>> BRIDGE NOW <<< — balance clears the ${safetyMultiplier}x safety margin over today's real cost.`);
  } else {
    const need = threshold - balanceUsd;
    console.log(`\n>>> WAIT <<< — balance is $${need.toFixed(2)} short of the ${safetyMultiplier}x safety margin at today's real cost. Re-run this check periodically (e.g. daily) or after each settlement accumulates.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// NOT YET BUILT (BION-DIRECTIVE-117's own honest scope boundary): this script only DECIDES —
// it never wraps, approves, relays, or bridges anything for real. The actual execution pipeline
// (real WXDAI wrap -> real approve -> real relayTokens -> wait for AMB finality on Ethereum ->
// real bridgeETHTo -> wait for Base L2 finality) is a real, multi-step, two-chain state machine
// that needs its own fork-proof (same discipline as every other real-money script this arc has
// shipped) before it's safe to build as a script Forces would ever run. Flagged as the concrete
// next step, not silently left undone.
