import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { AdminStore } from './admin/AdminStore.js';
import { registerAdminRoutes } from './admin/adminRoutes.js';
import { VenueManager } from './venue/VenueManager.js';
import { registerVenueRoutes } from './venue/venueRoutes.js';

export function buildServer(dbPath = ':memory:') {
  const app = Fastify({ logger: false });
  void app.register(websocket);

  const adminStore = new AdminStore(dbPath);
  const venueManager = new VenueManager(
    // Real FIX engine injected at startup via index.ts; use null here so tests
    // that only call /health don't need a real engine. VenueManager is unused
    // in those tests.
    null as any,
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

  return app;
}
