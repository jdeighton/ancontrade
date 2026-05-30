import { describe, it, expect } from 'vitest';
import { ClientOrderIdGenerator } from './ClientOrderIdGenerator.js';

describe('ClientOrderIdGenerator', () => {
  it('first next() returns YYYYMMDD-HHMMSS-1 matching startup time', () => {
    const startupTime = new Date('2025-05-30T14:23:45.000Z');
    const gen = new ClientOrderIdGenerator(startupTime);
    expect(gen.next()).toBe('20250530-142345-1');
  });

  it('counter increments with each call', () => {
    const gen = new ClientOrderIdGenerator(new Date('2025-05-30T00:00:00.000Z'));
    expect(gen.next()).toMatch(/-1$/);
    expect(gen.next()).toMatch(/-2$/);
    expect(gen.next()).toMatch(/-3$/);
  });

  it('two instances have independent counters', () => {
    const t = new Date('2025-05-30T00:00:00.000Z');
    const a = new ClientOrderIdGenerator(t);
    const b = new ClientOrderIdGenerator(t);
    a.next();
    a.next();
    expect(b.next()).toMatch(/-1$/);
  });

  it('timestamp portion uses UTC fields', () => {
    // 23:59:59 UTC on 2025-01-31 — would differ from local time in most TZs
    const gen = new ClientOrderIdGenerator(new Date('2025-01-31T23:59:59.000Z'));
    expect(gen.next()).toBe('20250131-235959-1');
  });
});
