import type { ModuleRoute } from '../../lib/routes';
import HomePage from './pages/HomePage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import SubscriptionDetailPage from './pages/SubscriptionDetailPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import InvoicePrintPage from './pages/InvoicePrintPage';
export const routes: ModuleRoute[] = [
  { path: 'portal', element: <HomePage />, roles: ["CUSTOMER"] },
  { path: 'portal/subscriptions', element: <SubscriptionsPage />, roles: ["CUSTOMER"] },
  { path: 'portal/subscriptions/:id', element: <SubscriptionDetailPage />, roles: ["CUSTOMER"] },
  { path: 'portal/invoices', element: <InvoicesPage />, roles: ["CUSTOMER"] },
  { path: 'portal/invoices/:id', element: <InvoiceDetailPage />, roles: ["CUSTOMER"] },
  { path: 'portal/invoices/:id/print', element: <InvoicePrintPage />, roles: ["CUSTOMER"] }
];
