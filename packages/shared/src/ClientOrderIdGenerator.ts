export class ClientOrderIdGenerator {
  private readonly prefix: string;
  private counter = 0;

  constructor(startupTime: Date) {
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const y = startupTime.getUTCFullYear();
    const mo = pad(startupTime.getUTCMonth() + 1);
    const d = pad(startupTime.getUTCDate());
    const h = pad(startupTime.getUTCHours());
    const mi = pad(startupTime.getUTCMinutes());
    const s = pad(startupTime.getUTCSeconds());
    this.prefix = `${y}${mo}${d}-${h}${mi}${s}`;
  }

  next(): string {
    return `${this.prefix}-${++this.counter}`;
  }
}
