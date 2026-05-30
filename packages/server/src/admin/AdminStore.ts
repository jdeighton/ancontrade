import { createRequire } from 'module';
import { randomUUID } from 'node:crypto';

// node:sqlite is only exported with the 'node:' prefix in Node 22+, which Vite 5 does
// not recognise as a built-in (it strips the prefix before checking builtinModules).
// Use createRequire to load it at runtime, bypassing Vite's static analysis.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export interface SessionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  senderCompId: string;
  targetCompId: string;
}

export interface TraderIdConfig {
  id: string;
  traderId: string;
  displayAlias?: string;
}

export interface AccountConfig {
  id: string;
  account: string;
  displayAlias?: string;
}

export interface Venue {
  id: string;
  name: string;
  mdSessionConfigId: string;
  orSessionConfigId: string;
  traderIdConfigId: string;
  accountConfigIds: string[];
}

export type OrderStatus = 'PendingNew' | 'New' | 'PartiallyFilled' | 'Filled' | 'Cancelled' | 'Rejected';

export interface OrderRecord {
  clOrdId: string;
  venueId: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  account: string;
  traderId: string;
  status: OrderStatus;
  filledQty: number;
  exchOrdId?: string;
  avgFillPrice?: number;
}

export class AdminStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        sender_comp_id TEXT NOT NULL,
        target_comp_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trader_id_configs (
        id TEXT PRIMARY KEY,
        trader_id TEXT NOT NULL,
        display_alias TEXT
      );
      CREATE TABLE IF NOT EXISTS account_configs (
        id TEXT PRIMARY KEY,
        account TEXT NOT NULL,
        display_alias TEXT
      );
      CREATE TABLE IF NOT EXISTS venues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        md_session_config_id TEXT NOT NULL,
        or_session_config_id TEXT NOT NULL,
        trader_id_config_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS venue_accounts (
        venue_id TEXT NOT NULL,
        account_config_id TEXT NOT NULL,
        PRIMARY KEY (venue_id, account_config_id)
      );
      CREATE TABLE IF NOT EXISTS orders (
        cl_ord_id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL,
        account TEXT NOT NULL,
        trader_id TEXT NOT NULL,
        status TEXT NOT NULL,
        filled_qty REAL NOT NULL DEFAULT 0,
        exch_ord_id TEXT,
        avg_fill_price REAL
      );
    `);
  }

  // ─── Session Configs ──────────────────────────────────────────────────────

  createSessionConfig(data: Omit<SessionConfig, 'id'>): SessionConfig {
    const id = randomUUID();
    this.db.prepare(
      'INSERT INTO session_configs (id, name, host, port, sender_comp_id, target_comp_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, data.name, data.host, data.port, data.senderCompId, data.targetCompId);
    return { id, ...data };
  }

  listSessionConfigs(): SessionConfig[] {
    return (this.db.prepare('SELECT * FROM session_configs').all() as any[]).map(rowToSessionConfig);
  }

  getSessionConfig(id: string): SessionConfig | undefined {
    const row = this.db.prepare('SELECT * FROM session_configs WHERE id = ?').get(id) as any;
    return row ? rowToSessionConfig(row) : undefined;
  }

  updateSessionConfig(id: string, patch: Partial<Omit<SessionConfig, 'id'>>): SessionConfig {
    const existing = this.getSessionConfig(id);
    if (!existing) throw new Error(`SessionConfig ${id} not found`);
    const updated = { ...existing, ...patch };
    this.db.prepare(
      'UPDATE session_configs SET name=?, host=?, port=?, sender_comp_id=?, target_comp_id=? WHERE id=?'
    ).run(updated.name, updated.host, updated.port, updated.senderCompId, updated.targetCompId, id);
    return updated;
  }

  deleteSessionConfig(id: string): void {
    const ref = this.db.prepare(
      'SELECT id FROM venues WHERE md_session_config_id=? OR or_session_config_id=? LIMIT 1'
    ).get(id, id);
    if (ref) throw new Error(`SessionConfig ${id} is referenced by a Venue`);
    this.db.prepare('DELETE FROM session_configs WHERE id=?').run(id);
  }

  // ─── Trader ID Configs ────────────────────────────────────────────────────

  createTraderIdConfig(data: Omit<TraderIdConfig, 'id'>): TraderIdConfig {
    const id = randomUUID();
    this.db.prepare(
      'INSERT INTO trader_id_configs (id, trader_id, display_alias) VALUES (?, ?, ?)'
    ).run(id, data.traderId, data.displayAlias ?? null);
    return { id, ...data };
  }

  listTraderIdConfigs(): TraderIdConfig[] {
    return (this.db.prepare('SELECT * FROM trader_id_configs').all() as any[]).map(rowToTraderIdConfig);
  }

  getTraderIdConfig(id: string): TraderIdConfig | undefined {
    const row = this.db.prepare('SELECT * FROM trader_id_configs WHERE id=?').get(id) as any;
    return row ? rowToTraderIdConfig(row) : undefined;
  }

  updateTraderIdConfig(id: string, patch: Partial<Omit<TraderIdConfig, 'id'>>): TraderIdConfig {
    const existing = this.getTraderIdConfig(id);
    if (!existing) throw new Error(`TraderIdConfig ${id} not found`);
    const updated = { ...existing, ...patch };
    this.db.prepare(
      'UPDATE trader_id_configs SET trader_id=?, display_alias=? WHERE id=?'
    ).run(updated.traderId, updated.displayAlias ?? null, id);
    return updated;
  }

  deleteTraderIdConfig(id: string): void {
    const ref = this.db.prepare('SELECT id FROM venues WHERE trader_id_config_id=? LIMIT 1').get(id);
    if (ref) throw new Error(`TraderIdConfig ${id} is referenced by a Venue`);
    this.db.prepare('DELETE FROM trader_id_configs WHERE id=?').run(id);
  }

  // ─── Account Configs ──────────────────────────────────────────────────────

  createAccountConfig(data: Omit<AccountConfig, 'id'>): AccountConfig {
    const id = randomUUID();
    this.db.prepare(
      'INSERT INTO account_configs (id, account, display_alias) VALUES (?, ?, ?)'
    ).run(id, data.account, data.displayAlias ?? null);
    return { id, ...data };
  }

  listAccountConfigs(): AccountConfig[] {
    return (this.db.prepare('SELECT * FROM account_configs').all() as any[]).map(rowToAccountConfig);
  }

  getAccountConfig(id: string): AccountConfig | undefined {
    const row = this.db.prepare('SELECT * FROM account_configs WHERE id=?').get(id) as any;
    return row ? rowToAccountConfig(row) : undefined;
  }

  updateAccountConfig(id: string, patch: Partial<Omit<AccountConfig, 'id'>>): AccountConfig {
    const existing = this.getAccountConfig(id);
    if (!existing) throw new Error(`AccountConfig ${id} not found`);
    const updated = { ...existing, ...patch };
    this.db.prepare(
      'UPDATE account_configs SET account=?, display_alias=? WHERE id=?'
    ).run(updated.account, updated.displayAlias ?? null, id);
    return updated;
  }

  deleteAccountConfig(id: string): void {
    const ref = this.db.prepare(
      'SELECT venue_id FROM venue_accounts WHERE account_config_id=? LIMIT 1'
    ).get(id);
    if (ref) throw new Error(`AccountConfig ${id} is referenced by a Venue`);
    this.db.prepare('DELETE FROM account_configs WHERE id=?').run(id);
  }

  // ─── Venues ───────────────────────────────────────────────────────────────

  createVenue(data: Omit<Venue, 'id'>): Venue {
    const id = randomUUID();
    this.db.prepare(
      'INSERT INTO venues (id, name, md_session_config_id, or_session_config_id, trader_id_config_id) VALUES (?, ?, ?, ?, ?)'
    ).run(id, data.name, data.mdSessionConfigId, data.orSessionConfigId, data.traderIdConfigId);
    for (const acId of data.accountConfigIds) {
      this.db.prepare('INSERT INTO venue_accounts (venue_id, account_config_id) VALUES (?, ?)').run(id, acId);
    }
    return { id, ...data };
  }

  listVenues(): Venue[] {
    const rows = this.db.prepare('SELECT * FROM venues').all() as any[];
    return rows.map(row => this.rowToVenue(row));
  }

  getVenue(id: string): Venue | undefined {
    const row = this.db.prepare('SELECT * FROM venues WHERE id=?').get(id) as any;
    return row ? this.rowToVenue(row) : undefined;
  }

  updateVenue(id: string, patch: Partial<Omit<Venue, 'id'>>): Venue {
    const existing = this.getVenue(id);
    if (!existing) throw new Error(`Venue ${id} not found`);
    const updated = { ...existing, ...patch };
    this.db.prepare(
      'UPDATE venues SET name=?, md_session_config_id=?, or_session_config_id=?, trader_id_config_id=? WHERE id=?'
    ).run(updated.name, updated.mdSessionConfigId, updated.orSessionConfigId, updated.traderIdConfigId, id);
    if (patch.accountConfigIds !== undefined) {
      this.db.prepare('DELETE FROM venue_accounts WHERE venue_id=?').run(id);
      for (const acId of updated.accountConfigIds) {
        this.db.prepare('INSERT INTO venue_accounts (venue_id, account_config_id) VALUES (?, ?)').run(id, acId);
      }
    }
    return updated;
  }

  deleteVenue(id: string): void {
    this.db.prepare('DELETE FROM venue_accounts WHERE venue_id=?').run(id);
    this.db.prepare('DELETE FROM venues WHERE id=?').run(id);
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  createOrder(data: Omit<OrderRecord, 'status' | 'filledQty'>): OrderRecord {
    const record: OrderRecord = { ...data, status: 'PendingNew', filledQty: 0 };
    this.db.prepare(
      'INSERT INTO orders (cl_ord_id, venue_id, symbol, side, price, quantity, account, trader_id, status, filled_qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(record.clOrdId, record.venueId, record.symbol, record.side, record.price, record.quantity, record.account, record.traderId, record.status, record.filledQty);
    return record;
  }

  listOrders(): OrderRecord[] {
    return (this.db.prepare('SELECT * FROM orders ORDER BY rowid').all() as any[]).map(rowToOrder);
  }

  getOrder(clOrdId: string): OrderRecord | undefined {
    const row = this.db.prepare('SELECT * FROM orders WHERE cl_ord_id=?').get(clOrdId) as any;
    return row ? rowToOrder(row) : undefined;
  }

  updateOrderStatus(clOrdId: string, patch: { status: OrderStatus; filledQty?: number; exchOrdId?: string; avgFillPrice?: number }): OrderRecord {
    const existing = this.getOrder(clOrdId);
    if (!existing) throw new Error(`Order ${clOrdId} not found`);
    const filledQty = patch.filledQty ?? existing.filledQty;
    const exchOrdId = patch.exchOrdId ?? existing.exchOrdId ?? null;
    const avgFillPrice = patch.avgFillPrice ?? existing.avgFillPrice ?? null;
    this.db.prepare('UPDATE orders SET status=?, filled_qty=?, exch_ord_id=?, avg_fill_price=? WHERE cl_ord_id=?').run(patch.status, filledQty, exchOrdId, avgFillPrice, clOrdId);
    return { ...existing, status: patch.status, filledQty, exchOrdId: exchOrdId ?? undefined, avgFillPrice: avgFillPrice ?? undefined };
  }

  deleteAllOrders(): void {
    this.db.prepare('DELETE FROM orders').run();
  }

  close(): void {
    this.db.close();
  }

  private rowToVenue(row: any): Venue {
    const accountRows = this.db.prepare(
      'SELECT account_config_id FROM venue_accounts WHERE venue_id=? ORDER BY rowid'
    ).all(row.id) as any[];
    return {
      id: row.id,
      name: row.name,
      mdSessionConfigId: row.md_session_config_id,
      orSessionConfigId: row.or_session_config_id,
      traderIdConfigId: row.trader_id_config_id,
      accountConfigIds: accountRows.map(r => r.account_config_id),
    };
  }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToSessionConfig(row: any): SessionConfig {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    senderCompId: row.sender_comp_id,
    targetCompId: row.target_comp_id,
  };
}

function rowToTraderIdConfig(row: any): TraderIdConfig {
  return {
    id: row.id,
    traderId: row.trader_id,
    ...(row.display_alias != null && { displayAlias: row.display_alias }),
  };
}

function rowToAccountConfig(row: any): AccountConfig {
  return {
    id: row.id,
    account: row.account,
    ...(row.display_alias != null && { displayAlias: row.display_alias }),
  };
}

function rowToOrder(row: any): OrderRecord {
  return {
    clOrdId: row.cl_ord_id,
    venueId: row.venue_id,
    symbol: row.symbol,
    side: row.side as 'buy' | 'sell',
    price: row.price,
    quantity: row.quantity,
    account: row.account,
    traderId: row.trader_id,
    status: row.status as OrderStatus,
    filledQty: row.filled_qty,
    ...(row.exch_ord_id  != null && { exchOrdId: row.exch_ord_id }),
    ...(row.avg_fill_price != null && { avgFillPrice: row.avg_fill_price }),
  };
}
