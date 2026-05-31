import type { IncrementalEntry, MDSide } from '@ancontrade/shared';

const SOH = '\x01';

const ACTIONS: Record<string, IncrementalEntry['action']> = { '0': 'new', '1': 'change', '2': 'delete' };

export interface MDIncrementalItem {
  symbol: string;
  entry: IncrementalEntry;
}

export function parseMDIncremental(raw: string): MDIncrementalItem[] | null {
  const msgType = raw.match(/(?:^|\x01)35=([^\x01]+)/)?.[1];
  if (msgType !== 'X') return null;

  const items: MDIncrementalItem[] = [];

  let action: IncrementalEntry['action'] | null = null;
  let entryType: string | null = null;
  let orderId: string | null = null;
  let symbol: string | null = null;
  let price: number | null = null;
  let quantity: number | null = null;

  function flush() {
    if (action && entryType !== null && price !== null && quantity !== null) {
      const type: MDSide | 'trade' = entryType === '0' ? 'bid' : entryType === '1' ? 'ask' : 'trade';
      items.push({
        symbol: symbol ?? '',
        entry: { action, type, orderId: orderId ?? undefined, price, quantity },
      });
    }
    action = null; entryType = null; orderId = null; symbol = null; price = null; quantity = null;
  }

  for (const field of raw.split(SOH)) {
    const eq = field.indexOf('=');
    if (eq === -1) continue;
    const tag = field.slice(0, eq);
    const value = field.slice(eq + 1);

    if (tag === '279') { flush(); action = ACTIONS[value] ?? 'new'; }
    else if (tag === '269') entryType = value;
    else if (tag === '278') orderId = value;
    else if (tag === '55' && action !== null) symbol = value;
    else if (tag === '270') price = Number(value);
    else if (tag === '271') quantity = Number(value);
  }
  flush();

  return items;
}
