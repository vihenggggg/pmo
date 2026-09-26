// Shared pipeline for paste-from-Excel and file import:
//   raw cell grid → column mapping → cleaned rows + warnings → /api/orders/bulk payload.
import {
  FIELD_BY_KEY,
  ORDER_FIELDS,
  PASTE_COLUMNS,
  normalizeOrder,
  type CleanOrder,
  type OrderFieldKey,
  type OrderInput,
} from '../../shared/schema';

export type Cell = string | number | boolean | Date | null;
export type Grid = Cell[][];
export type Mapping = (OrderFieldKey | null)[];

export interface Sheet {
  name: string;
  rows: Grid;
}

/**
 * Parses clipboard text copied from Excel/Sheets (tab-separated). Handles quoted cells,
 * which Excel emits for values containing tabs, newlines or quotes.
 */
export function parseTsv(text: string): Grid {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let atCellStart = true;
  const src = text.replace(/\r\n?/g, '\n');
  while (i < src.length) {
    const ch = src[i];
    if (atCellStart && ch === '"') {
      // Quoted cell: read until the closing quote ("" is an escaped quote).
      i++;
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else if (src[i] === '"') {
          i++;
          break;
        } else cell += src[i++];
      }
      atCellStart = false;
      continue;
    }
    atCellStart = false;
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      atCellStart = true;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
    } else cell += ch;
    i++;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return dropEmptyRows(rows);
}

export function dropEmptyRows(grid: Grid): Grid {
  return grid.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
}

export async function readFile(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const { default: Papa } = await import('papaparse');
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { header: false, skipEmptyLines: 'greedy' });
    return [{ name: file.name, rows: dropEmptyRows(parsed.data) }];
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
    const XLSX = await import('xlsx');
    // Dates come through as Excel serial numbers (raw: true) and are converted by parseDate.
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return wb.SheetNames.map((sheetName) => ({
      name: sheetName,
      rows: dropEmptyRows(
        XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false }),
      ),
    })).filter((s) => s.rows.length > 0);
  }
  throw new Error('Unsupported file type. Choose a .xlsx, .xls or .csv file.');
}

const normHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ') // "Contract Value (USD)" → "contract value"
    .replace(/#/g, ' no ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(usd|amt|amount)\b/g, (w) => (w === 'usd' ? '' : 'amount'))
    .trim()
    .replace(/\s+/g, ' ');

const CANDIDATES: { key: OrderFieldKey; names: string[] }[] = ORDER_FIELDS.map((f) => ({
  key: f.key,
  names: [...new Set([f.label, f.key.replace(/_/g, ' '), ...(f.aliases ?? [])].map(normHeader))],
}));

/** Scores how well a header names a field: 3 = exact, 2 = header contains the name, 1 = name contains header. */
function score(header: string, names: string[]): number {
  if (!header) return 0;
  let best = 0;
  for (const n of names) {
    if (header === n) return 3;
    if (n.length >= 3 && ` ${header} `.includes(` ${n} `)) best = Math.max(best, 2);
    else if (header.length >= 3 && ` ${n} `.includes(` ${header} `)) best = Math.max(best, 1);
  }
  return best;
}

/** Best-guess header → field mapping; each field is used at most once, strongest matches first. */
export function autoMap(headers: Cell[]): Mapping {
  const normalized = headers.map((h) => normHeader(h == null ? '' : String(h)));
  const pairs: { col: number; key: OrderFieldKey; s: number }[] = [];
  normalized.forEach((h, col) => {
    for (const c of CANDIDATES) {
      const s = score(h, c.names);
      if (s > 0) pairs.push({ col, key: c.key, s });
    }
  });
  pairs.sort((a, b) => b.s - a.s || a.col - b.col);
  const mapping: Mapping = headers.map(() => null);
  const used = new Set<OrderFieldKey>();
  for (const p of pairs) {
    if (mapping[p.col] || used.has(p.key)) continue;
    mapping[p.col] = p.key;
    used.add(p.key);
  }
  return mapping;
}

/** Picks the header row among the first few rows (skips title rows above the real header). */
export function detectHeaderRow(grid: Grid, maxScan = 10): { index: number; matches: number } {
  let best = { index: -1, matches: 0 };
  grid.slice(0, maxScan).forEach((row, index) => {
    const matches = autoMap(row).filter(Boolean).length;
    if (matches > best.matches) best = { index, matches };
  });
  return best.matches >= 2 ? best : { index: -1, matches: 0 };
}

/** Positional mapping used for header-less pastes (original Excel column order). */
export function positionalMapping(width: number): Mapping {
  return Array.from({ length: width }, (_, i) => PASTE_COLUMNS[i] ?? null);
}

export interface PreparedRow {
  /** 0-based index into the data rows (excluding the header). */
  index: number;
  raw: Cell[];
  clean: CleanOrder;
  errors: Partial<Record<OrderFieldKey, string>>;
  warnings: string[];
}

export function prepareRows(dataRows: Grid, mapping: Mapping): PreparedRow[] {
  const mappedKeys = mapping.filter((k): k is OrderFieldKey => !!k);
  const seen = new Map<string, number>();
  return dataRows.map((raw, index) => {
    const input: Record<string, unknown> = {};
    mapping.forEach((key, col) => {
      if (key) input[key] = raw[col] instanceof Date ? raw[col] : (raw[col] ?? null);
    });
    const { value, errors } = normalizeOrder(input);
    const warnings: string[] = [];
    if (!mappedKeys.includes('customer')) errors.customer ??= 'No column is mapped to Customer';
    if (!mappedKeys.includes('so_number')) errors.so_number ??= 'No column is mapped to SO#';
    if (value.so_number) {
      const prev = seen.get(value.so_number);
      if (prev !== undefined) errors.so_number = `Duplicate of row ${prev + 1} in this import`;
      else seen.set(value.so_number, index);
    }
    if ((value.invoiced_amt ?? 0) > (value.contract_value ?? 0) && (value.contract_value ?? 0) > 0) {
      warnings.push('Invoiced is more than contract value');
    }
    if (value.type === 'normal' && (value.service_type || value.pic || value.site_location)) {
      warnings.push('Has project fields but Type is Normal');
    }
    return { index, raw, clean: value, errors, warnings };
  });
}

/** Payload row for /api/orders/bulk: only mapped columns, so "update existing" never blanks unmapped ones. */
export function toPayload(row: PreparedRow, mapping: Mapping): OrderInput {
  const out: OrderInput = {};
  for (const key of mapping) {
    if (key) out[key] = row.clean[key] as OrderInput[OrderFieldKey];
  }
  return out;
}

export function displayClean(key: OrderFieldKey, value: unknown): string {
  if (value === null || value === undefined) return '';
  const kind = FIELD_BY_KEY[key].kind;
  if (kind === 'bool') return value ? 'Yes' : '';
  if (kind === 'type') return value === 'project' ? 'Project' : 'Normal';
  if (kind === 'money') return (value as number).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(value);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
