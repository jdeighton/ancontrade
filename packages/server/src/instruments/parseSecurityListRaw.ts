export interface Instrument {
  symbol: string;
  tickSize: number;
  contractSize?: number;
  currency?: string;
  expiry?: string;
}

const SOH = '\x01';

export function parseSecurityListRaw(raw: string): Instrument[] {
  const instruments: Instrument[] = [];
  let current: Partial<Instrument> | null = null;

  for (const field of raw.split(SOH)) {
    const eq = field.indexOf('=');
    if (eq === -1) continue;
    const tag = Number(field.slice(0, eq));
    const value = field.slice(eq + 1);

    if (tag === 55) {
      if (current?.symbol !== undefined) instruments.push(current as Instrument);
      current = { symbol: value };
    } else if (current) {
      if (tag === 969) current.tickSize = Number(value);
      else if (tag === 231) current.contractSize = Number(value);
      else if (tag === 15)  current.currency = value;
      else if (tag === 541) current.expiry = value;
    }
  }

  if (current?.symbol !== undefined) instruments.push(current as Instrument);
  return instruments;
}
