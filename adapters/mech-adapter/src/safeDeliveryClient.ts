// Builds, signs, and (optionally) submits a real Safe `execTransaction` wrapping a mech's
// `deliverToMarketplace` call (BION-DIRECTIVE-38). This is the capability closing the gap noted in
// config.ts's `BASE_MECH_AGENT_INSTANCE_ADDRESS` doc comment: once a service is `Deployed`,
// `deliverToMarketplace` is gated `onlyOperator`, and `OlasMech.getOperator()` reads the service's
// real multisig LIVE from `ServiceRegistry.mapServices(serviceId)` — `msg.sender` must literally BE
// that Safe contract, not the agent-instance EOA that owns it. Reaching that requires routing
// through the Safe's own `execTransaction`, same "call the real entry point, not what looks like
// one" lesson as marketplaceClient.ts's `MechMarketplace.create()` fix (BION-DIRECTIVE-33).
//
// ── Real multisig, confirmed live (2026-08-11), not assumed ─────────────────────────────────────
// Grey's real deployed multisig (0x5587335a6Fa1Dc7C421f2b87D91C7E9def095872): `VERSION()` =
// "1.3.0", storage slot 0 (where a Safe proxy stores its singleton) resolves to
// `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` — the real canonical Safe v1.3.0 singleton, not a
// fork/custom variant. `getOwners()` = [BASE_MECH_AGENT_INSTANCE_ADDRESS] (sole owner),
// `getThreshold()` = 1. Source for execTransaction's real shape: safe-global/safe-contracts's
// GnosisSafe.sol at the v1.3.0 tag (raw-fetched) — see safeAbi.ts's header for the exact citation.
//
// ── Signature construction, traced from GnosisSafe.sol's checkNSignatures, not guessed ──────────
// A threshold=1 EOA-owner signature uses the PLAIN (non-eth_sign) ECDSA branch: v ∈ {27, 28},
// `ecrecover(dataHash, v, r, s)` directly against the RAW Safe transaction hash — no EIP-191
// "\x19Ethereum Signed Message" prefix (that's the v>30 eth_sign branch, deliberately not used
// here: this key never needs to look like a wallet's personal_sign flow). Packed as
// `{bytes32 r}{bytes32 s}{uint8 v}` — confirmed this is EXACTLY viem's `PrivateKeyAccount.sign({
// hash })` output format by reading viem's own `serializeSignature` implementation (r || s || v,
// v as 0x1b/0x1c), not assumed from its docs.
//
// The hash to sign is read directly from the real multisig's own `getTransactionHash(...)` view
// function rather than re-implemented via hand-rolled EIP-712 encoding — ground truth by
// construction (the contract computing its own expected hash), not a parallel implementation that
// could silently drift from the real one. `safeTxGas`/`baseGas`/`gasPrice`/`gasToken`/
// `refundReceiver` are the simplest valid shape: `operation` is `Call` (0), never `DelegateCall`.
//
// `safeTxGas` is deliberately a real, injected gas estimate rather than 0 — GnosisSafe.sol's own
// comment on `execTransaction` explains why: with `safeTxGas == 0 && gasPrice == 0`, a failed inner
// call makes the WHOLE `execTransaction` revert (`GS013`), which would swallow whatever real
// business-logic revert reason `deliverToMarketplace` produced. A nonzero `safeTxGas` instead lets
// a failed inner call surface as `execTransaction` returning `success: false` / emitting
// `ExecutionFailure` — callers can see WHY a delivery failed instead of only "the whole tx
// reverted". Estimated via `estimateContractGas` against the real `deliverToMarketplace` call
// (fails loudly if that call would revert outright — same simulate-before-signing posture as every
// other write path in this package).
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Account,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { OLAS_MECH_ABI } from './mechAbi.js';
import { SAFE_ABI, SAFE_OPERATION_CALL } from './safeAbi.js';

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';
/** Safety margin over the estimated gas — same rationale as any gas-estimate consumer: estimates
 *  can be tight, and the Safe attributes an underfunded `safeTxGas` to `deliverToMarketplace`
 *  failing for a reason that has nothing to do with its own logic. */
const SAFE_TX_GAS_MARGIN_PPT = 1200n; // 1.2x, parts-per-thousand

/** Pure, directly-testable: the deliverToMarketplace calldata a Safe execTransaction wraps. */
export function encodeDeliverToMarketplaceCalldata(requestIds: readonly Hash[], datas: readonly Hex[]): Hex {
  return encodeFunctionData({ abi: OLAS_MECH_ABI, functionName: 'deliverToMarketplace', args: [requestIds, datas] });
}

/** Pure, directly-testable: signs an already-computed Safe transaction hash with the injected
 *  account's raw (non-eth_sign) `sign()` — the plain-ECDSA branch `checkNSignatures` expects for a
 *  threshold=1 EOA owner (see file header). Throws if the account has no raw `sign` (e.g. a
 *  JSON-RPC account, which can't produce an offline signature at all). */
export async function signSafeTransactionHash(account: Account, safeTxHash: Hash): Promise<Hex> {
  if (!account.sign) {
    throw new Error(
      'safeDeliveryClient: injected account has no raw sign() — a JSON-RPC account cannot ' +
        'produce a Safe signature offline. Construct with a PrivateKeyAccount ' +
        '(agentInstanceSigner.ts).',
    );
  }
  return account.sign({ hash: safeTxHash });
}

