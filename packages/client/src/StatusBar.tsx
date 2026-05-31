import type { StatusAlertEvent } from './types.js';

interface Props {
  alerts: StatusAlertEvent[];
}

export function StatusBar({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div style={{ borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Status</span>
        <span>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ maxHeight: 120, overflowY: 'auto', padding: '4px 0' }}>
        {[...alerts].reverse().map((alert, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 12,
              padding: '3px 10px',
              fontSize: 12,
              color: alert.kind === 'disconnect' ? 'var(--status-rejected)' : 'var(--status-partial)',
            }}
          >
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
              {new Date(alert.ts).toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span>{alert.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
