import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { buildServer } from '../server.js';
import type { IFIXEngine, IFIXSession } from '../venue/VenueManager.js';

// ─── Stub engine ─────────────────────────────────────────────────────────────

class StubSession extends EventEmitter implements IFIXSession {
  constructor(readonly id: string) { super(); }
}

class StubFIXEngine implements IFIXEngine {
  private sessions = new Map<string, StubSession>();
  private msgCbs: Array<(id: string, raw: string) => void> = [];
  readonly sent: Array<{ sessionId: string; fields: Map<number, string> }> = [];

  addSession(config: { senderCompId: string; targetCompId: string }): IFIXSession {
    const id = `${config.senderCompId}-${config.targetCompId}-FIX.4.4`;
    const s = new StubSession(id);
    this.sessions.set(id, s);
    return s;
  }

  async removeSession(id: string) { this.sessions.delete(id); }

  sendMessage(sessionId: string, fields: Map<number, string>) {
    this.sent.push({ sessionId, fields });
  }

  onMessage(cb: (sessionId: string, raw: string) => void) {
    this.msgCbs.push(cb);
    return () => { this.msgCbs = this.msgCbs.filter(c => c !== cb); };
  }

  triggerIncoming(sessionId: string, raw: string) {
    this.msgCbs.forEach(cb => cb(sessionId, raw));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeConnectedServer() {
  const engine = new StubFIXEngine();
  const app = await buildServer(':memory:', engine);

  // Create minimal admin config
  let res = await app.inject({ method: 'POST', url: '/admin/session-configs', body: { name: 'MD', host: '127.0.0.1', port: 9001, senderCompId: 'CLI', targetCompId: 'MD_EXCH' } });
  const mdSC = res.json();

  res = await app.inject({ method: 'POST', url: '/admin/session-configs', body: { name: 'OR', host: '127.0.0.1', port: 9002, senderCompId: 'CLI', targetCompId: 'OR_EXCH' } });
  const orSC = res.json();

  res = await app.inject({ method: 'POST', url: '/admin/trader-id-configs', body: { traderId: 'TRD1' } });
  const tr = res.json();

  res = await app.inject({ method: 'POST', url: '/admin/account-configs', body: { account: 'ACC001' } });
  const ac = res.json();

  res = await app.inject({ method: 'POST', url: '/admin/venues', body: { name: 'Test Venue', mdSessionConfigId: mdSC.id, orSessionConfigId: orSC.id, traderIdConfigId: tr.id, accountConfigIds: [ac.id] } });
  const venue = res.json();

  await app.inject({ method: 'POST', url: `/venues/${venue.id}/connect` });

  return { app, engine, venueId: venue.id };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /orders', () => {
  let app: Awaited<ReturnType<typeof makeConnectedServer>>['app'];
  let engine: StubFIXEngine;
  let venueId: string;

  beforeEach(async () => {
    ({ app, engine, venueId } = await makeConnectedServer());
  });

  it('returns 201 with PendingNew order record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('PendingNew');
    expect(body.symbol).toBe('EUR/USD');
    expect(body.side).toBe('buy');
    expect(body.price).toBe(1.105);
    expect(body.quantity).toBe(1000);
    expect(typeof body.clOrdId).toBe('string');
  });

  it('sends FIX 35=D on the OR session with correct tags', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', orderType: 'limit', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = res.json();
    expect(engine.sent).toHaveLength(1);
    const { sessionId, fields } = engine.sent[0];
    expect(sessionId).toBe('CLI-OR_EXCH-FIX.4.4');
    expect(fields.get(35)).toBe('D');
    expect(fields.get(11)).toBe(clOrdId);
    expect(fields.get(55)).toBe('EUR/USD');
    expect(fields.get(54)).toBe('1');
    expect(fields.get(40)).toBe('2');
    expect(fields.get(44)).toBe('1.105');
    expect(fields.get(38)).toBe('1000');
    expect(fields.get(1)).toBe('ACC001');
    expect(fields.get(50)).toBe('TRD1');
  });

  it('returns 404 when venue is not connected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      body: { venueId: 'nonexistent', symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /orders', () => {
  it('returns empty array initially', async () => {
    const engine = new StubFIXEngine();
    const app = await buildServer(':memory:', engine);
    const res = await app.inject({ method: 'GET', url: '/orders' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns submitted orders', async () => {
    const { app, venueId } = await makeConnectedServer();
    await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'sell', price: 1.105, quantity: 500, account: 'ACC001', traderId: 'TRD1' },
    });
    const res = await app.inject({ method: 'GET', url: '/orders' });
    const orders = res.json();
    expect(orders).toHaveLength(1);
    expect(orders[0].symbol).toBe('EUR/USD');
    expect(orders[0].status).toBe('PendingNew');
  });
});

describe('Execution report sequence — PendingNew → New → PartiallyFilled → Filled', () => {
  const SOH = '\x01';
  const er = (fields: Record<number, string>) =>
    Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);

  it('replays ER sequence and final GET /orders reflects Filled state', async () => {
    const { app, engine, venueId } = await makeConnectedServer();

    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();
    const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

    // ER sequence: new → partial → filled
    engine.triggerIncoming(orSessionId, er({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '0', 14: '0', 6: '0' }));
    engine.triggerIncoming(orSessionId, er({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '1', 14: '500', 6: '1.1050' }));
    engine.triggerIncoming(orSessionId, er({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '2', 14: '1000', 6: '1.1050' }));

    const res = await app.inject({ method: 'GET', url: '/orders' });
    const [order] = res.json();
    expect(order.status).toBe('Filled');
    expect(order.filledQty).toBe(1000);
    expect(order.avgFillPrice).toBe(1.1050);
    expect(order.exchOrdId).toBe('EXCH001');
  });

  it('onOrderUpdate WS callbacks fire on each ER — covered by OrderManager.test.ts', async () => {
    const { app, venueId } = await makeConnectedServer();
    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    expect(postRes.statusCode).toBe(201);
  });
});

