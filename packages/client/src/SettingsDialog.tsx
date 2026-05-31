import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { FloatLabel } from 'primereact/floatlabel';
import { InputNumber } from 'primereact/inputnumber';
import { InputSwitch } from 'primereact/inputswitch';
import { InputText } from 'primereact/inputtext';
import { MultiSelect } from 'primereact/multiselect';
import { TabPanel, TabView } from 'primereact/tabview';
import type { AccountConfig, SessionConfig, TraderIdConfig, Venue } from './types.js';

async function api(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return;
  return res.json();
}

function jsonPost(body: unknown) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function jsonPatch(body: unknown) {
  return { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

interface VenueForm {
  name: string;
  mdHost: string; mdPort: number | null; mdSenderCompId: string; mdTargetCompId: string;
  orHost: string; orPort: number | null; orSenderCompId: string; orTargetCompId: string;
  traderIdConfigId: string;
  accountConfigIds: string[];
}

const EMPTY_VENUE: VenueForm = {
  name: '', mdHost: '', mdPort: null, mdSenderCompId: '', mdTargetCompId: '',
  orHost: '', orPort: null, orSenderCompId: '', orTargetCompId: '',
  traderIdConfigId: '', accountConfigIds: [],
};

interface Props {
  visible: boolean;
  onHide: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
  priceLadderFontSize: number;
  onFontSizeChange: (n: number) => void;
  onDataChanged: () => void;
}

export function SettingsDialog({ visible, onHide, theme, onThemeChange, priceLadderFontSize, onFontSizeChange, onDataChanged }: Props) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sessionConfigs, setSessionConfigs] = useState<SessionConfig[]>([]);
  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [traderIdConfigs, setTraderIdConfigs] = useState<TraderIdConfig[]>([]);

  const [showVenueForm, setShowVenueForm] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [venueForm, setVenueForm] = useState<VenueForm>(EMPTY_VENUE);

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountConfig | null>(null);
  const [accountForm, setAccountForm] = useState({ account: '', displayAlias: '' });

  const [showTraderIdForm, setShowTraderIdForm] = useState(false);
  const [editingTraderId, setEditingTraderId] = useState<TraderIdConfig | null>(null);
  const [traderIdForm, setTraderIdForm] = useState({ traderId: '', displayAlias: '' });

  const refresh = useCallback(async () => {
    const [v, sc, ac, tc] = await Promise.all([
      api('/admin/venues'),
      api('/admin/session-configs'),
      api('/admin/account-configs'),
      api('/admin/trader-id-configs'),
    ]);
    setVenues(v);
    setSessionConfigs(sc);
    setAccountConfigs(ac);
    setTraderIdConfigs(tc);
  }, []);

  useEffect(() => {
    if (visible) refresh().catch(console.error);
  }, [visible, refresh]);

  // ─── Venue ────────────────────────────────────────────────────────────────

  function openAddVenue() {
    setEditingVenue(null);
    setVenueForm(EMPTY_VENUE);
    setShowVenueForm(true);
  }

  function openEditVenue(venue: Venue) {
    const mdSc = sessionConfigs.find(s => s.id === venue.mdSessionConfigId);
    const orSc = sessionConfigs.find(s => s.id === venue.orSessionConfigId);
    setEditingVenue(venue);
    setVenueForm({
      name: venue.name,
      mdHost: mdSc?.host ?? '', mdPort: mdSc?.port ?? null,
      mdSenderCompId: mdSc?.senderCompId ?? '', mdTargetCompId: mdSc?.targetCompId ?? '',
      orHost: orSc?.host ?? '', orPort: orSc?.port ?? null,
      orSenderCompId: orSc?.senderCompId ?? '', orTargetCompId: orSc?.targetCompId ?? '',
      traderIdConfigId: venue.traderIdConfigId,
      accountConfigIds: venue.accountConfigIds,
    });
    setShowVenueForm(true);
  }

  async function saveVenue() {
    const vf = venueForm;
    try {
      if (editingVenue) {
        await api(`/admin/session-configs/${editingVenue.mdSessionConfigId}`,
          jsonPatch({ name: `${vf.name} MD`, host: vf.mdHost, port: vf.mdPort, senderCompId: vf.mdSenderCompId, targetCompId: vf.mdTargetCompId }));
        await api(`/admin/session-configs/${editingVenue.orSessionConfigId}`,
          jsonPatch({ name: `${vf.name} OR`, host: vf.orHost, port: vf.orPort, senderCompId: vf.orSenderCompId, targetCompId: vf.orTargetCompId }));
        await api(`/admin/venues/${editingVenue.id}`,
          jsonPatch({ name: vf.name, traderIdConfigId: vf.traderIdConfigId, accountConfigIds: vf.accountConfigIds }));
      } else {
        const mdSc: SessionConfig = await api('/admin/session-configs',
          jsonPost({ name: `${vf.name} MD`, host: vf.mdHost, port: vf.mdPort, senderCompId: vf.mdSenderCompId, targetCompId: vf.mdTargetCompId }));
        const orSc: SessionConfig = await api('/admin/session-configs',
          jsonPost({ name: `${vf.name} OR`, host: vf.orHost, port: vf.orPort, senderCompId: vf.orSenderCompId, targetCompId: vf.orTargetCompId }));
        await api('/admin/venues',
          jsonPost({ name: vf.name, mdSessionConfigId: mdSc.id, orSessionConfigId: orSc.id, traderIdConfigId: vf.traderIdConfigId, accountConfigIds: vf.accountConfigIds }));
      }
      setShowVenueForm(false);
      await refresh();
      onDataChanged();
    } catch (e: any) { alert(e.message); }
  }

  async function deleteVenue(venue: Venue) {
    if (!confirm(`Delete venue "${venue.name}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/venues/${venue.id}`, { method: 'DELETE' });
      await api(`/admin/session-configs/${venue.mdSessionConfigId}`, { method: 'DELETE' });
      await api(`/admin/session-configs/${venue.orSessionConfigId}`, { method: 'DELETE' });
      await refresh();
      onDataChanged();
    } catch (e: any) { alert(e.message); }
  }

  // ─── Accounts ─────────────────────────────────────────────────────────────

  function openAddAccount() {
    setEditingAccount(null);
    setAccountForm({ account: '', displayAlias: '' });
    setShowAccountForm(true);
  }

  function openEditAccount(ac: AccountConfig) {
    setEditingAccount(ac);
    setAccountForm({ account: ac.account, displayAlias: ac.displayAlias ?? '' });
    setShowAccountForm(true);
  }

  async function saveAccount() {
    const body = { account: accountForm.account, ...(accountForm.displayAlias ? { displayAlias: accountForm.displayAlias } : {}) };
    try {
      if (editingAccount) {
        await api(`/admin/account-configs/${editingAccount.id}`, jsonPatch(body));
      } else {
        await api('/admin/account-configs', jsonPost(body));
      }
      setShowAccountForm(false);
      await refresh();
      onDataChanged();
    } catch (e: any) { alert(e.message); }
  }

  async function deleteAccount(ac: AccountConfig) {
    if (!confirm(`Delete account "${ac.account}"?`)) return;
    try {
      await api(`/admin/account-configs/${ac.id}`, { method: 'DELETE' });
      await refresh();
      onDataChanged();
    } catch (e: any) { alert(e.message); }
  }

  // ─── Trader IDs ───────────────────────────────────────────────────────────

  function openAddTraderId() {
    setEditingTraderId(null);
    setTraderIdForm({ traderId: '', displayAlias: '' });
    setShowTraderIdForm(true);
  }

  function openEditTraderId(tc: TraderIdConfig) {
    setEditingTraderId(tc);
    setTraderIdForm({ traderId: tc.traderId, displayAlias: tc.displayAlias ?? '' });
    setShowTraderIdForm(true);
  }

  async function saveTraderId() {
    const body = { traderId: traderIdForm.traderId, ...(traderIdForm.displayAlias ? { displayAlias: traderIdForm.displayAlias } : {}) };
    try {
      if (editingTraderId) {
        await api(`/admin/trader-id-configs/${editingTraderId.id}`, jsonPatch(body));
      } else {
        await api('/admin/trader-id-configs', jsonPost(body));
      }
      setShowTraderIdForm(false);
      await refresh();
      onDataChanged();
    } catch (e: any) { alert(e.message); }
  }

  async function deleteTraderId(tc: TraderIdConfig) {
    if (!confirm(`Delete trader ID "${tc.traderId}"?`)) return;
    try {
      await api(`/admin/trader-id-configs/${tc.id}`, { method: 'DELETE' });
      await refresh();
      onDataChanged();
    } catch (e: any) { alert(e.message); }
  }

  // ─── Shared styles ────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 };
  const tdStyle: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border-light)' };

  function ListTable({ headers, children, empty }: { headers: string[]; children: React.ReactNode; empty: boolean }) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => <th key={h} style={thStyle}>{h}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {empty
            ? <tr><td colSpan={headers.length + 1} style={{ padding: '16px 8px', color: 'var(--text-muted)', textAlign: 'center' }}>None configured</td></tr>
            : children}
        </tbody>
      </table>
    );
  }

  const vf = venueForm;
  const setVf = (patch: Partial<VenueForm>) => setVenueForm(prev => ({ ...prev, ...patch }));

  return (
    <>
      {/* ── Main settings dialog ── */}
      <Dialog visible={visible} onHide={onHide} header="Settings" style={{ width: '80vw', maxWidth: 920 }} maximizable>
        <TabView>

          {/* Venues */}
          <TabPanel header="Venues">
            <div style={{ marginBottom: 12 }}>
              <Button label="Add Venue" icon="pi pi-plus" outlined size="small" onClick={openAddVenue} />
            </div>
            <ListTable headers={['Name', 'MD Host:Port', 'OR Host:Port', 'Trader ID', 'Accounts']} empty={venues.length === 0}>
              {venues.map(v => {
                const mdSc = sessionConfigs.find(s => s.id === v.mdSessionConfigId);
                const orSc = sessionConfigs.find(s => s.id === v.orSessionConfigId);
                const trader = traderIdConfigs.find(t => t.id === v.traderIdConfigId);
                const accts = accountConfigs.filter(a => v.accountConfigIds.includes(a.id));
                return (
                  <tr key={v.id}>
                    <td style={tdStyle}>{v.name}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{mdSc ? `${mdSc.host}:${mdSc.port}` : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{orSc ? `${orSc.host}:${orSc.port}` : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{trader?.displayAlias ?? trader?.traderId ?? '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{accts.map(a => a.displayAlias ?? a.account).join(', ') || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button icon="pi pi-pencil" text size="small" onClick={() => openEditVenue(v)} style={{ marginRight: 4 }} />
                      <Button icon="pi pi-trash" text size="small" severity="danger" onClick={() => void deleteVenue(v)} />
                    </td>
                  </tr>
                );
              })}
            </ListTable>
          </TabPanel>

          {/* Accounts */}
          <TabPanel header="Accounts">
            <div style={{ marginBottom: 12 }}>
              <Button label="Add Account" icon="pi pi-plus" outlined size="small" onClick={openAddAccount} />
            </div>
            <ListTable headers={['Account', 'Display Alias']} empty={accountConfigs.length === 0}>
              {accountConfigs.map(ac => (
                <tr key={ac.id}>
                  <td style={tdStyle}>{ac.account}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{ac.displayAlias ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button icon="pi pi-pencil" text size="small" onClick={() => openEditAccount(ac)} style={{ marginRight: 4 }} />
                    <Button icon="pi pi-trash" text size="small" severity="danger" onClick={() => void deleteAccount(ac)} />
                  </td>
                </tr>
              ))}
            </ListTable>
          </TabPanel>

          {/* Trader IDs */}
          <TabPanel header="Trader IDs">
            <div style={{ marginBottom: 12 }}>
              <Button label="Add Trader ID" icon="pi pi-plus" outlined size="small" onClick={openAddTraderId} />
            </div>
            <ListTable headers={['Trader ID', 'Display Alias']} empty={traderIdConfigs.length === 0}>
              {traderIdConfigs.map(tc => (
                <tr key={tc.id}>
                  <td style={tdStyle}>{tc.traderId}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{tc.displayAlias ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button icon="pi pi-pencil" text size="small" onClick={() => openEditTraderId(tc)} style={{ marginRight: 4 }} />
                    <Button icon="pi pi-trash" text size="small" severity="danger" onClick={() => void deleteTraderId(tc)} />
                  </td>
                </tr>
              ))}
            </ListTable>
          </TabPanel>

          {/* Display */}
          <TabPanel header="Display">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 340, paddingTop: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Theme</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13 }}>Dark</span>
                  <InputSwitch checked={theme === 'light'} onChange={e => onThemeChange(e.value ? 'light' : 'dark')} />
                  <span style={{ fontSize: 13 }}>Light</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Price Ladder Font Size (px)</div>
                <InputNumber
                  value={priceLadderFontSize}
                  onValueChange={e => onFontSizeChange(e.value ?? 13)}
                  min={10} max={20}
                  showButtons
                  buttonLayout="horizontal"
                  decrementButtonIcon="pi pi-minus"
                  incrementButtonIcon="pi pi-plus"
                  style={{ width: 130 }}
                />
              </div>
            </div>
          </TabPanel>

        </TabView>
      </Dialog>

      {/* ── Venue form ── */}
      <Dialog
        visible={showVenueForm}
        onHide={() => setShowVenueForm(false)}
        header={editingVenue ? 'Edit Venue' : 'Add Venue'}
        style={{ width: 640 }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button label="Cancel" outlined onClick={() => setShowVenueForm(false)} />
            <Button label="Save" onClick={() => void saveVenue()} />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
          <FloatLabel>
            <InputText id="vname" value={vf.name} onChange={e => setVf({ name: e.target.value })} style={{ width: '100%' }} />
            <label htmlFor="vname">Venue Name</label>
          </FloatLabel>

          <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '16px' }}>
            <legend style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>MD Session</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr 1fr', gap: 16 }}>
              <FloatLabel>
                <InputText id="mdHost" value={vf.mdHost} onChange={e => setVf({ mdHost: e.target.value })} style={{ width: '100%' }} />
                <label htmlFor="mdHost">Host</label>
              </FloatLabel>
              <FloatLabel>
                <InputNumber id="mdPort" value={vf.mdPort} onValueChange={e => setVf({ mdPort: e.value ?? null })} useGrouping={false} style={{ width: '100%' }} />
                <label htmlFor="mdPort">Port</label>
              </FloatLabel>
              <FloatLabel>
                <InputText id="mdSender" value={vf.mdSenderCompId} onChange={e => setVf({ mdSenderCompId: e.target.value })} style={{ width: '100%' }} />
                <label htmlFor="mdSender">SenderCompID</label>
              </FloatLabel>
              <FloatLabel>
                <InputText id="mdTarget" value={vf.mdTargetCompId} onChange={e => setVf({ mdTargetCompId: e.target.value })} style={{ width: '100%' }} />
                <label htmlFor="mdTarget">TargetCompID</label>
              </FloatLabel>
            </div>
          </fieldset>

          <fieldset style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '16px' }}>
            <legend style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>OR Session</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr 1fr', gap: 16 }}>
              <FloatLabel>
                <InputText id="orHost" value={vf.orHost} onChange={e => setVf({ orHost: e.target.value })} style={{ width: '100%' }} />
                <label htmlFor="orHost">Host</label>
              </FloatLabel>
              <FloatLabel>
                <InputNumber id="orPort" value={vf.orPort} onValueChange={e => setVf({ orPort: e.value ?? null })} useGrouping={false} style={{ width: '100%' }} />
                <label htmlFor="orPort">Port</label>
              </FloatLabel>
              <FloatLabel>
                <InputText id="orSender" value={vf.orSenderCompId} onChange={e => setVf({ orSenderCompId: e.target.value })} style={{ width: '100%' }} />
                <label htmlFor="orSender">SenderCompID</label>
              </FloatLabel>
              <FloatLabel>
                <InputText id="orTarget" value={vf.orTargetCompId} onChange={e => setVf({ orTargetCompId: e.target.value })} style={{ width: '100%' }} />
                <label htmlFor="orTarget">TargetCompID</label>
              </FloatLabel>
            </div>
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FloatLabel>
              <Dropdown
                inputId="vTrader"
                value={vf.traderIdConfigId}
                options={traderIdConfigs.map(t => ({ label: t.displayAlias ?? t.traderId, value: t.id }))}
                onChange={e => setVf({ traderIdConfigId: e.value })}
                style={{ width: '100%' }}
              />
              <label htmlFor="vTrader">Trader ID</label>
            </FloatLabel>
            <FloatLabel>
              <MultiSelect
                inputId="vAccounts"
                value={vf.accountConfigIds}
                options={accountConfigs.map(a => ({ label: a.displayAlias ?? a.account, value: a.id }))}
                onChange={e => setVf({ accountConfigIds: e.value })}
                display="chip"
                style={{ width: '100%' }}
              />
              <label htmlFor="vAccounts">Accounts</label>
            </FloatLabel>
          </div>
        </div>
      </Dialog>

      {/* ── Account form ── */}
      <Dialog
        visible={showAccountForm}
        onHide={() => setShowAccountForm(false)}
        header={editingAccount ? 'Edit Account' : 'Add Account'}
        style={{ width: 400 }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button label="Cancel" outlined onClick={() => setShowAccountForm(false)} />
            <Button label="Save" onClick={() => void saveAccount()} />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
          <FloatLabel>
            <InputText id="acct" value={accountForm.account} onChange={e => setAccountForm(f => ({ ...f, account: e.target.value }))} style={{ width: '100%' }} />
            <label htmlFor="acct">Account</label>
          </FloatLabel>
          <FloatLabel>
            <InputText id="acctAlias" value={accountForm.displayAlias} onChange={e => setAccountForm(f => ({ ...f, displayAlias: e.target.value }))} style={{ width: '100%' }} />
            <label htmlFor="acctAlias">Display Alias (optional)</label>
          </FloatLabel>
        </div>
      </Dialog>

      {/* ── Trader ID form ── */}
      <Dialog
        visible={showTraderIdForm}
        onHide={() => setShowTraderIdForm(false)}
        header={editingTraderId ? 'Edit Trader ID' : 'Add Trader ID'}
        style={{ width: 400 }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button label="Cancel" outlined onClick={() => setShowTraderIdForm(false)} />
            <Button label="Save" onClick={() => void saveTraderId()} />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
          <FloatLabel>
            <InputText id="tid" value={traderIdForm.traderId} onChange={e => setTraderIdForm(f => ({ ...f, traderId: e.target.value }))} style={{ width: '100%' }} />
            <label htmlFor="tid">Trader ID</label>
          </FloatLabel>
          <FloatLabel>
            <InputText id="tidAlias" value={traderIdForm.displayAlias} onChange={e => setTraderIdForm(f => ({ ...f, displayAlias: e.target.value }))} style={{ width: '100%' }} />
            <label htmlFor="tidAlias">Display Alias (optional)</label>
          </FloatLabel>
        </div>
      </Dialog>
    </>
  );
}
