import { EventEmitter } from 'node:events';
import type { IFIXEngine, IFIXSession } from './VenueManager.js';

class NoopSession extends EventEmitter implements IFIXSession {
  constructor(readonly id: string) { super(); }
}

export class NoopFIXEngine implements IFIXEngine {
  addSession(config: { senderCompId: string; targetCompId: string }): IFIXSession {
    const id = `${config.senderCompId}-${config.targetCompId}-FIX.4.4`;
    console.log(`[NoopFIXEngine] addSession ${id}`);
    return new NoopSession(id);
  }

  async removeSession(id: string) {
    console.log(`[NoopFIXEngine] removeSession ${id}`);
  }

  sendMessage(sessionId: string, fields: Map<number, string>) {
    console.log(`[NoopFIXEngine] sendMessage on ${sessionId}: MsgType=${fields.get(35)} ClOrdID=${fields.get(11)}`);
  }

  onMessage(_cb: (sessionId: string, raw: string) => void): () => void {
    return () => {};
  }
}
