import type { SoStatus } from '../../shared/schema';

const STYLES: Record<SoStatus, string> = {
  Pending: 'bg-slate-100 text-slate-700 ring-slate-300',
  'In Progress': 'bg-blue-50 text-blue-800 ring-blue-200',
  Delivered: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'On Hold': 'bg-amber-50 text-amber-800 ring-amber-200',
  Closed: 'bg-slate-800 text-white ring-slate-800',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200 line-through decoration-red-300',
};

export function StatusBadge({ status }: { status: SoStatus }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STYLES[status]}`}>{status}</span>;
}
