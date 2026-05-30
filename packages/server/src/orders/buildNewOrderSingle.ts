export interface NewOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  account: string;
  traderId: string;
}

export function buildNewOrderSingle(clOrdId: string, params: NewOrderParams): Map<number, string> {
  return new Map([
    [35, 'D'],
    [11, clOrdId],
    [55, params.symbol],
    [54, params.side === 'buy' ? '1' : '2'],
    [40, '2'],
    [44, String(params.price)],
    [38, String(params.quantity)],
    [1, params.account],
    [50, params.traderId],
  ]);
}
