export interface CancelRequestParams {
  origClOrdId: string;
  exchOrdId: string;
  symbol: string;
  side: 'buy' | 'sell';
}

export function buildOrderCancelRequest(newClOrdId: string, params: CancelRequestParams): Map<number, string> {
  return new Map([
    [35, 'F'],
    [11, newClOrdId],
    [41, params.origClOrdId],
    [37, params.exchOrdId],
    [55, params.symbol],
    [54, params.side === 'buy' ? '1' : '2'],
  ]);
}
