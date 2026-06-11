// grey-pipeline — Phase D smoke harness (Movement 1 Step 2).
//
// NOT a unit test (non-`.test.ts` name → excluded from `pnpm test`/CI). Invoked
// manually via tsx against the LIVE grey_two schema + Anthropic API. Fetches a
// docs/whitepaper URL, strips it to text, optionally augments via DocsSiteCrawler
// (the ported crawler — exercised when the URL is a docs.* site), runs the full
// L1→L2→L3→synthesis pipeline, persists to grey_two, and prints a CONTENT-FREE
// summary (verdict/scores/counts/cost only — no claim text, no prompts).
//
// Usage:
//   tsx scripts/smoke.ts --url <url> [--project <name>] [--max-cost <usd>] [--no-crawl]
//
// Env required (injected by the caller; never read from disk here):
//   GREY_DATABASE_URL  — grey_pipeline_rw scoped role (runtime credential)
//   ANTHROPIC_API_KEY  — live API key
//   GREY_MODEL         — optional model override (defaults to GREY_MODEL constant)

import { runFullPipeline } from '../src/pipeline';
import { createDeps } from '../src/deps';
import { DocsSiteCrawler } from '../src/crawler/docsSiteCrawler';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// Local HTML→text strip (mirrors the crawler's private stripHtml; the harness needs
// the landing-page text up front to feed the crawler and as the fallback).
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main(): Promise<void> {
  const url = arg('url');
  if (!url) {
    console.error('ERROR: --url is required');
    process.exit(2);
  }
  const projectName =
    arg('project') ?? new URL(url).hostname.replace(/^docs\./, '').split('.')[0];
  const maxCostStr = arg('max-cost');
  const maxCost = maxCostStr ? Number(maxCostStr) : Infinity;

  for (const v of ['GREY_DATABASE_URL', 'ANTHROPIC_API_KEY']) {
    if (!process.env[v]) {
      console.error(`ERROR: ${v} not present in environment`);
      process.exit(2);
    }
  }

  console.log(
    `[smoke] project="${projectName}" model=${process.env.GREY_MODEL ?? '(default GREY_MODEL)'}`,
  );
  console.log('[smoke] fetching landing page...');
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WhitepaperGrey/1.0 (whitepaper-verification)',
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    console.error(`ERROR: landing fetch HTTP ${res.status}`);
    process.exit(1);
  }
  const landingText = stripHtml(await res.text());
  console.log(`[smoke] landing text: ${landingText.length} chars`);

  let text = landingText;
  if (!hasFlag('no-crawl') && DocsSiteCrawler.isDocsSiteUrl(url)) {
    console.log('[smoke] docs.* URL — attempting sub-page crawl...');
    const crawler = new DocsSiteCrawler();
    const crawled = await crawler.crawl(url, landingText);
    if (crawled && crawled.text.length > landingText.length) {
      text = crawled.text;
      console.log(
        `[smoke] crawl augmented → ${text.length} chars (${crawled.diagnostics?.join('; ') ?? ''})`,
      );
    } else {
      console.log('[smoke] crawl added nothing — using landing text only');
    }
  }

  if (text.length < 200) {
    console.error(`ERROR: resolved text too thin (${text.length} chars)`);
    process.exit(1);
  }

  const deps = createDeps();
  console.log('[smoke] running full pipeline (LIVE Anthropic + grey_two writes)...');
  let report;
  try {
    report = await runFullPipeline(
      { projectName, text, documentUrl: url, chain: 'base', offering: 'verify_full_tech' },
      deps,
    );
  } catch (err) {
    console.error(`[smoke] pipeline threw: ${(err as Error).message}`);
    console.error(`[smoke] cost incurred before failure: $${deps.cost.getTotalCostUsd().toFixed(4)}`);
    process.exit(1);
  }

  const cost = deps.cost.getTotalCostUsd();
  const tok = deps.cost.getTotalTokens();

  console.log('\n===== SMOKE RESULT (content-free) =====');
  console.log(
    JSON.stringify(
      {
        projectName: report.projectName,
        verdict: report.verdict,
        confidenceScore: report.confidenceScore,
        structuralScore: report.structuralScore,
        hypeTechRatio: Number(report.hypeTechRatio.toFixed(3)),
        claimCount: report.claimCount,
        claimsExtracted: report.claims?.length ?? 0,
        evaluations: report.evaluations?.length ?? 0,
        focusAreaScores: report.focusAreaScores,
        claimsMicaCompliance: report.claimsMicaCompliance,
        micaCompliant: report.micaCompliant,
        llmTokensUsed: report.llmTokensUsed,
        tokens: { input: tok.input, output: tok.output },
        computeCostUsd: Number(cost.toFixed(6)),
      },
      null,
      2,
    ),
  );
  console.log('=======================================');
  console.log(
    `[smoke] total cost $${cost.toFixed(4)} (abort threshold $${maxCost === Infinity ? 'none' : maxCost.toFixed(2)})`,
  );
  if (cost > maxCost) {
    console.error('[smoke] WARNING: cost exceeded the 5× abort threshold (post-hoc — no mid-run ceiling wired)');
  }

  // postgres.js keeps the event loop alive; exit explicitly.
  process.exit(0);
}

main().catch((e) => {
  console.error('[smoke] fatal:', e);
  process.exit(1);
});
