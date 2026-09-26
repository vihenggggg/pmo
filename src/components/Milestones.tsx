import { useEffect, useState, type FormEvent } from 'react';
import type { Milestone } from '../../shared/schema';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { EditableCell } from './EditableCell';
import { btn } from './Modal';
import { useToast } from './Toast';

const SUGGESTIONS = ['Site Survey', 'Install', 'UAT', 'Handover'];

export function Milestones({ soId, onCountsChange }: { soId: number; onCountsChange: (total: number, done: number) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<Milestone[] | null>(null);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');

  useEffect(() => {
    api.listMilestones(soId).then(setItems).catch((e) => toast(e.message, 'error'));
  }, [soId, toast]);

  function update(next: Milestone[]) {
    setItems(next);
    onCountsChange(next.length, next.filter((m) => m.done).length);
  }

  async function add(e: FormEvent, preset?: string) {
    e.preventDefault();
    const n = (preset ?? name).trim();
    if (!n || !items) return;
    try {
      const m = await api.createMilestone(soId, { name: n, due_date: preset ? null : due || null });
      update([...items, m]);
      if (!preset) {
        setName('');
        setDue('');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  async function patch(m: Milestone, p: Partial<Milestone>) {
    try {
      const saved = await api.updateMilestone(m.id, p);
      update(items!.map((x) => (x.id === m.id ? saved : x)));
    } catch (err) {
      toast((err as Error).message, 'error');
      throw err;
    }
  }

  async function toggle(m: Milestone, done: boolean) {
    const before = items!;
    update(before.map((x) => (x.id === m.id ? { ...x, done } : x)));
    try {
      await api.updateMilestone(m.id, { done });
    } catch (err) {
      update(before);
      toast((err as Error).message, 'error');
    }
  }

  async function remove(m: Milestone) {
    if (!confirm(`Delete milestone "${m.name}"?`)) return;
    try {
      await api.deleteMilestone(m.id);
      update(items!.filter((x) => x.id !== m.id));
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  if (!items) return <div className="px-4 py-3 text-sm text-slate-500">Loading milestones…</div>;
  const missing = SUGGESTIONS.filter((s) => !items.some((m) => m.name.toLowerCase() === s.toLowerCase()));

  return (
    <div className="max-w-3xl px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Milestones · {items.filter((m) => m.done).length}/{items.length} done
      </div>
      {items.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0">
                <td className="w-8 py-0.5">
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={(e) => toggle(m, e.target.checked)}
                    aria-label={`Mark ${m.name} done`}
                    className="h-4 w-4 accent-[#2a78d6]"
                  />
                </td>
                <td className={m.done ? 'text-slate-400 line-through' : ''}>
                  <EditableCell kind="text" value={m.name} onSave={(v) => patch(m, { name: v })} />
                </td>
                <td className="w-40">
                  <EditableCell kind="date" value={m.due_date} display={m.due_date ? fmtDate(m.due_date) : undefined} placeholder="No due date" onSave={(v) => patch(m, { due_date: v || null })} />
                </td>
                <td className="w-10 text-right">
                  <button className={btn.ghost} onClick={() => remove(m)} aria-label={`Delete ${m.name}`}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={(e) => add(e)} className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New milestone" className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" aria-label="Due date" />
        <button type="submit" className={btn.secondary} disabled={!name.trim()}>Add</button>
        {missing.length > 0 && <span className="ml-2 text-xs text-slate-500">Quick add:</span>}
        {missing.map((s) => (
          <button key={s} type="button" onClick={(e) => add(e, s)} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">+ {s}</button>
        ))}
      </form>
    </div>
  );
}
