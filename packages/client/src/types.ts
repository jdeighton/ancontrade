export interface SessionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  senderCompId: string;
  targetCompId: string;
}

export interface TraderIdConfig {
  id: string;
  traderId: string;
  displayAlias?: string;
}

export interface AccountConfig {
  id: string;
  account: string;
  displayAlias?: string;
}

export interface Venue {
  id: string;
  name: string;
  mdSessionConfigId: string;
  orSessionConfigId: string;
  traderIdConfigId: string;
  accountConfigIds: string[];
}

export type OrderStatus = 'PendingNew' | 'New' | 'PartiallyFilled' | 'Filled' | 'Cancelled' | 'Rejected';

export interface OrderRecord {
  clOrdId: string;
  venueId: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  account: string;
  traderId: string;
  status: OrderStatus;
  filledQty: number;
  exchOrdId?: string;
  avgFillPrice?: number;
}

export interface CancelRejectEvent {
  clOrdId: string;
  cxlRejReason: number;
  text: string;
  order: OrderRecord;
}

export interface Instrument {
  symbol: string;
  tickSize: number;
  contractSize?: number;
  currency?: string;
  expiry?: string;
}

export interface VenueStatus {
  venueId: string;
  mdConnected: boolean;
  orConnected: boolean;
}
