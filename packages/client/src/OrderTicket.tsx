import { useEffect, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { FloatLabel } from 'primereact/floatlabel';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import type { AccountConfig } from './types.js';

interface Props {
  venueId: string;
  symbol: string;
  accounts: AccountConfig[];
  traderId: string;
  tickSize?: number;
  priceOverride?: number | null;
  onSubmitted: () => void;
}

function isValidTick(price: number, tickSize: number): boolean {
  const ratio = price / tickSize;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

const ORDER_TYPE_OPTIONS = [
  { label: 'Limit', value: 'limit' },
  { label: 'Market', value: 'market' },
];

export function OrderTicket({ venueId, symbol, accounts, traderId, tickSize = 0.0001, priceOverride, onSubmitted }: Props) {
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [account, setAccount] = useState(accounts[0]?.account ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (priceOverride != null) {
      setPrice(priceOverride);
      setOrderType('limit');
    }
  }, [priceOverride]);

  const isMarket = orderType === 'market';
  const priceValid = isMarket || (price !== null && price > 0 && isValidTick(price, tickSize));
  const qtyValid = quantity !== null && quantity > 0;
  const canSubmit = priceValid && qtyValid && account && !submitting;

  const accountOptions = accounts.map(ac => ({ label: ac.displayAlias ?? ac.account, value: ac.account }));

  async function submit(side: 'buy' | 'sell') {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { venueId, symbol, side, orderType, quantity, account, traderId };
      if (!isMarket && price !== null) body.price = price;
      const res = await fetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as any).error ?? `Server error ${res.status}`);
      } else {
        onSubmitted();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0 }}>Order Ticket</h3>

      <div className="p-inputgroup">
        <span className="p-inputgroup-addon">Symbol</span>
        <InputText value={symbol} readOnly />
      </div>

      <FloatLabel>
        <Dropdown
          inputId="orderType"
          value={orderType}
          options={ORDER_TYPE_OPTIONS}
          onChange={e => setOrderType(e.value)}
          style={{ width: '100%' }}
        />
        <label htmlFor="orderType">Order Type</label>
      </FloatLabel>

      <div>
        <div className="p-inputgroup">
          <span className="p-inputgroup-addon">Price</span>
          <InputNumber
            value={price}
            onValueChange={e => setPrice(e.value ?? null)}
            step={tickSize}
            minFractionDigits={0}
            maxFractionDigits={10}
            useGrouping={false}
            disabled={isMarket}
            invalid={!isMarket && price !== null && !priceValid}
            placeholder={isMarket ? 'Market order' : `tick: ${tickSize}`}
            style={{ flex: 1, opacity: isMarket ? 0.4 : 1 }}
          />
        </div>
        {!isMarket && price !== null && !priceValid && (
          <span style={{ color: 'var(--error)', fontSize: 11 }}>Must be a multiple of {tickSize}</span>
        )}
      </div>

      <div className="p-inputgroup">
        <span className="p-inputgroup-addon">Qty</span>
        <InputNumber
          value={quantity}
          onValueChange={e => setQuantity(e.value ?? null)}
          min={0}
          useGrouping={false}
          style={{ flex: 1 }}
        />
      </div>

      <FloatLabel>
        <Dropdown
          inputId="account"
          value={account}
          options={accountOptions}
          onChange={e => setAccount(e.value)}
          style={{ width: '100%' }}
        />
        <label htmlFor="account">Account</label>
      </FloatLabel>

      <div className="p-inputgroup">
        <span className="p-inputgroup-addon">Trader ID</span>
        <InputText value={traderId} readOnly />
      </div>

      {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => submit('buy')}
          disabled={!canSubmit}
          style={{ flex: 1, padding: '8px 0', background: 'var(--buy)', color: 'white', border: 'none', borderRadius: 3, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}
        >
          BUY
        </button>
        <button
          onClick={() => submit('sell')}
          disabled={!canSubmit}
          style={{ flex: 1, padding: '8px 0', background: 'var(--sell)', color: 'white', border: 'none', borderRadius: 3, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5 }}
        >
          SELL
        </button>
      </div>
    </div>
  );
}
