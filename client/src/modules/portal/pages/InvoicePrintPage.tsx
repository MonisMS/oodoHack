import { useParams } from 'react-router-dom';
import { Button } from '../../../components/ops/ui';
import { InvoiceDocument } from '../../../components/ops/InvoiceDocument';
import { usePortalInvoice } from '../api';
import { BackLink, QueryState } from '../components/Shared';

export default function InvoicePrintPage() {
  const { id = '' } = useParams();
  const query = usePortalInvoice(id);
  return <div className="space-y-4">
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <BackLink to={`/portal/invoices/${id}`}>Back to invoice</BackLink>
      <Button variant="primary" disabled={!query.data} onClick={() => window.print()}>Print</Button>
    </div>
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} />
    {query.data && <InvoiceDocument invoice={query.data} />}
  </div>;
}
