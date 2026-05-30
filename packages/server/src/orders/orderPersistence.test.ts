import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../server.js';
import type { IFIXEngine, IFIXSession } from '../venue/VenueManager.js';

// ─── Stubs ────────────────────────────────────────────────────────────────────

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
  sendMessage(sessionId: string, fields: Map<number, string>) { this.sent.push({ sessionId, fields }); }
  onMessage(cb: (sessionId: string, raw: string) => void) {
    this.msgCbs.push(cb);
    return () => { this.msgCbs = this.msgCbs.filter(c => c !== cb); };
  }
  triggerIncoming(sessionId: string, raw: string) { this.msgCbs.forEach(cb => cb(sessionId, raw)); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeConnectedServer(dbPath = ':memory:') {
  const engine = new StubFIXEngine();
  const app = buildServer(dbPath, engine);

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

const tempFiles: string[] = [];

function tempDbPath(): string {
  const p = join(tmpdir(), `ancontrade-test-${randomUUID()}.db`);
  tempFiles.push(p);
  return p;
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    try { if (existsSync(f)) unlinkSync(f); } catch { /* best-effort cleanup */ }
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /admin/orders/reset', () => {
  it('returns 204 and GET /orders becomes empty', async () => {
    const { app, venueId } = await makeConnectedServer();
    await app.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });
    const beforeReset = await app.inject({ method: 'GET', url: '/orders' });
    expect(beforeReset.json()).toHaveLength(1);

    const resetRes = await app.inject({ method: 'POST', url: '/admin/orders/reset' });
    expect(resetRes.statusCode).toBe(204);

    const afterReset = await app.inject({ method: 'GET', url: '/orders' });
    expect(afterReset.json()).toEqual([]);
  });
});

describe('SQLite persistence across server restarts', () => {
  it('orders submitted in one server instance are visible after restart', async () => {
    const dbPath = tempDbPath();
    const { app: app1, venueId } = await makeConnectedServer(dbPath);

    const postRes = await app1.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'sell', price: 1.105, quantity: 500, account: 'ACC001', traderId: 'TRD1' },
    });
    expect(postRes.statusCode).toBe(201);
    const { clOrdId } = postRes.json();

    // Close first server to release the SQLite file lock
    await app1.close();

    // Simulate restart: new server instance with same DB file
    const { app: app2 } = await makeConnectedServer(dbPath);
    const res = await app2.inject({ method: 'GET', url: '/orders' });
    const orders = res.json();
    expect(orders).toHaveLength(1);
    expect(orders[0].clOrdId).toBe(clOrdId);
    expect(orders[0].symbol).toBe('EUR/USD');
    expect(orders[0].status).toBe('PendingNew');
    await app2.close();
  });

  it('reset clears the file-backed DB so the next restart sees an empty blotter', async () => {
    const dbPath = tempDbPath();
    const { app: app1, venueId } = await makeConnectedServer(dbPath);
    await app1.inject({
      method: 'POST', url: '/orders',
      body: { venueId, symbol: 'EUR/USD', side: 'buy', price: 1.105, quantity: 1000, account: 'ACC001', traderId: 'TRD1' },
    });

    const resetRes = await app1.inject({ method: 'POST', url: '/admin/orders/reset' });
    expect(resetRes.statusCode).toBe(204);
    await app1.close();

    const { app: app2 } = await makeConnectedServer(dbPath);
    const res = await app2.inject({ method: 'GET', url: '/orders' });
    expect(res.json()).toEqual([]);
    await app2.close();
  });
});
