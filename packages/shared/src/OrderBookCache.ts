export type MDSide = 'bid' | 'ask';

export interface SnapshotEntry {
  type: MDSide;
  orderId: string;
  price: number;
  quantity: number;
}

export interface IncrementalEntry {
  action: 'new' | 'change' | 'delete';
  type: MDSide | 'trade';
  orderId?: string;
  price: number;
  quantity: number;
}

export interface PriceLevel {
  price: number;
  volume: number;
  count: number;
}

interface OrderSlot {
  price: number;
  quantity: number;
  side: MDSide;
}

export class OrderBookCache {
  private orders = new Map<string, OrderSlot>();

  constructor(private readonly tickSize: number) {}

  applySnapshot(entries: SnapshotEntry[]): void {
    this.orders.clear();
    for (const e of entries) {
      this.orders.set(e.orderId, { price: e.price, quantity: e.quantity, side: e.type });
    }
  }

  applyIncremental(entry: IncrementalEntry): void {
    if (entry.type === 'trade') return;
    const { action, orderId, price, quantity, type } = entry;
    if (!orderId) return;
    if (action === 'new') {
      this.orders.set(orderId, { price, quantity, side: type as MDSide });
    } else if (action === 'change') {
      const slot = this.orders.get(orderId);
      if (slot) slot.quantity = quantity;
    } else {
      this.orders.delete(orderId);
    }
  }

  getLevels(side: MDSide, n: number): PriceLevel[] {
    const sideOrders = [...this.orders.values()].filter(o => o.side === side);
    if (sideOrders.length === 0) return [];

    const levelMap = new Map<number, PriceLevel>();
    for (const o of sideOrders) {
      const existing = levelMap.get(o.price) ?? { price: o.price, volume: 0, count: 0 };
      existing.volume += o.quantity;
      existing.count += 1;
      levelMap.set(o.price, existing);
    }

    const best = side === 'bid'
      ? Math.max(...levelMap.keys())
      : Math.min(...levelMap.keys());

    const levels: PriceLevel[] = [];
    for (let i = 0; i < n; i++) {
      const price = side === 'bid'
        ? round(best - i * this.tickSize, this.tickSize)
        : round(best + i * this.tickSize, this.tickSize);
      levels.push(levelMap.get(price) ?? { price, volume: 0, count: 0 });
    }
    return levels;
  }
}

function round(value: number, tick: number): number {
  return Math.round(value / tick) * tick;
}
