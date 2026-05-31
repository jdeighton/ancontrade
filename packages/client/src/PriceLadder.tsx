import { useState } from 'react';
import type { PriceLevel, PriceLevelsEvent } from './types.js';

interface Props {
  data: PriceLevelsEvent | null;
  onDepthChange?: (depth: number) => void;
}

const DEPTH_MIN = 1;
const DEPTH_MAX = 20;
const DEPTH_DEFAULT = 5;

function LevelRow({ level, side }: { level: PriceLevel; side: 'bid' | 'ask' }) {
  const hasVolume = level.volume > 0;
  const color = side === 'bid' ? 'var(--buy)' : 'var(--sell)';
  return (
    <tr>
      <td style={{ textAlign: 'right', paddingRight: 8, color: hasVolume ? color : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {level.price.toFixed(5)}
      </td>
      <td style={{ textAlign: 'right', paddingRight: 8, color: hasVolume ? 'var(--text)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {hasVolume ? level.volume.toLocaleString() : '–'}
      </td>
      <td style={{ textAlign: 'right', color: hasVolume ? 'var(--text-muted)' : 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
        {hasVolume ? level.count : ''}
      </td>
    </tr>
  );
}

export function PriceLadder({ data, onDepthChange }: Props) {
  const [depth, setDepth] = useState(DEPTH_DEFAULT);

  function handleDepthChange(n: number) {
    const clamped = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, n));
    setDepth(clamped);
    onDepthChange?.(clamped);
  }

  const bids = data?.bids.slice(0, depth) ?? [];
  const asks = data?.asks.slice(0, depth) ?? [];

  const bestBid = bids.find(l => l.volume > 0)?.price;
  const bestAsk = asks.find(l => l.volume > 0)?.price;
  const spread = bestBid !== undefined && bestAsk !== undefined
    ? (bestAsk - bestBid).toFixed(5)
    : null;

  const thStyle: React.CSSProperties = { textAlign: 'right', paddingRight: 8, color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, paddingBottom: 4 };

  return (
    <div style={{ minWidth: 220, border: '1px solid var(--border-light)', borderRadius: 4, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Price Ladder</h3>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Depth
          <input
            type="number"
            min={DEPTH_MIN}
            max={DEPTH_MAX}
            value={depth}
            onChange={e => handleDepthChange(Number(e.target.value))}
            style={{ width: 44, fontSize: 12 }}
          />
        </label>
      </div>

      {!data ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No market data — subscribe to an instrument.</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Volume</th>
              <th style={{ ...thStyle, fontSize: 10 }}>Cnt</th>
            </tr>
          </thead>
          <tbody>
            {/* asks in reverse (highest first visually → top of book at bottom) */}
            {[...asks].reverse().map((level, i) => (
              <LevelRow key={`ask-${i}`} level={level} side="ask" />
            ))}
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', padding: '3px 0', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                {spread !== null ? `Spread: ${spread}` : '—'}
              </td>
            </tr>
            {bids.map((level, i) => (
              <LevelRow key={`bid-${i}`} level={level} side="bid" />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
