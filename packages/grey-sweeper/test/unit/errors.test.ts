import { describe, it, expect } from 'vitest';
import {
  BroadcastRevertError,
  GasLowError,
  NonAllowlistError,
  RpcDownError,
  errorClass,
  isRecoverable,
} from '../../src/errors.js';

describe('error classification', () => {
  it('GasLowError is recoverable', () => {
    expect(isRecoverable(new GasLowError())).toBe(true);
  });
  it('RpcDownError is recoverable', () => {
    expect(isRecoverable(new RpcDownError())).toBe(true);
  });
  it('NonAllowlistError is NOT recoverable (critical)', () => {
    expect(isRecoverable(new NonAllowlistError())).toBe(false);
  });
  it('BroadcastRevertError is NOT recoverable', () => {
    expect(isRecoverable(new BroadcastRevertError())).toBe(false);
  });
  it('unknown / plain errors are not recoverable', () => {
    expect(isRecoverable(new Error('boom'))).toBe(false);
    expect(isRecoverable('nope')).toBe(false);
  });
});

describe('errorClass', () => {
  it('returns the stable class name', () => {
    expect(errorClass(new GasLowError())).toBe('GasLowError');
    expect(errorClass(new NonAllowlistError())).toBe('NonAllowlistError');
    expect(errorClass(new BroadcastRevertError())).toBe('BroadcastRevertError');
    expect(errorClass(new RpcDownError())).toBe('RpcDownError');
  });
  it('falls back to UnknownError for non-errors', () => {
    expect(errorClass(42)).toBe('UnknownError');
  });
});
