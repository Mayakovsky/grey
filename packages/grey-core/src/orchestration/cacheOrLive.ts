// @grey/core cacheOrLive — live-compute on cache-miss for the 4 compute offerings (M3.5 §2.10,
// 5-step per §16). The 4 compute handlers delegate their cache-MISS branch here; cache-HITS stay in
// cacheRead.ts (direct row→payload; MiCA-adjustment guard intact).
//
// Invariant #14 (pipeline-owns-live-compute): this file constructs/calls NO discovery internals.
// The discovery stack is reached only via `deps.discovery.discover(...)` (a property access); the
// token-name helper is NOT called here — the pipeline run variants resolve the name internally
// (§16). The run variants (runL1/runL1L2/runFullPipeline) are ordinary pipeline exports. The sole
// sanctioned cross-boundary discovery-type reference lives in deps/index.ts (§15/§16).
import type { ComputeOfferingSlug, RequestFor, DiscoveryStatus, DiscoveryAttempt } from '@grey/schemas';
import {
  runL1,
  runL1L2,
  runFullPipeline,
  withTimeout,
  PIPELINE_TIMEOUT_MS,
  CostTracker,
  LLM_PRICING,
  type PipelineDeps,
  type ProjectMetadata,
  type DiscoveryProvenance,
  type RunMetadata,
} from '@grey/pipeline';
import type { HandlerDeps } from '../deps';
import type { HandlerResult } from '../handlers/types';
import type { EnvelopeSubject } from '../envelope/build';
import { buildLegitimacyMiss, buildVerifyWhitepaperMiss, buildVerifyFullTechMiss } from './cacheRead';

/** Map a successful discovery tier to its DiscoveryStatus (JobRouter 451-455). */
function tierStatus(tier: number): DiscoveryStatus {
  return tier === 3 ? 'community' : tier === 4 ? 'aggregator' : 'primary';
}

/** Per-offering typed-empty miss sentinel — reuses the cacheRead miss builders (discovery-miss / failure). */
function missResult(
  offering: ComputeOfferingSlug,
  deps: HandlerDeps,
  fallback: { tokenAddress: string | null; projectName?: string },
): HandlerResult {
  const subject: EnvelopeSubject = {
    tokenAddress: fallback.tokenAddress,
    projectName: fallback.projectName ?? '',
  };
  const claimExtractionEmpty = {
    whitepaper: {},
    structuralAnalysis: {},
    claims: [],
    tokenAddress: fallback.tokenAddress,
  };
  let payload: unknown;
  switch (offering) {
    case 'legitimacy_scan':
      payload = buildLegitimacyMiss(deps, fallback);
      break;
    case 'verify_whitepaper':
      payload = buildVerifyWhitepaperMiss(deps, fallback);
      break;
    case 'verify_full_tech':
      payload = buildVerifyFullTechMiss(deps, fallback);
      break;
    case 'claim_extraction':
      payload = claimExtractionEmpty;
      break;
    default:
      payload = claimExtractionEmpty;
  }
  return { payload, subject, cacheHit: false };
}

/**
 * insufficientData sentinel for the live-path FAILURE / TIMEOUT branch (§2.10 step 6 / §19.2 /
 * JobRouter 2139-2166): same all-fields-present shape as the miss sentinel but verdict
 * INSUFFICIENT_DATA ("tried live, couldn't complete"), distinct from the cache-only NOT_IN_DATABASE.
 * claim_extraction has no verdict → the typed-empty shape (identical to missResult).
 */
function insufficientDataResult(
  offering: ComputeOfferingSlug,
  deps: HandlerDeps,
  fallback: { tokenAddress: string | null; projectName?: string },
): HandlerResult {
  const r = missResult(offering, deps, fallback);
  if (offering !== 'claim_extraction') {
    const p = r.payload as Record<string, unknown>;
    p.verdict = 'INSUFFICIENT_DATA';
    p.micaSummary = 'No documentation could be discovered for this project within the time budget.';
  }
  return r;
}

/**
 * Cache-miss → live-compute. 5-step (§2.10 + §16):
 *  1. (pass-through) name resolution happens INSIDE the pipeline variant (§16) — none here.
 *  2. discovery — if the request carries no document URL, obtain one (+ tier provenance).
 *  3. run the variant per FDQ-8 routing (legitimacy→runL1; verify_whitepaper→runFullPipeline
 *     'tokenomics'; verify_full_tech→runFullPipeline 'full'; claim_extraction→runL1L2).
 *  4. builder dispatch is internal to each variant.
 *  5. return HandlerResult{payload, subject (from the report), cacheHit:false}.
 *  Timeout / pipeline failure → typed-empty miss sentinel (matches JobRouter 2139-2166).
 */
