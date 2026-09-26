import { useState, type FormEvent } from 'react';
import { ORDER_FIELDS, SO_STATUSES, type FieldDef, type OrderFieldKey, type SalesOrder } from '../../shared/schema';
import { api, ApiError } from '../lib/api';
import { todayIso } from '../lib/format';
import { btn, Modal } from './Modal';

const LONG_TEXT: OrderFieldKey[] = ['customer_feedback', 'internal_notes', 'issue_note', 'invoice_plan'];

export function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (o: SalesOrder) => void }) {
  const [form, setForm] = useState<Record<string, string | boolean>>({ type: 'normal', status: 'Pending', so_date: todayIso(), is_issue: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const isProject = form.type === 'project';

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([k]) => isProject || !ORDER_FIELDS.find((f) => f.key === k)?.projectOnly),
      );
      onCreated(await api.createOrder(payload));
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = (f: FieldDef) => {
    const cls = `w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 ${errors[f.key] ? 'border-red-400' : 'border-slate-300'}`;
    const val = (form[f.key] as string) ?? '';
    if (f.kind === 'status') {
      return <select id={f.key} className={cls} value={val} onChange={(e) => set(f.key, e.target.value)}>{SO_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>;
    }
    if (f.kind === 'type') {
      return (
        <select id={f.key} className={cls} value={val} onChange={(e) => set(f.key, e.target.value)}>
          <option value="normal">Normal</option>
          <option value="project">Project</option>
        </select>
      );
    }
    if (LONG_TEXT.includes(f.key)) return <textarea id={f.key} rows={2} className={cls} value={val} onChange={(e) => set(f.key, e.target.value)} />;
    return (
      <input
        id={f.key}
        className={cls}
        type={f.kind === 'date' ? 'date' : 'text'}
        inputMode={f.kind === 'money' ? 'decimal' : undefined}
        placeholder={f.kind === 'money' ? '0.00' : undefined}
        value={val}
        onChange={(e) => set(f.key, e.target.value)}
      />
    );
  };

  const fields = ORDER_FIELDS.filter((f) => f.kind !== 'bool' && f.key !== 'issue_note' && (!f.projectOnly || isProject));

  return (
    <Modal
      title="New sales order"
      onClose={onClose}
      footer={
        <>
          {formError && <span className="mr-auto text-sm text-red-600">{formError}</span>}
          <button className={btn.secondary} onClick={onClose}>Cancel</button>
          <button className={btn.primary} form="new-so" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create SO'}</button>
        </>
      }
    >
      <form id="new-so" onSubmit={submit} className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={LONG_TEXT.includes(f.key) || f.key === 'product_service' ? 'sm:col-span-2' : ''}>
            <label htmlFor={f.key} className="mb-1 block text-xs font-medium text-slate-600">
              {f.label}{(f.key === 'customer' || f.key === 'so_number') && <span className="text-red-500"> *</span>}
            </label>
            {input(f)}
            {errors[f.key] && <p className="mt-0.5 text-xs text-red-600">{errors[f.key]}</p>}
          </div>
        ))}
        <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!form.is_issue} onChange={(e) => set('is_issue', e.target.checked)} className="h-4 w-4 accent-red-600" />
            Flag as issue
          </label>
          {form.is_issue && (
            <textarea rows={2} placeholder="What's the issue?" className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" value={(form.issue_note as string) ?? ''} onChange={(e) => set('issue_note', e.target.value)} />
          )}
        </div>
      </form>
    </Modal>
  );
}
