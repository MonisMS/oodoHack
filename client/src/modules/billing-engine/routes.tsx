import type { ModuleRoute } from '../../lib/routes';
import IndexPage from './pages/IndexPage';
export const routes: ModuleRoute[] = [
  { path: 'billing', element: <IndexPage title="Run billing" />, roles: ["ADMIN", "STAFF"] }
];
