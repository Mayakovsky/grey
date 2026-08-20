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
// UPDATED (BION-DIRECTIVE-32): the first real run's create() genuinely succeeded — real service
// 635 already exists, real, correctly configured. This script targets `existingServiceId: 635n` —
// do NOT let it create a second service.
//
// UPDATED (BION-DIRECTIVE-34): this script now runs exactly ONE real step per invocation, not the
// whole remaining chain. It calls `MechAdapter.registerAsMechStep` — the exact same production
// method — TWICE: once with `observeOnly: true` as the pre-flight check (so the pre-flight is
// never a hand-built approximation of the real call; D-33's own lesson was "proving a function
// works isn't proving the caller reaches it," so this script no longer has its own separate
// pre-flight logic to drift out of sync with the real path), and once for real after
// confirmation. Whatever step is next for the service's real current state is what runs — could
// be `activateRegistration`, `registerAgents`, `deploy`, or `createMech`. Run this script again
// after each real step lands to execute the next one.
//
// FIXED (BION-DIRECTIVE-103): D-101's `--chain gnosis` support hardcoded `EXISTING_SERVICE_ID =
// undefined` for any non-Base chain, with no way to carry a discovered serviceId across process
// restarts. Real, live consequence: Forces' terminal closed between two runs, the script forgot
// serviceId 3789 (real, confirmed `create()`, tx `0xb780b849...`), and created a second, orphaned
// service 3790 (tx `0x8c6d25b0...`) instead of resuming. Fixed via `registrationResume.ts`'s
// `resolveExistingServiceId` — a real `--service-id <n>` flag (validated against `getService`
// before trusting it), plus a `balanceOf`-based safety check when no default/flag is given (real,
// live-confirmed: `ServiceRegistryL2` supports `balanceOf` but NOT owner-indexed enumeration —
// `tokenOfOwnerByIndex` reverts — so this can only report a COUNT, not recover which id(s), which
// is exactly why the flag is still required to actually resume; the count check exists only to
// abort a silent duplicate `create()`, not to replace the flag). Base's behavior is completely
// unchanged: hardcoded default `635n` still wins whenever no `--service-id` is passed.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { createPublicClient, formatEther, http, parseAbi, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseKeystore } from '@grey/ceremony/dist/crypto/index.js';
import { unlockKeystore } from '@grey/ceremony/dist/commands/address.js';
import { promptPassphrase } from '@grey/ceremony/dist/prompt/index.js';
import { zero } from '@grey/ceremony/dist/memory/index.js';
import {
  BASE_MECH_AGENT_INSTANCE_ADDRESS,
  BASE_MECH_PAY_TO_ADDRESS,
  BASE_MECH_POOL_WALLET_ADDRESS,
  GREY_MECH_CONFIG_HASH,
  GREY_MECH_PAYLOAD_HASH,
  CHAINS,
  type MechAdapterConfig,
  type MechPaymentType,
  type SupportedChainId,
} from '../src/config.js';
import { createMarketplaceClient } from '../src/marketplaceClient.js';
import { createServiceRegistryClient } from '../src/serviceRegistryClient.js';
import { resolveExistingServiceId } from '../src/registrationResume.js';
import { MechAdapter, type ServiceRegistrationParams, type SingleStepResult } from '../src/mechAdapter.js';
import { createLogger } from '../src/logger.js';

const DEFAULT_KEYFILE = 'C:\\Users\\kidco\\.grey\\keys\\BASE_MECH_PAY_TO.json';

/** `--chain` (BION-DIRECTIVE-101) selects which chain this run targets — defaults to `base`,
 *  reproducing this script's exact prior behavior when omitted (every real run so far). `gnosis`
 *  points the RPC/chain id at Gnosis mainnet via the same `CHAINS` map D-97/98 built; the
 *  passphrase-gated signing path below is completely untouched either way — this only changes
 *  which chain's RPC/contracts the resulting signed calls go to. Same wallet (`BASE_MECH_PAY_TO`)
 *  is reused on both chains (D-77's decision), so the same keystore file/passphrase works for
 *  either `--chain` value without a new key ceremony. */
const CHAIN_ID: SupportedChainId = process.argv.includes('--chain')
  ? process.argv[process.argv.indexOf('--chain') + 1] === 'gnosis'
    ? 100
    : 8453
  : 8453;
const RPC_ENV_VAR = CHAIN_ID === 100 ? 'GNOSIS_RPC_URL' : 'BASE_RPC_URL';
const RPC_URL = process.env[RPC_ENV_VAR]?.trim() || CHAINS[CHAIN_ID].defaultRpcUrl;

