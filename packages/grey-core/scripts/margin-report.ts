// E1-F margin dashboard (Expansion Round 2, sub-unit 4) — NOT in CI, real DB only. Reads the
// revenue_events ledger (grey-core's route/MCP layer writes these at settlement) + cost_events
// (the live pipeline's existing telemetry) and prints realized margin per offering, with revenue
// broken out per channel. Mirrors Bion's `pnpm auto-report` CLI shape (plain aggregate print, no
// framework) and grey-core's own scripts/smoke.ts conventions (real GREY_DATABASE_URL, no CI).
//
// Usage:
//   pnpm -F @grey/core margin-report [-- --days 7]
import { createDeps, MarginRepo } from '@grey/pipeline';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const days = Number(arg('days') ?? '30');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { db } = createDeps({ databaseUrl: process.env.GREY_DATABASE_URL ?? '' });
  const margin = new MarginRepo(db);
  const report = await margin.getMarginReport(since);

  console.log(`GREY MARGIN REPORT — last ${days}d (since ${since.toISOString()})`);
  console.log('─'.repeat(60));
  if (report.length === 0) {
    console.log('(no revenue or cost activity in this window)');
    return;
  }

  let totalRevenue = 0;
  let totalCost = 0;
  for (const row of report) {
    totalRevenue += row.totalRevenueUsd;
    totalCost += row.totalCostUsd;
    const channels = Object.entries(row.revenueByChannelUsd)
      .map(([ch, usd]) => `${ch}=$${usd.toFixed(4)}`)
      .join(' ');
    const marginFlag = row.realizedMarginUsd >= 0 ? '+' : '';
    console.log(
      `${row.offering.padEnd(24)} revenue=$${row.totalRevenueUsd.toFixed(4).padStart(9)} ` +
        `cost=$${row.totalCostUsd.toFixed(4).padStart(9)} ` +
        `margin=${marginFlag}$${row.realizedMarginUsd.toFixed(4)}  [${channels || 'no revenue yet'}]`,
    );
  }
  console.log('─'.repeat(60));
  console.log(
    `TOTAL  revenue=$${totalRevenue.toFixed(4)}  cost=$${totalCost.toFixed(4)}  ` +
      `margin=$${(totalRevenue - totalCost).toFixed(4)}`,
  );
}

main().catch((err: unknown) => {
  console.error(
    'margin-report: fatal:',
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
  process.exit(1);
});
