// Field definitions, parsing and validation shared by the SPA and the Pages Functions,
// so pasted/imported rows are cleaned the same way on both sides.

export const SO_TYPES = ['normal', 'project'] as const;
export type SoType = (typeof SO_TYPES)[number];

export const SO_STATUSES = ['Pending', 'In Progress', 'Delivered', 'On Hold', 'Closed', 'Cancelled'] as const;
export type SoStatus = (typeof SO_STATUSES)[number];

export type FieldKind = 'text' | 'date' | 'money' | 'status' | 'type' | 'bool';

export interface SalesOrder {
  id: number;
  so_number: string;
  type: SoType;
  customer: string;
  product_service: string | null;
  lead_time: string | null;
  so_date: string | null;
  start_date: string | null;
  deadline: string | null;
  contract_value: number;
  invoiced_amt: number;
  remaining_balance: number;
  invoice_plan: string | null;
  status: SoStatus;
  last_update: string | null;
  customer_feedback: string | null;
  internal_notes: string | null;
  budget_code: string | null;
  service_type: string | null;
  pic: string | null;
  site_location: string | null;
  is_issue: boolean;
  issue_note: string | null;
  issue_flagged_at: string | null;
  created_at: string;
  updated_at: string;
  milestone_count?: number;
  milestones_done?: number;
}

export interface Milestone {
  id: number;
  so_id: number;
  name: string;
  due_date: string | null;
  done: boolean;
  sort_order: number;
}

export type OrderFieldKey =
  | 'customer' | 'so_number' | 'lead_time' | 'so_date' | 'start_date' | 'deadline'
  | 'product_service' | 'contract_value' | 'invoiced_amt' | 'invoice_plan' | 'status'
  | 'last_update' | 'customer_feedback' | 'internal_notes' | 'budget_code' | 'type'
  | 'service_type' | 'pic' | 'site_location' | 'is_issue' | 'issue_note';

export interface FieldDef {
  key: OrderFieldKey;
  label: string;
  kind: FieldKind;
  projectOnly?: boolean;
  /** Extra header spellings recognised by the file-import column matcher. */
  aliases?: string[];
}

export const ORDER_FIELDS: FieldDef[] = [
  { key: 'customer', label: 'Customer', kind: 'text', aliases: ['client', 'customer name', 'client name'] },
  { key: 'so_number', label: 'SO#', kind: 'text', aliases: ['so', 'so no', 'so number', 'sales order', 'sales order no', 'order no', 'order number'] },
  { key: 'lead_time', label: 'Lead Time', kind: 'text', aliases: ['lead'] },
  { key: 'so_date', label: 'SO Date', kind: 'date', aliases: ['order date', 'date'] },
  { key: 'start_date', label: 'Start Date', kind: 'date', aliases: ['start', 'kick off', 'kickoff'] },
  { key: 'deadline', label: 'Deadline', kind: 'date', aliases: ['due date', 'due', 'end date', 'delivery date'] },
  { key: 'product_service', label: 'Product/Service', kind: 'text', aliases: ['product', 'service', 'description', 'item', 'scope'] },
  { key: 'contract_value', label: 'Contract Value', kind: 'money', aliases: ['contract', 'value', 'amount', 'contract amount', 'total'] },
  { key: 'invoiced_amt', label: 'Invoiced Amt', kind: 'money', aliases: ['invoiced', 'invoiced amount', 'billed', 'collected'] },
  { key: 'invoice_plan', label: 'Invoice Plan', kind: 'text', aliases: ['payment plan', 'billing plan', 'payment terms'] },
  { key: 'status', label: 'Status', kind: 'status', aliases: ['so status', 'order status'] },
  { key: 'last_update', label: 'Last Update', kind: 'date', aliases: ['updated', 'last updated', 'update date'] },
  { key: 'customer_feedback', label: 'Customer Feedback', kind: 'text', aliases: ['feedback'] },
  { key: 'internal_notes', label: 'Internal Notes', kind: 'text', aliases: ['notes', 'remarks', 'remark', 'comment', 'comments'] },
  { key: 'budget_code', label: 'Budget Code', kind: 'text', aliases: ['budget', 'cost code', 'cost center'] },
  { key: 'type', label: 'Type', kind: 'type', aliases: ['so type', 'order type'] },
  { key: 'service_type', label: 'Service Type', kind: 'text', projectOnly: true, aliases: ['service category'] },
  { key: 'pic', label: 'PIC', kind: 'text', projectOnly: true, aliases: ['person in charge', 'site contact', 'contact'] },
  { key: 'site_location', label: 'Site Location', kind: 'text', projectOnly: true, aliases: ['site', 'location'] },
  { key: 'is_issue', label: 'Issue?', kind: 'bool', aliases: ['issue', 'flag', 'flagged', 'has issue'] },
  { key: 'issue_note', label: 'Issue Note', kind: 'text', aliases: ['issue description', 'issue notes'] },
];

