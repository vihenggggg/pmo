import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SO_STATUSES, type FieldKind } from '../../shared/schema';

interface Props {
  value: string | number | null;
  kind: FieldKind;
  display?: ReactNode;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  /** Resolves when saved; rejects to keep the editor open. */
  onSave: (value: string) => Promise<unknown>;
}

const inputCls = 'w-full min-w-[6rem] rounded border border-accent bg-white px-1.5 py-1 text-sm outline-none ring-2 ring-accent/25';

export function EditableCell({ value, kind, display, multiline, placeholder, className = '', onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      if (kind !== 'date' && kind !== 'status' && kind !== 'type') ref.current?.select?.();
    }
  }, [editing, kind]);

  const original = value === null || value === undefined ? '' : String(value);

  function start() {
    setDraft(original);
    setEditing(true);
  }

  async function commit(next = draft) {
    if (saving) return;
    if (next === original) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      ref.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setEditing(false);
    } else if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      commit();
    }
  }

  if (editing) {
    const common = { ref, disabled: saving, onKeyDown, onBlur: () => commit(), className: inputCls };
    if (kind === 'status' || kind === 'type') {
      return (
        <select {...common} value={draft} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}>
          {kind === 'status'
            ? SO_STATUSES.map((s) => <option key={s}>{s}</option>)
            : [<option key="normal" value="normal">Normal</option>, <option key="project" value="project">Project</option>]}
        </select>
      );
    }
    if (multiline) {
      return <textarea {...common} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className={`${inputCls} min-w-[14rem]`} />;
    }
    return (
      <input
        {...common}
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={kind === 'money' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Click to edit"
      className={`block w-full min-h-[1.75rem] rounded px-1.5 py-1 text-left hover:bg-accent-soft/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
    >
      {display ?? (original || <span className="text-slate-300">{placeholder ?? '—'}</span>)}
    </button>
  );
}
