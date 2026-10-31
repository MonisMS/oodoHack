import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'portal', element: <IndexPage title="My account" />, roles: ["CUSTOMER"] },
  { path: 'portal/subscriptions', element: <IndexPage title="My subscriptions" />, roles: ["CUSTOMER"] },
  { path: 'portal/subscriptions/:id', element: <IndexPage title="My subscription" />, roles: ["CUSTOMER"] },
  { path: 'portal/invoices', element: <IndexPage title="My invoices" />, roles: ["CUSTOMER"] },
  { path: 'portal/invoices/:id', element: <IndexPage title="My invoice" />, roles: ["CUSTOMER"] },
  { path: 'portal/invoices/:id/print', element: <IndexPage title="Print my invoice" />, roles: ["CUSTOMER"] }
];
