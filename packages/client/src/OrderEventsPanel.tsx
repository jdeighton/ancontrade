import { useState } from 'react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import type { FIXLogEntry } from './types.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const MSG_TYPE_LABELS: Record<string, string> = {
  D: 'New Order',
  F: 'Cancel Request',
  G: 'Order Replace Request',
  '8': 'Execution Report',
  '9': 'Order Cancel Reject',
};

const ORD_STATUS_LABELS: Record<string, string> = {
  '0': 'New',
  '1': 'Partial Fill',
  '2': 'Filled',
  '4': 'Cancelled',
  '8': 'Rejected',
};

function eventLabel(entry: FIXLogEntry): string {
  const msgType = entry.fields['35'] ?? '';
  if (msgType === '8') {
    const status = entry.fields['39'];
    return status !== undefined
      ? `Execution Report – ${ORD_STATUS_LABELS[status] ?? status}`
      : 'Execution Report';
  }
  return MSG_TYPE_LABELS[msgType] ?? `MsgType ${msgType}`;
}

interface Props {
  clOrdId: string | null;
}

export function OrderEventsPanel({ clOrdId }: Props) {
  const [entries, setEntries] = useState<FIXLogEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<FIXLogEntry | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (clOrdId && clOrdId !== loadedFor) {
    setLoadedFor(clOrdId);
    setSelectedEntry(null);
    fetch(`/orders/${clOrdId}/events`)
      .then(r => r.json())
      .then((data: FIXLogEntry[]) => setEntries(data))
      .catch(console.error);
  }

  if (!clOrdId) {
    if (loadedFor !== null) {
      setEntries([]);
      setLoadedFor(null);
      setSelectedEntry(null);
    }
    return (
      <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        Select an order row to view FIX message events.
      </div>
    );
  }

  const columnDefs: ColDef<FIXLogEntry>[] = [
    {
      valueGetter: (p: any) => new Date(p.data.ts).toLocaleTimeString(undefined, { hour12: false }),
      headerName: 'Time', width: 110,
    },
    {
      valueGetter: (p: any) => p.data.dir === 'OUT' ? 'Sent' : 'Received',
      headerName: 'Dir', width: 90,
      cellStyle: (p: any) => ({
        color: p.value === 'Sent' ? 'var(--buy)' : 'var(--status-partial)',
      }),
    },
    {
      valueGetter: (p: any) => eventLabel(p.data),
      headerName: 'Event', flex: 2,
    },
    {
      valueGetter: (p: any) => p.data.fields['37'] ?? '',
      headerName: 'Exch OrdID', flex: 1,
    },
  ];

  return (
    <div>
      <h3 style={{ margin: '0 0 4px' }}>Order Events — {clOrdId}</h3>
      <AgGridReact
        theme={themeQuartz}
        rowData={entries}
        columnDefs={columnDefs}
        domLayout="autoHeight"
        rowSelection="single"
        onRowSelected={(e) => {
          if (e.node.isSelected()) setSelectedEntry(e.data ?? null);
        }}
      />
      {selectedEntry && (
        <div style={{ marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', background: 'var(--surface)', maxHeight: 200, overflowY: 'auto' }}>
          <strong style={{ fontFamily: 'sans-serif', fontSize: 11, color: 'var(--text-muted)' }}>Raw FIX fields</strong>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 4 }}>
            <tbody>
              {Object.entries(selectedEntry.fields).map(([tag, value]) => (
                <tr key={tag}>
                  <td style={{ color: 'var(--text-muted)', paddingRight: 12, whiteSpace: 'nowrap' }}>{tag}</td>
                  <td style={{ wordBreak: 'break-all' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