export const FIELD_BY_KEY = Object.fromEntries(ORDER_FIELDS.map((f) => [f.key, f])) as Record<OrderFieldKey, FieldDef>;

/** Positional column order for paste-from-Excel (matches the original tracker layout). */
export const PASTE_COLUMNS: OrderFieldKey[] = [
  'customer', 'so_number', 'lead_time', 'so_date', 'start_date', 'deadline', 'product_service',
  'contract_value', 'invoiced_amt', 'invoice_plan', 'status', 'last_update', 'customer_feedback',
  'internal_notes', 'budget_code', 'type', 'service_type', 'pic', 'site_location',
];

export type OrderInput = Partial<Record<OrderFieldKey, string | number | boolean | null>>;

/** Clean values as written to the database. */
export type CleanOrder = Partial<{
  [K in OrderFieldKey]: K extends 'contract_value' | 'invoiced_amt' ? number
    : K extends 'is_issue' ? boolean
    : K extends 'status' ? SoStatus
    : K extends 'type' ? SoType
    : string | null;
}>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial day number (1900 date system) → YYYY-MM-DD. */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 110000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const dt = new Date(ms);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Accepts DD-Mon-YYYY, MM/DD/YYYY (DD/MM/YYYY when the first part is > 12),
 * YYYY-MM-DD, "Mon DD, YYYY", Excel serial numbers and Date objects.
 */
export function parseDate(input: unknown): Parsed<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { ok: false, error: 'invalid date' };
    return { ok: true, value: ymd(input.getFullYear(), input.getMonth() + 1, input.getDate()) };
  }
  if (typeof input === 'number') {
    const v = excelSerialToDate(input);
    return v ? { ok: true, value: v } : { ok: false, error: `"${input}" is not a valid Excel date` };
  }
  const s = String(input).trim();
  if (s === '' || s === '-' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'tbd') return { ok: true, value: null };
  const bad: Parsed<string | null> = { ok: false, error: `unrecognised date "${s}"` };

  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) {
    const v = ymd(+m[1], +m[2], +m[3]);
    return v ? { ok: true, value: v } : bad;
  }
  if ((m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3,9})\.?[-\s/.,]+(\d{2}|\d{4})$/))) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    const v = mon ? ymd(+m[3], mon, +m[1]) : null;
    return v ? { ok: true, value: v } : bad;
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mon = MONTHS[m[1].toLowerCase().slice(0, 3)];
    const v = mon ? ymd(+m[3], mon, +m[2]) : null;
    return v ? { ok: true, value: v } : bad;
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/))) {
    let [a, b] = [+m[1], +m[2]];
    if (a > 12 && b <= 12) [a, b] = [b, a]; // DD/MM/YYYY
    const v = ymd(+m[3], a, b);
    return v ? { ok: true, value: v } : bad;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const v = excelSerialToDate(Number(s));
    return v ? { ok: true, value: v } : bad;
  }
  return bad;
}

