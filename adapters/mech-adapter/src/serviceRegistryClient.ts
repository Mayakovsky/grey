// Thin viem wrapper around Olas's ServiceRegistry lifecycle (BION-DIRECTIVE-28). Unlike
// marketplaceClient.ts (read-only), this client performs real state-changing calls — every write
// method has a `simulate*` counterpart (publicClient.simulateContract — predicts the result,
// submits nothing) and an `execute*` counterpart (walletClient.writeContract — submits for real,
// waits for the receipt). mechAdapter.ts's registerAsMech gates which one actually runs behind
// config.observeOnly; this client itself has no opinion on that gate, it just exposes both paths
// honestly so the gate has something real to gate.
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Account,
  type Hash,
} from 'viem';
import { CHAINS, type SupportedChainId } from './config.js';
import { SERVICE_MANAGER_ABI, SERVICE_REGISTRY_L2_ABI, SERVICE_STATE } from './serviceRegistryAbi.js';

export interface AgentParams {
  slots: number;
  bond: bigint;
}

export interface ServiceInfo {
  securityDeposit: bigint;
  multisig: Address;
  configHash: `0x${string}`;
  threshold: number;
  maxNumAgentInstances: number;
  numAgentInstances: number;
  state: number;
  agentIds: readonly number[];
}

export interface CreateParams {
  serviceOwner: Address;
  /** ERC20 bonding token, or `ETH_TOKEN_ADDRESS` (config.ts) for native-ETH bonding — Grey's
   *  posture. NOT the zero address (BION-DIRECTIVE-29 — the real contract reverts `ZeroAddress()`
   *  on a zero token; see config.ts's `ETH_TOKEN_ADDRESS` doc comment). */
  token: Address;
  configHash: `0x${string}`;
  agentIds: number[];
  agentParams: AgentParams[];
  threshold: number;
}

export interface ServiceRegistryClient {
  /** Read-only — safe to call regardless of observeOnly. */
  getService(serviceId: bigint): Promise<ServiceInfo>;

  simulateCreate(params: CreateParams): Promise<{ serviceId: bigint }>;
  executeCreate(params: CreateParams): Promise<{ serviceId: bigint; txHash: Hash }>;

  simulateActivateRegistration(serviceId: bigint, valueWei: bigint): Promise<{ success: boolean }>;
  executeActivateRegistration(serviceId: bigint, valueWei: bigint): Promise<{ success: boolean; txHash: Hash }>;

  simulateRegisterAgents(
    serviceId: bigint,
    agentInstances: Address[],
    agentIds: number[],
    valueWei: bigint,
  ): Promise<{ success: boolean }>;
  executeRegisterAgents(
    serviceId: bigint,
    agentInstances: Address[],
    agentIds: number[],
    valueWei: bigint,
  ): Promise<{ success: boolean; txHash: Hash }>;

  simulateDeploy(
    serviceId: bigint,
    multisigImplementation: Address,
    data: `0x${string}`,
  ): Promise<{ multisig: Address }>;
  executeDeploy(
    serviceId: bigint,
    multisigImplementation: Address,
    data: `0x${string}`,
  ): Promise<{ multisig: Address; txHash: Hash }>;
}

/** `account` is the signer for execute* calls — injected, never loaded from env or a keystore by
 *  this package (G4 / this repo's standing key-handling posture: mech-adapter never touches key
 *  material, same as every other adapter here). simulate* calls don't need a real signer's
 *  private key at all (viem's simulateContract just needs an `account` to set as `from`), but we
 *  take the same injected account for both so callers only ever construct one signer. */
/** `chainId` (BION-DIRECTIVE-97/98 Task 2) defaults to `8453` (Base) — every pre-existing call
 *  site omits it, so live production behavior is unchanged unless a caller explicitly asks for
 *  Gnosis (`100`). */
export function createServiceRegistryClient(
  rpcUrl: string,
  account: Account,
  chainId: SupportedChainId = 8453,
): ServiceRegistryClient {
  const chain = CHAINS[chainId];
  const publicClient = createPublicClient({ chain: chain.viemChain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ chain: chain.viemChain, transport: http(rpcUrl), account });
  const address = chain.serviceRegistry.serviceManagerProxy;
  const registryAddress = chain.serviceRegistry.serviceRegistryL2;

  return {
    async getService(serviceId: bigint) {
      const service = await publicClient.readContract({
        address: registryAddress,
        abi: SERVICE_REGISTRY_L2_ABI,
        functionName: 'getService',
        args: [serviceId],
      });
      return {
        securityDeposit: service.securityDeposit,
        multisig: service.multisig,
        configHash: service.configHash,
        threshold: service.threshold,
        maxNumAgentInstances: service.maxNumAgentInstances,
        numAgentInstances: service.numAgentInstances,
        state: service.state,
        agentIds: service.agentIds,
      };
    },

    async simulateCreate(params) {
      const { result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'create',
        args: [
          params.serviceOwner,
          params.token,
          params.configHash,
          params.agentIds,
          params.agentParams.map((p) => ({ slots: p.slots, bond: p.bond })),
          params.threshold,
        ],
        account,
      });
      return { serviceId: result };
    },
    async executeCreate(params) {
      const { request, result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'create',
        args: [
          params.serviceOwner,
          params.token,
          params.configHash,
          params.agentIds,
          params.agentParams.map((p) => ({ slots: p.slots, bond: p.bond })),
          params.threshold,
        ],
        account,
      });
      const txHash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { serviceId: result, txHash };
    },

    async simulateActivateRegistration(serviceId, valueWei) {
      const { result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'activateRegistration',
        args: [serviceId],
        value: valueWei,
        account,
      });
      return { success: result };
    },
    async executeActivateRegistration(serviceId, valueWei) {
      const { request, result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'activateRegistration',
        args: [serviceId],
        value: valueWei,
        account,
      });
      const txHash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { success: result, txHash };
    },

    async simulateRegisterAgents(serviceId, agentInstances, agentIds, valueWei) {
      const { result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'registerAgents',
        args: [serviceId, agentInstances, agentIds],
        value: valueWei,
        account,
      });
      return { success: result };
    },
    async executeRegisterAgents(serviceId, agentInstances, agentIds, valueWei) {
      const { request, result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'registerAgents',
        args: [serviceId, agentInstances, agentIds],
        value: valueWei,
        account,
      });
      const txHash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { success: result, txHash };
    },

    async simulateDeploy(serviceId, multisigImplementation, data) {
      const { result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'deploy',
        args: [serviceId, multisigImplementation, data],
        account,
      });
      return { multisig: result };
    },
    async executeDeploy(serviceId, multisigImplementation, data) {
      const { request, result } = await publicClient.simulateContract({
        address,
        abi: SERVICE_MANAGER_ABI,
        functionName: 'deploy',
        args: [serviceId, multisigImplementation, data],
        account,
      });
      const txHash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { multisig: result, txHash };
    },
  };
}

export { SERVICE_STATE };
