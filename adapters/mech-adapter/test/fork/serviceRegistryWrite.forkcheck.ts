// BION-DIRECTIVE-28's fork-test task, extended for Gnosis (BION-DIRECTIVE-97/98 Task 3) — proves
// (or honestly disproves) the ServiceRegistry write-path simulate* calls
// (simulateCreate/simulateActivateRegistration/simulateRegisterAgents/simulateDeploy, as exposed
// by serviceRegistryClient.ts) against a local Hardhat fork of real mainnet state for whichever
// chain `MECH_FORK_CHAIN` (hardhat.config.cts) selected. Same harness, same opt-in posture as the
// sibling e3-b1 file (marketplaceRead.forkcheck.ts) — run via
// `pnpm --filter @grey/mech-adapter test:fork`, never part of `vitest run`.
//
// Calls go straight through viem's `simulateContract` against the ABIs/addresses in
// serviceRegistryAbi.ts/config.ts, the same way the sibling file calls MECH_MARKETPLACE_ABI
// directly rather than going through createMarketplaceClient()/createServiceRegistryClient() —
// both factories bind an `http(rpcUrl)` transport, which can't reach Hardhat's in-process forked
// network; only `custom(hre.network.provider)` can.
//
// The e3-b1 report flagged a KNOWN UNRESOLVED EDR bug on Base (see hardhat.config.cts): every
// `readContract` (eth_call) against forked Base state failed with "No known hardfork for
// execution on historical block ...", even for calls against the current block — only
// `getCode`/`eth_sendTransaction` were unaffected. `simulateContract` also compiles down to
// eth_call, so THIS SUITE MAY HIT THE SAME BUG on either chain — that is an open question this
// file answers by actually attempting the calls, not by assuming either way (D-28 inferred the
// bug is EDR-native rather than Base-specific, but that inference was Base-only evidence; this
// file's real Gnosis run is what actually tests that inference). No test below swallows a
// resulting error into a soft pass; if the bug reproduces, the test fails and stays failing, same
// as the sibling file's already-failing Base tests — left in place undeleted so the failure is a
// real, reproducible artifact for whoever picks this up, not a hidden gap.
import hre from 'hardhat';
import { strict as assert } from 'node:assert';
import { createPublicClient, custom, type Address } from 'viem';
import { CHAINS } from '../../src/config.js';
import { SERVICE_MANAGER_ABI, SERVICE_REGISTRY_L2_ABI } from '../../src/serviceRegistryAbi.js';

const FORK_CHAIN_ID = process.env.MECH_FORK_CHAIN?.trim() === 'gnosis' ? 100 : 8453;
const SERVICE_REGISTRY_ADDRESSES = CHAINS[FORK_CHAIN_ID].serviceRegistry;

// Hardhat's own well-known default local dev account (index 0) — pre-funded 10000 ETH on ANY
// forked network by Hardhat itself, regardless of that account's real balance on the chain being
// forked. Not a secret, not a Grey wallet, not real funds — standard Hardhat/Anvil fixture,
// documented at hardhat.org's default network config. Used only as the simulate `account` (the
// `from` viem needs to predict a call) — no key material, no signing happens in this file.
const HARDHAT_DEFAULT_ACCOUNT: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// A real, low serviceId — Olas's ServiceRegistry assigns ids sequentially from 1, so this almost
// certainly corresponds to an actual, long-since-`deploy()`ed service on Base mainnet. Chosen
// deliberately (not a random/huge number) so that IF eth_call works at all, a revert from
// simulateActivateRegistration/simulateRegisterAgents against it is a genuine "wrong state for
// this call" contract revert (real, honest signal) rather than an ambiguous "id doesn't exist"
// result that reveals nothing about the call path itself.
const REAL_LOW_SERVICE_ID = 1n;

