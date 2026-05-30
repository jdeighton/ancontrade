import type { FastifyInstance } from 'fastify';
import type { AdminStore } from './AdminStore.js';

export function registerAdminRoutes(app: FastifyInstance, store: AdminStore): void {
  // ─── Session Configs ───────────────────────────────────────────────────────

  app.get('/admin/session-configs', async () => store.listSessionConfigs());

  app.post('/admin/session-configs', async (req, reply) => {
    const body = req.body as any;
    const created = store.createSessionConfig(body);
    reply.code(201);
    return created;
  });

  app.get('/admin/session-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const sc = store.getSessionConfig(id);
    if (!sc) { reply.code(404); return { error: 'Not found' }; }
    return sc;
  });

  app.patch('/admin/session-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { return store.updateSessionConfig(id, req.body as any); }
    catch { reply.code(404); return { error: 'Not found' }; }
  });

  app.delete('/admin/session-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { store.deleteSessionConfig(id); reply.code(204); }
    catch (e: any) { reply.code(409); return { error: e.message }; }
  });

  // ─── Trader ID Configs ─────────────────────────────────────────────────────

  app.get('/admin/trader-id-configs', async () => store.listTraderIdConfigs());

  app.post('/admin/trader-id-configs', async (req, reply) => {
    reply.code(201);
    return store.createTraderIdConfig(req.body as any);
  });

  app.patch('/admin/trader-id-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { return store.updateTraderIdConfig(id, req.body as any); }
    catch { reply.code(404); return { error: 'Not found' }; }
  });

  app.delete('/admin/trader-id-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { store.deleteTraderIdConfig(id); reply.code(204); }
    catch (e: any) { reply.code(409); return { error: e.message }; }
  });

  // ─── Account Configs ───────────────────────────────────────────────────────

  app.get('/admin/account-configs', async () => store.listAccountConfigs());

  app.post('/admin/account-configs', async (req, reply) => {
    reply.code(201);
    return store.createAccountConfig(req.body as any);
  });

  app.patch('/admin/account-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { return store.updateAccountConfig(id, req.body as any); }
    catch { reply.code(404); return { error: 'Not found' }; }
  });

  app.delete('/admin/account-configs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { store.deleteAccountConfig(id); reply.code(204); }
    catch (e: any) { reply.code(409); return { error: e.message }; }
  });

  // ─── Venues ────────────────────────────────────────────────────────────────

  app.get('/admin/venues', async () => store.listVenues());

  app.post('/admin/venues', async (req, reply) => {
    reply.code(201);
    return store.createVenue(req.body as any);
  });

  app.get('/admin/venues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const v = store.getVenue(id);
    if (!v) { reply.code(404); return { error: 'Not found' }; }
    return v;
  });

  app.patch('/admin/venues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try { return store.updateVenue(id, req.body as any); }
    catch { reply.code(404); return { error: 'Not found' }; }
  });

  app.delete('/admin/venues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    store.deleteVenue(id);
    reply.code(204);
  });
}
