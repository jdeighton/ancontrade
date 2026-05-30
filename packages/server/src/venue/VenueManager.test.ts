import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { AdminStore } from '../admin/AdminStore.js';
import { VenueManager } from './VenueManager.js';
import type { IFIXEngine, IFIXSession } from './VenueManager.js';

// ─── Stubs ────────────────────────────────────────────────────────────────────

class StubSession extends EventEmitter implements IFIXSession {
  constructor(readonly id: string) { super(); }
  triggerStatus(status: string) { this.emit('status', status); }
}

class StubFIXEngine implements IFIXEngine {
  private sessions = new Map<string, StubSession>();
  readonly sentMessages: Array<{ sessionId: string; fields: Map<number, string> }> = [];

  addSession(config: { senderCompId: string; targetCompId: string }): IFIXSession {
    const id = `${config.senderCompId}-${config.targetCompId}-FIX.4.4`;
    const session = new StubSession(id);
    this.sessions.set(id, session);
    return session;
  }

  async removeSession(id: string) { this.sessions.delete(id); }

  sendMessage(sessionId: string, fields: Map<number, string>) {
    this.sentMessages.push({ sessionId, fields });
  }

  trigger(id: string, status: string) {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`StubFIXEngine: no session '${id}'`);
    s.triggerStatus(status);
  }

  sessionCount() { return this.sessions.size; }
  sessionIds()   { return [...this.sessions.keys()]; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  const store = new AdminStore(':memory:');
  const mdSC = store.createSessionConfig({ name: 'MD', host: '127.0.0.1', port: 9001, senderCompId: 'CLI', targetCompId: 'MD_EXCH' });
  const orSC = store.createSessionConfig({ name: 'OR', host: '127.0.0.1', port: 9002, senderCompId: 'CLI', targetCompId: 'OR_EXCH' });
  const tr   = store.createTraderIdConfig({ traderId: 'TRADER1' });
  const ac   = store.createAccountConfig({ account: 'ACC001' });
  const venue = store.createVenue({
    name: 'Test Venue',
    mdSessionConfigId: mdSC.id,
    orSessionConfigId: orSC.id,
    traderIdConfigId: tr.id,
    accountConfigIds: [ac.id],
  });
  return { store, venue, mdSC, orSC };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VenueManager', () => {
  let engine: StubFIXEngine;
  let store: AdminStore;
  let vm: VenueManager;
  let venueId: string;
  let mdSessionId: string;
  let orSessionId: string;

  beforeEach(() => {
    engine = new StubFIXEngine();
    const { store: s, venue, mdSC, orSC } = makeStore();
    store  = s;
    venueId = venue.id;
    vm = new VenueManager(engine, store);
    vm.connect(venueId);
    mdSessionId = `CLI-MD_EXCH-FIX.4.4`;
    orSessionId = `CLI-OR_EXCH-FIX.4.4`;
  });

  it('both sessions active → getStatus returns fully connected', () => {
    engine.trigger(mdSessionId, 'active');
    engine.trigger(orSessionId, 'active');
    expect(vm.getStatus(venueId)).toEqual({ venueId, mdConnected: true, orConnected: true });
  });

  it('only MD active → partial status', () => {
    engine.trigger(mdSessionId, 'active');
    expect(vm.getStatus(venueId)).toEqual({ venueId, mdConnected: true, orConnected: false });
  });

  it('onStatusChange callback fires on each status event', () => {
    const events: import('./VenueManager.js').VenueStatus[] = [];
    vm.onStatusChange(s => events.push(s));
    engine.trigger(mdSessionId, 'active');
    engine.trigger(orSessionId, 'active');
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ venueId, mdConnected: true,  orConnected: false });
    expect(events[1]).toEqual({ venueId, mdConnected: true,  orConnected: true  });
  });

  it('onStatusChange unsubscribe stops further callbacks', () => {
    const events: unknown[] = [];
    const unsub = vm.onStatusChange(s => events.push(s));
    engine.trigger(mdSessionId, 'active');
    unsub();
    engine.trigger(orSessionId, 'active');
    expect(events).toHaveLength(1);
  });

  it('connect is idempotent — second call does not open more sessions', () => {
    const before = engine.sessionCount();
    vm.connect(venueId);
    expect(engine.sessionCount()).toBe(before);
  });

  it('disconnect removes sessions and status shows fully disconnected', async () => {
    engine.trigger(mdSessionId, 'active');
    engine.trigger(orSessionId, 'active');
    const events: import('./VenueManager.js').VenueStatus[] = [];
    vm.onStatusChange(s => events.push(s));
    await vm.disconnect(venueId);
    expect(engine.sessionCount()).toBe(0);
    expect(vm.getStatus(venueId)).toEqual({ venueId, mdConnected: false, orConnected: false });
    expect(events.at(-1)).toEqual({ venueId, mdConnected: false, orConnected: false });
  });

  it('disconnect for unknown venue is a no-op', async () => {
    await expect(vm.disconnect('unknown-venue-id')).resolves.toBeUndefined();
  });

  it('sendOrderMessage routes message to the OR session', () => {
    const fields = new Map([[35, 'D'], [11, 'CID1']]);
    vm.sendOrderMessage(venueId, fields);
    expect(engine.sentMessages).toHaveLength(1);
    expect(engine.sentMessages[0].sessionId).toBe(orSessionId);
    expect(engine.sentMessages[0].fields).toBe(fields);
  });

  it('sendOrderMessage throws when venue is not connected', () => {
    expect(() => vm.sendOrderMessage('unknown-venue-id', new Map())).toThrow('not connected');
  });
});
