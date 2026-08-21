// self-test-request.ts — BION-DIRECTIVE-113. Same operator-runs-this / Kov-builds-this split as
// register-live.ts (see that file's own header for the full rationale) — this script is built
// here, run by Forces personally, using the exact same interactive-TTY-only passphrase pattern
// (never a CLI flag or env var, so a real passphrase can never end up logged/echoed/in shell
// history), and the same preflight-simulate-then-typed-confirmation discipline before anything
// real broadcasts.
//
// What this proves for real, and why it matters: D-110/111/112 fixed the registration bug and
// proved the corrected Gnosis mech (GNOSIS_MECH_ADDRESS) is real, correctly priced, and payable —
// but "payable" only proves the price is right, not that a real request actually gets picked up,
// delivered, and settled by the live, already-running grey-mech-adapter-gnosis.service. This
// script submits one real, tiny, self-directed request (BASE_MECH_PAY_TO requesting from its own
// mech — confirmed legal by reading the real MechMarketplace.sol source directly,
// BION-DIRECTIVE-109 §2: there is no check anywhere comparing msg.sender against the priority
// mech's owner/operator), pays the real ~0.13 xDAI cost, pins the real request content to Filebase
// (the exact same real pin-and-verify mechanism responsePinner.ts already proves for RESPONSE
// content, BION-DIRECTIVE-45/47 — applied here to REQUEST content instead, since the live adapter
// needs to fetch what's being asked the same way any requester's content gets fetched), then
// WATCHES the real cycle complete: the live service picking the request up, delivering a real
// response, and the request settling as `Delivered` on-chain. Real, undeniable proof the whole
// pipeline works — not just that a transaction landed.
//
// FIXED BEFORE THIS: BION-DIRECTIVE-111's register-live.ts ordering bug (resolve real values BEFORE
// any simulate/execute, never a placeholder that gets fixed up after) — same discipline applied
// here throughout: every real value (mech's own maxDeliveryRate/paymentType, the pinned content
// hash) is resolved BEFORE the preflight simulate, not after.
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatEther,
  http,
  parseAbi,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseKeystore } from '@grey/ceremony/dist/crypto/index.js';
import { unlockKeystore } from '@grey/ceremony/dist/commands/address.js';
import { promptPassphrase } from '@grey/ceremony/dist/prompt/index.js';
import { zero } from '@grey/ceremony/dist/memory/index.js';
import { BASE_MECH_PAY_TO_ADDRESS, CHAINS, GNOSIS_MECH_ADDRESS } from '../src/config.js';
import { MECH_MARKETPLACE_ABI, REQUEST_STATUS } from '../src/marketplaceAbi.js';
import { OLAS_MECH_ABI } from '../src/mechAbi.js';
import { deriveResponseHash, fetchRequestContent } from '../src/requestContent.js';
import { createFilebasePinner } from '../src/responsePinner.js';
import { loadFilebaseCredentialsFromEnv } from '../src/filebaseCredentials.js';

const DEFAULT_KEYFILE = 'C:\\Users\\kidco\\.grey\\keys\\BASE_MECH_PAY_TO.json';

// Gnosis-only, deliberately — this self-test targets Grey's corrected Gnosis mech specifically
// (BION-DIRECTIVE-113). Base's own self-test already ran, separately, years earlier in this arc
// (BION-DIRECTIVE-56-59) via different, since-superseded tooling — not this script's job to
// generalize to a --chain flag nobody asked for here.
const CHAIN_ID = 100;
const RPC_URL = process.env.GNOSIS_RPC_URL?.trim() || CHAINS[CHAIN_ID].defaultRpcUrl;
const MECH = GNOSIS_MECH_ADDRESS;
const MARKETPLACE = CHAINS[CHAIN_ID].marketplace.mechMarketplaceProxy;

// Real request() ABI fragment — copied verbatim from test/taskIntake.anvil.test.ts's own
// MARKETPLACE_REQUEST_ABI (itself traced to the real deployed ABI, same real source
// marketplaceAbi.ts's file header documents; not re-derived or guessed here).
const MARKETPLACE_REQUEST_ABI = parseAbi([
  'function request(bytes requestData, uint256 maxDeliveryRate, bytes32 paymentType, address priorityMech, uint256 responseTimeout, bytes paymentData) payable returns (bytes32 requestId)',
]);

