import { describe, it, expect } from 'vitest';
import { parseSecurityListRaw } from './parseSecurityListRaw.js';

const SOH = '\x01';
const f = (...pairs: [number, string][]) => pairs.map(([t, v]) => `${t}=${v}`).join(SOH);

describe('parseSecurityListRaw', () => {
  it('returns [] when NoRelatedSym is 0', () => {
    const raw = f([35, 'y'], [146, '0']);
    expect(parseSecurityListRaw(raw)).toEqual([]);
  });

  it('returns [] when no tag-55 groups are present', () => {
    const raw = f([35, 'y'], [146, '1']);
    expect(parseSecurityListRaw(raw)).toEqual([]);
  });

  it('parses a single instrument', () => {
    const raw = f(
      [35, 'y'], [146, '1'],
      [55, 'EUR/USD'], [969, '0.0001'], [231, '100000'], [15, 'EUR'], [541, '20261231'],
    );
    expect(parseSecurityListRaw(raw)).toEqual([
      { symbol: 'EUR/USD', tickSize: 0.0001, contractSize: 100000, currency: 'EUR', expiry: '20261231' },
    ]);
  });

  it('parses multiple instruments from repeating groups (tag 55 as delimiter)', () => {
    const raw = f(
      [35, 'y'], [146, '2'],
      [55, 'EUR/USD'], [969, '0.0001'], [231, '100000'], [15, 'EUR'], [541, '20261231'],
      [55, 'GBP/USD'], [969, '0.0001'], [231, '100000'], [15, 'GBP'], [541, '20271231'],
    );
    const result = parseSecurityListRaw(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ symbol: 'EUR/USD', tickSize: 0.0001, contractSize: 100000, currency: 'EUR', expiry: '20261231' });
    expect(result[1]).toEqual({ symbol: 'GBP/USD', tickSize: 0.0001, contractSize: 100000, currency: 'GBP', expiry: '20271231' });
  });

  it('handles missing optional fields gracefully', () => {
    const raw = f([35, 'y'], [146, '1'], [55, 'BTC/USD'], [969, '0.5']);
    const [instr] = parseSecurityListRaw(raw);
    expect(instr.symbol).toBe('BTC/USD');
    expect(instr.tickSize).toBe(0.5);
    expect(instr.contractSize).toBeUndefined();
    expect(instr.currency).toBeUndefined();
    expect(instr.expiry).toBeUndefined();
  });
});
