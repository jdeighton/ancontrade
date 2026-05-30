import type { FastifyInstance } from 'fastify';
import type { VenueManager } from '../venue/VenueManager.js';

export function registerInstrumentRoutes(app: FastifyInstance, vm: VenueManager): void {
  app.get('/venues/:id/instruments', async (req) => {
    const { id } = req.params as { id: string };
    return vm.getInstruments(id);
  });
}
