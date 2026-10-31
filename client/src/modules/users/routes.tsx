import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'users/customers', element: <IndexPage title="Customers" />, roles: ["ADMIN", "STAFF"] },
  { path: 'users/staff', element: <IndexPage title="Staff" />, roles: ["ADMIN"] }
];
