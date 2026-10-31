import { Link, useParams } from 'react-router-dom';
import { InvoiceDocument } from '../../../components/ops/InvoiceDocument';
import { ErrorNotice } from '../../../components/ops/errors';
import { Button, Spinner } from '../../../components/ops/ui';
import { useInvoice } from '../api';

export default function InvoicePrintPage() {
  const { id = '' } = useParams();
  const { data: invoice, isLoading, error, refetch } = useInvoice(id);
  return <>
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link to={`/invoices/${id}`} className="text-sm text-brand-700 hover:underline">← Back to invoice</Link>
      <Button variant="primary" disabled={!invoice} onClick={() => window.print()}>Print</Button>
    </div>
    {isLoading ? <div className="flex justify-center p-10"><Spinner /></div>
      : error ? <div className="space-y-3"><ErrorNotice error={error} /><Button onClick={() => void refetch()}>Try again</Button></div>
      : invoice ? <InvoiceDocument invoice={invoice} /> : <p role="status" className="text-sm text-slate-500">Invoice not found.</p>}
  </>;
}
