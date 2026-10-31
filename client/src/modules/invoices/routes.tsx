import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'invoices', element: <IndexPage title="Invoices" />, roles: ["ADMIN", "STAFF"] },
  { path: 'invoices/:id', element: <IndexPage title="Invoice details" />, roles: ["ADMIN", "STAFF"] },
  { path: 'invoices/:id/print', element: <IndexPage title="Print invoice" />, roles: ["ADMIN", "STAFF"] }
];
