export interface ParsedCancelReject {
  clOrdId: string;
  cxlRejReason: number;
  text: string;
}

const SOH = '\x01';

function extractField(raw: string, tag: number): string | undefined {
  const match = raw.match(new RegExp(`(?:^|${SOH})${tag}=([^${SOH}]+)`));
  return match?.[1];
}

export function parseOrderCancelReject(raw: string): ParsedCancelReject | null {
  if (extractField(raw, 35) !== '9') return null;
  const clOrdId = extractField(raw, 11);
  if (!clOrdId) return null;
  return {
    clOrdId,
    cxlRejReason: Number(extractField(raw, 102) ?? '0'),
    text: extractField(raw, 58) ?? '',
  };
}
