// Hard Constraint 23: bidirectional drift check between _shared.schema.json $defs and the
// canonical TS types in @grey/schemas. Two mechanisms:
//  (a) real TS enums (runtime objects) — walk Object.values
//  (b) union type aliases (compile-time only) — const-tuple mirrors guarded so a union that
//      grows in index.ts without the mirror being updated fails TYPECHECK before runtime.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  Verdict,
  ClaimCategory,
  WhitepaperStatus,
  MathValidity,
  Plausibility,
  Originality,
  Consistency,
} from '@grey/schemas';
import type { MicaClaimStatus, MicaComplianceStatus, DiscoveryStatus } from '@grey/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const shared = JSON.parse(
  readFileSync(join(here, '..', 'src', 'responses', 'v1', '_shared.schema.json'), 'utf8'),
);
const schemaEnum = (name: string): string[] => {
  const def = shared.$defs[name];
  if (!def?.enum) throw new Error(`_shared.schema.json $defs.${name} has no enum`);
  return def.enum as string[];
};

function bidirectional(name: string, tsValues: readonly string[], schemaValues: string[]): void {
  for (const v of tsValues) {
    expect(schemaValues, `${name}: TS value "${v}" missing from schema`).toContain(v);
  }
  for (const v of schemaValues) {
    expect(tsValues, `${name}: schema value "${v}" missing from TS`).toContain(v);
  }
}

// ── (a) real TS enums ──
describe('enum-drift: real TS enums', () => {
  it.each([
    ['Verdict', Object.values(Verdict)],
    ['ClaimCategory', Object.values(ClaimCategory)],
    ['WhitepaperStatus', Object.values(WhitepaperStatus)],
    ['MathValidity', Object.values(MathValidity)],
    ['Plausibility', Object.values(Plausibility)],
    ['Originality', Object.values(Originality)],
    ['Consistency', Object.values(Consistency)],
  ] as const)('%s', (name, values) => bidirectional(name, values, schemaEnum(name)));
});

// ── (b) union type aliases: const-tuple mirrors with compile-time exhaustiveness guards ──
// `satisfies` ensures every mirror value IS a union member (mirror ⊆ union);
// the Exclude<...> extends never guard ensures the union has no member the mirror omits
// (union ⊆ mirror). Together: mirror ≡ union at typecheck time.
const MicaClaimStatusMirror = ['YES', 'NO', 'NOT_MENTIONED'] as const satisfies readonly MicaClaimStatus[];
type _CkMicaClaim = Exclude<MicaClaimStatus, (typeof MicaClaimStatusMirror)[number]> extends never ? true : never;
const _ckMicaClaim: _CkMicaClaim = true;

const MicaComplianceStatusMirror = ['YES', 'NO', 'PARTIAL', 'NOT_APPLICABLE'] as const satisfies readonly MicaComplianceStatus[];
type _CkMicaComp = Exclude<MicaComplianceStatus, (typeof MicaComplianceStatusMirror)[number]> extends never ? true : never;
const _ckMicaComp: _CkMicaComp = true;

const DiscoveryStatusMirror = ['cached', 'provided', 'primary', 'community', 'aggregator', 'failed'] as const satisfies readonly DiscoveryStatus[];
type _CkDiscovery = Exclude<DiscoveryStatus, (typeof DiscoveryStatusMirror)[number]> extends never ? true : never;
const _ckDiscovery: _CkDiscovery = true;

describe('enum-drift: union type aliases', () => {
  // reference the compile-time guards so they are not flagged unused
  it('compile-time mirror guards hold', () => {
    expect([_ckMicaClaim, _ckMicaComp, _ckDiscovery]).toEqual([true, true, true]);
  });
  it.each([
    ['MicaClaimStatus', MicaClaimStatusMirror],
    ['MicaComplianceStatus', MicaComplianceStatusMirror],
    ['DiscoveryStatus', DiscoveryStatusMirror],
  ] as const)('%s', (name, mirror) => bidirectional(name, mirror, schemaEnum(name)));
});