export interface SignedSafeDelivery {
  mech: Address;
  multisig: Address;
  /** encodeDeliverToMarketplaceCalldata's output — stored so simulate/execute can rebuild the
   *  exact same execTransaction args without re-deriving anything. */
  data: Hex;
  nonce: bigint;
  safeTxGas: bigint;
  safeTxHash: Hash;
  signature: Hex;
}

export interface SafeDeliveryClient {
  /** Builds deliverToMarketplace calldata, reads the multisig's real current nonce + estimated
   *  gas + real transaction hash, and signs it with the injected agent-instance account. Pure
   *  construction — no network write, safe to call regardless of observeOnly. */
  buildSignedDelivery(mech: Address, requestIds: readonly Hash[], datas: readonly Hex[]): Promise<SignedSafeDelivery>;
  /** Predicts execTransaction's result via simulateContract — no submission. */
  simulateDelivery(signed: SignedSafeDelivery): Promise<{ success: boolean }>;
  /** Submits the real, already-signed execTransaction. */
  executeDelivery(signed: SignedSafeDelivery): Promise<{ txHash: Hash; success: boolean }>;
}

function execTransactionArgs(signed: SignedSafeDelivery) {
  return [
    signed.mech,
    0n,
    signed.data,
    SAFE_OPERATION_CALL,
    signed.safeTxGas,
    0n,
    0n,
    ZERO_ADDRESS,
    ZERO_ADDRESS,
    signed.signature,
  ] as const;
}

export function createSafeDeliveryClient(rpcUrl: string, multisig: Address, account?: Account): SafeDeliveryClient {
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = account ? createWalletClient({ chain: base, transport: http(rpcUrl), account }) : undefined;

  function requireAccount(): Account {
    if (!account) {
      throw new Error(
        'SafeDeliveryClient: signing requires an Account — construct via ' +
          'createSafeDeliveryClient(rpcUrl, multisig, account), not the no-account read-only default.',
      );
    }
    return account;
  }

  return {
    async buildSignedDelivery(mech, requestIds, datas) {
      const acct = requireAccount();
      const data = encodeDeliverToMarketplaceCalldata(requestIds, datas);

      const nonce = await client.readContract({ address: multisig, abi: SAFE_ABI, functionName: 'nonce' });

      const rawGasEstimate = await client.estimateContractGas({
        address: mech,
        abi: OLAS_MECH_ABI,
        functionName: 'deliverToMarketplace',
        args: [requestIds, datas],
        account: multisig,
      });
      const safeTxGas = (rawGasEstimate * SAFE_TX_GAS_MARGIN_PPT) / 1000n;

      const safeTxHash = await client.readContract({
        address: multisig,
        abi: SAFE_ABI,
        functionName: 'getTransactionHash',
        args: [mech, 0n, data, SAFE_OPERATION_CALL, safeTxGas, 0n, 0n, ZERO_ADDRESS, ZERO_ADDRESS, nonce],
      });

      const signature = await signSafeTransactionHash(acct, safeTxHash);

      return { mech, multisig, data, nonce, safeTxGas, safeTxHash, signature };
    },

    async simulateDelivery(signed) {
      const acct = requireAccount();
      const { result } = await client.simulateContract({
        address: signed.multisig,
        abi: SAFE_ABI,
        functionName: 'execTransaction',
        args: execTransactionArgs(signed),
        account: acct,
      });
      return { success: result };
    },

    async executeDelivery(signed) {
      requireAccount();
      const { request } = await client.simulateContract({
        address: signed.multisig,
        abi: SAFE_ABI,
        functionName: 'execTransaction',
        args: execTransactionArgs(signed),
        account,
      });
      const txHash: Hash = await walletClient!.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      // execTransaction's own return value isn't in the receipt (it's the call's return data, not
      // a log) — success/failure is instead ExecutionSuccess vs ExecutionFailure, one of which the
      // real transaction always emits (see GnosisSafe.sol's execTransaction). Ground truth from the
      // real receipt's logs, not the pre-submission simulation's `result` — same discipline as
      // marketplaceClient.ts's executeCreateMech fix (BION-DIRECTIVE-36 addendum).
      const success = receipt.logs.some(
        (log) => log.topics[0] === EXECUTION_SUCCESS_TOPIC && log.address.toLowerCase() === signed.multisig.toLowerCase(),
      );
      return { txHash, success };
    },
  };
}

// keccak256("ExecutionSuccess(bytes32,uint256)") — verified via viem's own keccak256(toBytes(...))
// against the real event signature (GnosisSafe.sol), not hand-typed from memory: an earlier draft
// of this constant had one hex digit wrong (556d vs the real 556e), which a literal-vs-computed
// mismatch check caught before this ever ran against real state. Left as a literal (matching this
// codebase's existing convention for verified hash constants, e.g. serviceRegistryAbi.ts's
// SAFE_TX_TYPEHASH) rather than computed at import time, but the exact value below is copy-pasted
// from that verification run's real output, not retyped.
const EXECUTION_SUCCESS_TOPIC = '0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e' as const;
