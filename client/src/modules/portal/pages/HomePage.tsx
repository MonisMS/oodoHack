import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, DataTable } from '../../../components/ops/ui';
import { date, money } from '../../../components/ops/format';
import { useSession } from '../../../lib/session';
import { usePortalInvoices, usePortalSubscriptions, usePortalSummary } from '../api';
import { QueryState, invoiceColumns, linkClass, subscriptionColumns } from '../components/Shared';

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return <div className={`rounded-xl border p-4 shadow-sm ${alert ? 'border-rose-300 bg-rose-50' : 'bg-white'}`}>
    <p className={`text-xs font-medium uppercase tracking-wide ${alert ? 'text-rose-700' : 'text-slate-500'}`}>{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-rose-700' : ''}`}>{value}</p>
  </div>;
}

export default function HomePage() {
  const { user } = useSession();
  const summary = usePortalSummary();
  const invoices = usePortalInvoices({ page: 1, pageSize: 5, sortBy: 'date', sortOrder: 'desc' });
  const subscriptions = usePortalSubscriptions({ page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' });
  const s = summary.data;

  return <div className="space-y-6">
    <PageHeader title={user?.name ? `Welcome, ${user.name}` : 'Welcome'} description="Your subscriptions and invoices at a glance." />
    <QueryState loading={summary.isLoading} error={summary.error} onRetry={() => void summary.refetch()} />
    {s && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Active subscriptions" value={String(s.activeSubscriptions)} />
      <Stat label="Outstanding balance" value={money(s.outstanding)} />
      <Stat label="Overdue invoices" value={String(s.overdueInvoices)} alert={s.overdueInvoices > 0} />
      <Stat label="Next invoice" value={s.nextInvoiceDate ? date(s.nextInvoiceDate) : 'None scheduled'} />
    </div>}
    <Card title="Recent invoices" actions={<Link className={`text-sm ${linkClass}`} to="/portal/invoices">View all</Link>}>
      {invoices.isError || invoices.isLoading ? <QueryState loading={invoices.isLoading} error={invoices.error} onRetry={() => void invoices.refetch()} />
        : <DataTable caption="Recent invoices" columns={invoiceColumns} rows={invoices.data?.data} rowKey={i => i.id} empty="You have no invoices yet. They will appear here once your first bill is issued." />}
    </Card>
    <Card title="Your subscriptions" actions={<Link className={`text-sm ${linkClass}`} to="/portal/subscriptions">View all</Link>}>
      {subscriptions.isError || subscriptions.isLoading ? <QueryState loading={subscriptions.isLoading} error={subscriptions.error} onRetry={() => void subscriptions.refetch()} />
        : <DataTable caption="Your subscriptions" columns={subscriptionColumns} rows={subscriptions.data?.data} rowKey={x => x.id} empty="You have no subscriptions yet. Once one is set up for you, it will appear here." />}
    </Card>
  </div>;
}
