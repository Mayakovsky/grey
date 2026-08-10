// register-live.ts — BION-DIRECTIVE-31. Forces runs this script, not Kov (see the runbook +
// mechAdapter.ts's own standing posture: no private key ever loaded inside this codebase's own
// process/tool-call transcript). This file exists so the *building* of the live path is Kov's
// job; *running* it, with a real passphrase typed locally, is Forces' — same split as every
// wallet ceremony in this project (EXPANSION-E3-B1-MECH-KEY-CEREMONY-RUNBOOK-FORCES.md).
//
// Passphrase handling is modeled directly on grey-ceremony's address.ts/genkey.ts: interactive
// TTY prompt only (never a CLI flag or env var, so it can never end up logged/echoed in a
// transcript or shell history), decrypt in memory only, zero the key buffer in a `finally` the
// instant it's no longer needed. Reuses grey-ceremony's actual, tested crypto/prompt/memory
// modules rather than re-implementing Argon2id+AEAD decryption by hand here — a hand-rolled copy
// of security-critical decryption code is a real risk of subtle drift/bugs for zero benefit, and
// it MUST match grey-ceremony's own KDF/AEAD exactly to decrypt a real ceremony-generated
// keystore at all.
//
// Real funds note: registerAsMech's own implementation sends `bondWei` TWICE — once each to
// activateRegistration and registerAgents (real Olas ServiceRegistry semantics: the service-level
// security deposit and the per-instance operator bond are separate payable calls). The total ETH
// this script will actually send is 2x the headline bond figure, not 1x — printed explicitly in
// the final summary below so Forces sees the real number before confirming, not just the
// per-call bond amount.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { createPublicClient, formatEther, http, toHex, type Address } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { parseKeystore } from '@grey/ceremony/dist/crypto/index.js';
import { unlockKeystore } from '@grey/ceremony/dist/commands/address.js';
import { promptPassphrase } from '@grey/ceremony/dist/prompt/index.js';
import { zero } from '@grey/ceremony/dist/memory/index.js';
import {
  BASE_MECH_PAY_TO_ADDRESS,
  BASE_MECH_POOL_WALLET_ADDRESS,
  ETH_TOKEN_ADDRESS,
  GREY_MECH_CONFIG_HASH,
  GREY_MECH_PAYLOAD_HASH,
  SERVICE_REGISTRY_ADDRESSES,
  type MechAdapterConfig,
  type MechPaymentType,
} from '../src/config.js';
import { SERVICE_MANAGER_ABI } from '../src/serviceRegistryAbi.js';
import { createMarketplaceClient } from '../src/marketplaceClient.js';
import { createServiceRegistryClient } from '../src/serviceRegistryClient.js';
import { MechAdapter, type ServiceRegistrationParams } from '../src/mechAdapter.js';
import { createLogger } from '../src/logger.js';

const DEFAULT_KEYFILE = 'C:\\Users\\kidco\\.grey\\keys\\BASE_MECH_PAY_TO.json';
const RPC_URL = process.env.BASE_RPC_URL?.trim() || 'https://mainnet.base.org';

// Real params for Grey's actual registration — see BION-DIRECTIVE-31 and config.ts's own doc
// comments on GREY_MECH_CONFIG_HASH/GREY_MECH_PAYLOAD_HASH for how each was derived.
const AGENT_ID = 424242; // caller-chosen; no on-chain existence check on Base (mechAdapter.ts file header)
const BOND_WEI = 100_000_000_000_000n; // 0.0001 ETH, confirmed by Forces (D-31)
const PAYMENT_TYPE: MechPaymentType = 'NATIVE';

function parseArgs(argv: string[]): { keyfile: string } {
  const idx = argv.indexOf('--keyfile');
  const keyfile = idx !== -1 && argv[idx + 1] ? argv[idx + 1] : DEFAULT_KEYFILE;
  return { keyfile };
}

async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(prompt, resolve));
  } finally {
    rl.close();
  }
}

/** Step 3's real pre-flight check. IMPORTANT — this simulates `create()` ONLY, not the full
 *  5-step chain. Discovered while proving this script (BION-DIRECTIVE-31 Task 2): each
 *  `simulateContract` call is an independent `eth_call` against CURRENT real chain state.
 *  `simulateCreate` returns a *predicted* serviceId, but never actually creates anything — so a
 *  same-run `simulateActivateRegistration(predictedServiceId, ...)` reverts `NOT_MINTED` every
 *  time against real state, because that serviceId genuinely doesn't exist yet. This is NOT a
 *  chain-state-drift bug and no amount of retrying fixes it — `MechAdapter.registerAsMech`'s own
 *  `observeOnly:true` path for a from-scratch registration can only ever "succeed" against fake
 *  test clients (which don't enforce real sequential state) or once `create()` has actually
 *  executed for real. Calling `adapter.registerAsMech(..., {observeOnly:true})` here would abort
 *  this script on every single run, always, before ever reaching the confirmation prompt — so
 *  this function checks the one step that genuinely IS re-verifiable ahead of time (`create()`
 *  is state-independent; D-29/D-30 already proved it simulates cleanly against real state) and
 *  is honest that steps 2–5 are only provable by executing for real. Flagged in this project's
 *  own follow-up notes as worth a future look at `mechAdapter.ts` itself — out of scope here. */
