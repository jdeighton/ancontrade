import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { MarketDataManager } from './MarketDataManager.js';
import type { IFIXEngine, IFIXSession } from '../venue/VenueManager.js';

// ─── Stub ─────────────────────────────────────────────────────────────────────

const SOH = '\x01';
const fix = (fields: [number, string][]) => fields.map(([t, v]) => `${t}=${v}`).join(SOH);

class StubSession extends EventEmitter implements IFIXSession {
  constructor(readonly id: string) { super(); }
}

class StubFIXEngine implements IFIXEngine {
  private msgCbs: Array<(id: string, raw: string) => void> = [];
  readonly sent: Array<{ sessionId: string; fields: Map<number, string> }> = [];

  addSession(config: { senderCompId: string; targetCompId: string }): IFIXSession {
    return new StubSession(`${config.senderCompId}-${config.targetCompId}-FIX.4.4`);
  }
  async removeSession(_id: string) {}
  sendMessage(sessionId: string, fields: Map<number, string>) { this.sent.push({ sessionId, fields }); }
  onMessage(cb: (id: string, raw: string) => void) {
    this.msgCbs.push(cb);
    return () => { this.msgCbs = this.msgCbs.filter(c => c !== cb); };
  }
  trigger(sessionId: string, raw: string) { this.msgCbs.forEach(c => c(sessionId, raw)); }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const MD_SESSION = 'CLI-MD_EXCH-FIX.4.4';
const TICK = 0.0001;

describe('MarketDataManager', () => {
  let engine: StubFIXEngine;
  let mdm: MarketDataManager;

  beforeEach(() => {
    engine = new StubFIXEngine();
    mdm = new MarketDataManager(engine);
  });

  it('subscribe sends 35=V with SubscriptionRequestType=1 on the MD session', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    expect(engine.sent).toHaveLength(1);
    expect(engine.sent[0].sessionId).toBe(MD_SESSION);
    expect(engine.sent[0].fields.get(35)).toBe('V');
    expect(engine.sent[0].fields.get(263)).toBe('1');
    expect(engine.sent[0].fields.get(55)).toBe('EUR/USD');
  });

  it('unsubscribe sends 35=V with SubscriptionRequestType=2', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    mdm.unsubscribe(MD_SESSION, 'EUR/USD');
    expect(engine.sent[1].fields.get(263)).toBe('2');
  });

  it('35=W snapshot fires price-levels event', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const events: any[] = [];
    mdm.onPriceLevels(e => events.push(e));

    engine.trigger(MD_SESSION, fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '0'], [278, 'B1'], [270, '1.1050'], [271, '1000'],
      [269, '1'], [278, 'A1'], [270, '1.1051'], [271, '500'],
    ]));

    expect(events).toHaveLength(1);
    expect(events[0].symbol).toBe('EUR/USD');
    expect(events[0].bids[0]).toEqual({ price: 1.105, volume: 1000, count: 1 });
    expect(events[0].asks[0]).toEqual({ price: 1.1051, volume: 500, count: 1 });
  });

  it('35=X incremental fires price-levels event updating the book', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const events: any[] = [];
    mdm.onPriceLevels(e => events.push(e));

    engine.trigger(MD_SESSION, fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '0'], [278, 'B1'], [270, '1.1050'], [271, '1000'],
    ]));
    engine.trigger(MD_SESSION, fix([
      [35, 'X'],
      [279, '0'], [269, '1'], [278, 'A1'], [55, 'EUR/USD'], [270, '1.1051'], [271, '300'],
    ]));

    expect(events).toHaveLength(2);
    expect(events[1].asks[0]).toEqual({ price: 1.1051, volume: 300, count: 1 });
  });

  it('messages for unsubscribed session are ignored', () => {
    const events: any[] = [];
    mdm.onPriceLevels(e => events.push(e));

    engine.trigger('OTHER-SESSION', fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '0'], [278, 'B1'], [270, '1.105'], [271, '100'],
    ]));

    expect(events).toHaveLength(0);
  });

  it('unsubscribe clears the cache; subsequent snapshot starts fresh', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const events: any[] = [];
    mdm.onPriceLevels(e => events.push(e));

    engine.trigger(MD_SESSION, fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '0'], [278, 'B1'], [270, '1.105'], [271, '100'],
    ]));
    mdm.unsubscribe(MD_SESSION, 'EUR/USD');

    // re-subscribe and replay snapshot
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    engine.trigger(MD_SESSION, fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '1'], [278, 'A1'], [270, '1.106'], [271, '50'],
    ]));

    const last = events[events.length - 1];
    expect(last.bids).toHaveLength(0);
    expect(last.asks[0].price).toBe(1.106);
  });

  it('35=Y fires status-alert with md-reject kind and decoded reason', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const reqId = engine.sent[0].fields.get(262)!;

    const alerts: any[] = [];
    mdm.onStatusAlert(e => alerts.push(e));

    engine.trigger(MD_SESSION, fix([[35, 'Y'], [262, reqId], [281, '0'], [58, 'Unknown symbol']]));

    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('md-reject');
    expect(alerts[0].message).toContain('Unknown symbol');
    expect(alerts[0].ts).toBeDefined();
  });

  it('35=Y clears the subscription so re-subscribe is allowed', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const reqId = engine.sent[0].fields.get(262)!;

    engine.trigger(MD_SESSION, fix([[35, 'Y'], [262, reqId], [281, '0']]));

    // Should be able to subscribe again without being silently ignored
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const subscribeMsgs = engine.sent.filter(m => m.fields.get(35) === 'V' && m.fields.get(263) === '1');
    expect(subscribeMsgs).toHaveLength(2);
  });

  it('depth defaults to 5', () => {
    mdm.subscribe(MD_SESSION, 'EUR/USD', TICK);
    const events: any[] = [];
    mdm.onPriceLevels(e => events.push(e));

    engine.trigger(MD_SESSION, fix([
      [35, 'W'], [55, 'EUR/USD'],
      [269, '0'], [278, 'B1'], [270, '1.1050'], [271, '100'],
    ]));

    expect(events[0].bids).toHaveLength(20);
  });
});
