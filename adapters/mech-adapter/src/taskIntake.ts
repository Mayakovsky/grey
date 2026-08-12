// Real task-intake: detect a request targeting Grey's mech, route it to the matching shared
// offering handler, get a real response (BION-DIRECTIVE-43). The missing middle between
// registration (mechAdapter.ts's registerAsMechStep) and signed delivery
// (safeDeliveryClient.ts's deliverSigned, BION-DIRECTIVE-38) — see mechAdapter.ts's file header
// for the full picture of how this composes with those two.
//
// Detection scope — traced from the real MechMarketplace.sol source, not assumed (Task 2): a
// request can be delivered by a mech other than its `priorityMech`, but ONLY after
// `requestInfo.responseTimeout` has passed with no delivery (`deliverMarketplace`'s real body:
// `if (priorityMech != msg.sender) { if (block.timestamp > requestInfo.responseTimeout) {...} else
// { continue; } }`) — an opportunistic fallback for scavenging OTHER mechs' expired requests. This
// module deliberately only watches requests where Grey's mech IS the `priorityMech` — answering
// what was actually addressed to Grey, which is this directive's real ask; scavenging expired
// requests from other mechs is a materially different, bigger behavior decision nobody has asked
// for. `priorityMech` is therefore the one field this module filters on.
//
// Reasonable default per the directive, confirmed against the real contract rather than assumed
// by default: a poll loop (matches grey-sweeper's own tick pattern, packages/grey-sweeper/src/
// index.ts) over a `fromBlock..toBlock` range of `MarketplaceRequest` logs — nothing in the real
// Marketplace contract exposes a push/subscription surface or a "list pending requests for mech X"
// getter, so polling real event logs (the same mechanism `getRequestStatus`/`mapRequestIdInfos`
// themselves are keyed by) is the only real option, not one of several this codebase picked
// arbitrarily. Cadence/production polling infra is explicitly out of scope (deployment decision,
// later, once this is proven and Forces authorizes going live).
import { parseAbiItem, type Address, type Hash, type Hex, type PublicClient } from 'viem';
import type { HandlerDeps, HandlerInput, OfferingHandler } from '@grey/core';
import type { OfferingSlug } from '@grey/schemas/responses';
import { fetchRequestContent, deriveResponseHash, type RequestContent } from './requestContent.js';

/** Same real, verified signature as marketplaceAbi.ts's MECH_MARKETPLACE_ABI entry — restated via
 *  `parseAbiItem` (rather than extracted from that array with `.find()`) purely so viem's
 *  `getLogs` generic inference resolves `args`/`requestIds`/`requestDatas` concretely instead of
 *  as a union that includes `undefined`. Keep in sync with marketplaceAbi.ts if that signature
 *  ever changes — both are the same real event, this is not an independent declaration. */
const MARKETPLACE_REQUEST_EVENT = parseAbiItem(
  'event MarketplaceRequest(address indexed priorityMech, address indexed requester, uint256 numRequests, bytes32[] requestIds, bytes[] requestDatas)',
);

export interface DetectedRequest {
  requestId: Hash;
  requestData: Hex;
  requester: Address;
  blockNumber: bigint;
  transactionHash: Hash;
}

/** Polls real `MarketplaceRequest` logs where `priorityMech` is Grey's own mech address — see
 *  file header for why that's the right (and only real-contract-supported) filter. `fromBlock`/
 *  `toBlock` are the caller's cursor to manage (mirrors grey-sweeper's own tick-owns-its-range
 *  posture) — this function is a pure range query, it doesn't persist or infer a starting point. */