describe('Order rejection — 35=8 OrdStatus=8', () => {
  const SOH = '\x01';
  const fix = (fields: Record<number, string>) =>
    Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);

  it('blotter row transitions to Rejected and stores reason', async () => {
    const { app, engine, venueId } = await makeConnectedServer();

    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();
    const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

    engine.triggerIncoming(orSessionId, fix({ 35: '8', 11: clOrdId, 37: 'X', 39: '8', 14: '0', 6: '0', 103: '1', 58: 'Unknown symbol' }));

    const res = await app.inject({ method: 'GET', url: '/orders' });
    const [order] = res.json();
    expect(order.status).toBe('Rejected');
    expect(order.ordRejReason).toBe(1);
    expect(order.rejText).toBe('Unknown symbol');
  });
});

describe('GET /orders/:clOrdId/events', () => {
  const SOH = '\x01';
  const fix = (fields: Record<number, string>) =>
    Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);

  it('returns OUT entry for submitted order and IN entry after ER', async () => {
    const { app, engine, venueId } = await makeConnectedServer();

    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();
    const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

    engine.triggerIncoming(orSessionId, fix({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '0', 14: '0', 6: '0' }));

    const eventsRes = await app.inject({ method: 'GET', url: `/orders/${clOrdId}/events` });
    expect(eventsRes.statusCode).toBe(200);
    const events = eventsRes.json();
    expect(events).toHaveLength(2);
    expect(events[0].dir).toBe('OUT');
    expect(events[0].fields['35']).toBe('D');
    expect(events[0].fields['11']).toBe(clOrdId);
    expect(events[1].dir).toBe('IN');
    expect(events[1].fields['35']).toBe('8');
  });

  it('returns empty array for unknown clOrdId', async () => {
    const { app } = await makeConnectedServer();
    const res = await app.inject({ method: 'GET', url: '/orders/UNKNOWN/events' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('cancel request and cancel reject both appear in events', async () => {
    const { app, engine, venueId } = await makeConnectedServer();

    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();
    const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

    engine.triggerIncoming(orSessionId, fix({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '0', 14: '0', 6: '0' }));
    await app.inject({ method: 'DELETE', url: `/orders/${clOrdId}` });
    const cancelClOrdId = engine.sent[engine.sent.length - 1].fields.get(11)!;
    // 35=9 includes tag 41=OrigClOrdID so FIXMessageLog indexes it under clOrdId
    engine.triggerIncoming(orSessionId, fix({ 35: '9', 11: cancelClOrdId, 41: clOrdId, 102: '1', 58: 'Unknown order' }));

    const eventsRes = await app.inject({ method: 'GET', url: `/orders/${clOrdId}/events` });
    const events = eventsRes.json();
    // OUT: NOS, IN: ER(New), OUT: CancelReq, IN: CancelReject (indexed via tag 41=OrigClOrdID)
    const msgTypes = events.map((e: any) => `${e.dir}:${e.fields['35']}`);
    expect(msgTypes).toContain('OUT:D');
    expect(msgTypes).toContain('OUT:F');
    expect(msgTypes).toContain('IN:9');
  });
});

describe('DELETE /orders/:clOrdId — cancel workflow', () => {
  const SOH = '\x01';
  const fix = (fields: Record<number, string>) =>
    Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);

  it('returns 202 and sends 35=F when order is in New state', async () => {
    const { app, engine, venueId } = await makeConnectedServer();

    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();
    const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

    // Advance to New state
    engine.triggerIncoming(orSessionId, fix({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '0', 14: '0', 6: '0' }));

    const cancelRes = await app.inject({ method: 'DELETE', url: `/orders/${clOrdId}` });
    expect(cancelRes.statusCode).toBe(202);

    const cancelMsg = engine.sent[engine.sent.length - 1];
    expect(cancelMsg.fields.get(35)).toBe('F');
    expect(cancelMsg.fields.get(41)).toBe(clOrdId);
    expect(cancelMsg.fields.get(37)).toBe('EXCH001');
  });

  it('returns 409 when order is in PendingNew state (no exchOrdId)', async () => {
    const { app, venueId } = await makeConnectedServer();
    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();

    const cancelRes = await app.inject({ method: 'DELETE', url: `/orders/${clOrdId}` });
    expect(cancelRes.statusCode).toBe(409);
  });

  it('returns 404 for unknown clOrdId', async () => {
    const { app } = await makeConnectedServer();
    const cancelRes = await app.inject({ method: 'DELETE', url: '/orders/nonexistent' });
    expect(cancelRes.statusCode).toBe(404);
  });

  it('replays 35=9 cancel reject and order remains in prior state', async () => {
    const { app, engine, venueId } = await makeConnectedServer();

    const postRes = await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const { clOrdId } = postRes.json();
    const orSessionId = 'CLI-OR_EXCH-FIX.4.4';

    engine.triggerIncoming(orSessionId, fix({ 35: '8', 11: clOrdId, 37: 'EXCH001', 39: '0', 14: '0', 6: '0' }));
    await app.inject({ method: 'DELETE', url: `/orders/${clOrdId}` });
    const cancelClOrdId = engine.sent[engine.sent.length - 1].fields.get(11)!;

    engine.triggerIncoming(orSessionId, fix({ 35: '9', 11: cancelClOrdId, 41: clOrdId, 102: '1', 58: 'Unknown order' }));

    // Order should remain in New state (cancel was rejected)
    const res = await app.inject({ method: 'GET', url: '/orders' });
    const [order] = res.json();
    expect(order.status).toBe('New');
  });
});