async function preflightCheckCreate(
  owner: Address,
): Promise<{ predictedServiceId: bigint; gas: bigint; gasPriceWei: bigint }> {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const createArgs = {
    address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy,
    abi: SERVICE_MANAGER_ABI,
    functionName: 'create',
    args: [owner, ETH_TOKEN_ADDRESS, GREY_MECH_CONFIG_HASH, [AGENT_ID], [{ slots: 1, bond: BOND_WEI }], 1],
    account: owner,
  } as const;
  const [{ result: predictedServiceId }, gas, gasPriceWei] = await Promise.all([
    publicClient.simulateContract(createArgs),
    publicClient.estimateContractGas(createArgs),
    publicClient.getGasPrice(),
  ]);
  return { predictedServiceId, gas, gasPriceWei };
}

async function main(): Promise<void> {
  const { keyfile } = parseArgs(process.argv.slice(2));
  console.log(`Loading keystore: ${keyfile}`);
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

    const config: MechAdapterConfig = {
      payToAddress: unlocked.address,
      poolWalletAddress: BASE_MECH_POOL_WALLET_ADDRESS,
      rpcUrl: RPC_URL,
      databaseUrl: 'unused-by-this-script', // registerAsMech never reads this field
      observeOnly: true, // pre-flight re-simulate first; flipped to false only after confirmation
    };

    const serviceRegistryClient = createServiceRegistryClient(RPC_URL, account);
    const marketplaceClient = createMarketplaceClient(RPC_URL, account);
    const adapter = new MechAdapter({
      config,
      marketplaceClient,
      serviceRegistryClient,
      logger: createLogger({ component: 'register-live' }),
    });

    const params: ServiceRegistrationParams = {
      agentId: AGENT_ID,
      bondWei: BOND_WEI,
      configHash: GREY_MECH_CONFIG_HASH,
      mechPayload: GREY_MECH_PAYLOAD_HASH,
    };

    console.log('\n--- Step 3: live pre-flight check (chain state may have shifted since the last check) ---');
    console.log(
      '(create() only — the other 4 steps cannot be meaningfully simulated ahead of a real ' +
        'create() landing; see preflightCheckCreate()\'s doc comment for why.)',
    );
    let predictedServiceId: bigint, createGas: bigint, gasPriceWei: bigint;
    try {
      ({ predictedServiceId, gas: createGas, gasPriceWei } = await preflightCheckCreate(account.address));
    } catch (err) {
      console.log('Pre-flight check FAILED — aborting before any confirmation prompt.');
      throw err;
    }
    console.log(`Pre-flight check succeeded — create() predicts serviceId ${predictedServiceId.toString()}.`);

    const createGasCostWei = createGas * gasPriceWei;
    const totalValueWei = BOND_WEI * 2n; // activateRegistration + registerAgents each require bondWei

    console.log('\n=== FINAL SUMMARY — READ CAREFULLY BEFORE CONFIRMING ===');
    console.log(`Service owner (this wallet):   ${account.address}`);
    console.log(`Agent id:                      ${AGENT_ID}`);
    console.log(`Bond per call:                 ${BOND_WEI} wei (${formatEther(BOND_WEI)} ETH)`);
    console.log(`Total ETH value to be sent:    ${totalValueWei} wei (${formatEther(totalValueWei)} ETH)`);
    console.log('  (bondWei is sent TWICE — activateRegistration AND registerAgents each require it separately)');
    console.log(`configHash:                    ${GREY_MECH_CONFIG_HASH}`);
    console.log(`mechPayload:                   ${GREY_MECH_PAYLOAD_HASH}`);
    console.log(
      `create() live gas estimate:    ${createGas} gas @ ${formatEther(gasPriceWei)} ETH/gas ≈ ${formatEther(createGasCostWei)} ETH`,
    );
    console.log(
      '  (the other 4 steps cannot be gas-estimated until create() actually lands — Base gas is ' +
        'consistently cheap per D-29/D-30 live measurements, expect low cents total across all 5, ' +
        'but this script does not claim a precise combined figure for what it cannot yet measure)',
    );
    console.log('\nThis will submit REAL transactions on Base mainnet with REAL funds. This cannot be undone.');

    const typed = await askLine('\nType REGISTER (all caps) to proceed, anything else to abort: ');
    if (typed !== 'REGISTER') {
      console.log('Aborted — no transaction submitted.');
      return;
    }

    console.log('\n--- Executing for real (observeOnly = false) ---');
    config.observeOnly = false;
    try {
      const result = await adapter.registerAsMech(PAYMENT_TYPE, params);
      console.log('\n=== SUCCESS ===');
      console.log(`serviceId: ${result.serviceId.toString()}`);
      console.log(`multisig:  ${result.multisig}`);
      console.log(`mech:      ${result.mech}`);
    } catch (err) {
      console.log('\n=== REVERTED / FAILED ===');
      console.log(err instanceof Error ? err.message : String(err));
      console.log('Stopped — no further steps attempted.');
      process.exitCode = 1;
    }
  } finally {
    zero(unlocked.keyBytes);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
