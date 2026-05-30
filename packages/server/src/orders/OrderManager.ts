import { ClientOrderIdGenerator } from '@ancontrade/shared';
import type { AdminStore, OrderRecord } from '../admin/AdminStore.js';
import type { VenueManager } from '../venue/VenueManager.js';
import { buildNewOrderSingle, type NewOrderParams } from './buildNewOrderSingle.js';
import { parseExecutionReport } from './parseExecutionReport.js';

export interface SubmitOrderParams extends NewOrderParams {
  venueId: string;
}

export class OrderManager {
  private readonly updateListeners = new Set<(r: OrderRecord) => void>();

  constructor(
    private readonly idGen: ClientOrderIdGenerator,
    private readonly venueManager: VenueManager,
    private readonly store: AdminStore,
  ) {
    venueManager.onORMessage((_venueId, raw) => this.handleExecutionReport(raw));
  }

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

  handleExecutionReport(raw: string): void {
    const er = parseExecutionReport(raw);
    if (!er) return;
    const existing = this.store.getOrder(er.clOrdId);
    if (!existing) return;
    const updated = this.store.updateOrderStatus(er.clOrdId, {
      status: er.ordStatus,
      filledQty: er.cumQty,
      exchOrdId: er.exchOrdId || undefined,
      avgFillPrice: er.avgPx > 0 ? er.avgPx : undefined,
    });
    for (const cb of this.updateListeners) cb(updated);
  }

  onOrderUpdate(callback: (r: OrderRecord) => void): () => void {
    this.updateListeners.add(callback);
    return () => this.updateListeners.delete(callback);
  }
}
