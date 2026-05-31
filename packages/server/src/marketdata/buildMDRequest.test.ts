import { describe, it, expect } from 'vitest';
import { buildMDRequest } from './buildMDRequest.js';

describe('buildMDRequest', () => {
  it('subscribe: MsgType=V, SubscriptionRequestType=1, MarketDepth=0', () => {
    const fields = buildMDRequest('REQ1', 'EUR/USD', 'subscribe');
    expect(fields.get(35)).toBe('V');
    expect(fields.get(262)).toBe('REQ1');
    expect(fields.get(263)).toBe('1');
    expect(fields.get(264)).toBe('0');
  });

  it('subscribe: symbol set', () => {
    const fields = buildMDRequest('REQ1', 'GBP/USD', 'subscribe');
    expect(fields.get(55)).toBe('GBP/USD');
  });

  it('unsubscribe: SubscriptionRequestType=2', () => {
    const fields = buildMDRequest('REQ2', 'EUR/USD', 'unsubscribe');
    expect(fields.get(35)).toBe('V');
    expect(fields.get(263)).toBe('2');
  });

  it('subscribe: NoMDEntryTypes=2 and both bid (0) and ask (1) present', () => {
    const fields = buildMDRequest('REQ1', 'EUR/USD', 'subscribe');
    expect(fields.get(267)).toBe('2');
    // bid and ask MDEntryType values encoded as repeated tag 269
    const entryTypes = fields.get(269)?.split(',') ?? [];
    expect(entryTypes).toContain('0');
    expect(entryTypes).toContain('1');
  });
});
