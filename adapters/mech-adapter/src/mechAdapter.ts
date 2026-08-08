// MechAdapter — the Olas Mech Marketplace (Base) as a ChannelIngress (e3-b1). Grey's first
// on-chain-contract-settlement channel — no HTTP payment header (x402), no platform SDK, direct
// contract calls against MechMarketplaceProxy via viem. Modeled on acp-adapter's shape (config
// injection, OfferingRegistration catalog, observeOnly safety seam) but the lifecycle is
// necessarily thinner: this channel has no live request/response loop wired yet (see below).
//
// ── Registration gap (read before wiring this into anything live) ──────────────────────────
// Becoming a mech on the Marketplace is NOT a single contract call. `MechMarketplace.create()`
// and every `MechFactory*.createMech()` both require a pre-existing Olas `serviceId` from a
// SEPARATE ServiceRegistry contract (confirmed against the real ABI, fetched raw from
// autonolas-marketplace's abis/*/MechMarketplace.json and MechFactoryFixedPriceNative.json,
// 2026-08-08) — Olas's own agent-service lifecycle (mint an agent, register a service, activate
// it, register an agent instance, deploy — which creates a Safe multisig). That flow is NOT
// researched or implemented here; it's a genuinely separate, unscoped prerequisite this directive
// did not anticipate at this level of detail. `registerAsMech` below is therefore a stub that
// throws — it exists to name the gap in the type surface rather than silently omit it. Resolving
// it is follow-up work, not guessed at here (no fabricated ServiceRegistry ABI calls).
//
// What IS real and tested: the read-side contract client (marketplaceClient.ts, verified against
// forked Base mainnet state in test/fork/), the ChannelIngress catalog/identity surface, and the
// config/wallet wiring. `start()` connects the read-side client and logs its own not-yet-
// registered state; it does not attempt any on-chain write.
import type { ChannelIngress, ChannelIdentity, OfferingRegistration } from '@grey/core';
import type { Address } from 'viem';
import { GREY_DID, type MechAdapterConfig, type MechPaymentType } from './config.js';
import { createMarketplaceClient, type MarketplaceClient } from './marketplaceClient.js';
import { createLogger, type AdapterLogger } from './logger.js';

export interface MechAdapterOptions {
  config: MechAdapterConfig;
  /** Injected so tests can supply a fake; main.ts builds the real viem-backed client. */
  marketplaceClient?: MarketplaceClient;
  logger?: AdapterLogger;
}

export class MechAdapter implements ChannelIngress {
  private readonly config: MechAdapterConfig;
  private readonly client: MarketplaceClient;
  private readonly log: AdapterLogger;
  private readonly offerings: OfferingRegistration[] = [];
  private started = false;

  constructor(opts: MechAdapterOptions) {
    this.config = opts.config;
    this.client = opts.marketplaceClient ?? createMarketplaceClient(opts.config.rpcUrl);
    this.log = opts.logger ?? createLogger({ component: 'mech-adapter' });
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('MechAdapter: already started');
    const numMechs = await this.client.numMechs();
    const selfRegistered = await this.client.checkMech(this.config.payToAddress);
    this.started = true;
    this.log.info('MechAdapter: started (read-only until registration lands)', {
      observeOnly: this.config.observeOnly,
      offerings: this.offerings.map((o) => o.slug),
      payToAddress: this.config.payToAddress,
      marketplaceMechCount: numMechs.toString(),
      selfRegisteredAsMech: selfRegistered,
    });
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  registerOffering(reg: OfferingRegistration): void {
    this.offerings.push(reg);
    this.log.info('MechAdapter: offering registered', { slug: reg.slug, priceUsd: reg.priceUsd });
  }

  identity(): ChannelIdentity {
    return { receivingAddress: this.config.payToAddress, did: GREY_DID };
  }

  listOfferings(): readonly OfferingRegistration[] {
    return this.offerings;
  }

  /** Stub — see the file-header "Registration gap" note. Always throws; exists so the gap is a
   *  named, typed surface rather than a silent omission. */
  async registerAsMech(_paymentType: MechPaymentType, _serviceId: bigint): Promise<Address> {
    throw new Error(
      'MechAdapter.registerAsMech: not implemented — requires an Olas ServiceRegistry serviceId, ' +
        'a separate unresolved prerequisite (see mechAdapter.ts file header). Do not call in production.',
    );
  }
}
