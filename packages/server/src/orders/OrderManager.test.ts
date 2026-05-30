import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ClientOrderIdGenerator } from '@ancontrade/shared';
import { AdminStore } from '../admin/AdminStore.js';
import { OrderManager } from './OrderManager.js';
import type { IFIXEngine, IFIXSession } from '../venue/VenueManager.js';
import { VenueManager } from '../venue/VenueManager.js';

// ─── Stubs ────────────────────────────────────────────────────────────────────

class StubSession extends EventEmitter implements IFIXSession {
  constructor(readonly id: string) { super(); }
  triggerStatus(s: string) { this.emit('status', s); }
}

class StubFIXEngine implements IFIXEngine {
  private sessions = new Map<string, StubSession>();
  private msgCbs: Array<(id: string, raw: string) => void> = [];
  readonly sent: Array<{ sessionId: string; fields: Map<number, string> }> = [];

  addSession(cfg: { senderCompId: string; targetCompId: string }): IFIXSession {
    const id = `${cfg.senderCompId}-${cfg.targetCompId}-FIX.4.4`;
    const s = new StubSession(id);
    this.sessions.set(id, s);
    return s;
  }
  async removeSession(id: string) { this.sessions.delete(id); }
  sendMessage(sid: string, fields: Map<number, string>) { this.sent.push({ sessionId: sid, fields }); }
  onMessage(cb: (id: string, raw: string) => void) {
    this.msgCbs.push(cb);
    return () => { this.msgCbs = this.msgCbs.filter(c => c !== cb); };
  }
  triggerIncoming(sessionId: string, raw: string) { this.msgCbs.forEach(cb => cb(sessionId, raw)); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SOH = '\x01';
function erRaw(fields: Record<number, string>) {
  return Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);
}

function makeSetup() {
  const store = new AdminStore(':memory:');
  const mdSC = store.createSessionConfig({ name: 'MD', host: '127.0.0.1', port: 9001, senderCompId: 'CLI', targetCompId: 'MD_EXCH' });
  const orSC = store.createSessionConfig({ name: 'OR', host: '127.0.0.1', port: 9002, senderCompId: 'CLI', targetCompId: 'OR_EXCH' });
  const tr   = store.createTraderIdConfig({ traderId: 'TRD1' });
  const ac   = store.createAccountConfig({ account: 'ACC001' });
  const venue = store.createVenue({ name: 'V', mdSessionConfigId: mdSC.id, orSessionConfigId: orSC.id, traderIdConfigId: tr.id, accountConfigIds: [ac.id] });

  const engine = new StubFIXEngine();
  const vm = new VenueManager(engine, store);
  vm.connect(venue.id);

  // Pre-create an order in PendingNew state
  const order = store.createOrder({
    clOrdId: 'CID1', venueId: venue.id, symbol: 'EUR/USD',
    side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1',
  });

  const om = new OrderManager(new ClientOrderIdGenerator(new Date()), vm, store);
  const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

  return { store, engine, vm, om, order, venue, orSessionId };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderManager — execution report state machine', () => {
  let store: AdminStore;
  let engine: StubFIXEngine;
  let om: OrderManager;
  let orSessionId: string;

  beforeEach(() => {
    ({ store, engine, om, orSessionId } = makeSetup());
  });

  it('PendingNew → New on OrdStatus=0, records exchOrdId', () => {
    const raw = erRaw({ 35: '8', 11: 'CID1', 37: 'EXCH001', 39: '0', 14: '0', 6: '0' });
    engine.triggerIncoming(orSessionId, raw);
    const order = store.getOrder('CID1')!;
    expect(order.status).toBe('New');
    expect(order.exchOrdId).toBe('EXCH001');
  });

  it('New → PartiallyFilled on OrdStatus=1, updates filledQty and avgFillPrice', () => {
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'EXCH001', 39: '0', 14: '0', 6: '0' }));
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'EXCH001', 39: '1', 14: '500', 6: '1.1050' }));
    const order = store.getOrder('CID1')!;
    expect(order.status).toBe('PartiallyFilled');
    expect(order.filledQty).toBe(500);
    expect(order.avgFillPrice).toBe(1.1050);
  });

  it('PartiallyFilled → Filled on OrdStatus=2', () => {
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '0', 14: '0', 6: '0' }));
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '1', 14: '500', 6: '1.105' }));
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '2', 14: '1000', 6: '1.105' }));
    expect(store.getOrder('CID1')!.status).toBe('Filled');
    expect(store.getOrder('CID1')!.filledQty).toBe(1000);
  });

  it('any state → Cancelled on OrdStatus=4', () => {
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '4', 14: '0', 6: '0' }));
    expect(store.getOrder('CID1')!.status).toBe('Cancelled');
  });

  it('ignores ER for unknown clOrdId', () => {
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'UNKNOWN', 37: 'E', 39: '0', 14: '0', 6: '0' }));
    expect(store.getOrder('CID1')!.status).toBe('PendingNew');
  });

  it('ignores non-ER messages on OR session', () => {
    engine.triggerIncoming(orSessionId, erRaw({ 35: 'D', 11: 'CID1' }));
    expect(store.getOrder('CID1')!.status).toBe('PendingNew');
  });

  it('onOrderUpdate fires with updated record on each ER', () => {
    const updates: import('../admin/AdminStore.js').OrderRecord[] = [];
    om.onOrderUpdate(r => updates.push(r));
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '0', 14: '0', 6: '0' }));
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '2', 14: '1000', 6: '1.105' }));
    expect(updates).toHaveLength(2);
    expect(updates[0].status).toBe('New');
    expect(updates[1].status).toBe('Filled');
  });

  it('onOrderUpdate unsubscribe stops further callbacks', () => {
    const updates: unknown[] = [];
    const unsub = om.onOrderUpdate(r => updates.push(r));
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '0', 14: '0', 6: '0' }));
    unsub();
    engine.triggerIncoming(orSessionId, erRaw({ 35: '8', 11: 'CID1', 37: 'E', 39: '2', 14: '1000', 6: '1.105' }));
    expect(updates).toHaveLength(1);
  });
});
