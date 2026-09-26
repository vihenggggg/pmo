const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const moneyCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const fmtMoney = (n: number | null | undefined) => money.format(n ?? 0);
export const fmtMoneyCompact = (n: number) => (Math.abs(n) >= 100000 ? moneyCompact.format(n) : money.format(n));
export const fmtPct = (n: number) => `${n.toFixed(n > 0 && n < 10 ? 1 : 0)}%`;

/** YYYY-MM-DD → DD-Mon-YYYY (the tracker's Excel format). */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y}`;
}

export function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function daysUntil(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  const target = Date.UTC(y, m - 1, day);
  const t = new Date();
  return Math.round((target - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
}
