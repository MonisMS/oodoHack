import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorNotice } from '../../../components/ops/errors';
import { useDebounced, useListParams } from '../../../components/ops/hooks';
import { Button, DataTable, Field, inputClass, Pagination, StatusBadge } from '../../../components/ops/ui';
import { useTemplates } from '../api';

export default function TemplateListPage() {
  const list = useListParams(20); const navigate = useNavigate();
  const [search, setSearch] = useState(list.get('search'));
  const debounced = useDebounced(search);
  const current = list.get('search');
  useEffect(() => { if (debounced !== current) list.set({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, isLoading, error, refetch } = useTemplates({ ...list.query(), sortBy: 'name', sortOrder: 'asc' });
  return <>
    <PageHeader title="Quotation templates" description="Reusable subscription set-ups: choose a plan and lines once, then create subscriptions in a click." actions={<Link to="/quotation-templates/new" className="inline-flex rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">New template</Link>} />
    <div className="mb-4 max-w-sm"><Field label="Search templates">{f => <input {...f} type="search" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Template name" />}</Field></div>
    {error ? <div className="space-y-3"><ErrorNotice error={error} title="Templates could not be loaded" /><Button onClick={() => void refetch()}>Try again</Button></div> : <>
      <DataTable caption="Quotation templates" loading={isLoading} rows={data?.data} rowKey={t => t.id} onRowClick={t => navigate(`/quotation-templates/${t.id}`)}
        empty={<EmptyState title="No templates found">{current ? 'No template matches this search.' : 'Create your first template to speed up quotations.'}</EmptyState>}
        columns={[
          { header: 'Name', cell: t => <Link to={`/quotation-templates/${t.id}`} className="font-medium text-brand-700 hover:underline" onClick={e => e.stopPropagation()}>{t.name}</Link> },
          { header: 'Plan', cell: t => t.planName },
          { header: 'Validity (days)', align: 'right', cell: t => t.validityDays },
          { header: 'Lines', align: 'right', cell: t => t.lines.length },
          { header: 'Status', cell: t => <StatusBadge status={t.isActive ? 'ACTIVE' : 'CLOSED'} tone={t.isActive ? 'green' : 'slate'} /> },
        ]} />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={p => list.set({ page: p })} />}
    </>}
  </>;
}
