export interface Fill {
  quantity: number;
  price: number;
}

export function calcAveragePrice(fills: Fill[]): number | null {
  if (fills.length === 0) return null;
  const totalCost = fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
  const totalQty  = fills.reduce((sum, f) => sum + f.quantity, 0);
  return totalCost / totalQty;
}
