import { describe, it, expect } from 'vitest';
import { buildOrderCancelRequest } from './buildOrderCancelRequest.js';

describe('buildOrderCancelRequest', () => {
  it('sets MsgType=F', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'EUR/USD', side: 'buy' });
    expect(m.get(35)).toBe('F');
  });

  it('sets ClOrdID (11) to the new cancel ClOrdID', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'EUR/USD', side: 'buy' });
    expect(m.get(11)).toBe('CXL1');
  });

  it('sets OrigClOrdID (41) to the original order ClOrdID', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'EUR/USD', side: 'buy' });
    expect(m.get(41)).toBe('CID1');
  });

  it('sets OrderID (37) to exchOrdId', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'EUR/USD', side: 'buy' });
    expect(m.get(37)).toBe('EXCH1');
  });

  it('sets Symbol (55)', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'GBP/USD', side: 'sell' });
    expect(m.get(55)).toBe('GBP/USD');
  });

  it('encodes buy side as 1', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'EUR/USD', side: 'buy' });
    expect(m.get(54)).toBe('1');
  });

  it('encodes sell side as 2', () => {
    const m = buildOrderCancelRequest('CXL1', { origClOrdId: 'CID1', exchOrdId: 'EXCH1', symbol: 'EUR/USD', side: 'sell' });
    expect(m.get(54)).toBe('2');
  });
});
