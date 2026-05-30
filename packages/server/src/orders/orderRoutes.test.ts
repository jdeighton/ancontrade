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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeConnectedServer() {
  const engine = new StubFIXEngine();
  const app = buildServer(':memory:', engine);

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
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
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
    const app = buildServer(':memory:', engine);
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
