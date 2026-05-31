import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { FIXMessageLog } from './FIXMessageLog.js';

const SOH = '\x01';
const raw = (fields: Record<number, string>) =>
  Object.entries(fields).map(([t, v]) => `${t}=${v}`).join(SOH);

const tempFiles: string[] = [];
function tempDir(): string {
  const p = join(tmpdir(), `fix-log-test-${randomUUID()}`);
  tempFiles.push(p);
  return p;
}

afterEach(() => {
  for (const dir of tempFiles.splice(0)) {
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const file = join(dir, `fix-${today}.jsonl`);
      if (existsSync(file)) unlinkSync(file);
      // cleanup dir
    } catch {}
  }
});

describe('FIXMessageLog — in-memory indexing', () => {
  it('logOutbound stores entry indexed by tag 11', () => {
    const log = new FIXMessageLog(null);
    log.logOutbound('SESSION1', new Map([[35, 'D'], [11, 'CID1'], [55, 'EUR/USD']]));
    const entries = log.getEntriesForClOrdId('CID1');
    expect(entries).toHaveLength(1);
    expect(entries[0].dir).toBe('OUT');
    expect(entries[0].session).toBe('SESSION1');
    expect(entries[0].fields['35']).toBe('D');
    expect(entries[0].fields['11']).toBe('CID1');
  });

  it('logInbound stores entry indexed by tag 11 from raw string', () => {
    const log = new FIXMessageLog(null);
    log.logInbound('SESSION1', raw({ 35: '8', 11: 'CID1', 39: '0' }));
    const entries = log.getEntriesForClOrdId('CID1');
    expect(entries).toHaveLength(1);
    expect(entries[0].dir).toBe('IN');
    expect(entries[0].fields['35']).toBe('8');
  });

  it('logInbound also indexes by tag 41 (OrigClOrdID)', () => {
    const log = new FIXMessageLog(null);
    log.logInbound('SESSION1', raw({ 35: '9', 11: 'CXL1', 41: 'CID1', 102: '1' }));
    // accessible by both the cancel ClOrdID and the orig
    expect(log.getEntriesForClOrdId('CXL1')).toHaveLength(1);
    expect(log.getEntriesForClOrdId('CID1')).toHaveLength(1);
  });

  it('reindexLatestInbound moves the entry to the correct ClOrdID', () => {
    const log = new FIXMessageLog(null);
    log.logInbound('S', raw({ 35: '8', 11: 'SELL-1', 37: 'E-SELL', 39: '0', 14: '0', 6: '0' }));
    // passive fill arrives with wrong tag 11
    log.logInbound('S', raw({ 35: '8', 11: 'BUY-1', 37: 'E-SELL', 39: '2', 14: '1000', 6: '1.105' }));

    // Before reindex: fill is under BUY-1
    expect(log.getEntriesForClOrdId('BUY-1')).toHaveLength(1);
    expect(log.getEntriesForClOrdId('SELL-1')).toHaveLength(1);

    log.reindexLatestInbound('BUY-1', 'SELL-1');

    // After reindex: fill moved to SELL-1, BUY-1 is empty
    expect(log.getEntriesForClOrdId('BUY-1')).toHaveLength(0);
    expect(log.getEntriesForClOrdId('SELL-1')).toHaveLength(2);
  });

  it('logInbound indexes by tag 37 (ExchOrdID) enabling self-match event lookup', () => {
    const log = new FIXMessageLog(null);
    // New ack for passive order — indexed under SELL-1 and E-SELL
    log.logInbound('S', raw({ 35: '8', 11: 'SELL-1', 37: 'E-SELL', 39: '0', 14: '0', 6: '0' }));
    // Fill EP with aggressor tag 11, but passive ExchOrdID in tag 37
    log.logInbound('S', raw({ 35: '8', 11: 'BUY-1', 37: 'E-SELL', 39: '2', 14: '1000', 6: '1.105' }));

    // Without exchOrdId hint: SELL-1 only sees its own New ack
    expect(log.getEntriesForClOrdId('SELL-1')).toHaveLength(1);
    // With exchOrdId hint: SELL-1 also gets the fill EP
    const events = log.getEntriesForClOrdId('SELL-1', 'E-SELL');
    expect(events).toHaveLength(2);
    expect(events.map(e => e.fields['39'])).toEqual(expect.arrayContaining(['0', '2']));
    // No duplicates
    expect(new Set(events).size).toBe(2);
  });

  it('returns empty array for unknown clOrdId', () => {
    const log = new FIXMessageLog(null);
    expect(log.getEntriesForClOrdId('UNKNOWN')).toEqual([]);
  });

  it('each entry has an ISO timestamp', () => {
    const log = new FIXMessageLog(null);
    log.logOutbound('S', new Map([[11, 'CID1']]));
    const ts = log.getEntriesForClOrdId('CID1')[0].ts;
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});

describe('FIXMessageLog — file writing', () => {
  it('writes JSONL lines to daily log file when logDir is set', () => {
    const dir = tempDir();
    const log = new FIXMessageLog(dir);
    log.logOutbound('SESSION1', new Map([[35, 'D'], [11, 'CID1']]));
    log.logInbound('SESSION1', raw({ 35: '8', 11: 'CID1', 39: '0' }));

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const file = join(dir, `fix-${today}.jsonl`);
    expect(existsSync(file)).toBe(true);

    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first.dir).toBe('OUT');
    expect(first.fields['35']).toBe('D');
    const second = JSON.parse(lines[1]);
    expect(second.dir).toBe('IN');
    expect(second.fields['35']).toBe('8');
  });
});
