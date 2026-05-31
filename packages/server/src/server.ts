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
import { MarketDataManager, type StatusAlertEvent } from './marketdata/MarketDataManager.js';

export async function buildServer(dbPath = ':memory:', engine?: IFIXEngine, logDir: string | null = null) {
  const app = Fastify({ logger: false });
  await app.register(websocket);

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
  const mdManager = loggingEngine ? new MarketDataManager(loggingEngine) : null;

  // Route unexpected disconnect alerts from VenueManager through MDManager so
  // all alerts reach the same WS subscription
  venueManager.onDisconnectAlert((venueId, sessionName) => {
    const venueName = adminStore.getVenue(venueId)?.name ?? venueId;
    const alert: StatusAlertEvent = {
      ts: new Date().toISOString(),
      kind: 'disconnect',
      message: `${venueName} — ${sessionName} session disconnected`,
    };
    mdManager?.emitAlert(alert);
  });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  // WebSocket push: venue status + order updates + cancel rejects + price levels + alerts
  app.get('/ws', { websocket: true }, (socket) => {
    // Push current state to the newly connected client so it doesn't have to wait for the
    // next change event (handles page reloads while sessions are already active).
    for (const status of venueManager.getAllStatuses()) {
      socket.send(JSON.stringify({ type: 'venue-status', payload: status }));
    }

    const unsubVenue = venueManager.onStatusChange((status) => {
      socket.send(JSON.stringify({ type: 'venue-status', payload: status }));
    });
    const unsubOrder = orderManager.onOrderUpdate((record) => {
      socket.send(JSON.stringify({ type: 'order-update', payload: record }));
    });
    const unsubCancelReject = orderManager.onCancelReject((event) => {
      socket.send(JSON.stringify({ type: 'cancel-reject', payload: event }));
    });
    const unsubPriceLevels = mdManager?.onPriceLevels((event) => {
      socket.send(JSON.stringify({ type: 'price-levels', payload: event }));
    });
    const unsubAlert = mdManager?.onStatusAlert((event) => {
      socket.send(JSON.stringify({ type: 'status-alert', payload: event }));
    });
    socket.on('close', () => { unsubVenue(); unsubOrder(); unsubCancelReject(); unsubPriceLevels?.(); unsubAlert?.(); });
  });

  app.addHook('onClose', () => adminStore.close());

  registerAdminRoutes(app, adminStore);
  registerVenueRoutes(app, venueManager);
  registerOrderRoutes(app, orderManager, adminStore, fixLog);
  registerInstrumentRoutes(app, venueManager, mdManager);

  return app;
}
