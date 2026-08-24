// bridge-execute.ts — BION-DIRECTIVE-118/119. Same operator-runs-this / Kov-builds-this split as
// register-live.ts/self-test-request.ts: interactive-TTY-only passphrase, preflight simulate
// before any broadcast, typed confirmation before executing for real.
//
// Real design history, not guessed: BION-DIRECTIVE-118 originally scoped this as a 2-3 leg journey
// (Gnosis xDAI -> OmniBridge -> Ethereum DAI -> swap -> Base ETH), but real research found the
// OmniBridge mediator (0xf6A78083ca3e2a662D6dd1703c939c8aCE2e268d) is GnosisScan-labeled "xDai
// Bridge" — it releases real DAI on Ethereum, not ETH, and Base has no real, liquid, canonical
// bridged-DAI representation to land that DAI in (BION-DIRECTIVE-118's own finding). Per
// BION-DIRECTIVE-119's decision (option 4 first): real research into bridge aggregators found
// LI.FI (li.quest) offers a real, live, single-hop route from Gnosis native xDAI directly to Base
// native WETH, via an underlying aggregated tool (routed through "relaydepository" / Relay
// Protocol — real, non-custodial, $20B+ real volume, ~2.7s median execution, per its own real
// published security docs). Real quote at the actual current Tier B balance (6 xDAI): total cost
// ~$0.06 (~1% of value), ~3 second execution — dramatically simpler AND cheaper than the original
// multi-leg design, and avoids the DAI/no-Base-liquidity dead end entirely. This script builds
// THAT route, not the original OmniBridge design.
//
// Real mechanism: LI.FI's /v1/quote endpoint returns a real `transactionRequest` (to, data, value)
// -- a single real transaction sending native xDAI (as `value`) with calldata to the aggregator's
// real deposit contract. No wrapping, no separate approval needed for the native-xDAI-in path.
// Quotes are time-sensitive (the underlying solver's price commitment expires) -- this script
// fetches a fresh quote for display/preflight, then fetches ANOTHER fresh one immediately before
// the real broadcast (after the passphrase-gated confirmation, which takes real human time) so the
// calldata actually sent reflects the most current real quote, not a stale one.
//
// Run: pnpm bridge:execute [--keyfile <path>] [--gas-reserve-xdai 0.5] [--max-wait-seconds 120]
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseKeystore } from '@grey/ceremony/dist/crypto/index.js';
import { unlockKeystore } from '@grey/ceremony/dist/commands/address.js';
import { promptPassphrase } from '@grey/ceremony/dist/prompt/index.js';
import { zero } from '@grey/ceremony/dist/memory/index.js';
import { CHAINS, BASE_MECH_POOL_WALLET_ADDRESS } from '../src/config.js';

const DEFAULT_KEYFILE = 'C:\\Users\\kidco\\.grey\\keys\\BASE_MECH_POOL_WALLET.json';
const CHAIN_ID = 100; // Gnosis-only — this is where Tier B accumulates for Grey's Gnosis mech (BION-DIRECTIVE-117/118)
const RPC_URL = process.env.GNOSIS_RPC_URL?.trim() || CHAINS[CHAIN_ID].defaultRpcUrl;
const BASE_RPC_URL = process.env.BASE_RPC_URL?.trim() || CHAINS[8453].defaultRpcUrl;
const NATIVE_XDAI = '0x0000000000000000000000000000000000000000';
// BION-DIRECTIVE-121 fix — the real bug: 0x4200...0006 is WETH9's real deployed CONTRACT address
// (the OP-stack predeploy), not a "give me native currency" sentinel. Requesting it as `toToken`
// asks LI.FI for real, wrapped WETH — which is exactly what Forces' first real run delivered
// (confirmed via balanceOf, funds safe) — not native ETH. Confirmed live against LI.FI's own real
// token list for Base (chainId 8453): the real native-ETH sentinel there is the same zero address
// already correctly used for native xDAI on the Gnosis side, not 0xEeee...EEeE. A fresh quote with
// this corrected address shows `action.toToken.symbol: "ETH"` (not "WETH") and estimateGas
// succeeds cleanly against real live state.
const NATIVE_ETH_ON_BASE = '0x0000000000000000000000000000000000000000';
const WETH_ON_BASE = '0x4200000000000000000000000000000000000006'; // real WETH9 contract — kept only for Step 4's fallback balance check below, never used as toToken
const WETH_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

