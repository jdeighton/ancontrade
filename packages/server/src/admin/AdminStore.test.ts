import { describe, it, expect, beforeEach } from 'vitest';
import { AdminStore } from './AdminStore.js';

const SC = { name: 'Local MD', host: '127.0.0.1', port: 9001, senderCompId: 'CLIENT', targetCompId: 'EXCHANGE' };
const TR = { traderId: 'TRADER1' };
const AC = { account: 'ACC001' };

function makeVenue(store: AdminStore) {
  const sc  = store.createSessionConfig(SC);
  const sc2 = store.createSessionConfig({ ...SC, name: 'Local OR', port: 9002 });
  const tr  = store.createTraderIdConfig(TR);
  const ac  = store.createAccountConfig(AC);
  return store.createVenue({
    name: 'Test Venue',
    mdSessionConfigId: sc.id,
    orSessionConfigId: sc2.id,
    traderIdConfigId: tr.id,
    accountConfigIds: [ac.id],
  });
}

describe('AdminStore — SessionConfigs', () => {
  let store: AdminStore;
  beforeEach(() => { store = new AdminStore(':memory:'); });

  it('creates a session config and lists it back', () => {
    const created = store.createSessionConfig(SC);
    expect(created).toMatchObject(SC);
    expect(typeof created.id).toBe('string');
    expect(store.listSessionConfigs()).toEqual([created]);
  });

  it('getSessionConfig returns the record by id; undefined for unknown', () => {
    const created = store.createSessionConfig(SC);
    expect(store.getSessionConfig(created.id)).toEqual(created);
    expect(store.getSessionConfig('unknown')).toBeUndefined();
  });

  it('updateSessionConfig changes fields', () => {
    const created = store.createSessionConfig(SC);
    const updated = store.updateSessionConfig(created.id, { host: '10.0.0.1', port: 9999 });
    expect(updated.host).toBe('10.0.0.1');
    expect(updated.port).toBe(9999);
    expect(updated.name).toBe(SC.name);
    expect(store.getSessionConfig(created.id)).toEqual(updated);
  });

  it('deleteSessionConfig removes the record', () => {
    const created = store.createSessionConfig(SC);
    store.deleteSessionConfig(created.id);
    expect(store.listSessionConfigs()).toEqual([]);
  });

  it('deleteSessionConfig throws if referenced by a Venue', () => {
    const venue = makeVenue(store);
    const sc = store.getSessionConfig(venue.mdSessionConfigId)!;
    expect(() => store.deleteSessionConfig(sc.id)).toThrow(/referenced by a Venue/);
  });
});

describe('AdminStore — TraderIdConfigs', () => {
  let store: AdminStore;
  beforeEach(() => { store = new AdminStore(':memory:'); });

  it('creates and lists trader ID configs; displayAlias is optional', () => {
    const withAlias    = store.createTraderIdConfig({ traderId: 'T1', displayAlias: 'Alice' });
    const withoutAlias = store.createTraderIdConfig({ traderId: 'T2' });
    expect(withAlias.displayAlias).toBe('Alice');
    expect(withoutAlias.displayAlias).toBeUndefined();
    expect(store.listTraderIdConfigs()).toHaveLength(2);
  });

  it('updateTraderIdConfig patches fields', () => {
    const created = store.createTraderIdConfig(TR);
    const updated  = store.updateTraderIdConfig(created.id, { displayAlias: 'New Alias' });
    expect(updated.traderId).toBe(TR.traderId);
    expect(updated.displayAlias).toBe('New Alias');
  });

  it('deleteTraderIdConfig throws if referenced by a Venue', () => {
    const venue = makeVenue(store);
    expect(() => store.deleteTraderIdConfig(venue.traderIdConfigId)).toThrow(/referenced by a Venue/);
  });

  it('deleteTraderIdConfig succeeds when not referenced', () => {
    const created = store.createTraderIdConfig(TR);
    store.deleteTraderIdConfig(created.id);
    expect(store.listTraderIdConfigs()).toEqual([]);
  });
});

