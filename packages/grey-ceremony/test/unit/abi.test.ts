import { describe, it, expect } from 'vitest';
import { decodeFunctionData, encodeFunctionData, parseAbi, toFunctionSelector } from 'viem';
import {
  REGISTER_ABI,
  SET_AGENT_WALLET_ABI,
  encodeGetAgentWallet,
  encodeOwnerOf,
  encodeRegister,
  encodeSetAgentWallet,
} from '../../src/transactions/index.ts';

describe('ABI encoding', () => {
  it('register() encodes to its 4-byte selector', () => {
    const encoded = encodeRegister();
    const selector = toFunctionSelector('register()');
    expect(encoded).toBe(selector);
    expect(encoded).toHaveLength(10); // 0x + 8 hex
  });

  it('setAgentWallet(...) encodes 4 arguments decodably', () => {
    const sig = '0x' + '11'.repeat(65);
    const encoded = encodeSetAgentWallet(
      123n,
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      999n,
      sig as `0x${string}`,
    );
    const decoded = decodeFunctionData({ abi: SET_AGENT_WALLET_ABI, data: encoded });
    expect(decoded.functionName).toBe('setAgentWallet');
    expect(decoded.args[0]).toBe(123n);
    expect((decoded.args[1] as string).toLowerCase()).toBe(
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    );
    expect(decoded.args[2]).toBe(999n);
    expect(decoded.args[3]).toBe(sig);
  });

  it('ownerOf / getAgentWallet read encodings match their selectors', () => {
    const ownerOfSel = toFunctionSelector('ownerOf(uint256)');
    const getWalletSel = toFunctionSelector('getAgentWallet(uint256)');
    expect(encodeOwnerOf(5n).slice(0, 10)).toBe(ownerOfSel);
    expect(encodeGetAgentWallet(5n).slice(0, 10)).toBe(getWalletSel);
  });

  it('register ABI round-trips an encoded call', () => {
    const data = encodeFunctionData({ abi: REGISTER_ABI, functionName: 'register', args: [] });
    const decoded = decodeFunctionData({ abi: parseAbi(['function register()']), data });
    expect(decoded.functionName).toBe('register');
  });
});
