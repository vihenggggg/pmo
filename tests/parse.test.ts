import { describe, expect, it } from 'vitest';
import { normalizeOrder, parseDate, parseMoney, parseStatus, parseType } from '../shared/schema';
import { autoMap, detectHeaderRow, parseTsv, positionalMapping, prepareRows, toPayload } from '../src/lib/importer';

describe('parseDate', () => {
  it.each([
    ['05-Mar-2025', '2025-03-05'],
    ['5-Sept-25', '2025-09-05'],
    ['5 March 2025', '2025-03-05'],
    ['Mar 5, 2025', '2025-03-05'],
    ['03/05/2025', '2025-03-05'],
    ['25/12/2025', '2025-12-25'],
    ['2025-03-05', '2025-03-05'],
    ['2025-03-05T10:00:00Z', '2025-03-05'],
    [45658, '2025-01-01'],
    ['45658', '2025-01-01'],
    ['', null],
    ['TBD', null],
  ])('%s → %s', (input, expected) => {
    expect(parseDate(input)).toEqual({ ok: true, value: expected });
  });
  it.each(['31-Feb-2025', 'soon', '13/13/2025'])('rejects %s', (input) => {
    expect(parseDate(input).ok).toBe(false);
  });
});

describe('parseMoney', () => {
  it.each([
    ['$1,234.50', 1234.5],
    ['USD 12,000', 12000],
    ['(1,200)', -1200],
    ['', 0],
    ['-', 0],
    [99.999, 100],
  ])('%s → %s', (input, expected) => {
    expect(parseMoney(input)).toEqual({ ok: true, value: expected });
  });
  it('rejects text', () => expect(parseMoney('abc12x3.4.5').ok).toBe(false));
});

describe('status/type', () => {
  it('matches loosely', () => {
    expect(parseStatus('in-progress')).toEqual({ ok: true, value: 'In Progress' });
    expect(parseStatus('ON HOLD')).toEqual({ ok: true, value: 'On Hold' });
    expect(parseStatus('canceled')).toEqual({ ok: true, value: 'Cancelled' });
    expect(parseStatus('')).toEqual({ ok: true, value: 'Pending' });
    expect(parseType('Project SO')).toEqual({ ok: true, value: 'project' });
    expect(parseType('')).toEqual({ ok: true, value: 'normal' });
    expect(parseType('other').ok).toBe(false);
  });
  it('requires customer and SO# on create only', () => {
    expect(Object.keys(normalizeOrder({}).errors).sort()).toEqual(['customer', 'so_number']);
    expect(normalizeOrder({ status: 'Closed' }, { partial: true })).toEqual({ value: { status: 'Closed' }, errors: {} });
  });
});

describe('parseTsv', () => {
  it('splits tabs/newlines and handles quoted multi-line cells', () => {
    const text = 'Acme\tSO-1\t"line one\nline ""two"""\r\nBeta\tSO-2\t\r\n\r\n';
    expect(parseTsv(text)).toEqual([
      ['Acme', 'SO-1', 'line one\nline "two"'],
      ['Beta', 'SO-2', ''],
    ]);
  });
});

describe('column mapping', () => {
  it('fuzzy-matches real-world headers', () => {
    const headers = ['SO #', 'Client', 'Contract Value (USD)', 'Invoiced Amt', 'Start Date', 'SO Date', 'Remarks', 'Service Type', 'Type', 'Mystery'];
    expect(autoMap(headers)).toEqual([
      'so_number', 'customer', 'contract_value', 'invoiced_amt', 'start_date', 'so_date', 'internal_notes', 'service_type', 'type', null,
    ]);
  });
  it('finds the header row below a title row', () => {
    const grid = [['SO Tracker 2025'], ['Customer', 'SO#', 'Status'], ['Acme', '1', 'Pending']];
    expect(detectHeaderRow(grid).index).toBe(1);
    expect(detectHeaderRow([['Acme', 'SO-1', '30 days']]).index).toBe(-1);
  });
  it('prepares rows positionally with errors and warnings', () => {
    const grid = parseTsv('Acme\tSO-1\t30d\t05-Mar-2025\t\t\tWidgets\t1,000\t2,000\nBeta\tSO-1\nGamma\t\t');
    const mapping = positionalMapping(9);
    const rows = prepareRows(grid, mapping);
    expect(rows[0].errors).toEqual({});
    expect(rows[0].warnings).toEqual(['Invoiced is more than contract value']);
    expect(toPayload(rows[0], mapping)).toEqual({
      customer: 'Acme', so_number: 'SO-1', lead_time: '30d', so_date: '2025-03-05', start_date: null, deadline: null,
      product_service: 'Widgets', contract_value: 1000, invoiced_amt: 2000,
    });
    expect(rows[1].errors.so_number).toMatch(/Duplicate/);
    expect(rows[2].errors.so_number).toMatch(/required/);
  });
});
