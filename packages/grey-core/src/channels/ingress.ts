// M6 Phase A — the `ChannelIngress` seam. Grey earns on multiple channels (x402 today, ACP next)
// over ONE channel-agnostic core: the shared `offeringHandlers[slug](input, deps)` map, already
// public from `@grey/core`. A channel adapter owns transport, confirm/deliver, validation, and
// envelope; the interface below is lifecycle + catalog ONLY (A1). Confirm/deliver/validation/
// envelope are deliberately absent — they are adapter-internal because both built channels
// self-drive (x402 delivers inside its Fastify route; ACP fuses confirm+deliver in one funded-job
// handler), so no channel-neutral settlement verb fits.
import type { HandlerInput } from '../handlers/types'; // reuse the shared handler input — do not redefine

/** Receiver-side identity for a channel (Q3 — identity is receiver-side only; KYA/credentials are
 *  the W402 lane, out of scope here). */
export interface ChannelIdentity {
  /** Where value settles TO on this channel. x402: payTo `0x394e…`; ACP: seller wallet `0xa966…`. */
  receivingAddress: string;
  /** Grey's on-chain ERC-8004 DID — the unifying identity layer across channels
   *  (`did:erc8004:8453:58618`). Optional: a channel may advertise a raw address only. */
  did?: string;
}

/** Catalog advertisement for one offering on a channel.
 *  NOTE: no `handler` field — the shared handler is resolved from the existing
 *  `offeringHandlers[slug]` map (`handlers/index.ts`), which IS the handler source.
 *  registerOffering advertises the catalog + price; it does not transport handlers. */
export interface OfferingRegistration {
  /** Must key into `offeringHandlers` / the single price table (`@grey/x402-middleware` prices.ts). */
  slug: string;
  /** Single price source (invariant #20 — `PRICE_TABLE`). No price literal lives on the adapter. */
  priceUsd: number;
  /** Optional adapter-side pre-clearance run before the shared handler (validation is adapter-owned:
   *  x402 uses the Fastify `$grey` body schema; ACP an `InputValidator` before `setBudget`). */
  validateInput?: (input: HandlerInput) => void | Promise<void>;
}

/** The seam: lifecycle + catalog only (A1). Confirm/deliver/validation/envelope are adapter-internal. */
export interface ChannelIngress {
  /** Bring the channel up (bind the transport / connect the marketplace). */
  start(): Promise<void>;
  /** Bring the channel down cleanly (close the transport / disconnect). */
  stop(): Promise<void>;
  /** Advertise one offering's catalog entry to the channel (see OfferingRegistration). */
  registerOffering(reg: OfferingRegistration): void;
  /** This channel's receiver-side identity. */
  identity(): ChannelIdentity;
}
