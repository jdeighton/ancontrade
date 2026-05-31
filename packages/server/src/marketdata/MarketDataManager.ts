import { randomUUID } from 'node:crypto';
import { OrderBookCache, type PriceLevel } from '@ancontrade/shared';
import type { IFIXEngine } from '../venue/VenueManager.js';
import { buildMDRequest } from './buildMDRequest.js';
import { parseMDSnapshot } from './parseMDSnapshot.js';
import { parseMDIncremental } from './parseMDIncremental.js';
import { parseMDReqReject, MD_REQ_REJ_REASONS } from './parseMDReqReject.js';

export interface PriceLevelsEvent {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export interface StatusAlertEvent {
  ts: string;
  kind: 'md-reject' | 'disconnect';
  message: string;
}

interface Subscription {
  sessionId: string;
  symbol: string;
  reqId: string;
  cache: OrderBookCache;
  tickSize: number;
}

const DEFAULT_DEPTH = 5;

export class MarketDataManager {
  private readonly subscriptions = new Map<string, Subscription>(); // symbol → sub
  private readonly listeners = new Set<(e: PriceLevelsEvent) => void>();
  private readonly alertListeners = new Set<(e: StatusAlertEvent) => void>();
  private depth = DEFAULT_DEPTH;

  constructor(private readonly engine: IFIXEngine) {
    engine.onMessage((sessionId, raw) => this.handleMessage(sessionId, raw));
  }

  subscribe(sessionId: string, symbol: string, tickSize: number): void {
    if (this.subscriptions.has(symbol)) return;
    const reqId = randomUUID();
    const cache = new OrderBookCache(tickSize);
    this.subscriptions.set(symbol, { sessionId, symbol, reqId, cache, tickSize });
    this.engine.sendMessage(sessionId, buildMDRequest(reqId, symbol, 'subscribe'));
  }

  unsubscribe(sessionId: string, symbol: string): void {
    const sub = this.subscriptions.get(symbol);
    if (!sub) return;
    this.subscriptions.delete(symbol);
    this.engine.sendMessage(sessionId, buildMDRequest(sub.reqId, symbol, 'unsubscribe'));
  }

  setDepth(n: number): void {
    this.depth = Math.min(20, Math.max(1, n));
  }

  onPriceLevels(cb: (e: PriceLevelsEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatusAlert(cb: (e: StatusAlertEvent) => void): () => void {
    this.alertListeners.add(cb);
    return () => this.alertListeners.delete(cb);
  }

  emitAlert(event: StatusAlertEvent): void {
    for (const cb of this.alertListeners) cb(event);
  }

  private handleMessage(sessionId: string, raw: string): void {
    const reject = parseMDReqReject(raw);
    if (reject) {
      // Remove the subscription the exchange rejected
      for (const [symbol, sub] of this.subscriptions) {
        if (sub.sessionId === sessionId && sub.reqId === reject.reqId) {
          this.subscriptions.delete(symbol);
          break;
        }
      }
      const label = MD_REQ_REJ_REASONS[reject.reason] ?? `Code ${reject.reason}`;
      const message = reject.text ? `MD Reject: ${label} — ${reject.text}` : `MD Reject: ${label}`;
      this.emitAlert({ ts: new Date().toISOString(), kind: 'md-reject', message });
      return;
    }

    const snapshot = parseMDSnapshot(raw);
    if (snapshot) {
      const sub = this.findSub(sessionId, snapshot.symbol);
      if (!sub) return;
      sub.cache.applySnapshot(snapshot.entries);
      this.emit(sub);
      return;
    }

    const incremental = parseMDIncremental(raw);
    if (incremental) {
      for (const { symbol, entry } of incremental) {
        const sub = this.findSub(sessionId, symbol);
        if (!sub) continue;
        sub.cache.applyIncremental(entry);
        this.emit(sub);
      }
    }
  }

  private findSub(sessionId: string, symbol: string): Subscription | undefined {
    const sub = this.subscriptions.get(symbol);
    return sub?.sessionId === sessionId ? sub : undefined;
  }

  private emit(sub: Subscription): void {
    const event: PriceLevelsEvent = {
      symbol: sub.symbol,
      bids: sub.cache.getLevels('bid', this.depth),
      asks: sub.cache.getLevels('ask', this.depth),
    };
    for (const cb of this.listeners) cb(event);
  }
}
