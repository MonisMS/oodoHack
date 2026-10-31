import type { ReactNode } from 'react';
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <section className="rounded-xl border border-dashed bg-white p-10 text-center"><h2 className="font-medium">{title}</h2><div className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{children}</div></section>;
}
