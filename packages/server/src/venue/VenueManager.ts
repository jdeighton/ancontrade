import { randomUUID } from 'node:crypto';
import type { AdminStore } from '../admin/AdminStore.js';
import { parseSecurityListRaw, type Instrument } from '../instruments/parseSecurityListRaw.js';

export interface IFIXSession {
  readonly id: string;
  on(event: 'status', handler: (status: string) => void): this;
  off(event: 'status', handler: (status: string) => void): this;
}

export interface IFIXEngine {
  addSession(config: {
    mode: 'client';
    host: string;
    port: number;
    senderCompId: string;
    targetCompId: string;
    beginString: 'FIX.4.4';
    heartbeatIntervalSecs: number;
  }): IFIXSession;
  removeSession(sessionId: string): Promise<void>;
  sendMessage(sessionId: string, fields: Map<number, string>): void;
  onMessage(callback: (sessionId: string, raw: string) => void): () => void;
}

export interface VenueStatus {
  venueId: string;
  mdConnected: boolean;
  orConnected: boolean;
}

interface VenueSessionPair {
  mdSession: IFIXSession;
  orSession: IFIXSession;
  mdConnected: boolean;
  orConnected: boolean;
}

export class VenueManager {
  private readonly active = new Map<string, VenueSessionPair>();
  private readonly listeners = new Set<(s: VenueStatus) => void>();
  private readonly instruments = new Map<string, Instrument[]>();

  constructor(
    private readonly engine: IFIXEngine,
    private readonly store: AdminStore,
  ) {
    if (engine) {
      engine.onMessage((sessionId, raw) => this.handleMessage(sessionId, raw));
    }
  }

  connect(venueId: string): void {
    if (this.active.has(venueId)) return;

    const venue = this.store.getVenue(venueId);
    if (!venue) throw new Error(`Venue ${venueId} not found`);

    const mdSC = this.store.getSessionConfig(venue.mdSessionConfigId);
    const orSC = this.store.getSessionConfig(venue.orSessionConfigId);
    if (!mdSC || !orSC) throw new Error(`SessionConfig not found for Venue ${venueId}`);

    const pair: VenueSessionPair = {
      mdSession: this.engine.addSession({ mode: 'client', host: mdSC.host, port: mdSC.port, senderCompId: mdSC.senderCompId, targetCompId: mdSC.targetCompId, beginString: 'FIX.4.4', heartbeatIntervalSecs: 30 }),
      orSession: this.engine.addSession({ mode: 'client', host: orSC.host, port: orSC.port, senderCompId: orSC.senderCompId, targetCompId: orSC.targetCompId, beginString: 'FIX.4.4', heartbeatIntervalSecs: 30 }),
      mdConnected: false,
      orConnected: false,
    };

    pair.mdSession.on('status', (status) => {
      pair.mdConnected = status === 'active';
      if (status === 'active') {
        this.engine.sendMessage(pair.mdSession.id, new Map([
          [35, 'x'],
          [320, randomUUID()],
          [559, '4'],
        ]));
      }
      this.emit(venueId, { mdConnected: pair.mdConnected, orConnected: pair.orConnected });
    });

    pair.orSession.on('status', (status) => {
      pair.orConnected = status === 'active';
      this.emit(venueId, { mdConnected: pair.mdConnected, orConnected: pair.orConnected });
    });

    this.active.set(venueId, pair);
  }

  async disconnect(venueId: string): Promise<void> {
    const pair = this.active.get(venueId);
    if (!pair) return;
    this.active.delete(venueId);
    await Promise.all([
      this.engine.removeSession(pair.mdSession.id),
      this.engine.removeSession(pair.orSession.id),
    ]);
    this.emit(venueId, { mdConnected: false, orConnected: false });
  }

  getStatus(venueId: string): VenueStatus {
    const pair = this.active.get(venueId);
    return { venueId, mdConnected: pair?.mdConnected ?? false, orConnected: pair?.orConnected ?? false };
  }

  getInstruments(venueId: string): Instrument[] {
    return this.instruments.get(venueId) ?? [];
  }

  private handleMessage(sessionId: string, raw: string): void {
    for (const [venueId, pair] of this.active) {
      if (pair.mdSession.id === sessionId) {
        const msgType = raw.match(/(?:^|\x01)35=([^\x01]+)/)?.[1];
        if (msgType === 'y') {
          this.instruments.set(venueId, parseSecurityListRaw(raw));
        }
        return;
      }
    }
  }

  sendOrderMessage(venueId: string, fields: Map<number, string>): void {
    const pair = this.active.get(venueId);
    if (!pair) throw new Error(`Venue ${venueId} is not connected`);
    this.engine.sendMessage(pair.orSession.id, fields);
  }

  onStatusChange(callback: (s: VenueStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(venueId: string, state: { mdConnected: boolean; orConnected: boolean }): void {
    const status: VenueStatus = { venueId, ...state };
    for (const cb of this.listeners) cb(status);
  }
}
