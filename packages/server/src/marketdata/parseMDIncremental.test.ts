import { describe, it, expect } from 'vitest';
import { parseMDIncremental } from './parseMDIncremental.js';

const SOH = '\x01';
const fix = (fields: [number, string][]) => fields.map(([t, v]) => `${t}=${v}`).join(SOH);

describe('parseMDIncremental', () => {
  it('returns null for non-35=X messages', () => {
    expect(parseMDIncremental(fix([[35, '8']]))).toBeNull();
  });

  it('parses a single new bid entry', () => {
    const raw = fix([
      [35, 'X'], [262, 'R1'],
      [268, '1'],
      [279, '0'], [269, '0'], [278, 'B1'], [55, 'EUR/USD'], [270, '1.1050'], [271, '500'],
    ]);
    const result = parseMDIncremental(raw);
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      symbol: 'EUR/USD',
      entry: { action: 'new', type: 'bid', orderId: 'B1', price: 1.105, quantity: 500 },
    });
  });

  it('parses change and delete actions', () => {
    const raw = fix([
      [35, 'X'],
      [279, '1'], [269, '0'], [278, 'B1'], [55, 'EUR/USD'], [270, '1.105'], [271, '300'],
      [279, '2'], [269, '1'], [278, 'A1'], [55, 'EUR/USD'], [270, '1.106'], [271, '0'],
    ]);
    const result = parseMDIncremental(raw)!;
    expect(result[0].entry.action).toBe('change');
    expect(result[1].entry.action).toBe('delete');
  });

  it('parses trade entries (MDEntryType=2)', () => {
    const raw = fix([
      [35, 'X'],
      [279, '0'], [269, '2'], [278, 'T1'], [55, 'EUR/USD'], [270, '1.105'], [271, '100'],
    ]);
    const result = parseMDIncremental(raw)!;
    expect(result[0].entry.type).toBe('trade');
  });

  it('parses multiple entries across symbols', () => {
    const raw = fix([
      [35, 'X'],
      [279, '0'], [269, '0'], [278, 'B1'], [55, 'EUR/USD'], [270, '1.105'], [271, '100'],
      [279, '0'], [269, '1'], [278, 'A1'], [55, 'GBP/USD'], [270, '1.250'], [271, '200'],
    ]);
    const result = parseMDIncremental(raw)!;
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe('EUR/USD');
    expect(result[1].symbol).toBe('GBP/USD');
  });
});
