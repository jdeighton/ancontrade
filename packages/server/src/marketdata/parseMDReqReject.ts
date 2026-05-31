const SOH = '\x01';

export const MD_REQ_REJ_REASONS: Record<number, string> = {
  0: 'Unknown symbol',
  1: 'Duplicate MDReqID',
  2: 'Insufficient bandwidth',
  3: 'Insufficient permissions',
  4: 'Unsupported SubscriptionRequestType',
  5: 'Unsupported MarketDepth',
  6: 'Unsupported MDUpdateType',
  7: 'Unsupported AggregatedBook',
  8: 'Unsupported MDEntryType',
  9: 'Unsupported TradingSessionID',
  10: 'Unsupported scope',
  11: 'Unsupported OpenCloseSettleFlag',
  12: 'Unsupported MDImplicitDelete',
  99: 'Other',
};

export interface ParsedMDReqReject {
  reqId: string;
  reason: number;
  text: string;
}

export function parseMDReqReject(raw: string): ParsedMDReqReject | null {
  const fields: Record<string, string> = {};
  for (const field of raw.split(SOH)) {
    const eq = field.indexOf('=');
    if (eq > 0) fields[field.slice(0, eq)] = field.slice(eq + 1);
  }
  if (fields['35'] !== 'Y') return null;
  return {
    reqId: fields['262'] ?? '',
    reason: Number(fields['281'] ?? '0'),
    text: fields['58'] ?? '',
  };
}
