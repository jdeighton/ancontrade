import { useState } from 'react';
import type { AccountConfig } from './types.js';

interface Props {
  venueId: string;
  symbol: string;
  accounts: AccountConfig[];
  traderId: string;
  tickSize?: number;
  onSubmitted: () => void;
}

function isValidTick(price: number, tickSize: number): boolean {
  const ratio = price / tickSize;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

export function OrderTicket({ venueId, symbol, accounts, traderId, tickSize = 0.0001, onSubmitted }: Props) {
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [account, setAccount] = useState(accounts[0]?.account ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const priceNum = parseFloat(price);
  const qtyNum = parseFloat(quantity);
  const priceValid = !isNaN(priceNum) && priceNum > 0 && isValidTick(priceNum, tickSize);
  const qtyValid = !isNaN(qtyNum) && qtyNum > 0;
  const canSubmit = priceValid && qtyValid && account && !submitting;

  async function submit(side: 'buy' | 'sell') {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, symbol, side, price: priceNum, quantity: qtyNum, account, traderId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Server error ${res.status}`);
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
    <div style={{ padding: 12, border: '1px solid var(--border-light)', borderRadius: 4, width: 300 }}>
      <h3 style={{ margin: '0 0 8px' }}>Order Ticket</h3>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Instrument
        <input value={symbol} readOnly style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} />
      </label>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Order Type
        <input value="Limit" readOnly style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} />
      </label>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Price
        <input
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          step={tickSize}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', borderColor: price && !priceValid ? 'var(--error)' : undefined }}
          placeholder={`tick size: ${tickSize}`}
        />
        {price && !priceValid && (
          <span style={{ color: 'var(--error)', fontSize: 11 }}>Must be a multiple of {tickSize}</span>
        )}
      </label>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Quantity
        <input
          type="number"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 6 }}>
        Account
        <select
          value={account}
          onChange={e => setAccount(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
        >
          {accounts.map(ac => (
            <option key={ac.id} value={ac.account}>{ac.displayAlias ?? ac.account}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 10 }}>
        Trader ID
        <input value={traderId} readOnly style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} />
      </label>

      {error && <div style={{ color: 'var(--error)', marginBottom: 8, fontSize: 12 }}>{error}</div>}

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
