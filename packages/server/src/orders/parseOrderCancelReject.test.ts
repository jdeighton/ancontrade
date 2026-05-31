import { describe, it, expect } from 'vitest';
import { parseOrderCancelReject } from './parseOrderCancelReject.js';

const SOH = '\x01';
function raw(fields: Record<number, string>) {
  return Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);
}

describe('parseOrderCancelReject', () => {
  it('returns null for non-35=9 messages', () => {
    expect(parseOrderCancelReject(raw({ 35: '8', 11: 'CID1' }))).toBeNull();
  });

  it('returns null when ClOrdID is missing', () => {
    expect(parseOrderCancelReject(raw({ 35: '9' }))).toBeNull();
  });

  it('parses clOrdId, cxlRejReason, and text', () => {
    const result = parseOrderCancelReject(raw({ 35: '9', 11: 'CXL1', 102: '1', 58: 'Unknown order' }));
    expect(result).not.toBeNull();
    expect(result!.clOrdId).toBe('CXL1');
    expect(result!.cxlRejReason).toBe(1);
    expect(result!.text).toBe('Unknown order');
  });

  it('defaults cxlRejReason to 0 when absent', () => {
    const result = parseOrderCancelReject(raw({ 35: '9', 11: 'CXL1' }));
    expect(result!.cxlRejReason).toBe(0);
  });

  it('defaults text to empty string when absent', () => {
    const result = parseOrderCancelReject(raw({ 35: '9', 11: 'CXL1' }));
    expect(result!.text).toBe('');
  });
});
