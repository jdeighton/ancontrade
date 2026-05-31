import type { SnapshotEntry } from '@ancontrade/shared';

const SOH = '\x01';

export interface MDSnapshot {
  symbol: string;
  entries: SnapshotEntry[];
}

export function parseMDSnapshot(raw: string): MDSnapshot | null {
  const fields = parseFields(raw);
  if (fields['35'] !== 'W') return null;

  const symbol = fields['55'] ?? '';
  const entries: SnapshotEntry[] = [];

  let currentType: '0' | '1' | null = null;
  let currentId: string | null = null;
  let currentPx: number | null = null;
  let currentQty: number | null = null;

  function flush() {
    if (currentId && currentType !== null && currentPx !== null && currentQty !== null) {
      entries.push({
        type: currentType === '0' ? 'bid' : 'ask',
        orderId: currentId,
        price: currentPx,
        quantity: currentQty,
      });
    }
    currentType = null; currentId = null; currentPx = null; currentQty = null;
  }

  for (const field of raw.split(SOH)) {
    const eq = field.indexOf('=');
    if (eq === -1) continue;
    const tag = field.slice(0, eq);
    const value = field.slice(eq + 1);

    if (tag === '269') { flush(); currentType = value as '0' | '1'; }
    else if (tag === '278') currentId = value;
    else if (tag === '270') currentPx = Number(value);
    else if (tag === '271') currentQty = Number(value);
  }
  flush();

  return { symbol, entries };
}

function parseFields(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of raw.split(SOH)) {
    const eq = field.indexOf('=');
    if (eq > 0 && !(field.slice(0, eq) in result)) {
      result[field.slice(0, eq)] = field.slice(eq + 1);
    }
  }
  return result;
}
