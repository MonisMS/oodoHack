import type { ModuleRoute } from '../../lib/routes';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import InvoicePrintPage from './pages/InvoicePrintPage';
import InvoicesPage from './pages/InvoicesPage';
export const routes: ModuleRoute[] = [
  { path: 'invoices', element: <InvoicesPage />, roles: ['ADMIN', 'STAFF'] },
  { path: 'invoices/:id', element: <InvoiceDetailPage />, roles: ['ADMIN', 'STAFF'] },
  { path: 'invoices/:id/print', element: <InvoicePrintPage />, roles: ['ADMIN', 'STAFF'] },
];
