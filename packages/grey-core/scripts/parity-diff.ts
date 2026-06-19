// Dev-only parity-diff harness (M3.5 §10.2 + §18 scope) — NOT in CI. Captured-reference only
// (FDQ-5: no live cross-repo plugin-wpv invocation; plugin-wpv source untouched).
//
// Three coverage tiers (§18):
//   legitimacy_scan      → field-level numeric divergence vs seed_results.json (24 BNB tokens):
//                          structuralScore + hypeTechRatio (abs + % delta), micaCompliant (exact).
//                          L1 is non-LLM, so these grey-live runs cost no Anthropic spend.
//   verify_whitepaper /  → STRUCTURAL SHAPE match only (no captured numeric reference exists):
//   verify_full_tech /     payload validates against the M2.5 response schema; expected fields
//   claim_extraction       present; no type mismatches. Reads the latest smoke-run output per
//                          offering (avoids re-spending LLM $); numeric divergence DEFERRED to a
//                          curated capture pass before M5 (see PARITY-DIFF.md M5 callout).
//
// Usage: pnpm -F @grey/core parity-diff -- [--env <env-file>] [--out <results.json>] [--limit N]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHandlerDeps } from '../src/deps';
import { offeringHandlers } from '../src/handlers';
import { offeringValidators } from '@grey/schemas/validators';
import type { OfferingSlug } from '@grey/schemas/responses';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ELIZA = resolve(import.meta.dirname, '../../../../eliza/plugin-wpv');
const SEED_PATH = join(ELIZA, 'scripts', 'seed_results.json');
const SMOKE_DIR = join(ELIZA, 'BUILD DOCS and DATA', 'movement-3.5-smoke-runs');
const STRUCTURAL_OFFERINGS: OfferingSlug[] = ['verify_whitepaper', 'verify_full_tech', 'claim_extraction'];

interface SeedRow {
  name: string;
  address: string;
  structuralScore: number;
  hypeTechRatio: number;
  micaCompliant: string;
}

const pct = (greyV: number, refV: number): number | null =>
  refV === 0 ? (greyV === 0 ? 0 : null) : Math.abs((greyV - refV) / refV) * 100;

async function legitimacyParity(deps: ReturnType<typeof createHandlerDeps>, limit: number): Promise<unknown> {
  const seed: SeedRow[] = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const rows = seed.slice(0, limit);
  const perToken: Array<Record<string, unknown>> = [];
  for (const ref of rows) {
    try {
      const res = await offeringHandlers.legitimacy_scan(
        { offeringId: 'legitimacy_scan', requirement: { token_address: ref.address, project_name: ref.name } },
        deps,
      );
      const p = res.payload as { structuralScore?: number; hypeTechRatio?: number; micaCompliant?: string };
      const gScore = p.structuralScore ?? 0;
      const gHype = p.hypeTechRatio ?? 0;
      perToken.push({
        name: ref.name,
        address: ref.address,
        structuralScore: { grey: gScore, ref: ref.structuralScore, abs: Math.abs(gScore - ref.structuralScore), pct: pct(gScore, ref.structuralScore) },
        hypeTechRatio: { grey: gHype, ref: ref.hypeTechRatio, abs: Math.abs(gHype - ref.hypeTechRatio), pct: pct(gHype, ref.hypeTechRatio) },
        micaCompliant: { grey: p.micaCompliant ?? null, ref: ref.micaCompliant, match: (p.micaCompliant ?? null) === ref.micaCompliant },
      });
    } catch (e) {
      perToken.push({ name: ref.name, address: ref.address, error: (e as Error).message });
    }
  }
  const ok = perToken.filter((t) => !t.error);
  const absList = (field: string): number[] => ok.map((t) => (t[field] as { abs: number }).abs);
  const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const max = (xs: number[]): number => (xs.length ? Math.max(...xs) : 0);
  const micaMatches = ok.filter((t) => (t.micaCompliant as { match: boolean }).match).length;
  return {
    tokensAttempted: rows.length,
    tokensCompleted: ok.length,
    tokensErrored: perToken.length - ok.length,
    structuralScore: { meanAbs: mean(absList('structuralScore')), maxAbs: max(absList('structuralScore')) },
    hypeTechRatio: { meanAbs: mean(absList('hypeTechRatio')), maxAbs: max(absList('hypeTechRatio')) },
    micaCompliantAgreementPct: ok.length ? (micaMatches / ok.length) * 100 : 0,
    perToken,
  };
}

function latestSmokePayload(offering: string): { payload: unknown; file: string } | null {
  if (!existsSync(SMOKE_DIR)) return null;
  const files = readdirSync(SMOKE_DIR).filter((f) => f.endsWith(`-${offering}.json`)).sort();
  if (!files.length) return null;
  const file = files[files.length - 1];
  const rec = JSON.parse(readFileSync(join(SMOKE_DIR, file), 'utf8')) as { output?: unknown };
  return { payload: rec.output ?? null, file };
}

function structuralCheck(offering: OfferingSlug): Record<string, unknown> {
  const smoke = latestSmokePayload(offering);
  if (!smoke || smoke.payload == null) {
    return { offering, status: 'NO_SMOKE_OUTPUT', note: 'run the smoke first' };
  }
  const validator = offeringValidators[offering];
  const valid = validator(smoke.payload);
  return {
    offering,
    sourceSmokeFile: smoke.file,
    schemaValid: valid,
    schemaErrors: valid ? null : validator.errors,
    fieldCount: Object.keys(smoke.payload as Record<string, unknown>).length,
    fields: Object.keys(smoke.payload as Record<string, unknown>).sort(),
  };
}

async function main(): Promise<void> {
  const envFile = arg('env') ?? join(import.meta.dirname, '../../../.env');
  const limit = arg('limit') ? Number(arg('limit')) : 24;
  const out = arg('out') ?? join(SMOKE_DIR, 'parity-diff-results.json');
  if (existsSync(resolve(envFile))) process.loadEnvFile(resolve(envFile));
  if (!process.env.GREY_DATABASE_URL) throw new Error('GREY_DATABASE_URL must be set');

  const deps = createHandlerDeps();
  const legitimacy = await legitimacyParity(deps, limit);
  const structural = STRUCTURAL_OFFERINGS.map(structuralCheck);

  const results = { generatedAt: new Date().toISOString(), model: process.env.GREY_MODEL ?? 'claude-sonnet-4-6', legitimacy, structural };
  writeFileSync(resolve(out), JSON.stringify(results, null, 2));
  console.log(`[parity-diff] legitimacy ${(legitimacy as { tokensCompleted: number }).tokensCompleted}/${(legitimacy as { tokensAttempted: number }).tokensAttempted} tokens; structural ${structural.length} offerings → ${out}`);
  console.log(JSON.stringify({ legitimacySummary: { ...(legitimacy as Record<string, unknown>), perToken: undefined }, structural }, null, 2));
}

// Force exit (open postgres pool / discovery resources keep the loop alive after the one-shot run).
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('[parity-diff] fatal:', (e as Error).message);
    process.exit(1);
  });
