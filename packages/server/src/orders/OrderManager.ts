import { ClientOrderIdGenerator } from '@ancontrade/shared';
import type { AdminStore, OrderRecord } from '../admin/AdminStore.js';
import type { VenueManager } from '../venue/VenueManager.js';
import { buildNewOrderSingle, type NewOrderParams } from './buildNewOrderSingle.js';

export interface SubmitOrderParams extends NewOrderParams {
  venueId: string;
}

export class OrderManager {
  constructor(
    private readonly idGen: ClientOrderIdGenerator,
    private readonly venueManager: VenueManager,
    private readonly store: AdminStore,
  ) {}

  submit(params: SubmitOrderParams): OrderRecord {
    const clOrdId = this.idGen.next();
    const fields = buildNewOrderSingle(clOrdId, params);
    this.venueManager.sendOrderMessage(params.venueId, fields);
    return this.store.createOrder({
      clOrdId,
      venueId: params.venueId,
      symbol: params.symbol,
      side: params.side,
      price: params.price,
      quantity: params.quantity,
      account: params.account,
      traderId: params.traderId,
    });
  }
}