describe('AdminStore — AccountConfigs', () => {
  let store: AdminStore;
  beforeEach(() => { store = new AdminStore(':memory:'); });

  it('creates and lists account configs; displayAlias is optional', () => {
    const a = store.createAccountConfig({ account: 'A1', displayAlias: 'Main' });
    const b = store.createAccountConfig({ account: 'A2' });
    expect(a.displayAlias).toBe('Main');
    expect(b.displayAlias).toBeUndefined();
    expect(store.listAccountConfigs()).toHaveLength(2);
  });

  it('deleteAccountConfig throws if referenced by a Venue', () => {
    const venue = makeVenue(store);
    expect(() => store.deleteAccountConfig(venue.accountConfigIds[0])).toThrow(/referenced by a Venue/);
  });

  it('deleteAccountConfig succeeds when not referenced', () => {
    const a = store.createAccountConfig(AC);
    store.deleteAccountConfig(a.id);
    expect(store.listAccountConfigs()).toEqual([]);
  });
});

describe('AdminStore — Venues', () => {
  let store: AdminStore;
  beforeEach(() => { store = new AdminStore(':memory:'); });

  it('creates a venue with multiple accounts and lists it back', () => {
    const sc1 = store.createSessionConfig(SC);
    const sc2 = store.createSessionConfig({ ...SC, name: 'OR', port: 9002 });
    const tr  = store.createTraderIdConfig(TR);
    const a1  = store.createAccountConfig({ account: 'A1' });
    const a2  = store.createAccountConfig({ account: 'A2' });
    const venue = store.createVenue({
      name: 'Venue A',
      mdSessionConfigId: sc1.id,
      orSessionConfigId: sc2.id,
      traderIdConfigId: tr.id,
      accountConfigIds: [a1.id, a2.id],
    });
    expect(venue.accountConfigIds).toContain(a1.id);
    expect(venue.accountConfigIds).toContain(a2.id);
    expect(store.listVenues()).toEqual([venue]);
  });

  it('updateVenue replaces account list', () => {
    const venue = makeVenue(store);
    const extra = store.createAccountConfig({ account: 'EXTRA' });
    const updated = store.updateVenue(venue.id, { accountConfigIds: [extra.id] });
    expect(updated.accountConfigIds).toEqual([extra.id]);
    expect(store.getVenue(venue.id)?.accountConfigIds).toEqual([extra.id]);
  });

  it('deleteVenue removes it; previously blocked session config can now be deleted', () => {
    const venue = makeVenue(store);
    const scId = venue.mdSessionConfigId;
    store.deleteVenue(venue.id);
    expect(store.listVenues()).toEqual([]);
    expect(() => store.deleteSessionConfig(scId)).not.toThrow();
  });
});

describe('AdminStore — Orders', () => {
  let store: AdminStore;
  beforeEach(() => { store = new AdminStore(':memory:'); });

  const baseOrder = {
    clOrdId: '20260530-120000-1',
    venueId: 'venue-1',
    symbol: 'EUR/USD',
    side: 'buy' as const,
    price: 1.105,
    quantity: 1000,
    account: 'ACC001',
    traderId: 'TRD1',
  };

  it('createOrder stores order with PendingNew status', () => {
    const rec = store.createOrder(baseOrder);
    expect(rec).toEqual({ ...baseOrder, status: 'PendingNew', filledQty: 0 });
  });

  it('getOrder returns the stored order', () => {
    store.createOrder(baseOrder);
    expect(store.getOrder(baseOrder.clOrdId)).toEqual({ ...baseOrder, status: 'PendingNew', filledQty: 0 });
  });

  it('listOrders returns all orders in insertion order', () => {
    const a = store.createOrder(baseOrder);
    const b = store.createOrder({ ...baseOrder, clOrdId: '20260530-120000-2' });
    expect(store.listOrders()).toEqual([a, b]);
  });

  it('updateOrderStatus changes status and filledQty', () => {
    store.createOrder(baseOrder);
    const updated = store.updateOrderStatus(baseOrder.clOrdId, { status: 'PartiallyFilled', filledQty: 500 });
    expect(updated.status).toBe('PartiallyFilled');
    expect(updated.filledQty).toBe(500);
    expect(store.getOrder(baseOrder.clOrdId)?.status).toBe('PartiallyFilled');
  });

  it('deleteAllOrders removes every order', () => {
    store.createOrder(baseOrder);
    store.deleteAllOrders();
    expect(store.listOrders()).toEqual([]);
  });
});
