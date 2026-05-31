import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountConfig, CancelRejectEvent, Instrument, OrderRecord, PriceLevelsEvent, TraderIdConfig, Venue, VenueStatus } from './types.js';
import { OrderTicket } from './OrderTicket.js';
import { OrderBlotter } from './OrderBlotter.js';
import { OrderEventsPanel } from './OrderEventsPanel.js';
import { PriceLadder } from './PriceLadder.js';

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

const CXL_REJ_REASONS: Record<number, string> = {
  0: 'Too Late to Cancel',
  1: 'Unknown Order',
  2: 'Broker Option',
  3: 'Already Pending Cancel',
};

function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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
  const [cancelReject, setCancelReject] = useState<CancelRejectEvent | null>(null);
  const [selectedClOrdId, setSelectedClOrdId] = useState<string | null>(null);
  const [priceLevels, setPriceLevels] = useState<PriceLevelsEvent | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedSymbolRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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
      const msg = JSON.parse(e.data) as { type: string; payload: any };
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
      } else if (msg.type === 'cancel-reject') {
        setCancelReject(msg.payload as CancelRejectEvent);
      } else if (msg.type === 'price-levels') {
        setPriceLevels(msg.payload as PriceLevelsEvent);
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
    if (subscribedSymbolRef.current) {
      const sym = encodeURIComponent(subscribedSymbolRef.current);
      await fetch(`/venues/${selectedVenueId}/instruments/${sym}/unsubscribe`, { method: 'POST' });
      subscribedSymbolRef.current = null;
      setPriceLevels(null);
    }
    await fetch(`/venues/${selectedVenueId}/disconnect`, { method: 'POST' });
  }

  const subscribeToSymbol = useCallback(async (venueId: string, symbol: string) => {
    if (subscribedSymbolRef.current === symbol) return;
    if (subscribedSymbolRef.current) {
      const prev = encodeURIComponent(subscribedSymbolRef.current);
      await fetch(`/venues/${venueId}/instruments/${prev}/unsubscribe`, { method: 'POST' }).catch(() => {});
    }
    subscribedSymbolRef.current = symbol;
    setPriceLevels(null);
    await fetch(`/venues/${venueId}/instruments/${encodeURIComponent(symbol)}/subscribe`, { method: 'POST' }).catch(console.error);
  }, []);

  async function handleResetHistory() {
    if (!window.confirm('Reset all order history? This cannot be undone.')) return;
    await fetch('/admin/orders/reset', { method: 'POST' });
    setOrders([]);
  }

  async function handleCancelRequest(clOrdId: string) {
    await fetch(`/orders/${clOrdId}`, { method: 'DELETE' });
  }

  const orConnected = venueStatus?.venueId === selectedVenueId && venueStatus.orConnected;
  const mdConnected = venueStatus?.venueId === selectedVenueId && venueStatus.mdConnected;

  useEffect(() => {
    if (mdConnected && selectedVenueId && selectedSymbol) {
      subscribeToSymbol(selectedVenueId, selectedSymbol);
    }
  }, [mdConnected, selectedVenueId, selectedSymbol, subscribeToSymbol]);
  const openStatuses = new Set(['PendingNew', 'New', 'PartiallyFilled']);
  const hasOpenOrders = orders.some(o => openStatuses.has(o.status));

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

      {/* Cancel-reject modal */}
      {cancelReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 24, minWidth: 360 }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--status-rejected)' }}>Cancel Rejected</h3>
            <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <tr><td style={{ paddingRight: 12, color: 'var(--text-muted)' }}>Symbol</td><td>{cancelReject.order.symbol}</td></tr>
                <tr><td style={{ color: 'var(--text-muted)' }}>Side</td><td>{cancelReject.order.side}</td></tr>
                <tr><td style={{ color: 'var(--text-muted)' }}>Qty</td><td>{cancelReject.order.quantity}</td></tr>
                <tr><td style={{ color: 'var(--text-muted)' }}>Price</td><td>{cancelReject.order.price}</td></tr>
                <tr><td style={{ color: 'var(--text-muted)' }}>Status</td><td>{cancelReject.order.status}</td></tr>
                <tr><td style={{ color: 'var(--text-muted)' }}>Reason</td><td>{CXL_REJ_REASONS[cancelReject.cxlRejReason] ?? `Code ${cancelReject.cxlRejReason}`}</td></tr>
                {cancelReject.text && <tr><td style={{ color: 'var(--text-muted)' }}>Text</td><td>{cancelReject.text}</td></tr>}
              </tbody>
            </table>
            <button onClick={() => setCancelReject(null)} style={{ marginTop: 16 }}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Ancontrade</h2>
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          style={{ fontSize: 12, padding: '4px 10px' }}
          title="Toggle light/dark theme"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      {orConnected && hasOpenOrders && (
        <div style={{ padding: '8px 12px', background: 'var(--warning-bg)', color: 'var(--warning-text)', borderRadius: 4, fontSize: 13 }}>
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
          <span style={{ fontSize: 12, color: orConnected ? 'var(--status-filled)' : 'var(--status-rejected)' }}>
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
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
          <PriceLadder data={priceLevels?.symbol === selectedSymbol ? priceLevels : null} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button onClick={handleResetHistory} style={{ fontSize: 12, color: 'var(--error)' }}>
                Reset History
              </button>
            </div>
            <OrderBlotter orders={orders} onCancelRequest={handleCancelRequest} onRowSelected={setSelectedClOrdId} />
            <div style={{ marginTop: 16 }}>
              <OrderEventsPanel clOrdId={selectedClOrdId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
