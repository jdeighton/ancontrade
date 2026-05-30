import type { OrderStatus } from '../admin/AdminStore.js';

export interface ParsedER {
  clOrdId: string;
  exchOrdId: string;
  ordStatus: OrderStatus;
  cumQty: number;
  avgPx: number;
}

const ORD_STATUS_MAP: Record<string, OrderStatus> = {
  '0': 'New',
  '1': 'PartiallyFilled',
  '2': 'Filled',
  '4': 'Cancelled',
  '8': 'Rejected',
};

const SOH = '\x01';

function extractField(raw: string, tag: number): string | undefined {
  const match = raw.match(new RegExp(`(?:^|${SOH})${tag}=([^${SOH}]+)`));
  return match?.[1];
}

export function parseExecutionReport(raw: string): ParsedER | null {
  if (extractField(raw, 35) !== '8') return null;
  const clOrdId = extractField(raw, 11);
  if (!clOrdId) return null;
  const exchOrdId = extractField(raw, 37) ?? '';
  const ordStatusCode = extractField(raw, 39) ?? '';
  const ordStatus = ORD_STATUS_MAP[ordStatusCode];
  if (!ordStatus) return null;
  const cumQty = Number(extractField(raw, 14) ?? '0');
  const avgPx  = Number(extractField(raw, 6)  ?? '0');
  return { clOrdId, exchOrdId, ordStatus, cumQty, avgPx };
}
