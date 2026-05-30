import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ClientOrderIdGenerator } from '@ancontrade/shared';
import { AdminStore } from './admin/AdminStore.js';
import { registerAdminRoutes } from './admin/adminRoutes.js';
import { VenueManager, type IFIXEngine } from './venue/VenueManager.js';
import { registerVenueRoutes } from './venue/venueRoutes.js';
import { OrderManager } from './orders/OrderManager.js';
import { registerOrderRoutes } from './orders/orderRoutes.js';

export function buildServer(dbPath = ':memory:', engine?: IFIXEngine) {
  const app = Fastify({ logger: false });
  void app.register(websocket);

  const adminStore = new AdminStore(dbPath);
  const venueManager = new VenueManager(
    // Real FIX engine injected at startup via index.ts; use null here so tests
    // that only call /health don't need a real engine. VenueManager is unused
    // in those tests.
    engine ?? null as any,
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

  // WebSocket push: venue status changes
  app.get('/ws', { websocket: true }, (socket) => {
    const unsub = venueManager.onStatusChange((status) => {
      socket.send(JSON.stringify({ type: 'venue-status', payload: status }));
    });
    socket.on('close', unsub);
  });

  registerAdminRoutes(app, adminStore);
  registerVenueRoutes(app, venueManager);
  registerOrderRoutes(app, orderManager, adminStore);

  return app;
}
