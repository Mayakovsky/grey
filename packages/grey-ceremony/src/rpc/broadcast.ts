// Layer 2 — generic transaction broadcast: send raw call data, await receipt.
// No contract vocabulary; the caller supplies an opaque `to` + encoded `data`.

import type {
  Account,
  Address,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from 'viem';

export interface RawTx {
  to: Address;
  data: Hex;
  value?: bigint;
}

/**
 * Send a pre-encoded transaction and wait for its receipt.
 * The wallet client and public client are injected so this is mockable.
 */
export async function sendAndAwait(
  wallet: WalletClient,
  publicClient: PublicClient,
  account: Account,
  tx: RawTx,
): Promise<{ hash: Hex; receipt: TransactionReceipt }> {
  const hash = await wallet.sendTransaction({
    account,
    chain: wallet.chain ?? null,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

/** Perform a read-only call and return raw return data. */
export async function callRead(
  publicClient: PublicClient,
  to: Address,
  data: Hex,
): Promise<Hex> {
  const result = await publicClient.call({ to, data });
  return (result.data ?? '0x') as Hex;
}
