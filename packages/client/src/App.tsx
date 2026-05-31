import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { InputSwitch } from 'primereact/inputswitch';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import type { AccountConfig, CancelRejectEvent, Instrument, OrderRecord, PriceLevelsEvent, StatusAlertEvent, TraderIdConfig, Venue, VenueStatus } from './types.js';
import { OrderTicket } from './OrderTicket.js';
import { OrderBlotter } from './OrderBlotter.js';
import { OrderEventsPanel } from './OrderEventsPanel.js';
import { PriceLadder } from './PriceLadder.js';
import { StatusBar } from './StatusBar.js';
import { applyPrimeTheme } from './primeTheme.js';

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
  const [statusAlerts, setStatusAlerts] = useState<StatusAlertEvent[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const [subscribedSymbol, setSubscribedSymbol] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedSymbolRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    applyPrimeTheme(theme);
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
      } else if (msg.type === 'status-alert') {
        const alert = msg.payload as StatusAlertEvent;
        setStatusAlerts(prev => [...prev, alert]);
        if (alert.kind === 'md-reject') setPriceLevels(null);
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

  async function executeDisconnect() {
    setShowDisconnectConfirm(false);
    if (!selectedVenueId) return;
    if (subscribedSymbolRef.current) {
      const sym = encodeURIComponent(subscribedSymbolRef.current);
      await fetch(`/venues/${selectedVenueId}/instruments/${sym}/unsubscribe`, { method: 'POST' });
      subscribedSymbolRef.current = null;
      setSubscribedSymbol(null);
      setPriceLevels(null);
    }
    await fetch(`/venues/${selectedVenueId}/disconnect`, { method: 'POST' });
  }

  function handleDisconnect() {
    if (!selectedVenueId) return;
    if (hasOpenOrders) {
      setShowDisconnectConfirm(true);
    } else {
      void executeDisconnect();
    }
  }

  const subscribeToSymbol = useCallback(async (venueId: string, symbol: string) => {
    if (subscribedSymbolRef.current === symbol) return;
    if (subscribedSymbolRef.current) {
      const prev = encodeURIComponent(subscribedSymbolRef.current);
      await fetch(`/venues/${venueId}/instruments/${prev}/unsubscribe`, { method: 'POST' }).catch(() => {});
    }
    subscribedSymbolRef.current = symbol;
    setSubscribedSymbol(symbol);
    setPriceLevels(null);
    await fetch(`/venues/${venueId}/instruments/${encodeURIComponent(symbol)}/subscribe`, { method: 'POST' }).catch(console.error);
  }, []);

  async function handleResetHistory() {
    if (!window.confirm('Reset all order history? This cannot be undone.')) return;
    await fetch('/admin/orders/reset', { method: 'POST' });
    setOrders([]);
  }

  async function handleCancelRequest(clOrdId: string) {
    const res = await fetch(`/orders/${clOrdId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      alert(`Cancel failed: ${body.error ?? res.status}`);
    }
  }

  const orConnected = venueStatus?.venueId === selectedVenueId && venueStatus.orConnected;
  const mdConnected = venueStatus?.venueId === selectedVenueId && venueStatus.mdConnected;

  useEffect(() => {
    if (mdConnected && selectedVenueId) {
      refreshInstruments(selectedVenueId);
    }
  }, [mdConnected, selectedVenueId, refreshInstruments]);

  useEffect(() => {
    if (mdConnected && selectedVenueId && selectedSymbol) {
      subscribeToSymbol(selectedVenueId, selectedSymbol);
    }
  }, [mdConnected, selectedVenueId, selectedSymbol, subscribeToSymbol]);

  const openStatuses = new Set(['PendingNew', 'New', 'PartiallyFilled']);
  const hasOpenOrders = orders.some(o => openStatuses.has(o.status));

  const cancelRejectFooter = (
    <button onClick={() => setCancelReject(null)}>Dismiss</button>
  );

  const disconnectFooter = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      <button onClick={() => setShowDisconnectConfirm(false)}>Stay connected</button>
      <button
        onClick={() => void executeDisconnect()}
        style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-text)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
      >
        Disconnect anyway
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

      {/* Cancel-reject modal */}
      <Dialog
        visible={cancelReject !== null}
        onHide={() => setCancelReject(null)}
        header={<span style={{ color: 'var(--status-rejected)' }}>Cancel Rejected</span>}
        footer={cancelRejectFooter}
        style={{ minWidth: 360 }}
      >
        {cancelReject && (
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
        )}
      </Dialog>

      {/* Disconnect-with-open-orders confirmation modal */}
      <Dialog
        visible={showDisconnectConfirm}
        onHide={() => setShowDisconnectConfirm(false)}
        header={<span style={{ color: 'var(--warning-text)' }}>Disconnect with open orders?</span>}
        footer={disconnectFooter}
        style={{ minWidth: 360, maxWidth: 440 }}
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          You have {orders.filter(o => ['PendingNew', 'New', 'PartiallyFilled'].includes(o.status)).length} open order(s).
          Disconnecting will leave {orders.filter(o => ['PendingNew', 'New', 'PartiallyFilled'].includes(o.status)).length === 1 ? 'it' : 'them'} working at the exchange with no way to cancel from this session.
        </p>
      </Dialog>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Ancontrade</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dark</span>
          <InputSwitch
            checked={theme === 'light'}
            onChange={e => setTheme(e.value ? 'light' : 'dark')}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Light</span>
        </div>
      </div>

      <StatusBar alerts={statusAlerts} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Venue:{' '}
          <select value={selectedVenueId} onChange={e => setSelectedVenueId(e.target.value)}>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <button onClick={handleConnect}>Connect</button>
        <button onClick={handleDisconnect}>Disconnect</button>
        <span style={{ fontSize: 12, color: orConnected ? 'var(--status-filled)' : 'var(--status-rejected)' }}>
          OR: {orConnected ? 'Connected' : 'Disconnected'}
        </span>
        <span style={{ fontSize: 12, color: mdConnected ? 'var(--status-filled)' : 'var(--status-rejected)' }}>
          MD: {mdConnected ? 'Connected' : 'Disconnected'}
        </span>
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
          {mdConnected && selectedSymbol && (
            subscribedSymbol === selectedSymbol
              ? <span style={{ fontSize: 12, color: 'var(--status-filled)' }}>● Subscribed</span>
              : <button
                  style={{ fontSize: 12, padding: '2px 8px' }}
                  onClick={() => subscribeToSymbol(selectedVenueId, selectedSymbol)}
                >
                  Subscribe
                </button>
          )}
        </div>
      )}

      {venue && (
        <Splitter style={{ width: '100%', border: 'none', background: 'transparent' }}>
          <SplitterPanel size={22} minSize={15} style={{ overflow: 'auto' }}>
            <OrderTicket
              venueId={selectedVenueId}
              symbol={selectedSymbol || 'N/A'}
              tickSize={instruments.find(i => i.symbol === selectedSymbol)?.tickSize}
              accounts={venueAccounts}
              traderId={venueTraderId}
              priceOverride={priceOverride}
              onSubmitted={refreshOrders}
            />
          </SplitterPanel>
          <SplitterPanel size={16} minSize={12} style={{ overflow: 'auto' }}>
            <PriceLadder
              data={priceLevels?.symbol === selectedSymbol ? priceLevels : null}
              onPriceClick={setPriceOverride}
            />
          </SplitterPanel>
          <SplitterPanel size={62} minSize={30} style={{ overflow: 'auto' }}>
            <OrderBlotter
              orders={orders}
              onCancelRequest={handleCancelRequest}
              onRowSelected={setSelectedClOrdId}
              onResetHistory={handleResetHistory}
              isDark={theme === 'dark'}
            />
            <div style={{ marginTop: 16 }}>
              <OrderEventsPanel clOrdId={selectedClOrdId} isDark={theme === 'dark'} />
            </div>
          </SplitterPanel>
        </Splitter>
      )}
    </div>
  );
}