interface LifiQuote {
  tool: string;
  estimate: {
    toAmount: string;
    toAmountMin: string;
    toAmountUSD?: string;
    fromAmountUSD?: string;
    executionDuration: number;
    feeCosts: { name: string; amountUSD: string }[];
    gasCosts: { amountUSD: string }[];
  };
  transactionRequest: { to: `0x${string}`; data: `0x${string}`; value: string };
}

// BION-DIRECTIVE-120 — real, root-caused fix: Forces' real preflight reverted with panic 0x11
// (arithmetic overflow). Confirmed via a real debug_traceCall against live mainnet state (not
// guessed): the revert originates deep inside Balancer's real Vault (0xBA1333...ba9), reached
// through a Paraswap-orchestrated swap step LI.FI's default routing includes as part of this
// quote (feeCollection -> paraswap -> relaydepository). Reproduced consistently across 3 real
// RPC providers and multiple amounts (ruling out a flaky-RPC or amount-too-small cause, both
// checked directly) — this is a real fragility in that specific Paraswap-routed path, not a bug
// in this script, the sentinel address (confirmed correct against LI.FI's own real token list),
// or a stale value/units mismatch (transactionRequest.value exactly equals the real fromAmount).
// Fix: exclude Paraswap from LI.FI's routing (`denyExchanges=paraswap`) — the resulting route
// (feeCollection -> nordstern -> relaydepository) real-estimateGas's cleanly, repeatedly, across
// multiple fresh quotes and amounts.
async function fetchQuote(amountWei: bigint): Promise<LifiQuote> {
  const url =
    `https://li.quest/v1/quote?fromChain=${CHAIN_ID}&toChain=8453` +
    `&fromToken=${NATIVE_XDAI}&toToken=${NATIVE_ETH_ON_BASE}` +
    `&fromAmount=${amountWei}&fromAddress=${BASE_MECH_POOL_WALLET_ADDRESS}` +
    `&denyExchanges=paraswap`;
  const res = await fetch(url);
  const json = (await res.json()) as LifiQuote & { message?: string };
  if (!res.ok || json.message) {
    throw new Error(`bridge-execute: LI.FI quote failed: ${json.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

function parseArgs(argv: string[]): { keyfile: string; gasReserveXdai: string; maxWaitSeconds: number } {
  const kfIdx = argv.indexOf('--keyfile');
  const keyfile = kfIdx !== -1 && argv[kfIdx + 1] ? argv[kfIdx + 1] : DEFAULT_KEYFILE;
  const grIdx = argv.indexOf('--gas-reserve-xdai');
  // Real reserve left unbridged to cover this tx's own gas — Gnosis gas is negligible (D-112/117:
  // low thousands of wei per gas at low-thousands gas prices), 0.5 xDAI is a generous real margin.
  const gasReserveXdai = grIdx !== -1 && argv[grIdx + 1] ? argv[grIdx + 1] : '0.5';
  const mwIdx = argv.indexOf('--max-wait-seconds');
  // Real quoted executionDuration is ~3s -- this is a real, generous margin for solver/relay
  // variance, not a guess at typical latency.
  const maxWaitSeconds = mwIdx !== -1 && argv[mwIdx + 1] ? Number(argv[mwIdx + 1]) : 120;
  return { keyfile, gasReserveXdai, maxWaitSeconds };
}

async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(prompt, resolve));
  } finally {
    rl.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printQuote(label: string, q: LifiQuote): void {
  const totalFeeUsd = q.estimate.feeCosts.reduce((s, f) => s + Number(f.amountUSD), 0);
  const totalGasUsd = q.estimate.gasCosts.reduce((s, g) => s + Number(g.amountUSD), 0);
  console.log(`${label}: tool=${q.tool}, toAmount=${formatEther(BigInt(q.estimate.toAmount))} WETH (min ${formatEther(BigInt(q.estimate.toAmountMin))}), est. duration ${q.estimate.executionDuration}s, real cost ~$${(totalFeeUsd + totalGasUsd).toFixed(4)}`);
}

async function main(): Promise<void> {
  const { keyfile, gasReserveXdai, maxWaitSeconds } = parseArgs(process.argv.slice(2));

  const gnosisClient = createPublicClient({ chain: CHAINS[CHAIN_ID].viemChain, transport: http(RPC_URL) });
  const baseClient = createPublicClient({ chain: CHAINS[8453].viemChain, transport: http(BASE_RPC_URL) });

  console.log('\n--- Step 1: real current Tier B balance and bridgeable amount ---');
  const balanceWei = await gnosisClient.getBalance({ address: BASE_MECH_POOL_WALLET_ADDRESS });
  const reserveWei = parseEther(gasReserveXdai);
  if (balanceWei <= reserveWei) {
    console.log(`Real balance (${formatEther(balanceWei)} xDAI) does not exceed the gas reserve (${gasReserveXdai} xDAI) — nothing to bridge. Aborting before any passphrase prompt.`);
    process.exitCode = 1;
    return;
  }
  const bridgeAmountWei = balanceWei - reserveWei;
  console.log(`Real balance: ${formatEther(balanceWei)} xDAI. Reserving ${gasReserveXdai} xDAI for this tx's own gas. Bridging: ${formatEther(bridgeAmountWei)} xDAI.`);

  console.log('\n--- Step 2: real live quote (LI.FI, routed via Relay) ---');
  const previewQuote = await fetchQuote(bridgeAmountWei);
  printQuote('Preview quote', previewQuote);

  console.log('\n--- Step 3: live pre-flight check — does the real deposit call estimate cleanly right now ---');
  await gnosisClient.estimateGas({
    account: BASE_MECH_POOL_WALLET_ADDRESS,
    to: previewQuote.transactionRequest.to,
    data: previewQuote.transactionRequest.data,
    value: BigInt(previewQuote.transactionRequest.value),
  });
  console.log('Pre-flight check succeeded — the real deposit call estimates cleanly right now.');

  console.log(`\nLoading keystore: ${keyfile}`);
  const keystore = parseKeystore(readFileSync(keyfile, 'utf8'));
  const passphrase = await promptPassphrase();
  const unlocked = await unlockKeystore(keystore, passphrase);
  try {
    if (unlocked.address.toLowerCase() !== BASE_MECH_POOL_WALLET_ADDRESS.toLowerCase()) {
      throw new Error(
        `Keystore address ${unlocked.address} does not match the expected BASE_MECH_POOL_WALLET ` +
          `address ${BASE_MECH_POOL_WALLET_ADDRESS} — wrong keyfile? Refusing to proceed.`,
      );
    }
    const account = privateKeyToAccount(`0x${Buffer.from(unlocked.keyBytes).toString('hex')}` as `0x${string}`);
    const walletClient = createWalletClient({ chain: CHAINS[CHAIN_ID].viemChain, transport: http(RPC_URL), account });

    const nativeEthBefore = await baseClient.getBalance({ address: BASE_MECH_POOL_WALLET_ADDRESS });
    const wethBefore = await baseClient.readContract({ address: WETH_ON_BASE, abi: WETH_ABI, functionName: 'balanceOf', args: [BASE_MECH_POOL_WALLET_ADDRESS] });

    console.log('\n=== FINAL SUMMARY — READ CAREFULLY BEFORE CONFIRMING ===');
    console.log(`Chain:                Gnosis -> Base, via LI.FI/Relay (real, non-custodial aggregator)`);
    console.log(`Sender/receiver:      ${account.address} (same address both chains)`);
    console.log(`Bridging:             ${formatEther(bridgeAmountWei)} xDAI`);
    console.log(`Expected to receive:  ~${formatEther(BigInt(previewQuote.estimate.toAmount))} ETH on Base (min ${formatEther(BigInt(previewQuote.estimate.toAmountMin))})`);
    console.log(`Real Base balances before: ${formatEther(nativeEthBefore)} native ETH, ${formatEther(wethBefore)} WETH`);
    console.log('\nThis will submit ONE real transaction on Gnosis mainnet with real funds. This cannot be undone.');

    const typed = await askLine('\nType BRIDGE (all caps) to proceed, anything else to abort: ');
    if (typed !== 'BRIDGE') {
      console.log('Aborted — no transaction submitted.');
      return;
    }

    console.log('\n--- Executing for real — fetching one final fresh quote (the preview above may be stale by now) ---');
    const finalQuote = await fetchQuote(bridgeAmountWei);
    printQuote('Final quote', finalQuote);

    const txHash = await walletClient.sendTransaction({
      to: finalQuote.transactionRequest.to,
      data: finalQuote.transactionRequest.data,
      value: BigInt(finalQuote.transactionRequest.value),
    });
    console.log(`Submitted: ${txHash}`);
    const receipt = await gnosisClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      console.log('\n=== REVERTED ===');
      process.exitCode = 1;
      return;
    }
    console.log('\n=== DEPOSIT CONFIRMED ON GNOSIS ===');

    // BION-DIRECTIVE-121 fix — check BOTH real native ETH and real WETH balances, whichever
    // actually moves. toToken now correctly requests native ETH (see NATIVE_ETH_ON_BASE's own doc
    // comment), but this is a real, deliberate safety net: Forces' own first real run showed the
    // underlying route can deliver wrapped WETH even when asked for something else, and this
    // script's own job is to detect what REALLY arrived, not assume the request was honored.
    console.log(`\n--- Step 4: watching Base for the real cross-chain delivery (up to ${maxWaitSeconds}s) ---`);
    const deadline = Date.now() + maxWaitSeconds * 1000;
    let delivered = false;
    while (Date.now() < deadline) {
      const [currentEth, currentWeth] = await Promise.all([
        baseClient.getBalance({ address: BASE_MECH_POOL_WALLET_ADDRESS }),
        baseClient.readContract({ address: WETH_ON_BASE, abi: WETH_ABI, functionName: 'balanceOf', args: [BASE_MECH_POOL_WALLET_ADDRESS] }),
      ]);
      if (currentEth > nativeEthBefore) {
        console.log(`\n=== DELIVERED (native ETH) ===`);
        console.log(`Real Base native ETH balance: ${formatEther(nativeEthBefore)} -> ${formatEther(currentEth)} (+${formatEther(currentEth - nativeEthBefore)} ETH)`);
        delivered = true;
        break;
      }
      if (currentWeth > wethBefore) {
        console.log(`\n=== DELIVERED (WETH, not native ETH — real, safe, just a different real asset than requested) ===`);
        console.log(`Real Base WETH balance: ${formatEther(wethBefore)} -> ${formatEther(currentWeth)} (+${formatEther(currentWeth - wethBefore)} WETH)`);
        console.log('Funds are real and safe as WETH — unwrap via WETH.withdraw() separately if native ETH is specifically needed.');
        delivered = true;
        break;
      }
      await sleep(5_000);
    }
    if (!delivered) {
      console.log(
        `\n=== NOT YET DELIVERED after ${maxWaitSeconds}s ===\n` +
          `Gnosis deposit tx: ${txHash}\n` +
          'This does not necessarily mean anything is wrong -- check the tx on a Gnosis explorer and ' +
          'the destination balance again shortly; real cross-chain relay is outside this script\'s control.',
      );
    }
  } finally {
    zero(unlocked.keyBytes);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
