// @grey/sweeper — on-demand gas-balance visibility check (E2-BE scope cut: no automated
// refuel for Kite this phase, manual top-up instead). NOT a systemd service, NOT scheduled —
// run by hand (or from a human's own cron/alias) when someone wants to know whether a
// sweeper's agent wallet needs a manual native-gas top-up. Reuses the same env file as the
// sweeper service it checks (same GREY_SWEEPER_* vars), so it's always checking the wallet
// that actually needs the gas — the one that signs the sweep broadcast.
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, defineChain } from 'viem';
import { loadConfig } from './config.js';
import { loadAgentAccount } from './wallet.js';
import { checkGasBalance, formatGasBalanceCheck } from './gasBalance.js';

function requiredBigint(env: Record<string, string | undefined>, key: string): bigint {
  const raw = env[key];
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) {
    throw new Error(`grey-sweeper: checkGas requires ${key} as a non-negative integer (wei)`);
  }
  return BigInt(raw);
}

async function main(): Promise<void> {
  const config = loadConfig(); // same env file/fail-closed discipline as the sweeper service
  const floorWei = requiredBigint(process.env, 'GREY_SWEEPER_GAS_FLOOR_WEI');
  const account = loadAgentAccount(config.agentWalletPrivateKey);
  const chain = defineChain({
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: 'native', symbol: 'NATIVE', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  const result = await checkGasBalance(publicClient, account.address, floorWei);
  process.stdout.write(`${formatGasBalanceCheck(result)}\n`);
  process.exit(result.status === 'below_floor' ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`grey-sweeper: checkGas failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
}
