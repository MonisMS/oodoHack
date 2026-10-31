import type { SubscriptionEvent } from '../../../types/api';
import { dateTime, label } from '../../../components/ops/format';
import { StatusBadge } from '../../../components/ops/ui';

/** Newest first. An event whose from and to status match is an action (not a status change); its reason holds the description. */
export function Timeline({ events }: { events: SubscriptionEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No history yet.</p>;
  const sorted = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <ol className="space-y-4 border-l-2 border-slate-200 pl-5">
    {sorted.map(e => { const action = e.fromStatus === e.toStatus;
      return <li key={e.id} className="relative">
        <span aria-hidden className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ${action ? 'bg-slate-400' : 'bg-brand-600'}`} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {action ? <><span className="font-medium text-slate-800">Action</span><span className="text-xs text-slate-500">while {label(e.toStatus)}</span></>
            : <><StatusBadge status={e.fromStatus} /><span aria-label="changed to">&rarr;</span><StatusBadge status={e.toStatus} /></>}
          <time dateTime={e.createdAt} className="text-xs text-slate-500">{dateTime(e.createdAt)}</time>
        </div>
        {e.reason && <p className="mt-1 text-sm text-slate-700">{e.reason}</p>}
      </li>; })}
  </ol>;
}
