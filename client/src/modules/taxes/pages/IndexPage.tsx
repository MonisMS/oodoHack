import { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button, DataTable, Field, Modal, Notice, Pagination, StatusBadge, inputClass, type Column } from '../../../components/ops/ui';
import { useDebounced, useListParams } from '../../../components/ops/hooks';
import { ErrorNotice } from '../../../components/ops/errors';
import type { Tax } from '../../../types/api';
import { useDeactivateTax, useTaxes } from '../api';
import { TaxFormModal } from '../components/TaxFormModal';

export default function IndexPage() {
  const { page, pageSize, get, set, query } = useListParams(20);
  const urlSearch = get('search');
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search);
  useEffect(() => { if (debounced !== urlSearch) set({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const taxes = useTaxes({ ...query(), sortBy: 'name', sortOrder: 'asc' });
  const [editing, setEditing] = useState<Tax | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<Tax | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const deactivate = useDeactivateTax();

  const columns: Column<Tax>[] = [
    { header: 'Name', cell: t => <span className={t.isActive ? 'font-medium' : 'text-slate-500'}>{t.name}</span> },
    { header: 'Percentage', align: 'right', cell: t => `${Number(t.percentage)}%` },
    { header: 'Status', cell: t => <StatusBadge status={t.isActive ? 'ACTIVE' : 'INACTIVE'} tone={t.isActive ? 'green' : 'slate'} /> },
    { header: 'Products', align: 'right', cell: t => t.productIds.length },
    { header: 'Plans', align: 'right', cell: t => t.planIds.length },
    { header: 'Actions', cell: t => <div className="flex gap-2"><Button variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</Button>{t.isActive && <Button variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={() => { deactivate.reset(); setDeactivating(t); }} aria-label={`Deactivate ${t.name}`}>Deactivate</Button>}</div> },
  ];

  return <div>
    <PageHeader title="Taxes" description="Taxes applied to products and plans when invoices are created." actions={<Button variant="primary" onClick={() => setEditing('new')}>New tax</Button>} />
    <div className="space-y-4">
      {message && <Notice tone="success" onDismiss={() => setMessage(null)}>{message}</Notice>}
      <Field label="Search taxes" className="max-w-sm">{p => <input {...p} type="search" className={inputClass} value={search} placeholder="Name" onChange={e => setSearch(e.target.value)} />}</Field>
      {taxes.isError ? <div className="space-y-2"><ErrorNotice error={taxes.error} /><Button onClick={() => void taxes.refetch()}>Try again</Button></div> : <>
        <DataTable caption="Taxes" columns={columns} rows={taxes.data?.data} rowKey={t => t.id} loading={taxes.isLoading}
          empty={urlSearch ? 'No taxes match your search.' : 'No taxes yet. Create one to start applying tax to invoices.'} />
        {taxes.data && taxes.data.total > 0 && <Pagination page={taxes.data.page ?? page} pageSize={taxes.data.pageSize ?? pageSize} total={taxes.data.total} onPage={next => set({ page: next })} />}
      </>}
    </div>
    {editing && <TaxFormModal tax={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={text => { setEditing(null); setMessage(text); }} />}
    {deactivating && <Modal title="Deactivate tax" onClose={() => setDeactivating(null)} footer={<>
      <Button onClick={() => setDeactivating(null)}>Keep active</Button>
      <Button variant="danger" busy={deactivate.isPending} onClick={() => deactivate.mutate(deactivating.id, { onSuccess: () => { setMessage(`Tax "${deactivating.name}" was deactivated.`); setDeactivating(null); } })}>Deactivate</Button></>}>
      <div className="space-y-3 text-sm"><p>Deactivate <strong>{deactivating.name}</strong> ({Number(deactivating.percentage)}%)?</p>
        <p>Existing invoices keep their frozen tax amounts. The tax will no longer be applied to future invoices. You can re-activate it later by editing it.</p>
        {deactivate.error && <ErrorNotice error={deactivate.error} />}</div>
    </Modal>}
  </div>;
}
