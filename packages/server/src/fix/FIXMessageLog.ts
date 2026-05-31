import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FIXLogEntry {
  ts: string;
  dir: 'IN' | 'OUT';
  session: string;
  fields: Record<string, string>;
}

function parseRaw(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split('\x01')) {
    const eq = pair.indexOf('=');
    if (eq > 0) result[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return result;
}

function mapToRecord(fields: Map<number, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of fields) result[String(k)] = v;
  return result;
}

export class FIXMessageLog {
  private readonly byClOrdId = new Map<string, FIXLogEntry[]>();

  constructor(private readonly logDir: string | null) {}

  logOutbound(sessionId: string, fields: Map<number, string>): void {
    const entry: FIXLogEntry = {
      ts: new Date().toISOString(),
      dir: 'OUT',
      session: sessionId,
      fields: mapToRecord(fields),
    };
    this.index(entry, fields.get(11));
    this.index(entry, fields.get(41));
    this.write(entry);
  }

  logInbound(sessionId: string, raw: string): void {
    const parsed = parseRaw(raw);
    const entry: FIXLogEntry = {
      ts: new Date().toISOString(),
      dir: 'IN',
      session: sessionId,
      fields: parsed,
    };
    this.index(entry, parsed['11']);
    if (parsed['41']) this.index(entry, parsed['41']);
    this.write(entry);
  }

  getEntriesForClOrdId(clOrdId: string): FIXLogEntry[] {
    return this.byClOrdId.get(clOrdId) ?? [];
  }

  private index(entry: FIXLogEntry, clOrdId: string | undefined): void {
    if (!clOrdId) return;
    const list = this.byClOrdId.get(clOrdId);
    if (list) {
      list.push(entry);
    } else {
      this.byClOrdId.set(clOrdId, [entry]);
    }
  }

  private write(entry: FIXLogEntry): void {
    if (!this.logDir) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const file = join(this.logDir, `fix-${today}.jsonl`);
    mkdirSync(this.logDir, { recursive: true });
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
  }
}
