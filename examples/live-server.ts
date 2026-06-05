/**
 * Ancontrade server with a real FIX 4.4 engine.
 *
 * Wraps @fixenginelib/core Engine to satisfy the IFIXEngine interface expected
 * by VenueManager.  Session sequence numbers are reset on every run so the
 * engine and the matching engine both start at seq 1 without needing stored
 * session files.  FIX session logs go to ./logs/ancontrade/.
 *
 * Intended to be started by dev-env.ts.  Also runnable standalone:
 *   npx tsx examples/live-server.ts
 */

import { Engine } from '@fixenginelib/core';
import type { IFIXEngine, IFIXSession } from '../packages/server/src/venue/VenueManager.js';
import { buildServer } from '../packages/server/src/server.js';

// ─── Real FIX engine adapter ──────────────────────────────────────────────────

const freshStore = { load: async () => ({ outSeqNum: 1, inSeqNum: 1 }), save: async () => {} };

class RealFIXEngine implements IFIXEngine {
  private readonly engine = new Engine([]);
  private readonly subscribers = new Set<(sessionId: string, raw: string) => void>();

  constructor() {
    this.engine.start();
    void this.runLoop();
  }

  private async runLoop(): Promise<void> {
    for await (const msg of this.engine.messages()) {
      for (const cb of this.subscribers) cb(msg.sessionId, msg.raw);
    }
  }

  addSession(config: Parameters<IFIXEngine['addSession']>[0]): IFIXSession {
    return this.engine.addSession({
      ...config,
      logDir: './logs/ancontrade',
      store:  freshStore,
    }) as unknown as IFIXSession;
  }

  async removeSession(id: string): Promise<void> {
    await this.engine.removeSession(id);
  }

  sendMessage(sessionId: string, fields: Map<number, string>): void {
    this.engine.sendMessage(sessionId, fields);
  }

  onMessage(cb: (sessionId: string, raw: string) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  async stop(): Promise<void> {
    await this.engine.stop();
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────

const fixEngine = new RealFIXEngine();
const app = await buildServer(':memory:', fixEngine, './logs/ancontrade');

try {
  await app.listen({ port: 3001, host: '0.0.0.0' });
  console.log('[SERVER] listening on http://localhost:3001');
} catch (err) {
  console.error(err);
  process.exit(1);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  await Promise.all([app.close(), fixEngine.stop()]);
  process.exit(0);
});
