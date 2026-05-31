import type { FastifyInstance } from 'fastify';
import type { VenueManager } from '../venue/VenueManager.js';
import type { MarketDataManager } from '../marketdata/MarketDataManager.js';

export function registerInstrumentRoutes(app: FastifyInstance, vm: VenueManager, mdm: MarketDataManager | null): void {
  app.get('/venues/:id/instruments', async (req) => {
    const { id } = req.params as { id: string };
    return vm.getInstruments(id);
  });

  app.post('/venues/:venueId/instruments/:symbol/subscribe', async (req, reply) => {
    if (!mdm) return reply.code(503).send({ error: 'Market data not available' });
    const { venueId, symbol } = req.params as { venueId: string; symbol: string };
    const sessionId = vm.getMDSessionId(venueId);
    if (!sessionId) return reply.code(409).send({ error: 'Venue not connected' });
    const instruments = vm.getInstruments(venueId);
    const instrument = instruments.find(i => i.symbol === symbol);
    if (!instrument) return reply.code(404).send({ error: 'Instrument not found' });
    mdm.subscribe(sessionId, symbol, instrument.tickSize);
    reply.code(204);
  });

  app.post('/venues/:venueId/instruments/:symbol/unsubscribe', async (req, reply) => {
    if (!mdm) return reply.code(503).send({ error: 'Market data not available' });
    const { venueId, symbol } = req.params as { venueId: string; symbol: string };
    const sessionId = vm.getMDSessionId(venueId);
    if (!sessionId) return reply.code(409).send({ error: 'Venue not connected' });
    mdm.unsubscribe(sessionId, symbol);
    reply.code(204);
  });
}
