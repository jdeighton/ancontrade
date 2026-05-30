import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import type { OrderRecord } from './types.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const columnDefs: ColDef<OrderRecord>[] = [
  { field: 'clOrdId',   headerName: 'ClOrdID',      flex: 2 },
  { field: 'symbol',    headerName: 'Symbol',        flex: 1 },
  { field: 'side',      headerName: 'Side',          flex: 1 },
  { field: 'price',     headerName: 'Price',         flex: 1 },
  { field: 'quantity',  headerName: 'Qty',           flex: 1 },
  { field: 'status',    headerName: 'Status',        flex: 1,
    cellStyle: (p: any) => {
      const colors: Record<string, string> = {
        PendingNew: '#888', New: '#fff', PartiallyFilled: '#f0a500',
        Filled: '#1a7f1a', Cancelled: '#888', Rejected: '#c0392b',
      };
      return { color: colors[p.value] };
    },
  },
  { field: 'filledQty',                                          headerName: 'Filled',     flex: 1 },
  { valueGetter: (p: any) => p.data.avgFillPrice,               headerName: 'Avg Px',     flex: 1 },
  { valueGetter: (p: any) => p.data.exchOrdId ?? '',            headerName: 'Exch OrdID', flex: 2 },
];

interface Props {
  orders: OrderRecord[];
}

export function OrderBlotter({ orders }: Props) {
  return (
    <div style={{ flex: 1, minHeight: 300 }}>
      <h3 style={{ margin: '0 0 4px' }}>Order Blotter</h3>
      <AgGridReact
        theme={themeQuartz}
        rowData={orders}
        columnDefs={columnDefs}
        domLayout="autoHeight"
        getRowId={p => p.data.clOrdId}
      />
    </div>
  );
}
