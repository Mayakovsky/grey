// scam_alert_feed (free; DB read). FAIL verdicts with hype/tech ratio ≥ 3.0, with derived red
// flags. Empty DB → empty flagged list.
import type { OfferingHandler } from './types';
import { iso, micaFrom } from '../orchestration/cacheRead';

export const scamAlertFeed: OfferingHandler = async (_input, deps) => {
  const rows = await deps.verifications.getScamAlerts();
  const flagged: Array<Record<string, unknown>> = [];
  for (const v of rows) {
    const wp = await deps.whitepapers.findById(v.whitepaperId);
    const mica = micaFrom(v);
    const redFlags: string[] = [];
    if ((v.hypeTechRatio ?? 0) > 3.0) redFlags.push('High hype-to-tech ratio');
    if ((v.structuralScore ?? 0) < 2) redFlags.push('Poor structural quality');
    if ((v.totalClaims ?? 0) === 0) redFlags.push('No verifiable claims');
    const fraudulentMicaClaim =
      mica.claimsMicaCompliance === 'YES' && (mica.micaCompliant === 'NO' || mica.micaCompliant === 'PARTIAL');
    if (fraudulentMicaClaim) redFlags.push('Fraudulent MiCA compliance claim');
    flagged.push({
      name: wp?.projectName ?? 'Unknown',
      tokenAddress: wp?.tokenAddress ?? null,
      verdict: 'FAIL',
      hypeTechRatio: v.hypeTechRatio ?? 0,
      redFlags,
      fraudulentMicaClaim,
    });
  }
  return {
    payload: { date: iso(deps.clock()).split('T')[0], flagged },
    subject: { tokenAddress: null, projectName: '' },
    cacheHit: flagged.length > 0,
  };
};
