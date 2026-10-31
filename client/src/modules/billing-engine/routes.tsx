import type { ModuleRoute } from '../../lib/routes';
import BillingPage from './pages/BillingPage';
export const routes: ModuleRoute[] = [
  { path: 'billing', element: <BillingPage />, roles: ['ADMIN', 'STAFF'] },
];