/** Strips currency symbols, codes, commas and spaces; "(1,200)" → -1200; blank → 0. */
export function parseMoney(input: unknown): Parsed<number> {
  if (input === null || input === undefined) return { ok: true, value: 0 };
  if (typeof input === 'number') {
    return Number.isFinite(input) ? { ok: true, value: Math.round(input * 100) / 100 } : { ok: false, error: 'invalid number' };
  }
  let s = String(input).trim();
  if (s === '' || s === '-' || s === '–') return { ok: true, value: 0 };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[A-Za-z$€£¥₫៛฿₹\s,']/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return { ok: false, error: `unrecognised amount "${String(input).trim()}"` };
  const n = Number(s) * (negative ? -1 : 1);
  if (Math.abs(n) >= 1e12) return { ok: false, error: 'amount too large' };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export function parseStatus(input: unknown): Parsed<SoStatus> {
  const s = input === null || input === undefined ? '' : squash(String(input));
  if (s === '') return { ok: true, value: 'Pending' };
  const found = SO_STATUSES.find((st) => squash(st) === s);
  if (found) return { ok: true, value: found };
  const aliases: Record<string, SoStatus> = {
    open: 'Pending', new: 'Pending', notstarted: 'Pending', wip: 'In Progress', ongoing: 'In Progress',
    inprocess: 'In Progress', hold: 'On Hold', onhold: 'On Hold', paused: 'On Hold', complete: 'Delivered',
    completed: 'Delivered', done: 'Delivered', finished: 'Delivered', closed: 'Closed', canceled: 'Cancelled',
    cancel: 'Cancelled',
  };
  if (aliases[s]) return { ok: true, value: aliases[s] };
  return { ok: false, error: `unknown status "${String(input).trim()}"` };
}

export function parseType(input: unknown): Parsed<SoType> {
  const s = input === null || input === undefined ? '' : squash(String(input));
  if (s === '' || s.startsWith('normal') || s === 'standard' || s === 'regular') return { ok: true, value: 'normal' };
  if (s.startsWith('project') || s === 'proj' || s === 'prj') return { ok: true, value: 'project' };
  return { ok: false, error: `unknown type "${String(input).trim()}" (use Normal or Project)` };
}

export function parseBool(input: unknown): Parsed<boolean> {
  if (typeof input === 'boolean') return { ok: true, value: input };
  if (input === null || input === undefined) return { ok: true, value: false };
  const s = String(input).trim().toLowerCase();
  if (['', '0', 'false', 'no', 'n', 'f'].includes(s)) return { ok: true, value: false };
  if (['1', 'true', 'yes', 'y', 't', 'x', '✓', '✔'].includes(s)) return { ok: true, value: true };
  return { ok: false, error: `expected yes/no, got "${input}"` };
}

const MAX_TEXT = 5000;

function parseText(input: unknown): Parsed<string | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  const s = String(input).trim();
  if (s.length > MAX_TEXT) return { ok: false, error: `longer than ${MAX_TEXT} characters` };
  return { ok: true, value: s === '' ? null : s };
}

export function parseField(key: OrderFieldKey, input: unknown): Parsed<unknown> {
  switch (FIELD_BY_KEY[key].kind) {
    case 'date': return parseDate(input);
    case 'money': return parseMoney(input);
    case 'status': return parseStatus(input);
    case 'type': return parseType(input);
    case 'bool': return parseBool(input);
    default: return parseText(input);
  }
}

export interface NormalizeResult {
  value: CleanOrder;
  errors: Partial<Record<OrderFieldKey, string>>;
}

/**
 * Coerces raw input into clean column values. With `partial`, only keys present in
 * `input` are returned (PATCH); otherwise required fields are enforced (create).
 */
export function normalizeOrder(input: Record<string, unknown>, opts: { partial?: boolean } = {}): NormalizeResult {
  const value: Record<string, unknown> = {};
  const errors: Partial<Record<OrderFieldKey, string>> = {};
  for (const f of ORDER_FIELDS) {
    if (!(f.key in input)) {
      if (!opts.partial) {
        const r = parseField(f.key, null);
        if (r.ok) value[f.key] = r.value;
      }
      continue;
    }
    const r = parseField(f.key, input[f.key]);
    if (r.ok) value[f.key] = r.value;
    else errors[f.key] = r.error;
  }
  for (const key of ['customer', 'so_number'] as const) {
    if ((!opts.partial || key in input) && !errors[key] && !value[key]) errors[key] = `${FIELD_BY_KEY[key].label} is required`;
  }
  return { value: value as CleanOrder, errors };
}

export interface MilestoneInput {
  name?: unknown;
  due_date?: unknown;
  done?: unknown;
  sort_order?: unknown;
}

export function normalizeMilestone(input: MilestoneInput, opts: { partial?: boolean } = {}) {
  const value: Partial<Omit<Milestone, 'id' | 'so_id'>> = {};
  const errors: Record<string, string> = {};
  if ('name' in input || !opts.partial) {
    const name = input.name == null ? '' : String(input.name).trim();
    if (!name) errors.name = 'Name is required';
    else if (name.length > 500) errors.name = 'Name is too long';
    else value.name = name;
  }
  if ('due_date' in input) {
    const r = parseDate(input.due_date);
    if (r.ok) value.due_date = r.value;
    else errors.due_date = r.error;
  }
  if ('done' in input) {
    const r = parseBool(input.done);
    if (r.ok) value.done = r.value;
    else errors.done = r.error;
  }
  if ('sort_order' in input) {
    const n = Number(input.sort_order);
    if (Number.isInteger(n) && Math.abs(n) < 1e9) value.sort_order = n;
    else errors.sort_order = 'sort_order must be an integer';
  }
  return { value, errors };
}

export interface BulkRowResult {
  index: number;
  ok: boolean;
  id?: number;
  so_number?: string;
  action?: 'created' | 'updated';
  errors?: Partial<Record<OrderFieldKey | 'row', string>>;
}

export interface DashboardData {
  totals: {
    count: number;
    contract_value: number;
    invoiced: number;
    remaining: number;
    collection_rate: number;
  };
  status_breakdown: { status: SoStatus; count: number; pct: number }[];
  issues: { id: number; so_number: string; customer: string; issue_note: string | null; issue_flagged_at: string | null; type: SoType; status: SoStatus }[];
  collection: { id: number; so_number: string; customer: string; type: SoType; contract_value: number; invoiced_amt: number; pct: number }[];
}
