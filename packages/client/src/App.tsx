import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { FloatLabel } from 'primereact/floatlabel';
import { Menubar } from 'primereact/menubar';
import type { MenuItem } from 'primereact/menuitem';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Toolbar } from 'primereact/toolbar';
import type { AccountConfig, CancelRejectEvent, Instrument, OrderRecord, PriceLevelsEvent, StatusAlertEvent, TraderIdConfig, Venue, VenueStatus } from './types.js';
import type { BlotterFilter } from './OrderBlotter.js';
import { SettingsDialog } from './SettingsDialog.js';
import { OrderTicket } from './OrderTicket.js';
import { OrderBlotter } from './OrderBlotter.js';
import { OrderEventsPanel } from './OrderEventsPanel.js';
import { PriceLadder } from './PriceLadder.js';
import { StatusBar } from './StatusBar.js';
import { applyPrimeTheme } from './primeTheme.js';

const BLOTTER_FILTER_OPTIONS: { label: string; value: BlotterFilter }[] = [
  { label: 'All',       value: 'All' },
  { label: 'Working',   value: 'Working' },
  { label: 'Fills',     value: 'Fills' },
  { label: 'Rejected',  value: 'Rejected' },
  { label: 'Cancelled', value: 'Cancelled' },
];

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

function getInitialFontSize(): number {
  const n = Number(localStorage.getItem('priceLadderFontSize'));
  return n >= 10 && n <= 20 ? n : 13;
}

function venuesMenuColour(venues: Venue[], statuses: Record<string, VenueStatus>): string {
  if (venues.length === 0) return 'grey';
  const allFull = venues.every(v => statuses[v.id]?.mdConnected && statuses[v.id]?.orConnected);
  const noneAny = venues.every(v => !statuses[v.id]?.mdConnected && !statuses[v.id]?.orConnected);
  if (allFull) return 'var(--status-filled)';
  if (noneAny) return 'var(--status-rejected)';
  return 'var(--status-partial)';
}

