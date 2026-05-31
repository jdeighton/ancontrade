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
  private readonly orListeners = new Set<(venueId: string, raw: string) => void>();
  private readonly mdListeners = new Set<(venueId: string, sessionId: string, raw: string) => void>();
  private readonly disconnectAlertListeners = new Set<(venueId: string, sessionName: string) => void>();
  private readonly instruments = new Map<string, Instrument[]>();
  private readonly operatorDisconnecting = new Set<string>(); // venueIds being intentionally disconnected

  constructor(
    private readonly engine: IFIXEngine,
    private readonly store: AdminStore,
  ) {
    if (engine) {
      engine.onMessage((sessionId, raw) => this.handleMessage(sessionId, raw));
    }
  }

  connect(venueId: string): void {
    if (this.active.has(venueId)) {
      // Re-emit current status so a freshly reconnected WebSocket client gets the state.
      const pair = this.active.get(venueId)!;
      this.emit(venueId, { mdConnected: pair.mdConnected, orConnected: pair.orConnected });
      return;
    }

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
      const wasConnected = pair.mdConnected;
      pair.mdConnected = status === 'active';
      if (status === 'active') {
        this.engine.sendMessage(pair.mdSession.id, new Map([
          [35, 'x'],
          [320, randomUUID()],
          [559, '4'],
        ]));
      } else if (wasConnected && !this.operatorDisconnecting.has(venueId)) {
        this.fireDisconnectAlert(venueId, 'market data');
      }
      this.emit(venueId, { mdConnected: pair.mdConnected, orConnected: pair.orConnected });
    });

    pair.orSession.on('status', (status) => {
      const wasConnected = pair.orConnected;
      pair.orConnected = status === 'active';
      if (!pair.orConnected && wasConnected && !this.operatorDisconnecting.has(venueId)) {
        this.fireDisconnectAlert(venueId, 'order routing');
      }
      this.emit(venueId, { mdConnected: pair.mdConnected, orConnected: pair.orConnected });
    });

    this.active.set(venueId, pair);
  }

  async disconnect(venueId: string): Promise<void> {
    const pair = this.active.get(venueId);
    if (!pair) return;
    this.operatorDisconnecting.add(venueId);
    this.active.delete(venueId);
    await Promise.all([
      this.engine.removeSession(pair.mdSession.id),
      this.engine.removeSession(pair.orSession.id),
    ]);
    this.operatorDisconnecting.delete(venueId);
    this.emit(venueId, { mdConnected: false, orConnected: false });
  }

  getStatus(venueId: string): VenueStatus {
    const pair = this.active.get(venueId);
    return { venueId, mdConnected: pair?.mdConnected ?? false, orConnected: pair?.orConnected ?? false };
  }

  getInstruments(venueId: string): Instrument[] {
    return this.instruments.get(venueId) ?? [];
  }

  onORMessage(callback: (venueId: string, raw: string) => void): () => void {
    this.orListeners.add(callback);
    return () => this.orListeners.delete(callback);
  }

  onMDMessage(callback: (venueId: string, sessionId: string, raw: string) => void): () => void {
    this.mdListeners.add(callback);
    return () => this.mdListeners.delete(callback);
  }

  getMDSessionId(venueId: string): string | null {
    return this.active.get(venueId)?.mdSession.id ?? null;
  }

  private handleMessage(sessionId: string, raw: string): void {
    for (const [venueId, pair] of this.active) {
      if (pair.mdSession.id === sessionId) {
        const msgType = raw.match(/(?:^|\x01)35=([^\x01]+)/)?.[1];
        if (msgType === 'y') {
          this.instruments.set(venueId, parseSecurityListRaw(raw));
        }
        for (const cb of this.mdListeners) cb(venueId, sessionId, raw);
        return;
      }
      if (pair.orSession.id === sessionId) {
        for (const cb of this.orListeners) cb(venueId, raw);
        return;
      }
    }
  }

  sendOrderMessage(venueId: string, fields: Map<number, string>): void {
    const pair = this.active.get(venueId);
    if (!pair) throw new Error(`Venue ${venueId} is not connected`);
    this.engine.sendMessage(pair.orSession.id, fields);
  }

  getAllStatuses(): VenueStatus[] {
    const out: VenueStatus[] = [];
    for (const [venueId, pair] of this.active) {
      out.push({ venueId, mdConnected: pair.mdConnected, orConnected: pair.orConnected });
    }
    return out;
  }

  onStatusChange(callback: (s: VenueStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onDisconnectAlert(callback: (venueId: string, sessionName: string) => void): () => void {
    this.disconnectAlertListeners.add(callback);
    return () => this.disconnectAlertListeners.delete(callback);
  }

  private fireDisconnectAlert(venueId: string, sessionName: string): void {
    for (const cb of this.disconnectAlertListeners) cb(venueId, sessionName);
  }

  private emit(venueId: string, state: { mdConnected: boolean; orConnected: boolean }): void {
    const status: VenueStatus = { venueId, ...state };
    for (const cb of this.listeners) cb(status);
  }
}
