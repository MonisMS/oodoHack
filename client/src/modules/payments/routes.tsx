import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'payments', element: <IndexPage title="Payments" />, roles: ["ADMIN", "STAFF"] }
];