export function App() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [traderIdConfigs, setTraderIdConfigs] = useState<TraderIdConfig[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [venueStatuses, setVenueStatuses] = useState<Record<string, VenueStatus>>({});
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
  const [showSettings, setShowSettings] = useState(false);
  const [showVenues, setShowVenues] = useState(false);
  const [blotterFilter, setBlotterFilter] = useState<BlotterFilter>('All');
  const [priceLadderFontSize, setPriceLadderFontSize] = useState<number>(getInitialFontSize);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedSymbolRef = useRef<string | null>(null);
  const pendingDisconnectVenueRef = useRef<string>('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    applyPrimeTheme(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('priceLadderFontSize', String(priceLadderFontSize));
  }, [priceLadderFontSize]);

  const refreshAdminData = useCallback(() => {
    Promise.all([
      apiFetch<Venue[]>('/admin/venues'),
      apiFetch<AccountConfig[]>('/admin/account-configs'),
      apiFetch<TraderIdConfig[]>('/admin/trader-id-configs'),
    ]).then(([v, a, t]) => {
      setVenues(v);
      setAccountConfigs(a);
      setTraderIdConfigs(t);
      if (v.length > 0 && !selectedVenueId) setSelectedVenueId(v[0].id);
    }).catch(console.error);
  }, [selectedVenueId]);

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
        setVenueStatuses(prev => ({ ...prev, [status.venueId]: status }));
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

  const activeStatus = venueStatuses[selectedVenueId];
  const orConnected = activeStatus?.orConnected ?? false;
  const mdConnected = activeStatus?.mdConnected ?? false;

  const refreshInstruments = useCallback((venueId: string) => {
    apiFetch<Instrument[]>(`/venues/${venueId}/instruments`)
      .then(instrs => {
        setInstruments(instrs);
        if (instrs.length > 0) setSelectedSymbol(instrs[0].symbol);
      })
      .catch(console.error);
  }, []);

  async function handleConnect(venueId: string) {
    await fetch(`/venues/${venueId}/connect`, { method: 'POST' });
  }

  async function executeDisconnect() {
    const venueId = pendingDisconnectVenueRef.current;
    setShowDisconnectConfirm(false);
    if (!venueId) return;
    if (venueId === selectedVenueId && subscribedSymbolRef.current) {
      const sym = encodeURIComponent(subscribedSymbolRef.current);
      await fetch(`/venues/${venueId}/instruments/${sym}/unsubscribe`, { method: 'POST' });
      subscribedSymbolRef.current = null;
      setSubscribedSymbol(null);
      setPriceLevels(null);
    }
    await fetch(`/venues/${venueId}/disconnect`, { method: 'POST' });
  }

  const openStatuses = new Set(['PendingNew', 'New', 'PartiallyFilled']);
  const hasOpenOrders = orders.some(o => openStatuses.has(o.status));

  function handleDisconnect(venueId: string) {
    if (!venueId) return;
    pendingDisconnectVenueRef.current = venueId;
    if (venueId === selectedVenueId && hasOpenOrders) {
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

  async function handleCancelRequest(clOrdId: string) {
    const res = await fetch(`/orders/${clOrdId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      alert(`Cancel failed: ${body.error ?? res.status}`);
    }
  }

  function handleDownloadCsv() {
    const fmtTime = (iso?: string) => iso ? iso.slice(0, 23).replace('T', ' ') : '';
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['ClOrdID', 'Symbol', 'Side', 'Price', 'Qty', 'Status', 'Filled', 'Avg Px', 'Exch OrdID', 'Rej Reason', 'Rej Text', 'Entry Time', 'Last Updated'];
    const rows = orders.map(o => [
      o.clOrdId, o.symbol, o.side,
      o.orderType === 'market' ? 'MKT' : o.price,
      o.quantity, o.status, o.filledQty,
      o.avgFillPrice ?? '', o.exchOrdId ?? '',
      o.ordRejReason ?? '', o.rejText ?? '',
      fmtTime(o.entryTime), fmtTime(o.lastUpdated),
    ]);
    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `OrderBlotter-${ts}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

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

  // ─── Menubar ──────────────────────────────────────────────────────────────

  const venueColour = venuesMenuColour(venues, venueStatuses);

  const menuModel: MenuItem[] = [
    {
      template: (_item: any, options: any) => (
        <a className={options.className} onClick={() => setShowVenues(true)} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <span className="pi pi-building-columns" style={{ color: venueColour, marginRight: '0.5rem' }} />
          <span style={{ color: venueColour }}>Venues</span>
        </a>
      ),
    },
    {
      template: (_item: any, options: any) => (
        <a className={options.className} onClick={() => setShowSettings(true)} style={{ cursor: 'pointer' }}>
          <span className="pi pi-cog" />
        </a>
      ),
    },
  ];

  const menuStart = (
    <span style={{ fontWeight: 700, fontSize: 16, marginRight: 8, color: 'var(--text)' }}>
      AnconTrade
    </span>
  );

  // ─── Disconnect confirm footer ────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>

      {/* Cancel-reject modal */}
      <Dialog
        visible={cancelReject !== null}
        onHide={() => setCancelReject(null)}
        header={<span style={{ color: 'var(--status-rejected)' }}>Cancel Rejected</span>}
        footer={<button onClick={() => setCancelReject(null)}>Dismiss</button>}
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

      <SettingsDialog
        visible={showSettings}
        onHide={() => setShowSettings(false)}
        theme={theme}
        onThemeChange={setTheme}
        priceLadderFontSize={priceLadderFontSize}
        onFontSizeChange={setPriceLadderFontSize}
        onDataChanged={refreshAdminData}
      />

      {/* Venues status + connect/disconnect dialog */}
      <Dialog
        visible={showVenues}
        onHide={() => setShowVenues(false)}
        header="Venues"
        style={{ minWidth: 420 }}
      >
        {venues.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No venues configured. Open Settings to add a venue.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {venues.map(v => {
              const st = venueStatuses[v.id];
              const orConn = st?.orConnected ?? false;
              const mdConn = st?.mdConnected ?? false;
              const anyConn = orConn || mdConn;
              const dot = (on: boolean) => (
                <span style={{ color: on ? 'var(--status-filled)' : 'var(--status-rejected)', fontSize: 14 }}>
                  {on ? '●' : '○'}
                </span>
              );
              return (
                <div
                  key={v.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--border-light)', borderRadius: 4,
                    background: v.id === selectedVenueId ? 'rgba(128,128,128,0.1)' : undefined,
                  }}
                >
                  <span
                    style={{ flex: 1, fontSize: 14, fontWeight: v.id === selectedVenueId ? 600 : 400, cursor: 'pointer' }}
                    onClick={() => { setSelectedVenueId(v.id); setShowVenues(false); }}
                    title="Select venue"
                  >
                    {v.name}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                    OR {dot(orConn)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                    MD {dot(mdConn)}
                  </span>
                  <Button
                    label={anyConn ? 'Disconnect' : 'Connect'}
                    severity={anyConn ? 'warning' : 'success'}
                    outlined
                    size="small"
                    onClick={() => {
                      if (anyConn) handleDisconnect(v.id);
                      else void handleConnect(v.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Dialog>

      <Menubar model={menuModel} start={menuStart} />

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <StatusBar alerts={statusAlerts} />

        {venues.length > 0 && (
          <Splitter style={{ width: '100%', border: 'none', background: 'transparent' }}>

            {/* Left: venue + instrument selector + order ticket + price ladder */}
            <SplitterPanel size={38} minSize={25} style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              <Toolbar
                start={
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <FloatLabel>
                      <Dropdown
                        inputId="venue-select"
                        value={selectedVenueId}
                        options={venues.map(v => ({ label: v.name, value: v.id }))}
                        onChange={e => setSelectedVenueId(e.value)}
                        style={{ minWidth: 160 }}
                      />
                      <label htmlFor="venue-select">Venue</label>
                    </FloatLabel>
                    {venue && instruments.length > 0 && (
                      <>
                        <FloatLabel>
                          <Dropdown
                            inputId="instrument-select"
                            value={selectedSymbol}
                            options={instruments.map(i => ({ label: i.symbol, value: i.symbol }))}
                            onChange={e => setSelectedSymbol(e.value)}
                            style={{ minWidth: 120 }}
                          />
                          <label htmlFor="instrument-select">Instrument</label>
                        </FloatLabel>
                        {instruments.find(i => i.symbol === selectedSymbol) && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            tick: {instruments.find(i => i.symbol === selectedSymbol)!.tickSize}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                }
                end={
                  venue && instruments.length > 0 && mdConnected && selectedSymbol ? (
                    subscribedSymbol === selectedSymbol
                      ? <span style={{ fontSize: 12, color: 'var(--status-filled)' }}>● Subscribed</span>
                      : <Button label="Subscribe" outlined onClick={() => subscribeToSymbol(selectedVenueId, selectedSymbol)} />
                  ) : undefined
                }
              />

              {venue && (
                <>
                  <Splitter style={{ border: 'none', background: 'transparent', flex: 1 }}>
                    <SplitterPanel size={58} minSize={40} style={{ overflow: 'auto' }}>
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
                    <SplitterPanel size={42} minSize={30} style={{ overflow: 'auto' }}>
                      <PriceLadder
                        data={priceLevels?.symbol === selectedSymbol ? priceLevels : null}
                        onPriceClick={setPriceOverride}
                        fontSize={priceLadderFontSize}
                      />
                    </SplitterPanel>
                  </Splitter>
                </>
              )}
            </SplitterPanel>

            {/* Right: order blotter toolbar + blotter + events */}
            <SplitterPanel size={62} minSize={30} style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              <Toolbar
                start={
                  <FloatLabel>
                    <Dropdown
                      inputId="blotter-filter"
                      value={blotterFilter}
                      options={BLOTTER_FILTER_OPTIONS}
                      onChange={e => setBlotterFilter(e.value)}
                      style={{ minWidth: 130 }}
                    />
                    <label htmlFor="blotter-filter">Show</label>
                  </FloatLabel>
                }
                end={<Button label="Download CSV" icon="pi pi-download" outlined onClick={handleDownloadCsv} />}
              />
              <OrderBlotter
                orders={orders}
                onCancelRequest={handleCancelRequest}
                onRowSelected={setSelectedClOrdId}
                statusFilter={blotterFilter}
                isDark={theme === 'dark'}
              />
              <div style={{ marginTop: 8 }}>
                <OrderEventsPanel clOrdId={selectedClOrdId} isDark={theme === 'dark'} />
              </div>
            </SplitterPanel>

          </Splitter>
        )}
      </div>
    </div>
  );
}
