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
//
// UPDATED (BION-DIRECTIVE-32): the first real run's create() genuinely succeeded — real service
// 635 already exists, real, correctly configured (confirmed live, see D-32's status file). Its
// activateRegistration reverted NOT_MINTED at the time, traced to a transient RPC read-after-write
// consistency gap, not a real problem with service 635 itself — fixed in mechAdapter.ts
// (waitForServiceVisible) for any FUTURE fresh create(), and independently re-proved live that
// activateRegistration now succeeds in simulation against 635 specifically. This script now
// targets `existingServiceId: 635n` — do NOT let it create a second service.
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
  GREY_MECH_CONFIG_HASH,
  GREY_MECH_PAYLOAD_HASH,
  SERVICE_REGISTRY_ADDRESSES,
  type MechAdapterConfig,
  type MechPaymentType,
} from '../src/config.js';
import { SERVICE_MANAGER_ABI, SERVICE_REGISTRY_L2_ABI, SERVICE_STATE } from '../src/serviceRegistryAbi.js';
import { createMarketplaceClient } from '../src/marketplaceClient.js';
import { createServiceRegistryClient } from '../src/serviceRegistryClient.js';
import { MechAdapter, type ServiceRegistrationParams } from '../src/mechAdapter.js';
import { createLogger } from '../src/logger.js';

const DEFAULT_KEYFILE = 'C:\\Users\\kidco\\.grey\\keys\\BASE_MECH_PAY_TO.json';
const RPC_URL = process.env.BASE_RPC_URL?.trim() || 'https://mainnet.base.org';

// Real params for Grey's actual registration — see BION-DIRECTIVE-31/32 and config.ts's own doc
// comments on GREY_MECH_CONFIG_HASH/GREY_MECH_PAYLOAD_HASH for how each was derived.
const AGENT_ID = 424242; // matches service 635's real, already-registered agentIds — do not change
const BOND_WEI = 100_000_000_000_000n; // 0.0001 ETH, confirmed by Forces (D-31)
const PAYMENT_TYPE: MechPaymentType = 'NATIVE';
const EXISTING_SERVICE_ID = 635n; // real, already-created service (BION-DIRECTIVE-32) — resume, don't recreate

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

/** Step 3's real pre-flight check (BION-DIRECTIVE-32 revision). Targets the real, already-created
 *  `EXISTING_SERVICE_ID` — NOT a fresh `create()` (D-31 already proved a from-scratch
 *  `create()`-then-`activateRegistration` simulate can't chain against real state; D-32 separately
 *  proved `activateRegistration` DOES simulate cleanly against a real, already-existing service).
 *  Two real, read-only checks: confirm the service is still genuinely there and in the expected
 *  state, then live-simulate `activateRegistration` against it one more time, right now — chain
 *  state can still shift between "last checked" and "actually running this," even for an
 *  already-real service (that's the whole reason D-32 exists in the first place). */
async function preflightCheckExistingService(
  owner: Address,
): Promise<{ state: number; gas: bigint; gasPriceWei: bigint }> {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

  const service = await publicClient.readContract({
    address: SERVICE_REGISTRY_ADDRESSES.serviceRegistryL2,
    abi: SERVICE_REGISTRY_L2_ABI,
    functionName: 'getService',
    args: [EXISTING_SERVICE_ID],
  });
  if (service.state !== SERVICE_STATE.PreRegistration) {
    throw new Error(
      `Service ${EXISTING_SERVICE_ID} is in state ${service.state}, not PreRegistration ` +
        `(${SERVICE_STATE.PreRegistration}) — activateRegistration expects PreRegistration. Someone ` +
        'may have already advanced this service since D-32 last checked. Stop and verify manually ' +
        'before proceeding — do not assume this is safe to retry.',
    );
  }

  const activateArgs = {
    address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy,
    abi: SERVICE_MANAGER_ABI,
    functionName: 'activateRegistration',
    args: [EXISTING_SERVICE_ID],
    value: BOND_WEI,
    account: owner,
  } as const;
  const [, gas, gasPriceWei] = await Promise.all([
    publicClient.simulateContract(activateArgs),
    publicClient.estimateContractGas(activateArgs),
    publicClient.getGasPrice(),
  ]);
  return { state: service.state, gas, gasPriceWei };
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
      existingServiceId: EXISTING_SERVICE_ID, // resume real service 635 — do NOT create a new one
    };

    console.log('\n--- Step 3: live pre-flight check (chain state may have shifted since the last check) ---');
    console.log(`(resuming existing service ${EXISTING_SERVICE_ID} — not creating a new one; see BION-DIRECTIVE-32)`);
    let gas: bigint, gasPriceWei: bigint;
    try {
      ({ gas, gasPriceWei } = await preflightCheckExistingService(account.address));
    } catch (err) {
      console.log('Pre-flight check FAILED — aborting before any confirmation prompt.');
      throw err;
    }
    console.log(`Pre-flight check succeeded — activateRegistration(${EXISTING_SERVICE_ID}) simulates cleanly right now.`);

    const activateGasCostWei = gas * gasPriceWei;
    const totalValueWei = BOND_WEI * 2n; // activateRegistration + registerAgents each require bondWei

    console.log('\n=== FINAL SUMMARY — READ CAREFULLY BEFORE CONFIRMING ===');
    console.log(`Service owner (this wallet):   ${account.address}`);
    console.log(`Resuming service id:           ${EXISTING_SERVICE_ID} (real, already created — not a new service)`);
    console.log(`Agent id:                      ${AGENT_ID}`);
    console.log(`Bond per call:                 ${BOND_WEI} wei (${formatEther(BOND_WEI)} ETH)`);
    console.log(`Total ETH value to be sent:    ${totalValueWei} wei (${formatEther(totalValueWei)} ETH)`);
    console.log('  (bondWei is sent TWICE — activateRegistration AND registerAgents each require it separately)');
    console.log(`configHash:                    ${GREY_MECH_CONFIG_HASH}`);
    console.log(`mechPayload:                   ${GREY_MECH_PAYLOAD_HASH}`);
    console.log(
      `activateRegistration live gas estimate: ${gas} gas @ ${formatEther(gasPriceWei)} ETH/gas ≈ ${formatEther(activateGasCostWei)} ETH`,
    );
    console.log(
      '  (registerAgents/deploy/createMech cannot be gas-estimated until activateRegistration ' +
        'actually lands — Base gas is consistently cheap per D-29/D-30/D-32 live measurements, ' +
        'expect low cents total, but this script does not claim a precise combined figure for what ' +
        'it cannot yet measure)',
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
