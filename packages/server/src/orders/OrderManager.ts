import { ClientOrderIdGenerator } from '@ancontrade/shared';
import type { AdminStore, OrderRecord } from '../admin/AdminStore.js';
import type { FIXMessageLog } from '../fix/FIXMessageLog.js';
import type { VenueManager } from '../venue/VenueManager.js';
import { buildNewOrderSingle, type NewOrderParams } from './buildNewOrderSingle.js';
import { buildOrderCancelRequest } from './buildOrderCancelRequest.js';
import { parseExecutionReport } from './parseExecutionReport.js';
import { parseOrderCancelReject } from './parseOrderCancelReject.js';

export interface SubmitOrderParams extends NewOrderParams {
  venueId: string;
}

export interface CancelRejectEvent {
  clOrdId: string;
  cxlRejReason: number;
  text: string;
  order: OrderRecord;
}

export class OrderManager {
  private readonly updateListeners = new Set<(r: OrderRecord) => void>();
  private readonly cancelRejectListeners = new Set<(e: CancelRejectEvent) => void>();
  private readonly pendingCancels = new Map<string, string>(); // cancelClOrdId → origClOrdId

  constructor(
    private readonly idGen: ClientOrderIdGenerator,
    private readonly venueManager: VenueManager,
    private readonly store: AdminStore,
    private readonly fixLog?: FIXMessageLog,
  ) {
    venueManager.onORMessage((_venueId, raw) => this.handleIncoming(raw));
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
      orderType: params.orderType,
      price: params.price ?? 0,
      quantity: params.quantity,
      account: params.account,
      traderId: params.traderId,
    });
  }

  cancel(clOrdId: string): void {
    const order = this.store.getOrder(clOrdId);
    if (!order) throw new Error(`Order ${clOrdId} not found`);
    if (!['New', 'PartiallyFilled'].includes(order.status)) {
      throw new Error(`Cannot cancel order in ${order.status} state`);
    }
    if (!order.exchOrdId) throw new Error(`Order ${clOrdId} has no Exchange Order ID`);

    const cancelClOrdId = this.idGen.next();
    this.pendingCancels.set(cancelClOrdId, clOrdId);

    const fields = buildOrderCancelRequest(cancelClOrdId, {
      origClOrdId: clOrdId,
      exchOrdId: order.exchOrdId,
      symbol: order.symbol,
      side: order.side,
    });
    this.venueManager.sendOrderMessage(order.venueId, fields);
  }

  private handleIncoming(raw: string): void {
    this.handleExecutionReport(raw);
    this.handleCancelReject(raw);
  }

  handleExecutionReport(raw: string): void {
    const er = parseExecutionReport(raw);
    if (!er) return;

    // When tag 37 is present, prefer the order that already owns that ExchOrdID.
    // This handles self-match: the engine echoes the aggressor's tag 11 onto both
    // fill EPs, but tag 37 uniquely identifies which order each fill belongs to.
    // If no order owns tag 37 yet (New ack path), fall back to tag 11.
    const byExch = er.exchOrdId ? this.store.getOrderByExchOrdId(er.exchOrdId) : undefined;
    const order = byExch ?? this.store.getOrder(er.clOrdId);

    // When routed via ExchOrdID to a different order than tag 11, the log indexed
    // this message under the wrong ClOrdID. Move it to the correct one.
    if (byExch && byExch.clOrdId !== er.clOrdId) {
      this.fixLog?.reindexLatestInbound(er.clOrdId, byExch.clOrdId);
    }

    if (!order) return;
    const updated = this.store.updateOrderStatus(order.clOrdId, {
      status: er.ordStatus,
      filledQty: er.cumQty,
      exchOrdId: er.exchOrdId || undefined,
      avgFillPrice: er.avgPx > 0 ? er.avgPx : undefined,
      ordRejReason: er.ordRejReason,
      rejText: er.rejText,
      transactTime: er.transactTime,
    });
    for (const cb of this.updateListeners) cb(updated);
  }

  private handleCancelReject(raw: string): void {
    const cr = parseOrderCancelReject(raw);
    if (!cr) return;
    const origClOrdId = this.pendingCancels.get(cr.clOrdId);
    if (!origClOrdId) return;
    this.pendingCancels.delete(cr.clOrdId);
    const order = this.store.getOrder(origClOrdId);
    if (!order) return;
    for (const cb of this.cancelRejectListeners) cb({ ...cr, order });
  }

  onOrderUpdate(callback: (r: OrderRecord) => void): () => void {
    this.updateListeners.add(callback);
    return () => this.updateListeners.delete(callback);
  }

  onCancelReject(callback: (e: CancelRejectEvent) => void): () => void {
    this.cancelRejectListeners.add(callback);
    return () => this.cancelRejectListeners.delete(callback);
  }
}
