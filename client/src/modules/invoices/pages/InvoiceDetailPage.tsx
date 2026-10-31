import { Link, useParams } from 'react-router-dom';
import { ErrorNotice } from '../../../components/ops/errors';
import { Button, Spinner, StatusBadge } from '../../../components/ops/ui';
import { useInvoice } from '../api';
import { InvoiceActions } from '../components/InvoiceActions';
import { InvoiceBody } from '../components/InvoiceBody';

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const { data: invoice, isLoading, error, refetch } = useInvoice(id);
  return <>
    <p className="mb-3 text-sm"><Link to="/invoices" className="text-brand-700 hover:underline">← All invoices</Link></p>
    {isLoading ? <div className="flex justify-center p-10"><Spinner /></div>
      : error ? <div className="space-y-3"><ErrorNotice error={error} /><Button onClick={() => void refetch()}>Try again</Button></div>
      : !invoice ? <p role="status" className="text-sm text-slate-500">Invoice not found.</p>
      : <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1><StatusBadge status={invoice.status} />{invoice.overdue && <StatusBadge status="OVERDUE" />}<span className="text-sm text-slate-500">{invoice.customerName}</span></div>
          <InvoiceActions invoice={invoice} />
        </div>
        <InvoiceBody invoice={invoice} />
      </div>}
  </>;
}
