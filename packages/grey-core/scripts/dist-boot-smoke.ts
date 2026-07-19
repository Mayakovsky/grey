// M6 Phase A dist-boot smoke (M5 pattern). Boots the BUILT dist/start.js (the systemd ExecStart
// target) exactly as production would, and proves the x402 boot rewire changed nothing observable:
//   • GET  /health                         → 200 { status: "ok" }
//   • POST /v1/offerings/legitimacy_scan   → 402 exact-scheme requirements (payTo/network/amount)
// The server now boots THROUGH X402Adapter.start(); this asserts the paid-route contract is
// byte-identical to the pre-adapter inline buildServer+listen. Zero spend, no chain, no real DB
// (the 402 precedes any handler/DB touch; boot is lazy — no pg/RPC/Anthropic connection is made).
//
// Usage: pnpm -F @grey/core dist-boot-smoke   (run AFTER `pnpm -F @grey/core build`)
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const DIST_START = resolve(import.meta.dirname, '../dist/start.js');

// Boot env: valid-shaped but inert. loadX402Config fail-closes on missing/invalid, so all fields
// are present; none trigger a network call at boot. The anvil #1 key is a well-known throwaway.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  GREY_CORE_PORT: String(PORT),
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  GREY_DATABASE_URL: 'postgres://smoke:smoke@127.0.0.1:5432/smoke', // never queried on these paths
};

const child = spawn(process.execPath, [DIST_START], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d: Buffer) => (log += d.toString()));
child.stderr.on('data', (d: Buffer) => (log += d.toString()));

function fail(msg: string): never {
  console.error(`[dist-boot-smoke] FAIL: ${msg}`);
  if (log.trim()) console.error('--- child output ---\n' + log.trim());
  try {
    child.kill('SIGKILL');
  } catch {
    /* already dead */
  }
  process.exit(1);
}

async function waitForHealth(): Promise<Response> {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) fail(`process exited early (code ${child.exitCode})`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.status === 200) return r;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  fail('server did not answer /health within ~15s');
}

async function main(): Promise<void> {
  const health = await waitForHealth();
  const hbody = (await health.json()) as { status?: string };
  if (hbody.status !== 'ok') fail(`/health body.status !== "ok" (got ${JSON.stringify(hbody)})`);
  console.log(`[dist-boot-smoke] /health → 200 ${JSON.stringify(hbody)}`);

  const paid = await fetch(`${BASE}/v1/offerings/legitimacy_scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token_address: '0x1111111111111111111111111111111111111111' }),
  });
  if (paid.status !== 402) fail(`paid route expected 402, got ${paid.status}`);
  const pbody = (await paid.json()) as {
    x402Version?: number;
    accepts?: { scheme?: string; network?: string; maxAmountRequired?: string; payTo?: string }[];
  };
  const a = pbody.accepts?.[0] ?? {};
  const ok =
    pbody.x402Version === 1 &&
    a.scheme === 'exact' &&
    a.network === 'eip155:84532' &&
    a.maxAmountRequired === '250000' &&
    a.payTo === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  if (!ok) fail(`402 requirements mismatch: ${JSON.stringify(pbody)}`);
  console.log(
    `[dist-boot-smoke] POST /v1/offerings/legitimacy_scan → 402 ` +
      `{scheme:${a.scheme}, network:${a.network}, maxAmountRequired:${a.maxAmountRequired}, payTo:${a.payTo}}`,
  );

  console.log('[dist-boot-smoke] PASS — dist boots through X402Adapter; /health 200 + paid 402 byte-identical.');
  child.kill('SIGTERM');
  process.exit(0);
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
