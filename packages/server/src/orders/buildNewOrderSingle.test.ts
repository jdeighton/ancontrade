import { describe, it, expect } from 'vitest';
import { buildNewOrderSingle } from './buildNewOrderSingle.js';

describe('buildNewOrderSingle', () => {
  const base = {
    symbol: 'EUR/USD',
    side: 'buy' as const,
    orderType: 'limit' as const,
    price: 1.1050,
    quantity: 1000,
    account: 'ACC001',
    traderId: 'TRD1',
  };

  it('sets MsgType 35=D', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(35)).toBe('D');
  });

  it('sets ClOrdID tag 11', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(11)).toBe('CID1');
  });

  it('sets Symbol tag 55', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(55)).toBe('EUR/USD');
  });

  it('sets Side tag 54 = 1 for buy', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(54)).toBe('1');
  });

  it('sets Side tag 54 = 2 for sell', () => {
    const m = buildNewOrderSingle('CID1', { ...base, side: 'sell' });
    expect(m.get(54)).toBe('2');
  });

  it('sets OrdType tag 40 = 2 for limit', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(40)).toBe('2');
  });

  it('sets Price tag 44 as string for limit', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(44)).toBe('1.105');
  });

  it('sets OrderQty tag 38 as string', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(38)).toBe('1000');
  });

  it('sets Account tag 1', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(1)).toBe('ACC001');
  });

  it('sets SenderSubID tag 50 as traderId', () => {
    const m = buildNewOrderSingle('CID1', base);
    expect(m.get(50)).toBe('TRD1');
  });

  describe('market order', () => {
    const mkt = { ...base, orderType: 'market' as const, price: undefined };

    it('sets OrdType tag 40 = 1 for market', () => {
      const m = buildNewOrderSingle('CID1', mkt);
      expect(m.get(40)).toBe('1');
    });

    it('omits Price tag 44 for market', () => {
      const m = buildNewOrderSingle('CID1', mkt);
      expect(m.has(44)).toBe(false);
    });

    it('still sets qty, account, traderId for market', () => {
      const m = buildNewOrderSingle('CID1', mkt);
      expect(m.get(38)).toBe('1000');
      expect(m.get(1)).toBe('ACC001');
      expect(m.get(50)).toBe('TRD1');
    });
  });
});
