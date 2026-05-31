import type { FastifyInstance } from 'fastify';
import type { OrderManager } from './OrderManager.js';
import type { AdminStore } from '../admin/AdminStore.js';

export function registerOrderRoutes(app: FastifyInstance, orderManager: OrderManager, store: AdminStore): void {
  app.post('/orders', async (req, reply) => {
    const { venueId, symbol, side, price, quantity, account, traderId } = req.body as {
      venueId: string;
      symbol: string;
      side: 'buy' | 'sell';
      price: number;
      quantity: number;
      account: string;
      traderId: string;
    };
    try {
      const record = orderManager.submit({ venueId, symbol, side, price, quantity, account, traderId });
      reply.code(201);
      return record;
    } catch (e: any) {
      reply.code(404);
      return { error: e.message };
    }
  });

  app.get('/orders', async () => {
    return store.listOrders();
  });

  app.delete('/orders/:clOrdId', async (req, reply) => {
    const { clOrdId } = req.params as { clOrdId: string };
    try {
      orderManager.cancel(clOrdId);
      reply.code(202);
      return {};
    } catch (e: any) {
      const status = e.message.includes('not found') ? 404 : 409;
      reply.code(status);
      return { error: e.message };
    }
  });
}
