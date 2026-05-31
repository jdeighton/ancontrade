export interface NewOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price?: number;
  quantity: number;
  account: string;
  traderId: string;
}

export function buildNewOrderSingle(clOrdId: string, params: NewOrderParams): Map<number, string> {
  const fields = new Map<number, string>([
    [35, 'D'],
    [11, clOrdId],
    [55, params.symbol],
    [54, params.side === 'buy' ? '1' : '2'],
    [40, params.orderType === 'market' ? '1' : '2'],
    [38, String(params.quantity)],
    [1, params.account],
    [50, params.traderId],
  ]);
  if (params.orderType === 'limit' && params.price !== undefined) {
    fields.set(44, String(params.price));
  }
  return fields;
}