function parseArgs(argv: string[]): {
  keyfile: string;
  responseTimeoutSeconds: bigint;
  maxWaitSeconds: number;
  pollEverySeconds: number;
} {
  const idx = argv.indexOf('--keyfile');
  const keyfile = idx !== -1 && argv[idx + 1] ? argv[idx + 1] : DEFAULT_KEYFILE;

  // BION-DIRECTIVE-113 — real, protocol-enforced bound, found by fork-proving this exact call
  // (not assumed): MechMarketplace.request() reverts OutOfBounds(provided, min=60, max=300) for
  // responseTimeout outside [60, 300] seconds — 900 (this script's original guess) reverts.
  // 300 is therefore the most margin this script can ever give. Real, load-bearing risk this
  // creates: the live service's own default poll interval is ALSO 300s (config.ts's
  // loadPollIntervalMs) — a request landing right after one poll tick isn't seen again until the
  // next tick, up to ~300s later, which is the SAME instant this request would expire on-chain.
  // Flagging this rather than silently hoping it doesn't happen: a real self-test run could
  // legitimately land in that window and expire undelivered through no fault of the adapter or
  // this script — see selfTestRequest.forkcheck.ts's own negative-control proof of the [60,300]
  // bound.
  const rtIdx = argv.indexOf('--response-timeout-seconds');
  const responseTimeoutSeconds = rtIdx !== -1 && argv[rtIdx + 1] ? BigInt(argv[rtIdx + 1]) : 300n;

  const mwIdx = argv.indexOf('--max-wait-seconds');
  // A bit past the real 300s on-chain cap above — by then the request has either been delivered
  // or has expired; no point waiting materially longer.
  const maxWaitSeconds = mwIdx !== -1 && argv[mwIdx + 1] ? Number(argv[mwIdx + 1]) : 360;

  const peIdx = argv.indexOf('--poll-every-seconds');
  const pollEverySeconds = peIdx !== -1 && argv[peIdx + 1] ? Number(argv[peIdx + 1]) : 15;

  return { keyfile, responseTimeoutSeconds, maxWaitSeconds, pollEverySeconds };
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

function statusName(status: number): string {
  const entry = Object.entries(REQUEST_STATUS).find(([, v]) => v === status);
  return entry ? entry[0] : `UNKNOWN(${status})`;
}

async function main(): Promise<void> {
  const { keyfile, responseTimeoutSeconds, maxWaitSeconds, pollEverySeconds } = parseArgs(process.argv.slice(2));

  const readOnlyClient = createPublicClient({ chain: CHAINS[CHAIN_ID].viemChain, transport: http(RPC_URL) });

  console.log('\n--- Step 1: real, read-only reads — no key material needed yet ---');
  // BION-DIRECTIVE-113 (and D-111's own lesson) — resolve every real value BEFORE any passphrase
  // prompt or preflight simulate, never a placeholder fixed up later.
  const deliveryRate = await readOnlyClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'maxDeliveryRate' });
  const paymentType = await readOnlyClient.readContract({ address: MECH, abi: OLAS_MECH_ABI, functionName: 'paymentType' });
  console.log(`Real mech.maxDeliveryRate(): ${deliveryRate} wei (${formatEther(deliveryRate)} xDAI)`);
  console.log(`Real mech.paymentType(): ${paymentType}`);

  // Real, prediction_market_research-shaped content — same real schema requestContent.ts
  // documents ({prompt, tool, nonce, schema_version, request_context}), same shape D-112 §4 tested
  // eth_estimateGas against. Nonce is unique per real run so a re-run never collides with an
  // earlier self-test's own hash/requestId.
  const requestContent = {
    prompt: `Grey mech self-test (BION-DIRECTIVE-113) — will BTC exceed $150,000 before 2027-01-01? [run ${Date.now()}]`,
    tool: 'prediction_market_research',
    nonce: `d113-self-test-${Date.now()}`,
    schema_version: '2.0',
    request_context: null,
  };
  const requestContentJson = JSON.stringify(requestContent);
  const requestDataHash = await deriveResponseHash(requestContentJson);
  console.log(`Real request content:\n${requestContentJson}`);
  console.log(`Real derived request hash: ${requestDataHash}`);

  console.log('\n--- Step 2: pin the real request content to Filebase, verify independently — BEFORE any passphrase prompt ---');
  // Same real pin-and-verify mechanism responsePinner.ts already proves for response content
  // (BION-DIRECTIVE-45/47) — the live adapter fetches REQUEST content the identical way
  // (requestContent.ts's fetchRequestContent), so this needs to be genuinely resolvable before the
  // real on-chain request ever lands, or the live service will fail to fetch it when it picks the
  // request up. Reads MECH_ADAPTER_FILEBASE_* from env — same three vars main.ts's own production
  // config already requires (filebaseCredentials.ts) — fails closed here if unset, before wasting a
  // passphrase entry on a request that could never actually be served.
  const pinner = createFilebasePinner({ credentials: loadFilebaseCredentialsFromEnv() });
  const pinResult = await pinner.pinAndVerify(requestContentJson);
  if (pinResult.hashBytes32.toLowerCase() !== requestDataHash.toLowerCase()) {
    // Should be structurally impossible (both computations are the same deriveResponseHash call)
    // — a real mismatch here would mean something is broken at a level this script can't safely
    // reason past. Fail loud, not silently proceed with two different hashes.
    throw new Error(
      `self-test-request: pinned hash (${pinResult.hashBytes32}) does not match the independently ` +
        `derived request hash (${requestDataHash}) — refusing to proceed.`,
    );
  }
  console.log(`Real pin confirmed resolvable at cid ${pinResult.cid} (independently verified via gateway fetch).`);

  console.log(`\nLoading keystore: ${keyfile}`);
  const keystore = parseKeystore(readFileSync(keyfile, 'utf8'));
  const passphrase = await promptPassphrase();
  const unlocked = await unlockKeystore(keystore, passphrase);
  try {
    if (unlocked.address.toLowerCase() !== BASE_MECH_PAY_TO_ADDRESS.toLowerCase()) {
      throw new Error(
        `Keystore address ${unlocked.address} does not match the expected BASE_MECH_PAY_TO ` +
          `address ${BASE_MECH_PAY_TO_ADDRESS} — wrong keyfile? Refusing to proceed.`,
      );
    }
    const account = privateKeyToAccount(toHex(unlocked.keyBytes));
    const walletClient = createWalletClient({ chain: CHAINS[CHAIN_ID].viemChain, transport: http(RPC_URL), account });

    const requestArgs = [requestDataHash, deliveryRate, paymentType, MECH, responseTimeoutSeconds, '0x'] as const;

    console.log('\n--- Step 3: live pre-flight check — does the real request() call simulate cleanly right now ---');
    let predictedRequestId: `0x${string}`;
    try {
      const sim = await readOnlyClient.simulateContract({
        address: MARKETPLACE,
        abi: MARKETPLACE_REQUEST_ABI,
        functionName: 'request',
        args: requestArgs,
        account: account.address,
        value: deliveryRate,
      });
      predictedRequestId = sim.result;
    } catch (err) {
      console.log('Pre-flight check FAILED — aborting before any confirmation prompt.');
      throw err;
    }
    console.log(`Pre-flight check succeeded — predicted requestId: ${predictedRequestId} (ground truth will come from the real receipt's own event, not this prediction).`);

    console.log('\n=== FINAL SUMMARY — READ CAREFULLY BEFORE CONFIRMING ===');
    console.log(`Chain:                  Gnosis (chain id ${CHAIN_ID})`);
    console.log(`Requester (this wallet): ${account.address}`);
    console.log(`Priority mech:           ${MECH}`);
    console.log(`Payment (msg.value):     ${deliveryRate} wei (${formatEther(deliveryRate)} xDAI)`);
    console.log(`Response timeout:        ${responseTimeoutSeconds}s (on-chain expiry window for this request)`);
    console.log(`Request content hash:    ${requestDataHash}`);
    console.log(
      '\nThis will submit ONE real transaction on Gnosis mainnet (a real self-directed mech ' +
        'request) with real funds. This cannot be undone. The script will then watch for the ' +
        `live grey-mech-adapter-gnosis.service to pick it up and deliver, up to ${maxWaitSeconds}s.`,
    );

    const typed = await askLine('\nType REQUEST (all caps) to proceed, anything else to abort: ');
    if (typed !== 'REQUEST') {
      console.log('Aborted — no transaction submitted.');
      return;
    }

    console.log('\n--- Executing for real ---');
    const txHash = await walletClient.writeContract({
      address: MARKETPLACE,
      abi: MARKETPLACE_REQUEST_ABI,
      functionName: 'request',
      args: requestArgs,
      value: deliveryRate,
    });
    console.log(`Submitted: ${txHash}`);
    const receipt = await readOnlyClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      console.log('\n=== REVERTED ===');
      process.exitCode = 1;
      return;
    }

    // Ground truth from the real receipt's own event — never trust the pre-broadcast simulate
    // prediction alone (same discipline marketplaceClient.ts's decodeCreateMechAddress uses).
    let requestId: `0x${string}` | undefined;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MECH_MARKETPLACE_ABI, eventName: 'MarketplaceRequest', data: log.data, topics: log.topics });
        if (decoded.eventName !== 'MarketplaceRequest') continue;
        requestId = decoded.args.requestIds[0];
        break;
      } catch {
        continue;
      }
    }
    if (!requestId) {
      throw new Error('self-test-request: real receipt succeeded but no MarketplaceRequest event was found in its logs — cannot watch for delivery.');
    }
    console.log(`\n=== REQUEST SUBMITTED ===`);
    console.log(`requestId (from the real receipt's own event): ${requestId}`);
    if (requestId !== predictedRequestId) {
      console.log(`Note: this differs from the pre-broadcast prediction (${predictedRequestId}) — using the real receipt's value, not the prediction.`);
    }

    console.log(`\n--- Step 4: watching the real cycle — waiting for the live service to pick up and deliver (up to ${maxWaitSeconds}s) ---`);
    const requestBlock = receipt.blockNumber;
    const deadline = Date.now() + maxWaitSeconds * 1000;
    let delivered = false;
    while (Date.now() < deadline) {
      const status = await readOnlyClient.readContract({ address: MARKETPLACE, abi: MECH_MARKETPLACE_ABI, functionName: 'getRequestStatus', args: [requestId] });
      console.log(`[${new Date().toISOString()}] getRequestStatus = ${status} (${statusName(status)})`);
      if (status === REQUEST_STATUS.DELIVERED) {
        delivered = true;
        break;
      }
      await sleep(pollEverySeconds * 1000);
    }

    if (!delivered) {
      console.log(
        `\n=== NOT YET DELIVERED after ${maxWaitSeconds}s ===\n` +
          `requestId: ${requestId}\n` +
          'This does not necessarily mean anything is wrong — delivery is asynchronous and outside ' +
          'this script\'s control. Check again later with:\n' +
          `  cast call ${MARKETPLACE} "getRequestStatus(bytes32)(uint8)" ${requestId} --rpc-url ${RPC_URL}\n` +
          '(3 = Delivered). If it stays undelivered well past the response timeout, that is a real ' +
          'finding worth investigating on the live service.',
      );
      return;
    }

    console.log('\n--- Step 5: real proof of delivery — fetching the actual delivered response content ---');
    // Deliver's requestId field is NOT indexed (only mech/mechServiceMultisig are) — fetch every
    // real Deliver log from the mech in this block range and decode+filter client-side, same
    // "don't assume topic filtering you haven't verified" discipline used elsewhere in this repo.
    const deliverLogs = await readOnlyClient.getLogs({
      address: MECH,
      event: OLAS_MECH_ABI.find((e) => e.type === 'event' && e.name === 'Deliver')!,
      fromBlock: requestBlock,
      toBlock: 'latest',
    });
    let deliveredDataHash: `0x${string}` | undefined;
    let deliveredRate: bigint | undefined;
    for (const log of deliverLogs) {
      const decoded = decodeEventLog({ abi: OLAS_MECH_ABI, eventName: 'Deliver', data: log.data, topics: log.topics });
      if (decoded.eventName !== 'Deliver' || decoded.args.requestId !== requestId) continue;
      deliveredDataHash = decoded.args.data as `0x${string}`;
      deliveredRate = decoded.args.deliveryRate;
      break;
    }
    if (!deliveredDataHash) {
      console.log('getRequestStatus reports Delivered, but no matching Deliver event log was found — investigate directly, do not assume success.');
      return;
    }
    console.log(`Real Deliver event found — deliveryRate paid: ${deliveredRate} wei, response content hash: ${deliveredDataHash}`);
    const delivered_content = await fetchRequestContent(deliveredDataHash);
    console.log('\n=== REAL DELIVERED RESPONSE ===');
    console.log(JSON.stringify(delivered_content, null, 2));
    console.log('\nWhole cycle confirmed: request submitted, picked up, delivered, and the delivered content is real and independently fetchable.');
  } finally {
    zero(unlocked.keyBytes);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
