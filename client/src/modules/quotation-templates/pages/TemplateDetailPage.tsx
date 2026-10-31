import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorNotice } from '../../../components/ops/errors';
import { date, money } from '../../../components/ops/format';
import { useProducts } from '../../../components/ops/pickers';
import { Button, Card, DataTable, Facts, Modal, Spinner, StatusBadge } from '../../../components/ops/ui';
import { useDeactivateTemplate, useTemplate } from '../api';
import { CreateSubscriptionModal } from '../components/CreateSubscriptionModal';

export default function TemplateDetailPage() {
  const { id = '' } = useParams(); const navigate = useNavigate();
  const { data: template, isLoading, error, refetch } = useTemplate(id);
  const deactivate = useDeactivateTemplate(id);
  const products = useProducts().data?.data;
  const [modal, setModal] = useState<'create' | 'deactivate' | null>(null);
  if (isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (error || !template) return <div className="space-y-3"><ErrorNotice error={error} title="The template could not be loaded" /><Button onClick={() => void refetch()}>Try again</Button></div>;
  return <>
    <PageHeader title={template.name} description="Quotation template" actions={<div className="flex flex-wrap gap-2">
      {template.isActive && <Button variant="primary" onClick={() => setModal('create')}>Create subscription from this template</Button>}
      <Button onClick={() => navigate(`/quotation-templates/${id}/edit`)}>Edit</Button>
      {template.isActive && <Button variant="danger" onClick={() => setModal('deactivate')}>Deactivate</Button>}
    </div>} />
    <div className="space-y-5">
      <Card title="Details"><Facts items={[
        ['Plan', template.planName], ['Validity', `${template.validityDays} days`],
        ['Status', <StatusBadge key="s" status={template.isActive ? 'ACTIVE' : 'CLOSED'} tone={template.isActive ? 'green' : 'slate'} />],
        ['Created', date(template.createdAt.slice(0, 10))], ['Last updated', date(template.updatedAt.slice(0, 10))],
      ]} /></Card>
      <Card title="Lines"><DataTable caption="Template lines" rows={template.lines} rowKey={l => l.id} empty="This template has no lines."
        columns={[
          { header: 'Product', cell: l => { const product = products?.find(p => p.id === l.productId); const variant = product?.variants.find(v => v.id === l.variantId); return <>{product?.name ?? 'Product'}{variant && <span className="text-slate-500"> ({variant.attribute}: {variant.value})</span>}</>; } },
          { header: 'Quantity', align: 'right', cell: l => l.quantity },
          { header: 'Unit price', align: 'right', cell: l => l.unitPrice ? money(l.unitPrice) : <span className="text-slate-500">Live catalog price</span> },
        ]} /></Card>
      <p className="text-sm"><Link to="/quotation-templates" className="text-brand-700 hover:underline">Back to templates</Link></p>
    </div>
    {modal === 'create' && <CreateSubscriptionModal template={template} onClose={() => setModal(null)} />}
    {modal === 'deactivate' && <Modal title="Deactivate template" onClose={() => setModal(null)} footer={<><Button onClick={() => setModal(null)}>Keep active</Button><Button variant="danger" busy={deactivate.isPending} onClick={() => deactivate.mutate(undefined, { onSuccess: () => navigate('/quotation-templates') })}>Deactivate</Button></>}>
      <p className="text-sm text-slate-700">&ldquo;{template.name}&rdquo; will no longer be offered when creating subscriptions. Subscriptions already created from it are not affected.</p>
      <div className="mt-3"><ErrorNotice error={deactivate.error} /></div>
    </Modal>}
  </>;
}