export async function pollForOwnRequests(
  publicClient: Pick<PublicClient, 'getLogs'>,
  marketplaceAddress: Address,
  mechAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<DetectedRequest[]> {
  const logs = await publicClient.getLogs({
    address: marketplaceAddress,
    event: MARKETPLACE_REQUEST_EVENT,
    args: { priorityMech: mechAddress },
    fromBlock,
    toBlock,
  });

  const detected: DetectedRequest[] = [];
  for (const log of logs) {
    const { requestIds, requestDatas } = log.args;
    if (!requestIds || !requestDatas || !log.args.requester) continue;
    for (let i = 0; i < requestIds.length; i++) {
      detected.push({
        requestId: requestIds[i],
        requestData: requestDatas[i],
        requester: log.args.requester,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      });
    }
  }
  return detected;
}

/** Real, registered tool names for Grey's mech — the authoritative source is the same
 *  `mech-payload.json` content `GREY_MECH_PAYLOAD_HASH` (config.ts) commits to on-chain, not a
 *  separate hardcoded list that could drift from what's actually published. Passed in by the
 *  caller (mechAdapter.ts reads the real file) rather than read from disk here, so this module
 *  stays a pure function of its inputs — easier to fork-test, no filesystem coupling. */
export interface RouteRequestParams {
  registeredTools: readonly OfferingSlug[];
  handlers: Record<OfferingSlug, OfferingHandler>;
  handlerDeps: HandlerDeps;
}

export interface RouteRequestResult {
  slug: OfferingSlug;
  payload: unknown;
  /** The exact JSON string the response hash was derived from — callers that go on to actually
   *  pin content need this exact byte sequence, not a re-serialization of `payload` (which could
   *  legally differ in whitespace/key order and therefore hash differently). */
  responseContent: string;
  responseHash: Hex;
}

export class UnknownToolError extends Error {
  constructor(public readonly tool: string, public readonly registeredTools: readonly string[]) {
    super(`taskIntake: requested tool "${tool}" is not one of Grey's registered tools (${registeredTools.join(', ')})`);
    this.name = 'UnknownToolError';
  }
}

/** Maps a real request's parsed content to `HandlerInput.requirement` for Grey's two mech
 *  offerings. `prompt` (free text, per every real example this directive's research found) maps
 *  to `marketQuery` — both offerings' real request schemas (packages/grey-schemas/src/requests/v1/
 *  {prediction_market_research,resolution_evidence_compiler}.schema.json) require exactly that
 *  field. `resolution_evidence_compiler`'s optional `resolutionCriteria` is read from the real
 *  `request_context` field (observed nullable-object-or-null in every real example) if a buyer
 *  supplied one there — this specific mapping is Grey's own design choice, not something the
 *  Marketplace convention dictates (request_context's own shape is opaque/per-mech by design). */
function buildRequirement(content: RequestContent): Record<string, unknown> {
  const requirement: Record<string, unknown> = { marketQuery: content.prompt };
  const context = content.request_context;
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    const resolutionCriteria = (context as Record<string, unknown>).resolutionCriteria;
    if (typeof resolutionCriteria === 'string') {
      requirement.resolutionCriteria = resolutionCriteria;
    }
  }
  return requirement;
}

/** Decodes a detected request's real content, routes it to the matching shared offering handler
 *  (`offeringHandlers[tool]` — the exact same handler map x402/ACP call, never re-implemented
 *  here), and derives the response's would-be IPFS hash. Does not pin the response anywhere or
 *  submit any delivery — see requestContent.ts's `deriveResponseHash` doc comment for why pinning
 *  is deliberately a separate, later, real-external-side-effect step this directive doesn't take. */
export async function routeRequest(
  request: DetectedRequest,
  params: RouteRequestParams,
  fetchOpts?: Parameters<typeof fetchRequestContent>[1],
): Promise<RouteRequestResult> {
  const content = await fetchRequestContent(request.requestData, fetchOpts);
  if (!params.registeredTools.includes(content.tool as OfferingSlug)) {
    throw new UnknownToolError(content.tool, params.registeredTools);
  }
  const slug = content.tool as OfferingSlug;
  const handler = params.handlers[slug];

  const input: HandlerInput = {
    offeringId: slug,
    buyerAddress: request.requester,
    requirement: buildRequirement(content),
  };
  const result = await handler(input, params.handlerDeps);

  const responseContent = JSON.stringify(result.payload);
  const responseHash = await deriveResponseHash(responseContent);

  return { slug, payload: result.payload, responseContent, responseHash };
}
