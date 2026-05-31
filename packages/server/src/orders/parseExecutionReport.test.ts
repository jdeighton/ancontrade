import { describe, it, expect } from 'vitest';
import { parseExecutionReport } from './parseExecutionReport.js';

const SOH = '\x01';
const raw = (fields: Record<number, string>) =>
  Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);

describe('parseExecutionReport', () => {
  const base = raw({ 35: '8', 11: 'CID1', 37: 'EXCH001', 39: '0', 14: '0', 6: '0' });

  it('returns null for non-35=8 messages', () => {
    expect(parseExecutionReport(raw({ 35: 'D', 11: 'CID1' }))).toBeNull();
  });

  it('parses ClOrdID (tag 11)', () => {
    expect(parseExecutionReport(base)?.clOrdId).toBe('CID1');
  });

  it('parses ExchOrdId (tag 37)', () => {
    expect(parseExecutionReport(base)?.exchOrdId).toBe('EXCH001');
  });

  it('maps OrdStatus 0 → New', () => {
    expect(parseExecutionReport(base)?.ordStatus).toBe('New');
  });

  it('maps OrdStatus 1 → PartiallyFilled', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '1', 14: '500', 6: '1.105' });
    expect(parseExecutionReport(r)?.ordStatus).toBe('PartiallyFilled');
  });

  it('maps OrdStatus 2 → Filled', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '2', 14: '1000', 6: '1.105' });
    expect(parseExecutionReport(r)?.ordStatus).toBe('Filled');
  });

  it('maps OrdStatus 4 → Cancelled', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '4', 14: '0', 6: '0' });
    expect(parseExecutionReport(r)?.ordStatus).toBe('Cancelled');
  });

  it('parses CumQty (tag 14) as number', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '1', 14: '750', 6: '1.105' });
    expect(parseExecutionReport(r)?.cumQty).toBe(750);
  });

  it('parses AvgPx (tag 6) as number', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '1', 14: '500', 6: '1.1055' });
    expect(parseExecutionReport(r)?.avgPx).toBe(1.1055);
  });

  it('returns null when ClOrdID is missing', () => {
    expect(parseExecutionReport(raw({ 35: '8', 37: 'X', 39: '0', 14: '0', 6: '0' }))).toBeNull();
  });

  it('maps OrdStatus 8 → Rejected', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '8', 14: '0', 6: '0' });
    expect(parseExecutionReport(r)?.ordStatus).toBe('Rejected');
  });

  it('parses OrdRejReason (tag 103) on Rejected ER', () => {
    const r = raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '8', 14: '0', 6: '0', 103: '1', 58: 'Unknown symbol' });
    const result = parseExecutionReport(r);
    expect(result?.ordRejReason).toBe(1);
    expect(result?.rejText).toBe('Unknown symbol');
  });

  it('defaults ordRejReason and rejText to undefined when absent', () => {
    const result = parseExecutionReport(raw({ 35: '8', 11: 'CID1', 37: 'X', 39: '0', 14: '0', 6: '0' }));
    expect(result?.ordRejReason).toBeUndefined();
    expect(result?.rejText).toBeUndefined();
  });
});