describe(`mech-adapter — ServiceRegistry write path on a chain ${FORK_CHAIN_ID} mainnet fork (BION-DIRECTIVE-28/97/98)`, function () {
  this.timeout(60_000);

  const client = createPublicClient({ transport: custom(hre.network.provider) });

  it('ServiceManagerProxy and ServiceRegistryL2 have real deployed bytecode on the fork (sanity check)', async () => {
    const [managerCode, registryCode] = await Promise.all([
      client.getCode({ address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy }),
      client.getCode({ address: SERVICE_REGISTRY_ADDRESSES.serviceRegistryL2 }),
    ]);
    assert.ok(managerCode && managerCode !== '0x', 'expected non-empty bytecode at ServiceManagerProxy');
    assert.ok(registryCode && registryCode !== '0x', 'expected non-empty bytecode at ServiceRegistryL2');
  });

  it('getService(1) against real forked state — proves whether eth_call works here at all', async () => {
    const service = await client.readContract({
      address: SERVICE_REGISTRY_ADDRESSES.serviceRegistryL2,
      abi: SERVICE_REGISTRY_L2_ABI,
      functionName: 'getService',
      args: [REAL_LOW_SERVICE_ID],
    });
    console.log(`[fork] getService(${REAL_LOW_SERVICE_ID}) state = ${service.state}, multisig = ${service.multisig}`);
    assert.equal(typeof service.state, 'number');
  });

  it('simulateCreate — simulateContract("create") with fresh, never-before-used inputs', async () => {
    const { result } = await client.simulateContract({
      address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy,
      abi: SERVICE_MANAGER_ABI,
      functionName: 'create',
      args: [
        HARDHAT_DEFAULT_ACCOUNT,
        '0x0000000000000000000000000000000000000000',
        `0x${'11'.repeat(32)}`,
        [999999],
        [{ slots: 1, bond: 1n }],
        1,
      ],
      account: HARDHAT_DEFAULT_ACCOUNT,
    });
    console.log(`[fork] simulateContract("create") predicted serviceId = ${result}`);
    assert.equal(typeof result, 'bigint');
  });

  it('simulateActivateRegistration against a real, already-deployed serviceId — records real observed behavior', async () => {
    const { result } = await client.simulateContract({
      address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy,
      abi: SERVICE_MANAGER_ABI,
      functionName: 'activateRegistration',
      args: [REAL_LOW_SERVICE_ID],
      value: 1n,
      account: HARDHAT_DEFAULT_ACCOUNT,
    });
    console.log(`[fork] simulateContract("activateRegistration", ${REAL_LOW_SERVICE_ID}) = ${result}`);
    assert.equal(typeof result, 'boolean');
  });

  it('simulateRegisterAgents against a real, already-deployed serviceId — records real observed behavior', async () => {
    const { result } = await client.simulateContract({
      address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy,
      abi: SERVICE_MANAGER_ABI,
      functionName: 'registerAgents',
      args: [REAL_LOW_SERVICE_ID, [HARDHAT_DEFAULT_ACCOUNT], [999999]],
      value: 1n,
      account: HARDHAT_DEFAULT_ACCOUNT,
    });
    console.log(`[fork] simulateContract("registerAgents", ${REAL_LOW_SERVICE_ID}) = ${result}`);
    assert.equal(typeof result, 'boolean');
  });

  it('simulateDeploy against a real, already-deployed serviceId — records real observed behavior', async () => {
    const { result } = await client.simulateContract({
      address: SERVICE_REGISTRY_ADDRESSES.serviceManagerProxy,
      abi: SERVICE_MANAGER_ABI,
      functionName: 'deploy',
      args: [REAL_LOW_SERVICE_ID, SERVICE_REGISTRY_ADDRESSES.gnosisSafeMultisig, '0x'],
      account: HARDHAT_DEFAULT_ACCOUNT,
    });
    console.log(`[fork] simulateContract("deploy", ${REAL_LOW_SERVICE_ID}) multisig = ${result}`);
    assert.match(result, /^0x[0-9a-fA-F]{40}$/);
  });
});