// Real params for Grey's actual registration — see BION-DIRECTIVE-31/32 and config.ts's own doc
// comments on GREY_MECH_CONFIG_HASH/GREY_MECH_PAYLOAD_HASH for how each was derived. Reused as-is
// for Gnosis per BION-DIRECTIVE-101 §1 (Forces' explicit call — GREY_DID is a single cross-chain
// identity anchor by design; the on-chain configHash gets updated as a normal follow-up once
// e3-g2 defines Gnosis's own real offering set, not a blocker to registering now).
const AGENT_ID = 424242; // matches service 635's real, already-registered agentIds on Base — reused on Gnosis too, not chain-specific
const BOND_WEI = 100_000_000_000_000n; // 0.0001 ETH/xDAI-equivalent, confirmed by Forces (D-31 on Base; D-97/98/100 re-confirmed as the right figure to reuse on Gnosis)
const PAYMENT_TYPE: MechPaymentType = 'NATIVE';
// Base only — real, already-created service (BION-DIRECTIVE-32), unchanged hardcoded default.
// Gnosis (and any other future chain) has no such default — see resolveExistingServiceId's real
// decision logic below (BION-DIRECTIVE-103), which replaces the old bare `undefined` literal that
// caused the real 3789/3790 duplicate.
const HARDCODED_DEFAULT_SERVICE_ID: bigint | undefined = CHAIN_ID === 8453 ? 635n : undefined;

// Minimal read-only ABI for the two calls resolveExistingServiceId needs — deliberately not
// importing SERVICE_REGISTRY_L2_ABI's full surface here, since balanceOf/getService are the only
// two this script's own resume-decision logic needs directly (registerAsMechStep's own internal
// getService call, inside MechAdapter, is separate and unaffected by this).
const RESUME_CHECK_ABI = parseAbi([
  'function getService(uint256 serviceId) view returns ((uint96 securityDeposit, address multisig, bytes32 configHash, uint32 threshold, uint32 maxNumAgentInstances, uint32 numAgentInstances, uint8 state, uint32[] agentIds) service)',
  'function balanceOf(address owner) view returns (uint256)',
]);

// Steps that require sending BOND_WEI as msg.value (real Olas ServiceRegistry semantics —
// activateRegistration's service-level deposit and registerAgents' per-instance operator bond
// are separate payable calls, each requiring the full bond again). deploy/createMech/create send
// no value.
const VALUE_BEARING_STEPS: ReadonlySet<SingleStepResult['step']> = new Set(['activateRegistration', 'registerAgents']);

function parseArgs(argv: string[]): { keyfile: string; serviceIdFlag: bigint | undefined; forceCreateNewService: boolean } {
  const idx = argv.indexOf('--keyfile');
  const keyfile = idx !== -1 && argv[idx + 1] ? argv[idx + 1] : DEFAULT_KEYFILE;
  const serviceIdIdx = argv.indexOf('--service-id');
  const serviceIdRaw = serviceIdIdx !== -1 ? argv[serviceIdIdx + 1] : undefined;
  if (serviceIdIdx !== -1 && (serviceIdRaw === undefined || !/^\d+$/.test(serviceIdRaw))) {
    throw new Error(`--service-id requires a plain non-negative integer, got "${serviceIdRaw}"`);
  }
  const serviceIdFlag = serviceIdRaw !== undefined ? BigInt(serviceIdRaw) : undefined;
  const forceCreateNewService = argv.includes('--force-create-new-service');
  return { keyfile, serviceIdFlag, forceCreateNewService };
}

