import { describe, it, expect } from 'vitest';
import { parseMDReqReject, MD_REQ_REJ_REASONS } from './parseMDReqReject.js';

const SOH = '\x01';
const fix = (fields: [number, string][]) => fields.map(([t, v]) => `${t}=${v}`).join(SOH);

describe('parseMDReqReject', () => {
  it('returns null for non-35=Y messages', () => {
    expect(parseMDReqReject(fix([[35, 'W']]))).toBeNull();
  });

  it('parses reqId, reason code, and text', () => {
    const raw = fix([[35, 'Y'], [262, 'REQ1'], [281, '0'], [58, 'Unknown symbol']]);
    const result = parseMDReqReject(raw);
    expect(result?.reqId).toBe('REQ1');
    expect(result?.reason).toBe(0);
    expect(result?.text).toBe('Unknown symbol');
  });

  it('works without text field', () => {
    const raw = fix([[35, 'Y'], [262, 'REQ1'], [281, '1']]);
    const result = parseMDReqReject(raw);
    expect(result?.text).toBe('');
    expect(result?.reason).toBe(1);
  });

  it('defaults reason to 0 when tag 281 missing', () => {
    const raw = fix([[35, 'Y'], [262, 'REQ1']]);
    expect(parseMDReqReject(raw)?.reason).toBe(0);
  });

  it('MD_REQ_REJ_REASONS has labels for common codes', () => {
    expect(MD_REQ_REJ_REASONS[0]).toBe('Unknown symbol');
    expect(MD_REQ_REJ_REASONS[1]).toBe('Duplicate MDReqID');
    expect(MD_REQ_REJ_REASONS[4]).toBe('Unsupported SubscriptionRequestType');
  });
});
