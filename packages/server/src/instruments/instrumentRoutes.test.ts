import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { buildServer } from '../server.js';
import type { IFIXEngine, IFIXSession } from '../venue/VenueManager.js';

// ─── Stub engine ─────────────────────────────────────────────────────────────

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
  sendMessage(sessionId: string, fields: Map<number, string>) { this.sent.push({ sessionId, fields }); }
  onMessage(cb: (id: string, raw: string) => void) {
    this.msgCbs.push(cb);
    return () => { this.msgCbs = this.msgCbs.filter(c => c !== cb); };
  }
  trigger(id: string, status: string) { this.sessions.get(id)?.triggerStatus(status); }
  triggerIncoming(sessionId: string, raw: string) { this.msgCbs.forEach(cb => cb(sessionId, raw)); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeConnectedServer() {
  const engine = new StubFIXEngine();
  const app = buildServer(':memory:', engine);

  let res = await app.inject({ method: 'POST', url: '/admin/session-configs', body: { name: 'MD', host: '127.0.0.1', port: 9001, senderCompId: 'CLI', targetCompId: 'MD_EXCH' } });
  const mdSC = res.json();
  res = await app.inject({ method: 'POST', url: '/admin/session-configs', body: { name: 'OR', host: '127.0.0.1', port: 9002, senderCompId: 'CLI', targetCompId: 'OR_EXCH' } });
  const orSC = res.json();
  res = await app.inject({ method: 'POST', url: '/admin/trader-id-configs', body: { traderId: 'TRD1' } });
  const tr = res.json();
  res = await app.inject({ method: 'POST', url: '/admin/account-configs', body: { account: 'ACC001' } });
  const ac = res.json();
  res = await app.inject({ method: 'POST', url: '/admin/venues', body: { name: 'Test', mdSessionConfigId: mdSC.id, orSessionConfigId: orSC.id, traderIdConfigId: tr.id, accountConfigIds: [ac.id] } });
  const venue = res.json();

  await app.inject({ method: 'POST', url: `/venues/${venue.id}/connect` });

  return { app, engine, venueId: venue.id, mdSessionId: 'CLI-MD_EXCH-FIX.4.4' };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /venues/:id/instruments', () => {
  it('returns [] before any SecurityList arrives', async () => {
    const { app, venueId } = await makeConnectedServer();
    const res = await app.inject({ method: 'GET', url: `/venues/${venueId}/instruments` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns instruments after 35=y is received', async () => {
    const { app, engine, venueId, mdSessionId } = await makeConnectedServer();
    const raw = '35=y\x01146=2\x0155=EUR/USD\x01969=0.0001\x01231=100000\x0115=EUR\x01541=20261231\x0155=GBP/USD\x01969=0.0001\x01231=100000\x0115=GBP\x01541=20271231';
    engine.triggerIncoming(mdSessionId, raw);
    const res = await app.inject({ method: 'GET', url: `/venues/${venueId}/instruments` });
    const instrs = res.json();
    expect(instrs).toHaveLength(2);
    expect(instrs[0].symbol).toBe('EUR/USD');
    expect(instrs[0].tickSize).toBe(0.0001);
    expect(instrs[1].symbol).toBe('GBP/USD');
  });

  it('sends 35=x when MD session becomes active', async () => {
    const { engine, mdSessionId } = await makeConnectedServer();
    engine.trigger(mdSessionId, 'active');
    const req = engine.sent.find(m => m.fields.get(35) === 'x');
    expect(req).toBeDefined();
    expect(req!.sessionId).toBe(mdSessionId);
  });
});
