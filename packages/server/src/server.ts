import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ClientOrderIdGenerator } from '@ancontrade/shared';
import { AdminStore } from './admin/AdminStore.js';
import { registerAdminRoutes } from './admin/adminRoutes.js';
import { VenueManager, type IFIXEngine } from './venue/VenueManager.js';
import { registerVenueRoutes } from './venue/venueRoutes.js';
import { OrderManager } from './orders/OrderManager.js';
import { registerOrderRoutes } from './orders/orderRoutes.js';
import { registerInstrumentRoutes } from './instruments/instrumentRoutes.js';
import { FIXMessageLog } from './fix/FIXMessageLog.js';
import { LoggingFIXEngine } from './fix/LoggingFIXEngine.js';

export function buildServer(dbPath = ':memory:', engine?: IFIXEngine, logDir: string | null = null) {
  const app = Fastify({ logger: false });
  void app.register(websocket);

  const adminStore = new AdminStore(dbPath);
  const fixLog = new FIXMessageLog(logDir);
  const loggingEngine: IFIXEngine | null = engine ? new LoggingFIXEngine(engine, fixLog) : null;
  const venueManager = new VenueManager(
    loggingEngine ?? null as any,
    adminStore,
  );
  const orderManager = new OrderManager(
    new ClientOrderIdGenerator(new Date()),
    venueManager,
    adminStore,
  );

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  // WebSocket push: venue status + order updates + cancel rejects
  app.get('/ws', { websocket: true }, (socket) => {
    const unsubVenue = venueManager.onStatusChange((status) => {
      socket.send(JSON.stringify({ type: 'venue-status', payload: status }));
    });
    const unsubOrder = orderManager.onOrderUpdate((record) => {
      socket.send(JSON.stringify({ type: 'order-update', payload: record }));
    });
    const unsubCancelReject = orderManager.onCancelReject((event) => {
      socket.send(JSON.stringify({ type: 'cancel-reject', payload: event }));
    });
    socket.on('close', () => { unsubVenue(); unsubOrder(); unsubCancelReject(); });
  });

  app.addHook('onClose', () => adminStore.close());

  registerAdminRoutes(app, adminStore);
  registerVenueRoutes(app, venueManager);
  registerOrderRoutes(app, orderManager, adminStore, fixLog);
  registerInstrumentRoutes(app, venueManager);

  return app;
}
