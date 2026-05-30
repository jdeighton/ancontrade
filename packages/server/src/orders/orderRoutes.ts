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
}
