import type { FastifyInstance } from 'fastify';
import type { VenueManager } from './VenueManager.js';

export function registerVenueRoutes(app: FastifyInstance, vm: VenueManager): void {
  app.post('/venues/:id/connect', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      vm.connect(id);
      reply.code(204);
    } catch (e: any) {
      reply.code(404);
      return { error: e.message };
    }
  });

  app.post('/venues/:id/disconnect', async (req, reply) => {
    const { id } = req.params as { id: string };
    await vm.disconnect(id);
    reply.code(204);
  });

  app.get('/venues/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    return vm.getStatus(id);
  });
}
