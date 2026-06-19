// Dev-only smoke harness (M3.5 §2.7) — NOT in CI. Drives one compute offering through the full
// grey-core path (handler → cacheOrLive → live discovery + pipeline) against the REAL DB
// (GREY_DATABASE_URL) + REAL Anthropic (ANTHROPIC_API_KEY). Records input / model / output / cost /
// latency to a gitignored smoke-runs dir (cost data; reference-only). One invocation = one job.
//
// Usage:
//   pnpm -F @grey/core smoke -- --offering <slug> --input <fixture.json> [--env <env-file>] [--out <dir>]
//
// Per-request bound matches production JobRouter (PIPELINE_TIMEOUT_MS = 240_000, 4 min).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHandlerDeps } from '../src/deps';
import { offeringHandlers } from '../src/handlers';
import type { OfferingSlug } from '@grey/schemas/responses';

const COMPUTE_OFFERINGS = ['legitimacy_scan', 'verify_whitepaper', 'verify_full_tech', 'claim_extraction'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const DEFAULT_OUT = resolve(
  import.meta.dirname,
  '../../../../eliza/plugin-wpv/BUILD DOCS and DATA/movement-3.5-smoke-runs',
);

async function main(): Promise<void> {
  const offering = arg('offering');
  const inputPath = arg('input');
  const envFile = arg('env');
  const outDir = arg('out') ?? DEFAULT_OUT;

  if (!offering || !inputPath) {
    throw new Error('usage: smoke --offering <slug> --input <fixture.json> [--env <file>] [--out <dir>]');
  }
  if (!COMPUTE_OFFERINGS.includes(offering)) {
    throw new Error(`--offering must be one of: ${COMPUTE_OFFERINGS.join(', ')}`);
  }
  if (envFile) process.loadEnvFile(resolve(envFile));
  if (!process.env.GREY_DATABASE_URL || !process.env.ANTHROPIC_API_KEY) {
    throw new Error('GREY_DATABASE_URL + ANTHROPIC_API_KEY must be set (pass --env or export them)');
  }

  const requirement: unknown = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
  const deps = createHandlerDeps();
  const model = process.env.GREY_MODEL ?? 'claude-sonnet-4-6';

  const started = new Date();
  const t0 = performance.now();
  let payload: unknown = null;
  let cacheHit: boolean | null = null;
  let error: string | null = null;
  try {
    const result = await offeringHandlers[offering as OfferingSlug](
      { offeringId: offering, requirement },
      deps,
    );
    payload = result.payload;
    cacheHit = result.cacheHit;
  } catch (e) {
    error = (e as Error).message;
  }
  const latencyMs = Math.round(performance.now() - t0);

  // Cost (best-effort): the just-written verification row (grey_two is otherwise empty during smoke).
  // claim_extraction writes no verification row → cost stays null (read its payload if needed).
  let costUsd: number | null = null;
  let stageCostUsd: { l2: number | null; l3: number | null } | null = null;
  try {
    const recent = await deps.verifications.getMostRecent(1);
    if (recent[0]) {
      costUsd = recent[0].computeCostUsd ?? null;
      stageCostUsd = {
        l2: (recent[0] as { l2CostUsd?: number | null }).l2CostUsd ?? null,
        l3: (recent[0] as { l3CostUsd?: number | null }).l3CostUsd ?? null,
      };
    }
  } catch {
    /* cost read is best-effort */
  }

  const record = {
    timestamp: started.toISOString(),
    offering,
    model,
    input: requirement,
    cacheHit,
    error,
    latencyMs,
    costUsd,
    stageCostUsd,
    output: payload,
  };

  mkdirSync(outDir, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  const outPath = join(outDir, `${stamp}-${offering}.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2));

  console.log(
    `[smoke] ${offering} — ${error ? `ERROR: ${error}` : 'ok'} · latency ${latencyMs}ms · cost ${costUsd ?? 'n/a'} USD · cacheHit ${cacheHit} → ${outPath}`,
  );
  if (error) process.exitCode = 1;
}

// Force exit: createHandlerDeps opens a postgres pool (+ the discovery stack holds resources) that
// keep the event loop alive after the one-shot job completes, so node won't self-terminate.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('[smoke] fatal:', (e as Error).message);
    process.exit(1);
  });
