// @grey/acp-adapter — the ACP marketplace as a ChannelIngress (M6). Package surface for reuse/tests.
export { AcpAdapter } from './acpAdapter.js';
export type { AcpAdapterOptions } from './acpAdapter.js';
export { loadConfig, GREY_DID } from './config.js';
export type { AcpAdapterConfig } from './config.js';
export { parseRequirement } from './parseRequirement.js';
export type { ParsedRequirement, ParseResult } from './parseRequirement.js';
export { createRealSdkBundle } from './sdk.js';
export { createLogger, silentLogger } from './logger.js';
export type { AdapterLogger } from './logger.js';
export type {
  AcpSdkBundle,
  AcpAgentLike,
  AcpJobSession,
  AcpRoomEntry,
  AcpJob,
  AcpJobRef,
  AcpJobInfo,
  AcpAgentConfig,
  BuyerReputationGate,
  JobTerminalStatus,
} from './acpTypes.js';
