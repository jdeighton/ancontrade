import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import type { OrderRecord } from './types.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const CANCELLABLE = new Set(['New', 'PartiallyFilled']);

const ORD_REJ_REASONS: Record<number, string> = {
  0: 'Other', 1: 'Unknown symbol', 2: 'Exchange closed',
  3: 'Order exceeds limit', 4: 'Too late to enter', 5: 'Unknown order',
  6: 'Duplicate order', 8: 'Invalid investor ID', 13: 'Trading halt', 99: 'Other',
};

const ROW_BG: Record<string, string> = {
  PendingNew:      'var(--status-pending-bg)',
  PartiallyFilled: 'var(--status-partial-bg)',
  Filled:          'var(--status-filled-bg)',
  Cancelled:       'var(--status-cancelled-bg)',
  Rejected:        'var(--status-rejected-bg)',
};

interface Props {
  orders: OrderRecord[];
  onCancelRequest: (clOrdId: string) => void;
  onRowSelected?: (clOrdId: string | null) => void;
  onResetHistory?: () => void;
}

export function OrderBlotter({ orders, onCancelRequest, onRowSelected, onResetHistory }: Props) {
  const columnDefs: ColDef<OrderRecord>[] = [
    { field: 'clOrdId',   headerName: 'ClOrdID',      flex: 2 },
    { field: 'symbol',    headerName: 'Symbol',        flex: 1 },
    {
      field: 'side', headerName: 'Side', flex: 1,
      cellStyle: (p: any) => ({
        color: p.value === 'buy' ? 'var(--buy)' : 'var(--sell)',
        fontWeight: 600,
      }),
    },
    { valueGetter: (p: any) => p.data.orderType === 'market' ? 'MKT' : p.data.price, headerName: 'Price', flex: 1 },
    { field: 'quantity',  headerName: 'Qty',           flex: 1 },
    {
      field: 'status', headerName: 'Status', flex: 1,
      cellStyle: (p: any) => {
        const colors: Record<string, string> = {
          PendingNew:      'var(--status-cancelled)',
          New:             'var(--status-new)',
          PartiallyFilled: 'var(--status-partial)',
          Filled:          'var(--status-filled)',
          Cancelled:       'var(--status-cancelled)',
          Rejected:        'var(--status-rejected)',
        };
        return { color: colors[p.value] };
      },
    },
    { field: 'filledQty',                                       headerName: 'Filled',     flex: 1 },
    { valueGetter: (p: any) => p.data.avgFillPrice,            headerName: 'Avg Px',     flex: 1 },
    { valueGetter: (p: any) => p.data.exchOrdId ?? '',         headerName: 'Exch OrdID', flex: 2 },
    {
      valueGetter: (p: any) => {
        const o: OrderRecord = p.data;
        if (o.status !== 'Rejected') return '';
        const label = o.ordRejReason !== undefined ? (ORD_REJ_REASONS[o.ordRejReason] ?? `Code ${o.ordRejReason}`) : '';
        return o.rejText ? `${label}: ${o.rejText}` : label;
      },
      headerName: 'Rej Reason', flex: 2,
      cellStyle: () => ({ color: 'var(--status-rejected)', fontSize: 11 }),
    },
    {
      headerName: '', minWidth: 100, sortable: false, filter: false,
      cellRenderer: (p: any) => {
        const canCancel = CANCELLABLE.has(p.data.status);
        return (
          <button
            disabled={!canCancel}
            style={{ fontSize: 11, padding: '2px 6px', cursor: canCancel ? 'pointer' : 'default', opacity: canCancel ? 1 : 0.4 }}
            onClick={() => onCancelRequest(p.data.clOrdId)}
          >
            Cancel
          </button>
        );
      },
    },
  ];

  return (
    <div style={{ flex: 1, minHeight: 300 }}>
      {onResetHistory && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button onClick={onResetHistory} style={{ fontSize: 12, color: 'var(--error)' }}>
            Reset History
          </button>
        </div>
      )}
      <AgGridReact
        theme={themeQuartz}
        rowData={orders}
        columnDefs={columnDefs}
        domLayout="autoHeight"
        getRowId={p => p.data.clOrdId}
        rowSelection="single"
        getRowStyle={(p: any) => {
          const bg = ROW_BG[p.data?.status];
          return bg ? { background: bg } : undefined;
        }}
        onRowSelected={(e) => {
          // Only fire on selection (not on deselect) so the events panel stays visible
          if (onRowSelected && e.node.isSelected()) {
            onRowSelected(e.data?.clOrdId ?? null);
          }
        }}
      />
    </div>
  );
}
