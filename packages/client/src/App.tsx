import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountConfig, Instrument, OrderRecord, TraderIdConfig, Venue, VenueStatus } from './types.js';
import { OrderTicket } from './OrderTicket.js';
import { OrderBlotter } from './OrderBlotter.js';

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function App() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [traderIdConfigs, setTraderIdConfigs] = useState<TraderIdConfig[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [venueStatus, setVenueStatus] = useState<VenueStatus | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const refreshOrders = useCallback(() => {
    apiFetch<OrderRecord[]>('/orders').then(setOrders).catch(console.error);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch<Venue[]>('/admin/venues'),
      apiFetch<AccountConfig[]>('/admin/account-configs'),
      apiFetch<TraderIdConfig[]>('/admin/trader-id-configs'),
    ]).then(([v, a, t]) => {
      setVenues(v);
      setAccountConfigs(a);
      setTraderIdConfigs(t);
      if (v.length > 0) setSelectedVenueId(v[0].id);
    }).catch(console.error);

    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as { type: string; payload: VenueStatus | OrderRecord };
      if (msg.type === 'venue-status') {
        const status = msg.payload as VenueStatus;
        setVenueStatus(v => (v?.venueId === status.venueId || !v) ? status : v);
      } else if (msg.type === 'order-update') {
        const updated = msg.payload as OrderRecord;
        setOrders(prev => {
          const idx = prev.findIndex(o => o.clOrdId === updated.clOrdId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
      }
    };
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const venue = venues.find(v => v.id === selectedVenueId) ?? null;
  const venueAccounts = venue
    ? accountConfigs.filter(ac => venue.accountConfigIds.includes(ac.id))
    : [];
  const venueTraderId = venue
    ? (traderIdConfigs.find(tr => tr.id === venue.traderIdConfigId)?.traderId ?? '')
    : '';

  const refreshInstruments = useCallback((venueId: string) => {
    apiFetch<Instrument[]>(`/venues/${venueId}/instruments`)
      .then(instrs => {
        setInstruments(instrs);
        if (instrs.length > 0) setSelectedSymbol(instrs[0].symbol);
      })
      .catch(console.error);
  }, []);

  async function handleConnect() {
    if (!selectedVenueId) return;
    await fetch(`/venues/${selectedVenueId}/connect`, { method: 'POST' });
    refreshInstruments(selectedVenueId);
  }

  async function handleDisconnect() {
    if (!selectedVenueId) return;
    await fetch(`/venues/${selectedVenueId}/disconnect`, { method: 'POST' });
  }

  const orConnected = venueStatus?.venueId === selectedVenueId && venueStatus.orConnected;
  const openStatuses = new Set(['PendingNew', 'New', 'PartiallyFilled']);
  const hasOpenOrders = orders.some(o => openStatuses.has(o.status));

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0 }}>Ancontrade</h2>

      {orConnected && hasOpenOrders && (
        <div style={{ padding: '8px 12px', background: '#7a4f00', color: '#ffd580', borderRadius: 4, fontSize: 13 }}>
          Warning: you have open orders. Disconnecting will leave them working in the exchange.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Venue:{' '}
          <select value={selectedVenueId} onChange={e => setSelectedVenueId(e.target.value)}>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <button onClick={handleConnect}>Connect</button>
        <button onClick={handleDisconnect}>Disconnect</button>
        {venueStatus && (
          <span style={{ fontSize: 12, color: orConnected ? '#1a7f1a' : '#c0392b' }}>
            OR: {orConnected ? 'Connected' : 'Disconnected'}
          </span>
        )}
      </div>

      {instruments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>
            Instrument:{' '}
            <select value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)}>
              {instruments.map(i => (
                <option key={i.symbol} value={i.symbol}>{i.symbol}</option>
              ))}
            </select>
          </label>
          {instruments.find(i => i.symbol === selectedSymbol) && (
            <span style={{ fontSize: 12, color: '#888' }}>
              tick: {instruments.find(i => i.symbol === selectedSymbol)!.tickSize}
            </span>
          )}
        </div>
      )}

      {venue && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <OrderTicket
            venueId={selectedVenueId}
            symbol={selectedSymbol || 'N/A'}
            tickSize={instruments.find(i => i.symbol === selectedSymbol)?.tickSize}
            accounts={venueAccounts}
            traderId={venueTraderId}
            onSubmitted={refreshOrders}
          />
          <OrderBlotter orders={orders} />
        </div>
      )}
    </div>
  );
}
