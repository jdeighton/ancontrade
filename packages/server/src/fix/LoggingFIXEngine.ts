import type { IFIXEngine, IFIXSession } from '../venue/VenueManager.js';
import type { FIXMessageLog } from './FIXMessageLog.js';

export class LoggingFIXEngine implements IFIXEngine {
  constructor(
    private readonly inner: IFIXEngine,
    private readonly log: FIXMessageLog,
  ) {}

  addSession(config: Parameters<IFIXEngine['addSession']>[0]): IFIXSession {
    return this.inner.addSession(config);
  }

  async removeSession(id: string): Promise<void> {
    return this.inner.removeSession(id);
  }

  sendMessage(sessionId: string, fields: Map<number, string>): void {
    this.log.logOutbound(sessionId, fields);
    this.inner.sendMessage(sessionId, fields);
  }

  onMessage(cb: (sessionId: string, raw: string) => void): () => void {
    return this.inner.onMessage((sessionId, raw) => {
      this.log.logInbound(sessionId, raw);
      cb(sessionId, raw);
    });
  }
}
