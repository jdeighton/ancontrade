export function buildMDRequest(
  reqId: string,
  symbol: string,
  mode: 'subscribe' | 'unsubscribe',
): Map<number, string> {
  return new Map([
    [35, 'V'],
    [262, reqId],
    [263, mode === 'subscribe' ? '1' : '2'],
    [264, '0'],   // MarketDepth=0 (full book)
    [267, '2'],   // NoMDEntryTypes
    [269, '0,1'], // MDEntryType: bid=0, ask=1 (comma-encoded repeating group)
    [146, '1'],   // NoRelatedSym
    [55, symbol],
  ]);
}
