import { describe, it, expect } from 'vitest';
import { parseMDSnapshot } from './parseMDSnapshot.js';

const SOH = '\x01';
const fix = (fields: [number, string][]) => fields.map(([t, v]) => `${t}=${v}`).join(SOH);

describe('parseMDSnapshot', () => {
  it('returns null for non-35=W messages', () => {
    expect(parseMDSnapshot(fix([[35, 'D'], [55, 'EUR/USD']]))).toBeNull();
  });

  it('extracts symbol and single bid entry', () => {
    const raw = fix([
      [35, 'W'], [262, 'R1'], [55, 'EUR/USD'],
      [268, '1'],
      [269, '0'], [278, 'ORD1'], [270, '1.1050'], [271, '100'],
    ]);
    const result = parseMDSnapshot(raw);
    expect(result?.symbol).toBe('EUR/USD');
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0]).toEqual({ type: 'bid', orderId: 'ORD1', price: 1.105, quantity: 100 });
  });

  it('extracts multiple entries of different types', () => {
    const raw = fix([
      [35, 'W'], [55, 'EUR/USD'],
      [268, '3'],
      [269, '0'], [278, 'B1'], [270, '1.1050'], [271, '200'],
      [269, '0'], [278, 'B2'], [270, '1.1049'], [271, '150'],
      [269, '1'], [278, 'A1'], [270, '1.1051'], [271, '100'],
    ]);
    const result = parseMDSnapshot(raw)!;
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toEqual({ type: 'bid', orderId: 'B1', price: 1.105,  quantity: 200 });
    expect(result.entries[1]).toEqual({ type: 'bid', orderId: 'B2', price: 1.1049, quantity: 150 });
    expect(result.entries[2]).toEqual({ type: 'ask', orderId: 'A1', price: 1.1051, quantity: 100 });
  });

  it('skips entries without MDEntryID', () => {
    const raw = fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '0'], [270, '1.105'], [271, '50'],
    ]);
    const result = parseMDSnapshot(raw)!;
    expect(result.entries).toHaveLength(0);
  });
});