async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(prompt, resolve));
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { keyfile, serviceIdFlag, forceCreateNewService } = parseArgs(process.argv.slice(2));

  // BION-DIRECTIVE-103 — resolve which service this run targets BEFORE prompting for the real
  // passphrase, using only public, read-only calls (no key material needed: the owner address,
  // BASE_MECH_PAY_TO_ADDRESS, is already a known constant). Fails fast on an abort — Forces
  // doesn't have to type a real passphrase only to hit a refusal afterward.
  const readOnlyClient = createPublicClient({ chain: CHAINS[CHAIN_ID].viemChain, transport: http(RPC_URL) });
  const decision = await resolveExistingServiceId({
    hardcodedDefaultServiceId: HARDCODED_DEFAULT_SERVICE_ID,
    serviceIdFlag,
    forceCreateNewService,
    getService: (serviceId) =>
      readOnlyClient.readContract({
        address: CHAINS[CHAIN_ID].serviceRegistry.serviceRegistryL2,
        abi: RESUME_CHECK_ABI,
        functionName: 'getService',
        args: [serviceId],
      }),
    getOwnedServiceCount: () =>
      readOnlyClient.readContract({
        address: CHAINS[CHAIN_ID].serviceRegistry.serviceRegistryL2,
        abi: RESUME_CHECK_ABI,
        functionName: 'balanceOf',
        args: [BASE_MECH_PAY_TO_ADDRESS],
      }),
  });
  if (decision.mode === 'abort') {
    console.log(`\nABORTED before any passphrase prompt — ${decision.reason}`);
    process.exitCode = 1;
    return;
  }
  const existingServiceId = decision.mode === 'resume' ? decision.serviceId : undefined;

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
      databaseUrl: 'unused-by-this-script', // registerAsMechStep never reads this field
      observeOnly: true, // pre-flight step-simulate first; flipped to false only after confirmation
      // BION-DIRECTIVE-35 — MUST be different from payToAddress (real ServiceRegistryL2 rule,
      // reverts WrongOperator otherwise). See config.ts's BASE_MECH_AGENT_INSTANCE_ADDRESS.
      agentInstanceAddress: BASE_MECH_AGENT_INSTANCE_ADDRESS,
    };

    const serviceRegistryClient = createServiceRegistryClient(RPC_URL, account, CHAIN_ID);
    const marketplaceClient = createMarketplaceClient(RPC_URL, account, CHAIN_ID);
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
      existingServiceId, // resolved above (BION-DIRECTIVE-103) — resume, or undefined only after a real, checked "no existing service" verdict
    };

    console.log('\n--- Step 3: live pre-flight check — which real step is next, and does it simulate cleanly right now ---');
    let preflight: SingleStepResult;
    try {
      preflight = await adapter.registerAsMechStep(PAYMENT_TYPE, params);
    } catch (err) {
      console.log('Pre-flight check FAILED — aborting before any confirmation prompt.');
      throw err;
    }
    console.log(
      `Pre-flight check succeeded — real current state is ${preflight.stateBefore}; the next real ` +
        `step is "${preflight.step}", and it simulates cleanly right now.`,
    );

    const valueWei = VALUE_BEARING_STEPS.has(preflight.step) ? BOND_WEI : 0n;

    console.log('\n=== FINAL SUMMARY — READ CAREFULLY BEFORE CONFIRMING ===');
    console.log(`Chain:                           ${CHAIN_ID === 100 ? 'Gnosis' : 'Base'} (chain id ${CHAIN_ID})`);
    console.log(`Service owner (this wallet):     ${account.address}`);
    // BION-DIRECTIVE-103 §1.3 — made impossible to miss (this exact line was visible, but not
    // distinct enough, in both the 3789 and the accidental 3790 run's transcripts).
    console.log(
      existingServiceId !== undefined
        ? `>>> RESUMING service ${existingServiceId} <<<`
        : '>>> CREATING A NEW SERVICE — no existing service specified, none found via balanceOf <<<',
    );
    console.log(`Real state before this run:      ${preflight.stateBefore}`);
    console.log(`>>> Step this run will execute:  ${preflight.step} <<<`);
    console.log(`Agent id:                        ${AGENT_ID}`);
    if (preflight.step === 'registerAgents') {
      console.log(`Agent instance address:          ${BASE_MECH_AGENT_INSTANCE_ADDRESS} (BION-DIRECTIVE-35 — distinct from the service owner, required by the protocol)`);
    }
    console.log(`ETH value this step will send:   ${valueWei} wei (${formatEther(valueWei)} ETH)`);
    if (valueWei > 0n) {
      console.log('  (the confirmed bond amount, sent once for this one step only — not a running total across other steps)');
    } else {
      console.log('  (this step does not send any ETH value)');
    }
    console.log(`configHash:                       ${GREY_MECH_CONFIG_HASH}`);
    console.log(`mechPayload:                      ${GREY_MECH_PAYLOAD_HASH}`);
    console.log(
      CHAIN_ID === 100
        ? 'Gas: not independently measured live on Gnosis by this script — xDAI gas is typically ' +
            'very cheap (sub-cent), but this has not been confirmed the way Base\'s was (D-29/D-30/D-32).'
        : 'Gas: Base gas is consistently cheap (sub-cent to a few cents per D-29/D-30/D-32 live ' +
            'measurements) — this script does not compute a fresh gas estimate for this specific step.',
    );
    console.log(
      `\nThis will submit ONE real transaction on ${CHAIN_ID === 100 ? 'Gnosis' : 'Base'} mainnet ` +
        `(step: ${preflight.step}) with real funds. This cannot be undone. Any remaining steps need ` +
        'a SEPARATE run of this script after this one lands.',
    );

    const typed = await askLine('\nType REGISTER (all caps) to proceed, anything else to abort: ');
    if (typed !== 'REGISTER') {
      console.log('Aborted — no transaction submitted.');
      return;
    }

    console.log(`\n--- Executing "${preflight.step}" for real (observeOnly = false) ---`);
    config.observeOnly = false;
    try {
      const result = await adapter.registerAsMechStep(PAYMENT_TYPE, params);
      console.log('\n=== SUCCESS ===');
      console.log(`step run:  ${result.step}`);
      console.log(`serviceId: ${result.serviceId.toString()}`);
      if (result.multisig) console.log(`multisig:  ${result.multisig}`);
      if (result.mech) console.log(`mech:      ${result.mech}`);
      console.log('\nIf any steps remain, run this script again to execute the next one.');
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
