import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountConfig, OrderRecord, TraderIdConfig, Venue, VenueStatus } from './types.js';
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
  const [symbol, setSymbol] = useState('EUR/USD');
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
      const msg = JSON.parse(e.data) as { type: string; payload: VenueStatus };
      if (msg.type === 'venue-status') {
        setVenueStatus(v => (v?.venueId === msg.payload.venueId || !v) ? msg.payload : v);
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

  async function handleConnect() {
    if (!selectedVenueId) return;
    await fetch(`/venues/${selectedVenueId}/connect`, { method: 'POST' });
  }

  async function handleDisconnect() {
    if (!selectedVenueId) return;
    await fetch(`/venues/${selectedVenueId}/disconnect`, { method: 'POST' });
  }

  const orConnected = venueStatus?.venueId === selectedVenueId && venueStatus.orConnected;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0 }}>Ancontrade</h2>

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

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Symbol:{' '}
          <input value={symbol} onChange={e => setSymbol(e.target.value)} style={{ width: 120 }} />
        </label>
      </div>

      {venue && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <OrderTicket
            venueId={selectedVenueId}
            symbol={symbol}
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
