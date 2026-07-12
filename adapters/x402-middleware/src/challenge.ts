// Build the 402 body — strict-canonical x402 `PaymentRequirements` (Forces ruling: maxTimeoutSeconds
// only, no server nonce/expiresAt). One `accepts` entry: the buyer signs an EIP-3009 authorization
// for `maxAmountRequired` USDC to `payTo`, using the `extra` domain hints.
import type { X402Config, PaymentRequirements } from './types.js';
import { priceAtomicFor } from './prices.js';

export function buildPaymentRequirements(
  cfg: X402Config,
  slug: string,
  resource: string,
  error?: string,
): PaymentRequirements {
  const body: PaymentRequirements = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        maxAmountRequired: priceAtomicFor(slug).toString(),
        resource,
        description: `Grey ${slug} offering`,
        mimeType: 'application/json',
        payTo: cfg.payTo,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        asset: cfg.usdc.address,
        extra: { name: cfg.usdc.name, version: cfg.usdc.version },
      },
    ],
  };
  if (error) body.error = error;
  return body;
}