export async function cacheOrLive<O extends ComputeOfferingSlug>(
  offering: O,
  input: RequestFor<O>,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const body = input as unknown as Record<string, unknown>;
  const tokenAddress = (body.token_address as string | undefined) ?? null;
  const projectName = body.project_name as string | undefined;
  const requestUrl =
    (body.document_url as string | undefined) ?? (body.whitepaperUrl as string | undefined);
  const fallback = { tokenAddress, projectName };

  // Fresh per-request CostTracker (§15 / Q8), spread onto the shared per-process pipeline deps.
  const pdeps: PipelineDeps = {
    ...deps.pipeline,
    cost: new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken),
  };

  try {
    // Step 2: discovery — obtain a documentUrl when the request carries none (claim_extraction
    // always supplies whitepaperUrl, so it skips this and never discovers — matches production).
    let documentUrl = requestUrl;
    let provenance: DiscoveryProvenance | undefined;
    if (!documentUrl) {
      const metadata: ProjectMetadata = {
        agentName: projectName ?? null,
        entityId: null,
        description: null,
        linkedUrls: [],
        category: null,
        graduationStatus: null,
      };
      const discovered = await deps.discovery.discover(metadata, tokenAddress ?? '');
      if (!discovered) {
        // §20: discovery-miss on the live path → insufficientData (tried, no docs found), matching
        // §2.10 step 2 + the timeout/failure path + production JobRouter. NOT_IN_DATABASE is reserved
        // for the pure-DB-read cache-only offerings (e.g. quick_protocol_facts), not the live tier.
        return insufficientDataResult(offering, deps, fallback);
      }
      documentUrl = discovered.documentUrl;
      const status = tierStatus(discovered.tier);
      const attempts: DiscoveryAttempt[] = [{ tier: discovered.tier, status }];
      provenance = {
        discoveryStatus: status,
        discoverySourceTier: discovered.tier,
        discoveryAttempts: attempts,
      };
    }

    // Steps 3+4: route to the variant (one depth per function; builder dispatched internally).
    // §17: thread discovery provenance into persistence (metadata_json) symmetrically with the
    // response. undefined when discovery didn't run (e.g. claim_extraction's supplied URL).
    const runMetadata: RunMetadata | undefined = provenance
      ? {
          discoveryStatus: provenance.discoveryStatus,
          discoverySourceTier: String(provenance.discoverySourceTier),
          discoveryAttempts: provenance.discoveryAttempts,
        }
      : undefined;
    const runInput = { projectName: projectName ?? '', tokenAddress, documentUrl };
    let payload: Record<string, unknown>;
    let subjectName: string;
    let subjectToken: string | null;
    switch (offering) {
      // §19.2: bound each live variant by PIPELINE_TIMEOUT_MS (4 min). On expiry withTimeout rejects
      // → caught below → insufficientData (spec §2.10 step 6).
      case 'legitimacy_scan': {
        const r = await withTimeout(
          runL1(runInput, pdeps, { builder: 'legitimacy' }, runMetadata),
          PIPELINE_TIMEOUT_MS,
          'legitimacy_scan',
        );
        payload = r as unknown as Record<string, unknown>;
        subjectName = r.projectName;
        subjectToken = r.tokenAddress;
        break;
      }
      case 'verify_whitepaper': {
        const r = await withTimeout(
          runFullPipeline(runInput, pdeps, { builder: 'tokenomics' }, runMetadata),
          PIPELINE_TIMEOUT_MS,
          'verify_whitepaper',
        );
        payload = r as unknown as Record<string, unknown>;
        subjectName = r.projectName;
        subjectToken = r.tokenAddress;
        break;
      }
      case 'verify_full_tech': {
        const r = await withTimeout(
          runFullPipeline(runInput, pdeps, { builder: 'full' }, runMetadata),
          PIPELINE_TIMEOUT_MS,
          'verify_full_tech',
        );
        payload = r as unknown as Record<string, unknown>;
        subjectName = r.projectName;
        subjectToken = r.tokenAddress;
        break;
      }
      case 'claim_extraction': {
        const r = await withTimeout(
          runL1L2(runInput, pdeps, { builder: 'claim_extraction' }, runMetadata),
          PIPELINE_TIMEOUT_MS,
          'claim_extraction',
        );
        payload = r as unknown as Record<string, unknown>;
        subjectName = r.whitepaper.projectName;
        subjectToken = r.tokenAddress;
        break;
      }
      default:
        return missResult(offering, deps, fallback);
    }

    // Attach discovery provenance to the RESPONSE (buyer-visible optional fields). Persistence-level
    // provenance (whitepaper-row runMetadata) is DEFERRED — the Phase-A variants expose no such param
    // and §16 scoped the reopen to the name-resolution helper only. See PHASE-B-PROGRESS deferred-obs.
    if (provenance) {
      payload.discoveryStatus = provenance.discoveryStatus;
      payload.discoverySourceTier = provenance.discoverySourceTier;
      payload.discoveryAttempts = provenance.discoveryAttempts;
    }

    const subject: EnvelopeSubject = {
      tokenAddress: subjectToken ?? tokenAddress,
      projectName: subjectName || projectName || '',
    };
    return { payload, subject, cacheHit: false };
  } catch (err) {
    // Timeout (withTimeout) or any pipeline failure → insufficientData (§2.10 step 6 / §19.2).
    deps.logger.warn('cacheOrLive failed — returning insufficientData sentinel', {
      offering,
      error: (err as Error).message,
    });
    return insufficientDataResult(offering, deps, fallback);
  }
}
