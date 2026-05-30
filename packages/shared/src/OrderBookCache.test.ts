import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookCache } from './OrderBookCache.js';
import type { SnapshotEntry, IncrementalEntry } from './OrderBookCache.js';

const TICK = 1.0;

describe('OrderBookCache', () => {
  let cache: OrderBookCache;

  beforeEach(() => {
    cache = new OrderBookCache(TICK);
  });

  it('empty cache returns [] for both sides', () => {
    expect(cache.getLevels('bid', 5)).toEqual([]);
    expect(cache.getLevels('ask', 5)).toEqual([]);
  });

  it('single bid: getLevels returns N levels with empty ticks filled below best', () => {
    cache.applySnapshot([{ type: 'bid', orderId: 'o1', price: 100, quantity: 10 }]);
    const levels = cache.getLevels('bid', 5);
    expect(levels).toEqual([
      { price: 100, volume: 10, count: 1 },
      { price: 99,  volume: 0,  count: 0 },
      { price: 98,  volume: 0,  count: 0 },
      { price: 97,  volume: 0,  count: 0 },
      { price: 96,  volume: 0,  count: 0 },
    ]);
  });

  it('two bids at different prices: sorted descending, gap zero-filled', () => {
    cache.applySnapshot([
      { type: 'bid', orderId: 'o1', price: 100, quantity: 10 },
      { type: 'bid', orderId: 'o2', price: 98,  quantity: 5  },
    ]);
    const [l0, l1, l2] = cache.getLevels('bid', 3);
    expect(l0).toEqual({ price: 100, volume: 10, count: 1 });
    expect(l1).toEqual({ price: 99,  volume: 0,  count: 0 });
    expect(l2).toEqual({ price: 98,  volume: 5,  count: 1 });
  });

  it('two orders at same price are aggregated', () => {
    cache.applySnapshot([
      { type: 'bid', orderId: 'o1', price: 100, quantity: 10 },
      { type: 'bid', orderId: 'o2', price: 100, quantity: 7  },
    ]);
    const [top] = cache.getLevels('bid', 1);
    expect(top).toEqual({ price: 100, volume: 17, count: 2 });
  });

  it('snapshot resets previous state', () => {
    cache.applySnapshot([{ type: 'bid', orderId: 'o1', price: 100, quantity: 10 }]);
    cache.applySnapshot([{ type: 'ask', orderId: 'o2', price: 101, quantity: 3 }]);
    expect(cache.getLevels('bid', 1)).toEqual([]);
    expect(cache.getLevels('ask', 1)[0]).toEqual({ price: 101, volume: 3, count: 1 });
  });

  it('incremental new adds order to its price level', () => {
    cache.applySnapshot([]);
    cache.applyIncremental({ action: 'new', type: 'ask', orderId: 'o1', price: 101, quantity: 5 });
    const [top] = cache.getLevels('ask', 1);
    expect(top).toEqual({ price: 101, volume: 5, count: 1 });
  });

  it('incremental change updates remaining quantity', () => {
    cache.applySnapshot([{ type: 'bid', orderId: 'o1', price: 100, quantity: 10 }]);
    cache.applyIncremental({ action: 'change', type: 'bid', orderId: 'o1', price: 100, quantity: 6 });
    const [top] = cache.getLevels('bid', 1);
    expect(top.volume).toBe(6);
  });

  it('incremental delete removes order; empty level disappears', () => {
    cache.applySnapshot([{ type: 'bid', orderId: 'o1', price: 100, quantity: 10 }]);
    cache.applyIncremental({ action: 'delete', type: 'bid', orderId: 'o1', price: 100, quantity: 0 });
    expect(cache.getLevels('bid', 5)).toEqual([]);
  });

  it('ask side: sorted ascending, empty ticks filled upward', () => {
    cache.applySnapshot([
      { type: 'ask', orderId: 'o1', price: 101, quantity: 3 },
      { type: 'ask', orderId: 'o2', price: 103, quantity: 2 },
    ]);
    const levels = cache.getLevels('ask', 4);
    expect(levels.map(l => l.price)).toEqual([101, 102, 103, 104]);
    expect(levels[1]).toEqual({ price: 102, volume: 0, count: 0 });
  });

  it('trade entries in incremental are ignored', () => {
    cache.applyIncremental({ action: 'new', type: 'trade', price: 100, quantity: 5 });
    expect(cache.getLevels('bid', 5)).toEqual([]);
    expect(cache.getLevels('ask', 5)).toEqual([]);
  });
});
