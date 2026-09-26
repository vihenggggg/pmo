import { ORDER_FIELDS, type SalesOrder } from '../../shared/schema';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ordersToCsv(orders: SalesOrder[]): string {
  const fields = ORDER_FIELDS.filter((f) => f.key !== 'is_issue' && f.key !== 'issue_note');
  const header = [...fields.map((f) => f.label), 'Remaining Balance', 'Issue?', 'Issue Note'];
  const lines = orders.map((o) =>
    [
      ...fields.map((f) => (f.key === 'type' ? (o.type === 'project' ? 'Project' : 'Normal') : o[f.key])),
      o.remaining_balance,
      o.is_issue ? 'Yes' : '',
      o.issue_note,
    ]
      .map(esc)
      .join(','),
  );
  return [header.map(esc).join(','), ...lines].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
