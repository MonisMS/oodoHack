import { PageHeader } from '../../../components/ui/PageHeader';
import { DataTable, Field, Pagination, inputClass } from '../../../components/ops/ui';
import { label } from '../../../components/ops/format';
import { useListParams } from '../../../components/ops/hooks';
import { usePortalInvoices } from '../api';
import { QueryState, invoiceColumns } from '../components/Shared';

const STATUSES = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'] as const;

export default function InvoicesPage() {
  const { get, set, query } = useListParams(10);
  const result = usePortalInvoices({ ...query(), sortBy: 'date', sortOrder: 'desc' });
  const filtered = Boolean(get('status') || get('overdue'));
  return <div className="space-y-4">
    <PageHeader title="My invoices" description="Every invoice issued to you." />
    <div className="flex flex-wrap items-end gap-4">
      <Field label="Status" className="w-full sm:w-56">
        {p => <select {...p} className={inputClass} value={get('status')} onChange={e => set({ status: e.target.value })}>
          <option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>}
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={get('overdue') === 'true'} onChange={e => set({ overdue: e.target.checked ? 'true' : undefined })} /> Overdue only</label>
    </div>
    {result.isError ? <QueryState loading={false} error={result.error} onRetry={() => void result.refetch()} /> : <>
      <DataTable caption="My invoices" columns={invoiceColumns} rows={result.data?.data} rowKey={i => i.id} loading={result.isLoading}
        empty={filtered ? 'No invoices match these filters.' : 'You have no invoices yet.'} />
      {result.data && result.data.total > 0 && <Pagination page={result.data.page} pageSize={result.data.pageSize} total={result.data.total} onPage={page => set({ page })} />}
    </>}
  </div>;
}
