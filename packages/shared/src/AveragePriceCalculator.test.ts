import { describe, it, expect } from 'vitest';
import { calcAveragePrice } from './AveragePriceCalculator.js';

describe('calcAveragePrice', () => {
  it('returns null for empty fills', () => {
    expect(calcAveragePrice([])).toBeNull();
  });

  it('returns fill price unchanged for a single fill', () => {
    expect(calcAveragePrice([{ quantity: 10, price: 100.5 }])).toBe(100.5);
  });

  it('returns VWAP for multiple fills at different prices', () => {
    // 10@100 + 20@110 = 1000 + 2200 = 3200 / 30 = 106.666...
    const result = calcAveragePrice([
      { quantity: 10, price: 100 },
      { quantity: 20, price: 110 },
    ]);
    expect(result).toBeCloseTo(106.667, 3);
  });

  it('handles equal-quantity fills at different prices', () => {
    const result = calcAveragePrice([
      { quantity: 5, price: 100 },
      { quantity: 5, price: 200 },
    ]);
    expect(result).toBe(150);
  });
});
