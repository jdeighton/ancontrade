import Fastify from 'fastify';
import { AdminStore } from './admin/AdminStore.js';
import { registerAdminRoutes } from './admin/adminRoutes.js';

export function buildServer(dbPath = ':memory:') {
  const app = Fastify({ logger: false });
  const adminStore = new AdminStore(dbPath);

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  registerAdminRoutes(app, adminStore);

  return app;
}
