import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, type Column } from '../../../components/ops/ui';
import { ErrorNotice } from '../../../components/ops/errors';
import { StatusBadge } from '../../../components/ops/ui';
import { date, money } from '../../../components/ops/format';
import type { PortalInvoice, PortalSubscription } from '../../../types/api';

export function QueryState({ loading, error, onRetry }: { loading: boolean; error: unknown; onRetry: () => void }) {
  if (error) return <div className="space-y-2"><ErrorNotice error={error} /><Button onClick={onRetry}>Try again</Button></div>;
  if (loading) return <div className="flex justify-center p-10"><Spinner /></div>;
  return null;
}

export const linkClass = 'font-medium text-brand-700 underline-offset-2 hover:underline';

export const subscriptionColumns: Column<PortalSubscription>[] = [
  { header: 'Subscription', cell: s => <Link className={linkClass} to={`/portal/subscriptions/${s.id}`}>{s.number}</Link> },
  { header: 'Plan', cell: s => s.planName },
  { header: 'Status', cell: s => <span className="flex flex-wrap gap-1"><StatusBadge status={s.status} />{s.cancelAtPeriodEnd && <StatusBadge status="ENDING" tone="amber" />}</span> },
  { header: 'Next invoice', cell: s => s.cancelAtPeriodEnd ? 'None (ending)' : date(s.nextInvoiceDate) },
  { header: 'Price', align: 'right', cell: s => money(s.planPrice) },
];

export const invoiceColumns: Column<PortalInvoice>[] = [
  { header: 'Invoice', cell: i => <Link className={linkClass} to={`/portal/invoices/${i.id}`}>{i.number}</Link> },
  { header: 'Issued', cell: i => date(i.issueDate) },
  { header: 'Due', cell: i => <span className="flex flex-wrap items-center gap-2">{date(i.dueDate)}{i.overdue && <StatusBadge status="OVERDUE" />}</span> },
  { header: 'Total', align: 'right', cell: i => money(i.total) },
  { header: 'Balance due', align: 'right', cell: i => money(i.outstanding) },
  { header: 'Status', cell: i => <StatusBadge status={i.status} /> },
];

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className={`no-print mb-4 inline-block text-sm ${linkClass}`}>← {children}</Link>;
}
