// Layer 3 — deadline sanity guard for the AgentWalletSet consent flow.
//
// The deployed ERC-8004 IdentityRegistry rejects a consent whose deadline is
// more than ~5 minutes in the future, reverting `setAgentWallet` with
// "deadline too far" (confirmed on Base Sepolia: 600s reverts, 300s succeeds).
// An operator using an intuitive far-future deadline (e.g. 1 hour) would hit an
// opaque revert only at broadcast time. This warns at sign / broadcast time.

/** Max consent deadline offset the registry accepts, in seconds (~5 min). */
export const MAX_DEADLINE_OFFSET_S = 300;

/**
 * Return a warning string if `deadline` is more than {@link MAX_DEADLINE_OFFSET_S}
 * seconds ahead of `nowSeconds`, else null. Pure, for testability.
 */
export function deadlineWarning(deadline: bigint, nowSeconds: number): string | null {
  const offset = Number(deadline) - nowSeconds;
  if (offset > MAX_DEADLINE_OFFSET_S) {
    return (
      `warning: deadline is ${offset}s ahead — the registry caps consent deadlines ` +
      `at ~${MAX_DEADLINE_OFFSET_S}s ("deadline too far"), so setAgentWallet will likely ` +
      `revert. Use a deadline <= ${MAX_DEADLINE_OFFSET_S}s from now and broadcast promptly.`
    );
  }
  return null;
}
